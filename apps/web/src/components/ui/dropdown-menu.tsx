import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu'
import type { ComponentPropsWithoutRef } from 'react'

export const DropdownMenu = DropdownMenuPrimitive.Root
export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger

export function DropdownMenuContent({
  className = '',
  sideOffset = 4,
  ...props
}: ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Content>) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        className={`ui-dropdown-content ${className}`.trim()}
        sideOffset={sideOffset}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  )
}

export function DropdownMenuItem({
  className = '',
  ...props
}: ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Item>) {
  return (
    <DropdownMenuPrimitive.Item
      className={`ui-dropdown-item ${className}`.trim()}
      {...props}
    />
  )
}

export function DropdownMenuSeparator({
  className = '',
  ...props
}: ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Separator>) {
  return (
    <DropdownMenuPrimitive.Separator
      className={`ui-dropdown-separator ${className}`.trim()}
      {...props}
    />
  )
}
