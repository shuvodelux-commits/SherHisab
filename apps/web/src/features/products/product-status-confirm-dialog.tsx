import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../../components/ui/alert-dialog'

interface ProductStatusConfirmDialogProps {
  open: boolean
  productName: string
  pending?: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}

export function ProductStatusConfirmDialog({
  open,
  productName,
  pending = false,
  onOpenChange,
  onConfirm,
}: ProductStatusConfirmDialogProps) {
  return (
    <AlertDialog onOpenChange={onOpenChange} open={open}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Deactivate product?</AlertDialogTitle>
          <AlertDialogDescription>
            {productName} will be hidden from normal active-product workflows.
            Existing transaction history will be kept.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction disabled={pending} onClick={onConfirm}>
            {pending ? 'Deactivating…' : 'Deactivate'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
