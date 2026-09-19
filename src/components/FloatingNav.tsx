import { useEffect, useRef, useState, type RefObject } from 'react'
import type { Theme } from '../hooks/useTheme'
import { ThemeButton } from './HeroControls'
import pill from './Pill.module.css'
import styles from './FloatingNav.module.css'

type Props = {
  /** The bar keeps out of both: over the hero it is redundant, over the footer it would cover the colophon. */
  heroRef: RefObject<HTMLElement | null>
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

/** Pixels of continuous travel before a change of direction counts, so trackpad jitter is ignored. */
const DIRECTION_THRESHOLD = 90

/** How far past the hero the bar stays up before it yields, so it is seen at least once. */
const INTRO_GRACE = 340

/** Height of the bar's lane above the bottom edge; the footer hides the bar on reaching it. */
const LANE = 80

/**
 * How long the bar stays up after the last scroll. A fixed bar that simply stays put covers
 * whatever happens to be at the foot of the window — at 1440x900 that was the last line of the
 * contact list — and no amount of page padding fixes it, because the covered line can be in the
 * middle of a tall card. So the bar retires whenever you stop: it belongs to the act of moving
 * through the page, not to the act of reading it.
 */
const REST_AFTER = 3000

type State = { shown: boolean; current: string }

/**
 * A slim bar along the bottom edge carrying the route to About / Work / Contact and the theme
 * switch, for the whole page past the first screen — the hero's own nav scrolls away with it.
 *
 * It introduces itself as you leave the hero, yields while you read on, comes back the moment you
 * scroll up, and stands down again a few seconds after you settle. So nothing you are reading ever
 * stays underneath it: hold still and the page is yours, flick up and the route is back.
 *
 * It also holds its ground while it is hovered or while focus is inside it, which is what keeps it
 * from vanishing out from under a pointer on its way to a link, or from taking the keyboard focus
 * with it. (`inert` while hidden would do exactly that.)
 *
 * Everything is measured from the scroll offset in one rAF-throttled pass rather than from
 * IntersectionObservers: observers are re-evaluated against an expanded viewport while a full-page
 * screenshot is being taken, which would make the bar appear over the hero in every such capture.
 */
export function FloatingNav({ heroRef, footerRef, theme, onToggleTheme, menuOpen, onOpenMenu }: Props) {
  const [{ shown, current }, setState] = useState<State>({ shown: false, current: sections[0].id })
  /** Pointer over the bar, or focus inside it: either way it must not retire under them. */
  const held = useRef(false)
  /** Set by the effect below, so the pointer/focus handlers can restart the rest timer. */
  const bump = useRef<() => void>(() => {})

  useEffect(() => {
    let last = window.scrollY
    let anchor = window.scrollY
    let direction = 0
    let reading = false
    let resting = false
    let heroExit = Infinity
    let queued = false
    let restTimer = 0

    const measure = () => {
      queued = false
      const y = window.scrollY
      const viewport = window.innerHeight
      const hero = heroRef.current?.getBoundingClientRect()
      const footer = footerRef.current?.getBoundingClientRect()

      const pastHero = hero !== undefined && hero.bottom <= 0
      // Hide as soon as the footer reaches the bar's lane, rather than when it merely comes into view.
      const atFooter = footer !== undefined && footer.top < viewport - LANE
      const scrollable = document.documentElement.scrollHeight > viewport + 4

      // Leaving the hero reveals the bar for a moment, so it is discovered rather than waited for.
      if (!pastHero) heroExit = Infinity
      else if (heroExit === Infinity) {
        heroExit = y
        reading = false
        anchor = y
        direction = 0
      }

      const delta = y - last
      last = y
      if (delta !== 0) {
        const next = delta > 0 ? 1 : -1
        // A change of direction restarts the run, so the threshold always measures one continuous move.
        if (next !== direction) {
          direction = next
          anchor = y - delta
        }
        if (Math.abs(y - anchor) > DIRECTION_THRESHOLD) reading = direction === 1
      }
      if (y < heroExit + INTRO_GRACE) reading = false

      const middle = y + viewport * 0.45
      let id = sections[0].id
      for (const section of sections) {
        const el = document.getElementById(section.id)
        if (el && el.offsetTop <= middle) id = section.id
      }

      setState((prev) => {
        const next = { shown: scrollable && pastHero && !atFooter && !reading && !resting, current: id }
        return prev.shown === next.shown && prev.current === next.current ? prev : next
      })
    }

    // Declarations, not consts: the two call each other, and a timer that outlives one of
    // them is exactly the case a temporal dead zone would turn into a runtime error.
    function rest(): void {
      restTimer = 0
      // Held: give it another full window rather than pulling it out from under the pointer.
      if (held.current) restart()
      else {
        resting = true
        measure()
      }
    }

    function restart(): void {
      window.clearTimeout(restTimer)
      resting = false
      restTimer = window.setTimeout(rest, REST_AFTER)
    }

    bump.current = () => {
      restart()
      measure()
    }

    const onScroll = () => {
      if (queued) return
      queued = true
      // Throttled with the measure it precedes, so a flick of the wheel is one timer, not forty.
      restart()
      requestAnimationFrame(measure)
    }

    restart()
    measure()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.clearTimeout(restTimer)
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
    <div className={styles.wrap} data-shown={shown || undefined} inert={!shown}>
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
