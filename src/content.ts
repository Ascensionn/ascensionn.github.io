// Every fact on the site lives here. Edit this file to update copy, links, or experience.
import meJpg from './assets/images/me.jpg'
import heroPortraitJpg from './assets/images/portrait-hero.jpg'
import scriberPng from './assets/images/scriber-mark.png'
import tiktokPng from './assets/images/tiktok.png'
import herePng from './assets/images/here.jpg'
import vipshopPng from './assets/images/vipshop.png'

export type Image = { src: string; width: number; height: number; alt: string }

/**
 * How the experience row reads this artwork when it extrudes it into a turning
 * plate (src/ascii/logo3d.ts). Not facts about the company — facts about the
 * file, which is why they live beside the file reference rather than in the
 * renderer.
 */
export type Mark = {
  /** `ink` cuts the plate from the artwork's ink; `tile` keeps a whole app tile. */
  shape?: 'ink' | 'tile'
  /** `icon` drops a wordmark that sits beside the mark; `full` keeps every stroke. */
  part?: 'auto' | 'icon' | 'full'
  /** Size trim, 1 = the mark fills its box. */
  scale?: number
}

export type Experience = {
  company: string
  summary: string
  logo: Image
  mark?: Mark
  url?: string
}

export const person = {
  name: 'Andy He',
  /* Still what he does, and still printed as the hero's foot chip and in the page/OG description.
     It is no longer a row in the About table — that row is his degrees now (see `education`). */
  role: 'Software / Data Engineer',
  /* The fixed one-sentence version of the About statement. The About card sets the sentence with
     a rotating word in the middle (`roles` below); this flat string is what the hero and the
     phone menu print, where a rotation would be one moving thing too many. */
  tagline: 'Hello! I am a Software/Data Engineer, passionate about Big Data.',
  location: 'New York City, USA',
  email: 'itsandy.he2004@gmail.com',
  phone: '(734) 999-7893',
  phoneHref: 'tel:+17349997893',
  github: 'https://github.com/Ascensionn',
  linkedin: 'https://www.linkedin.com/in/andy-he-6778241b1/',
  /** The hero's closing beat — the suit photograph, first thing a visitor sees. */
  heroPortrait: { src: heroPortraitJpg, width: 800, height: 800, alt: 'Portrait of Andy He' } satisfies Image,
  /** The About card's figure. */
  portrait: { src: meJpg, width: 800, height: 800, alt: 'Portrait of Andy He' } satisfies Image,
}

/**
 * The fixed half of the About statement, which reads
 *
 *     Hello! I am
 *     A ROTATING WORD
 *
 * `lead` has no article on it: "a" or "an" is worked out from whichever word is up (see
 * `article` below). It stops at the word, with no punctuation closing it — the whole sentence,
 * Big Data and all, is `person.tagline` above, which the hero and the phone menu print.
 */
export const statement = {
  lead: 'Hello! I am',
}

/* ---------------------------------------------------------------- THE ROTATING WORDS
 *
 *  ===> THIS IS THE LIST TO EDIT. One word arrives every two seconds, after "Hello! I am a…". <===
 *
 * Order is the order they appear in, so the list reads as a loop starting at `restingRole`.
 *
 * Three house rules:
 *  - The article in front is worked out from the word itself ("a Founder", "an Engineer"), so
 *    nothing here needs one.
 *  - Two words at most. A phone sets each word on its own line, and the box it sits in is
 *    exactly two lines tall, so a three-word entry would run into the portrait below it.
 *  - The slot is sized to the LONGEST entry, and every other word is set at that same size.
 *    "Software Engineer" is the longest today and fills the card's measure exactly; a longer
 *    one would shrink the whole set. `node build/rot-fit.mjs <url>` re-measures and prints the
 *    divisor that About.module.css uses if you ever need to change it.
 *
 * Every word here is Andy's own: Learner, Founder, Software Engineer, Student, Data Engineer
 * and Builder were his first list, and Engineer, Problem-solver, Creator and Thinker were the
 * four he added afterwards (his spelling of "Problem-solver", hyphen and all, is kept). Nothing
 * here claims a credential, an employer or a school. "New Yorker" used to be in this list and
 * was removed at his request — he is not one.
 */
export const roles: string[] = ['Learner', 'Founder', 'Software Engineer', 'Engineer', 'Student', 'Data Engineer', 'Builder', 'Problem-solver', 'Creator', 'Thinker']

/**
 * The word that stands still when nothing may move: prefers-reduced-motion, a static capture,
 * or the very first paint before the rotation starts. It is also where the loop begins, so a
 * visitor who arrives and a visitor who cannot see motion read the same first sentence.
 *
 * It must be one of `roles`. It is deliberately the longest entry — the slot is sized to that
 * word, so the still state is the one frame where the sentence fills its measure exactly.
 */
export const restingRole = 'Software Engineer'

/**
 * The indefinite article for a role word. English spells it by SOUND, not by letter, so the
 * vowel test is only a good default: "an Engineer", "a Founder" — and "a User" or "an Hour"
 * would both need the exception list below, which is empty until a word needs it.
 */
export function article(word: string): 'a' | 'an' {
  return /^[aeiou]/i.test(word) ? 'an' : 'a'
}

export type Study = {
  /** The row's own label in the About table. */
  term: string
  /** One line each, in the order they should be read. */
  degrees: string[]
  school: string
  /** Still being read. The table prints "(in progress)" after the school; nothing else implies it. */
  inProgress?: boolean
}

/**
 * Andy's degrees — the rows that replaced "Role" in the About table.
 *
 * Verbatim from him: "I graduated with a B.S. in Computer Science and a B.S. in Economics at
 * University of Michigan - Ann Arbor, and now am pursuing a M.S. in Artificial Intelligence"
 * "in Columbia University".
 *
 * NO DATES, NO GPA, NO HONOURS. He gave none, so the table states none — and "in progress" is a
 * fact he did give, not an inference. Add a `year` here only when he supplies one.
 *
 * Two rows rather than one: the completed pair share a school and read as one block, and the
 * one he is still reading wants its own label so nobody has to work out which is which. Each
 * row's degrees stack, and the school sits under them in the table's quiet tone.
 */
export const education: Study[] = [
  {
    term: 'Education',
    degrees: ['B.S. Computer Science', 'B.S. Economics'],
    school: 'University of Michigan - Ann Arbor',
  },
  {
    term: 'Studying',
    degrees: ['M.S. Artificial Intelligence'],
    school: 'Columbia University',
    inProgress: true,
  },
]

/**
 * Phrases the ASCII hero spells, in order.
 *
 * Only the FIRST is spelled on screen: the hero assembles it, holds it, then breaks it
 * apart again and hands over to the typeset identity block. The second is kept because the
 * engine's two-phrase choreography is still wired (CONFIG.twoPhrase in src/ascii/engine.ts),
 * and because HeroIdentity.tsx reads the sentence it sets from here.
 */
export const heroPhrases: [string, string] = ['Welcome to my website!', 'My name is Andy He']

export const experience: Experience[] = [
  {
    company: 'Scriber by Notum',
    summary: 'Creating and designing a tool to help students transcribe and translate lectures, and take notes.',
    logo: { src: scriberPng, width: 1024, height: 1024, alt: 'Scriber logo' },
    // Two overlapping speech bubbles on white; both belong to the mark.
    mark: { shape: 'ink', part: 'full' },
    url: 'https://scriber.ca',
  },
  {
    company: 'TikTok',
    summary: 'Developed large-scale data pipelines and infrastructure for short-form video analytics and prediction model training.',
    logo: { src: tiktokPng, width: 750, height: 749, alt: 'TikTok logo' },
    // The note, without the wordmark set beneath it.
    mark: { shape: 'ink', part: 'icon' },
  },
  {
    company: 'HERE Technologies',
    summary: 'Worked on location data and services, building systems around maps, mobility, and spatial data.',
    logo: { src: herePng, width: 900, height: 900, alt: 'HERE Technologies logo' },
    // The diagonal wordmark and its arrow ARE the mark — never split them.
    mark: { shape: 'ink', part: 'full' },
  },
  {
    company: 'VipShop',
    summary: 'Contributed to e-commerce features and data workflows powering online retail experiences.',
    logo: { src: vipshopPng, width: 512, height: 512, alt: 'VipShop logo' },
    /* A full-bleed app tile: the rounded square is the shape, the V is its tone.
       Trimmed, because a filled square at the same box always out-weighs an open mark beside it:
       at scale 1 this tile covered 20.5% of its box face-on against Scriber's 14.4% and HERE's
       8.1% (build/c2-ink.mjs), and in the row it shouted while the others spoke. 0.88 is the
       usual optical correction for a square in a logo lock-up, and it is the only place any mark
       uses the `scale` knob. */
    mark: { shape: 'tile', scale: 0.88 },
  },
]
