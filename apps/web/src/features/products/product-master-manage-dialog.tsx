import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { MoreHorizontal } from 'lucide-react'
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
import { Badge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../../components/ui/dropdown-menu'
import { Input } from '../../components/ui/input'
import { Tabs, TabsList, TabsTrigger } from '../../components/ui/tabs'
import {
  createCategory,
  createUnit,
  deleteCategory,
  deleteUnit,
  listCategories,
  listUnits,
  setCategoryStatus,
  setUnitStatus,
  updateCategory,
  updateUnit,
} from './product-api'

interface ProductMasterManageDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

type MasterTab = 'categories' | 'units'
type DeleteTarget = {
  kind: 'category' | 'unit'
  id: string
  name: string
}

function mutationMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

export function ProductMasterManageDialog({
  open,
  onOpenChange,
}: ProductMasterManageDialogProps) {
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<MasterTab>('categories')
  const [categoryName, setCategoryName] = useState('')
  const [unitName, setUnitName] = useState('')
  const [unitSymbol, setUnitSymbol] = useState('')
  const [editingCategory, setEditingCategory] = useState<{
    id: string
    name: string
  } | null>(null)
  const [editingUnit, setEditingUnit] = useState<{
    id: string
    name: string
    symbol: string
  } | null>(null)
  const [pendingDelete, setPendingDelete] =
    useState<DeleteTarget | null>(null)
  const [error, setError] = useState('')

  const categoriesQuery = useQuery({
    queryKey: ['product-categories', 'all'],
    queryFn: () => listCategories(true),
    enabled: open,
  })

  const unitsQuery = useQuery({
    queryKey: ['product-units', 'all'],
    queryFn: () => listUnits(true),
    enabled: open,
  })

  const createCategoryMutation = useMutation({
    mutationFn: () => createCategory(categoryName),
    onSuccess: async () => {
      setError('')
      setCategoryName('')
      await queryClient.invalidateQueries({
        queryKey: ['product-categories'],
      })
    },
    onError: (mutationError) => {
      setError(
        mutationMessage(mutationError, 'Could not create category.'),
      )
    },
  })

  const createUnitMutation = useMutation({
    mutationFn: () =>
      createUnit({
        name: unitName,
        symbol: unitSymbol || null,
      }),
    onSuccess: async () => {
      setError('')
      setUnitName('')
      setUnitSymbol('')
      await queryClient.invalidateQueries({
        queryKey: ['product-units'],
      })
    },
    onError: (mutationError) => {
      setError(mutationMessage(mutationError, 'Could not create unit.'))
    },
  })

  const categoryStatusMutation = useMutation({
    mutationFn: ({
      id,
      isActive,
    }: {
      id: string
      isActive: boolean
    }) => setCategoryStatus(id, isActive),
    onSuccess: async () => {
      setError('')
      await queryClient.invalidateQueries({
        queryKey: ['product-categories'],
      })
    },
    onError: (mutationError) => {
      setError(
        mutationMessage(mutationError, 'Could not update category.'),
      )
    },
  })

  const unitStatusMutation = useMutation({
    mutationFn: ({
      id,
      isActive,
    }: {
      id: string
      isActive: boolean
    }) => setUnitStatus(id, isActive),
    onSuccess: async () => {
      setError('')
      await queryClient.invalidateQueries({
        queryKey: ['product-units'],
      })
    },
    onError: (mutationError) => {
      setError(mutationMessage(mutationError, 'Could not update unit.'))
    },
  })

  const updateCategoryMutation = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      updateCategory(id, name),
    onSuccess: async () => {
      setError('')
      setEditingCategory(null)
      await queryClient.invalidateQueries({
        queryKey: ['product-categories'],
      })
    },
    onError: (mutationError) => {
      setError(mutationMessage(mutationError, 'Could not edit category.'))
    },
  })

  const updateUnitMutation = useMutation({
    mutationFn: ({
      id,
      name,
      symbol,
    }: {
      id: string
      name: string
      symbol: string
    }) =>
      updateUnit(id, {
        name,
        symbol: symbol || null,
      }),
    onSuccess: async () => {
      setError('')
      setEditingUnit(null)
      await queryClient.invalidateQueries({
        queryKey: ['product-units'],
      })
    },
    onError: (mutationError) => {
      setError(mutationMessage(mutationError, 'Could not edit unit.'))
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (target: DeleteTarget) => {
      if (target.kind === 'category') {
        await deleteCategory(target.id)
      } else {
        await deleteUnit(target.id)
      }

      return target
    },
    onSuccess: async (target) => {
      setError('')
      setPendingDelete(null)
      await queryClient.invalidateQueries({
        queryKey: [
          target.kind === 'category'
            ? 'product-categories'
            : 'product-units',
        ],
      })
    },
    onError: (mutationError) => {
      setError(
        mutationMessage(
          mutationError,
          'Could not delete this Product master.',
        ),
      )
    },
  })

  function switchTab(nextTab: MasterTab) {
    setTab(nextTab)
    setError('')
    setEditingCategory(null)
    setEditingUnit(null)
  }

  return (
    <>
      <Dialog onOpenChange={onOpenChange} open={open}>
        <DialogContent className="product-settings-dialog">
          <DialogHeader>
            <DialogTitle>Product Settings</DialogTitle>
            <DialogDescription>
              Manage reusable Categories and Units. Archive masters that
              are already used by Products.
            </DialogDescription>
          </DialogHeader>

          <div className="product-settings-body">
            <Tabs
              onValueChange={(value) => switchTab(value as MasterTab)}
              value={tab}
            >
              <TabsList
                aria-label="Product settings sections"
                className="product-settings-tabs"
                variant="line"
              >
                <TabsTrigger
                  onClick={() => switchTab('categories')}
                  value="categories"
                >
                  Categories
                </TabsTrigger>
                <TabsTrigger
                  onClick={() => switchTab('units')}
                  value="units"
                >
                  Units
                </TabsTrigger>
              </TabsList>
            </Tabs>

            {error ? (
              <div className="product-form-error" role="alert">
                {error}
              </div>
            ) : null}

            {tab === 'categories' ? (
              <section
                aria-label="Categories"
                className="product-settings-panel"
              >
                <div className="product-settings-create-row">
                  <Input
                    aria-label="Category name"
                    onChange={(event) =>
                      setCategoryName(event.target.value)
                    }
                    placeholder="Category name"
                    value={categoryName}
                  />
                  <Button
                    disabled={
                      !categoryName.trim() ||
                      createCategoryMutation.isPending
                    }
                    onClick={() => {
                      setError('')
                      createCategoryMutation.mutate()
                    }}
                    variant="default"
                  >
                    Add Category
                  </Button>
                </div>

                {categoriesQuery.isPending ? (
                  <p className="product-settings-muted">
                    Loading categories...
                  </p>
                ) : categoriesQuery.isError ? (
                  <p className="product-form-error" role="alert">
                    {mutationMessage(
                      categoriesQuery.error,
                      'Could not load categories.',
                    )}
                  </p>
                ) : (
                  <div className="product-settings-list">
                    {(categoriesQuery.data ?? []).map((category) => (
                      <div
                        className="product-settings-row"
                        key={category.id}
                      >
                        <div className="product-settings-row-main">
                          {editingCategory?.id === category.id ? (
                            <div className="product-settings-edit-fields">
                              <Input
                                aria-label="Edit category name"
                                onChange={(event) =>
                                  setEditingCategory((current) =>
                                    current
                                      ? {
                                          ...current,
                                          name: event.target.value,
                                        }
                                      : current,
                                  )
                                }
                                value={editingCategory.name}
                              />
                              <Button
                                disabled={
                                  !editingCategory.name.trim() ||
                                  updateCategoryMutation.isPending
                                }
                                onClick={() => {
                                  setError('')
                                  updateCategoryMutation.mutate(
                                    editingCategory,
                                  )
                                }}
                                size="sm"
                              >
                                Save Category
                              </Button>
                              <Button
                                onClick={() => setEditingCategory(null)}
                                size="sm"
                                variant="ghost"
                              >
                                Cancel
                              </Button>
                            </div>
                          ) : (
                            <>
                              <strong>{category.name}</strong>
                              {!category.isActive ? (
                                <Badge
                                  className="sher-badge-neutral"
                                  variant="outline"
                                >
                                  Inactive
                                </Badge>
                              ) : null}
                            </>
                          )}
                        </div>

                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              aria-label={`Actions for category ${category.name}`}
                              className="product-settings-actions-trigger"
                              size="icon-sm"
                              variant="ghost"
                            >
                              <MoreHorizontal
                                aria-hidden="true"
                                size={16}
                              />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onSelect={() => {
                                setError('')
                                setEditingCategory({
                                  id: category.id,
                                  name: category.name,
                                })
                              }}
                            >
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onSelect={() => {
                                setError('')
                                categoryStatusMutation.mutate({
                                  id: category.id,
                                  isActive: !category.isActive,
                                })
                              }}
                            >
                              {category.isActive
                                ? 'Archive'
                                : 'Activate'}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              data-danger="true"
                              onSelect={() =>
                                setPendingDelete({
                                  kind: 'category',
                                  id: category.id,
                                  name: category.name,
                                })
                              }
                            >
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            ) : (
              <section
                aria-label="Units"
                className="product-settings-panel"
              >
                <div className="product-settings-create-row product-settings-unit-create">
                  <Input
                    aria-label="Unit name"
                    onChange={(event) => setUnitName(event.target.value)}
                    placeholder="Unit name"
                    value={unitName}
                  />
                  <Input
                    aria-label="Unit symbol"
                    onChange={(event) =>
                      setUnitSymbol(event.target.value)
                    }
                    placeholder="Symbol (optional)"
                    value={unitSymbol}
                  />
                  <Button
                    disabled={
                      !unitName.trim() ||
                      createUnitMutation.isPending
                    }
                    onClick={() => {
                      setError('')
                      createUnitMutation.mutate()
                    }}
                    variant="default"
                  >
                    Add Unit
                  </Button>
                </div>

                {unitsQuery.isPending ? (
                  <p className="product-settings-muted">
                    Loading units...
                  </p>
                ) : unitsQuery.isError ? (
                  <p className="product-form-error" role="alert">
                    {mutationMessage(
                      unitsQuery.error,
                      'Could not load units.',
                    )}
                  </p>
                ) : (
                  <div className="product-settings-list">
                    {(unitsQuery.data ?? []).map((unit) => (
                      <div
                        className="product-settings-row"
                        key={unit.id}
                      >
                        <div className="product-settings-row-main">
                          {editingUnit?.id === unit.id ? (
                            <div className="product-settings-edit-fields product-settings-edit-unit">
                              <Input
                                aria-label="Edit unit name"
                                onChange={(event) =>
                                  setEditingUnit((current) =>
                                    current
                                      ? {
                                          ...current,
                                          name: event.target.value,
                                        }
                                      : current,
                                  )
                                }
                                value={editingUnit.name}
                              />
                              <Input
                                aria-label="Edit unit symbol"
                                onChange={(event) =>
                                  setEditingUnit((current) =>
                                    current
                                      ? {
                                          ...current,
                                          symbol: event.target.value,
                                        }
                                      : current,
                                  )
                                }
                                value={editingUnit.symbol}
                              />
                              <Button
                                disabled={
                                  !editingUnit.name.trim() ||
                                  updateUnitMutation.isPending
                                }
                                onClick={() => {
                                  setError('')
                                  updateUnitMutation.mutate(editingUnit)
                                }}
                                size="sm"
                              >
                                Save Unit
                              </Button>
                              <Button
                                onClick={() => setEditingUnit(null)}
                                size="sm"
                                variant="ghost"
                              >
                                Cancel
                              </Button>
                            </div>
                          ) : (
                            <>
                              <strong>{unit.name}</strong>
                              {unit.symbol ? (
                                <span className="product-settings-symbol">
                                  {unit.symbol}
                                </span>
                              ) : null}
                              {!unit.isActive ? (
                                <Badge
                                  className="sher-badge-neutral"
                                  variant="outline"
                                >
                                  Inactive
                                </Badge>
                              ) : null}
                            </>
                          )}
                        </div>

                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              aria-label={`Actions for unit ${unit.name}`}
                              className="product-settings-actions-trigger"
                              size="icon-sm"
                              variant="ghost"
                            >
                              <MoreHorizontal
                                aria-hidden="true"
                                size={16}
                              />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onSelect={() => {
                                setError('')
                                setEditingUnit({
                                  id: unit.id,
                                  name: unit.name,
                                  symbol: unit.symbol ?? '',
                                })
                              }}
                            >
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onSelect={() => {
                                setError('')
                                unitStatusMutation.mutate({
                                  id: unit.id,
                                  isActive: !unit.isActive,
                                })
                              }}
                            >
                              {unit.isActive ? 'Archive' : 'Activate'}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              data-danger="true"
                              onSelect={() =>
                                setPendingDelete({
                                  kind: 'unit',
                                  id: unit.id,
                                  name: unit.name,
                                })
                              }
                            >
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}
          </div>

          <DialogFooter>
            <Button
              onClick={() => onOpenChange(false)}
              variant="secondary"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setPendingDelete(null)
          }
        }}
        open={Boolean(pendingDelete)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingDelete
                ? `Delete ${pendingDelete.kind} ${pendingDelete.name}?`
                : 'Delete Product master?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes an unused master. If it is already
              used by Products, SherHisab will block deletion and you can
              archive it instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteMutation.isPending}
              onClick={() => {
                if (pendingDelete) {
                  setError('')
                  deleteMutation.mutate(pendingDelete)
                }
              }}
            >
              {pendingDelete?.kind === 'unit'
                ? 'Delete Unit'
                : 'Delete Category'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
