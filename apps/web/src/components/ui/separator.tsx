import * as SeparatorPrimitive from '@radix-ui/react-separator'
import type { ComponentPropsWithoutRef } from 'react'

export function Separator({
  className = '',
  decorative = false,
  orientation = 'horizontal',
  ...props
}: ComponentPropsWithoutRef<typeof SeparatorPrimitive.Root>) {
  return (
    <SeparatorPrimitive.Root
      className={`ui-separator ui-separator-${orientation} ${className}`.trim()}
      data-slot="separator"
      decorative={decorative}
      orientation={orientation}
      {...props}
    />
  )
}
