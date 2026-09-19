import { Card } from '../components/Card'
import { LocalTime } from '../components/LocalTime'
import { Reveal } from '../components/Reveal'
import { SectionHead } from '../components/SectionHead'
import { TypeCycle } from '../components/TypeCycle'
import { belowFold } from '../components/imageLoading'
import { education, person, restingRole, roles, statement } from '../content'
import styles from './About.module.css'

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
          sentence it belongs to. The panel keeps the type-cycling and sets his name instead.
          Two lines, not three: the greeting and the word. The Big Data half of his tagline is
          printed whole by the hero and the phone menu, and the owner asked for this block to
          stop at the word. */}
      <TypeCycle words={roles} resting={restingRole} lead={statement.lead} className={styles.statement} />

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
