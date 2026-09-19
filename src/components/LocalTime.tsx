import { useLocalTime } from '../hooks/useLocalTime'

type Props = { className?: string; prefix?: string }

/**
 * Ambient clock showing the *viewer's* local time, e.g. "Local 15:04 EDT" — labelled so it is
 * never mistaken for where Andy is (that is "Based in New York City", stated separately).
 * Pass prefix="" where the surrounding text already says whose clock this is.
 */
export function LocalTime({ className, prefix = 'Local' }: Props) {
  const time = useLocalTime()
  return (
    <span className={className}>
      {prefix ? `${prefix} ` : ''}
      <time>{time}</time>
    </span>
  )
}
