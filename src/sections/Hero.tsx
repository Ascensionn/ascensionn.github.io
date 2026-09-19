import { useCallback, useEffect, useLayoutEffect, useRef, useState, type Ref, type RefObject } from 'react'
import type { AsciiHeroInstance } from '../ascii/engine'
import { AsciiHero } from '../components/AsciiHero'
import { HeroIdentity } from '../components/HeroIdentity'
import { IntroButton, IntroRule, IntroTimecode } from '../components/HeroControls'
import { Nav } from '../components/Nav'
import pill from '../components/Pill.module.css'
import { useHeroResolve } from '../components/useHeroResolve'
import { heroPhrases, person } from '../content'
import type { HeroIntro } from '../hooks/useHeroIntro'
import type { Theme } from '../hooks/useTheme'
import styles from './Hero.module.css'

type Props = {
  ref?: Ref<HTMLElement>
  intro: HeroIntro
  theme: Theme
  onToggleTheme: () => void
  menuOpen: boolean
  onOpenMenu: () => void
}

/**
 * Keeps the top of the ASCII field clear, in CSS px, so the nav's buttons sit on the card
 * itself. Belt and braces: the buttons are opaque and above the canvas anyway, but a band
 * of quiet under them is what makes the row read as a row of controls at a glance.
 *
 * It is only the value the engine starts with — `useFurnitureBands` below measures the two
 * rows for real on the first layout and keeps them in step afterwards.
 */
const NAV_CLEAR_PX = 56

/**
 * Publishes the height of the hero's two furniture bands — the nav capsules along the top,
 * the caption chips and the progress rule along the bottom — as custom properties the ASCII
 * engine reads off its own box (`readClearance` in src/ascii/engine.ts).
 *
 * Measured rather than assumed, because the caption row WRAPS: one line of capsules at 1440
 * (60px) and three at 390 (145px). The engine's own constant was 68, so on a phone the art
 * was cleared for a band less than half the height of the one it had to keep out of, and the
 * pattern ran straight through the chips and the rule.
 *
 * A layout effect, so the properties are on the element before AsciiHero's mount effect
 * measures the grid; and a ResizeObserver afterwards, because the row's height changes with
 * the card's width and again when the intro's timecode chip retires.
 */
function useFurnitureBands(host: RefObject<HTMLElement | null>, nav: RefObject<HTMLElement | null>, foot: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const card = host.current
    const top = nav.current
    const bottom = foot.current
    if (!card || !top || !bottom) return

    const write = () => {
      const c = card.getBoundingClientRect()
      const t = top.getBoundingClientRect()
      const b = bottom.getBoundingClientRect()
      // Rounded up: half a pixel of band costs nothing and a half-covered character row is
      // exactly the artefact this is here to remove.
      card.style.setProperty('--ascii-nav-clear', `${Math.max(0, Math.ceil(t.bottom - c.top))}px`)
      card.style.setProperty('--ascii-foot-clear', `${Math.max(0, Math.ceil(c.bottom - b.top))}px`)
    }

    write()
    if (!window.ResizeObserver) return
    const ro = new ResizeObserver(write)
    ro.observe(card)
    ro.observe(top)
    ro.observe(bottom)
    return () => ro.disconnect()
  }, [host, nav, foot])
}

/**
 * How long the canvas takes to fade out of the way once the identity block lands: the
 * 1.2s transition in Hero.module.css plus its 0.15s delay, plus a frame of slack.
 */
const FADE_OUT_MS = 1500

/** Full-height hero card: the ASCII animation fills it, the nav and a caption row frame it. */
export function Hero({ ref, intro, theme, onToggleTheme, menuOpen, onOpenMenu }: Props) {
  // Kept alongside the intro hook's own copy: this one drives the hero's final beat.
  const [engine, setEngine] = useState<AsciiHeroInstance | null>(null)
  const resolved = useHeroResolve(engine, intro.done)

  /* Our own handle on the card, alongside whatever App asked for, so the two furniture
     bands can be measured against it. */
  const cardRef = useRef<HTMLElement>(null)
  const navRef = useRef<HTMLElement>(null)
  const footRef = useRef<HTMLDivElement>(null)
  const setCard = useCallback(
    (node: HTMLElement | null) => {
      cardRef.current = node
      if (typeof ref === 'function') ref(node)
      else if (ref) ref.current = node
    },
    [ref],
  )
  useFurnitureBands(cardRef, navRef, footRef)

  /**
   * The resolved card is clean paper: the canvas has faded to nothing, so every frame it
   * still draws is work no one can see. Park the loop once the fade is done — pause() is the
   * engine's own brake, and it leaves the last frame on the canvas, so Skip and Replay both
   * start it again from wherever they put the clock. Nothing restarts it by accident either:
   * the engine's pointer, visibility and resize handlers all refuse to start a paused loop.
   *
   * It waits on `intro.done` as well as on `resolved`, and that pairing matters now that the
   * block arrives BEFORE the engine's last beat rather than after it: `resolved` fires at
   * `shatter + RESOLVE_LEAD`, so parking on that alone could stop the clock short of `idle`
   * on a throttled tab and strand the Skip/Replay button on "Skip intro" forever.
   */
  useEffect(() => {
    if (!engine || !resolved || !intro.done) return
    const id = window.setTimeout(() => engine.pause(), FADE_OUT_MS)
    return () => window.clearTimeout(id)
  }, [engine, resolved, intro.done])

  return (
    <header ref={setCard} id="top" className={styles.hero} data-resolved={resolved || undefined} tabIndex={-1}>
      <AsciiHero
        phrases={heroPhrases}
        navClearPx={NAV_CLEAR_PX}
        className={styles.art}
        onInstance={(instance) => {
          intro.bind.onInstance(instance)
          setEngine(instance)
        }}
        onPhase={intro.bind.onPhase}
        onDone={intro.bind.onDone}
      />

      <Nav ref={navRef} intro={intro} theme={theme} onToggleTheme={onToggleTheme} menuOpen={menuOpen} onOpenMenu={onOpenMenu} />

      <HeroIdentity shown={resolved} />

      <div className={styles.copy}>
        <p className="sr-only">{person.tagline}</p>
      </div>

      <div ref={footRef} className={`label ${styles.foot}`}>
        <div className={styles.footRow}>
          <p className={styles.location}>
            <span className={`${pill.pill} ${pill.static}`}>{person.location}</span>
          </p>
          <p className={styles.timecode}>
            <IntroTimecode className={`${pill.pill} ${pill.static}`} intro={intro} />
          </p>
          <p className={styles.phoneIntro}>
            <IntroButton className={pill.pill} intro={intro} />
          </p>
          <a className={`${pill.pill} ${styles.scroll}`} href="#about">
            Scroll <span aria-hidden="true">↓</span>
          </a>
        </div>

        {/* A rule across the foot of the card that fills over the intro's ~13.8 seconds. */}
        <IntroRule intro={intro} />
      </div>
    </header>
  )
}
