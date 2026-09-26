import type { KeyboardEvent } from 'react'
import { Search, X } from 'lucide-react'
import { BilingualLabel } from '../../../components/ui/bilingual-label'
import { Button } from '../../../components/ui/button'
import { Input } from '../../../components/ui/input'
import { formatNumber } from '../../../lib/format-number'
import { formatPaisaToTaka } from '../../../lib/money'
import type { PosProductSearchDto, SalesTemplateLineInputDto, SalesTemplateLoadedDto } from '../pos-types'
import { RecentDrafts } from './recent-drafts'
import { TemplatePicker } from './template-picker'

interface ProductCatalogProps {
  activeResultIndex: number
  errorMessage: string
  isOpen: boolean
  isPending: boolean
  onAdd: (product: PosProductSearchDto) => void
  onOpenDraft: (draftId: string) => void
  onLoadTemplate: (template: SalesTemplateLoadedDto) => void
  canViewTemplates: boolean
  canManageTemplates: boolean
  canOverrideSellingPrice: boolean
  cartHasLines: boolean
  currentTemplateLines: SalesTemplateLineInputDto[]
  onArchiveDraft: (draftId: string) => void
  onClear: () => void
  onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void
  onSearchChange: (value: string) => void
  products: PosProductSearchDto[]
  search: string
}

export function ProductCatalog({
  activeResultIndex,
  errorMessage,
  isOpen,
  isPending,
  onAdd,
  onOpenDraft,
  onLoadTemplate,
  canViewTemplates,
  canManageTemplates,
  canOverrideSellingPrice,
  cartHasLines,
  currentTemplateLines,
  onArchiveDraft,
  onClear,
  onKeyDown,
  onSearchChange,
  products,
  search,
}: ProductCatalogProps) {
  const normalizedSearch = search.trim()

  return (
    <section className="pos-panel pos-catalog-panel">
      <div className="pos-panel-heading">
        <BilingualLabel en="Add Product" bn="পণ্য যোগ করুন" />
      </div>

      <div className="pos-saved-carts">
        <RecentDrafts onOpen={onOpenDraft} onArchived={onArchiveDraft} />
        {canViewTemplates ? (
          <TemplatePicker
            canManage={canManageTemplates}
            canOverrideSellingPrice={canOverrideSellingPrice}
            cartHasLines={cartHasLines}
            currentLines={currentTemplateLines}
            onLoad={onLoadTemplate}
          />
        ) : null}
      </div>

      <div className="pos-search-wrap">
        <Search aria-hidden="true" />
        <Input
          aria-label="Search products"
          onChange={(event) => onSearchChange(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Search name, barcode, SKU, variant, brand or category"
          value={search}
        />
        {search ? (
          <Button
            aria-label="Clear product search"
            onClick={onClear}
            size="icon-xs"
            type="button"
            variant="ghost"
          >
            <X aria-hidden="true" />
          </Button>
        ) : null}
      </div>

      <div className="pos-product-list">
        {!normalizedSearch || !isOpen ? (
          <p className="pos-muted">Search to find Products.</p>
        ) : isPending ? (
          <p className="pos-muted">Searching products…</p>
        ) : errorMessage ? (
          <p className="pos-error" role="alert">
            {errorMessage}
          </p>
        ) : products.length === 0 ? (
          <p className="pos-muted">No matching Products.</p>
        ) : (
          products.map((product, index) => (
            <Button
              aria-label={`Add ${product.productName}`}
              className="pos-product-card"
              data-active={
                activeResultIndex === index ? 'true' : undefined
              }
              key={product.variantId}
              onClick={() => onAdd(product)}
              variant="outline"
            >
              <span className="pos-product-card-name">
                {product.productName}
              </span>
              <span className="pos-product-card-meta">
                {product.variantName
                  ? `${product.categoryName ?? 'Uncategorized'} · ${product.variantName}`
                  : product.categoryName ?? 'Uncategorized'}
              </span>
              <span className="pos-product-card-price">
                ৳
                {formatPaisaToTaka(
                  product.currentSellingPricePaisa,
                )}
              </span>
              <span className="pos-product-card-stock">
                {formatNumber(product.availableOwnBaseQty, {
                  maximumFractionDigits: 8,
                })}{' '}
                {product.unitSymbol ?? product.unitName} in stock
              </span>
            </Button>
          ))
        )}
      </div>
    </section>
  )
}
