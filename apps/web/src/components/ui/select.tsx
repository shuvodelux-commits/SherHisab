import * as SelectPrimitive from '@radix-ui/react-select'
import { Check, ChevronDown, ChevronUp } from 'lucide-react'
import type { ComponentPropsWithoutRef } from 'react'

export const Select = SelectPrimitive.Root
export const SelectGroup = SelectPrimitive.Group
export const SelectValue = SelectPrimitive.Value

export function SelectTrigger({
  className = '',
  children,
  ...props
}: ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>) {
  return (
    <SelectPrimitive.Trigger
      className={`ui-select-trigger ${className}`.trim()}
      data-slot="select-trigger"
      {...props}
    >
      {children}
      <SelectPrimitive.Icon asChild>
        <ChevronDown aria-hidden="true" size={14} />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  )
}
function SelectScrollUpButton(
  props: ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollUpButton>,
) {
  return (
    <SelectPrimitive.ScrollUpButton
      className="ui-select-scroll-button"
      {...props}
    >
      <ChevronUp aria-hidden="true" size={14} />
    </SelectPrimitive.ScrollUpButton>
  )
}

function SelectScrollDownButton(
  props: ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollDownButton>,
) {
  return (
    <SelectPrimitive.ScrollDownButton
      className="ui-select-scroll-button"
      {...props}
    >
      <ChevronDown aria-hidden="true" size={14} />
    </SelectPrimitive.ScrollDownButton>
  )
}
export function SelectContent({
  className = '',
  children,
  position = 'popper',
  ...props
}: ComponentPropsWithoutRef<typeof SelectPrimitive.Content>) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        className={`ui-select-content ${className}`.trim()}
        data-slot="select-content"
        position={position}
        {...props}
      >
        <SelectScrollUpButton />
        <SelectPrimitive.Viewport className="ui-select-viewport">
          {children}
        </SelectPrimitive.Viewport>
        <SelectScrollDownButton />
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  )
}

export const SelectLabel = SelectPrimitive.Label
export function SelectItem({
  className = '',
  children,
  ...props
}: ComponentPropsWithoutRef<typeof SelectPrimitive.Item>) {
  return (
    <SelectPrimitive.Item
      className={`ui-select-item ${className}`.trim()}
      data-slot="select-item"
      {...props}
    >
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
      <SelectPrimitive.ItemIndicator className="ui-select-item-indicator">
        <Check aria-hidden="true" size={14} />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  )
}

export function SelectSeparator({
  className = '',
  ...props
}: ComponentPropsWithoutRef<typeof SelectPrimitive.Separator>) {
  return (
    <SelectPrimitive.Separator
      className={`ui-select-separator ${className}`.trim()}
      data-slot="select-separator"
      {...props}
    />
  )
}
