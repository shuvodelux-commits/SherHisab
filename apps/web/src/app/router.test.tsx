import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { queryClient } from './query-client'
import { router } from './router'

describe('frontend foundation', () => {
  it('renders the SherHisab home route', async () => {
    await router.navigate({ to: '/' })

    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )

    expect(
      await screen.findByRole('heading', { name: 'SherHisab' }),
    ).toBeInTheDocument()

    expect(screen.getByText('Foundation is running.')).toBeInTheDocument()
  })
})
