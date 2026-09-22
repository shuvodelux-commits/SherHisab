import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SearchCombobox } from './search-combobox'

const options = [
  {
    value: 'sunflower-oil',
    label: 'Sunflower Oil 5L',
    keywords: ['oil', '5l'],
  },
  {
    value: 'cotton-fabric',
    label: 'Cotton Fabric',
    keywords: ['fabric'],
  },
]

describe('SearchCombobox', () => {
  it('fuzzy-filters options and returns the selected value', () => {
    const onValueChange = vi.fn()

    render(
      <SearchCombobox
        options={options}
        value={null}
        onValueChange={onValueChange}
        placeholder="Select product"
      />,
    )

    fireEvent.click(
      screen.getByRole('button', { name: 'Select product' }),
    )
    fireEvent.change(screen.getByRole('searchbox'), {
      target: { value: 'snfl' },
    })

    expect(
      screen.getByRole('option', { name: 'Sunflower Oil 5L' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('option', { name: 'Cotton Fabric' }),
    ).not.toBeInTheDocument()

    fireEvent.click(
      screen.getByRole('option', { name: 'Sunflower Oil 5L' }),
    )

    expect(onValueChange).toHaveBeenCalledWith('sunflower-oil')
  })
})
