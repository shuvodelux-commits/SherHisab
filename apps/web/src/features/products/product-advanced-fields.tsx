import { CircleHelp, Pencil, Plus, Trash2 } from 'lucide-react'
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
  AllocationPolicy,
  ConversionMode,
  ConversionProfileType,
  ProductAdvancedConfigurationDto,
  ProductCaptureFieldType,
  ProductUnitDto,
  TrackingMode,
  WarrantyDurationUnit,
  VariantInput,
  VariantOptionInput,
} from './product-types'

const SELECT_NONE = '__select_none__'

function AdvancedSectionHelp({
  titleEn,
  titleBn,
  en,
  bn,
}: {
  titleEn: string
  titleBn: string
  en: string
  bn: string
}) {
  const { mode } = useLanguageMode()

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          aria-label={mode === 'bn' ? `${titleBn} সম্পর্কে` : `About ${titleEn}`}
          size="icon-xs"
          variant="ghost"
        >
          <CircleHelp aria-hidden="true" />
        </Button>
      </TooltipTrigger>
      <TooltipContent className="product-section-help-tooltip">
        <BilingualLabel en={en} bn={bn} layout="stacked" />
      </TooltipContent>
    </Tooltip>
  )
}

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

export interface ConversionComponentFormRow {
  key: string
  componentKey: string
  label: string
  unitId: string
  numerator: string
  denominator: string
  minValue: string
  maxExclusive: string
  allowFraction: boolean
  autoNormalizeRemainder: boolean
}

export interface CaptureFieldFormRow {
  key: string
  fieldKey: string
  label: string
  type: ProductCaptureFieldType
  selectOptionsText: string
  required: boolean
}

export interface ProductAdvancedFormState {
  trackingMode: TrackingMode
  allocationPolicy: AllocationPolicy
  warrantyEnabled: boolean
  warrantyDurationValue: string
  warrantyDurationUnit: WarrantyDurationUnit
  warrantyProvider: string
  warrantyText: string
  captureFields: CaptureFieldFormRow[]
  conversionEnabled: boolean
  conversionEditorMode: 'GUIDED' | 'ADVANCED'
  conversionGuidedUnitId: string
  conversionGuidedRatio: string
  conversionType: ConversionProfileType
  conversionPricingUnitId: string
  conversionPricingFactorNumerator: string
  conversionPricingFactorDenominator: string
  conversionDisplayPrecision: string
  conversionComponents: ConversionComponentFormRow[]
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
    allocationPolicy: 'FIFO',
    warrantyEnabled: false,
    warrantyDurationValue: '',
    warrantyDurationUnit: 'MONTH',
    warrantyProvider: '',
    warrantyText: '',
    captureFields: [],
    conversionEnabled: false,
    conversionEditorMode: 'GUIDED',
    conversionGuidedUnitId: '',
    conversionGuidedRatio: '',
    conversionType: 'COMPOUND',
    conversionPricingUnitId: '',
    conversionPricingFactorNumerator: '1',
    conversionPricingFactorDenominator: '1',
    conversionDisplayPrecision: '2',
    conversionComponents: [],
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
  allocationPolicy: AllocationPolicy,
  variantsEnabled: boolean,
  advanced?: ProductAdvancedConfigurationDto,
): ProductAdvancedFormState {
  if (!advanced) {
    return {
      ...emptyAdvancedFormState(trackingMode),
      allocationPolicy,
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

  const conversion = advanced.conversionProfile
  const orderedComponents = [...(conversion?.components ?? [])].sort((a, b) => a.sortOrder - b.sortOrder)
  const larger = orderedComponents[0]
  const smaller = orderedComponents[1]
  const guidedConversion = Boolean(conversion?.type === 'COMPOUND' &&
    orderedComponents.length === 2 && larger && smaller &&
    larger.unitId === conversion.pricingUnitId && smaller.unitId === conversion.baseUnitId &&
    larger.baseFactorDenominator === '1' && smaller.baseFactorDenominator === '1' &&
    larger.baseFactorNumerator === conversion.pricingBaseFactorNumerator &&
    smaller.baseFactorNumerator === '1' &&
    conversion.pricingBaseFactorDenominator === '1' &&
    larger.minValue === '0' && smaller.minValue === '0' &&
    larger.maxExclusive === null && smaller.maxExclusive === larger.baseFactorNumerator &&
    !larger.allowFraction && !smaller.allowFraction &&
    !larger.autoNormalizeRemainder && !smaller.autoNormalizeRemainder)

  const warranty = advanced.warrantyPolicy

  return {
    trackingMode,
    allocationPolicy,
    warrantyEnabled: Boolean(warranty?.enabled),
    warrantyDurationValue:
      warranty?.durationValue?.toString() ?? '',
    warrantyDurationUnit:
      warranty?.durationUnit ?? 'MONTH',
    warrantyProvider: warranty?.provider ?? '',
    warrantyText: warranty?.text ?? '',
    captureFields:
      advanced.captureFields?.map((field, index) => ({
        key: field.id ?? rowKey('capture', index),
        fieldKey: field.key,
        label: field.label,
        type: field.type,
        selectOptionsText: field.selectOptions.join(', '),
        required: field.required,
      })) ?? [],
    conversionEnabled: Boolean(conversion),
    conversionEditorMode: conversion && !guidedConversion ? 'ADVANCED' : 'GUIDED',
    conversionGuidedUnitId: guidedConversion ? larger!.unitId : '',
    conversionGuidedRatio: guidedConversion ? larger!.baseFactorNumerator : '',
    conversionType: conversion?.type ?? 'COMPOUND',
    conversionPricingUnitId: conversion?.pricingUnitId ?? '',
    conversionPricingFactorNumerator:
      conversion?.pricingBaseFactorNumerator ?? '1',
    conversionPricingFactorDenominator:
      conversion?.pricingBaseFactorDenominator ?? '1',
    conversionDisplayPrecision:
      conversion?.displayPrecision.toString() ?? '2',
    conversionComponents:
      conversion?.components.map((component, index) => ({
        key: component.id ?? rowKey('conversion', index),
        componentKey: component.key,
        label: component.label,
        unitId: component.unitId,
        numerator: component.baseFactorNumerator,
        denominator: component.baseFactorDenominator,
        minValue: component.minValue,
        maxExclusive: component.maxExclusive ?? '',
        allowFraction: component.allowFraction,
        autoNormalizeRemainder: component.autoNormalizeRemainder,
      })) ?? [],
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
  baseUnitId: string,
  units: ProductUnitDto[] = [],
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

  const displayPrecision = Number.parseInt(
    state.conversionDisplayPrecision || '2',
    10,
  )

  const guidedUnitIds = [state.conversionGuidedUnitId, baseUnitId]
  const guidedKeys = guidedUnitIds.map((unitId) => {
    const unit = units.find((item) => item.id === unitId)
    return (unit?.symbol ?? unit?.name ?? '').trim().toLowerCase()
      .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
  })
  const useNamedGuidedKeys = guidedKeys.every(Boolean) && guidedKeys[0] !== guidedKeys[1]

  const warrantyDurationValue = Number.parseInt(
    state.warrantyDurationValue || '0',
    10,
  )

  return {
    warrantyPolicy: state.warrantyEnabled
      ? {
          enabled: true,
          durationValue: Number.isFinite(warrantyDurationValue)
            ? warrantyDurationValue
            : 0,
          durationUnit: state.warrantyDurationUnit,
          provider: state.warrantyProvider.trim(),
          text: state.warrantyText.trim(),
        }
      : { enabled: false },
    captureFields: state.captureFields.map((field) => ({
      key: field.fieldKey.trim(),
      label: field.label.trim(),
      type: field.type,
      selectOptions:
        field.type === 'select'
          ? commaValues(field.selectOptionsText)
          : [],
      required: field.required,
    })),
    conversionProfile: state.conversionEnabled
      ? {
          type: state.conversionEditorMode === 'GUIDED' ? 'COMPOUND' : state.conversionType,
          baseUnitId,
          pricingUnitId: state.conversionEditorMode === 'GUIDED'
            ? state.conversionGuidedUnitId : state.conversionPricingUnitId,
          pricingBaseFactorNumerator:
            state.conversionEditorMode === 'GUIDED'
              ? state.conversionGuidedRatio : state.conversionPricingFactorNumerator,
          pricingBaseFactorDenominator:
            state.conversionEditorMode === 'GUIDED'
              ? '1' : state.conversionPricingFactorDenominator,
          displayPrecision: Number.isFinite(displayPrecision)
            ? displayPrecision
            : 2,
          components: state.conversionEditorMode === 'GUIDED'
            ? guidedUnitIds.map((unitId, index) => {
                const unit = units.find((item) => item.id === unitId)
                const label = unit?.name ?? (index === 0 ? 'Larger unit' : 'Base unit')
                return {
                  key: useNamedGuidedKeys ? guidedKeys[index]! : (index === 0 ? 'larger' : 'base'),
                  label, unitId,
                  baseFactorNumerator: index === 0 ? state.conversionGuidedRatio : '1',
                  baseFactorDenominator: '1', sortOrder: index, minValue: '0',
                  maxExclusive: index === 0 ? null : state.conversionGuidedRatio,
                  allowFraction: false, autoNormalizeRemainder: false,
                }
              })
            : state.conversionComponents.map(
            (component, index) => ({
              key: component.componentKey.trim(),
              label: component.label.trim(),
              unitId: component.unitId,
              baseFactorNumerator: component.numerator,
              baseFactorDenominator: component.denominator,
              sortOrder: index,
              minValue: component.minValue || '0',
              maxExclusive:
                component.maxExclusive.trim() || null,
              allowFraction: component.allowFraction,
              autoNormalizeRemainder:
                component.autoNormalizeRemainder,
            }),
          ),
        }
      : null,
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
  onAddUnit?: (target: 'conversion' | number) => void
  onEditUnit?: (unitId: string) => void
}

export function ProductAdvancedFields({
  state,
  onChange,
  units,
  baseUnitId,
  onAddUnit,
  onEditUnit,
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
      <section className="product-advanced-section">
        <div className="product-advanced-heading">
          <div className="product-section-heading-title">
            <strong>
              <BilingualLabel
                en="Inventory Tracking"
                bn="ইনভেন্টরি ট্র্যাকিং"
              />
            </strong>
            <AdvancedSectionHelp
              titleEn="Inventory Tracking"
              titleBn="ইনভেন্টরি ট্র্যাকিং"
              en="Keep ordinary Products simple. Enable serial or batch/expiry tracking only when the business needs it."
              bn="সাধারণ পণ্য সহজ রাখুন। ব্যবসায় প্রয়োজন হলেই সিরিয়াল বা ব্যাচ/মেয়াদ ট্র্যাকিং চালু করুন।"
            />
          </div>
        </div>

        <div className="product-inline-grid">
          <label className="product-field">
            <BilingualLabel en="Tracking" bn="স্টক ট্র্যাকিং" />
            <Select
              onValueChange={(value) => {
                const trackingMode = value as TrackingMode
                patch({
                  trackingMode,
                  allocationPolicy:
                    trackingMode === 'BATCH_EXPIRY'
                      ? state.allocationPolicy
                      : 'FIFO',
                })
              }}
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
                  <SelectItem value="SERIAL">
                    {t('Serial', 'সিরিয়াল')}
                  </SelectItem>
                  <SelectItem value="BATCH_EXPIRY">
                    {t('Batch & Expiry', 'ব্যাচ ও মেয়াদ')}
                  </SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </label>

          {state.trackingMode === 'BATCH_EXPIRY' ? (
            <label className="product-field">
              <BilingualLabel
                en="Allocation Policy"
                bn="স্টক বাছাই পদ্ধতি"
              />
              <Select
                onValueChange={(value) =>
                  patch({
                    allocationPolicy: value as AllocationPolicy,
                  })
                }
                value={state.allocationPolicy}
              >
                <SelectTrigger
                  aria-label={t(
                    'Allocation Policy',
                    'স্টক বাছাই পদ্ধতি',
                  )}
                  className="product-select"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="FIFO">
                      {t('FIFO', 'আগে আসা আগে বিক্রি')}
                    </SelectItem>
                    <SelectItem value="FEFO">
                      {t('FEFO', 'আগে মেয়াদ শেষ হবে আগে বিক্রি')}
                    </SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </label>
          ) : null}
        </div>
      </section>

      <section className="product-advanced-section">
        <div className="product-advanced-heading">
          <div className="product-section-heading-title">
            <strong>
              <BilingualLabel en="Warranty" bn="ওয়ারেন্টি" />
            </strong>
            <AdvancedSectionHelp
              titleEn="Warranty"
              titleBn="ওয়ারেন্টি"
              en="Enable only when this Product carries a warranty. Sale-time warranty details are preserved as history."
              bn="এই পণ্যে ওয়ারেন্টি থাকলেই চালু করুন। বিক্রির সময়ের ওয়ারেন্টি তথ্য ইতিহাস হিসেবে সংরক্ষিত থাকবে।"
            />
          </div>
        </div>

        <label className="product-check-row">
          <Checkbox
            aria-label={t('Enable Warranty', 'ওয়ারেন্টি চালু করুন')}
            checked={state.warrantyEnabled}
            onCheckedChange={(checked) =>
              patch({ warrantyEnabled: checked === true })
            }
          />
          <span>
            <strong>
              {t('Enable Warranty', 'ওয়ারেন্টি চালু করুন')}
            </strong>
          </span>
        </label>

        {state.warrantyEnabled ? (
          <div className="product-inline-grid">
            <label className="product-field">
              <BilingualLabel
                en="Warranty Duration"
                bn="ওয়ারেন্টির সময়"
              />
              <Input
                aria-label={t(
                  'Warranty Duration',
                  'ওয়ারেন্টির সময়',
                )}
                inputMode="numeric"
                min="1"
                onChange={(event) =>
                  patch({
                    warrantyDurationValue: event.target.value,
                  })
                }
                value={state.warrantyDurationValue}
              />
            </label>

            <label className="product-field">
              <BilingualLabel
                en="Duration Unit"
                bn="সময়ের একক"
              />
              <Select
                onValueChange={(value) =>
                  patch({
                    warrantyDurationUnit:
                      value as WarrantyDurationUnit,
                  })
                }
                value={state.warrantyDurationUnit}
              >
                <SelectTrigger
                  aria-label={t(
                    'Warranty Duration Unit',
                    'ওয়ারেন্টি সময়ের একক',
                  )}
                  className="product-select"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="DAY">
                      {t('Days', 'দিন')}
                    </SelectItem>
                    <SelectItem value="MONTH">
                      {t('Months', 'মাস')}
                    </SelectItem>
                    <SelectItem value="YEAR">
                      {t('Years', 'বছর')}
                    </SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </label>

            <label className="product-field">
              <BilingualLabel
                en="Warranty Provider"
                bn="ওয়ারেন্টি প্রদানকারী"
              />
              <Input
                aria-label={t(
                  'Warranty Provider',
                  'ওয়ারেন্টি প্রদানকারী',
                )}
                onChange={(event) =>
                  patch({ warrantyProvider: event.target.value })
                }
                value={state.warrantyProvider}
              />
            </label>

            <label className="product-field product-field-wide">
              <BilingualLabel
                en="Warranty Terms"
                bn="ওয়ারেন্টির শর্ত"
              />
              <Input
                aria-label={t(
                  'Warranty Terms',
                  'ওয়ারেন্টির শর্ত',
                )}
                onChange={(event) =>
                  patch({ warrantyText: event.target.value })
                }
                value={state.warrantyText}
              />
            </label>
          </div>
        ) : null}
      </section>

      <section className="product-advanced-section">
        <div className="product-advanced-heading">
          <div className="product-section-heading-title">
            <strong>
              <BilingualLabel
                en="Sale Capture Fields"
                bn="বিক্রির অতিরিক্ত তথ্য"
              />
            </strong>
            <AdvancedSectionHelp
              titleEn="Sale Capture Fields"
              titleBn="বিক্রির অতিরিক্ত তথ্য"
              en="Add only Product-specific information the cashier must capture during a sale."
              bn="বিক্রির সময় ক্যাশিয়ারের যে পণ্য-নির্দিষ্ট তথ্য দরকার শুধু সেটিই যোগ করুন।"
            />
          </div>
          <Button
            onClick={() =>
              patch({
                captureFields: [
                  ...state.captureFields,
                  {
                    key: rowKey(
                      'capture',
                      state.captureFields.length,
                    ),
                    fieldKey: '',
                    label: '',
                    type: 'text',
                    selectOptionsText: '',
                    required: false,
                  },
                ],
              })
            }
            size="sm"
            variant="secondary"
          >
            <Plus aria-hidden="true" data-icon="inline-start" />
            {t('Add Capture Field', 'তথ্যের ঘর যোগ করুন')}
          </Button>
        </div>

        {state.captureFields.map((field, index) => (
          <div className="product-variant-row" key={field.key}>
            <div className="product-inline-grid">
              <label className="product-field">
                <BilingualLabel en="Field Key" bn="ফিল্ড কী" />
                <Input
                  aria-label={t(
                    `Capture Field Key ${index + 1}`,
                    `তথ্যের ঘর কী ${index + 1}`,
                  )}
                  onChange={(event) => {
                    const rows = [...state.captureFields]
                    rows[index] = {
                      ...field,
                      fieldKey: event.target.value,
                    }
                    patch({ captureFields: rows })
                  }}
                  value={field.fieldKey}
                />
              </label>

              <label className="product-field">
                <BilingualLabel en="Label" bn="লেবেল" />
                <Input
                  aria-label={t(
                    `Capture Field Label ${index + 1}`,
                    `তথ্যের ঘর লেবেল ${index + 1}`,
                  )}
                  onChange={(event) => {
                    const rows = [...state.captureFields]
                    rows[index] = {
                      ...field,
                      label: event.target.value,
                    }
                    patch({ captureFields: rows })
                  }}
                  value={field.label}
                />
              </label>

              <label className="product-field">
                <BilingualLabel en="Type" bn="ধরন" />
                <Select
                  onValueChange={(value) => {
                    const rows = [...state.captureFields]
                    rows[index] = {
                      ...field,
                      type: value as ProductCaptureFieldType,
                      selectOptionsText:
                        value === 'select'
                          ? field.selectOptionsText
                          : '',
                    }
                    patch({ captureFields: rows })
                  }}
                  value={field.type}
                >
                  <SelectTrigger
                    aria-label={t(
                      `Capture Field Type ${index + 1}`,
                      `তথ্যের ঘর ধরন ${index + 1}`,
                    )}
                    className="product-select"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="text">
                        {t('Text', 'লেখা')}
                      </SelectItem>
                      <SelectItem value="number">
                        {t('Number', 'সংখ্যা')}
                      </SelectItem>
                      <SelectItem value="date">
                        {t('Date', 'তারিখ')}
                      </SelectItem>
                      <SelectItem value="select">
                        {t('Select', 'তালিকা')}
                      </SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </label>

              {field.type === 'select' ? (
                <label className="product-field">
                  <BilingualLabel
                    en="Options"
                    bn="অপশন"
                  />
                  <Input
                    aria-label={t(
                      `Capture Field Options ${index + 1}`,
                      `তথ্যের ঘর অপশন ${index + 1}`,
                    )}
                    onChange={(event) => {
                      const rows = [...state.captureFields]
                      rows[index] = {
                        ...field,
                        selectOptionsText: event.target.value,
                      }
                      patch({ captureFields: rows })
                    }}
                    placeholder={t(
                      'Tablet, Syrup',
                      'ট্যাবলেট, সিরাপ',
                    )}
                    value={field.selectOptionsText}
                  />
                </label>
              ) : null}
            </div>

            <div className="product-check-row">
              <Checkbox
                aria-label={t(
                  `Capture Field Required ${index + 1}`,
                  `তথ্যের ঘর আবশ্যক ${index + 1}`,
                )}
                checked={field.required}
                onCheckedChange={(checked) => {
                  const rows = [...state.captureFields]
                  rows[index] = {
                    ...field,
                    required: checked === true,
                  }
                  patch({ captureFields: rows })
                }}
              />
              <span>
                {t('Required during sale', 'বিক্রির সময় আবশ্যক')}
              </span>
              <Button
                aria-label={t(
                  `Remove Capture Field ${index + 1}`,
                  `তথ্যের ঘর ${index + 1} সরান`,
                )}
                onClick={() =>
                  patch({
                    captureFields: state.captureFields.filter(
                      (item) => item.key !== field.key,
                    ),
                  })
                }
                size="sm"
                variant="ghost"
              >
                <Trash2 aria-hidden="true" data-icon="inline-start" />
                {t('Remove', 'সরান')}
              </Button>
            </div>
          </div>
        ))}
      </section>

      <section className="product-advanced-section">
        <div className="product-advanced-heading">
          <div className="product-section-heading-title">
            <strong>
              <BilingualLabel
                en="Quantity Conversion"
                bn="পরিমাণ রূপান্তর"
              />
            </strong>
            <AdvancedSectionHelp
              titleEn="Quantity Conversion"
              titleBn="পরিমাণ রূপান্তর"
              en="Use exact ratios for quantities such as Gauge + Gira or Carton + Piece. The Product Unit remains the base inventory unit."
              bn="গজ + গিরা বা কার্টন + পিসের মতো পরিমাণে সঠিক অনুপাত ব্যবহার করুন। পণ্যের এককই মূল স্টক একক থাকবে।"
            />
          </div>
        </div>

        <label className="product-check-row">
          <Checkbox
            aria-label={t(
              'Enable custom quantity conversion',
              'কাস্টম পরিমাণ রূপান্তর চালু করুন',
            )}
            checked={state.conversionEnabled}
            onCheckedChange={(checked) =>
              patch({ conversionEnabled: checked === true })
            }
          />
          <span>
            <strong>
              {t(
                'Enable custom quantity conversion',
                'কাস্টম পরিমাণ রূপান্তর চালু করুন',
              )}
            </strong>
          </span>
        </label>

        {state.conversionEnabled ? (
          <>
          {state.conversionEditorMode === 'GUIDED' ? (
            <div className="product-variant-editor">
              <div className="product-inline-grid">
                <label className="product-field">
                  <BilingualLabel en="Larger unit" bn="বড় একক" />
                  <Select value={state.conversionGuidedUnitId || SELECT_NONE}
                    onValueChange={(value) => {
                      if (value) patch({ conversionGuidedUnitId: value === SELECT_NONE ? '' : value })
                    }}>
                    <SelectTrigger aria-label={t('Larger unit', 'বড় একক')} className="product-select"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectGroup>
                      <SelectItem value={SELECT_NONE}>{t('Select unit', 'একক নির্বাচন করুন')}</SelectItem>
                      {units.filter((unit) => unit.isActive && unit.id !== baseUnitId).map((unit) => (
                        <SelectItem key={unit.id} value={unit.id}>{unit.name}{unit.symbol ? ` (${unit.symbol})` : ''}</SelectItem>
                      ))}
                    </SelectGroup></SelectContent>
                  </Select>
                </label>
                <label className="product-field">
                  <BilingualLabel en="Units per larger unit" bn="বড় এককে ছোট এককের সংখ্যা" />
                  <Input aria-label={t('Units per larger unit', 'বড় এককে ছোট এককের সংখ্যা')}
                    inputMode="numeric" min="1" value={state.conversionGuidedRatio}
                    onChange={(event) => patch({ conversionGuidedRatio: event.target.value })} />
                </label>
              </div>
              <p>1 {units.find((unit) => unit.id === state.conversionGuidedUnitId)?.name ?? t('larger unit', 'বড় একক')} = {state.conversionGuidedRatio || '…'} {units.find((unit) => unit.id === baseUnitId)?.name ?? t('base unit', 'মূল একক')}</p>
              <div className="product-inline-grid">
                <Button size="sm" variant="secondary" onClick={() => onAddUnit?.('conversion')}>
                  {t('Add Unit for conversion', 'রূপান্তরের জন্য একক যোগ করুন')}
                </Button>
                {state.conversionGuidedUnitId ? (
                  <Button size="sm" variant="ghost" onClick={() => onEditUnit?.(state.conversionGuidedUnitId)}>
                    {t('Edit selected Unit', 'নির্বাচিত একক সম্পাদনা করুন')}
                  </Button>
                ) : null}
              </div>
              <Button size="sm" variant="ghost" onClick={() => patch({ conversionEditorMode: 'ADVANCED' })}>
                {t('Advanced conversion settings', 'উন্নত রূপান্তর সেটিংস')}
              </Button>
            </div>
          ) : (
          <div className="product-variant-editor">
            <Button size="sm" variant="ghost" onClick={() => patch({ conversionEditorMode: 'GUIDED' })}>
              {t('Use simple mixed setup', 'সহজ মিশ্র একক ব্যবহার করুন')}
            </Button>
            <div className="product-inline-grid">
              <label className="product-field">
                <BilingualLabel
                  en="Profile Type"
                  bn="প্রোফাইলের ধরন"
                />
                <Select
                  onValueChange={(value) =>
                    patch({
                      conversionType:
                        value as ConversionProfileType,
                    })
                  }
                  value={state.conversionType}
                >
                  <SelectTrigger
                    aria-label={t(
                      'Conversion profile type',
                      'রূপান্তর প্রোফাইলের ধরন',
                    )}
                    className="product-select"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="SIMPLE">
                        {t('Simple', 'সাধারণ')}
                      </SelectItem>
                      <SelectItem value="PACK">
                        {t('Pack', 'প্যাক')}
                      </SelectItem>
                      <SelectItem value="LENGTH">
                        {t('Length', 'দৈর্ঘ্য')}
                      </SelectItem>
                      <SelectItem value="COMPOUND">
                        {t('Compound', 'যৌগিক')}
                      </SelectItem>
                      <SelectItem value="CUSTOM_FIXED_RATIO">
                        {t('Custom Fixed Ratio', 'কাস্টম নির্দিষ্ট অনুপাত')}
                      </SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </label>

              <label className="product-field">
                <BilingualLabel
                  en="Pricing Unit"
                  bn="দাম নির্ধারণের একক"
                />
                <Select
                  onValueChange={(value) =>
                    patch({
                      conversionPricingUnitId:
                        value === SELECT_NONE ? '' : value,
                    })
                  }
                  value={
                    state.conversionPricingUnitId || SELECT_NONE
                  }
                >
                  <SelectTrigger
                    aria-label={t(
                      'Pricing unit',
                      'দাম নির্ধারণের একক',
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
                        .filter((unit) => unit.isActive)
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
                <BilingualLabel
                  en="Pricing Factor Numerator"
                  bn="দামের অনুপাত লব"
                />
                <Input
                  aria-label={t(
                    'Pricing factor numerator',
                    'দামের অনুপাত লব',
                  )}
                  inputMode="numeric"
                  onChange={(event) =>
                    patch({
                      conversionPricingFactorNumerator:
                        event.target.value,
                    })
                  }
                  value={state.conversionPricingFactorNumerator}
                />
              </label>

              <label className="product-field">
                <BilingualLabel
                  en="Pricing Factor Denominator"
                  bn="দামের অনুপাত হর"
                />
                <Input
                  aria-label={t(
                    'Pricing factor denominator',
                    'দামের অনুপাত হর',
                  )}
                  inputMode="numeric"
                  onChange={(event) =>
                    patch({
                      conversionPricingFactorDenominator:
                        event.target.value,
                    })
                  }
                  value={state.conversionPricingFactorDenominator}
                />
              </label>

              <label className="product-field">
                <BilingualLabel
                  en="Display Precision"
                  bn="প্রদর্শনের দশমিক"
                />
                <Input
                  aria-label={t(
                    'Conversion display precision',
                    'রূপান্তর প্রদর্শনের দশমিক',
                  )}
                  inputMode="numeric"
                  max="8"
                  min="0"
                  onChange={(event) =>
                    patch({
                      conversionDisplayPrecision:
                        event.target.value,
                    })
                  }
                  value={state.conversionDisplayPrecision}
                />
              </label>
            </div>

            <div className="product-advanced-heading">
              <div>
                <strong>
                  <BilingualLabel
                    en="Conversion Components"
                    bn="রূপান্তর উপাদান"
                  />
                </strong>
                <p>
                  <BilingualLabel
                    layout="stacked"
                    en="Order the cashier inputs from whole unit to remainder. Ratios always convert into the Product base unit."
                    bn="ক্যাশিয়ারের ইনপুট বড় একক থেকে অবশিষ্ট একক পর্যন্ত সাজান। সব অনুপাত পণ্যের মূল এককে রূপান্তর হবে।"
                  />
                </p>
              </div>
              <Button
                onClick={() =>
                  patch({
                    conversionComponents: [
                      ...state.conversionComponents,
                      {
                        key: rowKey(
                          'conversion',
                          state.conversionComponents.length,
                        ),
                        componentKey: '',
                        label: '',
                        unitId: '',
                        numerator: '1',
                        denominator: '1',
                        minValue: '0',
                        maxExclusive: '',
                        allowFraction: false,
                        autoNormalizeRemainder: false,
                      },
                    ],
                  })
                }
                size="sm"
                variant="secondary"
              >
                <Plus aria-hidden="true" data-icon="inline-start" />
                {t(
                  'Add Conversion Component',
                  'রূপান্তর উপাদান যোগ করুন',
                )}
              </Button>
            </div>

            {state.conversionComponents.map((component, index) => (
              <div
                className="product-variant-row"
                key={component.key}
              >
                <div className="product-inline-grid">
                  <label className="product-field">
                    <BilingualLabel en="Key" bn="কী" />
                    <Input
                      aria-label={t(
                        `Conversion component key ${index + 1}`,
                        `রূপান্তর উপাদান কী ${index + 1}`,
                      )}
                      onChange={(event) => {
                        const rows = [
                          ...state.conversionComponents,
                        ]
                        rows[index] = {
                          ...component,
                          componentKey: event.target.value,
                        }
                        patch({ conversionComponents: rows })
                      }}
                      value={component.componentKey}
                    />
                  </label>

                  <label className="product-field">
                    <BilingualLabel en="Label" bn="লেবেল" />
                    <Input
                      aria-label={t(
                        `Conversion component label ${index + 1}`,
                        `রূপান্তর উপাদান লেবেল ${index + 1}`,
                      )}
                      onChange={(event) => {
                        const rows = [
                          ...state.conversionComponents,
                        ]
                        rows[index] = {
                          ...component,
                          label: event.target.value,
                        }
                        patch({ conversionComponents: rows })
                      }}
                      value={component.label}
                    />
                  </label>

                  <label className="product-field">
                    <BilingualLabel en="Unit" bn="একক" />
                    <Select
                      onValueChange={(value) => {
                        const rows = [
                          ...state.conversionComponents,
                        ]
                        rows[index] = {
                          ...component,
                          unitId:
                            value === SELECT_NONE ? '' : value,
                        }
                        patch({ conversionComponents: rows })
                      }}
                      value={component.unitId || SELECT_NONE}
                    >
                      <SelectTrigger
                        aria-label={t(
                          `Conversion component unit ${index + 1}`,
                          `রূপান্তর উপাদান একক ${index + 1}`,
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
                            .filter((unit) => unit.isActive)
                            .map((unit) => (
                              <SelectItem
                                key={unit.id}
                                value={unit.id}
                              >
                                {unit.name}
                                {unit.symbol
                                  ? ` (${unit.symbol})`
                                  : ''}
                              </SelectItem>
                            ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </label>

                  <label className="product-field">
                    <BilingualLabel
                      en="Factor Numerator"
                      bn="অনুপাত লব"
                    />
                    <Input
                      aria-label={t(
                        `Conversion component numerator ${index + 1}`,
                        `রূপান্তর উপাদান লব ${index + 1}`,
                      )}
                      inputMode="numeric"
                      onChange={(event) => {
                        const rows = [
                          ...state.conversionComponents,
                        ]
                        rows[index] = {
                          ...component,
                          numerator: event.target.value,
                        }
                        patch({ conversionComponents: rows })
                      }}
                      value={component.numerator}
                    />
                  </label>

                  <label className="product-field">
                    <BilingualLabel
                      en="Factor Denominator"
                      bn="অনুপাত হর"
                    />
                    <Input
                      aria-label={t(
                        `Conversion component denominator ${index + 1}`,
                        `রূপান্তর উপাদান হর ${index + 1}`,
                      )}
                      inputMode="numeric"
                      onChange={(event) => {
                        const rows = [
                          ...state.conversionComponents,
                        ]
                        rows[index] = {
                          ...component,
                          denominator: event.target.value,
                        }
                        patch({ conversionComponents: rows })
                      }}
                      value={component.denominator}
                    />
                  </label>

                  <label className="product-field">
                    <BilingualLabel
                      en="Minimum"
                      bn="সর্বনিম্ন"
                    />
                    <Input
                      aria-label={t(
                        `Conversion component minimum ${index + 1}`,
                        `রূপান্তর উপাদান সর্বনিম্ন ${index + 1}`,
                      )}
                      inputMode="decimal"
                      onChange={(event) => {
                        const rows = [
                          ...state.conversionComponents,
                        ]
                        rows[index] = {
                          ...component,
                          minValue: event.target.value,
                        }
                        patch({ conversionComponents: rows })
                      }}
                      value={component.minValue}
                    />
                  </label>

                  <label className="product-field">
                    <BilingualLabel
                      en="Max Exclusive"
                      bn="সর্বোচ্চ সীমা"
                    />
                    <Input
                      aria-label={t(
                        `Conversion component max exclusive ${index + 1}`,
                        `রূপান্তর উপাদান সর্বোচ্চ সীমা ${index + 1}`,
                      )}
                      inputMode="decimal"
                      onChange={(event) => {
                        const rows = [
                          ...state.conversionComponents,
                        ]
                        rows[index] = {
                          ...component,
                          maxExclusive: event.target.value,
                        }
                        patch({ conversionComponents: rows })
                      }}
                      value={component.maxExclusive}
                    />
                  </label>
                </div>

                <div className="product-check-row">
                  <Checkbox
                    aria-label={t(
                      `Allow fractional component ${index + 1}`,
                      `ভগ্নাংশ অনুমোদন ${index + 1}`,
                    )}
                    checked={component.allowFraction}
                    onCheckedChange={(checked) => {
                      const rows = [
                        ...state.conversionComponents,
                      ]
                      rows[index] = {
                        ...component,
                        allowFraction: checked === true,
                      }
                      patch({ conversionComponents: rows })
                    }}
                  />
                  <span>
                    {t(
                      'Allow fractions',
                      'ভগ্নাংশ অনুমোদন করুন',
                    )}
                  </span>

                  <Checkbox
                    aria-label={t(
                      `Auto normalize remainder ${index + 1}`,
                      `অবশিষ্ট স্বয়ংক্রিয় স্বাভাবিকীকরণ ${index + 1}`,
                    )}
                    checked={component.autoNormalizeRemainder}
                    onCheckedChange={(checked) => {
                      const rows = [
                        ...state.conversionComponents,
                      ]
                      rows[index] = {
                        ...component,
                        autoNormalizeRemainder:
                          checked === true,
                      }
                      patch({ conversionComponents: rows })
                    }}
                  />
                  <span>
                    {t(
                      'Auto-normalize remainder',
                      'অবশিষ্ট স্বয়ংক্রিয়ভাবে ঠিক করুন',
                    )}
                  </span>

                  <Button
                    aria-label={t(
                      `Remove conversion component ${index + 1}`,
                      `রূপান্তর উপাদান ${index + 1} সরান`,
                    )}
                    onClick={() =>
                      patch({
                        conversionComponents:
                          state.conversionComponents.filter(
                            (item) =>
                              item.key !== component.key,
                          ),
                      })
                    }
                    size="sm"
                    variant="ghost"
                  >
                    <Trash2
                      aria-hidden="true"
                      data-icon="inline-start"
                    />
                    {t('Remove', 'সরান')}
                  </Button>
                </div>
              </div>
            ))}
          </div>
          )}
          </>
        ) : null}
      </section>

      <section className="product-advanced-section">
        <div className="product-advanced-heading">
          <div className="product-section-heading-title">
            <strong>
              <BilingualLabel en="Alternative Units" bn="বিকল্প একক" />
            </strong>
            <AdvancedSectionHelp
              titleEn="Alternative Units"
              titleBn="বিকল্প একক"
              en="For example, 1 carton = 24 pieces. Add as many package sizes as this Product needs."
              bn="যেমন ১ কার্টন = ২৪ পিস। প্রয়োজনমতো একাধিক প্যাকের একক যোগ করুন।"
            />
          </div>
          <Button
            aria-label={t('Add alternative unit', 'বিকল্প একক যোগ করুন')}
            className="product-heading-action"
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
            {t('Add alternative', 'বিকল্প যোগ করুন')}
          </Button>
        </div>

        {state.alternativeUnits.map((row, index) => (
          <div className="product-alternative-row" key={row.key}>
            <div className="product-alternative-unit">
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
              <div className="product-alternative-unit-actions">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      aria-label={t(`Add Unit for alternative ${index + 1}`, `বিকল্প ${index + 1} একক যোগ করুন`)}
                      onClick={() => onAddUnit?.(index)}
                      size="icon-sm"
                      variant="ghost"
                    >
                      <Plus aria-hidden="true" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{t('Create a Unit and use it here', 'একক তৈরি করে এখানে ব্যবহার করুন')}</TooltipContent>
                </Tooltip>
                {row.unitId ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        aria-label={t(`Edit alternative Unit ${index + 1}`, `বিকল্প ${index + 1} একক সম্পাদনা করুন`)}
                        onClick={() => onEditUnit?.(row.unitId)}
                        size="icon-sm"
                        variant="ghost"
                      >
                        <Pencil aria-hidden="true" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{t('Edit the selected Unit', 'নির্বাচিত একক সম্পাদনা করুন')}</TooltipContent>
                  </Tooltip>
                ) : null}
              </div>
            </div>

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
              size="icon-sm"
              variant="ghost"
            >
              <Trash2 aria-hidden="true" />
            </Button>
            <span className="product-variable-unit-note product-alternative-equation">1 {units.find((unit) => unit.id === row.unitId)?.name ?? t('unit', 'একক')} = {row.conversionToBase || '…'} {units.find((unit) => unit.id === baseUnitId)?.name ?? t('base unit', 'মূল একক')}</span>
          </div>
        ))}
      </section>

      <section className="product-advanced-section">
        <div className="product-advanced-heading">
          <div className="product-section-heading-title">
            <strong>
              <BilingualLabel en="Specifications" bn="বৈশিষ্ট্য" />
            </strong>
            <AdvancedSectionHelp
              titleEn="Specifications"
              titleBn="বৈশিষ্ট্য"
              en="Descriptive attributes that do not create stock variants."
              bn="স্টক ভ্যারিয়েন্ট তৈরি না করে পণ্যের বর্ণনামূলক বৈশিষ্ট্য লিখুন।"
            />
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
        <div className="product-check-row">
          <label className="product-check-label">
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
            </span>
          </label>
          <AdvancedSectionHelp
            titleEn="Enable Variants"
            titleBn="ভ্যারিয়েন্ট চালু করুন"
            en="Use only when Color, Size, Grade or another option changes stock."
            bn="রং, সাইজ, গ্রেড বা অন্য অপশন অনুযায়ী আলাদা স্টক রাখতে হলে ব্যবহার করুন।"
          />
        </div>

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
