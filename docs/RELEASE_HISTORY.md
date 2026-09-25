# PitchIQ

A web-first coaching MVP. Version 2 adds a real match-specific labeling and experimental tracking workspace at `/tracking/[videoId]`; see `docs/TRACKING_V2.md`. Routes: `/` match analysis, `/dashboard`, `/players`, `/season`, `/clips`, `/settings`, `/about`.

## Setup
Node 22.13+, pnpm. Install with `pnpm install --frozen-lockfile`; start `pnpm dev`; build `pnpm build`. Managed environments use the supervised Sites preview. `pnpm db:generate` creates migrations after schema changes. Bindings: D1 `DB`, R2 `BUCKET`; hosting provisions resources and applies migrations. API writes require platform sign-in; there is no local authentication bypass.

## Structure
- `app/workspace.tsx`: responsive React/TypeScript coaching UI and Shadcn controls.
- `app/api/workspace`: owner-scoped notes, reviews, clip bookmarks, identity corrections and team name.
- `app/api/videos`: private MP4 excerpt uploads, byte-range playback, deletion and mock status.
- `app/api/assistant`: deterministic retrieval of seeded evidence, not an LLM.
- `lib/demo.ts`: explicit demo analytics; `lib/analytics-contract.ts`: production artifact interfaces.
- `services/video/pipeline.py`: unconnected stage interfaces for a future queue-backed GPU service.
- `db/schema.ts`, `drizzle/`: active D1 persistence.
- `prisma/schema.prisma`: PostgreSQL target contract, not the active database.

## Implemented / limits
The app provides interactive simulated player positions and timeline, seeded season/player analysis, event filtering, durable notes/reviews/bookmarks and identity corrections, private video uploads up to 100 MB, manual playback, match-specific player/ball boxes, roster and substitution intervals, five-second experimental template-tracking passes, frame-specific reference corners, fixture assistant, print/save-as-PDF and private deletion. Platform ChatGPT sign-in replaces app-owned email/password for this deployment. Vinext provides a Next.js-compatible App Router on Workers.

All metrics and findings are seeded and are never derived from uploaded footage. Frame-specific field reference points do not calculate a real homography. New uploads open directly in their own workspace without simulated processing. Uploaded footage can display manual and experimental tracking observations. Short passes use browser-side appearance matching and require manual review; they are not a learned detection pipeline. Clip ranges are bookmarks, not encoded exports. The workspace is single-owner, not collaborative. Production CV, live LLM, full-game resumable uploads, team memberships, audit completeness, retention scheduling, email/password, invitations, sharing and billing remain future integrations. See `docs/ROADMAP.md`.

## V3: automatic box proposals (experimental)

Upload a short video, open Label & track, pause on a clear frame, and choose **Find players & ball**. Click a yellow candidate, select its roster identity, and assign the box. Discard referees/false positives; draw missing boxes manually. Choose **Track next 5 seconds** to run repeated detections and conservative positional association, then review and save. Substitutions restrict tracking to the active roster.

Detection uses official YOLOX-Tiny COCO weights in ONNX Runtime Web/WASM, executed on the user's device. The first scan downloads approximately 30 MB of model/runtime assets. Detailed mode scans overlapping areas; input snapshots are capped at 1920 pixels on the longest edge. Detection and tracking can take longer than the video duration. Cancel takes effect between inference calls.

This is a generic person/sports-ball detector, not a football-trained model. Referees are included, identities and teams require confirmation, and tiny distant players/balls may be missed. Testing the available high overhead sample found no players at the tested confidence threshold: this release does not promise 22-player detection. Tracking samples at 5 Hz for five seconds and stops on ambiguity or missing detections. Automatic re-identification, jersey OCR, and recovery after leaving the frame are not implemented. Camera motion and crossings can still produce wrong associations, so review observations before use. Browser interaction QA was unavailable in the development preview environment.

Validation: `node --test tests/tracking.test.cjs`; production build. Tests cover detector decoding, tiled coordinates, class-specific NMS, preprocessing, ambiguous associations, detector anchors, roster intervals, corrections, and API ownership/revision handling.

### Third-party assets

- YOLOX-Tiny official ONNX release: https://github.com/Megvii-BaseDetection/YOLOX/releases/download/0.1.1rc0/yolox_tiny.onnx — Apache 2.0, license in `public/models/YOLOX-LICENSE.txt`. Unmodified model.
- ONNX Runtime Web 1.22.0 — MIT, license in `public/ort/LICENSE.txt`. WASM distribution files copied unmodified from the pinned package.

## V4: short-gap recovery and appearance-aware matching

The default AI pass now uses persistent tracks, global one-to-one Hungarian matching, high/low-confidence association, a fixed shirt hue/brightness signature, and robust background-patch camera translation/scale estimation. This is a lightweight custom browser tracker, **not** a BoT-SORT or ByteTrack integration. The generic YOLOX-Tiny detector remains unchanged.

Players can reconnect for up to 1.4 seconds after a missed detection (ball: 0.6 seconds). Only the first 0.4 seconds of a player gap receives explicitly marked motion estimates (ball: 0.2 seconds). Estimated boxes are dotted and retain their evidence type when saved/reviewed. Scene cuts stop propagation. Long absences, same-kit crossings, and ambiguous views still require correction. Substitutions and confirmed anchors bound each pass.

A connected-grass filter is recomputed per frame to suppress people away from the visible pitch. This is not precise pitch-line segmentation: officials and staff on grass may remain, and touchline players may be excluded. The filter can be disabled. It falls back to showing people if no sufficiently large grass area is found. The review panel prioritizes unresolved events; individual-frame approval is optional. AI passes support 5 or 15 seconds at 5 Hz. Source video FPS is not changed. Processing remains slower than real time on CPU; no GPU/background service has been added.

Validation on the supplied 1080p professional-game clip used 150 frames spanning video time 2.0–31.8 seconds, and the same 20 manually selected initial person detections for old/new replay. Old matcher: 2 tracks retained at the end, 682 matched observations. V4: 16 retained, 2,617 matched observations, 92 explicitly predicted samples, 73 reconnections, and 4 expired tracks. These are **continuity counts, not identification accuracy**. No frame-by-frame ground-truth identity annotation was available. Visual checks exposed opposing-team switches in the initial implementation; the final hue-and-brightness gate stopped one affected track rather than continuing its wrong identity, and removed another observed cross-team switch at the end frame. Same-team switches and other errors are still possible. Initial high-confidence person proposals reduced from 40 to 33 with the grass filter; it does not force the count to 22. The ball was not included in this player replay.

Benchmark uses the actual bundled ONNX model through WASM and CPU, with bilinear preprocessing rather than browser Canvas. Inference averaged about 4.5 seconds per sampled frame in the test environment. The clip and generated frame images are not included in the public site or repository. Reproduce detections with `node scripts/benchmark-tracking.cjs VIDEO OUTPUT_JSON 30 2` (16:9 source assumed). Browser preview navigation stalled; end-to-end browser interaction testing remains unverified.

## V5: ball search, conservative re-entry, and checkpoints

V5 supersedes the tracking limitations and controls described in earlier release sections. Select **Auto until review**, confirm initial player and ball boxes, and start automatic tracking. Keep the tab open. Player detection runs at 5 Hz; a separate ball search runs at 10 Hz with motion prediction, small bright-component matching, and a magnified 256-pixel neural-detector crop when visual confidence drops. Short predictions are explicitly marked. White boots, lines, tiny balls and occlusions remain difficult; automatic mode pauses when the ball is lost instead of inventing a continuous path.

Missing players can reconnect within 12 seconds using fixed shirt appearance, camera-adjusted position, exit edge, one-to-one assignment and three consecutive supporting observations. These are inferred identities, shown in purple for review. Roster counts relax the appearance gate only when ten teammates are visible and exactly one is missing. The setup helper **Suggest the remaining teammate** likewise requires a unique compatible visual candidate, ten confirmed teammates and opposing-team examples. Counts and similar entry locations alone do not prove identity. There is no jersey-number OCR or learned individual re-identification.

Tracking saves checkpoints every five seconds of processed footage and on normal completion. Save failures stop processing and preserve local observations for an explicit save. The checkpoint control returns playback to the saved position; JSON export preserves observations for analysis. Substitutions restrict active identities, and confirmed future anchors refresh tracking. Scene cuts and unresolved losses pause automatic mode. This is foreground browser processing, still slower than real time. A conservative 3,400-observation cap bounds saved clips; export before clearing experimental passes. Full-match storage, background processing and unattended full-game identity accuracy are not implemented.

Validation: 19 automated tests cover existing detector/API behavior plus ball motion/loss, conservative player recovery, identity conflicts, roster suggestions and checkpoint serialization. A short replay of the supplied professional-game footage showed longer ball continuity with the magnified detector fallback than local bright-component matching alone, but still lost the ball near players and during occlusion. This is not a measured ball-accuracy result or a claim that ball tracking is solved. End-to-end browser interaction remains unverified because the preview stalled.

## V6: partial starting views, persistent player memory, and field landmarks

Start with any visible subset of the roster. A starter's first confirmed box may occur later; scan that frame and assign the existing roster identity or draw a box. Return to the saved checkpoint to process forward through future confirmed anchors. No substitution is needed for a player who was merely outside the camera view. Manual and accepted detector labels save a fixed shirt signature; older V5 matches reconstruct missing signatures from their confirmed historical video frames when a pass starts.

Missing identities no longer expire after 12 seconds or cause a timed player-loss pause. Appearance memory survives checkpoints and reloads; off-screen intervals receive no invented positions. Short absences use appearance/location evidence. Long absences or timeline jumps require a distinctive signature compared with other remembered/visible players and five repeated sightings. This can help with a uniquely dressed keeper. Similar-kit teammates remain remembered without forced assignments. Camera cuts still pause processing, substitutions exclude inactive identities, and inferred recoveries remain reviewable.

Ball recovery searches its predicted position, camera-adjusted last confirmed position, and the feet area of its last nearby tracked player for up to three seconds. Proximity is a search hint, not a possession inference. Compact bright components must pass shape, size and ambiguity checks; both visual and neural recovery require repeated support after a gap. This can still confuse white boots and other small bright objects. A ten-second real-footage replay exercised the local/neural search; it still contained gaps and provides no proof of improved accuracy. Nearby-player context is additionally covered with a controlled synthetic test.

Field setup now accepts individually named corners and two-point boundary-line segments on separate timestamps. Each is remembered at its own frame, with navigation/removal controls. During tracking, image-plane camera transforms can project these references to other processed frames in the same reliable camera segment. Yellow overlays are estimates; green marks are confirmed. Cuts or unreliable camera estimates break propagation. This is not a homography, automatic corner detector, metric pitch calibration, or a way to infer every unseen corner from one boundary. Saved annotations persist, but projection history is bounded to 1,800 processed camera samples; full-match storage remains future work.

Player and candidate name banners are hidden by default until hover, keyboard focus or selection. Thin transparent outlines remain; **Show all name labels** restores the full overlay. Touch users can select a box to reveal its name. Field mode suppresses candidate selection while placing landmarks.

Validation: 24 automated tests cover the earlier pipeline plus late first labels, long goalkeeper absence, same-kit ambiguity, persisted memory, multi-frame field marks, camera-cut boundaries, and visual/neural ball recovery. Type checking passes. Browser interaction remains unverified because the managed preview previously stalled; actual end-to-end tracking quality must still be checked on user footage.
