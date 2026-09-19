import { useEffect, useRef } from 'react'
import { INTRO_SECONDS, type HeroIntro } from '../hooks/useHeroIntro'
import type { Theme } from '../hooks/useTheme'
import styles from './HeroControls.module.css'

/** The part of the intro state a plain control needs: what it reads, and what it does. */
type IntroProps = { intro: Pick<HeroIntro, 'done' | 'toggle'>; className?: string }

/**
 * "Skip intro" while the animation runs, "Replay" once it has finished.
 * Both labels are stacked in the same grid cell so the button never changes width.
 */
export function IntroButton({ intro, className }: IntroProps) {
  return (
    <button type="button" className={[styles.swap, className].filter(Boolean).join(' ')} data-done={intro.done} onClick={intro.toggle}>
      <span className={styles.face} aria-hidden={intro.done}>
        Skip intro
      </span>
      <span className={styles.face} aria-hidden={!intro.done}>
        Replay
      </span>
    </button>
  )
}

type ThemeProps = { theme: Theme; onToggle: () => void; className?: string }

/** Dark mode switch. aria-pressed carries the state; the visible "(On)/(Off)" mirrors it. */
export function ThemeButton({ theme, onToggle, className }: ThemeProps) {
  const dark = theme === 'dark'
  return (
    <button type="button" className={className} aria-pressed={dark} onClick={onToggle}>
      Dark mode{' '}
      <span className={styles.state} aria-hidden="true">
        ({dark ? 'On' : 'Off'})
      </span>
    </button>
  )
}

type ProgressProps = { intro: HeroIntro; className?: string }

/**
 * Film-slate readout for the running intro: "07.2 / 13.8 — Assemble".
 * The seconds are written straight to the DOM each frame, so thirteen seconds of ticking costs
 * zero React renders. Decorative: the Skip/Replay button is what carries the meaning.
 */
export function IntroTimecode({ intro, className }: ProgressProps) {
  const { subscribeTick } = intro
  const seconds = useRef<HTMLSpanElement>(null)

  useEffect(
    () =>
      subscribeTick((t) => {
        if (seconds.current) seconds.current.textContent = t.toFixed(1).padStart(4, '0')
      }),
    [subscribeTick],
  )

  return (
    <span className={[styles.readout, className].filter(Boolean).join(' ')} data-done={intro.done} aria-hidden="true">
      <span ref={seconds} className={styles.tabular}>
        00.0
      </span>
      <span className={styles.muted}>/ {INTRO_SECONDS.toFixed(1)}</span>
      <span className={styles.phase}>{intro.phaseLabel}</span>
    </span>
  )
}

/** The companion rule: a hairline across the foot of the hero card that fills as the intro runs. */
export function IntroRule({ intro, className }: ProgressProps) {
  const { subscribeTick } = intro
  const fill = useRef<HTMLSpanElement>(null)

  useEffect(
    () =>
      subscribeTick((_, progress) => {
        if (fill.current) fill.current.style.transform = `scaleX(${progress})`
      }),
    [subscribeTick],
  )

  return (
    <span className={[styles.rule, className].filter(Boolean).join(' ')} data-done={intro.done} aria-hidden="true">
      <span ref={fill} className={styles.fill} />
    </span>
  )
}
