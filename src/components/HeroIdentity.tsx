import { heroPhrases, person } from '../content'
import styles from './HeroIdentity.module.css'

/**
 * Hand-drawn underline: one confident marker swipe, plus a shorter second pass under
 * its left half that visibly peels away from it.
 *
 * The shape of both paths is doing specific work, so it is worth saying why. A wavy
 * line does NOT read as hand-drawn at this size — auditioned against six sine-ish
 * variants it reads as a decorative squiggle, because regular waves are exactly what a
 * hand does not produce. What reads as a marker is a line that is nearly straight but
 * unevenly bowed: MAIN sags through the middle, lifts towards the right and finishes on
 * a small upward flick, the way a fast stroke leaves the paper.
 *
 * GHOST is a second pass, not a shadow. Two near-parallel strokes one under the other
 * read as print misregistration however the wobble is tuned, so this one is short (it
 * gives up around x=300), dives further below the first than it starts, and carries
 * nearly full ink — so it reads as someone going over the left half twice.
 *
 * Both carry pathLength="1", which lets the draw-on animation be written as a plain
 * 1 -> 0 dash offset whatever the path actually measures.
 */
const SCRIBBLE_MAIN =
  'M3 17 C58 26 112 29 190 28 C264 27 316 30 390 26 C462 22 516 18 572 13 C592 11 608 12.5 618 19'
const SCRIBBLE_GHOST = 'M20 25 C84 33 148 35 212 34 C250 33.5 276 32 296 30'

/**
 * The sentence, split at the name: "My name is" is set in the site's own Geist and
 * "Andy He" becomes the sign. Derived from the content rather than hard-coded, so a
 * phrase that no longer ends in the name simply sets the whole thing as the lead and
 * leaves the sign out — which is also what makes the split safe to read aloud, because
 * the two halves together are still exactly the sentence in content.ts.
 */
const PHRASE = heroPhrases[1]
const HAS_SIGN = PHRASE.endsWith(person.name) && PHRASE.length > person.name.length
const LEAD = HAS_SIGN ? PHRASE.slice(0, -person.name.length).trim() : PHRASE

/**
 * "New York City, USA" -> "New York City". A sign carries the place, not the postal
 * address — and the caption row along the foot of the card already prints the full
 * string, so the short form is also what keeps the two from reading as a copy-paste.
 */
const PLACE = person.location.split(',')[0].trim()

/**
 * The line of caps above the name: "https://github.com/Ascensionn" -> "@ASCENSIONN".
 *
 * It used to be person.role, and that is the one thing on this card that had to change:
 * the caption row along the foot prints person.role verbatim, so the plaque was setting
 * "SOFTWARE / DATA ENGINEER" twice in the same mono caps within one screen — about
 * 150px apart once the block stacks on a phone. It read as a copy-paste bug rather than
 * as a sign.
 *
 * The handle is the right thing to put there instead: it is a fact already on the page
 * (the contact section lists it), it is the one label that belongs ON a tag rather than
 * beside it, and it is short, so the caption stops competing with the name at 320px.
 * Nothing is lost — the role is still in the foot chip, in the About table and in the
 * page description. To go back, this is one line: `const HANDLE = person.role`.
 */
const HANDLE = '@' + (person.github.split('/').filter(Boolean).pop() ?? person.name)

type Props = {
  /** The intro has reached its last beat: the ASCII phrase hands over to this. */
  shown: boolean
}

/**
 * The final beat of the hero intro: the portrait and the name, set in real type and sized
 * to carry the card.
 *
 * The name is a SIGN — a small framed plaque, tilted a couple of degrees, its word set in a
 * vandal display face and boxed in by two hairlines and a line of mono caps above and below.
 * It sits in the sentence the way a place name sits on a shopfront: "My name is" leads into
 * it in the site's own Geist, and the plaque is the thing the eye lands on.
 *
 * The <h1> lives here and is always in the document — before the beat lands it is simply
 * transparent, so the page has a correct, readable heading from the first byte while the
 * ASCII phrase is still the thing on screen. Critically the plaque is styling, not a picture:
 * the heading's own text is exactly "My name is Andy He", in that order, whichever way it is
 * read — accessible name, textContent, a copy of the selection, find-in-page. The sign's two
 * caption lines are drawn by CSS from a data attribute and so are in none of those. The
 * canvas behind it fades away entirely (see Hero.module.css), so the card never cuts, it
 * cross-dissolves to clean paper.
 */
export function HeroIdentity({ shown }: Props) {
  return (
    <div className={styles.wrap} data-shown={shown || undefined}>
      <div className={styles.block}>
        <figure className={styles.portrait}>
          <img
            src={person.portrait.src}
            width={person.portrait.width}
            height={person.portrait.height}
            alt={person.portrait.alt}
            decoding="async"
            fetchPriority="high"
          />
        </figure>

        <h1 className={styles.name}>
          <span className={styles.lead}>
            {LEAD}
            {/* No preserveAspectRatio="none": the CSS gives this box the viewBox's own
                620:34, so x and y scale by the same factor and the round nib stays round
                instead of being squashed into an ellipse at wide sizes. */}
            <svg className={styles.scribble} viewBox="0 0 620 34" aria-hidden="true" focusable="false">
              <path className={`${styles.stroke} ${styles.strokeMain}`} pathLength={1} d={SCRIBBLE_MAIN} />
              <path className={`${styles.stroke} ${styles.strokeGhost}`} pathLength={1} d={SCRIBBLE_GHOST} />
            </svg>
          </span>

          {/* A real space between the two halves. They are separate blocks, so it never shows
              on screen, but it is what keeps the heading's text "My name is Andy He" rather
              than "My name isAndy He" for anything reading the DOM. */}
          {HAS_SIGN ? ' ' : null}

          {HAS_SIGN ? (
            <span className={styles.sign}>
              <span className={styles.plaque}>
                {/* The two caption lines are the sign's furniture, not the heading's text,
                    so they are carried on an attribute and painted by CSS `content:
                    attr(data-cap)` rather than written into the element.

                    aria-hidden already kept them out of the accessible name, but it does
                    nothing for the other three ways this heading is read: h1.textContent,
                    a copy of the selected heading and find-in-page all walked straight
                    through them, so the <h1> "said" *My name is / SOFTWARE / DATA ENGINEER
                    / Andy He / NEW YORK CITY*. Generated content is in none of those, so
                    the heading is now exactly "My name is Andy He" however it is read —
                    on screen, by a screen reader, by the clipboard or by a crawler. */}
                <span className={styles.caption} data-cap={HANDLE} aria-hidden="true" />
                <span className={styles.word}>{person.name}</span>
                <span className={styles.caption} data-cap={PLACE} aria-hidden="true" />
              </span>
            </span>
          ) : null}
        </h1>
      </div>
    </div>
  )
}
