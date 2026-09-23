import { Plus, Trash2 } from 'lucide-react'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { formatPaisaToTaka, parseTakaToPaisa } from '../../lib/money'
import type {
  AdvancedProductConfigurationInput,
  ConversionMode,
  ProductAdvancedConfigurationDto,
  ProductUnitDto,
  TrackingMode,
  VariantInput,
  VariantOptionInput,
} from './product-types'

export interface AlternativeUnitFormRow {
  key: string
  unitId: string
  conversionMode: ConversionMode
  conversionToBase: string
}

export interface SpecificationFormRow {
  key: string
  name: string
  value: string
}

export interface VariantOptionFormRow {
  key: string
  name: string
  valuesText: string
}

export interface VariantFormRow {
  key: string
  id?: string
  displayName: string
  sku: string
  purchasePrice: string
  sellingPrice: string
  minimumStock: string
  selections: Record<string, string>
  hasInventoryHistory: boolean
}

export interface ProductAdvancedFormState {
  trackingMode: TrackingMode
  alternativeUnits: AlternativeUnitFormRow[]
  specifications: SpecificationFormRow[]
  variantsEnabled: boolean
  variantOptions: VariantOptionFormRow[]
  variants: VariantFormRow[]
}

function rowKey(prefix: string, index: number) {
  return `${prefix}-${index}-${Math.random().toString(36).slice(2, 8)}`
}

function commaValues(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

export function emptyAdvancedFormState(
  trackingMode: TrackingMode = 'SIMPLE',
): ProductAdvancedFormState {
  return {
    trackingMode,
    alternativeUnits: [],
    specifications: [],
    variantsEnabled: false,
    variantOptions: [],
    variants: [],
  }
}

export function advancedFormStateFromProduct(
  trackingMode: TrackingMode,
  variantsEnabled: boolean,
  advanced?: ProductAdvancedConfigurationDto,
): ProductAdvancedFormState {
  if (!advanced) {
    return {
      ...emptyAdvancedFormState(trackingMode),
      variantsEnabled,
    }
  }

  const optionValues = new Map<string, Set<string>>()
  for (const variant of advanced.variants) {
    for (const [name, value] of Object.entries(variant.selections)) {
      const values = optionValues.get(name) ?? new Set<string>()
      values.add(value)
      optionValues.set(name, values)
    }
  }

  return {
    trackingMode,
    alternativeUnits: advanced.alternativeUnits.map((item, index) => ({
      key: item.id ?? rowKey('alternative', index),
      unitId: item.unit.id,
      conversionMode: item.conversionMode,
      conversionToBase: item.conversionToBase ?? '',
    })),
    specifications: advanced.specifications.map((item, index) => ({
      key: item.id ?? rowKey('spec', index),
      name: item.name,
      value: item.value,
    })),
    variantsEnabled,
    variantOptions: Array.from(optionValues.entries()).map(
      ([name, values], index) => ({
        key: rowKey('option', index),
        name,
        valuesText: Array.from(values).join(', '),
      }),
    ),
    variants: advanced.variants.map((variant, index) => ({
      key: variant.id ?? rowKey('variant', index),
      id: variant.id,
      displayName: variant.displayName,
      sku: variant.sku ?? '',
      purchasePrice: formatPaisaToTaka(
        variant.defaultPurchasePricePaisa,
      ),
      sellingPrice: formatPaisaToTaka(
        variant.defaultSellingPricePaisa,
      ),
      minimumStock: variant.minimumStockBaseQty,
      selections: { ...variant.selections },
      hasInventoryHistory: Boolean(variant.hasInventoryHistory),
    })),
  }
}

export function buildAdvancedPayload(
  state: ProductAdvancedFormState,
): AdvancedProductConfigurationInput {
  const options: VariantOptionInput[] = state.variantOptions
    .filter((option) => option.name.trim() || option.valuesText.trim())
    .map((option) => ({
      name: option.name.trim(),
      values: commaValues(option.valuesText),
    }))

  const variants: VariantInput[] = state.variants.map((variant) => ({
    ...(variant.id ? { id: variant.id } : {}),
    displayName: variant.displayName.trim(),
    sku: variant.sku.trim() || null,
    defaultPurchasePricePaisa: parseTakaToPaisa(
      variant.purchasePrice || '0',
    ),
    defaultSellingPricePaisa: parseTakaToPaisa(
      variant.sellingPrice || '0',
    ),
    minimumStockBaseQty: variant.minimumStock || '0',
    selections: { ...variant.selections },
  }))

  return {
    alternativeUnits: state.alternativeUnits
      .filter((item) => item.unitId)
      .map((item) => ({
        unitId: item.unitId,
        conversionMode: item.conversionMode,
        conversionToBase:
          item.conversionMode === 'FIXED'
            ? item.conversionToBase
            : null,
      })),
    specifications: state.specifications
      .filter((item) => item.name.trim() || item.value.trim())
      .map((item) => ({
        name: item.name.trim(),
        value: item.value.trim(),
      })),
    variantConfiguration: {
      enabled: state.variantsEnabled,
      options: state.variantsEnabled ? options : [],
      variants: state.variantsEnabled ? variants : [],
    },
  }
}

interface ProductAdvancedFieldsProps {
  state: ProductAdvancedFormState
  onChange: (state: ProductAdvancedFormState) => void
  units: ProductUnitDto[]
  baseUnitId: string
}

export function ProductAdvancedFields({
  state,
  onChange,
  units,
  baseUnitId,
}: ProductAdvancedFieldsProps) {
  function patch(next: Partial<ProductAdvancedFormState>) {
    onChange({ ...state, ...next })
  }

  const parsedOptions = state.variantOptions.map((option) => ({
    name: option.name.trim(),
    values: commaValues(option.valuesText),
  }))

  return (
    <div className="product-advanced-fields">
      <div className="product-advanced-section">
        <label className="product-field">
          <span>Tracking</span>
          <select
            aria-label="Tracking"
            className="product-select"
            onChange={(event) =>
              patch({
                trackingMode: event.target.value as TrackingMode,
              })
            }
            value={state.trackingMode}
          >
            <option value="SIMPLE">Simple</option>
            <option value="LOT">Lot</option>
            <option value="BATCH">Batch</option>
          </select>
        </label>
        <p className="product-field-help">
          Tracking selects inventory policy only. Lot and batch entry happens
          in inventory transactions.
        </p>
      </div>

      <section className="product-advanced-section">
        <div className="product-advanced-heading">
          <div>
            <strong>Alternative Units</strong>
            <p>Use fixed conversion or record the actual quantity later.</p>
          </div>
          <Button
            onClick={() =>
              patch({
                alternativeUnits: [
                  ...state.alternativeUnits,
                  {
                    key: rowKey(
                      'alternative',
                      state.alternativeUnits.length,
                    ),
                    unitId: '',
                    conversionMode: 'FIXED',
                    conversionToBase: '',
                  },
                ],
              })
            }
            size="small"
            variant="secondary"
          >
            <Plus aria-hidden="true" size={14} /> Add Unit
          </Button>
        </div>

        {state.alternativeUnits.map((row, index) => (
          <div className="product-inline-grid" key={row.key}>
            <select
              aria-label={`Alternative unit ${index + 1}`}
              className="product-select"
              onChange={(event) => {
                const rows = [...state.alternativeUnits]
                rows[index] = { ...row, unitId: event.target.value }
                patch({ alternativeUnits: rows })
              }}
              value={row.unitId}
            >
              <option value="">Select unit</option>
              {units
                .filter(
                  (unit) =>
                    unit.isActive &&
                    unit.id !== baseUnitId,
                )
                .map((unit) => (
                  <option key={unit.id} value={unit.id}>
                    {unit.name}
                    {unit.symbol ? ` (${unit.symbol})` : ''}
                  </option>
                ))}
            </select>

            <select
              aria-label={`Conversion mode ${index + 1}`}
              className="product-select"
              onChange={(event) => {
                const mode = event.target.value as ConversionMode
                const rows = [...state.alternativeUnits]
                rows[index] = {
                  ...row,
                  conversionMode: mode,
                  conversionToBase:
                    mode === 'VARIABLE' ? '' : row.conversionToBase,
                }
                patch({ alternativeUnits: rows })
              }}
              value={row.conversionMode}
            >
              <option value="FIXED">Fixed</option>
              <option value="VARIABLE">Variable</option>
            </select>

            {row.conversionMode === 'FIXED' ? (
              <Input
                aria-label={`Conversion to base ${index + 1}`}
                inputMode="decimal"
                onChange={(event) => {
                  const rows = [...state.alternativeUnits]
                  rows[index] = {
                    ...row,
                    conversionToBase: event.target.value,
                  }
                  patch({ alternativeUnits: rows })
                }}
                placeholder="e.g. 12"
                value={row.conversionToBase}
              />
            ) : (
              <span className="product-variable-unit-note">
                Actual quantity later
              </span>
            )}

            <Button
              aria-label={`Remove alternative unit ${index + 1}`}
              onClick={() =>
                patch({
                  alternativeUnits: state.alternativeUnits.filter(
                    (item) => item.key !== row.key,
                  ),
                })
              }
              size="small"
              variant="ghost"
            >
              <Trash2 aria-hidden="true" size={14} />
            </Button>
          </div>
        ))}
      </section>

      <section className="product-advanced-section">
        <div className="product-advanced-heading">
          <div>
            <strong>Specifications</strong>
            <p>Descriptive attributes that do not create stock variants.</p>
          </div>
          <Button
            onClick={() =>
              patch({
                specifications: [
                  ...state.specifications,
                  {
                    key: rowKey('spec', state.specifications.length),
                    name: '',
                    value: '',
                  },
                ],
              })
            }
            size="small"
            variant="secondary"
          >
            <Plus aria-hidden="true" size={14} /> Add Specification
          </Button>
        </div>

        {state.specifications.map((row, index) => (
          <div className="product-spec-grid" key={row.key}>
            <Input
              aria-label={`Specification name ${index + 1}`}
              onChange={(event) => {
                const rows = [...state.specifications]
                rows[index] = { ...row, name: event.target.value }
                patch({ specifications: rows })
              }}
              placeholder="e.g. Material"
              value={row.name}
            />
            <Input
              aria-label={`Specification value ${index + 1}`}
              onChange={(event) => {
                const rows = [...state.specifications]
                rows[index] = { ...row, value: event.target.value }
                patch({ specifications: rows })
              }}
              placeholder="e.g. Stainless steel"
              value={row.value}
            />
            <Button
              aria-label={`Remove specification ${index + 1}`}
              onClick={() =>
                patch({
                  specifications: state.specifications.filter(
                    (item) => item.key !== row.key,
                  ),
                })
              }
              size="small"
              variant="ghost"
            >
              <Trash2 aria-hidden="true" size={14} />
            </Button>
          </div>
        ))}
      </section>

      <section className="product-advanced-section">
        <label className="product-check-row">
          <input
            aria-label="Enable Variants"
            checked={state.variantsEnabled}
            onChange={(event) =>
              patch({ variantsEnabled: event.target.checked })
            }
            type="checkbox"
          />
          <span>
            <strong>Enable Variants</strong>
            <small>
              Use only when Color, Size, Grade or another option changes stock.
            </small>
          </span>
        </label>

        {state.variantsEnabled ? (
          <div className="product-variant-editor">
            <div className="product-advanced-heading">
              <strong>Options</strong>
              <Button
                onClick={() =>
                  patch({
                    variantOptions: [
                      ...state.variantOptions,
                      {
                        key: rowKey(
                          'option',
                          state.variantOptions.length,
                        ),
                        name: '',
                        valuesText: '',
                      },
                    ],
                  })
                }
                size="small"
                variant="secondary"
              >
                <Plus aria-hidden="true" size={14} /> Add Option
              </Button>
            </div>

            {state.variantOptions.map((row, index) => (
              <div className="product-option-grid" key={row.key}>
                <Input
                  aria-label={`Variant option name ${index + 1}`}
                  onChange={(event) => {
                    const rows = [...state.variantOptions]
                    rows[index] = { ...row, name: event.target.value }
                    patch({ variantOptions: rows })
                  }}
                  placeholder="Color"
                  value={row.name}
                />
                <Input
                  aria-label={`Variant option values ${index + 1}`}
                  onChange={(event) => {
                    const rows = [...state.variantOptions]
                    rows[index] = {
                      ...row,
                      valuesText: event.target.value,
                    }
                    patch({ variantOptions: rows })
                  }}
                  placeholder="Red, Blue, Black"
                  value={row.valuesText}
                />
                <Button
                  aria-label={`Remove variant option ${index + 1}`}
                  onClick={() =>
                    patch({
                      variantOptions: state.variantOptions.filter(
                        (item) => item.key !== row.key,
                      ),
                    })
                  }
                  size="small"
                  variant="ghost"
                >
                  <Trash2 aria-hidden="true" size={14} />
                </Button>
              </div>
            ))}

            <div className="product-advanced-heading product-variant-heading">
              <strong>Variants</strong>
              <Button
                onClick={() =>
                  patch({
                    variants: [
                      ...state.variants,
                      {
                        key: rowKey('variant', state.variants.length),
                        displayName: '',
                        sku: '',
                        purchasePrice: '0.00',
                        sellingPrice: '0.00',
                        minimumStock: '0',
                        selections: {},
                        hasInventoryHistory: false,
                      },
                    ],
                  })
                }
                size="small"
                variant="secondary"
              >
                <Plus aria-hidden="true" size={14} /> Add Variant
              </Button>
            </div>

            {state.variants.map((variant, index) => (
              <div className="product-variant-card" key={variant.key}>
                <div className="product-variant-card-head">
                  <strong>Variant {index + 1}</strong>
                  {variant.hasInventoryHistory ? (
                    <span className="product-history-lock">
                      Stock history locks this Variant combination.
                    </span>
                  ) : (
                    <Button
                      aria-label={`Remove variant ${index + 1}`}
                      onClick={() =>
                        patch({
                          variants: state.variants.filter(
                            (item) => item.key !== variant.key,
                          ),
                        })
                      }
                      size="small"
                      variant="ghost"
                    >
                      <Trash2 aria-hidden="true" size={14} />
                    </Button>
                  )}
                </div>

                <div className="product-variant-grid">
                  <Input
                    aria-label={`Variant name ${index + 1}`}
                    onChange={(event) => {
                      const rows = [...state.variants]
                      rows[index] = {
                        ...variant,
                        displayName: event.target.value,
                      }
                      patch({ variants: rows })
                    }}
                    placeholder="Red / Large"
                    value={variant.displayName}
                  />
                  <Input
                    aria-label={`Variant SKU ${index + 1}`}
                    onChange={(event) => {
                      const rows = [...state.variants]
                      rows[index] = { ...variant, sku: event.target.value }
                      patch({ variants: rows })
                    }}
                    placeholder="SKU"
                    value={variant.sku}
                  />
                  <Input
                    aria-label={`Variant purchase price ${index + 1}`}
                    inputMode="decimal"
                    onChange={(event) => {
                      const rows = [...state.variants]
                      rows[index] = {
                        ...variant,
                        purchasePrice: event.target.value,
                      }
                      patch({ variants: rows })
                    }}
                    placeholder="Purchase price"
                    value={variant.purchasePrice}
                  />
                  <Input
                    aria-label={`Variant selling price ${index + 1}`}
                    inputMode="decimal"
                    onChange={(event) => {
                      const rows = [...state.variants]
                      rows[index] = {
                        ...variant,
                        sellingPrice: event.target.value,
                      }
                      patch({ variants: rows })
                    }}
                    placeholder="Selling price"
                    value={variant.sellingPrice}
                  />
                  <Input
                    aria-label={`Variant minimum stock ${index + 1}`}
                    inputMode="decimal"
                    onChange={(event) => {
                      const rows = [...state.variants]
                      rows[index] = {
                        ...variant,
                        minimumStock: event.target.value,
                      }
                      patch({ variants: rows })
                    }}
                    placeholder="Min stock"
                    value={variant.minimumStock}
                  />
                </div>

                {parsedOptions.length > 0 ? (
                  <div className="product-variant-selections">
                    {parsedOptions.map((option) => (
                      <label
                        className="product-field"
                        key={option.name || 'unnamed'}
                      >
                        <span>{option.name || 'Option'}</span>
                        <select
                          aria-label={`Variant ${index + 1} ${option.name || 'option'}`}
                          className="product-select"
                          disabled={variant.hasInventoryHistory}
                          onChange={(event) => {
                            const rows = [...state.variants]
                            rows[index] = {
                              ...variant,
                              selections: {
                                ...variant.selections,
                                [option.name]: event.target.value,
                              },
                            }
                            patch({ variants: rows })
                          }}
                          value={variant.selections[option.name] ?? ''}
                        >
                          <option value="">Select</option>
                          {option.values.map((value) => (
                            <option key={value} value={value}>
                              {value}
                            </option>
                          ))}
                        </select>
                      </label>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
      </section>
    </div>
  )
}
