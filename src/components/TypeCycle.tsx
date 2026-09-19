import { useEffect, useRef, useState, type RefObject } from 'react'
import { flushSync } from 'react-dom'
import { article } from '../content'
import { MARK_LOOP, useStillMode } from '../lib/env'
import { fitWord, type FittedFace } from '../lib/faces'
import styles from './TypeCycle.module.css'

/**
 * The one type-cycling block on the site. Two callers, one implementation:
 *
 *  - About sets the statement "Hello! I am a <WORD>", where the word is the big thing and
 *    changes every two seconds (src/content.ts `roles`).
 *  - The closing panel sets one fixed word — the "Andy He" wordmark — which never changes.
 *
 * What moves is TYPE, and only type. The word is auditioned continuously: a new face every third
 * of a second or so, the way a designer flicks through options with the specimen on screen.
 * Weight, width and slant come along with the face, because each candidate in src/lib/faces.ts
 * carries its own.
 *
 * SIZE is auditioned too, but only where the block is a word inside a sentence — About's
 * statement, which is what the owner was looking at when he asked for the type to keep changing
 * size. The closing panel opts out (`size="fixed"`), because a wordmark's whole gesture is
 * spanning the card: measured over 30s (build/k5-extent.mjs) the ladder swung his name between
 * 52% and 98% of the card's measure, and the frames at the bottom of that range read as a name
 * that had lost its nerve rather than as a closing mark. With the ladder off, nine of the twelve
 * faces set it to exactly the full measure and the three that do not (Helvetica, Arial Narrow,
 * Impact) are narrow by their own design at the same cap height, which is the typography being
 * honest rather than the block zooming.
 *
 * What does NOT move:
 *
 *  - COLOUR. Ink on card, in both themes, in every frame. There is no inversion, no scheme swap,
 *    no background flip — the owner asked for that to go, and there is deliberately no code path
 *    left that could bring it back. Nothing in here touches a colour token.
 *  - LAYOUT. The word sits out of flow inside a box reserved at the resting size, so neither a
 *    longer word nor a wider face nor a size change can move anything around it. Both the fit and
 *    the size are applied as transforms, which the browser excludes from layout-shift scoring by
 *    definition and which cost a composited redraw rather than a reflow of a 150px display line.
 *  - THE CADENCE. Word to word is a flat HOLD (2s). The type steps on its own faster timer, so
 *    the two never drift into each other; a word change simply restarts the type timer, which is
 *    what makes every new word land in a new face in the same frame.
 *
 * And there is no pause control. There used to be one, for WCAG 2.2.2, back when the effect
 * included a full-card light/dark flip; what is left is a font swap inside one line of a
 * statement, which is the same category as a caret or a slow crossfade. The motion still stops
 * whenever the block is off screen or the tab is in the background, and prefers-reduced-motion
 * renders one word in the site's own Geist with nothing running at all.
 */

/** Word to word, in ms — the two seconds the owner asked for. */
const HOLD = 2000

/** `?mark=loop`: the same rotation, faster, for capturing every word in a few seconds. */
const LOOP_HOLD = 700

/**
 * Type change to type change, in ms, drawn uniformly from this range.
 *
 * The window matters more than the average. A fixed interval reads as a machine ticking; a range
 * this wide reads as a hand. At ~430ms mean it is four or five faces per word — enough that the
 * type is visibly being tried, few enough that every one of them can be read before it goes.
 */
const STEP_MIN = 340
const STEP_MAX = 520

/**
 * The size ladder, as multipliers on the fitted size. Used where `size` is 'audition'.
 *
 * `fit` in faces.ts deliberately sets every face to the same ink width — that is what stops a
 * swap reflowing the sentence — so without this the specimen would change shape and never size.
 * These multiply it, and they are all <= 1, so the word can only ever be smaller than the box
 * already reserved for it: no size in the ladder can reach an edge, at any width, in any face.
 *
 * The band is deliberately tight: Andy asked for the size to move by no more than about 10px
 * either way. At the shipped desktop size (~150px) these rungs span roughly 14px top to bottom,
 * so the specimen breathes without the sentence appearing to change its mind about how big it is.
 * They stay <= 1 so the word can still never reach the edge of its reserved box.
 */
const SIZES = [1, 0.967, 0.934]

/** Every custom property the audition writes, so stopping can put them all back. */
const MARK_VARS = ['family', 'weight', 'style', 'track', 'fit', 'top', 'left', 'size'] as const

type Options = {
  /** The rotation, in order. Identity must be stable — pass a module constant. */
  words: readonly string[]
  /** The word the block rests on, and where the loop starts. */
  start: number
  /** False pins the specimen at its fitted size and auditions the face alone. */
  sizing: boolean
  /** prefers-reduced-motion or a static capture: one word, one face, nothing running. */
  skip: boolean
  loop: boolean
}

/** Picks a different index in [0, length). Returns `current` only if there is no other. */
function other(length: number, current: number): number {
  if (length < 2) return current
  let next = current
  while (next === current) next = Math.floor(Math.random() * length)
  return next
}

/** Returns the index of the word the block should be showing. */
function useTypeCycle(rootRef: RefObject<HTMLElement | null>, { words, start, sizing, skip, loop }: Options): number {
  const [index, setIndex] = useState(start)
  // The effect drives the rotation on timers and must not be torn down and rebuilt on every
  // tick, so its own cursor lives in a ref and the state is only what React renders from.
  const cursor = useRef(start)

  useEffect(() => {
    if (skip) return
    const mark = rootRef.current
    if (!mark) return

    let alive = true
    let faces: FittedFace[] = []
    let typeTimer = 0
    let wordTimer = 0
    let faceIndex = 0
    let sizeIndex = 0
    let running = false
    let onScreen = false
    let upFront = document.visibilityState === 'visible'
    const hold = loop ? LOOP_HOLD : HOLD

    /* The word's hold is BANKED, not restarted.
       `holdLeft` is how much of the current word's two seconds is still owed, and `armedAt` is
       when the timer running it was last set. A pause spends what has elapsed and keeps the rest;
       resuming schedules only the remainder. Restarting the full hold instead looks harmless and
       is not: the block pauses whenever it leaves the observer, an ordinary scroll crosses that
       line repeatedly, and every crossing put the word back on a fresh two seconds. Measured with
       build/k5-stall.mjs — a slow scroll up and down past the statement stretched the gaps to
       4.0s and then 4.6s, and a faster one held one word for nine seconds while the typeface went
       on changing underneath it, which reads as the rotation having broken. Banking the remainder
       makes the hold two seconds OF BEING WATCHED, which is what it was always meant to be. */
    let holdLeft = hold
    let armedAt = 0

    const setFace = (face: FittedFace) => {
      mark.style.setProperty('--mark-family', face.family)
      mark.style.setProperty('--mark-weight', String(face.weight))
      mark.style.setProperty('--mark-style', face.style)
      mark.style.setProperty('--mark-track', String(face.tracking))
      mark.style.setProperty('--mark-fit', face.fit.toFixed(4))
      mark.style.setProperty('--mark-top', face.top.toFixed(4))
      mark.style.setProperty('--mark-left', face.left.toFixed(4))
    }

    /** Back to the stylesheet's own values, which are the resting face at full size. */
    const clearType = () => {
      faceIndex = 0
      sizeIndex = 0
      for (const name of MARK_VARS) mark.style.removeProperty(`--mark-${name}`)
    }

    /**
     * One decision: a face that is not the current one, and — where the block auditions size —
     * a rung of the ladder that is not the current one. With `sizing` off, --mark-size is never
     * written at all, so the stylesheet's own 1 stands and the specimen is always as large as its
     * face will go inside the reserved box.
     */
    const audition = () => {
      if (faces.length > 1) {
        faceIndex = other(faces.length, faceIndex)
        setFace(faces[faceIndex])
      }
      if (!sizing) return
      sizeIndex = other(SIZES.length, sizeIndex)
      mark.style.setProperty('--mark-size', SIZES[sizeIndex].toFixed(4))
    }

    /**
     * The type changes are laid out INSIDE the word's hold rather than run on a clock of their
     * own. Two independent timers beat against each other: a face set 100ms before the word
     * changed was painted for those 100ms and then thrown away with the word, which read as a
     * flash rather than as a choice. So each word divides its remaining hold into equal steps —
     * every face, including the last one, gets the same slice, and the last one ends exactly as
     * the word changes.
     *
     * `remaining` is what is left of this word's hold, so a block that resumes mid-word fills the
     * time it actually has instead of overrunning into the next word.
     */
    const planType = (remaining: number) => {
      window.clearTimeout(typeTimer)
      typeTimer = 0
      // One word (the closing panel's wordmark) has no word clock to divide, so it free-runs.
      if (words.length < 2) {
        const freeTick = () => {
          typeTimer = 0
          if (!alive) return
          audition()
          typeTimer = window.setTimeout(freeTick, STEP_MIN + Math.random() * (STEP_MAX - STEP_MIN))
        }
        typeTimer = window.setTimeout(freeTick, STEP_MIN + Math.random() * (STEP_MAX - STEP_MIN))
        return
      }
      // A hold that is nearly spent (a block resuming just before its word changes) gets no steps
      // at all: one more face there would be seen for a moment and then thrown away with the word,
      // which is the flash this scheduling exists to remove.
      if (remaining < STEP_MAX * 1.5) return
      const mean = (STEP_MIN + STEP_MAX) / 2
      let count = Math.round(remaining / mean) - 1
      if (count < 1) return
      const gap = remaining / (count + 1)
      let left = count
      const tick = () => {
        typeTimer = 0
        if (!alive) return
        audition()
        left -= 1
        if (left > 0) typeTimer = window.setTimeout(tick, gap)
      }
      typeTimer = window.setTimeout(tick, gap)
    }

    /**
     * The word changes and its type changes in the same frame.
     *
     * Each word is fitted separately (faces.ts measures every face against the word it will be
     * setting), so the scale and the baseline offset that belong to "Builder" are the wrong ones
     * for "Software Engineer" — by up to a fifth of the set width, and off the shared baseline.
     * Left to React's own scheduling that mismatch could be painted for a frame. flushSync
     * commits the new word first, and the audition that follows is still inside this same task,
     * so no frame is ever painted with one word wearing another word's measurements.
     */
    const advance = () => {
      const next = (cursor.current + 1) % words.length
      cursor.current = next
      flushSync(() => setIndex(next))
      const spec = fitWord(words[next])
      faces = spec.faces
      mark.style.setProperty('--mark-base', spec.baseline.toFixed(4))
      // Nothing to audition means nothing may keep the previous word's fit either.
      if (faces.length < 2) clearType()
      faceIndex = 0
    }

    /** Runs the rest of this word's hold, from now. */
    const armWord = (ms: number) => {
      holdLeft = ms
      armedAt = performance.now()
      wordTimer = window.setTimeout(wordTick, ms)
    }

    const wordTick = () => {
      wordTimer = 0
      if (!alive) return
      advance()
      // The new word arrives wearing a new face, and its own hold is divided from here.
      audition()
      planType(hold)
      armWord(hold)
    }

    const run = () => {
      if (!alive || running || !onScreen || !upFront || faces.length < 2) return
      running = true
      // Fill only what is left of this word's hold, so resuming never overruns the next change.
      planType(holdLeft)
      // One word — the closing panel's wordmark — cycles type and nothing else.
      if (words.length > 1) armWord(holdLeft)
    }

    /**
     * Stop, without forgetting anything.
     *
     * It deliberately does NOT call clearType(). Resetting the specimen to the stylesheet's Geist
     * on every pause looks like tidying up and is visible: the observer lets go while the block
     * is still partly on screen, so scrolling past the statement snapped the word back to the
     * resting face in plain sight (21 such frames in a single scroll, build/k5-stall.mjs). Off
     * screen there is nothing to tidy, and the effect's own teardown below still clears it.
     */
    const halt = () => {
      if (!running) return
      running = false
      window.clearTimeout(typeTimer)
      typeTimer = 0
      if (wordTimer) {
        holdLeft = Math.max(0, holdLeft - (performance.now() - armedAt))
        window.clearTimeout(wordTimer)
        wordTimer = 0
      }
    }

    /* threshold 0, not 0.2. The thing being avoided is work no one can see, so the test is
       whether any of the block is on screen at all. A fifth of a 140px statement is 28px, and a
       card this tall crosses that line in the middle of an ordinary scroll — which used to mean
       the type stopped changing while the word was still being read. */
    const observer = new IntersectionObserver(
      (entries) => {
        const next = entries.some((entry) => entry.isIntersecting)
        if (next === onScreen) return
        onScreen = next
        if (next) run()
        else halt()
      },
      { threshold: 0 },
    )
    observer.observe(mark)

    const onVisibility = () => {
      upFront = document.visibilityState === 'visible'
      if (upFront) run()
      else halt()
    }
    document.addEventListener('visibilitychange', onVisibility)

    // Measuring before the webfonts land would fit Geist's stack to a fallback.
    const ready = document.fonts ? document.fonts.ready : Promise.resolve()
    void ready.then(() => {
      if (!alive) return
      const spec = fitWord(words[cursor.current])
      faces = spec.faces
      mark.style.setProperty('--mark-base', spec.baseline.toFixed(4))
      run()
    })

    return () => {
      alive = false
      observer.disconnect()
      document.removeEventListener('visibilitychange', onVisibility)
      window.clearTimeout(typeTimer)
      window.clearTimeout(wordTimer)
      clearType()
    }
  }, [rootRef, words, sizing, skip, loop])

  return index
}

type Props = {
  /** The rotation, in order. Must be a module constant — a fresh array per render restarts it. */
  words: readonly string[]
  /** The word shown when nothing may move, and where the loop starts. Defaults to the first. */
  resting?: string
  /** Quiet line above the word. The article that fits the current word is appended to it. */
  lead?: string
  /**
   * On a card narrower than 520px, set each token of the word on its own line in a box that is
   * always two lines tall — bigger type, at the cost of a line that a single-token word leaves
   * empty. Worth it only where that empty line falls against a rule rather than inside a
   * sentence; see the block at the foot of TypeCycle.module.css.
   */
  stack?: boolean
  /**
   * 'audition' (the default) changes the specimen's size as well as its face, which is what the
   * statement does: the word is one element inside a sentence, and trying it larger and smaller
   * reads as type being chosen. 'fixed' keeps every face at the largest size that fits the
   * reserved box and changes only the letterforms — what the closing wordmark takes, because a
   * name that spans the card IS the gesture and shrinking it undoes the gesture.
   */
  size?: 'audition' | 'fixed'
  /** The consumer's own class, carrying the display size. */
  className?: string
}

export function TypeCycle({ words, resting, lead, stack, size = 'audition', className }: Props) {
  const rootRef = useRef<HTMLParagraphElement>(null)
  const still = useStillMode()
  const start = Math.max(0, resting ? words.indexOf(resting) : 0)
  const index = useTypeCycle(rootRef, { words, start, sizing: size === 'audition', skip: still, loop: MARK_LOOP })
  const word = words[index]

  /* The word is ONE text node, with its spaces written as newlines.

     Phones set a two-word role one word per line, and that break has to be authored rather than
     discovered: every face is fitted to its own width, so a condensed one can hold on a single
     line what Geist breaks in two, and the block would gain or lose a line mid-cycle. A newline
     plus `white-space` does that authoring in CSS — `nowrap` collapses it back to a space on a
     wide card, `pre-line` honours it on a narrow one — and the line count stays a property of
     the word, never of the typeface of the moment.

     It was a span per word until this proved to be the whole of the block's layout shift. Two
     spans on one line means the second one's start position depends on the first one's width,
     and every face sets that width differently, so each swap moved an element: measured over
     40s at 1440 (build/c4-clslab.mjs) two-word roles accounted for 0.117 of a 0.125 total,
     against 0.0005 for the same run with the tokens merged into one node. A single text node
     whose left edge never moves and whose width merely changes is not an unstable element at
     all, so the browser has nothing to score. */
  const setting = word.replace(/ /g, '\n')

  return (
    /* Deliberately NOT a live region. At any moment this paragraph reads as one whole line —
       "Hello! I am a Software Engineer" — which is what a screen reader should get, and
       announcing a new word every two seconds would be that line turned into an interruption.
       It is real, selectable, findable text throughout: the effect is a font swap, never a
       canvas and never an image. */
    <p ref={rootRef} className={[styles.mark, stack ? styles.stack : null, className].filter(Boolean).join(' ')}>
      {/* The article belongs to the word that is up, so it is worked out here and not written
          into content.ts: "a Founder", "an Engineer". A block with only one fixed word has no
          article to fit, so its lead is printed as given. */}
      {lead ? <span className={styles.lead}>{words.length > 1 ? `${lead} ${article(word)}` : lead}</span> : null}
      {lead ? ' ' : null}

      <span className={styles.slot}>
        <span className={styles.sizer}>
          <span className={styles.face}>{setting}</span>
        </span>
      </span>
    </p>
  )
}
