import { useEffect, useState, type Ref } from 'react'
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
 */
const NAV_CLEAR_PX = 56

/**
 * How long the canvas takes to fade out of the way once the identity block lands: the
 * 1.2s transition in Hero.module.css plus its 0.15s delay, plus a frame of slack.
 */
const FADE_OUT_MS = 1500

/** Full-height hero card: the ASCII animation fills it, the nav and a caption row frame it. */
export function Hero({ ref, intro, theme, onToggleTheme, menuOpen, onOpenMenu }: Props) {
  // Kept alongside the intro hook's own copy: this one drives the hero's final beat.
  const [engine, setEngine] = useState<AsciiHeroInstance | null>(null)
  const resolved = useHeroResolve(engine)

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
    <header ref={ref} id="top" className={styles.hero} data-resolved={resolved || undefined} tabIndex={-1}>
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

      <Nav intro={intro} theme={theme} onToggleTheme={onToggleTheme} menuOpen={menuOpen} onOpenMenu={onOpenMenu} />

      <HeroIdentity shown={resolved} />

      <div className={styles.copy}>
        <p className="sr-only">{person.tagline}</p>
      </div>

      <div className={`label ${styles.foot}`}>
        <div className={styles.footRow}>
          <p className={styles.role}>
            <span className={`${pill.pill} ${pill.static}`}>{person.role}</span>
          </p>
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
