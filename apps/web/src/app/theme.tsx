import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

export type ThemeMode = 'light' | 'dark' | 'system'
type ResolvedTheme = 'light' | 'dark'

interface ThemeContextValue {
  mode: ThemeMode
  setMode: (mode: ThemeMode) => void
}

const STORAGE_KEY = 'sherhisab-theme-mode'
const ThemeContext = createContext<ThemeContextValue | null>(null)

function readStoredMode(): ThemeMode {
  if (typeof window === 'undefined') {
    return 'system'
  }

  const stored = window.localStorage.getItem(STORAGE_KEY)
  return stored === 'light' || stored === 'dark' || stored === 'system'
    ? stored
    : 'system'
}

function getSystemTheme(): ResolvedTheme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light'
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(readStoredMode)

  const setMode = useCallback((nextMode: ThemeMode) => {
    window.localStorage.setItem(STORAGE_KEY, nextMode)
    setModeState(nextMode)
  }, [])

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')

    const applyTheme = () => {
      const resolvedTheme = mode === 'system' ? getSystemTheme() : mode
      const root = document.documentElement

      root.classList.remove('light', 'dark')
      root.classList.add(resolvedTheme)
      root.style.colorScheme = resolvedTheme
    }

    applyTheme()

    if (mode !== 'system') {
      return
    }

    media.addEventListener('change', applyTheme)
    return () => media.removeEventListener('change', applyTheme)
  }, [mode])

  const value = useMemo(() => ({ mode, setMode }), [mode, setMode])

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  )
}

// This context intentionally colocates its provider and consumer hook.
// eslint-disable-next-line react-refresh/only-export-components
export function useThemeMode(): ThemeContextValue {
  const value = useContext(ThemeContext)

  if (!value) {
    throw new Error('useThemeMode must be used within ThemeProvider')
  }

  return value
}
