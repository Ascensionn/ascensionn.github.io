import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Card } from '../components/Card'
import { Reveal } from '../components/Reveal'
import { SectionHead } from '../components/SectionHead'
import { Statement } from '../components/Statement'
import { person } from '../content'
import styles from './Contact.module.css'

const githubHandle = new URL(person.github).pathname.replace(/\//g, '')

/**
 * A quiet caption-sized affordance beside the address — copying a long e-mail is the one real
 * interaction this section wants. Set in the mono label size so it reads as a caption, not a button.
 * The mailto link remains the fallback wherever the clipboard is unavailable.
 */
function CopyEmail() {
  const [copied, setCopied] = useState(false)
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearTimeout(timer.current), [])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(person.email)
      setCopied(true)
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => setCopied(false), 2400)
    } catch {
      /* clipboard blocked or unavailable: the mailto address above still works */
    }
  }

  return (
    <button type="button" className={`label ${styles.copy}`} onClick={copy}>
      <span aria-hidden="true" className={styles.copyMark}>
        {copied ? '[✓]' : '[+]'}
      </span>{' '}
      <span className={styles.copyText}>{copied ? 'Copied' : 'Copy address'}</span>
      <span className="sr-only" role="status">
        {copied ? `${person.email} copied to clipboard` : ''}
      </span>
    </button>
  )
}

/** Arrow that leans out of the page, for links that open somewhere else. */
function Out({ what }: { what: string }) {
  return (
    <>
      {' '}
      <span className={styles.arrow} aria-hidden="true">
        ↗
      </span>
      <span className="sr-only"> — {what} (opens in a new tab)</span>
    </>
  )
}

type Channel = { term: string; detail: ReactNode; aside?: ReactNode }

export function Contact() {
  const [user, domain] = person.email.split('@')

  const channels: Channel[] = [
    {
      term: 'Email',
      detail: (
        <a className={styles.link} href={`mailto:${person.email}`}>
          {user}
          <wbr />
          <span className={styles.nowrap}>@{domain}</span>
        </a>
      ),
      aside: <CopyEmail />,
    },
    {
      term: 'Phone',
      detail: (
        <a className={styles.link} href={person.phoneHref}>
          <span className={styles.nowrap}>{person.phone}</span>
        </a>
      ),
    },
    {
      term: 'GitHub',
      detail: (
        <a className={styles.link} href={person.github} target="_blank" rel="noopener noreferrer">
          @{githubHandle}
          <Out what="GitHub" />
        </a>
      ),
    },
    {
      term: 'LinkedIn',
      detail: (
        <a className={styles.link} href={person.linkedin} target="_blank" rel="noopener noreferrer">
          {person.name}
          <Out what="LinkedIn" />
        </a>
      ),
    },
    { term: 'Based in', detail: <span className={styles.plain}>{person.location}</span> },
  ]

  return (
    <Card id="contact" labelledBy="contact-title">
      <SectionHead index={3} title="Contact" headingId="contact-title" meta="Get in touch" />

      {/* The invitation is the statement here; the addresses below are a plain index of ways in. */}
      <Statement as="p" text={'Say hello. I’d love to hear from you.'} className={styles.lead} />

      <dl className={styles.channels}>
        {channels.map((channel, i) => (
          <Reveal key={channel.term} className={styles.channel} delay={0.05 * i}>
            <dt className={`label ${styles.term}`}>{channel.term}</dt>
            <dd className={styles.value}>
              {channel.detail}
              {channel.aside}
            </dd>
          </Reveal>
        ))}
      </dl>
    </Card>
  )
}
