import type { ReactNode } from 'react'
import styles from './SectionHead.module.css'

type Props = {
  index: number
  title: string
  /** id of the <h2>, so the surrounding section can be labelled by it. */
  headingId: string
  meta?: ReactNode
}

/**
 * Running head at the top of a card: "(01) About" on the left, optional meta on the right,
 * over a hairline whose fill tracks how far through the section you have read.
 */
export function SectionHead({ index, title, headingId, meta }: Props) {
  return (
    <div className={styles.head}>
      <div className={styles.row}>
        <h2 id={headingId} className={`label ${styles.title}`}>
          <span className={styles.index} aria-hidden="true">
            ({String(index).padStart(2, '0')})
          </span>
          {title}
        </h2>
        {meta ? <p className={`label ${styles.meta}`}>{meta}</p> : null}
      </div>
      <span className={styles.rule} aria-hidden="true">
        <span className={styles.fill} />
      </span>
    </div>
  )
}
