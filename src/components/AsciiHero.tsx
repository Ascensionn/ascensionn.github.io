import { useEffect, useLayoutEffect, useRef } from 'react'
import { mount, type AsciiHeroInstance, type AsciiHeroOptions, type HeroPhase } from '../ascii/engine'

type Props = AsciiHeroOptions & {
  className?: string
  /** Receives the engine instance once mounted (and null on unmount). Use it for replay/skip controls. */
  onInstance?: (instance: AsciiHeroInstance | null) => void
  onPhase?: (phase: HeroPhase) => void
  onDone?: () => void
}

/** React wrapper around the framework-agnostic canvas engine in src/ascii/engine.ts. */
export function AsciiHero({ className, onInstance, onPhase, onDone, ...options }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const callbacks = useRef({ onInstance, onPhase, onDone })
  // Keep the latest callbacks without re-mounting the engine when a parent re-renders.
  useLayoutEffect(() => {
    callbacks.current = { onInstance, onPhase, onDone }
  })
  const optionsKey = JSON.stringify(options)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const instance = mount(el, JSON.parse(optionsKey) as AsciiHeroOptions)
    const offPhase = instance.on('phase', (p) => callbacks.current.onPhase?.(p))
    const offDone = instance.on('done', () => callbacks.current.onDone?.())
    callbacks.current.onInstance?.(instance)
    ;(window as unknown as { __asciiHero?: AsciiHeroInstance }).__asciiHero = instance
    return () => {
      offPhase()
      offDone()
      callbacks.current.onInstance?.(null)
      instance.destroy()
    }
  }, [optionsKey])

  return <div ref={ref} className={className} aria-hidden="true" />
}
