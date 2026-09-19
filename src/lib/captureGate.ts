import { STATIC_CAPTURE } from './env'

/**
 * Static capture mode only. The screenshot harness shoots as soon as the hero sets
 * <html data-hero-frame="ready">; this holds that signal back until webfonts and images
 * have decoded, so full-page captures never show half-loaded logos. Inert on a normal visit.
 */
export function installCaptureGate() {
  if (!STATIC_CAPTURE) return
  const root = document.documentElement
  let open = false

  const observer = new MutationObserver(() => {
    if (!open && root.dataset.heroFrame === 'ready') root.dataset.heroFrame = 'pending'
  })
  observer.observe(root, { attributes: true, attributeFilter: ['data-hero-frame'] })

  const settle = async () => {
    await document.fonts.ready
    await Promise.allSettled(Array.from(document.images, (img) => img.decode().catch(() => undefined)))
    open = true
    observer.disconnect()
    requestAnimationFrame(() => requestAnimationFrame(() => (root.dataset.heroFrame = 'ready')))
  }

  // Give React a moment to mount the images this gate then waits on.
  window.setTimeout(settle, 400)
}
