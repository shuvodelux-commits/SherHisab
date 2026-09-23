import { useMemo, useState } from 'react'
import { fuzzyFilter } from '../../lib/fuzzy-search'

export interface SearchComboboxOption {
  value: string
  label: string
  keywords?: readonly string[]
}

interface SearchComboboxFooterAction {
  label: string
  onSelect: () => void
}

interface SearchComboboxProps {
  ariaLabel?: string
  options: readonly SearchComboboxOption[]
  value: string | null
  onValueChange: (value: string) => void
  placeholder?: string
  searchPlaceholder?: string
  emptyMessage?: string
  footerAction?: SearchComboboxFooterAction
}

export function SearchCombobox({
  ariaLabel,
  options,
  value,
  onValueChange,
  placeholder = 'Select',
  searchPlaceholder = 'Search...',
  emptyMessage = 'No results',
  footerAction,
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

  function runFooterAction() {
    setOpen(false)
    setQuery('')
    footerAction?.onSelect()
  }

  return (
    <div className="search-combobox">
      <button
        aria-label={ariaLabel}
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

          {footerAction ? (
            <button
              className="search-combobox-footer-action"
              onClick={runFooterAction}
              type="button"
            >
              {footerAction.label}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
