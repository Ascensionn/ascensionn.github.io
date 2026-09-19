import { useCallback, useLayoutEffect, useRef, useState } from 'react'
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
 * Re-applies the URL fragment once the sections exist.
 *
 * The browser runs its own fragment scroll while #root is still empty, so a cold visit to
 * `/#work` — a link copied out of the address bar, a bookmark, one pasted into a message —
 * found nothing to scroll to and landed on the hero at scrollY 0, with the intro starting
 * from the beginning. Nothing re-runs that pass once React inserts the sections, so this does.
 *
 * A layout effect, so it lands before the first paint rather than as a visible jump. It only
 * ever acts on a page that is still at the very top: Chrome restores the previous offset
 * itself on a reload, and that restoration must win. `instant`, not `auto`, because this is
 * the position the page opens at rather than a movement — `auto` defers to html's own
 * `scroll-behavior: smooth` and animated the whole way down from the hero.
 */
function useFragmentOnLoad() {
  useLayoutEffect(() => {
    const hash = window.location.hash
    if (hash.length < 2 || window.scrollY !== 0) return
    let target: Element | null = null
    try {
      target = document.querySelector(hash)
    } catch {
      /* a fragment that is not a valid selector is simply not ours to honour */
    }
    target?.scrollIntoView({ behavior: 'instant', block: 'start' })
  }, [])
}

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

  useFragmentOnLoad()

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
