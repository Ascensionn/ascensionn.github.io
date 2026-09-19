import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { HERO_TIMELINE, type AsciiHeroInstance, type HeroPhase } from '../ascii/engine'

/**
 * Nominal length of the engine's intro, used only for the readout. Read straight off the
 * engine's own timeline so the chip can never drift from the animation it is counting;
 * the engine's 'done' event remains authoritative for the Skip/Replay state.
 */
export const INTRO_SECONDS = HERO_TIMELINE.idle

/**
 * Human-readable name for each phase the engine reports.
 *
 * 'shatter' and 'rearrange' are the two mutually exclusive fifth beats (see CONFIG.twoPhrase
 * in the engine): only one of them can ever be emitted, and both are named here so flipping
 * that flag needs no edit down here.
 */
const PHASE_LABEL: Record<HeroPhase, string> = {
  patterns: 'Patterns',
  breakdown: 'Breakdown',
  assemble: 'Assemble',
  hold: 'Welcome',
  shatter: 'Break',
  rearrange: 'Rearrange',
  idle: 'Settled',
}

export type HeroIntro = {
  /** True once the intro has reached its last beat, or it was skipped. */
  done: boolean
  /** Name of the phase the engine is in, for the hero's timecode readout. */
  phaseLabel: string
  /** Skips the running intro, or replays it once it is done. */
  toggle: () => void
  /** Per-frame timecode updates (seconds, 0–1 progress). Returns an unsubscribe function. */
  subscribeTick: (fn: (t: number, progress: number) => void) => () => void
  bind: {
    onInstance: (instance: AsciiHeroInstance | null) => void
    onPhase: (phase: HeroPhase) => void
    onDone: () => void
  }
}

/**
 * Owns the hero engine instance so the hero, the nav and the mobile menu all share one
 * Skip/Replay state, and feeds the intro timecode without re-rendering React every frame.
 */
export function useHeroIntro(): HeroIntro {
  const [instance, setInstance] = useState<AsciiHeroInstance | null>(null)
  const [done, setDone] = useState(false)
  const [phase, setPhase] = useState<HeroPhase>('patterns')
  const tickers = useRef(new Set<(t: number, progress: number) => void>())
  const lastTick = useRef(0)

  const bind = useMemo(
    () => ({
      onInstance: (next: AsciiHeroInstance | null) => {
        setInstance(next)
        if (next) setPhase(next.phase)
        else setDone(false)
      },
      // Belt and braces: an engine that settles into 'idle' without firing 'done' still flips the control.
      onPhase: (next: HeroPhase) => {
        setPhase(next)
        if (next === 'idle') setDone(true)
      },
      onDone: () => setDone(true),
    }),
    [],
  )

  const toggle = useCallback(() => {
    if (!instance) return
    // Update our state first: an engine may report 'done' synchronously from inside replay()/skip().
    if (done) {
      setDone(false)
      instance.replay()
    } else {
      setDone(true)
      instance.skip()
    }
  }, [done, instance])

  const subscribeTick = useCallback((fn: (t: number, progress: number) => void) => {
    tickers.current.add(fn)
    fn(lastTick.current, Math.min(1, lastTick.current / INTRO_SECONDS))
    return () => {
      tickers.current.delete(fn)
    }
  }, [])

  // While the intro runs, read the engine's clock once a frame and push it straight to the DOM.
  useEffect(() => {
    const emit = (t: number) => {
      lastTick.current = t
      tickers.current.forEach((fn) => fn(t, Math.min(1, t / INTRO_SECONDS)))
    }
    if (!instance) return
    if (done) {
      emit(INTRO_SECONDS)
      return
    }
    let raf = 0
    const loop = () => {
      let t = lastTick.current
      try {
        t = instance.stats().t
      } catch {
        /* an engine build without timing simply leaves the readout where it was */
      }
      emit(Math.min(INTRO_SECONDS, t))
      raf = requestAnimationFrame(loop)
    }
    loop()
    return () => cancelAnimationFrame(raf)
  }, [instance, done])

  return { done, phaseLabel: done ? PHASE_LABEL.idle : PHASE_LABEL[phase], toggle, subscribeTick, bind }
}
