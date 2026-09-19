import type { HeroIntro } from '../hooks/useHeroIntro'
import type { Theme } from '../hooks/useTheme'
import { IntroButton, ThemeButton } from './HeroControls'
import { LocalTime } from './LocalTime'
import pill from './Pill.module.css'
import styles from './Nav.module.css'

type Props = {
  intro: HeroIntro
  theme: Theme
  onToggleTheme: () => void
  menuOpen: boolean
  onOpenMenu: () => void
}

/**
 * Hero navigation, laid out like aino.agency: five groups spread across a 12-column grid.
 * Below 760px it collapses to the brand and a Menu button; App owns the menu itself.
 *
 * Every item wears the same capsule: the row sits on top of the running ASCII field, so each
 * label needs its own border and opaque fill to read at all against the pattern. The clock
 * takes the outline too but in its static form — no pointer cursor, no inversion — because it
 * is a readout, not something to press.
 */
export function Nav({ intro, theme, onToggleTheme, menuOpen, onOpenMenu }: Props) {
  return (
    <nav className={`label ${styles.nav}`} aria-label="Primary">
      <a className={`${pill.pill} ${styles.brand}`} href="#top">
        Andy He
      </a>

      <ul className={`${styles.group} ${styles.sections}`}>
        <li>
          <a className={pill.pill} href="#work">
            Work
          </a>
        </li>
        <li>
          <a className={pill.pill} href="#about">
            About
          </a>
        </li>
      </ul>

      <div className={`${styles.group} ${styles.controls}`}>
        <IntroButton className={pill.pill} intro={intro} />
        <ThemeButton className={pill.pill} theme={theme} onToggle={onToggleTheme} />
      </div>

      <p className={styles.clock}>
        <LocalTime className={`${pill.pill} ${pill.static}`} />
      </p>

      <a className={`${pill.pill} ${styles.contact}`} href="#contact">
        Contact
      </a>

      <button
        type="button"
        className={`${pill.pill} ${styles.menuButton}`}
        data-menu-trigger
        aria-haspopup="dialog"
        aria-expanded={menuOpen}
        aria-controls="site-menu"
        onClick={onOpenMenu}
      >
        Menu
      </button>
    </nav>
  )
}
