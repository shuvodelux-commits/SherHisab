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

  it('renders compact bilingual labels with a visible separator by default', () => {
    renderLabel()

    expect(screen.getByText('Purchase Price')).toBeInTheDocument()
    expect(screen.getByText('—')).toBeInTheDocument()
    expect(screen.getByText('কেনা দাম')).toBeInTheDocument()
  })

  it('stacks long bilingual helper copy without an inline separator', () => {
    render(
      <LanguageProvider>
        <BilingualLabel
          bn="স্টক কীভাবে ট্র্যাক হবে তা নির্বাচন করুন।"
          en="Choose how inventory is tracked."
          layout="stacked"
        />
      </LanguageProvider>,
    )

    const label = screen
      .getByText('Choose how inventory is tracked.')
      .closest('.bilingual-label')

    expect(label).toHaveClass('bilingual-label-stacked')
    expect(screen.queryByText('—')).not.toBeInTheDocument()
    expect(
      screen.getByText('স্টক কীভাবে ট্র্যাক হবে তা নির্বাচন করুন।'),
    ).toBeInTheDocument()
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
