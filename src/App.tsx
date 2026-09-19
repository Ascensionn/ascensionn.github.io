import { useCallback, useRef, useState } from 'react'
import styles from './App.module.css'
import { FloatingNav } from './components/FloatingNav'
import { MobileMenu } from './components/MobileMenu'
import { useHeroIntro } from './hooks/useHeroIntro'
import { useTheme } from './hooks/useTheme'
import { About } from './sections/About'
import { Contact } from './sections/Contact'
import { Experience } from './sections/Experience'
import { Footer } from './sections/Footer'
import { Hero } from './sections/Hero'

/**
 * The whole site: a stack of rounded cards on the charcoal page.
 *
 * Intro, theme and menu state live here so the hero nav, the floating bar and the phone menu
 * all drive one set of controls. While the menu is open the page wrapper goes `inert`, which
 * takes it out of the accessibility tree rather than merely covering it.
 */
export default function App() {
  const intro = useHeroIntro()
  const { theme, toggle: toggleTheme } = useTheme()
  const [menuOpen, setMenuOpen] = useState(false)
  const heroRef = useRef<HTMLElement>(null)
  const footerRef = useRef<HTMLElement>(null)

  const openMenu = useCallback(() => setMenuOpen(true), [])
  const closeMenu = useCallback(() => setMenuOpen(false), [])

  return (
    <>
      <a className="skip-link label" href="#main">
        Skip to content
      </a>

      <div className={styles.page} inert={menuOpen}>
        <Hero ref={heroRef} intro={intro} theme={theme} onToggleTheme={toggleTheme} menuOpen={menuOpen} onOpenMenu={openMenu} />
        <main id="main" className={styles.main} tabIndex={-1}>
          <About />
          <Experience />
          <Contact />
        </main>
        <Footer ref={footerRef} />

        <FloatingNav heroRef={heroRef} footerRef={footerRef} theme={theme} onToggleTheme={toggleTheme} menuOpen={menuOpen} onOpenMenu={openMenu} />
      </div>

      <MobileMenu open={menuOpen} onClose={closeMenu} intro={intro} theme={theme} onToggleTheme={toggleTheme} />
    </>
  )
}
