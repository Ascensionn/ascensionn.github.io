import { useRef, type FocusEventHandler, type PointerEventHandler, type ReactNode } from 'react'
import { useInViewOnce } from '../hooks/useInView'
import { useStillMode } from '../lib/env'
import styles from './Reveal.module.css'

type Props = {
  children: ReactNode
  className?: string
  /** Seconds to wait after the element enters view. */
  delay?: number
  as?: 'div' | 'li' | 'p' | 'figure'
  /**
   * Pointer and focus hooks on the revealed element itself, for rows that have
   * to tell a child (the experience marks) that they are being pointed at.
   * The *Capture variants so focus anywhere inside the row counts.
   */
  onPointerEnter?: PointerEventHandler
  onPointerLeave?: PointerEventHandler
  onFocusCapture?: FocusEventHandler
  onBlurCapture?: FocusEventHandler
}

/**
 * Soft entrance: fade in and rise a few pixels the first time the element scrolls into view.
 * One IntersectionObserver plus a CSS transition — no animation library.
 * Renders in its final state under reduced motion and in static capture.
 */
export function Reveal({ children, className, delay = 0, as: Tag = 'div', ...handlers }: Props) {
  const ref = useRef<HTMLElement>(null)
  const still = useStillMode()
  const shown = useInViewOnce(ref, { skip: still })

  return (
    <Tag
      ref={ref as never}
      className={[styles.reveal, className].filter(Boolean).join(' ')}
      data-shown={shown || undefined}
      style={delay ? { transitionDelay: `${delay}s` } : undefined}
      {...handlers}
    >
      {children}
    </Tag>
  )
}
