import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu'
import { Check } from 'lucide-react'
import type { ComponentPropsWithoutRef } from 'react'

export const DropdownMenu = DropdownMenuPrimitive.Root
export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger
export const DropdownMenuGroup = DropdownMenuPrimitive.Group

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

export function DropdownMenuCheckboxItem({
  children,
  className = '',
  ...props
}: ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.CheckboxItem>) {
  return (
    <DropdownMenuPrimitive.CheckboxItem
      className={`ui-dropdown-item ui-dropdown-checkbox-item ${className}`.trim()}
      {...props}
    >
      <DropdownMenuPrimitive.ItemIndicator className="ui-dropdown-item-indicator">
        <Check aria-hidden="true" size={14} />
      </DropdownMenuPrimitive.ItemIndicator>
      <span>{children}</span>
    </DropdownMenuPrimitive.CheckboxItem>
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
