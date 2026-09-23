import { Hono, type Context } from 'hono'
import { withRequestDatabase } from '../../db/request-database'
import type { AppEnv } from '../../types/context'
import {
  ProductConflictError,
  ProductNotFoundError,
  ProductValidationError,
} from './product.errors'
import { InventoryService } from './inventory.service'
import { ProductMasterService } from './product-master.service'
import type {
  AdvancedProductConfigurationInput,
  AlternativeUnitInput,
  CreateProductInput,
  ReplaceVariantConfigurationInput,
  SpecificationInput,
  TrackingMode,
  UpdateProductInput,
} from './product.types'

type ProductContext = Context<AppEnv>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

async function readJsonObject(
  c: ProductContext,
): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await c.req.json()

    if (!isRecord(body)) {
      throw new ProductValidationError('Invalid request body.')
    }

    return body
  } catch (error) {
    if (error instanceof ProductValidationError) {
      throw error
    }

    throw new ProductValidationError('Invalid request body.')
  }
}

function stringValue(
  body: Record<string, unknown>,
  key: string,
  fallback = '',
): string {
  const value = body[key]
  return typeof value === 'string' ? value : fallback
}

function nullableStringValue(
  body: Record<string, unknown>,
  key: string,
  fallback: string | null = null,
): string | null {
  const value = body[key]

  if (value === null) {
    return null
  }

  return typeof value === 'string' ? value : fallback
}

function booleanValue(
  body: Record<string, unknown>,
  key: string,
): boolean {
  const value = body[key]

  if (typeof value !== 'boolean') {
    throw new ProductValidationError(`${key} must be a boolean.`)
  }

  return value
}

function optionalAdvanced(
  value: unknown,
): AdvancedProductConfigurationInput | undefined {
  if (value === undefined) {
    return undefined
  }

  if (!isRecord(value)) {
    throw new ProductValidationError('Advanced Product configuration is invalid.')
  }

  return value as unknown as AdvancedProductConfigurationInput
}

function mapProductError(c: ProductContext, error: unknown): Response {
  if (error instanceof ProductValidationError) {
    return c.json({ error: error.message }, 400)
  }

  if (error instanceof ProductNotFoundError) {
    return c.json({ error: error.message }, 404)
  }

  if (error instanceof ProductConflictError) {
    return c.json({ error: error.message }, 409)
  }

  throw error
}

async function withProductServices(
  c: ProductContext,
  work: (services: {
    productService: ProductMasterService
    inventoryService: InventoryService
    userId: string
  }) => Promise<Response>,
): Promise<Response> {
  try {
    return await withRequestDatabase(c.env, async (database) => {
      const tenantId = c.get('tenantId')
      const userId = c.get('userId')

      return work({
        productService: new ProductMasterService(tenantId, database),
        inventoryService: new InventoryService(database),
        userId,
      })
    })
  } catch (error) {
    return mapProductError(c, error)
  }
}

function createProductInput(
  body: Record<string, unknown>,
): CreateProductInput {
  return {
    name: stringValue(body, 'name'),
    brand: stringValue(body, 'brand'),
    categoryId: nullableStringValue(body, 'categoryId'),
    baseUnitId: stringValue(body, 'baseUnitId'),
    barcode: stringValue(body, 'barcode'),
    defaultPurchasePricePaisa: stringValue(
      body,
      'defaultPurchasePricePaisa',
    ),
    defaultSellingPricePaisa: stringValue(
      body,
      'defaultSellingPricePaisa',
    ),
    openingStockBaseQty: stringValue(body, 'openingStockBaseQty'),
    minimumStockBaseQty: stringValue(body, 'minimumStockBaseQty'),
    trackingMode: stringValue(
      body,
      'trackingMode',
      'SIMPLE',
    ) as TrackingMode,
    advanced: optionalAdvanced(body.advanced),
  }
}

async function updateProductInput(
  service: ProductMasterService,
  productId: string,
  body: Record<string, unknown>,
): Promise<UpdateProductInput> {
  const current = await service.getProduct(productId)

  return {
    name: stringValue(body, 'name', current.name),
    brand: stringValue(body, 'brand', current.brand),
    categoryId:
      body.categoryId === undefined
        ? current.category?.id ?? null
        : nullableStringValue(body, 'categoryId'),
    baseUnitId: stringValue(body, 'baseUnitId', current.baseUnit.id),
    barcode: stringValue(
      body,
      'barcode',
      current.primaryBarcode ?? '',
    ),
    defaultPurchasePricePaisa: stringValue(
      body,
      'defaultPurchasePricePaisa',
      current.defaultPurchasePricePaisa,
    ),
    defaultSellingPricePaisa: stringValue(
      body,
      'defaultSellingPricePaisa',
      current.defaultSellingPricePaisa,
    ),
    minimumStockBaseQty: stringValue(
      body,
      'minimumStockBaseQty',
      current.minimumStockBaseQty,
    ),
    trackingMode: stringValue(
      body,
      'trackingMode',
      current.trackingMode,
    ) as TrackingMode,
    advanced: optionalAdvanced(body.advanced),
  }
}

async function resolveVariantForProduct(
  service: ProductMasterService,
  productId: string,
  requestedVariantId?: string | null,
): Promise<string> {
  const product = await service.getProduct(productId)

  if (!requestedVariantId) {
    if (product.variantsEnabled) {
      throw new ProductValidationError(
        'Variant is required when Product Variants are enabled.',
      )
    }

    return product.defaultVariantId
  }

  if (requestedVariantId === product.defaultVariantId) {
    if (product.variantsEnabled) {
      throw new ProductValidationError('Select an enabled Product Variant.')
    }

    return requestedVariantId
  }

  const advanced = await service.getAdvancedConfiguration(productId)

  if (!advanced.variants.some((variant) => variant.id === requestedVariantId)) {
    throw new ProductValidationError(
      'Variant does not belong to this Product and tenant.',
    )
  }

  return requestedVariantId
}

export const productRoutes = new Hono<AppEnv>()
  .get('/products', (c) =>
    withProductServices(c, async ({ productService }) => {
      const limitRaw = c.req.query('limit')
      const offsetRaw = c.req.query('offset')
      const result = await productService.listProducts({
        search: c.req.query('search'),
        categoryId: c.req.query('categoryId'),
        brand: c.req.query('brand'),
        status: c.req.query('status') as
          | 'active'
          | 'inactive'
          | 'all'
          | undefined,
        limit: limitRaw === undefined ? undefined : Number(limitRaw),
        offset: offsetRaw === undefined ? undefined : Number(offsetRaw),
      })

      return c.json(result)
    }),
  )
  .post('/products', async (c) => {
    let body: Record<string, unknown>

    try {
      body = await readJsonObject(c)
    } catch (error) {
      return mapProductError(c, error)
    }

    return withProductServices(c, async ({ productService, userId }) => {
      const product = await productService.createProduct(
        createProductInput(body),
        userId,
      )

      return c.json(product, 201)
    })
  })
  .get('/products/:productId', (c) =>
    withProductServices(c, async ({ productService }) => {
      const productId = c.req.param('productId')
      const product = await productService.getProduct(productId)
      const advanced =
        await productService.getAdvancedConfiguration(productId)

      return c.json({ ...product, advanced })
    }),
  )
  .patch('/products/:productId', async (c) => {
    let body: Record<string, unknown>

    try {
      body = await readJsonObject(c)
    } catch (error) {
      return mapProductError(c, error)
    }

    return withProductServices(c, async ({ productService }) => {
      const productId = c.req.param('productId')
      const input = await updateProductInput(
        productService,
        productId,
        body,
      )
      const product = await productService.updateProduct(productId, input)

      return c.json(product)
    })
  })
  .post('/products/:productId/status', async (c) => {
    let body: Record<string, unknown>

    try {
      body = await readJsonObject(c)
    } catch (error) {
      return mapProductError(c, error)
    }

    return withProductServices(c, async ({ productService }) => {
      const product = await productService.setProductActive(
        c.req.param('productId'),
        booleanValue(body, 'isActive'),
      )

      return c.json(product)
    })
  })
  .post('/products/:productId/stock-adjustments', async (c) => {
    let body: Record<string, unknown>

    try {
      body = await readJsonObject(c)
    } catch (error) {
      return mapProductError(c, error)
    }

    return withProductServices(
      c,
      async ({ productService, inventoryService, userId }) => {
        const productId = c.req.param('productId')
        const requestedVariantId = nullableStringValue(
          body,
          'variantId',
        )
        const variantId = await resolveVariantForProduct(
          productService,
          productId,
          requestedVariantId,
        )

        await inventoryService.adjustStock(
          c.get('tenantId'),
          userId,
          variantId,
          {
            deltaBaseQty: stringValue(body, 'deltaBaseQty'),
            note: stringValue(body, 'note'),
            unitCostPaisa:
              body.unitCostPaisa === undefined
                ? undefined
                : stringValue(body, 'unitCostPaisa'),
            businessDate:
              body.businessDate === undefined
                ? undefined
                : stringValue(body, 'businessDate'),
          },
        )

        return c.json(await productService.getProduct(productId))
      },
    )
  })
  .get('/products/:productId/lots', (c) =>
    withProductServices(
      c,
      async ({ productService, inventoryService }) => {
        const productId = c.req.param('productId')
        const variantId = await resolveVariantForProduct(
          productService,
          productId,
          c.req.query('variantId'),
        )

        return c.json(
          await inventoryService.listLots(c.get('tenantId'), variantId),
        )
      },
    ),
  )
  .put('/products/:productId/units', async (c) => {
    let body: Record<string, unknown>

    try {
      body = await readJsonObject(c)
    } catch (error) {
      return mapProductError(c, error)
    }

    return withProductServices(c, async ({ productService }) => {
      if (!Array.isArray(body.units)) {
        throw new ProductValidationError('units must be an array.')
      }

      const advanced = await productService.replaceAlternativeUnits(
        c.req.param('productId'),
        body.units as AlternativeUnitInput[],
      )

      return c.json(advanced)
    })
  })
  .put('/products/:productId/specifications', async (c) => {
    let body: Record<string, unknown>

    try {
      body = await readJsonObject(c)
    } catch (error) {
      return mapProductError(c, error)
    }

    return withProductServices(c, async ({ productService }) => {
      if (!Array.isArray(body.specifications)) {
        throw new ProductValidationError(
          'specifications must be an array.',
        )
      }

      const advanced = await productService.replaceSpecifications(
        c.req.param('productId'),
        body.specifications as SpecificationInput[],
      )

      return c.json(advanced)
    })
  })
  .put('/products/:productId/variants', async (c) => {
    let body: Record<string, unknown>

    try {
      body = await readJsonObject(c)
    } catch (error) {
      return mapProductError(c, error)
    }

    return withProductServices(c, async ({ productService }) => {
      const advanced = await productService.replaceVariantConfiguration(
        c.req.param('productId'),
        body as unknown as ReplaceVariantConfigurationInput,
      )

      return c.json(advanced)
    })
  })
  .get('/product-categories', (c) =>
    withProductServices(c, async ({ productService }) => {
      return c.json(
        await productService.listCategories(
          c.req.query('includeInactive') === 'true',
        ),
      )
    }),
  )
  .post('/product-categories', async (c) => {
    let body: Record<string, unknown>

    try {
      body = await readJsonObject(c)
    } catch (error) {
      return mapProductError(c, error)
    }

    return withProductServices(c, async ({ productService }) => {
      const category = await productService.createCategory(
        stringValue(body, 'name'),
      )
      return c.json(category, 201)
    })
  })
  .patch('/product-categories/:categoryId', async (c) => {
    let body: Record<string, unknown>

    try {
      body = await readJsonObject(c)
    } catch (error) {
      return mapProductError(c, error)
    }

    return withProductServices(c, async ({ productService }) => {
      return c.json(
        await productService.setCategoryActive(
          c.req.param('categoryId'),
          booleanValue(body, 'isActive'),
        ),
      )
    })
  })
  .get('/units', (c) =>
    withProductServices(c, async ({ productService }) => {
      return c.json(
        await productService.listUnits(
          c.req.query('includeInactive') === 'true',
        ),
      )
    }),
  )
  .post('/units', async (c) => {
    let body: Record<string, unknown>

    try {
      body = await readJsonObject(c)
    } catch (error) {
      return mapProductError(c, error)
    }

    return withProductServices(c, async ({ productService }) => {
      const unit = await productService.createUnit({
        name: stringValue(body, 'name'),
        symbol:
          body.symbol === undefined
            ? null
            : nullableStringValue(body, 'symbol'),
      })
      return c.json(unit, 201)
    })
  })
  .patch('/units/:unitId', async (c) => {
    let body: Record<string, unknown>

    try {
      body = await readJsonObject(c)
    } catch (error) {
      return mapProductError(c, error)
    }

    return withProductServices(c, async ({ productService }) => {
      return c.json(
        await productService.setUnitActive(
          c.req.param('unitId'),
          booleanValue(body, 'isActive'),
        ),
      )
    })
  })
