import * as CheckboxPrimitive from '@radix-ui/react-checkbox'
import { Check } from 'lucide-react'
import type { ComponentPropsWithoutRef } from 'react'

export function Checkbox({
  className = '',
  ...props
}: ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      className={`ui-checkbox ${className}`.trim()}
      data-slot="checkbox"
      {...props}
    >
      <CheckboxPrimitive.Indicator
        className="ui-checkbox-indicator"
        data-slot="checkbox-indicator"
      >
        <Check aria-hidden="true" size={13} strokeWidth={2.5} />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}
