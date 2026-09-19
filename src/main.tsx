import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { STATIC_CAPTURE } from './lib/env'
import { installCaptureGate } from './lib/captureGate'

// Screenshot mode (?hero_t=…): CSS keys off this to render every entrance in its final state.
if (STATIC_CAPTURE) {
  document.documentElement.dataset.capture = 'static'
  installCaptureGate()
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
