import { useEffect, useRef, useState, type RefObject } from 'react'
import type { Theme } from '../hooks/useTheme'
import { ThemeButton } from './HeroControls'
import pill from './Pill.module.css'
import styles from './FloatingNav.module.css'

type Props = {
  /** Over the hero the bar is redundant — the hero carries its own nav — so it waits for it to leave. */
  heroRef: RefObject<HTMLElement | null>
  /** Kept for the lane measurement below, and so callers do not have to change. */
  footerRef: RefObject<HTMLElement | null>
  theme: Theme
  onToggleTheme: () => void
  menuOpen: boolean
  onOpenMenu: () => void
}

const sections = [
  { id: 'about', label: 'About' },
  { id: 'work', label: 'Work' },
  { id: 'contact', label: 'Contact' },
]

/**
 * The bar used to come and go with the direction of travel, so that it never sat over what you
 * were reading. Andy asked for it to stay: "the bar that pops up on the bottom should always be
 * present after the hero page. it shouldn't pop in and out." So it is now simply up for the whole
 * document past the first screen, and the page reserves a lane for it at the foot (--nav-lane in
 * index.css) so nothing ends up permanently underneath.
 */

type State = { shown: boolean; current: string }

/**
 * A slim bar along the bottom edge carrying the route to About / Work / Contact and the theme
 * switch, for the whole page past the first screen — the hero's own nav scrolls away with it.
 *
 * It appears once the hero has scrolled away and then stays for the rest of the page. The document
 * carries a matching lane of bottom padding, so the last line of the contact list and the footer's
 * colophon both clear it instead of sitting underneath.
 *
 * Everything is measured from the scroll offset in one rAF-throttled pass rather than from
 * IntersectionObservers: observers are re-evaluated against an expanded viewport while a full-page
 * screenshot is being taken, which would make the bar appear over the hero in every such capture.
 */
export function FloatingNav({ heroRef, footerRef, theme, onToggleTheme, menuOpen, onOpenMenu }: Props) {
  const [{ shown, current }, setState] = useState<State>({ shown: false, current: sections[0].id })
  /** The wrapper `inert` is applied to, so `measure()` can tell whether the keyboard is inside it. */
  const wrapRef = useRef<HTMLDivElement>(null)
  /** Pointer over the bar, or focus inside it: either way it must not retire under them. */
  const held = useRef(false)
  /** Set by the effect below, so the pointer/focus handlers can restart the rest timer. */
  const bump = useRef<() => void>(() => {})

  useEffect(() => {
    let queued = false

    const measure = () => {
      queued = false
      const y = window.scrollY
      const viewport = window.innerHeight
      const hero = heroRef.current?.getBoundingClientRect()

      const pastHero = hero !== undefined && hero.bottom <= 0
      const scrollable = document.documentElement.scrollHeight > viewport + 4

      const middle = y + viewport * 0.45
      let id = sections[0].id
      for (const section of sections) {
        const el = document.getElementById(section.id)
        if (el && el.offsetTop <= middle) id = section.id
      }

      /* Keyboard focus inside the bar vetoes every reason to hide it.
         Hiding applies `inert` to the wrapper the focused element lives in, and Chrome blurs
         it: a visitor who tabbed into the bar and then scrolled the way keyboard users do —
         arrow keys, Page Down, space — had focus dropped onto <body>, so the next Tab
         restarted the tab order at "Skip to content", throwing them back to the top of the
         document. Read from the DOM rather than from `held`, which is also set by the pointer:
         a mouse visitor's bar still yields over the footer the way it always has. */
      const keyboardInside = !!wrapRef.current && wrapRef.current.contains(document.activeElement)

      setState((prev) => {
        const next = { shown: (scrollable && pastHero) || keyboardInside, current: id }
        return prev.shown === next.shown && prev.current === next.current ? prev : next
      })
    }

    bump.current = measure

    const onScroll = () => {
      if (queued) return
      queued = true
      requestAnimationFrame(measure)
    }

    measure()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      bump.current = () => {}
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [heroRef, footerRef])

  const hold = (on: boolean) => () => {
    held.current = on
    bump.current()
  }

  return (
    <div ref={wrapRef} className={styles.wrap} data-shown={shown || undefined} inert={!shown}>
      <nav
        className={`label ${styles.bar}`}
        aria-label="Sections"
        onPointerEnter={hold(true)}
        onPointerLeave={hold(false)}
        onFocusCapture={hold(true)}
        onBlurCapture={hold(false)}
      >
        <a className={`${pill.pill} ${styles.brand}`} href="#top">
          Andy He
        </a>

        <ul className={styles.links}>
          {sections.map((section) => (
            <li key={section.id}>
              <a className={pill.pill} href={`#${section.id}`} aria-current={section.id === current ? 'true' : undefined}>
                {section.label}
              </a>
            </li>
          ))}
        </ul>

        <ThemeButton className={`${pill.pill} ${styles.theme}`} theme={theme} onToggle={onToggleTheme} />

        <button
          type="button"
          className={`${pill.pill} ${styles.menuButton}`}
          data-menu-trigger
          aria-haspopup="dialog"
          aria-expanded={menuOpen}
          aria-controls="site-menu"
          onClick={onOpenMenu}
        >
          Menu
        </button>
      </nav>
    </div>
  )
}
