/*!
 * engine.ts — animated ASCII hero for a monospace character grid.
 *
 *   mount(container, options) -> AsciiHeroInstance
 *
 * Framework-agnostic and dependency-free: it owns one <canvas>, one rAF loop and
 * its own observers, and `destroy()` gives every one of them back. The React
 * wrapper in components/AsciiHero.tsx is a thin effect around those two calls,
 * so a StrictMode double mount/unmount leaves nothing behind.
 *
 * Timeline (CONFIG.twoPhrase === false, which is what the site runs):
 *   density-field patterns -> breakdown -> assemble phrase 1 -> hold ->
 *   shatter (the phrase breaks up again) -> idle.
 *
 * Timeline (CONFIG.twoPhrase === true, kept and still wired):
 *   ... -> hold -> rearrange into phrase 2 -> idle (shimmer + pointer interaction).
 *
 * Everything worth tweaking — phrases, beats, glyph ramps, contour tables,
 * cell sizes, physics — lives in the CONFIG block directly below.
 */

/* ====================================================================== *
 * PUBLIC TYPES                                                           *
 * ====================================================================== */

export type HeroPhase = 'patterns' | 'breakdown' | 'assemble' | 'hold' | 'shatter' | 'rearrange' | 'idle'

/** Contour glyphs by the direction the letter's ink sits in, sparse -> dense. */
export type EdgeGlyphs = {
  top: string[]
  bottom: string[]
  side: string[]
  diagDown: string[]
  diagUp: string[]
  center: string[]
}

export type AsciiHeroOptions = {
  /**
   * [phrase 1, phrase 2]. Only phrase 1 is spelled unless CONFIG.twoPhrase is on,
   * in which case phrase 1 is rearranged cell by cell into phrase 2.
   */
  phrases?: [string, string]
  /** Monospace family the grid glyphs are drawn in. */
  gridFont?: string
  /** Proportional family the phrase letterforms are rasterised from. */
  shapeFont?: string
  shapeWeight?: number
  gridWeight?: number
  inkWeight?: number
  seed?: number
  reducedMotion?: boolean
  interactive?: boolean
  /** Glyph the phrase interiors are filled with. */
  fillChar?: string
  edgeGlyphs?: EdgeGlyphs
  fillThreshold?: number
  inkThreshold?: number
  /**
   * Keeps the top of the card clear of pattern glyphs, in CSS px, so the nav row
   * reads as a row of buttons rather than more texture. The field fades back in
   * over the next 70%. 0 (the default) draws the field full-bleed.
   */
  navClearPx?: number
}

export type AsciiHeroStats = { fps: number; particles: number; cols: number; rows: number; phase: HeroPhase; t: number }

export interface AsciiHeroInstance {
  replay(): void
  skip(): void
  seek(seconds: number): void
  play(): void
  pause(): void
  destroy(): void
  refreshTheme(): void
  stats(): AsciiHeroStats
  on(event: 'phase', cb: (phase: HeroPhase) => void): () => void
  on(event: 'done', cb: () => void): () => void
  readonly phase: HeroPhase
}

/* ====================================================================== *
 * CONFIG                                                                 *
 * ====================================================================== */
const CONFIG = {
  /* --- defaults for mount() options -------------------------------- */
  phrases: ['Welcome to my website!', 'My name is Andy He'] as [string, string],

  /**
   * ONE phrase, or two?
   *
   * `false` — what the site runs. The hero spells phrases[0], holds it, then breaks it
   * apart again with the very same machinery the opening pattern shatters with:
   *
   *     patterns -> breakdown -> assemble phrases[0] -> hold -> shatter -> idle
   *
   * The name is never spelled in characters, because the beat that follows is a typeset
   * identity block (components/HeroIdentity.tsx) that says it in real type — saying it in
   * ASCII first was saying the same thing twice.
   *
   * `true` — the original choreography, where the settled phrase travels cell by cell into
   * phrases[1] instead of breaking up:
   *
   *     patterns -> breakdown -> assemble phrases[0] -> hold -> rearrange -> phrases[1] -> idle
   *
   * Nothing was deleted to turn it off: T.rearrange, the flight.rearrange* tuning,
   * planRearrange(), the phrases[1] target raster and the 'rearrange' phase are all still
   * here and still tested by this flag. Flipping it to `true` is the whole edit — the beat
   * lands at T.rearrange (which shares its slot with T.shatter), and the hero's own resolve
   * (components/useHeroResolve.ts) then wants its RESOLVE_LEAD turned back into a delay.
   */
  twoPhrase: false,

  gridFont: '"Geist Mono", ui-monospace, monospace',
  shapeFont: '"Geist", system-ui, sans-serif',
  shapeWeight: 700, // weight the phrase letterforms are rasterised at
  gridWeight: 500, // weight the pattern glyphs are baked at
  inkWeight: 700, // weight the phrase / particle glyphs are baked at
  seed: 20260917,
  navClearPx: 0, // see AsciiHeroOptions.navClearPx

  /* --- timeline, in seconds. Referenced symbolically everywhere. ----
     Each beat is long enough to be seen as its own move: ~2.3s of pattern, ~2.3s of
     debris in the air, ~2.4s of the phrase arriving, ~2.1s to read it, then ~1.9s of
     break-up during which the identity block is already fading in over the top. */
  T: {
    morph: 2.3, // bead string begins sifting into the vortex
    morphEnd: 3.0,
    breakdown: 4.3, // pattern shatters, cells detach as particles
    assemble: 6.6, // particles fly into phrase 1
    hold: 8.9, // phrase 1 fully legible
    /* The two mutually exclusive fifth beats — see CONFIG.twoPhrase. They share a slot
       on purpose: whichever one is running, the beat before and after it are unchanged. */
    shatter: 11.0, // twoPhrase === false: phrase 1 breaks apart again
    rearrange: 11.0, // twoPhrase === true: phrase 1 travels to phrase 2
    idle: 12.9, // settled; ambient shimmer + pointer (single-phrase: clean paper)
    benchSecs: 15.0, // length of the ?hero_bench=1 run
    skipLead: 0.45, // skip() lands this far before `idle`
    seekTailSecs: 4.0, // seek() past idle+this is clamped (nothing moves after)
  },

  /* --- glyph vocabulary --------------------------------------------- */
  glyphs: {
    // density ramp, dense -> sparse. Index 0 is the darkest cell.
    ramp: ['N', 'O', 'A', '8', '6', '9', '4', '5', '2', 'I', '3', '?', '!', '<', '>', '=', '+', '/', ':', '-', '·'],
    // reduced ramp used by the vortex so it reads as one surface
    vortex: ['N', 'O', 'A', '8', '6', '9', '4', '2', ':', '·'],
    // chaotic pool the glyphs mutate through while flying
    chaos: ('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#&@%^`~{}[]|\\/_;:!?<>=+-*.,$' + 'ÉÄÅØÖÜÑ·').split(''),
    // light marks shown mid-flight and under the pointer
    transit: '·:-=+/\\|!?<>~*'.split(''),
    // idle shimmer pool — deliberately light so it can never punch a hole in a stem
    shimmer: '·.,:;\'"~^-_+='.split(''),
    // direction-aware streak marks for fast movers
    streakH: ['-', '=', '~'],
    streakV: ['|', '!'],
    streakD1: ['/'],
    streakD2: ['\\'],
    trailFar: '·',
  },

  /* --- phrase rendering (the payoff: legibility is the quality bar) -- */
  phrase: {
    fillChar: '/', // interiors are filled entirely with this glyph
    fillThreshold: 0.6, // coverage at/above this -> solid fill, no exceptions
    inkThreshold: 0.26, // coverage below this -> empty cell
    smallFillThreshold: 0.5, // crisper contour on fine grids (stems < 3 columns)
    smallInkThreshold: 0.31,
    fillTile: 1.32, // fill glyph is scaled until it tiles the cell by this factor
    inkScale: 1.18, // contour/particle glyphs are baked this much larger than the cell
    supersample: 5, // horizontal samples per cell when rasterising
    /* Contour glyphs, chosen by coverage AND gradient orientation, sparse ->
       dense. The vital part is WHERE each glyph's ink sits inside its cell:
       along a letter's TOP edge the ink is in the lower part of the cell, so
       that list has to be low-sitting marks (. , _ =) — high marks like ^ and "
       there read as a detached dotted line floating above the letter. */
    edge: {
      top: ['·', '.', ',', '_', '_', '=', '='], // letter's top edge: ink low in cell
      bottom: ['·', '`', "'", '"', '^', '~', '*'], // letter's bottom edge: ink high in cell
      side: ['·', '.', ':', ';', '!', '|', '|', 'I'],
      diagDown: ['·', '.', ',', '/', '/', '/', '/'], // ink toward lower-left
      diagUp: ['·', '.', ',', '\\', '\\', '\\', '\\'], // ink toward lower-right
      center: ['·', '.', ':', '+', '*'],
    } satisfies EdgeGlyphs,
    /* The two bands the wordmark may not enter, in CSS px measured from the card's edges.
       Both are real furniture: the nav capsules along the top and the caption chips plus
       the progress rule along the bottom. They matter more than they used to — a phrase as
       long as "Welcome to my website!" breaks onto three lines and then wants every pixel
       of height between them, so an under-measured band is a collision rather than a gap. */
    navPx: 56, // matches Hero.tsx's NAV_CLEAR_PX
    footPx: 68, // hero padding + one chip + the rule beneath it
    padXFrac: 0.065, // >= 6% horizontal padding
    bottomRows: 1.2,
    maxLines: 4,
    leadEm: 1.06, // baseline-to-baseline, in ems of the probe size
    linePenalty: 0.085, // prefer fewer lines on near-ties
    namePenalty: 0.8, // discourage splitting capitalised runs ("Andy He")
    balanceWeight: 0.1,
    /* A tall, narrow card physically caps how wide the letters can be, which
       on a phone leaves a short wordmark floating in a lot of empty height.
       There the letters are allowed to grow taller than wide — a condensed
       cut of the same face. Landscape cards never stretch (see stretchAspect). */
    stretchMax: 1.62, // hard cap on the vertical-only scale
    stretchFill: 0.68, // take this much of the spare height
    stretchAspect: [0.85, 1.8], // card H/W where stretching fades in
  },

  /* --- grid sizing --------------------------------------------------- */
  grid: {
    dprCap: 2,
    phoneMaxW: 700, // cards narrower than this use the phone curve
    phoneDiv: 50,
    /* Only binds below ~350px of card, where the longest word in the phrase ("website!")
       is what caps the type size: a finer grid there buys the stems another column of ink
       each, which is the difference between letterforms and diagonal hatching at 320. */
    phoneMin: 6.0,
    phoneMax: 9.5,
    deskDiv: 108,
    deskMin: 9.0,
    deskMax: 13.0,
    rowRatio: 1.24, // row height / font size (spec: 1.15 - 1.30)
  },

  /* --- pattern fields -------------------------------------------------
     Both fields are density maps in a normalised space where the card's
     half-HEIGHT is 1, so x runs to +/- (cardW / cardH). Density 1 picks the
     darkest ramp glyph, 0 leaves the cell empty. */
  pattern: {
    // the bead string: lens / diamond shapes threaded on the centre axis
    beadFreq: 1.5, // beads per normalised half-height
    beadFlow: 0.3, // vertical drift speed of the string
    neck: 0.075, // half-width at a pinch (normalised)
    lens: 0.8, // half-width at a bead's waist
    coreGap: 0.11, // rho below this is the empty centre axis / neck dots
    plateau: 0.7, // rho where the dense rim plateau begins
    rimSoft: 0.055, // width of the anti-aliased outer edge, in rho
    ringsIn: [1.4, 2.6], // nested contour rings inside one bead
    rippleDepth: 0.34, // how much those rings modulate the ramp
    ringFlow: 0.42, // contours travel outward at this rate
    coreGain: 1.3, // pushes the bead plateau into the darkest ramp glyphs

    // the halo: the same contours running on to both card edges
    ringFar: 0.15, // far-field ring spacing (normalised units)
    bandGamma: 0.55, // 0 = plain cosine rings, 1 = hard contour plateaus
    farAmp: 0.34, // far-field contrast relative to the bead core
    farDecay: 0.8, // how fast the halo thins toward the card edge
    farFloor: 0.07, // ... but it never dies, so the stream reaches the edge
    farNeck: 0.38, // halo strength on the rows between two beads
    farDrop: [0.06, 0.58], // halo cells dropped, at the bead rim -> at the card edge

    revealSecs: 1.05, // centre-outward decode reveal at t = 0
    revealSeed: 0.13, // ... which starts as a small disc, never a blank card
    revealBand: 0.16, // width of the decoding front, in normalised radius
    inkFloor: 0.06, // density below this leaves the cell empty
    vignette: 0.22, // gentle fade at the extreme top/bottom rows

    // the funnel
    vortexMouth: 0.88, // funnel mouth as a fraction of the card half-width
    vortexStem: 0.045, // radius where the stem trails off the bottom
    vortexTaper: 2.25, // > 1 gives a concave trumpet rather than a "V"
    vortexSway: 0.3, // how far the axis snakes from side to side
    vortexSpin: 3.1, // rad/s the helix rotates
    vortexStripes: 7.0, // helical stripes across the visible surface
    vortexTwist: 15.0, // rad the helix turns over the cone's height
    vortexBase: 0.34, // floor density inside the cone (keeps it a surface)
    vortexDrop: 0.1, // base dropout so the funnel visibly dissolves
    debris: 0.055, // sparse motes orbiting outside the cone
  },

  /* --- breakdown physics --------------------------------------------- */
  physics: {
    shearSecs: 0.42, // rows shear sideways in bands as they let go
    shearCells: 11,
    releaseSpread: 0.46, // whole field is airborne this fast (keeps 4.9s explosive)
    releaseTopBias: 0.62,
    burstSpeed: [80, 340], // px/s outward from the card centre, per grain
    burstSwirl: 0.85, // tangential share of that, so the burst rotates
    gravity: [90, 1230], // px/s^2, ramped over gravityRamp
    gravityRamp: [0.24, 0.86], // seconds after `breakdown`
    turbulence: [60, 380], // curl-noise strength, decaying over turbulenceFade
    turbulenceFade: 1.55,
    drag: [0.26, 0.98], // per-grain drag, so the swarm separates
    wallMarginCells: 9, // soft inward force instead of a reflective bounce
    wallForce: 58,
    floorDelay: 0.95, // heap starts catching grains this long after breakdown
    heapDeposit: 0.62,
    floaters: 0.06, // fraction that drifts instead of falling
    fastStreak: 620, // px/s above which a grain may draw as a streak + trail
    streakFrac: 0.55, // ... and this fraction of those actually do (rest stay chaotic)
  },

  /* --- choreography --------------------------------------------------- */
  flight: {
    assembleSweep: 0.44, // left-to-right launch stagger (seconds)
    assembleDur: [0.66, 0.3], // flight time: base + random
    assembleArc: [0.1, 0.22], // sideways bow, as a fraction of the flight's rise
    rearrangeSweep: 1.45, // the wave that eats phrase 1 and writes phrase 2
    rearrangeDur: [0.42, 0.18],
    rearrangeArc: 0.17,
    recycleFrac: 0.16, // longest crossings peel off; a fresh grain flies in
    recycleMinFrac: 0.3, // ... when longer than this fraction of the diagonal
    peelFade: 0.34,
    surplusFactor: 1.26, // particles allocated relative to the larger phrase
  },

  /* --- the single-phrase break-up (twoPhrase === false) ---------------
     Not a second set of physics: every grain goes back through release() and the same
     M_FREE integrator the opening breakdown uses — burst, curl turbulence, gravity ramp,
     soft walls — so the phrase comes apart in the card's own handwriting. These four
     numbers only decide WHEN each grain lets go and how fast the swarm stops existing,
     because unlike the breakdown this one has to end: the card has to be clean paper by
     the time the identity block has finished arriving, with no heap left along the foot. */
  shatter: {
    sweep: 0.38, // left-to-right release stagger, so the phrase comes apart as a wave
    jitter: 0.12, // per-grain randomness on top of that sweep
    fadeFrom: 0.55, // seconds after `shatter` that the swarm starts fading out (after the last grain lets go)
    fadeSpan: 0.8, // ... and this long later the last grain is gone, well before skip() lands
  },

  /* --- idle life & interaction ---------------------------------------- */
  idle: {
    shimmerHold: 0.014, // chance a contour cell flickers, during the hold
    shimmerIdle: 0.01, // ... and once settled. Fill cells never flicker.
    shimmerHz: 3.3, // flicker buckets per second (also the idle re-render rate)
    pointerRadiusCells: 16, // cells the pointer pushes
    pointerForce: 4600,
    pointerScrambleCells: 7, // cells that also swap to a transit glyph
    springK: 210,
    springDamp: 13, // critically damped spring back to the cell
    leftoverAlpha: 0.62, // loose material recedes once letters start forming
  },

  // six baked alpha levels: the renderer never touches ctx.globalAlpha
  alphas: [1, 0.82, 0.64, 0.46, 0.3, 0.16],
}

/** The beats of the intro, in seconds — the hero card reads `idle` to time its own resolve. */
export const HERO_TIMELINE = CONFIG.T

/* ====================================================================== *
 * math                                                                   *
 * ====================================================================== */
const DT = 1 / 60

function mulberry32(a: number): () => number {
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
function hash3(x: number, y: number, s: number): number {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1442695041)) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}
function clamp(v: number, a: number, b: number): number {
  return v < a ? a : v > b ? b : v
}
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}
function smoothstep(e0: number, e1: number, x: number): number {
  const t = clamp((x - e0) / (e1 - e0), 0, 1)
  return t * t * (3 - 2 * t)
}
function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}
function vnoise(x: number, y: number, s: number): number {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const xf = x - xi
  const yf = y - yi
  const u = xf * xf * (3 - 2 * xf)
  const v = yf * yf * (3 - 2 * yf)
  const a = hash3(xi, yi, s)
  const b = hash3(xi + 1, yi, s)
  const c = hash3(xi, yi + 1, s)
  const d = hash3(xi + 1, yi + 1, s)
  return lerp(lerp(a, b, u), lerp(c, d, u), v)
}

/* Hoare quickselect: partition idx[lo..hi) so the k-th element sits in place.
   Deterministic (median-of-three pivot) and allocation-free. */
function nthBy(idx: Int32Array, lo: number, hi: number, k: number, key: Float32Array): void {
  while (hi - lo > 1) {
    const a = key[idx[lo]]
    const b = key[idx[(lo + hi) >> 1]]
    const c = key[idx[hi - 1]]
    const p = a < b ? (b < c ? b : a < c ? c : a) : a < c ? a : b < c ? c : b
    let i = lo
    let j = hi - 1
    while (i <= j) {
      while (key[idx[i]] < p) i++
      while (key[idx[j]] > p) j--
      if (i <= j) {
        const t = idx[i]
        idx[i] = idx[j]
        idx[j] = t
        i++
        j--
      }
    }
    if (k <= j) hi = j + 1
    else if (k >= i) lo = i
    else return
  }
}

type FontSpec = { spec: string; text: string }

function loadFonts(specs: FontSpec[], timeout: number): Promise<boolean> {
  if (!document.fonts || !document.fonts.load) return Promise.resolve(false)
  const jobs = specs.map((s) => {
    try {
      return document.fonts.load(s.spec, s.text)
    } catch {
      return Promise.resolve([])
    }
  })
  const all = Promise.all(jobs).then(
    () => true,
    () => false,
  )
  return Promise.race([all, new Promise<boolean>((r) => setTimeout(() => r(false), timeout))])
}

/* ====================================================================== *
 * internal types                                                         *
 * ====================================================================== */

/** One measured candidate line of a phrase layout. */
type LineInfo = { text: string; w: number; left: number; asc: number; desc: number }

/** The winning line-break layout for a phrase, with its measured scale. */
type Layout = { score: number; S: number; SV: number; top: number; inkH: number; lead: number; lines: LineInfo[] }

/** A rasterised phrase: one entry per lit cell, in grid and pixel coordinates. */
type Targets = {
  n: number
  x: Float32Array
  y: Float32Array
  g: Uint16Array
  col: Int16Array
  row: Int16Array
  edge: Uint8Array
  lines: string[]
  capRows: number
}

type PhaseListener = (phase: HeroPhase) => void
type DoneListener = () => void

type HeroWindow = Window & typeof globalThis & { __asciiHero?: AsciiHeroInstance | null }

/* ====================================================================== *
 * mount                                                                  *
 * ====================================================================== */
export function mount(container: HTMLElement, options: AsciiHeroOptions = {}): AsciiHeroInstance {
  const opt = options
  const T = CONFIG.T
  const PH = CONFIG.phrase
  const GR = CONFIG.grid
  const PT = CONFIG.pattern
  const FX = CONFIG.physics
  const FL = CONFIG.flight
  const SH = CONFIG.shatter
  const ID = CONFIG.idle
  const win = window as HeroWindow

  /** See CONFIG.twoPhrase. `BREAK` is whichever of the two fifth beats is live. */
  const twoPhrase = CONFIG.twoPhrase
  const BREAK = twoPhrase ? CONFIG.T.rearrange : CONFIG.T.shatter

  const phrases: [string, string] =
    opt.phrases && opt.phrases.length >= 2 ? [String(opt.phrases[0]), String(opt.phrases[1])] : [CONFIG.phrases[0], CONFIG.phrases[1]]
  const gridFont = opt.gridFont || CONFIG.gridFont
  const shapeFont = opt.shapeFont || CONFIG.shapeFont
  const shapeWeight = opt.shapeWeight || CONFIG.shapeWeight
  const gridWeight = opt.gridWeight || CONFIG.gridWeight
  const inkWeight = opt.inkWeight || CONFIG.inkWeight
  const seed = (opt.seed == null ? CONFIG.seed : opt.seed) | 0
  const reduced =
    opt.reducedMotion != null ? !!opt.reducedMotion : !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  const interactive = opt.interactive !== false
  const navClearPx = opt.navClearPx == null ? CONFIG.navClearPx : opt.navClearPx

  const FILL_CH = opt.fillChar ? String(opt.fillChar).charAt(0) : PH.fillChar
  const EDGE: EdgeGlyphs = opt.edgeGlyphs || PH.edge
  const FILL_TH_BIG = opt.fillThreshold || PH.fillThreshold
  const INK_TH_BIG = opt.inkThreshold || PH.inkThreshold

  /* ---------- glyph table ---------- */
  const G = CONFIG.glyphs
  const CHARSET: string[] = (() => {
    const seen: Record<string, 1> = {}
    const out: string[] = []
    const add = (list: string[]) => {
      for (let i = 0; i < list.length; i++) {
        const c = list[i]
        if (c && !seen[c]) {
          seen[c] = 1
          out.push(c)
        }
      }
    }
    add(G.ramp)
    add(G.vortex)
    add(G.chaos)
    add(G.transit)
    add(G.shimmer)
    add(G.streakH)
    add(G.streakV)
    add(G.streakD1)
    add(G.streakD2)
    add([G.trailFar])
    add([FILL_CH])
    add(EDGE.top)
    add(EDGE.bottom)
    add(EDGE.side)
    add(EDGE.diagDown)
    add(EDGE.diagUp)
    add(EDGE.center)
    return out
  })()
  const CHAR_INDEX: Record<string, number> = {}
  for (let ci = 0; ci < CHARSET.length; ci++) CHAR_INDEX[CHARSET[ci]] = ci
  function ids(list: string[]): Uint16Array {
    const a = new Uint16Array(list.length)
    for (let i = 0; i < list.length; i++) a[i] = CHAR_INDEX[list[i]]
    return a
  }

  const RAMP_ID = ids(G.ramp)
  const RAMP_N = RAMP_ID.length
  const VORT_ID = ids(G.vortex)
  const VORT_N = VORT_ID.length
  const CHAOS_ID = ids(G.chaos)
  const CHAOS_N = CHAOS_ID.length
  const TRANS_ID = ids(G.transit)
  const TRANS_N = TRANS_ID.length
  const SHIM_ID = ids(G.shimmer)
  const SHIM_N = SHIM_ID.length
  const SH_ID = ids(G.streakH)
  const SV_ID = ids(G.streakV)
  const SD1_ID = ids(G.streakD1)
  const SD2_ID = ids(G.streakD2)
  const TRAIL_FAR = CHAR_INDEX[G.trailFar]
  const FILL_ID = CHAR_INDEX[FILL_CH]
  const EDGE_TOP = ids(EDGE.top)
  const EDGE_BOT = ids(EDGE.bottom)
  const EDGE_SIDE = ids(EDGE.side)
  const EDGE_DD = ids(EDGE.diagDown)
  const EDGE_DU = ids(EDGE.diagUp)
  const EDGE_CEN = ids(EDGE.center)
  const EMPTY = 0xffff

  function chaosAt(a: number, b: number, c: number): number {
    return CHAOS_ID[(hash3(a, b, c) * CHAOS_N) | 0]
  }
  function transitAt(a: number, b: number): number {
    return TRANS_ID[(hash3(a, b, 613) * TRANS_N) | 0]
  }
  function streakAt(vx: number, vy: number, h: number): number {
    const ax = vx < 0 ? -vx : vx
    const ay = vy < 0 ? -vy : vy
    if (ax > ay * 2.2) return SH_ID[(h * SH_ID.length) | 0]
    if (ay > ax * 2.2) return SV_ID[(h * SV_ID.length) | 0]
    return (vx > 0) === (vy > 0) ? SD2_ID[0] : SD1_ID[0]
  }

  /* ---------- canvas ---------- */
  if (window.getComputedStyle(container).position === 'static') container.style.position = 'relative'
  const canvas = document.createElement('canvas')
  canvas.setAttribute('aria-hidden', 'true')
  canvas.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;display:block;pointer-events:none;background:transparent;'
  container.appendChild(canvas)
  const ctx = canvas.getContext('2d', { alpha: true }) as CanvasRenderingContext2D

  let params: URLSearchParams | null = null
  try {
    params = new URLSearchParams(window.location.search)
  } catch {
    params = null
  }
  const seekParam = params && params.has('hero_t') ? parseFloat(params.get('hero_t') as string) : null
  const benchMode = !!(params && params.get('hero_bench') === '1')

  /* ---------- grid + atlas state ---------- */
  let W = 0
  let H = 0
  let dpr = 1
  let advRatio = 0.6
  let fontSize = 12
  let cellW = 7
  let cellH = 15
  let cols = 0
  let rows = 0
  let gridX0 = 0
  let gridY0 = 0
  let aspect = 1.6
  let navRows = 3
  let colPx = new Int32Array(0) // integer device-pixel origins
  let rowPx = new Int32Array(0)
  let ink = '#151515'
  /* One atlas canvas per weight band. The pattern band's glyphs sit inside
     their cell, so its slots are tight; the ink band has to hold the
     oversized fill glyph, so its slots are generous. Keeping them apart makes
     the pattern phase — by far the most cells per frame — the cheap one. */
  const atlasBand: HTMLCanvasElement[] = []
  const slotW = [0, 0]
  const slotH = [0, 0]
  const padX = [0, 0]
  const padY = [0, 0]
  const ALPHAS = CONFIG.alphas
  const NA = ALPHAS.length
  const BAND_PAT = 0
  const BAND_INK = 1

  let ready = false
  let destroyed = false
  const measureCtx = document.createElement('canvas').getContext('2d') as CanvasRenderingContext2D

  function readInk(): void {
    const cs = window.getComputedStyle(container)
    const v = (cs.getPropertyValue('--ascii-ink') || '').trim()
    ink = v || cs.color || '#151515'
  }

  function measureAdvance(): void {
    measureCtx.font = gridWeight + ' 100px ' + gridFont
    const w = measureCtx.measureText('MMMMMMMMMM').width / 10
    advRatio = w > 10 && w < 100 ? w / 100 : 0.6
  }

  /* Responsive cell size. Desktop lands at 11-13px / 150-190 columns on a
     1440px card; phones use a finer grid because a 390px card physically
     caps the cap-height, and column resolution is the only lever left. */
  function sizeGrid(): void {
    const rect = container.getBoundingClientRect()
    W = Math.max(64, rect.width || container.clientWidth || 64)
    H = Math.max(64, rect.height || container.clientHeight || 64)
    dpr = Math.min(GR.dprCap, window.devicePixelRatio || 1)
    const fs = W < GR.phoneMaxW ? clamp(W / GR.phoneDiv, GR.phoneMin, GR.phoneMax) : clamp(W / GR.deskDiv, GR.deskMin, GR.deskMax)
    fontSize = Math.round(fs * 2) / 2
    cellW = fontSize * advRatio
    cellH = Math.round(fontSize * GR.rowRatio * dpr) / dpr // whole device pixels
    cols = Math.max(12, Math.floor(W / cellW))
    rows = Math.max(8, Math.floor(H / cellH))
    gridX0 = (W - cols * cellW) * 0.5
    gridY0 = (H - rows * cellH) * 0.5
    aspect = cellH / cellW
    navRows = Math.max(2, Math.ceil(PH.navPx / cellH))
    const wd = Math.round(W * dpr)
    const hd = Math.round(H * dpr)
    if (canvas.width !== wd) canvas.width = wd
    if (canvas.height !== hd) canvas.height = hd
    colPx = new Int32Array(cols)
    rowPx = new Int32Array(rows)
    for (let c = 0; c < cols; c++) colPx[c] = Math.round((gridX0 + c * cellW) * dpr)
    for (let r = 0; r < rows; r++) rowPx[r] = Math.round((gridY0 + r * cellH) * dpr)
  }
  function cellX(c: number): number {
    return gridX0 + (c + 0.5) * cellW
  }
  function cellY(r: number): number {
    return gridY0 + (r + 0.5) * cellH
  }
  function colOf(x: number): number {
    const c = Math.floor((x - gridX0) / cellW)
    return c < 0 ? 0 : c >= cols ? cols - 1 : c
  }

  /* ---------- glyph atlas ----------
     Two weight bands (pattern, ink) x six baked alpha levels, so the renderer
     never touches ctx.globalAlpha and never switches fonts. The fill glyph is
     scaled until it tiles its cell, which is what turns the "/" hatch into a
     near-solid stroke instead of a grey stripe pattern. */
  function buildAtlas(): void {
    const n = CHARSET.length
    const cwD = cellW * dpr
    const chD = cellH * dpr

    // size the fill glyph so its ink box covers a whole cell in both axes
    measureCtx.font = inkWeight + ' 100px ' + gridFont
    const fm = measureCtx.measureText(FILL_CH)
    const fh = ((fm.actualBoundingBoxAscent || 72) + (fm.actualBoundingBoxDescent || 0)) / 100
    const fw = ((fm.actualBoundingBoxLeft || 0) + (fm.actualBoundingBoxRight || fm.width)) / 100
    const fillPx = Math.min(Math.max((chD * PH.fillTile) / Math.max(0.2, fh), (cwD * PH.fillTile) / Math.max(0.2, fw)), chD * 2.1)
    const baseline = 0.045 * fontSize * dpr // optical centring nudge

    for (let band = 0; band < 2; band++) {
      const pat = band === BAND_PAT
      const weight = pat ? gridWeight : inkWeight
      const size = pat ? fontSize * dpr : fontSize * dpr * PH.inkScale
      // how far the widest / tallest glyph in this band spills out of its cell
      const spillW = pat ? size * 0.34 : Math.max(fillPx * fw, size * 0.62)
      const spillH = pat ? size * 0.62 : Math.max(fillPx * fh, size * 0.8)
      padX[band] = Math.ceil(Math.max(1, (spillW - cwD) * 0.5 + 1))
      padY[band] = Math.ceil(Math.max(1, (spillH - chD) * 0.5 + 1))
      slotW[band] = Math.ceil(cwD) + 2 * padX[band]
      slotH[band] = Math.ceil(chD) + 2 * padY[band]

      const a = atlasBand[band] || document.createElement('canvas')
      a.width = slotW[band] * n
      a.height = slotH[band] * NA
      const c2 = a.getContext('2d') as CanvasRenderingContext2D
      c2.clearRect(0, 0, a.width, a.height)
      c2.textAlign = 'center'
      c2.textBaseline = 'middle'
      c2.fillStyle = ink
      for (let ai = 0; ai < NA; ai++) {
        c2.globalAlpha = ALPHAS[ai]
        const y = ai * slotH[band] + slotH[band] * 0.5 + baseline
        for (let i = 0; i < n; i++) {
          const px2 = !pat && i === FILL_ID ? fillPx : size
          c2.font = weight + ' ' + px2.toFixed(2) + 'px ' + gridFont
          c2.fillText(CHARSET[i], i * slotW[band] + slotW[band] * 0.5, y)
        }
      }
      c2.globalAlpha = 1
      atlasBand[band] = a
    }
  }

  function alphaIdx(a: number): number {
    return a >= 0.91 ? 0 : a >= 0.73 ? 1 : a >= 0.55 ? 2 : a >= 0.38 ? 3 : a >= 0.23 ? 4 : a >= 0.07 ? 5 : -1
  }
  function drawCell(g: number, band: number, ai: number, c: number, r: number): void {
    const sw = slotW[band]
    const sh = slotH[band]
    ctx.drawImage(atlasBand[band], g * sw, ai * sh, sw, sh, colPx[c] - padX[band], rowPx[r] - padY[band], sw, sh)
  }

  /* Per-frame occupancy stamp: exactly one glyph per cell, first writer wins.
     Keeps overlapping grains from blitting into bold mud and snaps every
     particle to the character grid. */
  let occ = new Uint32Array(0)
  let occStamp = 0
  function beginOcc(): void {
    if (occ.length !== cols * rows) {
      occ = new Uint32Array(cols * rows)
      occStamp = 0
    }
    if (++occStamp > 4000000000) {
      occ.fill(0)
      occStamp = 1
    }
  }
  function plot(g: number, band: number, ai: number, x: number, y: number): void {
    const c = Math.floor((x - gridX0) / cellW)
    const r = Math.floor((y - gridY0) / cellH)
    if (c < 0 || r < 0 || c >= cols || r >= rows) return
    const k = r * cols + c
    if (occ[k] === occStamp) return
    occ[k] = occStamp
    drawCell(g, band, ai, c, r)
  }

  /* ====================================================================
   * PHRASE LAYOUT & RASTERISATION
   * ==================================================================== */

  /* Enumerate word-boundary line splits, score by MEASURED letter size with a
     line-count penalty, a balance term and a penalty for splitting
     capitalised runs, then keep the layout that makes the letters biggest. */
  function layoutPhrase(text: string): Layout {
    let words = String(text).trim().split(/\s+/).filter(Boolean)
    if (!words.length) words = [' ']
    const gaps = words.length - 1
    measureCtx.font = shapeWeight + ' 100px ' + shapeFont

    const padXpx = Math.max(cellW * 3, W * PH.padXFrac)
    const topY = gridY0 + navRows * cellH + cellH * 0.6
    // Whichever is higher: the grid's own bottom margin, or the caption row's real band.
    const botY = Math.min(gridY0 + (rows - PH.bottomRows) * cellH, H - PH.footPx)
    const availW = Math.max(10, W - padXpx * 2)
    const availH = Math.max(10, botY - topY)
    const LEAD = PH.leadEm * 100

    const combos = gaps <= 14 ? 1 << gaps : 1 // >15 words: single line + greedy fallback
    let best: Layout | null = null
    const info: LineInfo[] = []
    for (let mask = 0; mask < combos; mask++) {
      let nl = 1
      let mm = mask
      while (mm) {
        nl += mm & 1
        mm >>= 1
      }
      if (nl > PH.maxLines) continue
      const lines: string[] = []
      let cur = words[0]
      for (let gi = 0; gi < gaps; gi++) {
        if (mask & (1 << gi)) {
          lines.push(cur)
          cur = words[gi + 1]
        } else cur += ' ' + words[gi + 1]
      }
      lines.push(cur)
      let maxW = 0
      let minW = 1e9
      info.length = 0
      for (let li = 0; li < lines.length; li++) {
        const m = measureCtx.measureText(lines[li])
        const lw = (m.actualBoundingBoxLeft || 0) + (m.actualBoundingBoxRight || m.width)
        info.push({
          text: lines[li],
          w: lw,
          left: m.actualBoundingBoxLeft || 0,
          asc: Math.max(m.actualBoundingBoxAscent || 72, 50),
          desc: Math.max(m.actualBoundingBoxDescent || 0, 0),
        })
        if (lw > maxW) maxW = lw
        if (lw < minW) minW = lw
      }
      const inkH = info[0].asc + (lines.length - 1) * LEAD + info[info.length - 1].desc
      const S = Math.min(availW / maxW, availH / inkH)
      let score = S * (1 - PH.linePenalty * (lines.length - 1)) * (1 - PH.balanceWeight + PH.balanceWeight * (minW / maxW))
      for (let g2 = 0; g2 < gaps; g2++) {
        if ((mask & (1 << g2)) !== 0 && /^[A-Z]/.test(words[g2]) && /^[A-Z]/.test(words[g2 + 1])) score *= PH.namePenalty
      }
      if (!best || score > best.score) {
        best = { score: score, S: S, SV: 1, top: 0, lines: info.slice(), inkH: inkH, lead: LEAD }
      }
    }
    // mask 0 (everything on one line) always scores, so a winner always exists.
    const L = best as Layout
    L.S *= 0.99

    /* Vertical-only growth on portrait cards: the letters keep their width but
       take some of the spare height, so a phone gets a wordmark with real
       presence instead of a thin band. Landscape cards get SV === 1. */
    const maxSV = 1 + (PH.stretchMax - 1) * smoothstep(PH.stretchAspect[0], PH.stretchAspect[1], H / Math.max(1, W))
    const fitV = availH / Math.max(1, L.inkH * L.S)
    L.SV = clamp(1 + (fitV - 1) * PH.stretchFill, 1, maxSV)

    // centre the measured ink box between the nav row and the bottom margin
    const blockH = L.inkH * L.S * L.SV
    L.top = topY + (availH - blockH) * 0.5
    if (L.top < topY) L.top = topY
    return L
  }

  let covAtCols = 0
  let covAtRows = 0
  function covAt(cov: Float32Array, c: number, r: number): number {
    if (c < 0 || c >= covAtCols || r < 0 || r >= covAtRows) return 0
    return cov[r * covAtCols + c]
  }

  function pickGlyph(cov: Float32Array, c: number, r: number, fillTh: number, inkTh: number): number {
    const v = covAt(cov, c, r)
    if (v >= fillTh) return FILL_ID // solid interior, no exceptions
    if (v < inkTh) return -1
    const gx =
      covAt(cov, c + 1, r - 1) +
      2 * covAt(cov, c + 1, r) +
      covAt(cov, c + 1, r + 1) -
      (covAt(cov, c - 1, r - 1) + 2 * covAt(cov, c - 1, r) + covAt(cov, c - 1, r + 1))
    const gy =
      covAt(cov, c - 1, r + 1) +
      2 * covAt(cov, c, r + 1) +
      covAt(cov, c + 1, r + 1) -
      (covAt(cov, c - 1, r - 1) + 2 * covAt(cov, c, r - 1) + covAt(cov, c + 1, r - 1))
    const u = clamp((v - inkTh) / (fillTh - inkTh), 0, 1)
    const ax = gx < 0 ? -gx : gx
    const ay = gy < 0 ? -gy : gy
    let set: Uint16Array
    if (ax + ay < 1e-3) set = EDGE_CEN
    else if (ay >= ax * 1.9) set = gy > 0 ? EDGE_TOP : EDGE_BOT // interior below -> top edge
    else if (ax >= ay * 1.9) set = EDGE_SIDE
    else set = gx * gy > 0 ? EDGE_DU : EDGE_DD
    return set[Math.min(set.length - 1, (u * set.length) | 0)]
  }

  /* Rasterise the phrase at supersampled resolution that respects the cell
     aspect, then turn per-cell coverage + gradient into glyph ids. */
  function buildTargets(text: string): Targets {
    const L = layoutPhrase(text)
    const SX = PH.supersample
    const SY = Math.max(SX, Math.min(16, Math.round(SX * aspect)))
    const rw = cols * SX
    const rh = rows * SY
    const rcan = document.createElement('canvas')
    rcan.width = rw
    rcan.height = rh
    const rc = rcan.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D
    rc.setTransform(SX / cellW, 0, 0, SY / cellH, 0, 0)
    rc.translate(-gridX0, -gridY0)
    rc.fillStyle = '#000'
    rc.textAlign = 'left'
    rc.textBaseline = 'alphabetic'
    rc.font = shapeWeight + ' ' + (100 * L.S).toFixed(2) + 'px ' + shapeFont
    const SV = L.SV || 1
    const capRows = (L.lines[0].asc * L.S * SV) / cellH
    for (let i = 0; i < L.lines.length; i++) {
      const ln = L.lines[i]
      let base = L.top + (L.lines[0].asc + i * L.lead) * L.S * SV
      base = gridY0 + Math.round((base - gridY0) / cellH) * cellH // snap baselines to rows
      const lx = (W - ln.w * L.S) * 0.5 + ln.left * L.S
      if (SV === 1) {
        rc.fillText(ln.text, lx, base)
      } else {
        rc.save()
        rc.translate(0, base)
        rc.scale(1, SV) // stretch about the baseline, width untouched
        rc.fillText(ln.text, lx, 0)
        rc.restore()
      }
    }

    const img = rc.getImageData(0, 0, rw, rh).data
    const cov = new Float32Array(cols * rows)
    const inv = 1 / (SX * SY * 255)
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        let s = 0
        for (let yy = 0; yy < SY; yy++) {
          const b = ((r * SY + yy) * rw + c * SX) * 4 + 3
          for (let xx = 0; xx < SX; xx++) s += img[b + xx * 4]
        }
        cov[r * cols + c] = s * inv
      }
    }
    covAtCols = cols
    covAtRows = rows

    // fine grids read better with a crisper, less anti-aliased contour
    const stemCols = (0.15 * (100 * L.S)) / cellW
    const fillTh = stemCols < 3 ? PH.smallFillThreshold : FILL_TH_BIG
    const inkTh = stemCols < 3 ? PH.smallInkThreshold : INK_TH_BIG

    let n = 0
    const cap = cols * rows
    const tc = new Int16Array(cap)
    const tr = new Int16Array(cap)
    const tg = new Uint16Array(cap)
    const te = new Uint8Array(cap)
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const g = pickGlyph(cov, c, r, fillTh, inkTh)
        if (g < 0) continue
        tc[n] = c
        tr[n] = r
        tg[n] = g
        te[n] = g === FILL_ID ? 0 : 1
        n++
      }
    }
    const o: Targets = {
      n: n,
      x: new Float32Array(n),
      y: new Float32Array(n),
      g: new Uint16Array(n),
      col: new Int16Array(n),
      row: new Int16Array(n),
      edge: new Uint8Array(n),
      lines: L.lines.map((l) => l.text),
      capRows: capRows,
    }
    for (let i = 0; i < n; i++) {
      o.x[i] = cellX(tc[i])
      o.y[i] = cellY(tr[i])
      o.g[i] = tg[i]
      o.col[i] = tc[i]
      o.row[i] = tr[i]
      o.edge[i] = te[i]
    }
    return o
  }

  /* ====================================================================
   * DENSITY-FIELD PATTERNS
   *   A: mirrored bead / lens string on a vertical axis, whose contour rings
   *      keep running past the beads to both card edges (and through the nav
   *      row), exactly like the reference's full-width character stream.
   *   B: a twisting, dissolving funnel with front/back helical stripes.
   *   The two crossfade per cell, so one field sifts into the other.
   * ==================================================================== */
  let Xn = new Float32Array(0)
  let Yn = new Float32Array(0)
  let rowBuf = new Uint16Array(0)
  let aspectCard = 1.6
  let invDiag = 0.5

  function buildFieldTables(): void {
    Xn = new Float32Array(cols)
    Yn = new Float32Array(rows)
    const hy = H * 0.5
    for (let c = 0; c < cols; c++) Xn[c] = (cellX(c) - W * 0.5) / hy
    for (let r = 0; r < rows; r++) Yn[r] = (cellY(r) - H * 0.5) / hy
    rowBuf = new Uint16Array(cols)
  }

  function patternRow(r: number, t: number): void {
    const Y = Yn[r]
    const mix = smoothstep(T.morph, T.morphEnd, t)
    const TWO_PI = Math.PI * 2

    /* --- A: bead string --- */
    const s = Y * PT.beadFreq + t * PT.beadFlow
    const bead = Math.floor(s)
    const bw = 0.62 + 0.46 * hash3(bead, 0, 3)
    const bshape = 0.52 + 0.55 * hash3(bead, 1, 3)
    const env = Math.pow(Math.abs(Math.sin(Math.PI * s)), bshape)
    const halfW = PT.neck + PT.lens * bw * env * (1 - mix * 0.85)
    const ringPhase = t * PT.ringFlow + 0.5 * hash3(bead, 2, 3) // contours travel outward
    const rings = PT.ringsIn[0] + (PT.ringsIn[1] - PT.ringsIn[0]) * hash3(bead, 4, 3)
    const vign = 1 - PT.vignette * smoothstep(0.86, 1.06, Y < 0 ? -Y : Y)
    const invRingFar = 1 / PT.ringFar
    // the halo breathes with the bead string: full at a waist, faint at a neck
    const halo = PT.farNeck + (1 - PT.farNeck) * env
    const rimEnd = 1 + PT.rimSoft
    // the field decodes outward from the centre of the card on load
    const revFront = t < PT.revealSecs ? PT.revealSeed + smoothstep(0, PT.revealSecs, t) * (1.14 - PT.revealSeed) : 2
    const revBack = revFront - PT.revealBand
    const revTick = (t * 26) | 0

    /* --- B: funnel --- */
    const Yv = (Y + 1) * 0.5
    const taper = Math.pow(clamp(1 - Yv, 0, 1), PT.vortexTaper)
    const R = PT.vortexStem + aspectCard * PT.vortexMouth * taper
    const xa = PT.vortexSway * Math.sin(Yv * 5.2 - t * 1.6) * Math.pow(Yv, 1.2)
    const twist = t * PT.vortexSpin - Yv * PT.vortexTwist
    const vfade = 1 - smoothstep(0.92, 1.05, Y < 0 ? -Y : Y) * 0.85
    const keep = PT.vortexDrop + 0.22 * (1 - Yv) + 0.12 * smoothstep(T.morphEnd, T.breakdown, t)
    const tb7 = (t * 7) | 0
    const invR = 1 / R

    for (let c = 0; c < cols; c++) {
      const X = Xn[c]
      let g = EMPTY
      const useB = mix >= 1 || (mix > 0 && hash3(c, r, 5) < mix)
      if (!useB) {
        const d = X < 0 ? -X : X
        const q = d / halfW
        let dens: number
        if (q <= rimEnd) {
          /* Inside the bead: the reference profile. Almost nothing on the
             centre axis, a long ramp outward, a dense plateau at the rim, and
             a soft 2-3 cell edge — so the contour traces the lens outline. */
          const ramp = smoothstep(PT.coreGap, PT.plateau, q)
          const rim = 1 - smoothstep(1, rimEnd, q)
          const ripple = 0.5 + 0.5 * Math.cos(TWO_PI * (q * rings - ringPhase))
          dens = ramp * rim * (1 - PT.rippleDepth + PT.rippleDepth * ripple) * vign * PT.coreGain
          if (dens > 1) dens = 1
        } else {
          /* Outside: the same contours keep going to both card edges (and
             through the nav row) as a quieter halo, so the card is never
             empty, but always a clear step below the bead itself. */
          const over = d - halfW
          let w = 0.5 + 0.5 * Math.cos(TWO_PI * (over * invRingFar - ringPhase))
          w += PT.bandGamma * (w * w * (3 - 2 * w) - w)
          dens = w * (PT.farFloor + PT.farAmp * Math.exp(-over * PT.farDecay)) * halo * vign
          // thin the halo to scattered marks toward the edges so it stays airy
          const drop = PT.farDrop[0] + (PT.farDrop[1] - PT.farDrop[0]) * smoothstep(0, 1.1, over)
          if (hash3(c, r, 23) < drop) dens = 0
        }
        if (dens > PT.inkFloor) {
          const idx = (1 - dens) * (RAMP_N - 1)
          g = RAMP_ID[(idx < 0 ? 0 : idx > RAMP_N - 1 ? RAMP_N - 1 : idx) | 0]
        }
      } else {
        const un = (X - xa) * invR
        const aun = un < 0 ? -un : un
        if (aun < 1) {
          const phi = Math.asin(un)
          const st = PT.vortexStripes
          const front = 0.5 + 0.5 * Math.cos(st * phi + twist)
          const back = 0.5 + 0.5 * Math.cos(st * (Math.PI - phi) + twist)
          let rim = aun * aun
          rim = rim * rim
          const db = (PT.vortexBase + 0.5 * front + 0.48 * rim) * vfade
          /* Fine per-cell dither (so the surface dissolves grain by grain)
             modulated by a slow coherent drift, instead of pure value noise —
             value noise alone punches blotchy holes in the cone. */
          const hb = 0.66 * hash3(c, r, tb7) + 0.34 * vnoise(c * 0.09, r * 0.09 - t * 1.1, 91)
          if (db > 0.08 && hb > keep) {
            const k = (1 - db) * (VORT_N - 1)
            g = VORT_ID[(k < 0 ? 0 : k > VORT_N - 1 ? VORT_N - 1 : k) | 0]
          } else if (back > 0.8 && hb > 1 - keep * 0.5) {
            g = VORT_ID[VORT_N - 2] // faint back wall -> see-through
          }
        } else if (aun < 1.5) {
          if (hash3(c, r, ((t * 6) | 0) + 17) < PT.debris * (1.5 - aun) * (0.4 + Yv)) g = VORT_ID[VORT_N - 1]
        }
      }
      if (revFront < 2 && g !== EMPTY) {
        const rad = Math.sqrt(X * X + Y * Y) * invDiag
        if (rad > revFront) g = EMPTY
        else if (rad > revBack) g = transitAt(c * 31 + r, revTick)
      }
      rowBuf[c] = g
    }
  }

  function renderPattern(t: number): void {
    const clearTo = navClearPx
    const fadeTo = clearTo * 1.7
    for (let r = 0; r < rows; r++) {
      /* Optional clear band under the nav row: the field is cut away over the
         top `navClearPx`, then dithered back to full over the next 70%, so the
         nav's buttons sit on the card rather than on a dense character field. */
      let keep = 1
      if (clearTo > 0) {
        const y = cellY(r)
        if (y < clearTo) continue
        keep = smoothstep(clearTo, fadeTo, y)
      }
      patternRow(r, t)
      for (let c = 0; c < cols; c++) {
        const g = rowBuf[c]
        if (g === EMPTY) continue
        if (keep < 1 && hash3(c, r, 77) > keep) continue
        drawCell(g, BAND_PAT, 0, c, r)
      }
    }
  }

  /* ====================================================================
   * PARTICLES (struct of arrays)
   * ==================================================================== */
  const M_DORM = 0
  const M_FREE = 1
  const M_REST = 2
  const M_FLY = 3
  const M_SET = 4
  const M_PEEL = 5
  const M_GONE = 6
  let P = 0
  let px = new Float32Array(0)
  let py = new Float32Array(0)
  let pvx = new Float32Array(0)
  let pvy = new Float32Array(0)
  let pgl = new Uint16Array(0)
  let pgt = new Uint16Array(0)
  let pal = new Float32Array(0)
  let pmode = new Uint8Array(0)
  let pt0 = new Float32Array(0)
  let pdur = new Float32Array(0)
  let px0 = new Float32Array(0)
  let py0 = new Float32Array(0)
  let pcx = new Float32Array(0)
  let pcy = new Float32Array(0)
  let ptx = new Float32Array(0)
  let pty = new Float32Array(0)
  let prel = new Float32Array(0)
  let pseed = new Float32Array(0)
  let pdrag = new Float32Array(0)
  let pofx = new Float32Array(0)
  let pofy = new Float32Array(0)
  let povx = new Float32Array(0)
  let povy = new Float32Array(0)
  let pcol = new Int16Array(0)
  let prow = new Int16Array(0)
  const tgt: Targets[] = []
  let heap = new Float32Array(0)
  let heapBase = 0
  let srcIdx = new Int32Array(0)
  let tgtIdx = new Int32Array(0)
  let spareIdx = new Int32Array(0)
  let litC = new Int16Array(0)
  let litR = new Int16Array(0)
  let litG = new Uint16Array(0)
  let liveCount = 0
  let moverCount = 0

  // declared up here because stepParticles / renderParticles read them
  let simT = 0
  let steps = 0
  let pointerX = -1e5
  let pointerY = -1e5
  let pointerOn = false

  function allocParticles(n: number): void {
    P = n
    px = new Float32Array(n)
    py = new Float32Array(n)
    pvx = new Float32Array(n)
    pvy = new Float32Array(n)
    pgl = new Uint16Array(n)
    pgt = new Uint16Array(n)
    pal = new Float32Array(n)
    pmode = new Uint8Array(n)
    pt0 = new Float32Array(n)
    pdur = new Float32Array(n)
    px0 = new Float32Array(n)
    py0 = new Float32Array(n)
    pcx = new Float32Array(n)
    pcy = new Float32Array(n)
    ptx = new Float32Array(n)
    pty = new Float32Array(n)
    prel = new Float32Array(n)
    pseed = new Float32Array(n)
    pdrag = new Float32Array(n)
    pofx = new Float32Array(n)
    pofy = new Float32Array(n)
    povx = new Float32Array(n)
    povy = new Float32Array(n)
    pcol = new Int16Array(n)
    prow = new Int16Array(n)
    srcIdx = new Int32Array(n)
    spareIdx = new Int32Array(n)
    tgtIdx = new Int32Array(Math.max(tgt[0] ? tgt[0].n : 0, tgt[1] ? tgt[1].n : 0) + 1)
  }

  /* Sample the live pattern at the breakdown instant: every lit cell becomes a
     grain (deterministically thinned if there are more cells than grains, or
     duplicated if the phrase needs more). */
  function initParticles(): void {
    const cap = cols * rows
    if (litC.length < cap) {
      litC = new Int16Array(cap)
      litR = new Int16Array(cap)
      litG = new Uint16Array(cap)
    }
    let lit = 0
    for (let r = 0; r < rows; r++) {
      patternRow(r, T.breakdown)
      for (let c = 0; c < cols; c++) {
        if (rowBuf[c] !== EMPTY) {
          litC[lit] = c
          litR[lit] = r
          litG[lit] = rowBuf[c]
          lit++
        }
      }
    }
    const need = twoPhrase ? Math.max(tgt[0].n, tgt[1].n) : tgt[0].n
    const want = Math.min(6000, Math.max(Math.round(need * FL.surplusFactor) + 160, Math.min(lit, 6000)))
    allocParticles(want)

    const rr = mulberry32(seed ^ 0x51ed)
    for (let i = 0; i < want; i++) {
      let k = 0
      let sc: number
      let sr: number
      let sg: number
      if (lit === 0) {
        sc = (rr() * cols) | 0
        sr = (rr() * rows) | 0
        sg = RAMP_ID[RAMP_N - 1]
      } else if (want <= lit) {
        k = (((i * lit) / want) | 0) % lit
        sc = litC[k]
        sr = litR[k]
        sg = litG[k]
      } else {
        k = i < lit ? i : (rr() * lit) | 0
        sc = litC[k]
        sr = litR[k]
        sg = litG[k]
        if (i >= lit) {
          sc = clamp(sc + ((rr() * 3) | 0) - 1, 0, cols - 1)
          sr = clamp(sr + ((rr() * 3) | 0) - 1, 0, rows - 1)
        }
      }
      const x = cellX(sc)
      const y = cellY(sr)
      px[i] = x
      py[i] = y
      pvx[i] = 0
      pvy[i] = 0
      pcol[i] = sc
      prow[i] = sr
      pgl[i] = sg
      pgt[i] = sg
      pal[i] = 1
      pmode[i] = M_DORM
      pseed[i] = rr()
      pdrag[i] = FX.drag[0] + rr() * (FX.drag[1] - FX.drag[0])
      const up = 1 - sr / Math.max(1, rows - 1)
      prel[i] = T.breakdown + 0.02 + FX.releaseSpread * clamp(FX.releaseTopBias * up + (1 - FX.releaseTopBias) * rr(), 0, 1)
      ptx[i] = x
      pty[i] = y
      px0[i] = x
      py0[i] = y
      pt0[i] = 0
      pdur[i] = 1
      pofx[i] = pofy[i] = povx[i] = povy[i] = 0
    }
    heap = new Float32Array(cols)
    heapBase = cellY(rows - 1) + cellH * 0.45
    liveCount = want
    moverCount = want
  }

  /* rows shatter sideways in bands just before their cells let go */
  function shearAt(r: number, t: number): number {
    const k = smoothstep(T.breakdown, T.breakdown + FX.shearSecs, t)
    if (k <= 0) return 0
    const band = (r / 3) | 0
    return (band & 1 ? 1 : -1) * k * (2 + FX.shearCells * hash3(band, seed, 41)) * cellW
  }

  function release(i: number): void {
    const dx = px[i] - W * 0.5
    const dy = py[i] - H * 0.5
    const len = Math.sqrt(dx * dx + dy * dy) || 1
    const sp = FX.burstSpeed[0] + pseed[i] * (FX.burstSpeed[1] - FX.burstSpeed[0])
    const swirl = (pseed[i] - 0.5) * 2 * FX.burstSwirl
    pvx[i] = (dx / len) * sp * 1.75 - (dy / len) * sp * swirl + (hash3(i, 1, 7) - 0.5) * 210
    pvy[i] = (dy / len) * sp * 0.62 + (dx / len) * sp * swirl * 0.7 - 30 - hash3(i, 2, 7) * 140
    pmode[i] = M_FREE
  }

  function heapDeposit(c: number, amt: number): void {
    if (c < 0 || c >= cols) return
    if (heap[c] > H * 0.42) amt *= 0.25
    heap[c] += amt
    if (c > 0) heap[c - 1] += amt * 0.34
    if (c < cols - 1) heap[c + 1] += amt * 0.34
    if (c > 1) heap[c - 2] += amt * 0.12
    if (c < cols - 2) heap[c + 2] += amt * 0.12
  }
  function relaxHeap(fwd: boolean): void {
    const lim = cellH * 1.5
    let d: number
    let m: number
    if (fwd) {
      for (let c = 0; c < cols - 1; c++) {
        d = heap[c] - heap[c + 1]
        if (d > lim) {
          m = (d - lim) * 0.45
          heap[c] -= m
          heap[c + 1] += m
        } else if (d < -lim) {
          m = (-d - lim) * 0.45
          heap[c] += m
          heap[c + 1] -= m
        }
      }
    } else {
      for (let c = cols - 2; c >= 0; c--) {
        d = heap[c] - heap[c + 1]
        if (d > lim) {
          m = (d - lim) * 0.45
          heap[c] -= m
          heap[c + 1] += m
        } else if (d < -lim) {
          m = (-d - lim) * 0.45
          heap[c] += m
          heap[c + 1] -= m
        }
      }
    }
  }

  /* ---------- matching: recursive coordinate bisection ----------
     Split sources and targets at the count median along the targets' wider
     axis and recurse, so each grain pairs with a spatially corresponding
     cell. True 2D locality, no crossings, O(n log n), no allocation. */
  let rcbSX: Float32Array = new Float32Array(0)
  let rcbSY: Float32Array = new Float32Array(0)
  let rcbTX: Float32Array = new Float32Array(0)
  let rcbTY: Float32Array = new Float32Array(0)
  function matchRCB(S: Int32Array, Tg: Int32Array, n: number, TX: Float32Array, TY: Float32Array): void {
    rcbSX = px
    rcbSY = py
    rcbTX = TX
    rcbTY = TY
    rcbRec(S, Tg, 0, n)
  }
  function rcbRec(S: Int32Array, Tg: Int32Array, lo: number, hi: number): void {
    const len = hi - lo
    if (len <= 1) return
    let mnx = 1e9
    let mxx = -1e9
    let mny = 1e9
    let mxy = -1e9
    let v: number
    for (let k = lo; k < hi; k++) {
      v = rcbTX[Tg[k]]
      if (v < mnx) mnx = v
      if (v > mxx) mxx = v
      v = rcbTY[Tg[k]]
      if (v < mny) mny = v
      if (v > mxy) mxy = v
    }
    const mid = lo + (len >> 1)
    if (mxx - mnx >= mxy - mny) {
      nthBy(S, lo, hi, mid, rcbSX)
      nthBy(Tg, lo, hi, mid, rcbTX)
    } else {
      nthBy(S, lo, hi, mid, rcbSY)
      nthBy(Tg, lo, hi, mid, rcbTY)
    }
    rcbRec(S, Tg, lo, mid)
    rcbRec(S, Tg, mid, hi)
  }

  function startFlight(i: number, tx: number, ty: number, gt: number, t0: number, dur: number, arc: number, sgn: number): void {
    px0[i] = px[i]
    py0[i] = py[i]
    ptx[i] = tx
    pty[i] = ty
    pgt[i] = gt
    pt0[i] = t0
    pdur[i] = dur
    const dx = tx - px[i]
    const dy = ty - py[i]
    const len = Math.sqrt(dx * dx + dy * dy) || 1
    pcx[i] = (px[i] + tx) * 0.5 + (-dy / len) * arc * sgn
    pcy[i] = (py[i] + ty) * 0.5 + (dx / len) * arc * sgn - arc * 0.35
    pmode[i] = M_FLY
    pal[i] = 1
    pofx[i] = pofy[i] = povx[i] = povy[i] = 0
  }

  function peelOff(i: number, t0: number): void {
    pmode[i] = M_PEEL
    pt0[i] = t0
    pdur[i] = FL.peelFade
    pvx[i] = (hash3(i, 109, 113) - 0.5) * 150
    pvy[i] = 170 + hash3(i, 127, 131) * 260 // leave briskly, so the card ends clean
  }

  /* fly a fresh grain in from whichever card edge is nearest its target */
  function spawnEdgeFor(i: number, tx: number, ty: number): void {
    const h1 = hash3(i, 311, 7)
    const h2 = hash3(i, 312, 7)
    const h3 = hash3(i, 313, 7)
    const dL = tx
    const dR = W - tx
    const dT = ty
    const dB = H - ty
    const mn = Math.min(Math.min(dL, dR), Math.min(dT, dB))
    const jx = (h1 - 0.5) * W * 0.12
    const jy = (h2 - 0.5) * H * 0.12
    if (mn === dT) {
      px[i] = tx + jx
      py[i] = -cellH * (2 + 6 * h3)
    } else if (mn === dB) {
      px[i] = tx + jx
      py[i] = H + cellH * (2 + 6 * h3)
    } else if (mn === dL) {
      px[i] = -cellW * (4 + 12 * h3)
      py[i] = ty + jy
    } else {
      px[i] = W + cellW * (4 + 12 * h3)
      py[i] = ty + jy
    }
    pal[i] = 1
  }

  let planned0 = false
  /** The fifth beat has been planned — planRearrange() or planShatter(), whichever is live. */
  let plannedBreak = false

  function planAssemble(): void {
    const Tt = tgt[0]
    let n = 0
    for (let i = 0; i < P; i++) {
      const m = pmode[i]
      if (m === M_DORM || m === M_FREE || m === M_REST) srcIdx[n++] = i
    }
    for (let i = 0; i < Tt.n; i++) tgtIdx[i] = i
    const K = Math.min(n, Tt.n)
    matchRCB(srcIdx, tgtIdx, K, Tt.x, Tt.y)
    const spanC = Math.max(1, cols - 1)
    for (let k = 0; k < K; k++) {
      const pi = srcIdx[k]
      const tj = tgtIdx[k]
      const st = T.assemble + 0.04 + FL.assembleSweep * (Tt.col[tj] / spanC) + 0.13 * hash3(pi, 9, 21)
      const dur = FL.assembleDur[0] + FL.assembleDur[1] * hash3(pi, 11, 23)
      const arc = (FL.assembleArc[0] + FL.assembleArc[1] * hash3(pi, 13, 27)) * Math.abs(Tt.y[tj] - py[pi]) + cellH * 2
      startFlight(pi, Tt.x[tj], Tt.y[tj], Tt.g[tj], st, dur, arc, hash3(pi, 17, 29) > 0.5 ? 1 : -1)
    }
    for (let k = K; k < n; k++) {
      peelOff(srcIdx[k], T.assemble + 0.02 + 0.5 * hash3(srcIdx[k], 19, 31))
    }
    planned0 = true
  }

  function planRearrange(): void {
    const Tt = tgt[1]
    let n = 0
    for (let i = 0; i < P; i++) {
      if (pmode[i] === M_SET || pmode[i] === M_FLY) {
        px[i] = ptx[i]
        py[i] = pty[i]
        srcIdx[n++] = i
      }
    }
    const spare = spareIdx
    let ns = 0
    for (let i = 0; i < P; i++) {
      if (pmode[i] === M_PEEL || pmode[i] === M_GONE || pmode[i] === M_FREE || pmode[i] === M_REST) spare[ns++] = i
    }
    // deficits: recruit spare grains and fly them in from the nearest edge
    const deficit = Tt.n - n
    let sp = 0
    for (let i = 0; i < deficit && sp < ns; i++) srcIdx[n++] = spare[sp++]

    for (let i = 0; i < Tt.n; i++) tgtIdx[i] = i
    const K = Math.min(n, Tt.n)
    matchRCB(srcIdx, tgtIdx, K, Tt.x, Tt.y)

    const diag = Math.sqrt(W * W + H * H)
    const far2 = FL.recycleMinFrac * diag * (FL.recycleMinFrac * diag)
    const spanC = Math.max(1, cols - 1)
    let recycleLeft = Math.round(K * FL.recycleFrac)

    for (let k = 0; k < K; k++) {
      let pi = srcIdx[k]
      const tj = tgtIdx[k]
      let incoming = pmode[pi] !== M_SET && pmode[pi] !== M_FLY
      const dx = Tt.x[tj] - px[pi]
      const dy = Tt.y[tj] - py[pi]
      const d2 = dx * dx + dy * dy
      // the longest crossings read as noise: retire that grain and fly a fresh one in
      if (!incoming && recycleLeft > 0 && d2 > far2 && sp < ns) {
        const fresh = spare[sp++]
        peelOff(pi, T.rearrange + 0.05 + FL.rearrangeSweep * clamp(colOf(px[pi]) / spanC, 0, 1))
        pi = fresh
        incoming = true
        recycleLeft--
      }
      if (incoming) spawnEdgeFor(pi, Tt.x[tj], Tt.y[tj])
      const wave = T.rearrange + 0.02 + FL.rearrangeSweep * (Tt.col[tj] / spanC) + 0.1 * hash3(tj, 41, 43)
      const dist = Math.sqrt((Tt.x[tj] - px[pi]) * (Tt.x[tj] - px[pi]) + (Tt.y[tj] - py[pi]) * (Tt.y[tj] - py[pi]))
      const dur = FL.rearrangeDur[0] + FL.rearrangeDur[1] * hash3(tj, 47, 53) + (incoming ? 0.22 : 0)
      const arc = Math.min(cellH * 9, FL.rearrangeArc * dist + cellH * 1.4)
      startFlight(
        pi,
        Tt.x[tj],
        Tt.y[tj],
        Tt.g[tj],
        incoming ? Math.max(T.rearrange, wave - 0.3) : wave,
        dur,
        arc,
        hash3(pi, 59, 61) > 0.5 ? 1 : -1,
      )
      if (incoming) pgl[pi] = chaosAt(pi, 3, 71)
    }
    for (let k = K; k < n; k++) {
      const pi = srcIdx[k]
      peelOff(pi, T.rearrange + 0.05 + FL.rearrangeSweep * clamp(colOf(px[pi]) / spanC, 0, 1) + 0.12 * hash3(pi, 103, 107))
    }
    plannedBreak = true
  }

  /**
   * twoPhrase === false: the settled phrase lets go again.
   *
   * No second physics path — every grain is handed back to the dormant→release()→M_FREE
   * route the opening breakdown runs on, which is what makes the break read as the same
   * piece of material rather than a different effect. All this does is re-arm `prel` with
   * a left-to-right wave, and pick up the leftovers that were still resting on the heap so
   * nothing is left sitting along the foot of the card.
   */
  function planShatter(): void {
    const spanC = Math.max(1, cols - 1)
    for (let i = 0; i < P; i++) {
      const m = pmode[i]
      if (m === M_GONE || m === M_PEEL || m === M_FREE) continue
      if (m === M_FLY) {
        // a straggler still in the air: seat it first, so it breaks from where it belongs
        px[i] = ptx[i]
        py[i] = pty[i]
        pgl[i] = pgt[i]
      }
      pofx[i] = pofy[i] = povx[i] = povy[i] = 0
      pmode[i] = M_SET
      pal[i] = m === M_REST ? ID.leftoverAlpha : 1
      prel[i] = T.shatter + 0.02 + SH.sweep * clamp(colOf(px[i]) / spanC, 0, 1) + SH.jitter * hash3(i, 181, 191)
    }
    plannedBreak = true
  }

  /** 1 while the swarm is still visible after the break, 0 once it has gone. */
  function shatterAlpha(t: number): number {
    return 1 - smoothstep(T.shatter + SH.fadeFrom, T.shatter + SH.fadeFrom + SH.fadeSpan, t)
  }

  /* ---------- simulation step ---------- */
  function stepParticles(t: number): void {
    /* The break-up is the breakdown again, so the gravity ramp and the turbulence decay are
       measured from whichever burst is the current one. The floor, though, is switched off
       for good once the phrase lets go: this swarm is on its way off the card, and a heap
       building along the foot would still be there under the identity block. */
    const breaking = !twoPhrase && t >= T.shatter
    const burst = breaking ? T.shatter : T.breakdown
    const since = t - burst
    const grav = lerp(FX.gravity[0], FX.gravity[1], smoothstep(burst + FX.gravityRamp[0], burst + FX.gravityRamp[1], t))
    const turb = FX.turbulence[0] + (FX.turbulence[1] - FX.turbulence[0]) * (1 - smoothstep(burst + 0.18, burst + FX.turbulenceFade, t))
    const floorOn = since >= FX.floorDelay && !breaking
    const swarmGone = breaking && shatterAlpha(t) <= 0
    const mgx = cellW * FX.wallMarginCells
    const mgy = cellH * 3
    const wf = FX.wallForce
    const k = 0.009
    const idle = t >= T.idle
    let live = 0
    let movers = 0

    for (let i = 0; i < P; i++) {
      const m = pmode[i]
      if (m === M_GONE) continue
      /* Past the fade the swarm is invisible; retiring it here is what lets the rAF loop
         go quiet on a settled card instead of integrating grains nobody can see. */
      if (swarmGone) {
        pmode[i] = M_GONE
        pal[i] = 0
        continue
      }
      live++
      if (m === M_DORM) {
        movers++
        if (t >= prel[i]) {
          px[i] += shearAt(prow[i], t)
          release(i)
        }
        continue
      }
      if (m === M_FREE || m === M_PEEL) {
        movers++
        let x = px[i]
        let y = py[i]
        const gmul = pseed[i] > 1 - FX.floaters ? 0.42 : 1
        let ax = 0
        let ay: number
        if (m === M_FREE) {
          const nx = vnoise(x * k, y * k + t * 0.7, 11) - 0.5
          const ny = vnoise(x * k + 37, y * k - t * 0.55, 17) - 0.5
          ax = nx * turb * 2.4
          ay = grav * gmul + ny * turb * 1.5
          // soft inward walls: keeps the swarm on the card without edge columns
          if (x < mgx) ax += (mgx - x) * wf
          else if (x > W - mgx) ax -= (x - W + mgx) * wf
          if (y < mgy) ay += (mgy - y) * wf
        } else {
          ax = (hash3(i, (t * 2) | 0, 151) - 0.5) * 40
          ay = 420
        }
        let vx = pvx[i] + ax * DT
        let vy = pvy[i] + ay * DT
        const dmp = 1 - pdrag[i] * 0.55 * DT
        vx *= dmp
        vy *= dmp
        x += vx * DT
        y += vy * DT
        if (m === M_FREE) {
          if (floorOn) {
            const c = colOf(x)
            const fl = heapBase - heap[c]
            if (y >= fl) {
              y = fl - hash3(i, 5, 41) * cellH * 0.95
              pmode[i] = M_REST
              vx = 0
              vy = 0
              heapDeposit(c, cellH * FX.heapDeposit)
              pgl[i] = chaosAt(i, 7, 43)
            }
          } else if (y > H + cellH * 6) {
            y = H + cellH * 6
            vy = -Math.abs(vy) * 0.4
          }
        } else {
          const a = 1 - (t - pt0[i]) / pdur[i]
          if (t >= pt0[i]) {
            if (a <= 0) {
              pal[i] = 0
              pmode[i] = M_GONE
              live--
              movers--
              continue
            }
            pal[i] = a
          }
          if (y > H + cellH * 3 || x < -cellW * 6 || x > W + cellW * 6) {
            pmode[i] = M_GONE
            pal[i] = 0
            live--
            movers--
            continue
          }
        }
        px[i] = x
        py[i] = y
        pvx[i] = vx
        pvy[i] = vy
        continue
      }
      if (m === M_FLY) {
        movers++
        const s = (t - pt0[i]) / pdur[i]
        if (s <= 0) continue
        if (s >= 1) {
          px[i] = ptx[i]
          py[i] = pty[i]
          pgl[i] = pgt[i]
          pmode[i] = M_SET
          continue
        }
        const e = easeInOutCubic(s)
        const u = 1 - e
        px[i] = u * u * px0[i] + 2 * u * e * pcx[i] + e * e * ptx[i]
        py[i] = u * u * py0[i] + 2 * u * e * pcy[i] + e * e * pty[i]
        continue
      }
      if (m === M_SET) {
        // planShatter() re-armed prel on every seated grain: this is the phrase letting go.
        if (breaking && t >= prel[i]) {
          release(i)
          movers++
          continue
        }
        const ox = pofx[i]
        const oy = pofy[i]
        if (pointerOn && idle && interactive) {
          const ddx = ptx[i] + ox - pointerX
          const ddy = pty[i] + oy - pointerY
          const R = cellW * ID.pointerRadiusCells
          const d2 = ddx * ddx + ddy * ddy
          if (d2 < R * R) {
            const d = Math.sqrt(d2) || 1
            const f = 1 - d / R
            povx[i] += (ddx / d) * f * f * ID.pointerForce * DT
            povy[i] += (ddy / d) * f * f * ID.pointerForce * DT
          }
        }
        if (ox !== 0 || oy !== 0 || povx[i] !== 0 || povy[i] !== 0) {
          povx[i] += (-ox * ID.springK - povx[i] * ID.springDamp) * DT
          povy[i] += (-oy * ID.springK - povy[i] * ID.springDamp) * DT
          pofx[i] = ox + povx[i] * DT
          pofy[i] = oy + povy[i] * DT
          if (Math.abs(pofx[i]) < 0.02 && Math.abs(pofy[i]) < 0.02 && Math.abs(povx[i]) < 0.5 && Math.abs(povy[i]) < 0.5) {
            pofx[i] = 0
            pofy[i] = 0
            povx[i] = 0
            povy[i] = 0
          } else movers++
        }
      }
    }
    if (floorOn) {
      relaxHeap((steps & 1) === 0)
      relaxHeap((steps & 1) !== 0)
    }
    liveCount = live
    moverCount = movers
  }

  /* ====================================================================
   * RENDER
   * ==================================================================== */
  function renderParticles(t: number): void {
    const tb = (t * ID.shimmerHz) | 0
    const tb2 = (t * 9) | 0
    const fr = (t * 15) | 0
    const flick = t >= T.idle ? ID.shimmerIdle : t >= T.hold && t < BREAK ? ID.shimmerHold : 0
    /* One multiplier carries the break-up's exit: the swarm keeps its physics and simply
       stops being there, which is what lets the identity block fade up through it rather
       than wait for a clean card. 1 everywhere else, so nothing before the beat changes. */
    const exit = !twoPhrase && t >= T.shatter ? shatterAlpha(t) : 1
    const leftover = (t >= T.assemble ? ID.leftoverAlpha : 1) * exit
    const ptrR2 = cellW * ID.pointerScrambleCells * (cellW * ID.pointerScrambleCells)
    const fast2 = FX.fastStreak * FX.fastStreak
    const shear = t < T.breakdown + FX.shearSecs + 0.05 ? 1 : 0
    let m: number
    let g: number
    let a: number
    let ai: number
    let x: number
    let y: number

    beginOcc()

    // pass 1 — the subject: seated and in-flight grains own their cells
    for (let i = 0; i < P; i++) {
      m = pmode[i]
      if (m !== M_SET && m !== M_FLY) continue
      a = pal[i] * exit
      x = px[i]
      y = py[i]
      if (m === M_SET) {
        x += pofx[i]
        y += pofy[i]
        g = pgt[i]
        // shimmer only on contour cells, and only from the light pool, so it
        // can never punch a hole in a stem
        if (flick > 0 && pgt[i] !== FILL_ID && hash3(i, tb, 137) < flick) g = SHIM_ID[(hash3(i, tb, 139) * SHIM_N) | 0]
        if (pointerOn && interactive) {
          const pdx = x - pointerX
          const pdy = y - pointerY
          if (pdx * pdx + pdy * pdy < ptrR2) g = transitAt(i, tb2)
        }
      } else {
        const s = (t - pt0[i]) / pdur[i]
        if (s <= 0) {
          g = pgl[i]
          a *= leftover
        } else if (s > 0.78) {
          g = pgt[i]
        } else if (s > 0.42) {
          g = hash3(i, fr, 211) < 0.45 ? pgt[i] : transitAt(i, fr)
          a = 0.86
        } else {
          g = chaosAt(i, tb2, 149)
          a = 0.86
        }
      }
      ai = alphaIdx(a)
      if (ai >= 0) plot(g, BAND_INK, ai, x, y)
    }

    // pass 2 — loose material: still on the grid, falling, or leaving
    for (let i = 0; i < P; i++) {
      m = pmode[i]
      if (m === M_SET || m === M_FLY || m === M_GONE) continue
      a = pal[i] * leftover
      x = px[i]
      y = py[i]
      if (m === M_DORM) {
        if (shear) x += shearAt(prow[i], t)
        g = t > prel[i] - 0.12 ? chaosAt(i, fr, 3) : pgl[i]
        a = pal[i]
      } else if (m === M_FREE) {
        const vx2 = pvx[i]
        const vy2 = pvy[i]
        g = vx2 * vx2 + vy2 * vy2 > fast2 && hash3(i, 0, 167) < FX.streakFrac ? streakAt(vx2, vy2, hash3(i, tb2, 163)) : chaosAt(i, tb2, 151)
      } else if (m === M_REST) {
        g = pgl[i]
      } else {
        g = chaosAt(i, tb2, 157)
      }
      ai = alphaIdx(a)
      if (ai >= 0) plot(g, BAND_INK, ai, x, y)
    }

    // pass 3 — direction-aware motion trails behind the fast movers
    if (t < T.assemble + 0.6 || (!twoPhrase && t >= T.shatter && t < T.shatter + SH.fadeFrom + SH.fadeSpan)) {
      // Trails carry the exit too, or the swarm would fade out and leave its streaks behind.
      const aNear = alphaIdx(ALPHAS[3] * exit)
      const aFar = alphaIdx(ALPHAS[5] * exit)
      for (let i = 0; i < P; i++) {
        if (pmode[i] !== M_FREE) continue
        const ux = pvx[i]
        const uy = pvy[i]
        if (ux * ux + uy * uy < fast2 || hash3(i, 0, 167) >= FX.streakFrac) continue
        const g1 = (ux < 0 ? -ux : ux) > (uy < 0 ? -uy : uy) ? SH_ID[0] : SV_ID[0]
        if (aNear >= 0) plot(g1, BAND_INK, aNear, px[i] - ux * 0.03, py[i] - uy * 0.03)
        if (aFar >= 0) plot(TRAIL_FAR, BAND_INK, aFar, px[i] - ux * 0.068, py[i] - uy * 0.068)
      }
    }
  }

  function render(t: number): void {
    if (!ready) return
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    if (t < T.breakdown) renderPattern(t)
    else renderParticles(t)
    signalReady()
  }

  /* ====================================================================
   * PHASES / EVENTS
   * ==================================================================== */
  let phaseName: HeroPhase = 'patterns'
  let doneFired = false
  let everDone = false
  let suppress = false
  let phaseListeners: PhaseListener[] = []
  let doneListeners: DoneListener[] = []
  const lateCues = new Set<number>()

  function phaseFor(t: number): HeroPhase {
    if (t < T.breakdown) return 'patterns'
    if (t < T.assemble) return 'breakdown'
    if (t < T.hold) return 'assemble'
    if (t < BREAK) return 'hold'
    if (t < T.idle) return twoPhrase ? 'rearrange' : 'shatter'
    return 'idle'
  }
  /** A listener that throws must not take the rest of them, or the frame, down with it. */
  function rethrowLater(e: unknown): void {
    setTimeout(() => {
      throw e
    }, 0)
  }
  function emitPhase(p: HeroPhase): void {
    if (suppress) return
    const ls = phaseListeners
    for (let i = 0; i < ls.length; i++) {
      try {
        ls[i](p)
      } catch (e) {
        rethrowLater(e)
      }
    }
  }
  function emitDone(): void {
    if (suppress) return
    const ls = doneListeners
    for (let i = 0; i < ls.length; i++) {
      try {
        ls[i]()
      } catch (e) {
        rethrowLater(e)
      }
    }
  }
  function updatePhase(): void {
    const p = phaseFor(simT)
    if (p !== phaseName) {
      phaseName = p
      emitPhase(p)
    }
    if (simT >= T.idle && !doneFired) {
      doneFired = true
      if (!everDone) {
        everDone = true
        emitDone()
      }
    }
  }

  function stepSim(): void {
    const t = simT
    if (!planned0 && t >= T.assemble) planAssemble()
    if (!plannedBreak && t >= BREAK) (twoPhrase ? planRearrange : planShatter)()
    if (t >= T.breakdown) stepParticles(t)
    steps++
    simT = steps * DT
    updatePhase()
  }

  /* ====================================================================
   * BUILD / RESET / SEEK
   * ==================================================================== */
  let readySignalled = false
  function signalReady(): void {
    if (readySignalled) return
    readySignalled = true
    try {
      document.documentElement.dataset.heroFrame = 'ready'
    } catch {
      /* ignore */
    }
  }

  function resetSim(): void {
    simT = 0
    steps = 0
    doneFired = false
    phaseName = 'patterns'
    planned0 = plannedBreak = false
    initParticles()
  }
  function buildAll(): void {
    readInk()
    measureAdvance()
    sizeGrid()
    aspectCard = W / H
    invDiag = 1 / Math.sqrt(aspectCard * aspectCard + 1) // normalised card half-diagonal
    buildAtlas()
    buildFieldTables()
    tgt[0] = buildTargets(phrases[0])
    // Rasterising the second phrase costs a getImageData of the whole grid; in single-phrase
    // mode nothing ever reads it, so it is not built. buildTargets() itself is untouched.
    tgt[1] = twoPhrase ? buildTargets(phrases[1]) : tgt[0]
    resetSim()
    ready = true
  }

  /**
   * Jump straight to the end state, for reduced motion and for a resize that happens after
   * the intro is over. In single-phrase mode the end state is an EMPTY card — the phrase has
   * broken up and gone, and HeroIdentity's typeset block is what is standing there instead.
   */
  function settleFinal(): void {
    if (!twoPhrase) {
      for (let i = 0; i < P; i++) {
        pmode[i] = M_GONE
        pal[i] = 0
      }
      liveCount = 0
      moverCount = 0
      finishSettle()
      return
    }
    const Tt = tgt[1]
    const n = Math.min(P, Tt.n)
    for (let i = 0; i < P; i++) {
      pmode[i] = M_GONE
      pal[i] = 0
    }
    for (let i = 0; i < n; i++) {
      px[i] = ptx[i] = Tt.x[i]
      py[i] = pty[i] = Tt.y[i]
      pgt[i] = pgl[i] = Tt.g[i]
      pmode[i] = M_SET
      pal[i] = 1
      pofx[i] = pofy[i] = povx[i] = povy[i] = 0
    }
    liveCount = n
    moverCount = 0
    finishSettle()
  }

  /** The clock/phase half of settleFinal(), shared by both of its end states. */
  function finishSettle(): void {
    planned0 = plannedBreak = true
    steps = Math.round((T.idle + 0.6) / DT)
    simT = steps * DT
    if (phaseName !== 'idle') {
      phaseName = 'idle'
      emitPhase('idle')
    }
    doneFired = true
    if (!everDone) {
      everDone = true
      emitDone()
    }
  }
  function simulateTo(sec: number): void {
    resetSim()
    const n = Math.max(0, Math.round(sec / DT))
    const lim = Math.round((T.idle + T.seekTailSecs) / DT)
    const sim = Math.min(n, lim)
    suppress = true
    for (let i = 0; i < sim; i++) stepSim()
    suppress = false
    if (n > sim) {
      steps = n
      simT = steps * DT
    } // nothing moves past the settle
    phaseName = phaseFor(simT)
    emitPhase(phaseName)
    if (simT >= T.idle) {
      doneFired = true
      if (!everDone) {
        everDone = true
        emitDone()
      }
    }
  }

  /* ====================================================================
   * rAF LOOP
   * ==================================================================== */
  let rafId = 0
  let lastNow = 0
  let acc = 0
  let fps = 60
  let playing = true
  let frozen = false
  let visible = true
  let inView = true
  let idleBucket = -1

  function frame(now: number): void {
    rafId = 0
    if (destroyed) return
    let dt = lastNow ? (now - lastNow) / 1000 : DT
    lastNow = now
    if (dt > 0) fps = fps * 0.9 + (1 / dt) * 0.1
    if (dt > 0.25) dt = 0.25
    acc += dt
    let guard = 0
    while (acc >= DT && guard < 8) {
      stepSim()
      acc -= DT
      guard++
    }
    if (guard >= 8) acc = 0
    if (guard > 0) {
      // idle costs nothing: only re-render when the shimmer bucket turns over
      let needs = true
      if (simT > T.idle + 0.5 && moverCount === 0 && !pointerOn) {
        const b = (simT * ID.shimmerHz) | 0
        needs = b !== idleBucket
        idleBucket = b
      } else idleBucket = -1
      if (needs) render(simT)
    }
    rafId = window.requestAnimationFrame(frame)
  }
  function start(): void {
    if (destroyed || frozen || !playing || !ready || !visible || !inView || reduced) return
    if (rafId) return
    lastNow = 0
    acc = 0
    rafId = window.requestAnimationFrame(frame)
  }
  function stop(): void {
    if (rafId) {
      window.cancelAnimationFrame(rafId)
      rafId = 0
    }
  }

  /* ====================================================================
   * BENCH
   * ==================================================================== */
  let benchNode: HTMLPreElement | null = null
  function runBench(): void {
    const N = Math.round(T.benchSecs / DT)
    let stepMs = 0
    let renderMs = 0
    let maxP = 0
    let worst = 0
    const frames = new Float64Array(N)
    const t0 = performance.now()
    resetSim()
    suppress = true
    for (let i = 0; i < N; i++) {
      const a = performance.now()
      stepSim()
      const b = performance.now()
      render(simT)
      const c = performance.now()
      stepMs += b - a
      renderMs += c - b
      frames[i] = c - a
      if (frames[i] > frames[worst]) worst = i
      if (liveCount > maxP) maxP = liveCount
    }
    suppress = false
    const total = performance.now() - t0
    const sorted = Array.from(frames).sort((x, y) => x - y)
    const out = {
      cols: cols,
      rows: rows,
      cellW: +cellW.toFixed(2),
      cellH: +cellH.toFixed(2),
      fontSize: fontSize,
      dpr: dpr,
      maxParticles: maxP,
      twoPhrase: twoPhrase,
      phrase1Cells: tgt[0].n,
      phrase2Cells: twoPhrase ? tgt[1].n : 0,
      lines1: tgt[0].lines,
      lines2: twoPhrase ? tgt[1].lines : [],
      capRows1: +tgt[0].capRows.toFixed(2),
      capRows2: twoPhrase ? +tgt[1].capRows.toFixed(2) : 0,
      avgStepMs: +(stepMs / N).toFixed(3),
      avgRenderMs: +(renderMs / N).toFixed(3),
      p95FrameMs: +sorted[Math.floor(N * 0.95)].toFixed(3),
      maxFrameMs: +sorted[N - 1].toFixed(3),
      maxFrameAt: +(worst * DT).toFixed(2),
      totalMs: +total.toFixed(1),
    }
    const pre = document.createElement('pre')
    pre.id = 'ascii-bench'
    pre.style.cssText = 'position:absolute;left:-9999px;top:0;'
    pre.textContent = JSON.stringify(out)
    document.body.appendChild(pre)
    benchNode = pre
    signalReady()
  }

  /* ====================================================================
   * OBSERVERS / INPUT
   * ==================================================================== */
  let ro: ResizeObserver | null = null
  let io: IntersectionObserver | null = null
  let mo: MutationObserver | null = null
  let resizeTimer = 0
  let lastW = 0
  let lastH = 0
  let lastDpr = 0
  let remeasured = false

  function doResize(): void {
    if (!ready || destroyed) return
    const rect = container.getBoundingClientRect()
    const w = Math.round(rect.width)
    const h = Math.round(rect.height)
    const nd = Math.min(GR.dprCap, window.devicePixelRatio || 1)
    if (w === lastW && h === lastH && nd === lastDpr) return
    lastW = w
    lastH = h
    lastDpr = nd
    const t = simT
    const wasFrozen = frozen
    const wasDone = simT >= T.idle || reduced
    suppress = true
    buildAll()
    suppress = false
    if (wasDone) {
      suppress = true
      settleFinal()
      suppress = false
    } else simulateTo(t)
    render(simT)
    if (!wasFrozen) start()
  }
  function scheduleResize(): void {
    if (resizeTimer) clearTimeout(resizeTimer)
    resizeTimer = window.setTimeout(() => {
      resizeTimer = 0
      doResize()
    }, 140)
  }

  function onPointer(e: { clientX: number; clientY: number }): void {
    if (!interactive || reduced || !ready) return
    const r = container.getBoundingClientRect()
    const lx = e.clientX - r.left
    const ly = e.clientY - r.top
    if (lx < 0 || ly < 0 || lx > r.width || ly > r.height) {
      pointerOn = false
      return
    }
    pointerX = lx
    pointerY = ly
    pointerOn = true
    start()
  }
  function onPointerOut(): void {
    pointerOn = false
  }
  function onTouch(e: TouchEvent): void {
    if (e.touches && e.touches[0]) onPointer(e.touches[0])
  }
  function onVisibility(): void {
    visible = !document.hidden
    if (visible) start()
    else stop()
  }
  function onFontsLate(): void {
    if (destroyed || remeasured || !ready) return
    const prev = advRatio
    measureAdvance()
    if (Math.abs(prev - advRatio) > 0.004) {
      remeasured = true
      lastW = -1
      doResize()
    }
  }

  /* ====================================================================
   * PUBLIC API
   * ==================================================================== */
  function on(event: 'phase', cb: (phase: HeroPhase) => void): () => void
  function on(event: 'done', cb: () => void): () => void
  function on(event: 'phase' | 'done', cb: PhaseListener | DoneListener): () => void {
    if (event === 'phase') {
      const fn = cb as PhaseListener
      phaseListeners.push(fn)
      return () => {
        phaseListeners = phaseListeners.filter((l) => l !== fn)
      }
    }
    const fn = cb as DoneListener
    doneListeners.push(fn)
    // a page that subscribes after settle still needs its cue
    if (everDone) {
      const id = window.setTimeout(() => {
        lateCues.delete(id)
        if (destroyed || doneListeners.indexOf(fn) === -1) return
        try {
          fn()
        } catch (e) {
          rethrowLater(e)
        }
      }, 0)
      lateCues.add(id)
    }
    return () => {
      doneListeners = doneListeners.filter((l) => l !== fn)
    }
  }

  const api: AsciiHeroInstance = {
    replay() {
      if (!ready) return
      frozen = false
      playing = true
      everDone = false
      idleBucket = -1
      stop()
      resetSim()
      if (reduced) {
        settleFinal()
        render(simT)
        return
      }
      emitPhase(phaseName)
      render(simT)
      start()
    },
    skip() {
      if (!ready) return
      if (reduced) {
        settleFinal()
        render(simT)
        return
      }
      simulateTo(T.idle - T.skipLead)
      frozen = false
      playing = true
      idleBucket = -1
      render(simT)
      start()
    },
    seek(sec: number) {
      if (!ready) return
      stop()
      frozen = true
      if (reduced) {
        settleFinal()
        render(simT)
        return
      }
      simulateTo(Math.max(0, +sec || 0))
      render(simT)
    },
    play() {
      playing = true
      frozen = false
      lastNow = 0
      start()
    },
    pause() {
      playing = false
      stop()
    },
    destroy() {
      if (destroyed) return
      destroyed = true
      stop()
      if (resizeTimer) {
        clearTimeout(resizeTimer)
        resizeTimer = 0
      }
      lateCues.forEach((id) => clearTimeout(id))
      lateCues.clear()
      if (ro) ro.disconnect()
      else window.removeEventListener('resize', scheduleResize)
      if (io) io.disconnect()
      if (mo) mo.disconnect()
      document.removeEventListener('visibilitychange', onVisibility)
      container.removeEventListener('pointermove', onPointer)
      container.removeEventListener('pointerleave', onPointerOut)
      container.removeEventListener('touchmove', onTouch)
      container.removeEventListener('touchend', onPointerOut)
      window.removeEventListener('blur', onPointerOut)
      if (document.fonts && document.fonts.removeEventListener) document.fonts.removeEventListener('loadingdone', onFontsLate)
      if (canvas.parentNode) canvas.parentNode.removeChild(canvas)
      if (benchNode && benchNode.parentNode) benchNode.parentNode.removeChild(benchNode)
      benchNode = null
      phaseListeners = []
      doneListeners = []
      if (win.__asciiHero === api) win.__asciiHero = null
    },
    refreshTheme() {
      if (!ready || destroyed) return
      readInk()
      buildAtlas()
      render(simT)
    },
    stats() {
      return {
        fps: Math.round(fps),
        particles: liveCount,
        cols: cols,
        rows: rows,
        phase: phaseName,
        t: +simT.toFixed(2),
      }
    },
    on,
    get phase() {
      return phaseName
    },
  }

  if (window.ResizeObserver) {
    ro = new ResizeObserver(scheduleResize)
    ro.observe(container)
  } else window.addEventListener('resize', scheduleResize)
  if (window.IntersectionObserver) {
    io = new IntersectionObserver(
      (es) => {
        inView = es[es.length - 1].isIntersecting
        if (inView) start()
        else stop()
      },
      { threshold: 0 },
    )
    io.observe(container)
  }
  if (window.MutationObserver) {
    mo = new MutationObserver(() => api.refreshTheme())
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] })
  }
  document.addEventListener('visibilitychange', onVisibility)
  if (interactive && !reduced) {
    container.addEventListener('pointermove', onPointer, { passive: true })
    container.addEventListener('pointerleave', onPointerOut, { passive: true })
    container.addEventListener('touchmove', onTouch, { passive: true })
    container.addEventListener('touchend', onPointerOut, { passive: true })
    window.addEventListener('blur', onPointerOut)
  }

  /* ====================================================================
   * BOOT
   * ==================================================================== */
  const sample = CHARSET.join('') + phrases.join('')
  loadFonts(
    [
      { spec: gridWeight + ' 12px ' + gridFont, text: sample },
      { spec: inkWeight + ' 12px ' + gridFont, text: sample },
      { spec: shapeWeight + ' 100px ' + shapeFont, text: phrases.join('') },
    ],
    2500,
  ).then(() => {
    if (destroyed) return
    buildAll()
    const rect = container.getBoundingClientRect()
    lastW = Math.round(rect.width)
    lastH = Math.round(rect.height)
    lastDpr = dpr
    if (benchMode) {
      runBench()
      return
    }
    if (reduced) {
      settleFinal()
      render(simT)
      return
    }
    if (seekParam != null && isFinite(seekParam)) {
      api.seek(seekParam)
      return
    }
    render(simT)
    start()
  })
  if (document.fonts && document.fonts.addEventListener) document.fonts.addEventListener('loadingdone', onFontsLate)

  win.__asciiHero = api
  return api
}
