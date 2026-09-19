/**
 * The type specimen behind the site's cycling words — the About statement's rotating role and
 * the closing panel's "Andy He" (src/components/TypeCycle.tsx).
 *
 * Each word is auditioned in a handful of faces the way a designer flicks through options.
 * Nothing here adds a webfont: it is the two families the site already loads (Geist, Geist Mono)
 * plus system families, each written as a stack that degrades to something of the same flavour.
 *
 * Every candidate is fitted at runtime so the swap cannot move the page:
 *   fit  — a font-size multiplier that holds the specimen inside the resting face's ink box
 *          (never wider, never taller), so no face overflows the card.
 *   top  — the offset that puts every face on one shared baseline.
 *   left — the offset that lines up every face's first ink pixel.
 *
 * The three are applied to an absolutely positioned span inside a fixed-height box, so a swap
 * changes glyphs and nothing else. Faces whose stack resolves to a font that is already in the
 * list (Impact on a machine without Impact, say) are dropped, so every swap is visibly a swap.
 *
 * `fit` deliberately sets every face to the SAME ink width, which is what keeps the sentence
 * from reflowing — so on its own the specimen never changes size. The size half of the audition
 * is a second, independent scale applied about `baseline` by TypeCycle; see the comment there.
 */

/** Measurement size. Everything derived from it is a ratio, so it never reaches the page. */
const REF = 100

/** The resting face's `top`, duplicated as the CSS default in TypeCycle.module.css. */
const REST_TOP = -0.1

export type Face = {
  id: string
  /** A font-family stack, ready for the custom property. */
  family: string
  weight: number
  style: 'normal' | 'italic'
  /** letter-spacing, in em of the face's own size. */
  tracking: number
}

/** The resting face is first; the rest are what the burst flicks through. */
export const FACES: Face[] = [
  { id: 'geist', family: "'Geist', system-ui, sans-serif", weight: 800, style: 'normal', tracking: -0.055 },
  { id: 'mono', family: "'Geist Mono', ui-monospace, monospace", weight: 700, style: 'normal', tracking: -0.03 },
  { id: 'mono-oblique', family: "'Geist Mono', ui-monospace, monospace", weight: 700, style: 'italic', tracking: -0.03 },
  { id: 'serif', family: "Georgia, 'Times New Roman', serif", weight: 700, style: 'normal', tracking: -0.02 },
  { id: 'serif-italic', family: "'Times New Roman', Times, serif", weight: 700, style: 'italic', tracking: -0.01 },
  { id: 'typewriter', family: "'Courier New', Courier, monospace", weight: 700, style: 'normal', tracking: -0.02 },
  { id: 'slab', family: "'American Typewriter', 'Courier New', monospace", weight: 700, style: 'normal', tracking: -0.02 },
  { id: 'grotesque', family: "Helvetica, 'Helvetica Neue', Arial, sans-serif", weight: 700, style: 'normal', tracking: -0.045 },
  { id: 'poster', family: "Impact, Haettenschweiler, 'Arial Narrow Bold', sans-serif", weight: 400, style: 'normal', tracking: -0.005 },
  { id: 'condensed', family: "'Arial Narrow', 'Helvetica Neue', Arial, sans-serif", weight: 700, style: 'normal', tracking: -0.01 },
  { id: 'geometric', family: "Futura, 'Trebuchet MS', 'Century Gothic', sans-serif", weight: 700, style: 'normal', tracking: -0.03 },
  { id: 'wide', family: 'Verdana, Geneva, sans-serif', weight: 700, style: 'normal', tracking: -0.045 },
]

/* Two candidates were tried and cut, both on the evidence of shots-footer/faces-1440:
   - a didone (Didot/Bodoni) was the one face whose hairlines went nearly invisible at flick
     speed, against a brief that asks for black and bold, and its "y" fell deep enough to crowd
     the rule above the meta row;
   - system-ui, which on macOS is SF Pro and is close enough to Geist that the swap did not read
     as a swap at all. */

export type FittedFace = Face & { fit: number; top: number; left: number }

type Metrics = { inkW: number; ascent: number; left: number; fbA: number; fbD: number }

function measure(ctx: CanvasRenderingContext2D, face: Face, word: string): Metrics | null {
  ctx.font = `${face.style} ${face.weight} ${REF}px ${face.family}`
  // Canvas letter-spacing landed in Chrome 99 / Safari 18; without it the fit is a hair loose,
  // which only ever leaves a little more slack at the card's edge.
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${face.tracking * REF}px`
  const m = ctx.measureText(word)
  const inkW = m.actualBoundingBoxRight + m.actualBoundingBoxLeft
  const out = { inkW, ascent: m.actualBoundingBoxAscent, left: m.actualBoundingBoxLeft, fbA: m.fontBoundingBoxAscent, fbD: m.fontBoundingBoxDescent }
  // `left` is the only one allowed to be negative or zero.
  const positive = [out.inkW, out.ascent, out.fbA, out.fbD]
  return positive.every((n) => Number.isFinite(n) && n > 0) && Number.isFinite(out.left) ? out : null
}

/**
 * What one word's audition needs.
 *
 * `baseline` is where every fitted face's baseline lands, in em of the display size, measured
 * down from the top of the reserved box. It is a property of the resting FONT rather than of the
 * word — `fontBoundingBoxAscent/Descent` do not depend on the string — so it is the same number
 * for every word on the page, and TypeCycle uses it as the origin the size scale pivots about.
 */
export type Specimen = { faces: FittedFace[]; baseline: number }

/* One entry per word. The About statement rotates through ten of them and each has its own
   proportions — "Software Engineer" is nearly two and a half times the width of "Builder" —
   so a face's fit has to be measured against the word it will actually be setting. Words are a
   short fixed list, measured once each, so the map never grows. */
const cache = new Map<string, Specimen>()

/** The resting baseline, for the frames before anything has been measured. */
const REST_SPECIMEN: Specimen = { faces: [], baseline: REST_TOP + 0.9 }

/**
 * Measures every candidate against one word (call after `document.fonts.ready`) and returns the
 * ones that render differently from each other, fitted to that word's resting box. An empty
 * face list means the browser would not measure: the caller then leaves the CSS defaults alone
 * and never cycles.
 */
export function fitWord(word: string): Specimen {
  const hit = cache.get(word)
  if (hit) return hit
  const ctx = document.createElement('canvas').getContext('2d')
  if (!ctx) return REST_SPECIMEN

  const base = measure(ctx, FACES[0], word)
  if (!base) return REST_SPECIMEN
  // The baseline every face is pinned to, in em of the wordmark box, chosen so the resting
  // face's own offset comes out as REST_TOP — i.e. exactly what the stylesheet already says.
  const baseline = REST_TOP + 0.5 + (base.fbA - base.fbD) / (2 * REF)

  const seen = new Set<string>()
  const fitted: FittedFace[] = []
  for (const face of FACES) {
    const m = measure(ctx, face, word)
    if (!m) continue
    const key = [m.inkW, m.ascent, m.fbA, m.fbD].map((n) => Math.round(n)).join('/')
    if (seen.has(key)) continue
    seen.add(key)

    // As big as fits: never wider than the resting face's word, never taller than its ascenders.
    const fit = Math.min(base.inkW / m.inkW, base.ascent / m.ascent)
    if (!(fit > 0.3 && fit < 3)) continue
    // `top` and `left` are consumed as em of the face's own size, hence the division by fit.
    const top = (baseline - fit * (0.5 + (m.fbA - m.fbD) / (2 * REF))) / fit
    const left = (m.left * fit - base.left) / REF / fit
    fitted.push({ ...face, fit, top, left })
  }

  const specimen: Specimen = { faces: fitted, baseline }
  cache.set(word, specimen)
  return specimen
}
