import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AppShell } from './app-shell'

describe('responsive application shell', () => {
  it('renders the compact desktop navigation and content', () => {
    render(
      <AppShell>
        <div>Dashboard content</div>
      </AppShell>,
    )

    expect(
      screen.getByRole('navigation', { name: 'Primary navigation' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Dashboard content')).toBeInTheDocument()
  })

  it('opens and closes the mobile navigation drawer', () => {
    render(
      <AppShell>
        <div>Dashboard content</div>
      </AppShell>,
    )

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
