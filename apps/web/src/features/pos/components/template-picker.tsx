import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '../../../components/ui/button'
import { Input } from '../../../components/ui/input'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '../../../components/ui/alert-dialog'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '../../../components/ui/dialog'
import {
  archiveSalesTemplate, createSalesTemplate, duplicateSalesTemplate,
  getSalesTemplate, listSalesTemplates, searchPosProducts, updateSalesTemplate,
} from '../pos-api'
import type {
  SalesTemplateLineInputDto, SalesTemplateLoadedDto, SalesTemplateSummaryDto,
} from '../pos-types'

interface TemplatePickerProps {
  canManage: boolean
  canOverrideSellingPrice?: boolean
  cartHasLines: boolean
  currentLines: SalesTemplateLineInputDto[]
  onLoad: (template: SalesTemplateLoadedDto) => void
}

interface Editor {
  id: string | null
  version: number | null
  name: string
  lines: SalesTemplateLineInputDto[]
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Template request failed.'
}

function quantityLabel(line: SalesTemplateLineInputDto): string {
  if (line.quantityInput.kind === 'SIMPLE') return line.quantityInput.baseQty
  if (line.quantityInput.kind === 'FIXED_UNIT') return line.quantityInput.quantity
  return Object.entries(line.quantityInput.components)
    .map(([key, value]) => `${key}: ${value}`).join(', ')
}

function cleanLines(lines: SalesTemplateLineInputDto[]): SalesTemplateLineInputDto[] {
  return lines.map((line) => ({
    variantId: line.variantId,
    quantityInput: line.quantityInput,
    pricingStrategy: line.pricingStrategy === 'FIXED_MANUAL'
      ? 'FIXED_MANUAL' : 'CURRENT_AUTO',
    ...(line.pricingStrategy === 'FIXED_MANUAL'
      ? { manualUnitSellingPricePaisa: line.manualUnitSellingPricePaisa ?? '0' }
      : {}),
  }))
}

export function TemplatePicker({
  canManage, canOverrideSellingPrice = false, cartHasLines,
  currentLines, onLoad,
}: TemplatePickerProps) {
  const queryClient = useQueryClient()
  const [expanded, setExpanded] = useState(false)
  const [loadTarget, setLoadTarget] = useState<SalesTemplateSummaryDto | null>(null)
  const [archiveTarget, setArchiveTarget] = useState<SalesTemplateSummaryDto | null>(null)
  const [editor, setEditor] = useState<Editor | null>(null)
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const listQuery = useQuery({
    queryKey: ['sales-templates'],
    queryFn: listSalesTemplates,
    enabled: expanded,
  })
  const productQuery = useQuery({
    queryKey: ['template-products', search.trim()],
    queryFn: () => searchPosProducts(search.trim()),
    enabled: editor !== null && search.trim().length > 0,
  })

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ['sales-templates'] })
  }

  async function load(id: string) {
    setBusy(true)
    setError('')
    try {
      const template = await getSalesTemplate(id)
      onLoad(template)
      setLoadTarget(null)
      setExpanded(false)
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  async function choose(template: SalesTemplateSummaryDto) {
    if (cartHasLines) {
      setLoadTarget(template)
    } else {
      await load(template.id)
    }
  }

  async function edit(template: SalesTemplateSummaryDto) {
    setBusy(true)
    setError('')
    try {
      const loaded = await getSalesTemplate(template.id)
      setEditor({
        id: loaded.id, version: loaded.version, name: loaded.name,
        lines: loaded.lines.map((line) => ({
          variantId: line.variantId,
          quantityInput: line.quantityInput,
          pricingStrategy: line.pricingStrategy,
          ...(line.manualUnitSellingPricePaisa === null ? {}
            : { manualUnitSellingPricePaisa: line.manualUnitSellingPricePaisa }),
        })),
      })
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  function newTemplate(fromCart: boolean) {
    setError('')
    setSearch('')
    setEditor({
      id: null, version: null, name: '',
      lines: fromCart ? cleanLines(currentLines) : [],
    })
  }

  async function save() {
    if (!editor) return
    setBusy(true)
    setError('')
    try {
      const lines = cleanLines(editor.lines)
      if (editor.id && editor.version !== null) {
        await updateSalesTemplate(editor.id, {
          expectedVersion: editor.version, name: editor.name, lines,
        })
      } else {
        await createSalesTemplate({ name: editor.name, lines })
      }
      setEditor(null)
      await refresh()
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  async function duplicate() {
    if (!editor?.id) return
    setBusy(true)
    setError('')
    try {
      await duplicateSalesTemplate(editor.id, `${editor.name} copy`)
      setEditor(null)
      await refresh()
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  async function archive() {
    if (!archiveTarget) return
    setBusy(true)
    setError('')
    try {
      await archiveSalesTemplate(archiveTarget.id, archiveTarget.version)
      if (editor?.id === archiveTarget.id) setEditor(null)
      setArchiveTarget(null)
      await refresh()
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  function updateLine(index: number, line: SalesTemplateLineInputDto) {
    setEditor((current) => current
      ? { ...current, lines: current.lines.map((value, position) =>
          position === index ? line : value) }
      : current)
  }

  return (
    <section className="pos-template-picker" aria-label="Reusable templates">
      <Button
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
        size="sm" type="button" variant="outline"
      >
        Templates
      </Button>
      {expanded ? (
        <div className="pos-template-list">
          {canManage ? (
            <div className="pos-template-actions">
              <Button onClick={() => newTemplate(false)} size="xs" type="button" variant="outline">
                New Template
              </Button>
              <Button
                disabled={currentLines.length === 0}
                onClick={() => newTemplate(true)}
                size="xs" type="button" variant="outline"
              >
                Save Cart as Template
              </Button>
            </div>
          ) : null}
          {listQuery.isPending ? <p className="pos-muted">Loading templates…</p> : null}
          {listQuery.isError ? <p className="pos-error" role="alert">{listQuery.error.message}</p> : null}
          {listQuery.data?.length === 0 ? <p className="pos-muted">No saved templates.</p> : null}
          {listQuery.data?.map((template) => (
            <div className="pos-template-row" key={template.id}>
              <Button
                disabled={busy} onClick={() => void choose(template)}
                size="sm" type="button" variant="ghost"
              >
                {template.name} · {template.lineCount} items
              </Button>
              {canManage ? (
                <Button
                  aria-label={`Manage ${template.name}`}
                  disabled={busy} onClick={() => void edit(template)}
                  size="xs" type="button" variant="outline"
                >
                  Manage
                </Button>
              ) : null}
            </div>
          ))}
          {error && !editor ? <p className="pos-error" role="alert">{error}</p> : null}
        </div>
      ) : null}

      <AlertDialog open={loadTarget !== null} onOpenChange={(open) => {
        if (!open && !busy) setLoadTarget(null)
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Load Template?</AlertDialogTitle>
            <AlertDialogDescription>
              This will replace the current cart with a fresh copy of {loadTarget?.name}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {error ? <p className="pos-error" role="alert">{error}</p> : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={busy || !loadTarget}
              onClick={() => { if (loadTarget) void load(loadTarget.id) }}>
              Load Template
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={editor !== null} onOpenChange={(open) => {
        if (!open && !busy) setEditor(null)
      }}>
        <DialogContent className="pos-template-dialog">
          <DialogHeader>
            <DialogTitle>{editor?.id ? 'Manage Template' : 'New Template'}</DialogTitle>
            <DialogDescription>
              Save reusable Product and quantity defaults. Prices and stock refresh when loaded.
            </DialogDescription>
          </DialogHeader>
          {editor ? (
            <div className="pos-template-editor">
              <Input aria-label="Template name" maxLength={120}
                onChange={(event) => setEditor({ ...editor, name: event.target.value })}
                placeholder="Template name" value={editor.name} />
              <div className="pos-template-editor-lines">
                {editor.lines.map((line, index) => (
                  <div className="pos-template-edit-line" key={line.variantId}>
                    <span>{line.variantId}</span>
                    {line.quantityInput.kind === 'COMPONENTS' ? (
                      <span>{quantityLabel(line)}</span>
                    ) : (
                      <Input aria-label={`Quantity ${index + 1}`}
                        onChange={(event) => updateLine(index, {
                          ...line,
                          quantityInput: line.quantityInput.kind === 'FIXED_UNIT'
                            ? { kind: 'FIXED_UNIT', unitId: line.quantityInput.unitId,
                                quantity: event.target.value }
                            : { kind: 'SIMPLE', baseQty: event.target.value },
                        })}
                        value={quantityLabel(line)} />
                    )}
                    {canOverrideSellingPrice ? (
                      <label>
                        <input checked={line.pricingStrategy === 'FIXED_MANUAL'}
                          onChange={(event) => updateLine(index, {
                            ...line,
                            pricingStrategy: event.target.checked ? 'FIXED_MANUAL' : 'CURRENT_AUTO',
                            manualUnitSellingPricePaisa: event.target.checked
                              ? line.manualUnitSellingPricePaisa ?? '0' : null,
                          })}
                          type="checkbox" />
                        Fixed price
                      </label>
                    ) : null}
                    {line.pricingStrategy === 'FIXED_MANUAL' && canOverrideSellingPrice ? (
                      <Input aria-label={`Fixed price paisa ${index + 1}`}
                        onChange={(event) => updateLine(index, {
                          ...line, manualUnitSellingPricePaisa: event.target.value,
                        })}
                        value={line.manualUnitSellingPricePaisa ?? ''} />
                    ) : null}
                    <Button aria-label={`Remove line ${index + 1}`}
                      onClick={() => setEditor({ ...editor,
                        lines: editor.lines.filter((_, position) => position !== index),
                      })}
                      size="xs" type="button" variant="ghost">Remove</Button>
                  </div>
                ))}
              </div>
              <Input aria-label="Find Product for Template"
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Find Product to add" value={search} />
              {productQuery.data && search.trim() ? (
                <div className="pos-template-product-results">
                  {productQuery.data.filter((product) =>
                    !editor.lines.some((line) => line.variantId === product.variantId),
                  ).map((product) => (
                    <Button key={product.variantId}
                      onClick={() => { setEditor({ ...editor, lines: [
                        ...editor.lines, { variantId: product.variantId,
                          quantityInput: { kind: 'SIMPLE', baseQty: '1' },
                          pricingStrategy: 'CURRENT_AUTO' },
                      ] }); setSearch('') }}
                      size="sm" type="button" variant="ghost">
                      Add {product.productName}{product.variantName ? ` · ${product.variantName}` : ''}
                    </Button>
                  ))}
                </div>
              ) : null}
              {cartHasLines && editor.id ? (
                <Button onClick={() => setEditor({ ...editor, lines: cleanLines(currentLines) })}
                  size="sm" type="button" variant="outline">
                  Replace lines with current cart
                </Button>
              ) : null}
              {error ? <p className="pos-error" role="alert">{error}</p> : null}
            </div>
          ) : null}
          <DialogFooter>
            {editor?.id ? (
              <>
                <Button disabled={busy} onClick={() => void duplicate()}
                  type="button" variant="outline">Duplicate</Button>
                <Button disabled={busy} onClick={() => setArchiveTarget({
                  id: editor.id!, name: editor.name, version: editor.version!,
                  lineCount: editor.lines.length, createdAt: '', updatedAt: '',
                })} type="button" variant="outline">Archive</Button>
              </>
            ) : null}
            <Button disabled={busy} onClick={() => setEditor(null)}
              type="button" variant="ghost">Cancel</Button>
            <Button disabled={busy || !editor?.name.trim()}
              onClick={() => void save()} type="button">
              {editor?.id ? 'Save Changes' : 'Create Template'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={archiveTarget !== null} onOpenChange={(open) => {
        if (!open && !busy) setArchiveTarget(null)
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive Template?</AlertDialogTitle>
            <AlertDialogDescription>
              {archiveTarget?.name} will be removed from the active template list.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {error ? <p className="pos-error" role="alert">{error}</p> : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={busy} onClick={() => void archive()}>
              Archive Template
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}
