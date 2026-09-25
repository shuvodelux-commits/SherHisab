import type { PropsWithChildren } from 'react'

export function Cart({ children }: PropsWithChildren) {
  return (
    <section className="pos-panel pos-cart-panel">
      {children}
    </section>
  )
}
