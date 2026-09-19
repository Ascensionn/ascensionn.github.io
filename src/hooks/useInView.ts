import { useEffect, useState, type RefObject } from 'react'

type Options = { threshold?: number; rootMargin?: string; skip?: boolean }

/**
 * Flips to true the first time the element scrolls into view, then stays true.
 * One IntersectionObserver per element, disconnected as soon as it has fired.
 * `skip` (reduced motion / static capture) starts it true, so nothing is ever hidden.
 */
export function useInViewOnce(ref: RefObject<Element | null>, { threshold = 0, rootMargin = '0px 0px -12% 0px', skip = false }: Options = {}) {
  const [seen, setSeen] = useState(false)

  useEffect(() => {
    if (skip || seen) return
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setSeen(true)
          observer.disconnect()
        }
      },
      { threshold, rootMargin },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [ref, threshold, rootMargin, skip, seen])

  return seen || skip
}
