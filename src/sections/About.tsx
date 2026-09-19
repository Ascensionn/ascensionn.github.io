import { Card } from '../components/Card'
import { LocalTime } from '../components/LocalTime'
import { Reveal } from '../components/Reveal'
import { SectionHead } from '../components/SectionHead'
import { TypeCycle } from '../components/TypeCycle'
import { belowFold } from '../components/imageLoading'
import { education, person, restingRole, roles, statement } from '../content'
import styles from './About.module.css'

/* ------------------------------------------------------------------ the statement's layout
 *
 *  ===> ONE WORD TO EDIT, if the other version reads better to you. <===
 *
 * Both were built and shot side by side (shots-about/a-about-*.png against b-about-*.png):
 *
 *  'inline'     Hello! I am a / SOFTWARE ENGINEER, / passionate about Big Data.
 *               One sentence broken over three lines, the two quiet halves set at the same size
 *               above and below the word. This is the one that shipped: the comma rides with the
 *               word, so the sentence stays a sentence while the word changes underneath it, and
 *               the quiet lines bracket the big one instead of hanging off it.
 *
 *  'supporting' Hello! I am a / SOFTWARE ENGINEER
 *                                                  passionate about Big Data.
 *               The greeting and the word are the statement; his Big Data line drops away as a
 *               smaller, quieter note with air above it. It reads well at 1440, where there is
 *               room for the gap to mean something. It falls apart on a phone: both quiet lines
 *               are already on their 14px floor there, so the note ends up the SAME SIZE as the
 *               greeting and the only thing distinguishing it is a gap, which just reads as a
 *               hole in the card. And with no comma the word is left with nothing closing it.
 */
const STATEMENT_LAYOUT: 'inline' | 'supporting' = 'inline'

export function About() {
  const facts = [
    { term: 'Name', detail: person.name },
    /* His degrees, in place of the "Role" row that used to sit here. Two rows, because the
       completed pair share a school and read as one block while the one he is still reading
       wants its own label. Every word of it comes from content.ts — no dates, no GPA, no
       honours, because he gave none. */
    ...education.map((study) => ({
      term: study.term,
      detail: (
        <>
          {study.degrees.map((degree) => (
            <span key={degree} className={styles.degree}>
              {degree}
            </span>
          ))}
          <span className={styles.school}>
            {study.school}
            {/* A fact he gave, not an inference — and the only thing marking the row as unfinished. */}
            {study.inProgress ? ' (in progress)' : null}
          </span>
        </>
      ),
    })),
    { term: 'Based in', detail: person.location },
    { term: 'Your local time', detail: <LocalTime prefix="" /> },
  ]

  return (
    <Card id="about" labelledBy="about-title">
      <SectionHead index={1} title="About" headingId="about-title" meta="Profile" />

      {/* The rotating word used to be the closing panel's whole idea; it lives here now, in the
          sentence it belongs to. The panel keeps the type-cycling and sets his name instead. */}
      <TypeCycle
        words={roles}
        resting={restingRole}
        lead={statement.lead}
        className={[styles.statement, STATEMENT_LAYOUT === 'supporting' ? styles.supporting : null].filter(Boolean).join(' ')}
      />

      <div className={styles.body}>
        <Reveal as="figure" className={styles.portrait}>
          <div className={styles.frame}>
            <img
              src={person.portrait.src}
              width={person.portrait.width}
              height={person.portrait.height}
              alt={person.portrait.alt}
              loading={belowFold}
              decoding="async"
            />
          </div>
          {/* Plate caption, in the manner of a printed figure. */}
          <figcaption className={`label ${styles.plate}`}>
            <span>Fig. 1</span>
            <span>{person.name}</span>
          </figcaption>
        </Reveal>

        <dl className={styles.facts}>
          {facts.map((fact, i) => (
            <Reveal key={fact.term} className={styles.fact} delay={0.08 * i}>
              <dt className={`label ${styles.term}`}>{fact.term}</dt>
              <dd className={styles.detail}>{fact.detail}</dd>
            </Reveal>
          ))}
        </dl>
      </div>
    </Card>
  )
}
