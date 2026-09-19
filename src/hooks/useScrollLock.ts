import { useEffect } from 'react'

/** Stops the page behind an overlay from scrolling while `locked` is true. */
export function useScrollLock(locked: boolean) {
  useEffect(() => {
    if (!locked) return
    const html = document.documentElement
    const body = document.body
    const scrollbar = window.innerWidth - html.clientWidth
    const previous = { overflow: html.style.overflow, paddingRight: body.style.paddingRight }

    html.style.overflow = 'hidden'
    // Reserve the scrollbar's width so the layout does not jump sideways on desktop.
    if (scrollbar > 0) body.style.paddingRight = `${scrollbar}px`

    return () => {
      html.style.overflow = previous.overflow
      body.style.paddingRight = previous.paddingRight
    }
  }, [locked])
}
