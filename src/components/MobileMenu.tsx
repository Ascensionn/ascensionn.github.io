import { useEffect, useRef, type CSSProperties, type MouseEvent } from 'react'
import { person } from '../content'
import type { HeroIntro } from '../hooks/useHeroIntro'
import { useScrollLock } from '../hooks/useScrollLock'
import type { Theme } from '../hooks/useTheme'
import { isStillMode } from '../lib/env'
import { IntroButton, ThemeButton } from './HeroControls'
import { LocalTime } from './LocalTime'
import pill from './Pill.module.css'
import styles from './MobileMenu.module.css'

type Props = {
  open: boolean
  onClose: () => void
  intro: HeroIntro
  theme: Theme
  onToggleTheme: () => void
}

const links = [
  { href: '#about', label: 'About' },
  { href: '#work', label: 'Work' },
  { href: '#contact', label: 'Contact' },
]

const FOCUSABLE = 'a[href], button:not([disabled])'
const DESKTOP_QUERY = '(min-width: 760px)'

/**
 * Full-screen phone menu: a modal dialog with a focus trap, Esc to close and a page scroll lock.
 *
 * The panel stays mounted and is marked `inert` while closed, so it is out of the tab order and
 * out of the accessibility tree without needing a portal. The element to hand focus back to is
 * read from document.activeElement when the menu opens, so any number of Menu buttons can open it.
 */
export function MobileMenu({ open, onClose, intro, theme, onToggleTheme }: Props) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const pendingTarget = useRef<string | null>(null)
  const returnFocus = useRef<HTMLElement | null>(null)
  const wasOpen = useRef(false)

  useScrollLock(open)

  // While open: remember the opener, focus the first control, trap Tab, close on Esc or at desktop width.
  useEffect(() => {
    if (!open) return
    wasOpen.current = true
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null

    const dialog = dialogRef.current
    const focusables = () => Array.from(dialog?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])
    ;(dialog?.querySelector<HTMLElement>('[data-autofocus]') ?? focusables()[0])?.focus()

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }
      if (event.key !== 'Tab') return
      const items = focusables()
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      const active = document.activeElement
      // The `!dialog.contains` arms also recover focus that has escaped the panel entirely.
      if (event.shiftKey && (active === first || !dialog?.contains(active))) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && (active === last || !dialog?.contains(active))) {
        event.preventDefault()
        first.focus()
      }
    }

    const desktop = window.matchMedia(DESKTOP_QUERY)
    const onViewportChange = () => desktop.matches && onClose()

    document.addEventListener('keydown', onKeyDown)
    desktop.addEventListener('change', onViewportChange)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      desktop.removeEventListener('change', onViewportChange)
    }
  }, [open, onClose])

  // After closing: either move to the section that was picked, or hand focus back to the opener.
  useEffect(() => {
    if (open || !wasOpen.current) return
    wasOpen.current = false
    const target = pendingTarget.current ? document.querySelector<HTMLElement>(pendingTarget.current) : null
    pendingTarget.current = null
    if (target) {
      target.focus({ preventScroll: true })
      target.scrollIntoView({ behavior: isStillMode() ? 'auto' : 'smooth', block: 'start' })
    } else {
      returnFocus.current?.focus()
    }
    returnFocus.current = null
  }, [open])

  const navigate = (event: MouseEvent<HTMLAnchorElement>, href: string) => {
    event.preventDefault()
    history.pushState(null, '', href)
    pendingTarget.current = href
    onClose()
  }

  return (
    <div
      ref={dialogRef}
      id="site-menu"
      className={styles.overlay}
      role="dialog"
      aria-modal="true"
      aria-label="Site menu"
      data-open={open || undefined}
      inert={!open}
    >
      <div className={styles.panel}>
        <div className={`label ${styles.top}`}>
          <a className={pill.pill} href="#top" onClick={(event) => navigate(event, '#top')}>
            Andy He
          </a>
          <button type="button" className={pill.pill} onClick={onClose} data-autofocus>
            Close
          </button>
        </div>

        <p className={styles.tagline}>{person.tagline}</p>

        <nav aria-label="Menu" className={styles.body}>
          <ul className={styles.links}>
            {links.map((link, i) => (
              <li key={link.href} className={styles.item} style={{ '--i': i } as CSSProperties}>
                <a className={styles.link} href={link.href} onClick={(event) => navigate(event, link.href)}>
                  <span className={`label ${styles.index}`} aria-hidden="true">
                    ({String(i + 1).padStart(2, '0')})
                  </span>
                  <span className={styles.mask}>
                    <span className={styles.word}>{link.label}</span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className={`label ${styles.bottom}`}>
          <div className={styles.controls}>
            <IntroButton className={pill.pill} intro={intro} />
            <ThemeButton className={pill.pill} theme={theme} onToggle={onToggleTheme} />
          </div>
          <div className={styles.meta}>
            <a className={pill.pill} href={`mailto:${person.email}`}>
              {person.email}
            </a>
            <LocalTime className={styles.muted} />
          </div>
        </div>
      </div>
    </div>
  )
}
