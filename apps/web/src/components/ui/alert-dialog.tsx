import * as AlertDialogPrimitive from '@radix-ui/react-alert-dialog'
import type { ComponentPropsWithoutRef } from 'react'

export const AlertDialog = AlertDialogPrimitive.Root
export const AlertDialogTrigger = AlertDialogPrimitive.Trigger

export function AlertDialogContent({
  className = '',
  ...props
}: ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Content>) {
  return (
    <AlertDialogPrimitive.Portal>
      <AlertDialogPrimitive.Overlay
        className="ui-alert-dialog-overlay"
        data-slot="alert-dialog-overlay"
      />
      <AlertDialogPrimitive.Content
        className={`ui-alert-dialog-content ${className}`.trim()}
        data-slot="alert-dialog-content"
        {...props}
      />
    </AlertDialogPrimitive.Portal>
  )
}
export function AlertDialogHeader({
  className = '',
  ...props
}: ComponentPropsWithoutRef<'div'>) {
  return (
    <div
      className={`ui-alert-dialog-header ${className}`.trim()}
      data-slot="alert-dialog-header"
      {...props}
    />
  )
}

export function AlertDialogFooter({
  className = '',
  ...props
}: ComponentPropsWithoutRef<'div'>) {
  return (
    <div
      className={`ui-alert-dialog-footer ${className}`.trim()}
      data-slot="alert-dialog-footer"
      {...props}
    />
  )
}
export function AlertDialogTitle({
  className = '',
  ...props
}: ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Title>) {
  return (
    <AlertDialogPrimitive.Title
      className={`ui-alert-dialog-title ${className}`.trim()}
      data-slot="alert-dialog-title"
      {...props}
    />
  )
}

export function AlertDialogDescription({
  className = '',
  ...props
}: ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Description>) {
  return (
    <AlertDialogPrimitive.Description
      className={`ui-alert-dialog-description ${className}`.trim()}
      data-slot="alert-dialog-description"
      {...props}
    />
  )
}
export function AlertDialogCancel({
  className = '',
  ...props
}: ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Cancel>) {
  return (
    <AlertDialogPrimitive.Cancel
      className={`ui-button ui-button-outline ui-button-default ${className}`.trim()}
      data-slot="alert-dialog-cancel"
      {...props}
    />
  )
}

export function AlertDialogAction({
  className = '',
  ...props
}: ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Action>) {
  return (
    <AlertDialogPrimitive.Action
      className={`ui-button ui-button-destructive ui-button-default ${className}`.trim()}
      data-slot="alert-dialog-action"
      {...props}
    />
  )
}
