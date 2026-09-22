import { render, screen } from '@testing-library/react'
import type { ColumnDef } from '@tanstack/react-table'
import { describe, expect, it } from 'vitest'
import { DataTable } from './data-table'

interface ProductRow {
  name: string
  stock: number
}

const columns: ColumnDef<ProductRow>[] = [
  {
    accessorKey: 'name',
    header: 'Product',
  },
  {
    accessorKey: 'stock',
    header: 'Stock',
  },
]

describe('DataTable', () => {
  it('renders compact column headers and row values', () => {
    render(
      <DataTable
        columns={columns}
        data={[{ name: 'Sunflower Oil 5L', stock: 15 }]}
      />,
    )

    expect(screen.getByRole('columnheader', { name: 'Product' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Stock' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: 'Sunflower Oil 5L' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: '15' })).toBeInTheDocument()
  })

  it('shows an empty-state row when there is no data', () => {
    render(<DataTable columns={columns} data={[]} emptyMessage="No products" />)

    expect(screen.getByText('No products')).toBeInTheDocument()
  })
})
