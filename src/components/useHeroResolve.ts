import { useEffect, useState } from 'react'
import { HERO_TIMELINE, type AsciiHeroInstance } from '../ascii/engine'

/**
 * How long AFTER the ASCII phrase starts breaking apart the identity block begins arriving.
 *
 * It is a lead, not a delay: the block is already fading up while the last characters are
 * still in the air, which is what stops the hero going blank for a second between the two
 * beats. Long enough that the break has visibly started and reads as its own move; short
 * enough that the block's arrival (~1.4s of fade, sticker and scribble) finishes on the
 * engine's own `idle`.
 *
 * With CONFIG.twoPhrase turned back on this wants to be a delay again — the phrase has to
 * be legible as "My name is Andy He" before the typeset version replaces it — which is
 * `HERO_TIMELINE.idle + 1.4` rather than `HERO_TIMELINE.shatter + this`.
 */
export const RESOLVE_LEAD = 0.45

/** Seconds the engine has been asked to freeze at, or null on a normal visit. */
function frozenAt(): number | null {
  if (typeof window === 'undefined') return null
  const raw = new URLSearchParams(window.location.search).get('hero_t')
  if (raw == null) return null
  const t = parseFloat(raw)
  return isFinite(t) ? t : null
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * Under reduced motion the engine settles the card the moment it is ready and its clock
 * never advances past that, so the resolve has to land on `idle` itself rather than on
 * `shatter + RESOLVE_LEAD`. Everything else — including a `?hero_t` capture, which is a
 * still of the real timeline — uses the real beat.
 */
function resolveSeconds(): number {
  return prefersReducedMotion() ? HERO_TIMELINE.idle : HERO_TIMELINE.shatter + RESOLVE_LEAD
}

/**
 * True once the intro has reached its final beat.
 *
 * It is read from the engine's own clock rather than from a timer of our own, so it survives
 * Replay (the clock goes back to zero and the beat plays again), Skip, seeking, tab switches
 * and the pauses the engine takes while it is off screen. Polling at 80ms is far cheaper than
 * a second rAF loop and is twenty times finer than the beat it is looking for; React drops the
 * update whenever the boolean has not actually changed.
 *
 * The poll stops the moment the clock passes the engine's own last beat, because from there it
 * can only be moved by Skip or Replay — and both of those change `introDone`, which re-arms it.
 * Left running it was the last timer awake on a settled page, firing 12.5 times a second for
 * as long as the tab stayed open with nothing left to observe.
 *
 * @param introDone The host's Skip/Replay state, which is what re-arms the poll.
 */
export function useHeroResolve(engine: AsciiHeroInstance | null, introDone: boolean): boolean {
  const [resolved, setResolved] = useState(() => {
    const seek = frozenAt()
    // Start in the right state so a static capture never shoots a half-built frame.
    return seek != null ? seek >= resolveSeconds() : prefersReducedMotion()
  })

  useEffect(() => {
    if (!engine) return
    const at = resolveSeconds()
    let id = 0
    let settled = false
    const read = () => {
      let t: number
      try {
        t = engine.stats().t
      } catch {
        /* an engine build without timing simply leaves the hero where it was */
        return
      }
      setResolved(t >= at)
      // Past the engine's last beat there is nothing left to watch; Hero parks the loop here too.
      if (t < HERO_TIMELINE.idle) return
      settled = true
      if (id) {
        window.clearInterval(id)
        id = 0
      }
    }
    read()
    // A seeked engine (?hero_t) is frozen on one frame, so its clock cannot move either.
    if (!settled && frozenAt() == null) id = window.setInterval(read, 80)
    return () => {
      if (id) window.clearInterval(id)
    }
  }, [engine, introDone])

  return resolved
}
