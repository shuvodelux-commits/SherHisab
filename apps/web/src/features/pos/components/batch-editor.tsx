import { BilingualLabel } from '../../../components/ui/bilingual-label'

interface BatchEditorProps {
  batchCode?: string
  expiresOn?: string
  productName: string
}

export function BatchEditor({
  batchCode,
  expiresOn,
  productName,
}: BatchEditorProps) {
  return (
    <div
      aria-label={`Batch and expiry for ${productName}`}
      className="pos-tracking-editor"
    >
      <BilingualLabel en="Batch / Expiry" bn="ব্যাচ / মেয়াদ" />
      <span className="pos-muted">
        {batchCode
          ? `${batchCode}${expiresOn ? ` · ${expiresOn}` : ''}`
          : 'Batch selection is pending.'}
      </span>
    </div>
  )
}
