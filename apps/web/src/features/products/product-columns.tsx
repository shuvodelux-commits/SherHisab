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
}

function money(value: string) {
  return `৳${formatPaisaToTaka(value)}`
}

export function createProductColumns({
  onSetStatus,
  onEdit,
}: ProductColumnsOptions): ColumnDef<ProductListItemDto, unknown>[] {
  return [
    {
      accessorKey: 'name',
      header: 'Product',
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
      header: 'Category',
      cell: ({ row }) => row.original.category?.name ?? 'Uncategorized',
    },
    {
      accessorKey: 'brand',
      header: 'Brand',
      cell: ({ row }) => row.original.brand || '—',
    },
    {
      id: 'unit',
      header: 'Unit',
      cell: ({ row }) =>
        row.original.baseUnit.symbol || row.original.baseUnit.name,
    },
    {
      id: 'purchasePrice',
      header: 'Purchase Price',
      cell: ({ row }) => (
        <span className="product-money">
          {money(row.original.defaultPurchasePricePaisa)}
        </span>
      ),
    },
    {
      id: 'sellingPrice',
      header: 'Selling Price',
      cell: ({ row }) => (
        <span className="product-money">
          {money(row.original.defaultSellingPricePaisa)}
        </span>
      ),
    },
    {
      id: 'stock',
      header: 'Stock',
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
      header: 'Min Stock',
      cell: ({ row }) => (
        <span className="product-quantity">
          {formatNumber(row.original.minimumStockBaseQty, {
            maximumFractionDigits: 8,
          })}
        </span>
      ),
    },
    {
      id: 'status',
      header: 'Status',
      cell: ({ row }) => (
        <Badge tone={row.original.isActive ? 'success' : 'neutral'}>
          {row.original.isActive ? 'Active' : 'Inactive'}
        </Badge>
      ),
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => {
        const product = row.original

        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                aria-label={`Actions for ${product.name}`}
                className="product-actions-trigger"
                size="small"
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
              <DropdownMenuItem>Adjust Stock</DropdownMenuItem>
              <DropdownMenuItem>View Lots</DropdownMenuItem>
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
