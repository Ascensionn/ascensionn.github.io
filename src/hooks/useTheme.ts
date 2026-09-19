import { useCallback, useSyncExternalStore } from 'react'

export type Theme = 'light' | 'dark'

const STORAGE_KEY = 'theme'

function readTheme(): Theme {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'
}

/** Re-render subscribers whenever <html data-theme> changes, no matter who changed it. */
function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
  return () => observer.disconnect()
}

function applyTheme(next: Theme) {
  const root = document.documentElement
  root.dataset.theme = next
  // Keep the browser chrome (mobile address bar) in step with the page colour. Both media-scoped
  // metas get the same value, so the chosen theme wins over the system preference they were set for.
  const outer = getComputedStyle(root).getPropertyValue('--outer').trim()
  if (outer) document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => meta.setAttribute('content', outer))
  try {
    localStorage.setItem(STORAGE_KEY, next)
  } catch {
    /* storage can be unavailable (private mode, blocked site data): the toggle still works for this visit */
  }
}

/**
 * Light/dark theme stored on <html data-theme>. The inline script in index.html applies the saved
 * value before first paint; this hook reads it and flips it. The ASCII engine watches the attribute itself.
 */
export function useTheme() {
  const theme = useSyncExternalStore(subscribe, readTheme, () => 'light' as Theme)

  const toggle = useCallback(() => {
    const next: Theme = readTheme() === 'dark' ? 'light' : 'dark'
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    // Cross-fade the whole page (canvas included) where the View Transitions API exists.
    if (!reduced && typeof document.startViewTransition === 'function') {
      document.startViewTransition(() => applyTheme(next))
    } else {
      applyTheme(next)
    }
  }, [])

  return { theme, toggle }
}
