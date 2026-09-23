import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

afterEach(() => {
  cleanup()
})

Object.defineProperty(window, 'scrollTo', {
  value: vi.fn(),
  writable: true,
})

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

Object.defineProperty(globalThis, 'ResizeObserver', {
  configurable: true,
  value: ResizeObserverStub,
  writable: true,
})

Object.defineProperties(Element.prototype, {
  hasPointerCapture: {
    value: () => false,
    writable: true,
  },
  setPointerCapture: {
    value: () => undefined,
    writable: true,
  },
  releasePointerCapture: {
    value: () => undefined,
    writable: true,
  },
  scrollIntoView: {
    value: () => undefined,
    writable: true,
  },
})
