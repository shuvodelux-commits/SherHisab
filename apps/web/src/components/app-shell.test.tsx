import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LanguageProvider } from '../app/language'
import { ThemeProvider } from '../app/theme'
import { AppShell } from './app-shell'

function renderShell() {
  return render(
    <ThemeProvider>
      <LanguageProvider>
        <AppShell>
          <div>Dashboard content</div>
        </AppShell>
      </LanguageProvider>
    </ThemeProvider>,
  )
}

describe('responsive application shell', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn().mockImplementation(() => ({
        matches: false,
        media: '(prefers-color-scheme: dark)',
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    })
  })

  it('renders the compact desktop navigation and content', () => {
    renderShell()

    expect(
      screen.getByRole('navigation', { name: 'Primary navigation' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Dashboard content')).toBeInTheDocument()
  })

  it('opens and closes the mobile navigation drawer', () => {
    renderShell()

    fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }))

    expect(
      screen.getByRole('dialog', { name: 'Navigation menu' }),
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Close navigation' }))

    expect(
      screen.queryByRole('dialog', { name: 'Navigation menu' }),
    ).not.toBeInTheDocument()
  })
})
