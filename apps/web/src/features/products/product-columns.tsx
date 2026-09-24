import type { ColumnDef } from '@tanstack/react-table'
import { MoreHorizontal } from 'lucide-react'
import { formatNumber } from '../../lib/format-number'
import { formatPaisaToTaka } from '../../lib/money'
import { Badge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../../components/ui/dropdown-menu'
import type { ProductListItemDto } from './product-types'

interface ProductColumnsOptions {
  onSetStatus: (product: ProductListItemDto, isActive: boolean) => void
  onEdit: (product: ProductListItemDto) => void
  onAdjustStock: (product: ProductListItemDto) => void
  onViewLots: (product: ProductListItemDto) => void
}

function money(value: string) {
  return `৳${formatPaisaToTaka(value)}`
}

export function createProductColumns({
  onSetStatus,
  onEdit,
  onAdjustStock,
  onViewLots,
}: ProductColumnsOptions): ColumnDef<ProductListItemDto, unknown>[] {
  return [
    {
      accessorKey: 'name',
      header: 'Product',
      enableHiding: false,
      cell: ({ row }) => {
        const product = row.original
        return (
          <span className="product-name-cell">
            <strong>{product.name}</strong>
            {product.variantsEnabled && product.variantCount > 1 ? (
              <span className="product-variant-meta">
                {product.variantCount} variants
              </span>
            ) : null}
          </span>
        )
      },
    },
    {
      id: 'category',
      accessorFn: (product) => product.category?.name ?? '',
      header: 'Category',
      enableSorting: false,
      cell: ({ row }) => row.original.category?.name ?? 'Uncategorized',
    },
    {
      accessorKey: 'brand',
      header: 'Brand',
      enableSorting: false,
      cell: ({ row }) => row.original.brand || '—',
    },
    {
      id: 'unit',
      accessorFn: (product) =>
        product.baseUnit.symbol || product.baseUnit.name,
      header: 'Unit',
      enableSorting: false,
      cell: ({ row }) =>
        row.original.baseUnit.symbol || row.original.baseUnit.name,
    },
    {
      id: 'purchasePrice',
      accessorFn: (product) => Number(product.defaultPurchasePricePaisa),
      header: 'Purchase Price',
      meta: { align: 'right' },
      cell: ({ row }) => (
        <span className="product-money">
          {money(row.original.defaultPurchasePricePaisa)}
        </span>
      ),
    },
    {
      id: 'sellingPrice',
      accessorFn: (product) => Number(product.currentSellingPricePaisa),
      header: 'Selling Price',
      meta: { align: 'right' },
      cell: ({ row }) => (
        <span className="product-money">
          {money(row.original.currentSellingPricePaisa)}
        </span>
      ),
    },
    {
      id: 'stock',
      accessorFn: (product) => Number(product.stockBaseQty),
      header: 'Stock',
      meta: { align: 'right' },
      cell: ({ row }) => (
        <span className="product-quantity">
          {formatNumber(row.original.stockBaseQty, {
            maximumFractionDigits: 8,
          })}
        </span>
      ),
    },
    {
      id: 'minimumStock',
      accessorFn: (product) => Number(product.minimumStockBaseQty),
      header: 'Min Stock',
      enableSorting: false,
      meta: { align: 'right' },
      cell: ({ row }) => (
        <span className="product-quantity">
          {formatNumber(row.original.minimumStockBaseQty, {
            maximumFractionDigits: 8,
          })}
        </span>
      ),
    },
    {
      id: 'stockValue',
      accessorFn: (product) => Number(product.stockValuePaisa),
      header: 'Stock Value',
      meta: { align: 'right' },
      cell: ({ row }) => (
        <span className="product-money">
          {money(row.original.stockValuePaisa)}
        </span>
      ),
    },
    {
      id: 'status',
      accessorFn: (product) => (product.isActive ? 'Active' : 'Inactive'),
      header: 'Status',
      enableSorting: false,
      cell: ({ row }) => (
        <Badge
          className={
            row.original.isActive
              ? 'sher-badge-success'
              : 'sher-badge-neutral'
          }
          variant="outline"
        >
          {row.original.isActive ? 'Active' : 'Inactive'}
        </Badge>
      ),
    },
    {
      id: 'actions',
      header: 'Actions',
      enableHiding: false,
      enableSorting: false,
      meta: { align: 'center' },
      cell: ({ row }) => {
        const product = row.original

        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                aria-label={`Actions for ${product.name}`}
                className="product-actions-trigger"
                size="icon-sm"
                variant="ghost"
              >
                <MoreHorizontal aria-hidden="true" size={16} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem>View</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onEdit(product)}>
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onAdjustStock(product)}>
                Adjust Stock
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onViewLots(product)}>
                View Lots
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                data-danger={product.isActive ? 'true' : undefined}
                onSelect={() => onSetStatus(product, !product.isActive)}
              >
                {product.isActive ? 'Deactivate' : 'Activate'}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )
      },
    },
  ]
}
