import { CircleHelp, Plus, Trash2 } from 'lucide-react'
import { useLanguageMode } from '../../app/language'
import { BilingualLabel } from '../../components/ui/bilingual-label'
import { Button } from '../../components/ui/button'
import { Checkbox } from '../../components/ui/checkbox'
import { Input } from '../../components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../../components/ui/tooltip'
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

const SELECT_NONE = '__select_none__'

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

// These form-state helpers stay colocated with the advanced editor contract.
// eslint-disable-next-line react-refresh/only-export-components
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

// These form-state helpers stay colocated with the advanced editor contract.
// eslint-disable-next-line react-refresh/only-export-components
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

// These form-state helpers stay colocated with the advanced editor contract.
// eslint-disable-next-line react-refresh/only-export-components
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
  const { mode } = useLanguageMode()
  const t = (en: string, bn: string) => (mode === 'bn' ? bn : en)

  function patch(next: Partial<ProductAdvancedFormState>) {
    onChange({ ...state, ...next })
  }

  const parsedOptions = state.variantOptions.map((option) => ({
    name: option.name.trim(),
    values: commaValues(option.valuesText),
  }))

  return (
    <div className="product-advanced-fields">
      <TooltipProvider>
      <div className="product-advanced-section">
        <label className="product-field">
          <BilingualLabel en="Tracking" bn="স্টক ট্র্যাকিং" />
          <Select
            onValueChange={(value) =>
              patch({ trackingMode: value as TrackingMode })
            }
            value={state.trackingMode}
          >
            <SelectTrigger
              aria-label={t('Tracking', 'স্টক ট্র্যাকিং')}
              className="product-select"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="SIMPLE">
                  {t('Simple', 'সাধারণ')}
                </SelectItem>
                <SelectItem value="LOT">{t('Lot', 'লট')}</SelectItem>
                <SelectItem value="BATCH">{t('Batch', 'ব্যাচ')}</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </label>
        <p className="product-field-help">
          <BilingualLabel
                layout="stacked"
            en="Choose how inventory is tracked. Lot or batch details are entered during stock transactions."
            bn="স্টক কীভাবে ট্র্যাক হবে তা নির্বাচন করুন। লট বা ব্যাচের তথ্য স্টক লেনদেনের সময় যোগ করা হবে।"
          />
        </p>
      </div>

      <section className="product-advanced-section">
        <div className="product-advanced-heading">
          <div>
            <strong>
              <BilingualLabel en="Alternative Units" bn="বিকল্প একক" />
            </strong>
            <p>
              <BilingualLabel
                layout="stacked"
                en="Use a fixed conversion or record the actual quantity later."
                bn="নির্দিষ্ট রূপান্তর ব্যবহার করুন অথবা পরে প্রকৃত পরিমাণ লিখুন।"
              />
            </p>
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
            size="sm"
            variant="secondary"
          >
            <Plus aria-hidden="true" data-icon="inline-start" />
            {t('Add Unit', 'একক যোগ করুন')}
          </Button>
        </div>

        {state.alternativeUnits.map((row, index) => (
          <div className="product-inline-grid" key={row.key}>
            <label className="product-field">
              <BilingualLabel en="Unit" bn="একক" />
              <Select
                onValueChange={(value) => {
                  const rows = [...state.alternativeUnits]
                  rows[index] = {
                    ...row,
                    unitId: value === SELECT_NONE ? '' : value,
                  }
                  patch({ alternativeUnits: rows })
                }}
                value={row.unitId || SELECT_NONE}
              >
                <SelectTrigger
                  aria-label={t(
                    `Alternative unit ${index + 1}`,
                    `বিকল্প একক ${index + 1}`,
                  )}
                  className="product-select"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value={SELECT_NONE}>
                      {t('Select unit', 'একক নির্বাচন করুন')}
                    </SelectItem>
                    {units
                      .filter(
                        (unit) =>
                          unit.isActive &&
                          unit.id !== baseUnitId,
                      )
                      .map((unit) => (
                        <SelectItem key={unit.id} value={unit.id}>
                          {unit.name}
                          {unit.symbol ? ` (${unit.symbol})` : ''}
                        </SelectItem>
                      ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </label>

            <label className="product-field">
              <BilingualLabel en="Conversion" bn="রূপান্তর" />
              <Select
                onValueChange={(value) => {
                  const conversionMode = value as ConversionMode
                  const rows = [...state.alternativeUnits]
                  rows[index] = {
                    ...row,
                    conversionMode,
                    conversionToBase:
                      conversionMode === 'VARIABLE'
                        ? ''
                        : row.conversionToBase,
                  }
                  patch({ alternativeUnits: rows })
                }}
                value={row.conversionMode}
              >
                <SelectTrigger
                  aria-label={t(
                    `Conversion mode ${index + 1}`,
                    `রূপান্তরের ধরন ${index + 1}`,
                  )}
                  className="product-select"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="FIXED">
                      {t('Fixed', 'নির্দিষ্ট')}
                    </SelectItem>
                    <SelectItem value="VARIABLE">
                      {t('Variable', 'পরিবর্তনশীল')}
                    </SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </label>

            <label className="product-field">
              <BilingualLabel
                en="Base Quantity"
                bn="মূল এককে পরিমাণ"
              />
              {row.conversionMode === 'FIXED' ? (
                <Input
                  aria-label={t(
                    `Conversion to base ${index + 1}`,
                    `মূল এককে রূপান্তর ${index + 1}`,
                  )}
                  inputMode="decimal"
                  onChange={(event) => {
                    const rows = [...state.alternativeUnits]
                    rows[index] = {
                      ...row,
                      conversionToBase: event.target.value,
                    }
                    patch({ alternativeUnits: rows })
                  }}
                  placeholder={t('e.g. 12', 'যেমন ১২')}
                  value={row.conversionToBase}
                />
              ) : (
                <span className="product-variable-unit-note">
                  {t(
                    'Actual quantity later',
                    'প্রকৃত পরিমাণ পরে লিখুন',
                  )}
                </span>
              )}
            </label>

            <Button
              aria-label={t(
                `Remove alternative unit ${index + 1}`,
                `বিকল্প একক ${index + 1} সরান`,
              )}
              onClick={() =>
                patch({
                  alternativeUnits: state.alternativeUnits.filter(
                    (item) => item.key !== row.key,
                  ),
                })
              }
              size="sm"
              variant="ghost"
            >
              <Trash2 aria-hidden="true" data-icon="inline-start" />
            </Button>
          </div>
        ))}
      </section>

      <section className="product-advanced-section">
        <div className="product-advanced-heading">
          <div>
            <strong>
              <BilingualLabel en="Specifications" bn="বৈশিষ্ট্য" />
            </strong>
            <p>
              <BilingualLabel
                layout="stacked"
                en="Descriptive attributes that do not create stock variants."
                bn="স্টক ভ্যারিয়েন্ট তৈরি না করে পণ্যের বর্ণনামূলক বৈশিষ্ট্য লিখুন।"
              />
            </p>
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
            size="sm"
            variant="secondary"
          >
            <Plus aria-hidden="true" data-icon="inline-start" />
            {t('Add Specification', 'বৈশিষ্ট্য যোগ করুন')}
          </Button>
        </div>

        {state.specifications.map((row, index) => (
          <div className="product-spec-grid" key={row.key}>
            <label className="product-field">
              <BilingualLabel en="Specification Name" bn="বৈশিষ্ট্যের নাম" />
              <Input
                aria-label={t(
                  `Specification name ${index + 1}`,
                  `বৈশিষ্ট্যের নাম ${index + 1}`,
                )}
                onChange={(event) => {
                  const rows = [...state.specifications]
                  rows[index] = { ...row, name: event.target.value }
                  patch({ specifications: rows })
                }}
                placeholder={t('e.g. Material', 'যেমন উপাদান')}
                value={row.name}
              />
            </label>

            <label className="product-field">
              <BilingualLabel en="Value" bn="মান" />
              <Input
                aria-label={t(
                  `Specification value ${index + 1}`,
                  `বৈশিষ্ট্যের মান ${index + 1}`,
                )}
                onChange={(event) => {
                  const rows = [...state.specifications]
                  rows[index] = { ...row, value: event.target.value }
                  patch({ specifications: rows })
                }}
                placeholder={t(
                  'e.g. Stainless steel',
                  'যেমন স্টেইনলেস স্টিল',
                )}
                value={row.value}
              />
            </label>

            <Button
              aria-label={t(
                `Remove specification ${index + 1}`,
                `বৈশিষ্ট্য ${index + 1} সরান`,
              )}
              onClick={() =>
                patch({
                  specifications: state.specifications.filter(
                    (item) => item.key !== row.key,
                  ),
                })
              }
              size="sm"
              variant="ghost"
            >
              <Trash2 aria-hidden="true" data-icon="inline-start" />
            </Button>
          </div>
        ))}
      </section>

      <section className="product-advanced-section">
        <label className="product-check-row">
          <Checkbox
            aria-label={t('Enable Variants', 'ভ্যারিয়েন্ট চালু করুন')}
            checked={state.variantsEnabled}
            onCheckedChange={(checked) =>
              patch({ variantsEnabled: checked === true })
            }
          />
          <span>
            <strong>
              <BilingualLabel en="Enable Variants" bn="ভ্যারিয়েন্ট চালু করুন" />
            </strong>
            <small>
              <BilingualLabel
                layout="stacked"
                en="Use only when Color, Size, Grade or another option changes stock."
                bn="রং, সাইজ, গ্রেড বা অন্য অপশন অনুযায়ী আলাদা স্টক রাখতে হলে ব্যবহার করুন।"
              />
            </small>
          </span>
        </label>

        {state.variantsEnabled ? (
          <div className="product-variant-editor">
            <div className="product-advanced-heading">
              <div>
                <strong>
                  <BilingualLabel en="Options" bn="অপশন" />
                </strong>
                <p>
                  <BilingualLabel
                    layout="stacked"
                    en="Define choices such as Color or Size. Enter the values separated by commas."
                    bn="রং বা সাইজের মতো অপশন দিন। মানগুলো কমা দিয়ে আলাদা করে লিখুন।"
                  />
                </p>
              </div>
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
                size="sm"
                variant="secondary"
              >
                <Plus aria-hidden="true" data-icon="inline-start" />
                {t('Add Option', 'অপশন যোগ করুন')}
              </Button>
            </div>

            {state.variantOptions.map((row, index) => (
              <div className="product-option-grid" key={row.key}>
                <label className="product-field">
                  <BilingualLabel en="Option Name" bn="অপশনের নাম" />
                  <Input
                    aria-label={t(
                      `Variant option name ${index + 1}`,
                      `ভ্যারিয়েন্ট অপশনের নাম ${index + 1}`,
                    )}
                    onChange={(event) => {
                      const rows = [...state.variantOptions]
                      rows[index] = { ...row, name: event.target.value }
                      patch({ variantOptions: rows })
                    }}
                    placeholder={t('Color', 'রং')}
                    value={row.name}
                  />
                </label>

                <label className="product-field">
                  <BilingualLabel en="Option Values" bn="অপশনের মান" />
                  <Input
                    aria-label={t(
                      `Variant option values ${index + 1}`,
                      `ভ্যারিয়েন্ট অপশনের মান ${index + 1}`,
                    )}
                    onChange={(event) => {
                      const rows = [...state.variantOptions]
                      rows[index] = {
                        ...row,
                        valuesText: event.target.value,
                      }
                      patch({ variantOptions: rows })
                    }}
                    placeholder={t(
                      'Red, Blue, Black',
                      'লাল, নীল, কালো',
                    )}
                    value={row.valuesText}
                  />
                </label>

                <Button
                  aria-label={t(
                    `Remove variant option ${index + 1}`,
                    `ভ্যারিয়েন্ট অপশন ${index + 1} সরান`,
                  )}
                  onClick={() =>
                    patch({
                      variantOptions: state.variantOptions.filter(
                        (item) => item.key !== row.key,
                      ),
                    })
                  }
                  size="sm"
                  variant="ghost"
                >
                  <Trash2 aria-hidden="true" data-icon="inline-start" />
                </Button>
              </div>
            ))}

            <div className="product-advanced-heading product-variant-heading">
              <div>
                <strong>
                  <BilingualLabel en="Variants" bn="ভ্যারিয়েন্ট" />
                </strong>
                <p>
                  <BilingualLabel
                    layout="stacked"
                    en="Each Variant is a separately priced and stocked version of the Product."
                    bn="প্রতিটি ভ্যারিয়েন্ট পণ্যের আলাদা দাম ও স্টকসহ একটি সংস্করণ।"
                  />
                </p>
              </div>
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
                size="sm"
                variant="secondary"
              >
                <Plus aria-hidden="true" data-icon="inline-start" />
                {t('Add Variant', 'ভ্যারিয়েন্ট যোগ করুন')}
              </Button>
            </div>

            {state.variants.map((variant, index) => (
              <div className="product-variant-card" key={variant.key}>
                <div className="product-variant-card-head">
                  <strong>
                    <BilingualLabel
                      en={`Variant ${index + 1}`}
                      bn={`ভ্যারিয়েন্ট ${index + 1}`}
                    />
                  </strong>
                  {variant.hasInventoryHistory ? (
                    <span className="product-history-lock">
                      {t(
                        'Stock history locks this Variant combination.',
                        'স্টক ইতিহাস থাকার কারণে এই ভ্যারিয়েন্টের সমন্বয় পরিবর্তন করা যাবে না।',
                      )}
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
                      size="sm"
                      variant="ghost"
                    >
                      <Trash2 aria-hidden="true" size={14} />
                    </Button>
                  )}
                </div>

                <div className="product-variant-grid">
                  <label className="product-field">
                    <BilingualLabel
                      en="Variant Name"
                      bn="ভ্যারিয়েন্ট নাম"
                    />
                    <Input
                      aria-label={t(
                        `Variant name ${index + 1}`,
                        `ভ্যারিয়েন্ট নাম ${index + 1}`,
                      )}
                      onChange={(event) => {
                        const rows = [...state.variants]
                        rows[index] = {
                          ...variant,
                          displayName: event.target.value,
                        }
                        patch({ variants: rows })
                      }}
                      placeholder={t('Red / Large', 'লাল / বড়')}
                      value={variant.displayName}
                    />
                  </label>

                  <div className="product-field">
                    <div className="product-variant-label-row">
                      <BilingualLabel en="SKU" bn="এসকেইউ" />
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            aria-label={t('About SKU', 'SKU সম্পর্কে')}
                            size="icon-xs"
                            variant="ghost"
                          >
                            <CircleHelp aria-hidden="true" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          {t(
                            'SKU is the unique stock code for this Variant.',
                            'SKU হলো এই ভ্যারিয়েন্টের ইউনিক স্টক কোড।',
                          )}
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    <Input
                      aria-label={t(
                        `Variant SKU ${index + 1}`,
                        `ভ্যারিয়েন্ট SKU ${index + 1}`,
                      )}
                      onChange={(event) => {
                        const rows = [...state.variants]
                        rows[index] = { ...variant, sku: event.target.value }
                        patch({ variants: rows })
                      }}
                      placeholder={t('SKU', 'SKU')}
                      value={variant.sku}
                    />
                  </div>

                  <label className="product-field">
                    <BilingualLabel
                      en="Purchase Price"
                      bn="কেনা দাম"
                    />
                    <Input
                      aria-label={t(
                        `Variant purchase price ${index + 1}`,
                        `ভ্যারিয়েন্ট কেনা দাম ${index + 1}`,
                      )}
                      inputMode="decimal"
                      onChange={(event) => {
                        const rows = [...state.variants]
                        rows[index] = {
                          ...variant,
                          purchasePrice: event.target.value,
                        }
                        patch({ variants: rows })
                      }}
                      placeholder={t('Purchase price', 'কেনা দাম')}
                      value={variant.purchasePrice}
                    />
                  </label>

                  <label className="product-field">
                    <BilingualLabel
                      en="Selling Price"
                      bn="বিক্রির দাম"
                    />
                    <Input
                      aria-label={t(
                        `Variant selling price ${index + 1}`,
                        `ভ্যারিয়েন্ট বিক্রির দাম ${index + 1}`,
                      )}
                      inputMode="decimal"
                      onChange={(event) => {
                        const rows = [...state.variants]
                        rows[index] = {
                          ...variant,
                          sellingPrice: event.target.value,
                        }
                        patch({ variants: rows })
                      }}
                      placeholder={t('Selling price', 'বিক্রির দাম')}
                      value={variant.sellingPrice}
                    />
                  </label>

                  <label className="product-field">
                    <BilingualLabel
                      en="Minimum Stock"
                      bn="ন্যূনতম স্টক"
                    />
                    <Input
                      aria-label={t(
                        `Variant minimum stock ${index + 1}`,
                        `ভ্যারিয়েন্ট ন্যূনতম স্টক ${index + 1}`,
                      )}
                      inputMode="decimal"
                      onChange={(event) => {
                        const rows = [...state.variants]
                        rows[index] = {
                          ...variant,
                          minimumStock: event.target.value,
                        }
                        patch({ variants: rows })
                      }}
                      placeholder={t('Min stock', 'ন্যূনতম স্টক')}
                      value={variant.minimumStock}
                    />
                  </label>
                </div>

                {parsedOptions.length > 0 ? (
                  <div className="product-variant-selections">
                    {parsedOptions.map((option) => (
                      <label
                        className="product-field"
                        key={option.name || 'unnamed'}
                      >
                        <span>
                          {option.name || t('Option', 'অপশন')}
                        </span>
                        <Select
                          disabled={variant.hasInventoryHistory}
                          onValueChange={(value) => {
                            const rows = [...state.variants]
                            rows[index] = {
                              ...variant,
                              selections: {
                                ...variant.selections,
                                [option.name]:
                                  value === SELECT_NONE ? '' : value,
                              },
                            }
                            patch({ variants: rows })
                          }}
                          value={
                            variant.selections[option.name] || SELECT_NONE
                          }
                        >
                          <SelectTrigger
                            aria-label={t(
                              `Variant ${index + 1} ${option.name || 'option'}`,
                              `ভ্যারিয়েন্ট ${index + 1} ${option.name || 'অপশন'}`,
                            )}
                            className="product-select"
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectGroup>
                              <SelectItem value={SELECT_NONE}>
                                {t('Select', 'নির্বাচন করুন')}
                              </SelectItem>
                              {option.values.map((value) => (
                                <SelectItem key={value} value={value}>
                                  {value}
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                      </label>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
      </section>
      </TooltipProvider>
    </div>
  )
}
