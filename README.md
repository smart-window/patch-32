# PATCH//32

A 75-second tactical survival game built for the 2026 VibeBlitz Game Jam. The entire game takes place on a literal 32×32 neighborhood: corruption spreads from the perimeter while the player deploys limited-energy patches to keep the signal online.

## Play

https://smart-window.github.io/patch-32/

## Controls

- Mouse: click a grid cell to patch it.
- Touch: tap a grid cell, or drag to aim and release to patch.
- Keyboard: WASD or arrow keys to move; Space to patch.
- Survive until the timer reaches zero while keeping network integrity above 48%.

## Game Designer Mind collaboration

The PATCH32 Game Designer Mind identified a positive-energy dominant strategy, leading to an isolated economy change: starting charge 72 → 52, regeneration 4.8/s → 3.0/s, and refund cap 24 → 10. A later validation round led to the separate 48% loss-threshold test. Its first-action recommendations also informed the empty-first-patch safeguard, off-center keyboard cursor, drag-to-aim touch input, and live patch-footprint preview.

Evidence boundary: the reported archetype results were policy simulations rather than fresh human playtests. The Mind-reported 2,000-seed simulator attachment was not delivered, so those results were not independently reproduced from its claimed artifact.

## Local development

```bash
npm install
npm run dev
```

Run `npm test` to create and verify the standalone production build.

## Technology

- React
- TypeScript
- HTML5 Canvas
- Vite
- GitHub Pages

The game uses no third-party character art, music, or gameplay assets. Sound effects are synthesized in the browser.
