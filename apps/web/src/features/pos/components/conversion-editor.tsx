import { Input } from '../../../components/ui/input'
import type { PosConversionProfileDto } from '../pos-types'

interface ConversionEditorProps {
  productName: string
  profile: PosConversionProfileDto
  values: Record<string, string>
  disabled?: boolean
  onChange: (key: string, value: string) => void
}

export function ConversionEditor({
  productName,
  profile,
  values,
  disabled = false,
  onChange,
}: ConversionEditorProps) {
  const components = [...profile.components].sort(
    (left, right) => left.sortOrder - right.sortOrder,
  )

  return (
    <div className="pos-conversion-editor">
      {components.map((component) => (
        <label
          className="pos-conversion-field"
          key={component.id}
        >
          <span>{component.label}</span>
          <Input
            aria-label={`${component.label} for ${productName}`}
            disabled={disabled}
            inputMode={component.allowFraction ? 'decimal' : 'numeric'}
            min={component.minValue}
            onChange={(event) =>
              onChange(component.key, event.target.value)
            }
            step={component.allowFraction ? 'any' : '1'}
            value={values[component.key] ?? ''}
          />
        </label>
      ))}
    </div>
  )
}
