import { createContext, useContext, useEffect, useState } from 'react'

const ThemeContext = createContext(null)
const STORAGE_KEY = 'lcms_theme_preference'

function systemTheme() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function ThemeProvider({ children }) {
  const [preference, setPreference] = useState(() => localStorage.getItem(STORAGE_KEY) || 'system')
  const [resolvedTheme, setResolvedTheme] = useState(() => preference === 'system' ? systemTheme() : preference)

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const applyTheme = () => {
      const resolved = preference === 'system' ? (media.matches ? 'dark' : 'light') : preference
      setResolvedTheme(resolved)
      document.documentElement.dataset.theme = resolved
      document.documentElement.style.colorScheme = resolved
    }

    applyTheme()
    if (preference === 'system') media.addEventListener('change', applyTheme)
    return () => media.removeEventListener('change', applyTheme)
  }, [preference])

  function setTheme(nextTheme) {
    if (!['system', 'light', 'dark'].includes(nextTheme)) return
    localStorage.setItem(STORAGE_KEY, nextTheme)
    setPreference(nextTheme)
  }

  return <ThemeContext.Provider value={{ preference, resolvedTheme, setTheme }}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const value = useContext(ThemeContext)
  if (!value) throw new Error('useTheme must be used within ThemeProvider')
  return value
}
