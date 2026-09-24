import { fireEvent, render, screen, within } from '@testing-library/react'
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
    meta: {
      align: 'right',
    },
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
    expect(
      screen.getByRole('columnheader', { name: 'Stock' }),
    ).toHaveAttribute('data-align', 'right')
    expect(screen.getByRole('cell', { name: '15' })).toHaveAttribute(
      'data-align',
      'right',
    )
  })

  it('shows an empty-state row when there is no data', () => {
    render(<DataTable columns={columns} data={[]} emptyMessage="No products" />)

    expect(screen.getByText('No products')).toBeInTheDocument()
  })
  it('sorts a sortable column in both directions', () => {
    render(
      <DataTable
        columns={columns}
        data={[
          { name: 'Zinc Bolt', stock: 2 },
          { name: 'Anchor Bolt', stock: 1 },
        ]}
      />,
    )

    const sortButton = screen.getByRole('button', { name: 'Sort by Product' })

    fireEvent.click(sortButton)
    let rows = screen.getAllByRole('row').slice(1)
    expect(within(rows[0]!).getByText('Anchor Bolt')).toBeInTheDocument()

    fireEvent.click(sortButton)
    rows = screen.getAllByRole('row').slice(1)
    expect(within(rows[0]!).getByText('Zinc Bolt')).toBeInTheDocument()
  })

  it('lets users choose which hideable columns are visible', async () => {
    render(
      <DataTable
        columns={columns}
        data={[{ name: 'Sunflower Oil 5L', stock: 15 }]}
      />,
    )

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Columns' }), {
      button: 0,
      ctrlKey: false,
      pointerType: 'mouse',
    })

    const stockToggle = await screen.findByRole('menuitemcheckbox', {
      name: 'Stock',
    })
    fireEvent.click(stockToggle)

    expect(
      screen.queryByRole('columnheader', { name: 'Stock' }),
    ).not.toBeInTheDocument()
  })
})
