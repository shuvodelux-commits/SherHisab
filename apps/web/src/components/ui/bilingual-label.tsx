import type { HTMLAttributes } from 'react'
import { useLanguageMode } from '../../app/language'

interface BilingualLabelProps extends HTMLAttributes<HTMLSpanElement> {
  en: string
  bn: string
  layout?: 'inline' | 'stacked'
}

export function BilingualLabel({
  en,
  bn,
  layout = 'inline',
  className = '',
  ...props
}: BilingualLabelProps) {
  const { mode } = useLanguageMode()

  if (mode === 'en') {
    return (
      <span className={className} {...props}>
        {en}
      </span>
    )
  }

  if (mode === 'bn') {
    return (
      <span className={className} lang="bn" {...props}>
        {bn}
      </span>
    )
  }

  const layoutClass =
    layout === 'stacked'
      ? 'bilingual-label-stacked'
      : 'bilingual-label-inline'

  return (
    <span
      className={`bilingual-label ${layoutClass} ${className}`.trim()}
      {...props}
    >
      <span className="bilingual-label-primary">{en}</span>
      {layout === 'inline' ? (
        <span
          aria-hidden="true"
          className="bilingual-label-separator"
        >
          —
        </span>
      ) : null}
      <span className="bilingual-label-helper" lang="bn">
        {bn}
      </span>
    </span>
  )
}
