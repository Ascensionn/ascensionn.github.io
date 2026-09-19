import { useCallback, useRef, type ReactNode, type Ref } from 'react'
import { useInViewOnce } from '../hooks/useInView'
import { useStillMode } from '../lib/env'
import styles from './Card.module.css'

type Props = {
  id?: string
  as?: 'section' | 'footer'
  className?: string
  labelledBy?: string
  /** Optional outward ref to the landmark, for callers that need to observe the card. */
  ref?: Ref<HTMLElement>
  children: ReactNode
}

/**
 * One off-white rounded card on the charcoal page. The first time it scrolls into view the
 * plate grows to full size, which reads as the card settling onto the stack.
 *
 * The transform lives on the inner plate, never on the outer landmark: a transformed element
 * becomes the containing block for any position:fixed descendant, which would quietly break
 * anything fixed that is added inside a card later.
 */
export function Card({ id, as: Tag = 'section', className, labelledBy, ref: outerRef, children }: Props) {
  const ref = useRef<HTMLElement>(null)
  const still = useStillMode()
  const settled = useInViewOnce(ref, { skip: still, rootMargin: '0px 0px -8% 0px' })

  // Keep our own ref for the observer while still handing the node to the caller.
  const setRef = useCallback(
    (node: HTMLElement | null) => {
      ref.current = node
      if (typeof outerRef === 'function') outerRef(node)
      else if (outerRef) outerRef.current = node
    },
    [outerRef],
  )

  return (
    <Tag ref={setRef} id={id} aria-labelledby={labelledBy} tabIndex={id ? -1 : undefined} className={styles.card}>
      <div className={[styles.plate, className].filter(Boolean).join(' ')} data-settled={settled || undefined}>
        {children}
      </div>
    </Tag>
  )
}
