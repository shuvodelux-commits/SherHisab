import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ThemeProvider, useThemeMode } from './theme'

function ThemeHarness() {
  const { mode, setMode } = useThemeMode()

  return (
    <div>
      <span data-testid="theme-mode">{mode}</span>
      <button onClick={() => setMode('light')} type="button">
        Light
      </button>
      <button onClick={() => setMode('dark')} type="button">
        Dark
      </button>
      <button onClick={() => setMode('system')} type="button">
        System
      </button>
    </div>
  )
}

function setSystemDark(matches: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn().mockImplementation(() => ({
      matches,
      media: '(prefers-color-scheme: dark)',
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })
}

describe('ThemeProvider', () => {
  afterEach(() => {
    window.localStorage.clear()
    delete document.documentElement.dataset.theme
  })

  it('defaults to system theme and resolves the system preference', () => {
    setSystemDark(true)

    render(
      <ThemeProvider>
        <ThemeHarness />
      </ThemeProvider>,
    )

    expect(screen.getByTestId('theme-mode')).toHaveTextContent('system')
    expect(document.documentElement.dataset.theme).toBe('dark')
  })

  it('persists and applies explicit theme overrides', () => {
    setSystemDark(false)

    render(
      <ThemeProvider>
        <ThemeHarness />
      </ThemeProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Dark' }))

    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(window.localStorage.getItem('sherhisab-theme-mode')).toBe('dark')

    fireEvent.click(screen.getByRole('button', { name: 'Light' }))

    expect(document.documentElement.dataset.theme).toBe('light')
    expect(window.localStorage.getItem('sherhisab-theme-mode')).toBe('light')
  })
})
