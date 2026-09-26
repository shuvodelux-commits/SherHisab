import { getPool } from '../../db/pool'
import type { DatabaseClient } from '../../db/request-database'
import { withDatabaseTransaction } from '../../db/transaction'
import { PosService } from '../pos/pos.service'
import { ConversionService } from '../products/conversion.service'
import type { QuantityInput } from '../products/conversion.types'
import { SalesTemplateRepository } from './sales-template.repository'
import type {
  SalesTemplateInput,
  SalesTemplateLineInput,
  SalesTemplateLoaded,
  SalesTemplateRecord,
  SalesTemplateStoredLine,
  SalesTemplateSummary,
} from './sales-template.types'

export class SalesTemplateNotFoundError extends Error {}
export class SalesTemplateConflictError extends Error {
  constructor(public readonly currentVersion: number) {
    super('Template was changed by another user.')
  }
}
export class SalesTemplatePermissionError extends Error {}
export class SalesTemplateValidationError extends Error {}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function validName(raw: string): string {
  const name = raw.trim()
  if (name.length < 1 || name.length > 120) {
    throw new SalesTemplateValidationError('Template name must be 1 to 120 characters.')
  }
  return name
}

function validTemplateId(raw: string): string {
  if (!uuidPattern.test(raw)) {
    throw new SalesTemplateValidationError('Template ID is invalid.')
  }
  return raw
}

function validPaisa(raw: string): string {
  if (!/^\d+$/.test(raw)) {
    throw new SalesTemplateValidationError('Manual selling price must be a non-negative whole paisa amount.')
  }
  return BigInt(raw).toString()
}

function requireActive(record: SalesTemplateRecord | null): SalesTemplateRecord {
  if (!record || record.status !== 'ACTIVE') {
    throw new SalesTemplateNotFoundError('Template not found.')
  }
  return record
}

export class SalesTemplateService {
  constructor(
    private readonly tenantId: string,
    private readonly database: DatabaseClient = getPool(),
  ) {
    if (!tenantId.trim()) throw new Error('Trusted tenant id is required')
  }

  async list(): Promise<SalesTemplateSummary[]> {
    return new SalesTemplateRepository(this.database).listActive(this.tenantId)
  }

  async getSaved(id: string): Promise<SalesTemplateRecord> {
    return requireActive(await new SalesTemplateRepository(this.database)
      .findById(this.tenantId, validTemplateId(id)))
  }

  async get(id: string, canOverrideSellingPrice: boolean): Promise<SalesTemplateLoaded> {
    const record = requireActive(await new SalesTemplateRepository(this.database)
      .findById(this.tenantId, validTemplateId(id)))
    const pos = new PosService(this.tenantId, this.database)
    const conversion = new ConversionService(this.tenantId, this.database)
    const lines = []
    for (const saved of record.lines) {
      if (saved.pricingStrategy === 'FIXED_MANUAL' && !canOverrideSellingPrice) {
        throw new SalesTemplatePermissionError('Manual template price requires selling price override permission.')
      }
      const product = (await pos.searchProductsForClient(saved.variantId, {
        limit: 1, permissions: [],
      })).find((item) => item.variantId === saved.variantId)
      if (!product) {
        throw new SalesTemplateValidationError('A Template Product Variant is no longer available.')
      }
      const quantityInput = await this.currentQuantityInput(
        conversion, product.productId, saved.quantityInput,
      )
      const quote = await pos.quoteLine({
        variantId: saved.variantId, quantity: quantityInput,
      }, [])
      lines.push({ ...saved, quantityInput,
        normalizedQuantitySnapshot: quote.conversion, product, quote })
    }
    return { id: record.id, name: record.name, version: record.version, lines }
  }

  async create(
    actorUserId: string,
    input: SalesTemplateInput,
    canOverrideSellingPrice: boolean,
  ): Promise<SalesTemplateRecord> {
    if (!uuidPattern.test(actorUserId)) {
      throw new SalesTemplateValidationError('Actor user is required.')
    }
    const name = validName(input.name)
    return withDatabaseTransaction(this.database, async (database) => {
      const lines = await this.prepareLines(database, input.lines, canOverrideSellingPrice)
      return new SalesTemplateRepository(database).create(
        this.tenantId, actorUserId, name, lines,
      )
    })
  }

  async update(
    id: string,
    expectedVersion: number,
    input: { name?: string; lines?: SalesTemplateLineInput[] },
    canOverrideSellingPrice: boolean,
  ): Promise<SalesTemplateRecord> {
    return withDatabaseTransaction(this.database, async (database) => {
      const repository = new SalesTemplateRepository(database)
      const current = requireActive(await repository.findById(this.tenantId, validTemplateId(id), true))
      if (current.version !== expectedVersion) {
        throw new SalesTemplateConflictError(current.version)
      }
      const name = input.name === undefined ? current.name : validName(input.name)
      const lines = input.lines === undefined
        ? undefined
        : await this.prepareLines(database, input.lines, canOverrideSellingPrice)
      return repository.update(this.tenantId, id, name, lines)
    })
  }

  async duplicate(
    actorUserId: string,
    id: string,
    name: string | undefined,
    canOverrideSellingPrice: boolean,
  ): Promise<SalesTemplateRecord> {
    return withDatabaseTransaction(this.database, async (database) => {
      const repository = new SalesTemplateRepository(database)
      const current = requireActive(await repository.findById(this.tenantId, validTemplateId(id)))
      if (current.lines.some((line) => line.pricingStrategy === 'FIXED_MANUAL') &&
          !canOverrideSellingPrice) {
        throw new SalesTemplatePermissionError('Manual template price requires selling price override permission.')
      }
      return repository.create(
        this.tenantId, actorUserId,
        validName(name ?? `${current.name} copy`), current.lines,
      )
    })
  }

  async archive(id: string, expectedVersion: number): Promise<SalesTemplateRecord> {
    return withDatabaseTransaction(this.database, async (database) => {
      const repository = new SalesTemplateRepository(database)
      const current = requireActive(await repository.findById(this.tenantId, id, true))
      if (current.version !== expectedVersion) {
        throw new SalesTemplateConflictError(current.version)
      }
      return repository.archive(this.tenantId, id)
    })
  }

  private async prepareLines(
    database: DatabaseClient,
    input: SalesTemplateLineInput[],
    canOverrideSellingPrice: boolean,
  ): Promise<SalesTemplateStoredLine[]> {
    if (!Array.isArray(input) || input.length > 100) {
      throw new SalesTemplateValidationError('Template lines must be an array of at most 100 lines.')
    }
    const pos = new PosService(this.tenantId, database)
    const conversion = new ConversionService(this.tenantId, database)
    const seen = new Set<string>()
    const lines: SalesTemplateStoredLine[] = []
    for (const line of input) {
      if (!uuidPattern.test(line.variantId) || seen.has(line.variantId)) {
        throw new SalesTemplateValidationError('Template lines require distinct valid Variant IDs.')
      }
      seen.add(line.variantId)
      const product = (await pos.searchProductsForClient(line.variantId, {
        limit: 1, permissions: [],
      })).find((item) => item.variantId === line.variantId)
      if (!product) {
        throw new SalesTemplateValidationError('A Template Product Variant is no longer available.')
      }
      const quantityInput = await this.currentQuantityInput(
        conversion, product.productId, line.quantityInput,
      )
      const quote = await pos.quoteLine({ variantId: line.variantId, quantity: quantityInput }, [])
      const pricingStrategy = line.pricingStrategy ?? 'CURRENT_AUTO'
      if (pricingStrategy !== 'CURRENT_AUTO' && pricingStrategy !== 'FIXED_MANUAL') {
        throw new SalesTemplateValidationError('Unsupported Template price strategy.')
      }
      let manualUnitSellingPricePaisa: string | null = null
      if (pricingStrategy === 'FIXED_MANUAL') {
        if (!canOverrideSellingPrice) {
          throw new SalesTemplatePermissionError('Manual template price requires selling price override permission.')
        }
        if (typeof line.manualUnitSellingPricePaisa !== 'string') {
          throw new SalesTemplateValidationError('Fixed manual price is required.')
        }
        manualUnitSellingPricePaisa = validPaisa(line.manualUnitSellingPricePaisa)
      } else if (line.manualUnitSellingPricePaisa !== undefined &&
                 line.manualUnitSellingPricePaisa !== null) {
        throw new SalesTemplateValidationError('Automatic price cannot include a manual price.')
      }
      lines.push({
        variantId: line.variantId,
        quantityInput,
        normalizedQuantitySnapshot: quote.conversion,
        pricingStrategy,
        manualUnitSellingPricePaisa,
      })
    }
    return lines
  }

  private async currentQuantityInput(
    conversion: ConversionService,
    productId: string,
    quantityInput: QuantityInput,
  ): Promise<QuantityInput> {
    if (quantityInput.kind !== 'COMPONENTS') return quantityInput
    const profile = await conversion.getActiveProfile(productId)
    if (!profile) {
      throw new SalesTemplateValidationError('Product conversion profile is no longer active.')
    }
    return {
      kind: 'COMPONENTS',
      profileId: profile.id,
      profileVersion: profile.version,
      components: quantityInput.components,
    }
  }
}
