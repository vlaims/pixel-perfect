# Pixel Perfect — repository audit

## Architecture and entry points

- **Framework/build:** React 19, TypeScript, TanStack Start/Router, Vite 8; Tailwind CSS 4 and ESLint/Prettier.
- **Route/UI:** `src/routes/index.tsx` mounts `src/components/Game.tsx`. Settings and HUD state live in `src/game/store.ts`; styles are in `src/styles.css`.
- **Renderer/game loop:** Three.js WebGL renderer and custom animation loop in `src/game/engine.ts`.
- **World/physics:** `src/game/world.ts` builds the procedural terrain/city and collision proxies. Player movement, height-based collision, weapon ray checks, bot decisions and camera are custom code in `engine.ts`; no external physics engine is configured.
- **Character/vehicles:** `src/game/rig.ts` implements procedural animation; `src/game/vehicles.ts` implements local vehicle movement and entry/exit.
- **Audio/effects/assets:** `src/game/audio.ts`, `src/game/bloodfx.ts`, `src/game/post.ts`, plus asset metadata in `src/assets/*.asset.json`. The model and sound URLs used by the game point to Lovable-hosted asset storage, so standalone hosting needs those assets copied to a project-owned public path.
- **Networking:** no multiplayer/network client or authoritative server was found; the current game is local single-player with bots.
- **Tests:** Vitest and Testing Library are configured. `src/test/app-routing.test.tsx` is the pre-existing route test; `src/test/display.test.ts` adds display geometry, validation, DPR and browser-shortcut checks.

## Commands

```sh
npm install
npm run dev
npm run lint
npm run test
npm run build
npm run preview
```

## Audit findings before the display/control update

1. Saved resolutions were clamped to fixed minimum/maximum values rather than preserving arbitrary positive finite dimensions.
2. Canvas, camera, HUD and crosshair sizing did not share a single active game rectangle; forced CSS aspect rules could conflict with settings.
3. The input system needed stricter focus/blur/visibility handling and protection for browser shortcut chords.
4. The requested default bindings needed alignment: Ctrl crouch, C zoom, V look behind, T shoulder swap, aim-gated shooting and aim-gated directional roll.
5. The original settings UI had only a few sections and limited crosshair customization.
6. The scene, vehicle and AI systems are lightweight procedural simulations, not a full GTA/FiveM-scale world. No network multiplayer was present.

## Current implementation direction

- `src/game/display.ts` centralizes fit-mode geometry, dimension/aspect parsing, render-size selection, quality-based pixel ratio and safe key prevention.
- `src/components/Game.tsx` owns settings tabs, active stage sizing, persistence, controls, fullscreen and display diagnostics.
- `src/game/store.ts` owns typed defaults and display-buffer diagnostics.
- `src/game/engine.ts` handles renderer resizing/rollback, camera aspect, player movement and game input.
- `src/styles.css` defines the shared stage, HUD and scoped/unscoped reticle styles.

## Build and verification status

The source edits are committed to the connected GitHub repository. A full `npm run lint`, `npm run test`, and `npm run build` verification has **not yet been confirmed for the latest commit**. A local dependency installation attempt timed out in the separate review environment, so the global TypeScript compiler could only validate the standalone display utility; the full app's framework typings/dependencies were unavailable there. Do not treat the current deployment as fully verified until those commands complete successfully.

## Known limitations and next steps

- Verify the latest commit with lint, tests and production build; repair any errors before treating it as release-ready.
- Browser-test pointer lock, fullscreen transitions, actual drawing-buffer sizes, extreme GPU allocations, resizing, mouse ray alignment and all fit modes.
- Test performance on a real Chromebook; tune draw calls, shadow settings, AI count and render scale from measurements.
- Re-host the GLB/audio assets for any deployment that does not preserve Lovable's asset endpoints.
- Further requested work—such as vehicle damage zones, detailed traffic routing/streaming, extensive key rebinding and more advanced AI—should be separately implemented and tested rather than assumed complete.
