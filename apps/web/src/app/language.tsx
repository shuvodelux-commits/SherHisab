import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

export type LanguageMode = 'en-bn' | 'en' | 'bn'

interface LanguageContextValue {
  mode: LanguageMode
  setMode: (mode: LanguageMode) => void
}

const STORAGE_KEY = 'sherhisab-language-mode'
const LanguageContext = createContext<LanguageContextValue | null>(null)

function readStoredMode(): LanguageMode {
  if (typeof window === 'undefined') {
    return 'en-bn'
  }

  const stored = window.localStorage.getItem(STORAGE_KEY)
  return stored === 'en' || stored === 'bn' || stored === 'en-bn'
    ? stored
    : 'en-bn'
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<LanguageMode>(readStoredMode)

  const setMode = useCallback((nextMode: LanguageMode) => {
    window.localStorage.setItem(STORAGE_KEY, nextMode)
    setModeState(nextMode)
  }, [])

  const value = useMemo(() => ({ mode, setMode }), [mode, setMode])

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  )
}

// This context intentionally colocates its provider and consumer hook.\n// eslint-disable-next-line react-refresh/only-export-components\nexport function useLanguageMode(): LanguageContextValue {
  const value = useContext(LanguageContext)

  if (!value) {
    throw new Error('useLanguageMode must be used within LanguageProvider')
  }

  return value
}
