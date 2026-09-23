import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import type { ComponentPropsWithoutRef } from 'react'

export function TooltipProvider({
  delayDuration = 150,
  ...props
}: ComponentPropsWithoutRef<typeof TooltipPrimitive.Provider>) {
  return (
    <TooltipPrimitive.Provider
      data-slot="tooltip-provider"
      delayDuration={delayDuration}
      {...props}
    />
  )
}

export const Tooltip = TooltipPrimitive.Root
export const TooltipTrigger = TooltipPrimitive.Trigger
export function TooltipContent({
  className = '',
  sideOffset = 6,
  ...props
}: ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        className={`ui-tooltip-content ${className}`.trim()}
        data-slot="tooltip-content"
        sideOffset={sideOffset}
        {...props}
      />
    </TooltipPrimitive.Portal>
  )
}
