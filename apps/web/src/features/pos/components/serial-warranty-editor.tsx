import { BilingualLabel } from '../../../components/ui/bilingual-label'

interface SerialWarrantyEditorProps {
  productName: string
  serialCount?: number
}

export function SerialWarrantyEditor({
  productName,
  serialCount = 0,
}: SerialWarrantyEditorProps) {
  return (
    <div
      aria-label={`Serial and warranty for ${productName}`}
      className="pos-tracking-editor"
    >
      <BilingualLabel en="Serial / Warranty" bn="সিরিয়াল / ওয়ারেন্টি" />
      <span className="pos-muted">
        {serialCount > 0
          ? `${serialCount} serial selected`
          : 'Serial selection is pending.'}
      </span>
    </div>
  )
}
