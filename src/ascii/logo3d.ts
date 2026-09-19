/*!
 * logo3d.ts — a company's own logo, extruded into a thin plate and turned in 3D,
 * drawn in characters.
 *
 *   mount(container, options) -> AsciiLogoInstance
 *
 * There is no disc, no rim, no coin. The rotating object IS the logo: we read the
 * artwork's pixels, threshold them into a coverage mask, trim to the mark's own
 * bounding box, and treat that silhouette as the cross-section of a thin solid
 * plate. The plate turns about its vertical axis under perspective, so it
 * foreshortens, thins to an edge-on sliver, and comes back around — and the
 * outline you see at every angle is the TikTok note, the Scriber bubbles, the
 * HERE wordmark, the VipShop tile. Never a circle.
 *
 * Thickness is real, not a drop shadow. Each character cell fires one ray from
 * the eye and intersects the plate's two faces. If the near face is inked, the
 * cell takes the mark's own tone. If it is not, but the ray exits inside the
 * mark, the ray must have passed through a SIDE WALL: that band gets its own
 * shading from the mask's gradient, which is what makes the logo read as a solid
 * object turning rather than a sprite being squashed.
 *
 * The turn is a whole revolution, not a half one repeated. The plate's in-plane
 * axes never flip, so past edge-on you are looking at the BACK of the sign and
 * the mark is reversed, exactly as a real plate would be — 0° front, 90° edge,
 * 180° mirrored back, 270° edge, 360° front. The reverse is told from the front
 * by the sheen band alone: the printed face catches a highlight, the plain back
 * does not. (A lighter ramp on the back was tried first and rejected — see the
 * note on `shade.sheen`.)
 *
 * Glyphs, ink and atlas strategy are the hero's, so the four marks in the
 * experience rows speak the same language as the canvas at the top of the page.
 *
 * Same contract as ascii/engine.ts: framework-agnostic, dependency-free, owns one
 * <canvas>, one rAF loop and its own observers, and `destroy()` gives every one of
 * them back. The React wrapper in components/Logo3D.tsx is a thin effect around
 * mount/destroy, so a StrictMode double mount leaves nothing behind.
 *
 * Everything worth tweaking lives in the CONFIG block directly below.
 */

/* ====================================================================== *
 * PUBLIC TYPES                                                           *
 * ====================================================================== */

/**
 * What the plate's silhouette is cut from.
 * - `ink`  — the artwork's ink: a mark drawn on a background (Scriber's bubbles
 *            on white, TikTok's note on black, HERE's wordmark on navy). The
 *            background is thrown away and the ink itself becomes the plate, so
 *            counters and gaps are real holes you can see the far side through.
 * - `tile` — an app tile whose rounded square IS the logo (VipShop). The opaque
 *            area becomes the plate and the artwork inside it becomes tone, so
 *            the white V reads as a pale cut in a dense field.
 */
export type LogoShape = 'ink' | 'tile'

/**
 * How much of the artwork to keep.
 * - `auto` — drop a wordmark when one is unmistakable, else keep everything.
 * - `icon` — force the icon: if no wordmark splits off, keep the largest part.
 * - `full` — never split; every stroke belongs to the mark.
 */
export type LogoPart = 'auto' | 'icon' | 'full'

export type AsciiLogoOptions = {
  /** Logo image URL. Must be same-origin or CORS-enabled — we read its pixels. */
  src: string
  shape?: LogoShape
  part?: LogoPart
  /** Size trim, 1 = the mark fills the box. Lower it for a mark that runs hot. */
  scale?: number
  /** Target character columns across the container. Drives the font size. */
  cols?: number
  /** Revolutions per `CONFIG.spin.period` seconds. 1 = the configured rate. */
  speed?: number
  /** Starting angle, in turns. Omit to derive a stable one from `seed`. */
  phase?: number
  seed?: number
  /** false mounts a single static frame at `phase` and never starts a loop. */
  autoplay?: boolean
  reducedMotion?: boolean
  /** Monospace family the grid glyphs are drawn in. */
  font?: string
  /** Smallest font size, in CSS px. Lower it to buy columns on a small mark. */
  fontMin?: number
}

export type AsciiLogoStats = {
  cols: number
  rows: number
  fontSize: number
  dpr: number
  /** Texture resolution, which is matched to the cell aspect, not square. */
  texW: number
  texH: number
  /** Cells drawn on the last frame — the per-frame cost in one number. */
  cells: number
  /** Spin clock, in seconds. */
  t: number
  /** True when the logo could not be read (blocked pixels, 404). */
  failed: boolean
}

export interface AsciiLogoInstance {
  play(): void
  pause(): void
  /** Multiplies the spin rate from here on; the angle never jumps. */
  setSpeed(v: number): void
  /** Absolute spin clock, in seconds. Deterministic: the same value re-draws the same frame. */
  seek(seconds: number): void
  destroy(): void
  refreshTheme(): void
  stats(): AsciiLogoStats
  /** The rendered character grid as text, for probes that inspect a frame without a screenshot. */
  dump(): string
  readonly playing: boolean
}

/* ====================================================================== *
 * CONFIG                                                                 *
 * ====================================================================== */
const CONFIG = {
  /* --- glyph vocabulary: the hero's density ramp, dense -> sparse ----- */
  ramp: ['N', 'O', 'A', '8', '6', '9', '4', '5', '2', 'I', '3', '?', '!', '<', '>', '=', '+', '/', ':', '-', '·'],
  /* The mark has to read as SOLID ink, and no glyph at its natural size fills
     its cell — a field of 'N' is only ~40% covered, which is grey. So the
     darkest step is drawn oversized until it tiles, exactly as the hero fills a
     letter interior. */
  fillChar: '/',
  /* Ink weight. The hero's letters peak at 0.69 coverage and the marks used to top out at 0.58
     with the hero's own 1.34 — a 15% shortfall that read, beside solid-ink headings, as four
     grey smudges rather than four logos. The cause is scale, not settings: a hero cell is ~30
     device px tall and a mark's cell is 8, and at 8px the antialiasing eats most of a thin
     diagonal's ink. So the fill glyph is drawn larger here than in the hero to land the marks
     back on the hero's tone. Measured with build/c2-fill.mjs: 1.44 gives peak 0.665, against
     the hero's 0.638 at its first percentile and 0.694 at its peak. The character grid is
     unchanged by this — only the glyph's rasterised weight is — so nothing that was legible
     stops being legible. */
  fillTile: 1.44, // fill glyph ink box / cell
  fillAt: 0.78, // density at or above this uses the fill glyph
  boldTile: 1.16, // ramp steps 0-1 are drawn this much larger
  alphas: [1, 0.82, 0.6, 0.36],

  grid: {
    dprCap: 2,
    fontDiv: 34, // container width / this = font px, when `cols` is not given
    fontMin: 3.0,
    fontMax: 12,
    /* 1.0 rather than the hero's 1.24: vertical cells are the scarce resource on
       a small square canvas, and a logo needs rows far more than it needs air
       between them. Glyph ink is ~0.72em tall, so nothing actually collides. */
    rowRatio: 1.0,
    minCols: 24,
    minRows: 16,
  },

  plate: {
    H: 0.075, // HALF thickness, in plate units (the mark's half-size is 1)
    eye: 6.4, // camera distance; small enough to foreshorten visibly
    safety: 0.97, // fraction of the box the widest projected corner may reach
  },

  spin: {
    period: 6.2, // seconds per full revolution at speed 1
    /* The mark is only readable near face-on, so the plate lingers there and
       hurries through the edge-on moment instead of turning at a constant rate.
       Warp: θ' = θ - dwell·sin(2θ). dθ'/dθ = 1 - 2·dwell·cos(2θ), which stays
       positive for dwell < 0.5, so it never stalls or runs backwards. */
    dwell: 0.24,
    tiltBase: -0.15, // constant lean (rad): we look slightly down on it
    tiltAmp: 0.045, // slow nod, so it never looks like a flat spinner
    tiltPeriod: 7.3,
    bobAmp: 0.012, // vertical drift in plate units
    bobPeriod: 4.1,
  },

  light: [-0.34, 0.45, 0.82] as const, // world-space key light

  shade: {
    /* The front face is nearly solid: the whole point is that the silhouette
       reads. The lambert range is what stops it being a dead black blob as the
       plate turns. */
    faceMin: 0.87, // density of the lit front face
    faceRange: 0.11, // extra density as it turns away from the light
    faceLow: 0.07, // density where the mark's own tone is empty (tile mode)
    /* Soft specular band across the face, fixed in plate space — and the one
       thing that tells the front of the plate from its reverse, because it is
       faded out as the back comes round (see `sheenK` in render). The obvious
       cue, a lighter ramp on the back, was tried first and rejected: the mark
       runs at saturated ink (see `fillTile`), so its face density sits just
       inside the fill glyph's threshold, and lifting the back by as little as
       0.02 pushed the whole width of this band across that cliff — the reverse
       came back mottled with digits, which reads as a rendering fault rather
       than as light. Both were shot at 12 angles with build/spin-sheet.mjs.
       Taking the sheen AWAY can only make the back more solid, so it cannot
       mottle whatever the mark. */
    sheen: 0.075,
    /* The side wall is deliberately much lighter than the face: two distinct
       tonal bands is what says "this is a solid with thickness" at 3px cells. */
    wallMin: 0.44,
    wallRange: 0.26,
    wallThin: 0.45, // a wall sliver only part-way through the slab fades out
    dither: 1.1, // ordered dither amplitude, in ramp steps. Without it a flat
    // face lands on one ramp step and joins into scan lines.
    wallSteps: 4, // ray marches through the slab to find the wall
  },

  mask: {
    maxSide: 288, // working resolution for extraction
    texFactor: 1.9, // texture resolution = cells across the mark * this
    texMin: 36,
    texMax: 190,
    dilate: 0.16, // blend toward a 3x3 max — keeps hairlines alive
    dilateFrom: 0.22, // ...faded out once the neighbourhood is this busy,
    dilateTo: 0.5, //    so letter counters stay open
    gamma: 0.92, // coverage gain after downsampling
    /* Coverage is pushed away from the middle afterwards. The prefilter leaves a
       one-texel stroke at ~0.4 and the gap beside it at ~0.3, which the eye reads
       as one grey slab; separating them is what lets HERE's letters keep their
       counters instead of fusing into a diagonal bar. */
    contrast: 0.3,
    contrastAt: 0.46,
    toneGamma: 0.6,
    speckle: 0.004, // components smaller than this fraction of ink are dropped
    iconMinArea: 0.22, // a detected icon must hold this much of the ink
    wordMinParts: 3, // a wordmark is at least this many components
    wordAspect: 2.2, // ...and this wide relative to its height
    wordMaxArea: 0.62,
    wordHeightCv: 0.58, // ...with consistent component heights
    gap: 0.035, // required empty band between icon and wordmark
  },
} as const

/** The spin period, in seconds — exported so callers can stagger a row of marks. */
export const LOGO_PERIOD = CONFIG.spin.period

/* ====================================================================== *
 * SMALL HELPERS                                                          *
 * ====================================================================== */
const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v)

function smoothstep(a: number, b: number, x: number): number {
  if (b <= a) return x >= b ? 1 : 0
  let t = (x - a) / (b - a)
  t = t < 0 ? 0 : t > 1 ? 1 : t
  return t * t * (3 - 2 * t)
}

/**
 * Deterministic 2D hash -> [0,1). Math.imul throughout: a plain `*` here
 * overflows 2^53 and collapses the low bits, which silently kills both the
 * dither and the per-logo phase.
 */
function hash2(x: number, y: number): number {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h = h ^ (h >>> 16)
  return (h >>> 0) / 4294967296
}

/* ====================================================================== *
 * IMAGE -> MASK                                                          *
 * ----------------------------------------------------------------------*
 * 1. Rasterise the logo at a working resolution.
 * 2. Estimate the background from a ring of border pixels — modal colour if the
 *    border is opaque, "transparent" otherwise. That one step is what lets a
 *    single code path handle a blue mark on white, a white mark on a black
 *    tile, a navy JPEG with no alpha at all, and a rounded tile with alpha.
 * 3. Score every pixel by its luminance-weighted distance from that background,
 *    pick the split with Otsu (no magic thresholds), and turn the distance into
 *    soft coverage around it — soft, so edges stay anti-aliased downstream.
 * 4. In `tile` mode the silhouette comes from alpha instead, and the artwork
 *    inside it becomes a tonal field rather than a cut-out.
 * 5. Split off a wordmark if the ink is clearly an icon plus a line of type.
 * ====================================================================== */

type Raster = { w: number; h: number; data: Uint8ClampedArray }
type Box = { x0: number; y0: number; x1: number; y1: number; area: number }
/** `solid` is the plate's cross-section; `tone` is how inked it is inside (null = fully). */
type Mark = { w: number; h: number; solid: Float32Array; tone: Float32Array | null; box: Box }
type Texture = { nx: number; ny: number; cov: Float32Array; tone: Float32Array | null; gx: Float32Array; gy: Float32Array }

const imgCache = new Map<string, Promise<HTMLImageElement>>()

function loadImage(src: string): Promise<HTMLImageElement> {
  const hit = imgCache.get(src)
  if (hit) return hit
  const p = new Promise<HTMLImageElement>((resolve, reject) => {
    const im = new Image()
    /* `load` only promises the bytes, not a decoded bitmap, and drawImage will
       happily downscale a half-decoded one through a cheaper filter. That moves
       the Otsu split by a step, which adds or drops a speckle at the mark's
       edge, which moves its bounding box — and the box sets the plate's whole
       scale. Waiting for decode() is what makes two loads of the same page draw
       the same frame for the same ?logo_t. */
    const settle = () => {
      if (typeof im.decode === 'function') im.decode().then(() => resolve(im), () => resolve(im))
      else resolve(im)
    }
    im.onload = settle
    im.onerror = () => reject(new Error(`logo3d: could not load ${src}`))
    im.src = src
  })
  imgCache.set(src, p)
  return p
}

function rasterise(img: HTMLImageElement): Raster {
  const iw = img.naturalWidth || img.width
  const ih = img.naturalHeight || img.height
  const k = Math.min(1, CONFIG.mask.maxSide / Math.max(iw, ih))
  const w = Math.max(8, Math.round(iw * k))
  const h = Math.max(8, Math.round(ih * k))
  const cv = document.createElement('canvas')
  cv.width = w
  cv.height = h
  const c = cv.getContext('2d')
  if (!c) throw new Error('logo3d: no 2d context')
  c.imageSmoothingEnabled = true
  c.imageSmoothingQuality = 'high'
  c.clearRect(0, 0, w, h)
  c.drawImage(img, 0, 0, w, h)
  return { w, h, data: c.getImageData(0, 0, w, h).data }
}

type BorderStats = { alphaBg: boolean; r: number; g: number; b: number }

/** Modal colour of the border ring (4 bits per channel), plus how transparent it is. */
function borderStats(raw: Raster): BorderStats {
  const { w, h, data } = raw
  const bins = new Int32Array(4096)
  const sr = new Float64Array(4096)
  const sg = new Float64Array(4096)
  const sb = new Float64Array(4096)
  const ring = Math.max(1, Math.round(Math.min(w, h) * 0.012))
  let n = 0
  let aSum = 0

  for (let y = 0; y < h; y++) {
    const edgeRow = y < ring || y >= h - ring
    for (let x = 0; x < w; x++) {
      if (!edgeRow && x >= ring && x < w - ring) {
        x = w - ring - 1
        continue
      }
      const i = (y * w + x) * 4
      const a = data[i + 3] / 255
      n++
      aSum += a
      if (a < 0.5) continue
      const r = data[i]
      const g = data[i + 1]
      const b = data[i + 2]
      const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4)
      bins[key]++
      sr[key] += r
      sg[key] += g
      sb[key] += b
    }
  }

  let best = -1
  let bi = 0
  for (let k = 0; k < 4096; k++) {
    if (bins[k] > best) {
      best = bins[k]
      bi = k
    }
  }
  const alphaBg = n === 0 || aSum / n < 0.42
  return {
    alphaBg: alphaBg || best <= 0,
    r: best > 0 ? sr[bi] / best : 255,
    g: best > 0 ? sg[bi] / best : 255,
    b: best > 0 ? sb[bi] / best : 255,
  }
}

/** Otsu split of a 0..255 histogram. */
function otsu(hist: Int32Array, total: number): number {
  let sum = 0
  for (let i = 0; i < 256; i++) sum += i * hist[i]
  let sumB = 0
  let wB = 0
  let best = -1
  let thr = 128
  for (let i = 0; i < 256; i++) {
    wB += hist[i]
    if (!wB) continue
    const wF = total - wB
    if (!wF) break
    sumB += i * hist[i]
    const mB = sumB / wB
    const mF = (sum - sumB) / wF
    const v = wB * wF * (mB - mF) * (mB - mF)
    if (v > best) {
      best = v
      thr = i
    }
  }
  return thr
}

/** Ink coverage in [0,1]: 1 = solid logo ink, 0 = background. */
function inkCoverage(raw: Raster): Float32Array {
  const { w, h, data } = raw
  const n = w * h
  const bg = borderStats(raw)
  const dist = new Float32Array(n)
  const hist = new Int32Array(256)

  for (let i = 0, p = 0; i < n; i++, p += 4) {
    const a = data[p + 3] / 255
    let v: number
    if (bg.alphaBg) {
      v = a * 255
    } else {
      const dr = data[p] - bg.r
      const dg = data[p + 1] - bg.g
      const db = data[p + 2] - bg.b
      v = Math.sqrt(0.3 * dr * dr + 0.59 * dg * dg + 0.11 * db * db) * a
      if (v > 255) v = 255
    }
    dist[i] = v
    hist[v | 0]++
  }

  let T = otsu(hist, n)
  /* Guard against a degenerate split (near-empty or near-full mark). */
  let above = 0
  for (let i = T; i < 256; i++) above += hist[i]
  const frac = above / n
  if (frac < 0.004 || frac > 0.86) T = clamp(T, 26, 150)
  const lo = T * 0.52
  const hi = T * 1.12 + 6

  const cov = new Float32Array(n)
  for (let i = 0; i < n; i++) cov[i] = smoothstep(lo, hi, dist[i])
  return cov
}

/** Alpha silhouette of an app tile, plus the tonal field printed on it. */
function tileFields(raw: Raster): { solid: Float32Array; tone: Float32Array } {
  const { w, h, data } = raw
  const n = w * h
  const solid = new Float32Array(n)
  const lum = new Float32Array(n)
  const hist = new Int32Array(256)
  let inside = 0

  for (let i = 0, p = 0; i < n; i++, p += 4) {
    const a = data[p + 3] / 255
    const s = smoothstep(0.25, 0.75, a)
    solid[i] = s
    const L = 0.3 * data[p] + 0.59 * data[p + 1] + 0.11 * data[p + 2]
    lum[i] = L
    if (s > 0.5) {
      hist[clamp(L | 0, 0, 255)]++
      inside++
    }
  }

  /* Percentile ends rather than min/max, so one stray white pixel or a dark
     anti-aliased corner cannot flatten the whole tile onto one density. */
  let lo = 0
  let hi = 255
  const cutLo = inside * 0.02
  const cutHi = inside * 0.98
  let acc = 0
  for (let i = 0; i < 256; i++) {
    acc += hist[i]
    if (acc >= cutLo) {
      lo = i
      break
    }
  }
  acc = 0
  for (let i = 0; i < 256; i++) {
    acc += hist[i]
    if (acc >= cutHi) {
      hi = i
      break
    }
  }
  if (hi - lo < 24) {
    lo = Math.max(0, lo - 12)
    hi = Math.min(255, hi + 12)
  }

  const tone = new Float32Array(n)
  const inv = 1 / (hi - lo)
  for (let i = 0; i < n; i++) {
    const t = clamp(1 - (lum[i] - lo) * inv, 0, 1)
    tone[i] = Math.pow(t, CONFIG.mask.toneGamma)
  }
  return { solid, tone }
}

/** Connected components on cov > 0.45 (8-connected, iterative flood fill). */
function components(cov: Float32Array, w: number, h: number): Box[] {
  const lab = new Int32Array(w * h).fill(-1)
  const stack = new Int32Array(w * h)
  const out: Box[] = []
  let id = 0

  for (let i = 0; i < w * h; i++) {
    if (cov[i] <= 0.45 || lab[i] >= 0) continue
    let sp = 0
    stack[sp++] = i
    lab[i] = id
    let x0 = i % w
    let x1 = x0
    let y0 = (i / w) | 0
    let y1 = y0
    let area = 0
    while (sp > 0) {
      const q = stack[--sp]
      const qx = q % w
      const qy = (q / w) | 0
      area++
      if (qx < x0) x0 = qx
      if (qx > x1) x1 = qx
      if (qy < y0) y0 = qy
      if (qy > y1) y1 = qy
      for (let dy = -1; dy <= 1; dy++) {
        const ny = qy + dy
        if (ny < 0 || ny >= h) continue
        for (let dx = -1; dx <= 1; dx++) {
          const nx = qx + dx
          if (nx < 0 || nx >= w) continue
          const k = ny * w + nx
          if (lab[k] < 0 && cov[k] > 0.45) {
            lab[k] = id
            stack[sp++] = k
          }
        }
      }
    }
    out.push({ x0, y0, x1, y1, area })
    id++
  }
  return out
}

function boxOf(list: Box[]): Box {
  const b: Box = { x0: 1e9, y0: 1e9, x1: -1e9, y1: -1e9, area: 0 }
  for (const c of list) {
    if (c.x0 < b.x0) b.x0 = c.x0
    if (c.y0 < b.y0) b.y0 = c.y0
    if (c.x1 > b.x1) b.x1 = c.x1
    if (c.y1 > b.y1) b.y1 = c.y1
    b.area += c.area
  }
  return b
}

/** Does `parts` look like a line of type rather than a mark? */
function looksLikeType(parts: Box[], totalArea: number, box: Box): boolean {
  const M = CONFIG.mask
  if (parts.length < M.wordMinParts) return false
  const bw = box.x1 - box.x0 + 1
  const bh = box.y1 - box.y0 + 1
  if (bw / bh < M.wordAspect) return false
  if (box.area > totalArea * M.wordMaxArea) return false
  const hs = parts.map((p) => p.y1 - p.y0 + 1).sort((a, b) => a - b)
  const med = hs[hs.length >> 1] || 1
  let dev = 0
  for (const v of hs) dev += Math.abs(v - med)
  return dev / hs.length / med < M.wordHeightCv
}

function looksLikeIcon(totalArea: number, box: Box): boolean {
  const M = CONFIG.mask
  if (box.area < totalArea * M.iconMinArea) return false
  const ar = (box.x1 - box.x0 + 1) / (box.y1 - box.y0 + 1)
  return ar > 0.34 && ar < 2.9
}

/**
 * Try to split "icon + wordmark" along one axis. Returns the icon box or null.
 * `axis` 0 = vertical stack (gap in y), 1 = side by side (gap in x).
 */
function splitAxis(parts: Box[], totalArea: number, span: number, axis: 0 | 1): Box | null {
  const lo = axis ? 'x0' : 'y0'
  const hi = axis ? 'x1' : 'y1'
  const sorted = parts.slice().sort((a, b) => a[lo] - b[lo])
  const minGap = span * CONFIG.mask.gap

  for (let k = 1; k < sorted.length; k++) {
    const A = sorted.slice(0, k)
    const B = sorted.slice(k)
    let aMax = -1e9
    let bMin = 1e9
    for (const p of A) if (p[hi] > aMax) aMax = p[hi]
    for (const p of B) if (p[lo] < bMin) bMin = p[lo]
    if (bMin - aMax < minGap) continue // no clean band between them
    const ba = boxOf(A)
    const bb = boxOf(B)
    if (looksLikeType(B, totalArea, bb) && looksLikeIcon(totalArea, ba)) return ba
    if (looksLikeType(A, totalArea, ba) && looksLikeIcon(totalArea, bb)) return bb
  }
  return null
}

/** Bounding box of the mark, with the wordmark dropped when one is unmistakable. */
function markBox(cov: Float32Array, w: number, h: number, part: LogoPart): Box {
  const parts = components(cov, w, h)
  if (!parts.length) return { x0: 0, y0: 0, x1: w - 1, y1: h - 1, area: 0 }

  let total = 0
  for (const p of parts) total += p.area
  let keep = parts.filter((p) => p.area >= total * CONFIG.mask.speckle)
  if (!keep.length) keep = parts

  const full = boxOf(keep)
  if (part === 'full') return full

  const icon = splitAxis(keep, total, h, 0) ?? splitAxis(keep, total, w, 1)
  if (icon) return icon

  if (part === 'icon' && keep.length > 1) {
    /* Forced: keep the single largest component. */
    let big = keep[0]
    for (const p of keep) if (p.area > big.area) big = p
    return big
  }
  return full
}

/** One extraction per (src, shape, part), shared by every instance on the page. */
const markCache = new Map<string, Promise<Mark>>()

function getMark(src: string, shape: LogoShape, part: LogoPart): Promise<Mark> {
  const key = `${src}|${shape}|${part}`
  const hit = markCache.get(key)
  if (hit) return hit
  const p = loadImage(src).then((img) => {
    const raw = rasterise(img)
    if (shape === 'tile') {
      const { solid, tone } = tileFields(raw)
      return { w: raw.w, h: raw.h, solid, tone, box: markBox(solid, raw.w, raw.h, 'full') }
    }
    const solid = inkCoverage(raw)
    return { w: raw.w, h: raw.h, solid, tone: null, box: markBox(solid, raw.w, raw.h, part) }
  })
  markCache.set(key, p)
  return p
}

/* ---------------------------------------------------------------------- *
 * RESAMPLE                                                               *
 * ----------------------------------------------------------------------*
 * Character cells are about twice as tall as they are wide, so the texture the
 * grid samples is NOT square: it is built at the cell aspect. Resampling with a
 * tent whose radius follows the scale in each axis separately is what prefilters
 * the vertical direction twice as hard — without it a one-pixel horizontal rule
 * (Scriber's three message lines) lands between two rows and disappears.
 * ---------------------------------------------------------------------- */

type Kernel = { start: Int32Array; count: Int32Array; w: Float32Array; stride: number }

/** Tent weights mapping source samples to `dn` outputs at `dst = off + src*k`. */
function buildKernel(dn: number, k: number, off: number): Kernel {
  const radius = Math.max(0.75, 0.5 / Math.max(k, 1e-4) + 0.5)
  const stride = Math.max(1, Math.ceil(radius * 2) + 2)
  const start = new Int32Array(dn)
  const count = new Int32Array(dn)
  const w = new Float32Array(dn * stride)
  for (let i = 0; i < dn; i++) {
    const c = (i - off) / k // centre, in source samples
    let j0 = Math.ceil(c - radius)
    let j1 = Math.floor(c + radius)
    if (j1 < j0) j1 = j0
    if (j1 - j0 + 1 > stride) j1 = j0 + stride - 1
    let sum = 0
    let n = 0
    for (let j = j0; j <= j1; j++) {
      const t = 1 - Math.abs(j - c) / (radius + 0.5)
      const wt = t > 0 ? t : 0
      w[i * stride + n] = wt
      sum += wt
      n++
    }
    if (sum > 0) for (let q = 0; q < n; q++) w[i * stride + q] /= sum
    start[i] = j0
    count[i] = n
  }
  return { start, count, w, stride }
}

/** Two separable tent passes: (sw x sh) source window -> (dw x dh) texture. */
function resample(
  src: Float32Array,
  srcW: number,
  bx: number,
  by: number,
  sw: number,
  sh: number,
  dw: number,
  dh: number,
  kx: Kernel,
  ky: Kernel,
): Float32Array {
  const mid = new Float32Array(dw * sh)
  for (let y = 0; y < sh; y++) {
    const srow = (by + y) * srcW + bx
    const drow = y * dw
    for (let i = 0; i < dw; i++) {
      let acc = 0
      const s0 = kx.start[i]
      const n = kx.count[i]
      for (let q = 0; q < n; q++) {
        const j = s0 + q
        if (j < 0 || j >= sw) continue
        acc += src[srow + j] * kx.w[i * kx.stride + q]
      }
      mid[drow + i] = acc
    }
  }
  const out = new Float32Array(dw * dh)
  for (let i = 0; i < dh; i++) {
    const s0 = ky.start[i]
    const n = ky.count[i]
    const drow = i * dw
    for (let q = 0; q < n; q++) {
      const j = s0 + q
      if (j < 0 || j >= sh) continue
      const wt = ky.w[i * ky.stride + q]
      if (wt === 0) continue
      const srow = j * dw
      for (let x = 0; x < dw; x++) out[drow + x] += mid[srow + x] * wt
    }
  }
  return out
}

/**
 * Mark -> texture covering plate space [-1,1]^2, with the mark's own aspect
 * preserved and its bounding box touching the edges of that square.
 * `bu`/`bv` are the half-extents the mark actually occupies.
 */
function buildTexture(mark: Mark, nx: number, ny: number, bu: number, bv: number): Texture {
  const M = CONFIG.mask
  const bx = mark.box.x0
  const by = mark.box.y0
  const sw = mark.box.x1 - bx + 1
  const sh = mark.box.y1 - by + 1

  /* Source pixel -> texel: x=0 lands on the left edge of the mark's slot. */
  const kx = (bu * (nx - 1)) / Math.max(1, sw - 1)
  const ky = (bv * (ny - 1)) / Math.max(1, sh - 1)
  const offX = (0.5 - bu * 0.5) * (nx - 1)
  const offY = (0.5 - bv * 0.5) * (ny - 1)
  const KX = buildKernel(nx, kx, offX)
  const KY = buildKernel(ny, ky, offY)

  const cov = resample(mark.solid, mark.w, bx, by, sw, sh, nx, ny, KX, KY)
  let tone: Float32Array | null = null
  if (mark.tone) tone = resample(mark.tone, mark.w, bx, by, sw, sh, nx, ny, KX, KY)

  /* Hairline rescue, applied only where it helps. A flat blend toward the 3x3
     max keeps one-texel strokes alive (Scriber's waveform) but it also fills in
     counters — the holes inside HERE's letters close up and the wordmark turns
     into one diagonal slab. So the blend is weighted by how EMPTY the
     neighbourhood is: a lone stroke in open space gets the full rescue, a gap
     between two heavy strokes gets none. */
  const dil = new Float32Array(nx * ny)
  for (let yy = 0; yy < ny; yy++) {
    for (let xx = 0; xx < nx; xx++) {
      let m = 0
      let sum = 0
      let cnt = 0
      for (let dy = -1; dy <= 1; dy++) {
        const py = yy + dy
        if (py < 0 || py >= ny) continue
        for (let dx = -1; dx <= 1; dx++) {
          const px = xx + dx
          if (px < 0 || px >= nx) continue
          const vv = cov[py * nx + px]
          if (vv > m) m = vv
          sum += vv
          cnt++
        }
      }
      const mean = cnt ? sum / cnt : 0
      const wgt = M.dilate * (1 - smoothstep(M.dilateFrom, M.dilateTo, mean))
      const base = cov[yy * nx + xx]
      const v = Math.pow(clamp(base + (m - base) * wgt, 0, 1), M.gamma)
      dil[yy * nx + xx] = smoothstep(M.contrastAt - M.contrast, M.contrastAt + M.contrast, v)
    }
  }

  /* Silhouette gradients: which way the side wall faces. Scaled into plate
     units, since the two axes have different texel densities. */
  const sx = (nx - 1) * 0.5
  const sy = (ny - 1) * 0.5
  const gx = new Float32Array(nx * ny)
  const gy = new Float32Array(nx * ny)
  for (let y = 0; y < ny; y++) {
    for (let x = 0; x < nx; x++) {
      const i = y * nx + x
      const xm = x > 0 ? dil[i - 1] : dil[i]
      const xp = x < nx - 1 ? dil[i + 1] : dil[i]
      const ym = y > 0 ? dil[i - nx] : dil[i]
      const yp = y < ny - 1 ? dil[i + nx] : dil[i]
      gx[i] = (xp - xm) * 0.5 * sx
      gy[i] = (ym - yp) * 0.5 * sy // texture y runs down, plate v runs up
    }
  }

  return { nx, ny, cov: dil, tone, gx, gy }
}

/* ====================================================================== *
 * CAPTURE GATE                                                           *
 * ----------------------------------------------------------------------*
 * The screenshot harness fires when <html data-hero-frame="ready">. The hero
 * engine raises that flag for itself, but a page that also mounts logos must not
 * be shot until they have drawn their seek frame too — otherwise a full-page
 * capture catches four empty squares. So while any logo is still loading, they
 * hold the flag DOWN (rewriting the hero's 'ready' back to 'wait'), and the last
 * one to finish raises it for everyone.
 *
 * Only armed when the URL actually asks for a frozen frame; a normal visit never
 * touches the attribute.
 * ====================================================================== */
const HERO_FRAME = 'heroFrame'
let gatePending = 0
let gateObserver: MutationObserver | null = null

function setHeroFrame(value: string): void {
  try {
    document.documentElement.dataset[HERO_FRAME] = value
  } catch {
    /* the page may block dataset writes */
  }
}

function holdGate(): void {
  if (gatePending++ > 0) return
  setHeroFrame('wait')
  try {
    gateObserver = new MutationObserver(() => {
      if (gatePending > 0 && document.documentElement.dataset[HERO_FRAME] === 'ready') setHeroFrame('wait')
    })
    gateObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-hero-frame'] })
  } catch {
    gateObserver = null
  }
}

function releaseGate(): void {
  if (gatePending === 0 || --gatePending > 0) return
  gateObserver?.disconnect()
  gateObserver = null
  /* Two frames so the last drawImage has certainly been presented, and
     document.fonts.ready so the atlas was baked in the real typeface rather than
     the fallback — a capture taken before that shows the wrong glyphs. The
     re-check matters under StrictMode: the unmount half of a double mount
     releases the gate and the remount takes it again, and this callback must not
     raise the flag over that second mark. */
  const raise = () =>
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (gatePending === 0) setHeroFrame('ready')
      })
    })
  if (document.fonts?.ready) document.fonts.ready.then(raise, raise)
  else raise()
}

/* ====================================================================== *
 * MOUNT                                                                  *
 * ====================================================================== */
export function mount(container: HTMLElement, options: AsciiLogoOptions): AsciiLogoInstance {
  const GR = CONFIG.grid
  const PL = CONFIG.plate
  const SP = CONFIG.spin
  const SH = CONFIG.shade
  const RAMP = CONFIG.ramp
  const NR = RAMP.length
  const ALPHAS = CONFIG.alphas
  const NA = ALPHAS.length
  const G_FILL = NR // atlas slot of the oversized fill glyph
  const FILL_EDGE = (1 - CONFIG.fillAt) * (NR - 1) // ramp position the fill takes over at
  const HH = PL.H
  const EYE = PL.eye
  const STEPS = SH.wallSteps

  const gridFont = options.font ?? '"Geist Mono", ui-monospace, SFMono-Regular, Menlo, monospace'
  const fontMin = options.fontMin ?? GR.fontMin
  const shape: LogoShape = options.shape ?? 'ink'
  const part: LogoPart = options.part ?? 'auto'
  const trim = clamp(options.scale ?? 1, 0.3, 1)
  const autoplay = options.autoplay !== false
  const seed = options.seed ?? 1
  let speed = options.speed ?? 1

  /* ---- URL hooks: ?logo_t / ?hero_t freeze a deterministic frame ------ */
  let params: URLSearchParams | null = null
  try {
    params = new URLSearchParams(window.location.search)
  } catch {
    params = null
  }
  const qnum = (name: string): number | null => {
    if (!params?.has(name)) return null
    const v = parseFloat(params.get(name) as string)
    return isFinite(v) ? v : null
  }
  const seekParam = qnum('logo_t') ?? qnum('hero_t')
  const benchMode = params?.get('logo_bench') === '1' || params?.get('hero_bench') === '1'

  /* ---- reduced motion ------------------------------------------------ */
  let mq: MediaQueryList | null = null
  let reduced = false
  try {
    mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    reduced = mq.matches
  } catch {
    reduced = false
  }
  if (options.reducedMotion === true) reduced = true
  if (options.reducedMotion === false) reduced = false

  /* ---- canvas -------------------------------------------------------- */
  if (getComputedStyle(container).position === 'static') container.style.position = 'relative'
  const canvas = document.createElement('canvas')
  canvas.setAttribute('aria-hidden', 'true')
  canvas.style.cssText =
    'position:absolute;left:0;top:0;width:100%;height:100%;display:block;pointer-events:none;background:transparent;'
  container.appendChild(canvas)
  const canvasCtx = canvas.getContext('2d', { alpha: true })
  const measureCanvasCtx = document.createElement('canvas').getContext('2d')
  if (!canvasCtx || !measureCanvasCtx) throw new Error('logo3d: no 2d context')
  /* Re-bound so the narrowing survives into the render closures below. */
  const ctx = canvasCtx
  const measureCtx = measureCanvasCtx

  /* ---- grid state ---------------------------------------------------- */
  let W = 0
  let H = 0
  let dpr = 1
  let advRatio = 0.6
  let fontSize = 11
  let cellW = 7
  let cellH = 12
  let cols = 0
  let rows = 0
  let scale = 1
  let colSx: Float64Array = new Float64Array(0)
  let rowSy: Float64Array = new Float64Array(0)
  let colPx: Int32Array = new Int32Array(0)
  let rowPx: Int32Array = new Int32Array(0)
  let ink = '#151515'
  let atlas: HTMLCanvasElement | null = null
  let slotW = 0
  let slotH = 0
  let padX = 0
  let padY = 0
  let tex: Texture | null = null
  let mark: Mark | null = null
  let texW = 0
  let texH = 0
  /* Texture fields, unpacked once per rebuild so the hot loop and its sampler
     never touch `tex` through an optional chain or allocate a closure per frame. */
  let tnx = 0
  let tny = 0
  let tcov: Float32Array = new Float32Array(0)
  let ttone: Float32Array | null = null
  let tgx: Float32Array = new Float32Array(0)
  let tgy: Float32Array = new Float32Array(0)
  let mx = 0
  let my = 0
  /* Plate half-extents, in plate units: the mark's aspect, largest side = trim. */
  let bu = 1
  let bv = 1
  let worldPerCell = 0.05
  let ready = false
  let destroyed = false
  let failed = false
  let gridBuf: Uint8Array = new Uint8Array(0)
  let lastCells = 0

  function readInk(): void {
    const cs = getComputedStyle(container)
    ink = cs.getPropertyValue('--ascii-ink').trim() || cs.color || '#151515'
  }

  function measureAdvance(): void {
    measureCtx.font = `400 100px ${gridFont}`
    const w = measureCtx.measureText('MMMMMMMMMM').width / 10
    advRatio = w > 10 && w < 100 ? w / 100 : 0.6
  }

  function markExtents(): void {
    if (!mark) {
      bu = trim
      bv = trim
      return
    }
    const sw = mark.box.x1 - mark.box.x0 + 1
    const sh = mark.box.y1 - mark.box.y0 + 1
    if (sw >= sh) {
      bu = trim
      bv = trim * (sh / sw)
    } else {
      bv = trim
      bu = trim * (sw / sh)
    }
  }

  function sizeGrid(): void {
    const rect = container.getBoundingClientRect()
    W = Math.max(48, rect.width || container.clientWidth || 48)
    H = Math.max(48, rect.height || container.clientHeight || 48)
    dpr = Math.min(GR.dprCap, window.devicePixelRatio || 1)

    const target = options.cols && options.cols > 0 ? W / options.cols / advRatio : W / GR.fontDiv
    fontSize = Math.round(clamp(target, fontMin, GR.fontMax) * 4) / 4
    cellW = fontSize * advRatio
    cellH = Math.round(fontSize * GR.rowRatio * dpr) / dpr
    cols = Math.max(GR.minCols, Math.floor(W / cellW))
    rows = Math.max(GR.minRows, Math.floor(H / cellH))
    const gridX0 = (W - cols * cellW) * 0.5
    const gridY0 = (H - rows * cellH) * 0.5

    const wd = Math.round(W * dpr)
    const hd = Math.round(H * dpr)
    if (canvas.width !== wd) canvas.width = wd
    if (canvas.height !== hd) canvas.height = hd

    /* Screen scale, chosen so the mark's furthest corner still fits the box at
       the worst angle in the whole cycle — the edge-on moment, where the near
       corner is closest to the eye and perspective blows it up the most. */
    const tiltMax = Math.abs(SP.tiltBase) + SP.tiltAmp
    const depth = bu + bv * Math.abs(Math.sin(tiltMax)) + HH
    const persp = EYE / Math.max(0.5, EYE - depth)
    const reach = Math.max(bu, bv) * persp + SP.bobAmp
    /* `trim` has to be applied HERE, not only to the plate's half-extents.
       The extents already carry it — bu and bv are set to `trim` — and `reach` is derived from
       them, so without this factor the division cancels the trim straight back out and every
       mark renders at exactly the same size whatever `scale` says. The knob was inert: setting
       VipShop to 0.88 moved its measured coverage by nothing at all. With the factor, trim = 1
       is byte-for-byte what it always was, and anything below it shrinks the mark inside a box
       whose size the CSS still owns. */
    scale = (Math.min(W, H) * 0.5 * PL.safety * trim) / reach
    worldPerCell = cellW / scale

    const cx = W * 0.5
    const cy = H * 0.5
    colSx = new Float64Array(cols)
    rowSy = new Float64Array(rows)
    colPx = new Int32Array(cols)
    rowPx = new Int32Array(rows)
    for (let c = 0; c < cols; c++) {
      colSx[c] = (gridX0 + (c + 0.5) * cellW - cx) / scale
      colPx[c] = Math.round((gridX0 + c * cellW) * dpr)
    }
    for (let r = 0; r < rows; r++) {
      rowSy[r] = -(gridY0 + (r + 0.5) * cellH - cy) / scale // plate v is up
      rowPx[r] = Math.round((gridY0 + r * cellH) * dpr)
    }
    gridBuf = new Uint8Array(cols * rows)
  }

  /** Glyph atlas: (ramp + fill) x baked alpha, so a cell is one drawImage. */
  function buildAtlas(): void {
    const cwD = cellW * dpr
    const chD = cellH * dpr
    const size = fontSize * dpr

    /* Scale the fill glyph until its ink box tiles a cell in both axes. */
    measureCtx.font = `400 100px ${gridFont}`
    const fm = measureCtx.measureText(CONFIG.fillChar)
    const fh = ((fm.actualBoundingBoxAscent || 72) + (fm.actualBoundingBoxDescent || 0)) / 100
    const fw = ((fm.actualBoundingBoxLeft || 0) + (fm.actualBoundingBoxRight || fm.width)) / 100
    const fillPx = Math.min(
      Math.max((chD * CONFIG.fillTile) / Math.max(0.2, fh), (cwD * CONFIG.fillTile) / Math.max(0.2, fw)),
      /* Ceiling on the oversized fill, so a pathological cell aspect cannot blow the atlas slot
         out. It has to clear what fillTile actually asks for at this grid's 1.0 row ratio —
         at 2.2 it was the binding constraint and quietly capped the ink below the hero's. */
      chD * 2.55,
    )

    padX = Math.ceil(Math.max(1, (Math.max(fillPx * fw, size * 0.4) - cwD) * 0.5 + 1))
    padY = Math.ceil(Math.max(1, (Math.max(fillPx * fh, size * 0.76) - chD) * 0.5 + 1))
    slotW = Math.ceil(cwD) + 2 * padX
    slotH = Math.ceil(chD) + 2 * padY

    const a = atlas ?? document.createElement('canvas')
    a.width = slotW * (NR + 1)
    a.height = slotH * NA
    const c = a.getContext('2d')
    if (!c) return
    c.clearRect(0, 0, a.width, a.height)
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    c.fillStyle = ink
    const base = 0.04 * size

    for (let ai = 0; ai < NA; ai++) {
      c.globalAlpha = ALPHAS[ai]
      const y = ai * slotH + slotH * 0.5 + base
      for (let i = 0; i < NR; i++) {
        const px = i < 2 ? size * CONFIG.boldTile : size
        c.font = `400 ${px.toFixed(2)}px ${gridFont}`
        c.fillText(RAMP[i], i * slotW + slotW * 0.5, y)
      }
      c.font = `400 ${fillPx.toFixed(2)}px ${gridFont}`
      c.fillText(CONFIG.fillChar, G_FILL * slotW + slotW * 0.5, y)
    }
    c.globalAlpha = 1
    atlas = a
  }

  /**
   * Texture sized to what this grid can actually resolve, at the CELL aspect —
   * roughly twice as many texels across as down, because that is the shape of a
   * character cell. The texture covers the whole plate square [-1,1]^2; the mark
   * itself only occupies bu x bv of it.
   */
  function buildTex(): void {
    if (!mark) return
    const M = CONFIG.mask
    const nx = Math.round(clamp(((2 * scale) / cellW) * M.texFactor, M.texMin, M.texMax))
    const ny = Math.round(clamp(((2 * scale) / cellH) * M.texFactor, M.texMin, M.texMax))
    if (tex && texW === nx && texH === ny) return
    tex = buildTexture(mark, nx, ny, bu, bv)
    texW = tex.nx
    texH = tex.ny
    tnx = tex.nx
    tny = tex.ny
    tcov = tex.cov
    ttone = tex.tone
    tgx = tex.gx
    tgy = tex.gy
    mx = (tnx - 1) * 0.5
    my = (tny - 1) * 0.5
  }

  /* ====================================================================
   * RENDER — one ray per character cell, two plane hits per ray.
   * ==================================================================== */
  const Ln = ((): readonly [number, number, number] => {
    const [x, y, z] = CONFIG.light
    const m = Math.sqrt(x * x + y * y + z * z)
    return [x / m, y / m, z / m]
  })()

  const phase = options.phase != null ? options.phase * Math.PI * 2 : hash2(seed * 7919, 104729) * Math.PI * 2

  /** Bilinear coverage at plate (u,v); 0 outside the plate square. */
  function covAt(u: number, v: number): number {
    const fx = (u + 1) * mx
    const fy = (1 - v) * my
    if (fx < 0 || fy < 0 || fx > tnx - 1 || fy > tny - 1) return 0
    const x0 = fx | 0
    const y0 = fy | 0
    const x1 = x0 < tnx - 1 ? x0 + 1 : x0
    const y1 = y0 < tny - 1 ? y0 + 1 : y0
    const ax = fx - x0
    const ay = fy - y0
    const i0 = y0 * tnx
    const i1 = y1 * tnx
    const a = tcov[i0 + x0] + (tcov[i0 + x1] - tcov[i0 + x0]) * ax
    const b = tcov[i1 + x0] + (tcov[i1 + x1] - tcov[i1 + x0]) * ax
    return a + (b - a) * ay
  }

  /** Nearest texel index for (u,v), clamped into the texture. */
  function texelAt(u: number, v: number): number {
    let ix = ((u + 1) * mx) | 0
    let iy = ((1 - v) * my) | 0
    if (ix < 0) ix = 0
    else if (ix > tnx - 1) ix = tnx - 1
    if (iy < 0) iy = 0
    else if (iy > tny - 1) iy = tny - 1
    return iy * tnx + ix
  }

  function drawCell(g: number, ai: number, c: number, r: number): void {
    if (!atlas) return
    ctx.drawImage(atlas, g * slotW, ai * slotH, slotW, slotH, colPx[c] - padX, rowPx[r] - padY, slotW, slotH)
    gridBuf[r * cols + c] = g
  }

  function render(t: number): void {
    if (!ready) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    gridBuf.fill(255)
    if (!tex) {
      lastCells = 0
      return
    }

    /* Reduced motion gets the front-facing frame — no phase offset, no spin — so
       an animating mark still shows itself head-on. A mark mounted static at an
       explicit angle never moved, so it keeps the angle it was given. */
    const raw = reduced ? (autoplay ? 0 : phase) : phase + (t * 2 * Math.PI) / SP.period
    /* Dwell: linger face-on, hurry through edge-on. */
    const th = reduced ? raw : raw - SP.dwell * Math.sin(2 * raw)
    const tp = SP.tiltBase + (reduced ? 0 : SP.tiltAmp * Math.sin((t * 2 * Math.PI) / SP.tiltPeriod + phase))
    const bob = reduced ? 0 : SP.bobAmp * Math.sin((t * 2 * Math.PI) / SP.bobPeriod + phase * 1.7)

    const cth = Math.cos(th)
    const sth = Math.sin(th)
    const cp = Math.cos(tp)
    const sp = Math.sin(tp)

    /* Plate frame = Rx(tilt) * Ry(spin). */
    const nx = sth
    const ny = -cth * sp
    const nz = cth * cp
    const ux = cth
    const uy = sth * sp
    const uz = -sth * cp
    const vx = 0
    const vy = cp
    const vz = sp

    /* Which face of the slab points at the eye. The eye sits at w = EYE·nz along
       the plate normal, so nz's sign alone decides it, and `nf` is the visible
       face's OUTWARD normal — used for the face's lambert and to keep the near
       plane of the slab at +HH.
       The in-plane u axis is deliberately NOT flipped with it. u stays the
       plate's own axis the whole way round, so once the plate turns past edge-on
       the mark unfolds REVERSED — the back of a physical sign, read from behind.
       Flipping u (as this did) folded the turn back on itself every half
       revolution: the silhouette's period was 180°, the surface-locked dither
       and sheen jumped as u changed sign, and the motion read as a snap back to
       the start rather than a revolution. */
    const s = nz >= 0 ? 1 : -1
    const nfx = s * nx
    const nfy = s * ny
    const nfz = s * nz
    /* How much of the BACK we are looking at, 0 face-on-front .. 1 face-on-back.
       Ramped off |nz| so it is exactly 0 at edge-on, where the two faces meet:
       anything keyed straight to `s` would step at the seam. */
    const backness = s < 0 ? smoothstep(0, 0.45, Math.abs(nz)) : 0

    const lamF = 0.5 + 0.5 * (nfx * Ln[0] + nfy * Ln[1] + nfz * Ln[2]) // half-lambert
    const faceBase = SH.faceMin + SH.faceRange * (1 - lamF)
    /* Weight of the face's sheen band, hoisted out of the cell loop. The printed
       face carries it; the plain reverse does not, which is the one tonal cue
       that says which side of the plate you are looking at. It has to be a cue
       that can only make the back MORE solid: the mark is drawn at saturated ink
       to match the hero, so its density sits hard against the fill glyph's
       threshold, and anything that LIGHTENS the back tips the whole sheen band
       across that cliff and mottles it into digits. Measured both ways — see the
       note on `shade.sheen`. */
    const sheenK = SH.sheen * (0.4 + 0.6 * lamF) * (1 - backness)
    /* The key light expressed in the plate's own frame, for the wall normals. */
    const lu = ux * Ln[0] + uy * Ln[1] + uz * Ln[2]
    const lv = vx * Ln[0] + vy * Ln[1] + vz * Ln[2]
    const ln = nfx * Ln[0] + nfy * Ln[1] + nfz * Ln[2]

    /* Conservative screen-space bound. */
    const tiltMax = Math.abs(SP.tiltBase) + SP.tiltAmp
    const persp = EYE / Math.max(0.5, EYE - (bu + bv * Math.abs(Math.sin(tiltMax)) + HH))
    const bxScreen = (Math.abs(cth) * bu + Math.abs(sth) * HH) * persp + worldPerCell
    const byScreen = bv * persp + worldPerCell + Math.abs(bob)
    let cells = 0

    for (let r = 0; r < rows; r++) {
      const sy = rowSy[r] - bob
      if (sy < -byScreen || sy > byScreen) continue

      for (let c = 0; c < cols; c++) {
        const sx = colSx[c]
        if (sx < -bxScreen || sx > bxScreen) continue

        /* Ray: O = (0,0,EYE), dir = (sx, sy, -EYE), so t=1 lands on z=0. The
           plate coordinates along it are affine in t, which is what makes both
           the face hit and the wall march a handful of multiplies. */
        const den = sx * nfx + sy * nfy - EYE * nfz
        if (den > -1e-9 && den < 1e-9) continue

        const inv = 1 / den
        const ON = EYE * nfz
        const tA = (HH - ON) * inv
        const tB = (-HH - ON) * inv
        const tFace = tA < tB ? tA : tB // the near FACE of the slab
        const tBack = tA < tB ? tB : tA
        if (tBack <= 1e-4) continue

        const Au = sx * ux + sy * uy - EYE * uz
        const Bu = EYE * uz
        const Av = sx * vx + sy * vy - EYE * vz
        const Bv = EYE * vz

        /* Clip the slab segment to the plate square, so a near-edge-on ray that
           runs almost parallel to the faces marches across the mark rather than
           across six units of empty space. */
        let ta = tFace > 1e-4 ? tFace : 1e-4
        let tb = tBack
        if (Au > 1e-9 || Au < -1e-9) {
          const p = (-1 - Bu) / Au
          const q = (1 - Bu) / Au
          const lo = p < q ? p : q
          const hi = p < q ? q : p
          if (lo > ta) ta = lo
          if (hi < tb) tb = hi
        } else if (Bu < -1 || Bu > 1) continue
        if (Av > 1e-9 || Av < -1e-9) {
          const p = (-1 - Bv) / Av
          const q = (1 - Bv) / Av
          const lo = p < q ? p : q
          const hi = p < q ? q : p
          if (lo > ta) ta = lo
          if (hi < tb) tb = hi
        } else if (Bv < -1 || Bv > 1) continue
        if (tb <= ta) continue

        let dens = 0
        let aaCov = 0
        let hu = 0
        let hv = 0
        let onFace = false

        /* FRONT FACE: the slab's near plane, if the eye is outside the slab and
           that entry point survived the clip. */
        if (tFace > 1e-4 && tFace >= ta - 1e-9) {
          hu = Au * tFace + Bu
          hv = Av * tFace + Bv
          const cN = covAt(hu, hv)
          if (cN > 0.02) {
            onFace = true
            aaCov = cN > 1 ? 1 : cN
            let tone = 1
            if (ttone) tone = ttone[texelAt(hu, hv)]
            dens = SH.faceLow + (faceBase - SH.faceLow) * tone
            /* A soft light band across the face, fixed in plate space, so a big
               flat mark still has somewhere for the eye to land. Its weight is a
               per-frame constant (see `sheenK`), so this is one exp and one
               multiply per cell rather than the three it used to be. */
            dens -= sheenK * Math.exp(-Math.pow((hu * 0.72 + hv * 0.62) * 1.5, 2))
          }
        }

        if (!onFace) {
          /* SIDE WALL: the ray entered outside the mark but may leave inside it,
             which can only happen by passing through the extruded edge. March
             the slab and take the first hit; how deep that hit sits says how
             much of the wall this cell actually covers. */
          const du = (Au * (tb - ta)) / STEPS
          const dv = (Av * (tb - ta)) / STEPS
          let u = Au * ta + Bu
          let v = Av * ta + Bv
          let hit = -1
          let cHit = 0
          for (let k = 0; k <= STEPS; k++) {
            const cv = covAt(u, v)
            if (cv > 0.06) {
              hit = k
              cHit = cv
              hu = u
              hv = v
              break
            }
            u += du
            v += dv
          }
          if (hit < 0) continue

          /* Wall normal: out of the mark, i.e. against the coverage gradient. */
          const gi = texelAt(hu, hv)
          let wu = -tgx[gi]
          let wv = -tgy[gi]
          let gl = Math.sqrt(wu * wu + wv * wv)
          if (gl < 1e-3) {
            /* Flat neighbourhood: fall back to the direction the ray travelled
               through the slab, which is the way it came in through the wall. */
            wu = -Au
            wv = -Av
            gl = Math.sqrt(wu * wu + wv * wv)
            if (gl < 1e-9) continue
          }
          wu /= gl
          wv /= gl
          /* The wall is perpendicular to the faces, so it has no normal
             component along n — only the in-plane part of the light reaches it. */
          let lam = wu * lu + wv * lv
          if (lam < 0) lam = 0
          dens = SH.wallMin + SH.wallRange * (1 - lam) - 0.06 * Math.abs(ln)
          /* A wall found only at the far end of the slab is a sliver. */
          dens *= 1 - (SH.wallThin * hit) / STEPS
          aaCov = cHit > 0.85 ? 0.85 : cHit
        }

        if (dens <= 0.004) continue
        dens = clamp(dens, 0, 1) * (0.34 + 0.66 * aaCov)

        /* Ordered dither keyed to the SURFACE, so the grain is printed on the
           plate and turns with it instead of crawling on the screen. */
        const jitter = hash2((hu * 52) | 0, (hv * 52) | 0) - 0.5
        const gi = (1 - dens) * (NR - 1) + jitter * SH.dither
        /* The fill glyph is simply the step past the end of the ramp, so the
           boundary between solid hatch and the darkest characters stipples with
           the same dither as every other step instead of banding. */
        const g = gi <= FILL_EDGE ? G_FILL : gi > NR - 1 ? NR - 1 : ((gi + 0.5) | 0)
        const ai = aaCov > 0.75 ? 0 : aaCov > 0.5 ? 1 : aaCov > 0.28 ? 2 : 3
        drawCell(g, ai, c, r)
        cells++
      }
    }
    lastCells = cells
  }

  /* ====================================================================
   * LIFECYCLE
   * ==================================================================== */
  let rafId = 0
  /* The spin clock advances at `speed`, rather than speed multiplying an
     absolute time — so changing speed on hover accelerates from where the mark
     already is instead of snapping it to a new angle. */
  let spinT = 0
  let lastNow = 0
  let playing = autoplay
  let visible = true
  let inView = true
  let frozen = false
  let readySignalled = false

  const capture = seekParam !== null || benchMode
  if (capture && autoplay) holdGate()

  function signalReady(): void {
    if (readySignalled) return
    readySignalled = true
    if (capture && autoplay) releaseGate()
  }

  function frame(now: number): void {
    rafId = 0
    if (destroyed) return
    if (!lastNow) lastNow = now
    let dt = (now - lastNow) / 1000
    lastNow = now
    if (dt > 0.25) dt = 0.25
    spinT += dt * speed
    render(spinT)
    rafId = requestAnimationFrame(frame)
  }

  function start(): void {
    if (destroyed || frozen || !playing || !ready || !visible || !inView || reduced) return
    if (rafId) return
    lastNow = 0
    rafId = requestAnimationFrame(frame)
  }

  function stop(): void {
    if (rafId) {
      cancelAnimationFrame(rafId)
      rafId = 0
    }
  }

  function rebuild(): void {
    readInk()
    measureAdvance()
    markExtents()
    sizeGrid()
    buildAtlas()
    buildTex()
    ready = true
    render(spinT)
  }

  /* The grid is sized from the monospace advance, and the first measurement can
     land on the fallback face if Geist Mono has not arrived yet. That changes the
     cell width by a fraction of a percent, which is invisible but moves the
     texture resolution by a texel — enough that two loads of the same ?logo_t
     draw different frames. Re-measure once the real face is in and rebuild if it
     moved. Registered before the capture gate's own fonts.ready callback, so a
     screenshot is taken after the correction, not before it. */
  try {
    document.fonts?.ready.then(() => {
      if (destroyed || !ready) return
      const before = advRatio
      measureAdvance()
      if (Math.abs(advRatio - before) > 1e-4) rebuild()
    })
  } catch {
    /* no font loading API: the first measurement is the only one */
  }

  /* ---- observers ----------------------------------------------------- */
  let ro: ResizeObserver | null = null
  if (typeof ResizeObserver !== 'undefined') {
    let pw = 0
    let ph = 0
    ro = new ResizeObserver(() => {
      const rect = container.getBoundingClientRect()
      if (Math.abs(rect.width - pw) < 0.5 && Math.abs(rect.height - ph) < 0.5) return
      pw = rect.width
      ph = rect.height
      if (!ready) return
      rebuild()
    })
    ro.observe(container)
  }

  let io: IntersectionObserver | null = null
  if (typeof IntersectionObserver !== 'undefined') {
    io = new IntersectionObserver(
      (entries) => {
        inView = entries[entries.length - 1].isIntersecting
        if (inView) start()
        else stop()
      },
      { threshold: 0 },
    )
    io.observe(container)
  }

  function onVisibility(): void {
    visible = !document.hidden
    if (visible) start()
    else stop()
  }
  document.addEventListener('visibilitychange', onVisibility)

  function onMotionPreference(): void {
    reduced = mq ? mq.matches : false
    if (reduced) {
      stop()
      render(0)
    } else {
      start()
    }
  }
  mq?.addEventListener('change', onMotionPreference)

  /* The atlas is baked in the ink colour, so re-bake when the theme changes. */
  let mo: MutationObserver | null = null
  try {
    mo = new MutationObserver(() => api.refreshTheme())
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class', 'style'] })
  } catch {
    mo = null
  }

  /* ---- bench --------------------------------------------------------- */
  function runBench(): void {
    const N = 240
    const times = new Float64Array(N)
    for (let i = 0; i < N; i++) {
      const a = performance.now()
      render(i * (1 / 60))
      times[i] = performance.now() - a
    }
    const arr = Array.from(times).sort((x, y) => x - y)
    const out = {
      src: options.src.slice(options.src.lastIndexOf('/') + 1),
      cols,
      rows,
      fontSize,
      dpr,
      texW,
      texH,
      cells: lastCells,
      avgMs: +(arr.reduce((sum, x) => sum + x, 0) / N).toFixed(3),
      p95Ms: +arr[Math.floor(N * 0.95)].toFixed(3),
      maxMs: +arr[N - 1].toFixed(3),
    }
    let pre = document.getElementById('logo-bench')
    let all: unknown[] = []
    if (pre) {
      try {
        all = (JSON.parse(pre.textContent || '[]') as unknown[]) ?? []
      } catch {
        all = []
      }
    } else {
      pre = document.createElement('pre')
      pre.id = 'logo-bench'
      pre.style.cssText = 'position:absolute;left:-9999px;top:0;'
      document.body.appendChild(pre)
    }
    all.push(out)
    pre.textContent = JSON.stringify(all)
  }

  /* ---- boot ---------------------------------------------------------- */
  getMark(options.src, shape, part)
    .then((m) => {
      if (destroyed) return
      mark = m
      boot()
    })
    .catch(() => {
      if (destroyed) return
      /* Nothing to draw beats throwing or leaving a half-built canvas. */
      failed = true
      mark = null
      boot()
    })

  function boot(): void {
    rebuild()
    if (seekParam !== null && autoplay) {
      frozen = true
      spinT = seekParam
      render(spinT)
    } else if (benchMode && autoplay) {
      frozen = true
      runBench()
    } else if (!autoplay) {
      frozen = true
      render(spinT)
    } else {
      start()
    }
    signalReady()
  }

  const api: AsciiLogoInstance = {
    play() {
      playing = true
      frozen = false
      start()
    },
    pause() {
      playing = false
      stop()
    },
    setSpeed(v) {
      speed = Number.isFinite(v) ? v : 0
      if (frozen || !playing) render(spinT)
    },
    seek(seconds) {
      spinT = Number.isFinite(seconds) ? seconds : 0
      render(spinT)
    },
    refreshTheme() {
      if (!ready) return
      const before = ink
      readInk()
      if (ink !== before) {
        buildAtlas()
        render(spinT)
      }
    },
    stats() {
      return { cols, rows, fontSize, dpr, texW, texH, cells: lastCells, t: +spinT.toFixed(2), failed }
    },
    dump() {
      if (!gridBuf.length) return ''
      const out: string[] = []
      for (let r = 0; r < rows; r++) {
        let line = ''
        for (let c = 0; c < cols; c++) {
          const g = gridBuf[r * cols + c]
          line += g === 255 ? ' ' : g === G_FILL ? '#' : RAMP[g]
        }
        out.push(line.replace(/\s+$/, ''))
      }
      return out.join('\n')
    },
    destroy() {
      /* Release the capture gate even if the mask never arrived, or a StrictMode
         unmount would hold a screenshot open forever. */
      signalReady()
      destroyed = true
      stop()
      ro?.disconnect()
      io?.disconnect()
      mo?.disconnect()
      mq?.removeEventListener('change', onMotionPreference)
      document.removeEventListener('visibilitychange', onVisibility)
      canvas.remove()
    },
    get playing() {
      return playing && !frozen
    },
  }

  return api
}
