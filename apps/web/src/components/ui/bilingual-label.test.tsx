import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { LanguageProvider } from '../../app/language'
import { BilingualLabel } from './bilingual-label'

function renderLabel() {
  render(
    <LanguageProvider>
      <BilingualLabel en="Purchase Price" bn="কেনা দাম" />
    </LanguageProvider>,
  )
}

describe('BilingualLabel', () => {
  afterEach(() => {
    window.localStorage.clear()
  })

  it('renders English plus Bangla helper by default', () => {
    renderLabel()

    expect(screen.getByText('Purchase Price')).toBeInTheDocument()
    expect(screen.getByText('কেনা দাম')).toBeInTheDocument()
  })

  it('renders English only in Full English mode', () => {
    window.localStorage.setItem('sherhisab-language-mode', 'en')
    renderLabel()

    expect(screen.getByText('Purchase Price')).toBeInTheDocument()
    expect(screen.queryByText('কেনা দাম')).not.toBeInTheDocument()
  })

  it('renders Bangla only in Full Bangla mode', () => {
    window.localStorage.setItem('sherhisab-language-mode', 'bn')
    renderLabel()

    expect(screen.getByText('কেনা দাম')).toBeInTheDocument()
    expect(screen.queryByText('Purchase Price')).not.toBeInTheDocument()
  })
})
