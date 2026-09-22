import { useMemo, useState } from 'react'
import { fuzzyFilter } from '../../lib/fuzzy-search'

export interface SearchComboboxOption {
  value: string
  label: string
  keywords?: readonly string[]
}

interface SearchComboboxProps {
  options: readonly SearchComboboxOption[]
  value: string | null
  onValueChange: (value: string) => void
  placeholder?: string
  searchPlaceholder?: string
  emptyMessage?: string
}

export function SearchCombobox({
  options,
  value,
  onValueChange,
  placeholder = 'Select',
  searchPlaceholder = 'Search...',
  emptyMessage = 'No results',
}: SearchComboboxProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const selectedOption = options.find((option) => option.value === value)
  const visibleOptions = useMemo(
    () =>
      fuzzyFilter(options, query, (option) => [
        option.label,
        option.value,
        ...(option.keywords ?? []),
      ]),
    [options, query],
  )

  function selectOption(option: SearchComboboxOption) {
    onValueChange(option.value)
    setOpen(false)
    setQuery('')
  }

  return (
    <div className="search-combobox">
      <button
        aria-expanded={open}
        aria-haspopup="listbox"
        className="search-combobox-trigger"
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        {selectedOption?.label ?? placeholder}
      </button>

      {open ? (
        <div className="search-combobox-popover">
          <input
            aria-label={searchPlaceholder}
            autoFocus
            className="search-combobox-input"
            onChange={(event) => setQuery(event.target.value)}
            placeholder={searchPlaceholder}
            role="searchbox"
            value={query}
          />

          <div
            aria-label="Options"
            className="search-combobox-options"
            role="listbox"
          >
            {visibleOptions.length > 0 ? (
              visibleOptions.map((option) => (
                <button
                  aria-selected={option.value === value}
                  className="search-combobox-option"
                  key={option.value}
                  onClick={() => selectOption(option)}
                  role="option"
                  type="button"
                >
                  {option.label}
                </button>
              ))
            ) : (
              <p className="search-combobox-empty">{emptyMessage}</p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}
