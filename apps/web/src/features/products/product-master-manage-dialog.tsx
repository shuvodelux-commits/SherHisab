import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
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
import { Input } from '../../components/ui/input'
import { Tabs, TabsList, TabsTrigger } from '../../components/ui/tabs'
import {
  createCategory,
  createUnit,
  listCategories,
  listUnits,
  setCategoryStatus,
  setUnitStatus,
} from './product-api'

interface ProductMasterManageDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

type MasterTab = 'categories' | 'units'

export function ProductMasterManageDialog({
  open,
  onOpenChange,
}: ProductMasterManageDialogProps) {
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<MasterTab>('categories')
  const [categoryName, setCategoryName] = useState('')
  const [unitName, setUnitName] = useState('')
  const [unitSymbol, setUnitSymbol] = useState('')
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
        mutationError instanceof Error
          ? mutationError.message
          : 'Could not create category.',
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
      setError(
        mutationError instanceof Error
          ? mutationError.message
          : 'Could not create unit.',
      )
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
        mutationError instanceof Error
          ? mutationError.message
          : 'Could not update category.',
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
      setError(
        mutationError instanceof Error
          ? mutationError.message
          : 'Could not update unit.',
      )
    },
  })

  function switchTab(nextTab: MasterTab) {
    setTab(nextTab)
    setError('')
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="product-settings-dialog">
        <DialogHeader>
          <DialogTitle>Product Settings</DialogTitle>
          <DialogDescription>
            Manage reusable Categories and Units. Archive old masters instead
            of deleting history.
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
                  {categoriesQuery.error instanceof Error
                    ? categoriesQuery.error.message
                    : 'Could not load categories.'}
                </p>
              ) : (
                <div className="product-settings-list">
                  {(categoriesQuery.data ?? []).map((category) => (
                    <div
                      className="product-settings-row"
                      key={category.id}
                    >
                      <div>
                        <strong>{category.name}</strong>
                        {!category.isActive ? (
                          <Badge className="sher-badge-neutral" variant="outline">Inactive</Badge>
                        ) : null}
                      </div>
                      <Button
                        aria-label={
                          category.isActive
                            ? `Archive category ${category.name}`
                            : `Activate category ${category.name}`
                        }
                        disabled={categoryStatusMutation.isPending}
                        onClick={() => {
                          setError('')
                          categoryStatusMutation.mutate({
                            id: category.id,
                            isActive: !category.isActive,
                          })
                        }}
                        size="sm"
                        variant="ghost"
                      >
                        {category.isActive ? 'Archive' : 'Activate'}
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          ) : (
            <section aria-label="Units" className="product-settings-panel">
              <div className="product-settings-create-row product-settings-unit-create">
                <Input
                  aria-label="Unit name"
                  onChange={(event) =>
                    setUnitName(event.target.value)
                  }
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
                    !unitName.trim() || createUnitMutation.isPending
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
                  {unitsQuery.error instanceof Error
                    ? unitsQuery.error.message
                    : 'Could not load units.'}
                </p>
              ) : (
                <div className="product-settings-list">
                  {(unitsQuery.data ?? []).map((unit) => (
                    <div
                      className="product-settings-row"
                      key={unit.id}
                    >
                      <div>
                        <strong>{unit.name}</strong>
                        {unit.symbol ? (
                          <span className="product-settings-symbol">
                            {unit.symbol}
                          </span>
                        ) : null}
                        {!unit.isActive ? (
                          <Badge className="sher-badge-neutral" variant="outline">Inactive</Badge>
                        ) : null}
                      </div>
                      <Button
                        aria-label={
                          unit.isActive
                            ? `Archive unit ${unit.name}`
                            : `Activate unit ${unit.name}`
                        }
                        disabled={unitStatusMutation.isPending}
                        onClick={() => {
                          setError('')
                          unitStatusMutation.mutate({
                            id: unit.id,
                            isActive: !unit.isActive,
                          })
                        }}
                        size="sm"
                        variant="ghost"
                      >
                        {unit.isActive ? 'Archive' : 'Activate'}
                      </Button>
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
  )
}
