import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ProductStatusConfirmDialog } from './product-status-confirm-dialog'

describe('ProductStatusConfirmDialog', () => {
  it('uses an alert dialog before deactivating a product', () => {
    const onConfirm = vi.fn()
    const onOpenChange = vi.fn()

    render(
      <ProductStatusConfirmDialog
        onConfirm={onConfirm}
        onOpenChange={onOpenChange}
        open
        productName="Cotton Roll"
      />,
    )

    expect(
      screen.getByRole('alertdialog', { name: 'Deactivate product?' }),
    ).toBeInTheDocument()
    expect(screen.getByText(/Cotton Roll will be hidden/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Deactivate' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })
})
