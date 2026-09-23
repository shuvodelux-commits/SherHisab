import * as TabsPrimitive from '@radix-ui/react-tabs'
import type { ComponentPropsWithoutRef } from 'react'

export const Tabs = TabsPrimitive.Root

export function TabsList({
  className = '',
  variant = 'default',
  ...props
}: ComponentPropsWithoutRef<typeof TabsPrimitive.List> & {
  variant?: 'default' | 'line'
}) {
  return (
    <TabsPrimitive.List
      className={`ui-tabs-list ui-tabs-list-${variant} ${className}`.trim()}
      data-slot="tabs-list"
      data-variant={variant}
      {...props}
    />
  )
}

export function TabsTrigger({
  className = '',
  ...props
}: ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={`ui-tabs-trigger ${className}`.trim()}
      data-slot="tabs-trigger"
      {...props}
    />
  )
}

export function TabsContent({
  className = '',
  ...props
}: ComponentPropsWithoutRef<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      className={`ui-tabs-content ${className}`.trim()}
      data-slot="tabs-content"
      {...props}
    />
  )
}
