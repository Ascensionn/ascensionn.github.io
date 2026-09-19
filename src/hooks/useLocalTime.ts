import { useSyncExternalStore } from 'react'

/**
 * The clock reads the *viewer's* own time, not the site owner's: wherever you are, the nav,
 * the About list and the footer show your local hour and zone abbreviation.
 *
 * One module-level ticker serves every <LocalTime>, so four readouts cost one timer, and it
 * fires on the minute rather than every second — there is no seconds digit to update.
 */

const PLACEHOLDER = '--:--'

/** The viewer's IANA zone, e.g. "America/Los_Angeles". Empty when the browser will not say. */
function resolveZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || ''
  } catch {
    return ''
  }
}

/**
 * Formatter for the viewer's zone. A browser that reports a zone Intl then refuses (stale or
 * bogus TZ data) falls back to the runtime default; a browser with no usable Intl at all gets null.
 */
function makeFormatter(): Intl.DateTimeFormat | null {
  const base: Intl.DateTimeFormatOptions = {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZoneName: 'short',
  }
  const zone = resolveZone()
  try {
    return new Intl.DateTimeFormat('en-US', zone ? { ...base, timeZone: zone } : base)
  } catch {
    try {
      return new Intl.DateTimeFormat('en-US', base)
    } catch {
      return null
    }
  }
}

let formatter: Intl.DateTimeFormat | null | undefined

/** e.g. "15:04 EDT", or "15:04 GMT+2" in zones with no abbreviation. */
function read(): string {
  if (formatter === undefined) formatter = makeFormatter()
  const date = new Date()
  if (!formatter) {
    // No Intl: the hour and minute are still true, we just cannot name the zone.
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
  }
  try {
    return formatter.format(date).replace(/\s+/g, ' ')
  } catch {
    return PLACEHOLDER
  }
}

const listeners = new Set<() => void>()
let snapshot = ''
let timer = 0

function publish() {
  const next = read()
  if (next === snapshot) return
  snapshot = next
  for (const listener of listeners) listener()
}

function schedule() {
  // Wake just after the next minute boundary, so the readout flips when the minute does.
  timer = window.setTimeout(tick, 60_000 - (Date.now() % 60_000) + 50)
}

function tick() {
  publish()
  schedule()
}

/** A backgrounded tab has its timers throttled, so re-read the clock the moment it comes back. */
function resync() {
  if (document.visibilityState !== 'visible') return
  window.clearTimeout(timer)
  tick()
}

function subscribe(onChange: () => void) {
  listeners.add(onChange)
  if (listeners.size === 1) {
    snapshot = read()
    schedule()
    document.addEventListener('visibilitychange', resync)
    window.addEventListener('focus', resync)
  }
  return () => {
    listeners.delete(onChange)
    if (listeners.size === 0) {
      window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', resync)
      window.removeEventListener('focus', resync)
    }
  }
}

function getSnapshot(): string {
  if (!snapshot) snapshot = read()
  return snapshot
}

/** No clock on a server — a placeholder keeps the first client paint identical to any markup. */
function getServerSnapshot(): string {
  return PLACEHOLDER
}

/** The viewer's current local time, e.g. "15:04 EDT". Re-renders once a minute, on the minute. */
export function useLocalTime(): string {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
