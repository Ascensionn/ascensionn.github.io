import { Fragment, useRef } from 'react'
import { useInViewOnce } from '../hooks/useInView'
import { useStillMode } from '../lib/env'
import styles from './Statement.module.css'

type Props = {
  text: string
  as?: 'h2' | 'p'
  id?: string
  className?: string
}

/**
 * Oversized editorial statement. Words rise out of their own clipping masks, one after another,
 * driven by a single CSS transition per word. Screen readers get the sentence once, as plain text.
 */
export function Statement({ text, as: Tag = 'p', id, className }: Props) {
  const ref = useRef<HTMLElement>(null)
  const still = useStillMode()
  const shown = useInViewOnce(ref, { skip: still, rootMargin: '0px 0px -15% 0px' })
  const words = text.split(' ')

  return (
    <Tag ref={ref as never} id={id} className={[styles.statement, className].filter(Boolean).join(' ')} data-shown={shown || undefined}>
      <span className="sr-only">{text}</span>
      <span aria-hidden="true">
        {words.map((word, i) => (
          <Fragment key={i}>
            <span className={styles.mask}>
              <span className={styles.word} style={{ transitionDelay: `${i * 0.045}s` }}>
                {word}
              </span>
            </span>
            {/* The space lives outside the inline-block mask, where it cannot collapse and lines can still break. */}
            {i < words.length - 1 ? ' ' : null}
          </Fragment>
        ))}
      </span>
    </Tag>
  )
}
