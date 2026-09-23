import type { HTMLAttributes } from 'react'

type BadgeTone =
  | 'neutral'
  | 'info'
  | 'success'
  | 'warning'
  | 'danger'

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone
}

export function Badge({
  className = '',
  tone = 'neutral',
  ...props
}: BadgeProps) {
  return (
    <span
      className={`ui-badge ui-badge-${tone} ${className}`.trim()}
      {...props}
    />
  )
}
