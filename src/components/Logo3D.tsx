import { useEffect, useRef } from 'react'
import { mount, type AsciiLogoInstance, type LogoPart, type LogoShape } from '../ascii/logo3d'

type Props = {
  /** Logo image URL. Read pixel-by-pixel, so it must be same-origin. */
  src: string
  /** What the plate is cut from: the artwork's ink, or a whole app tile. */
  shape?: LogoShape
  /** Whether a wordmark beside the mark is dropped. */
  part?: LogoPart
  /** Size trim, 1 = the mark fills the box. */
  scale?: number
  /** Target character columns across the box. */
  cols?: number
  /** Starting angle in turns — stagger a row so four marks never move in lockstep. */
  phase?: number
  seed?: number
  /** Spin rate. Changes are ramped, so a hover accelerates rather than snapping. */
  speed?: number
  className?: string
}

/** Seconds the speed ramp takes to cover a full unit of speed. */
const RAMP_PER_UNIT = 0.42

type LogoWindow = Window & { __logos?: Set<AsciiLogoInstance> }

/**
 * React wrapper around the framework-agnostic engine in src/ascii/logo3d.ts.
 *
 * The canvas it mounts is aria-hidden: the company name beside it is the
 * accessible text, and a turning logo adds nothing a screen reader wants. The
 * engine owns its own IntersectionObserver (offscreen marks stop costing
 * anything), ResizeObserver, reduced-motion handling and theme re-bake, and
 * `destroy()` returns all of them — so React 19's StrictMode double mount leaves
 * exactly one canvas behind.
 */
export function Logo3D({ src, shape, part, scale, cols = 62, phase, seed, speed = 1, className }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const instance = useRef<AsciiLogoInstance | null>(null)
  const current = useRef(speed)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const logo = mount(el, { src, shape, part, scale, cols, phase, seed })
    instance.current = logo
    logo.setSpeed(current.current)
    /* Same debug hook the hero engine exposes, so screenshot probes can seek a
       single mark or read its per-frame cost without a UI for it. */
    const win = window as LogoWindow
    ;(win.__logos ??= new Set()).add(logo)
    return () => {
      win.__logos?.delete(logo)
      instance.current = null
      logo.destroy()
    }
  }, [src, shape, part, scale, cols, phase, seed])

  /* Ease the spin rate toward its target instead of stepping it, so a row that
     lights up under the pointer speeds its mark up rather than jolting it. */
  useEffect(() => {
    if (!instance.current) return
    const from = current.current
    if (from === speed) return
    const duration = Math.abs(speed - from) * RAMP_PER_UNIT * 1000
    if (duration < 16) {
      current.current = speed
      instance.current.setSpeed(speed)
      return
    }
    const t0 = performance.now()
    let raf = requestAnimationFrame(function step(now) {
      const k = Math.min(1, (now - t0) / duration)
      const eased = 1 - Math.pow(1 - k, 3)
      current.current = from + (speed - from) * eased
      /* Read the ref each frame rather than capturing the instance: if the mark
         is remounted mid-ramp, this must drive the live one and never a
         destroyed one. */
      instance.current?.setSpeed(current.current)
      if (k < 1) raf = requestAnimationFrame(step)
      else raf = 0
    })
    return () => {
      if (raf) cancelAnimationFrame(raf)
    }
  }, [speed])

  return <div ref={ref} className={className} aria-hidden="true" />
}
