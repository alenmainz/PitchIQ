# PitchIQ developer handoff

## What this is

PitchIQ is a Vinext/React/TypeScript soccer-video labeling prototype. The tracking workspace is at `/tracking/[id]`. It uses browser-side ONNX Runtime Web and a bundled YOLOX-Tiny COCO model to propose people and ball boxes, then applies conservative appearance, camera-motion, player-memory, and ball tracking logic.

The exported source is the live V6 source as of September 25, 2026. The hosted app remains at the public URL from the original project, but local development uses a mock localhost user and a local D1/R2 emulator.

## Current V6 behavior

- Initial boxes can cover only the players visible in the starting frame. A roster player can be labeled later when first visible.
- Confirmed player appearance is retained across off-screen intervals. Same-kit or ambiguous returns stay unresolved rather than being silently assigned.
- The ball tracker searches motion, the last confirmed location, and the last nearby player area. Bright boots and occlusion can still cause mistakes.
- Field corners and boundary-line segments can be recorded on different frames and projected while camera motion is reliable. This is image-plane reference tracking, not metric homography or automatic pitch calibration.
- Candidate labels are hidden until hover, focus, or selection to keep crowded frames readable.
- Automatic tracking checkpoints every five seconds and exports JSON. It remains foreground browser processing and has a conservative saved-observation limit.

## Architecture to know first

- `app/tracking/workspace.tsx`: main labeling UI, video loop, persistence, and user controls.
- `lib/player-detector.ts`: ONNX Runtime Web session, tiled/focused detector scans, pitch filtering, and appearance features.
- `lib/persistent-tracker.ts`: one-to-one player association and short predictions.
- `lib/player-recovery.ts`: remembered players, repeated return evidence, roster suggestions, and long-gap safeguards.
- `lib/ball-tracker.ts`: compact bright-component search, motion context, and neural recovery confirmation.
- `lib/field-reference.ts`: named field landmarks and camera-segment projection.
- `lib/tracking.ts`: Zod document schema, points, substitutions, issues, memory, field references, and checkpoints.
- `app/api/videos/route.ts`: MP4 upload/range playback through R2 and video metadata in D1.
- `app/api/tracking/route.ts`: owner-scoped tracking document and optimistic revision saves.
- `drizzle/0000_sudden_beast.sql`: local/hosted `records` table migration.
- `tests/tracking.test.cjs`: 24 regression tests; it transpiles the pure TypeScript modules for Node.

## Local workflow

```sh
pnpm install --frozen-lockfile
pnpm db:local
pnpm dev
```

Open `http://localhost:5173`, use the local sign-in prompt, and upload a short MP4. The local auth adapter is in `build/sites-vite-plugin.ts`; it must not be exposed on a public host. Local D1/R2 state is generated beneath `.wrangler/`, which is ignored.

Before a pull request:

```sh
pnpm typecheck
pnpm test
pnpm build
```

Do not commit `.wrangler/`, `.sites-runtime/`, `node_modules/`, build output, uploaded MP4 files, or credentials. Do not add the hosted `.openai/hosting.json` project ID to a fork; the export intentionally contains only logical `DB` and `BUCKET` bindings.

## Important limitations and next work

The current detector is generic COCO YOLOX-Tiny, not soccer-trained or jersey-number-aware. There is no learned player re-identification model, OCR, tactical analytics pipeline, GPU/background queue, full-match persistence, or unattended full-game accuracy guarantee. Browser CPU inference is slow; WebGPU and server-side/native inference are logical next performance steps.

If changing the document schema, update backward-compatible parsing and add a test. If changing detector thresholds, test both distant players and false positives outside the pitch. If changing recovery, preserve the rule that evidence can pause or remain unresolved; identity errors are worse than missing observations.

The supplied professional-game video, screenshots, and user match data are intentionally excluded from this export. Use your own test footage locally.
