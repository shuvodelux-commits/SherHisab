import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '../../../components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../../../components/ui/alert-dialog'
import { archiveSalesDraft, listSalesDrafts } from '../pos-api'
import type { SalesDraftDto } from '../pos-types'

interface RecentDraftsProps {
  onOpen: (draftId: string) => void
  onArchived: (draftId: string) => void
}

export function RecentDrafts({ onOpen, onArchived }: RecentDraftsProps) {
  const queryClient = useQueryClient()
  const [expanded, setExpanded] = useState(false)
  const [archiveTarget, setArchiveTarget] = useState<SalesDraftDto | null>(null)
  const draftsQuery = useQuery({
    queryKey: ['sales-drafts'],
    queryFn: listSalesDrafts,
    enabled: expanded,
  })
  const archiveMutation = useMutation({
    mutationFn: (draft: SalesDraftDto) =>
      archiveSalesDraft(draft.id, draft.version),
    onSuccess: async (_archived, draft) => {
      setArchiveTarget(null)
      onArchived(draft.id)
      await queryClient.invalidateQueries({ queryKey: ['sales-drafts'] })
    },
  })

  return (
    <section className="pos-recent-drafts" aria-label="Recent drafts">
      <Button
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
        size="sm"
        type="button"
        variant="outline"
      >
        Recent Drafts
      </Button>
      {expanded ? (
        <div className="pos-recent-drafts-list">
          {draftsQuery.isPending ? <p className="pos-muted">Loading drafts…</p> : null}
          {draftsQuery.isError ? (
            <p className="pos-error" role="alert">{draftsQuery.error.message}</p>
          ) : null}
          {draftsQuery.isSuccess && draftsQuery.data.length === 0 ? (
            <p className="pos-muted">No saved drafts.</p>
          ) : null}
          {draftsQuery.data?.map((draft) => (
            <div className="pos-recent-draft-row" key={draft.id}>
              <Button
                className="pos-recent-draft-open"
                onClick={() => onOpen(draft.id)}
                size="sm"
                type="button"
                variant="ghost"
              >
                <span>{draft.draftNumber}</span>
                <span>{draft.customer.name || 'No customer'}</span>
              </Button>
              <Button
                aria-label={`Archive ${draft.draftNumber}`}
                onClick={() => setArchiveTarget(draft)}
                size="xs"
                type="button"
                variant="outline"
              >
                Archive
              </Button>
            </div>
          ))}
        </div>
      ) : null}

      <AlertDialog
        onOpenChange={(open) => {
          if (!open && !archiveMutation.isPending) setArchiveTarget(null)
        }}
        open={archiveTarget !== null}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive saved draft?</AlertDialogTitle>
            <AlertDialogDescription>
              {archiveTarget?.draftNumber} will be removed from Recent Drafts. This does not create a sale or change stock or payments.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {archiveMutation.isError ? (
            <p className="pos-error" role="alert">{archiveMutation.error.message}</p>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={archiveMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={archiveMutation.isPending || !archiveTarget}
              onClick={() => {
                if (archiveTarget) archiveMutation.mutate(archiveTarget)
              }}
            >
              {archiveMutation.isPending ? 'Archiving…' : 'Archive Draft'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}
