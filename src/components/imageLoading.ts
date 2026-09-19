import { STATIC_CAPTURE } from '../lib/env'

/**
 * Below-the-fold images load lazily, except in static capture mode (?hero_t=…),
 * where full-page screenshots need every image present. captureGate then waits for them to decode.
 */
export const belowFold = STATIC_CAPTURE ? 'eager' : 'lazy'
