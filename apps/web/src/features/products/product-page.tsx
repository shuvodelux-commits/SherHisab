import { useMemo, useState } from 'react'
import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { Plus, Settings2 } from 'lucide-react'
import { useLanguageMode } from '../../app/language'
import { Button } from '../../components/ui/button'
import { DataTable } from '../../components/ui/data-table'
import { Input } from '../../components/ui/input'
import {
  getProduct,
  listCategories,
  listProducts,
  setProductStatus,
} from './product-api'
import { createProductColumns } from './product-columns'
import { ProductFormDialog } from './product-form-dialog'
import { ProductMasterManageDialog } from './product-master-manage-dialog'
import type { ProductStatusFilter } from './product-types'

const PAGE_SIZE = 50

export function ProductPage() {
  const { mode } = useLanguageMode()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [brand, setBrand] = useState('')
  const [status, setStatus] = useState<ProductStatusFilter>('active')
  const [offset, setOffset] = useState(0)
  const [formOpen, setFormOpen] = useState(false)
  const [formMode, setFormMode] = useState<'create' | 'edit'>('create')
  const [editProductId, setEditProductId] = useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)

  const filters = {
    search,
    categoryId,
    brand,
    status,
    limit: PAGE_SIZE,
    offset,
  }

  const categoriesQuery = useQuery({
    queryKey: ['product-categories', 'active'],
    queryFn: () => listCategories(false),
  })

  const productsQuery = useQuery({
    queryKey: ['products', filters],
    queryFn: () => listProducts(filters),
  })

  const editProductQuery = useQuery({
    queryKey: ['product', editProductId],
    queryFn: () => getProduct(editProductId!),
    enabled: formOpen && formMode === 'edit' && Boolean(editProductId),
  })

  const statusMutation = useMutation({
    mutationFn: ({
      id,
      isActive,
    }: {
      id: string
      isActive: boolean
    }) => setProductStatus(id, isActive),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['products'] })
    },
  })

  const columns = useMemo(
    () =>
      createProductColumns({
        onSetStatus: (product, isActive) => {
          statusMutation.mutate({ id: product.id, isActive })
        },
        onEdit: (product) => {
          setEditProductId(product.id)
          setFormMode('edit')
          setFormOpen(true)
        },
      }),
    [statusMutation],
  )

  const total = productsQuery.data?.total ?? 0
  const items = productsQuery.data?.items ?? []
  const limit = productsQuery.data?.limit ?? PAGE_SIZE
  const currentOffset = productsQuery.data?.offset ?? offset
  const rangeStart = total === 0 ? 0 : currentOffset + 1
  const rangeEnd = Math.min(currentOffset + limit, total)
  const hasFilters =
    search.trim() !== '' ||
    categoryId !== '' ||
    brand.trim() !== '' ||
    status !== 'active'

  function resetPage() {
    setOffset(0)
  }

  return (
    <main className="products-page">
      <header className="products-page-header">
        {mode === 'bn' ? (
          <h1 lang="bn">পণ্য ও স্টক</h1>
        ) : (
          <h1>Products</h1>
        )}
        {mode === 'en-bn' ? <p lang="bn">পণ্য ও স্টক</p> : null}
      </header>

      <div className="products-toolbar">
        <Input
          aria-label="Search products"
          className="products-toolbar-search"
          onChange={(event) => {
            setSearch(event.target.value)
            resetPage()
          }}
          placeholder="Search products..."
          value={search}
        />

        <select
          aria-label="Category filter"
          className="product-filter-select"
          onChange={(event) => {
            setCategoryId(event.target.value)
            resetPage()
          }}
          value={categoryId}
        >
          <option value="">All categories</option>
          {(categoriesQuery.data ?? []).map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>

        <Input
          aria-label="Brand filter"
          onChange={(event) => {
            setBrand(event.target.value)
            resetPage()
          }}
          placeholder="Brand"
          value={brand}
        />

        <select
          aria-label="Status filter"
          className="product-filter-select"
          onChange={(event) => {
            setStatus(event.target.value as ProductStatusFilter)
            resetPage()
          }}
          value={status}
        >
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="all">All status</option>
        </select>

        <span className="products-toolbar-secondary">
          <Button
            onClick={() => setSettingsOpen(true)}
            variant="secondary"
          >
            <Settings2 aria-hidden="true" size={14} />
            {' '}Product Settings
          </Button>
        </span>

        <span className="products-toolbar-primary">
          <Button
            onClick={() => {
              setEditProductId(null)
              setFormMode('create')
              setFormOpen(true)
            }}
            variant="primary"
          >
            <Plus aria-hidden="true" size={14} />
            {' '}Add Product
          </Button>
        </span>
      </div>

      {productsQuery.isPending ? (
        <div className="products-loading">Loading products...</div>
      ) : productsQuery.isError ? (
        <section className="products-state" role="alert">
          <div className="products-state-inner">
            <strong>Could not load products.</strong>
            <p>
              {productsQuery.error instanceof Error
                ? productsQuery.error.message
                : 'Please try again.'}
            </p>
            <Button
              onClick={() => productsQuery.refetch()}
              variant="secondary"
            >
              Retry
            </Button>
          </div>
        </section>
      ) : items.length === 0 ? (
        <section className="products-state">
          <div className="products-state-inner">
            <strong>
              {hasFilters ? 'No results found.' : 'No products yet.'}
            </strong>
            <p>
              {hasFilters
                ? 'Try changing the search or filters.'
                : 'Add your first product to start tracking stock.'}
            </p>
          </div>
        </section>
      ) : (
        <>
          <div className="products-table">
            <DataTable columns={columns} data={items} />
          </div>

          <div className="products-pagination">
            <span>
              Showing {rangeStart}–{rangeEnd} of {total}
            </span>
            <span className="products-pagination-spacer" />
            <Button
              disabled={currentOffset <= 0}
              onClick={() =>
                setOffset(Math.max(0, currentOffset - PAGE_SIZE))
              }
              size="small"
              variant="secondary"
            >
              Previous
            </Button>
            <Button
              disabled={currentOffset + limit >= total}
              onClick={() => setOffset(currentOffset + PAGE_SIZE)}
              size="small"
              variant="secondary"
            >
              Next
            </Button>
          </div>
        </>
      )}

      {formOpen && (formMode === 'create' || editProductQuery.data) ? (
        <ProductFormDialog
          mode={formMode}
          onOpenChange={(nextOpen) => {
            setFormOpen(nextOpen)
            if (!nextOpen) {
              setEditProductId(null)
            }
          }}
          open={formOpen}
          product={editProductQuery.data}
        />
      ) : null}

      {formOpen && formMode === 'edit' && editProductQuery.isError ? (
        <div className="products-inline-error" role="alert">
          {editProductQuery.error instanceof Error
            ? editProductQuery.error.message
            : 'Could not load Product details.'}
          <Button
            onClick={() => editProductQuery.refetch()}
            size="small"
            variant="secondary"
          >
            Retry
          </Button>
        </div>
      ) : null}

      <ProductMasterManageDialog
        onOpenChange={setSettingsOpen}
        open={settingsOpen}
      />
    </main>
  )
}
