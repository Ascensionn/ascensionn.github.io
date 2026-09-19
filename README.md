# ascensionn.github.io

Personal site for Andy He. Vite + React + TypeScript, deployed to GitHub Pages.

## Run locally

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production build into dist/
npm run preview  # serve the production build
npm run lint
```

## Where things live

| What | Where |
|---|---|
| All copy, links, experience entries, the rotating words, education | `src/content.ts` |
| Hero ASCII animation (phrases, timing, glyph sets, physics) | `src/ascii/engine.ts` — tunables are in the CONFIG block at the top |
| Spinning ASCII company logos | `src/ascii/logo3d.ts` + `src/components/Logo3D.tsx` |
| Page sections | `src/sections/` |
| Design tokens (colours, spacing, fonts, dark theme) | `src/index.css` |

## Deployment

Pushing to `main` runs `.github/workflows/deploy.yml`, which builds the site and publishes it
to GitHub Pages. The repository must have **Settings → Pages → Source: GitHub Actions**.

## Debug hooks

- `?hero_t=<seconds>` freezes the hero animation at a given moment (used for screenshots)
- `?theme=dark` forces the dark theme
