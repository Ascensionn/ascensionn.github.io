import { useSyncExternalStore } from 'react'

const params = typeof window === 'undefined' ? new URLSearchParams() : new URLSearchParams(window.location.search)

/**
 * Static capture mode: `?hero_t=<sec>` freezes the hero for screenshots.
 * Every reveal/entrance then renders in its final state so full-page captures show all content.
 * main.tsx also flags <html data-capture="static"> so CSS transitions are switched off.
 */
export const STATIC_CAPTURE = params.has('hero_t')

/**
 * `?mark=loop` runs the About statement's word rotation at 700ms instead of 2s — the whole list
 * in a few seconds, which is what the screenshot harness needs to cover every word and every face.
 */
export const MARK_LOOP = params.get('mark') === 'loop'

const reducedQuery = typeof window === 'undefined' ? null : window.matchMedia('(prefers-reduced-motion: reduce)')

function reduced() {
  return reducedQuery?.matches ?? false
}

function subscribeReduced(onChange: () => void) {
  reducedQuery?.addEventListener('change', onChange)
  return () => reducedQuery?.removeEventListener('change', onChange)
}

/** True when motion should be skipped: the visitor asked for reduced motion, or we are capturing. */
export function useStillMode(): boolean {
  return useSyncExternalStore(subscribeReduced, reduced, () => true) || STATIC_CAPTURE
}

/** Non-hook version, for event handlers and imperative code. */
export function isStillMode(): boolean {
  return STATIC_CAPTURE || reduced()
}
