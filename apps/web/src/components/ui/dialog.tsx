import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import type { ComponentPropsWithoutRef, HTMLAttributes } from 'react'

export const Dialog = DialogPrimitive.Root
export const DialogTrigger = DialogPrimitive.Trigger
export const DialogClose = DialogPrimitive.Close

export function DialogContent({
  className = '',
  children,
  ...props
}: ComponentPropsWithoutRef<typeof DialogPrimitive.Content>) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="ui-dialog-overlay" data-slot="dialog-overlay" />
      <DialogPrimitive.Content
        className={`ui-dialog-content ${className}`.trim()}
        data-slot="dialog-content"
        {...props}
      >
        {children}
        <DialogPrimitive.Close
          aria-label="Close"
          className="ui-dialog-close"
          data-slot="dialog-close"
        >
          <X aria-hidden="true" size={16} strokeWidth={1.8} />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
}

export function DialogHeader({
  className = '',
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`ui-dialog-header ${className}`.trim()}
      data-slot="dialog-header"
      {...props}
    />
  )
}

export function DialogFooter({
  className = '',
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`ui-dialog-footer ${className}`.trim()}
      data-slot="dialog-footer"
      {...props}
    />
  )
}

export function DialogTitle({
  className = '',
  ...props
}: ComponentPropsWithoutRef<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      className={`ui-dialog-title ${className}`.trim()}
      data-slot="dialog-title"
      {...props}
    />
  )
}

export function DialogDescription({
  className = '',
  ...props
}: ComponentPropsWithoutRef<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      className={`ui-dialog-description ${className}`.trim()}
      data-slot="dialog-description"
      {...props}
    />
  )
}
