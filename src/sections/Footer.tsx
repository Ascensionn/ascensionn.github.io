import { type Ref } from 'react'
import { Card } from '../components/Card'
import { LocalTime } from '../components/LocalTime'
import { TypeCycle } from '../components/TypeCycle'
import { person } from '../content'
import styles from './Footer.module.css'

const year = new Date().getFullYear()

/* The closing panel sets one word and never changes it: his name, solid, spanning the card.
   TypeCycle wants a stable array — a fresh one per render would restart the cycle every time
   the clock in the meta row ticks — so it is built once, here. */
const WORDMARK = [person.name]

export function Footer({ ref }: { ref?: Ref<HTMLElement> }) {
  return (
    <Card as="footer" ref={ref} className={styles.footer}>
      {/* The rotating "I am a …" that used to live here has moved into About, where it is part
          of a sentence. What stays is the panel's original job — the wordmark — and the type
          audition it wears, which is now the same component About's statement uses. No scheme
          flipping: the card is ink on card in both themes, in every frame.

          size="fixed" is the one thing it does differently from the statement. The face changes
          continuously; the SIZE does not, because a wordmark that spans the card is the whole
          closing gesture and a specimen ladder kept taking it down to half the measure, where it
          read as a leftover rather than as a sign-off. */}
      <TypeCycle words={WORDMARK} stack size="fixed" className={styles.wordmark} />

      <div className={`label ${styles.bar}`}>
        <p className={styles.copyright}>
          © {year} {person.name}
        </p>

        <nav className={styles.social} aria-label="Elsewhere">
          <a className="chip" href={person.github} target="_blank" rel="noopener noreferrer">
            GitHub<span className="sr-only"> (opens in a new tab)</span>
          </a>
          <a className="chip" href={person.linkedin} target="_blank" rel="noopener noreferrer">
            LinkedIn<span className="sr-only"> (opens in a new tab)</span>
          </a>
        </nav>

        <p className={styles.email}>
          <a className="chip" href={`mailto:${person.email}`}>
            Email
          </a>
        </p>

        <p className={styles.clock}>
          <LocalTime />
        </p>

        <a className={`chip ${styles.top}`} href="#top">
          Back to top <span aria-hidden="true">↑</span>
        </a>
      </div>
    </Card>
  )
}
