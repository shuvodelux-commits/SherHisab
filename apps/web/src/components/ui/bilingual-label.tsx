import type { HTMLAttributes } from 'react'
import { useLanguageMode } from '../../app/language'

interface BilingualLabelProps extends HTMLAttributes<HTMLSpanElement> {
  en: string
  bn: string
}

export function BilingualLabel({
  en,
  bn,
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

  return (
    <span
      className={`bilingual-label ${className}`.trim()}
      {...props}
    >
      <span>{en}</span>
      <span className="bilingual-label-helper" lang="bn">
        {bn}
      </span>
    </span>
  )
}
