import { useState } from 'react'
import { Card } from '../components/Card'
import { Logo3D } from '../components/Logo3D'
import { Reveal } from '../components/Reveal'
import { SectionHead } from '../components/SectionHead'
import { experience, type Experience as Job } from '../content'
import styles from './Experience.module.css'

const pad = (n: number) => String(n).padStart(2, '0')

/** "https://scriber.ca" → "scriber.ca", so a link says where it goes before it is clicked. */
const hostOf = (url: string) => new URL(url).host.replace(/^www\./, '')

/**
 * Starting angles, in turns. Deliberately not 0/¼/½/¾: four marks on even
 * quarters read as one geared mechanism, and two of them hit edge-on together.
 */
const PHASES = [0, 0.29, 0.56, 0.83]

/** Rest rates, all slightly different, so the row keeps drifting out of phase
    instead of re-synchronising every revolution the way equal rates would. */
const REST_SPEEDS = [1, 0.88, 1.09, 0.95]
/** Hovering or focusing a row spins its mark up — an answer to the pointer. */
const ACTIVE_GAIN = 2.4

function Row({ job, index }: { job: Job; index: number }) {
  const [active, setActive] = useState(false)
  const rest = REST_SPEEDS[index % REST_SPEEDS.length]

  return (
    <Reveal
      as="li"
      className={styles.row}
      delay={0.06 * index}
      onPointerEnter={() => setActive(true)}
      onPointerLeave={() => setActive(false)}
      onFocusCapture={() => setActive(true)}
      onBlurCapture={() => setActive(false)}
    >
      <span className={`label ${styles.num}`} aria-hidden="true">
        {pad(index + 1)}
      </span>

      <div className={styles.company}>
        {/* The turning mark is decorative; the heading beside it is the accessible name. */}
        <Logo3D
          className={styles.logo}
          src={job.logo.src}
          shape={job.mark?.shape}
          part={job.mark?.part}
          scale={job.mark?.scale}
          cols={62}
          seed={index + 1}
          phase={PHASES[index % PHASES.length]}
          speed={rest * (active ? ACTIVE_GAIN : 1)}
        />
        <h3 className={styles.name}>{job.company}</h3>
      </div>

      <p className={styles.summary}>{job.summary}</p>

      {job.url ? (
        <a className={`label ${styles.visit}`} href={job.url} target="_blank" rel="noopener noreferrer">
          {hostOf(job.url)}{' '}
          <span className={styles.arrow} aria-hidden="true">
            ↗
          </span>
          <span className="sr-only"> — {job.company} (opens in a new tab)</span>
        </a>
      ) : null}
    </Reveal>
  )
}

export function Experience() {
  const count = pad(experience.length)

  return (
    <Card id="work" labelledBy="work-title">
      <SectionHead index={2} title="Experience" headingId="work-title" meta={`Index 01—${count}`} />

      <Reveal className={styles.title}>
        <p aria-hidden="true">Experience</p>
      </Reveal>

      <div className={`label ${styles.columns}`} aria-hidden="true">
        <span>No.</span>
        <span className={styles.colCompany}>Company</span>
        <span className={styles.colSummary}>Summary</span>
        <span className={styles.colLink}>Link</span>
      </div>

      <ol className={styles.list}>
        {experience.map((job, i) => (
          <Row key={job.company} job={job} index={i} />
        ))}
      </ol>
    </Card>
  )
}
