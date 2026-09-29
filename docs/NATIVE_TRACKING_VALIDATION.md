# Native tracking preview — validation, September 28, 2026

Implementation is on `feature/norfair-segment-tracking`. No hosted deployment and
no analytics changes are part of this release.

## Checks

- Python: 13 regression tests for Norfair continuity, ambiguous crossings,
  unlabeled detections, substitutions, ball candidates/recovery, scene changes,
  coordinate clipping, distinctive re-entry and rejection of same-kit re-entry.
- Web: 29 regression tests, including setup/result round trips, stale-result
  rejection, wrong video/identity/interval rejection, idempotent import, partial
  results and preservation of manual labels.
- TypeScript typecheck and portable production build.
- Clean-clone local D1 migration (no private Sites config required).
- Actual video decode → native YOLOX → Norfair/ball processing → JSON → TypeScript
  importer/schema round trip: 705 stored observations and 3 review events.

## Smoke run, not an accuracy benchmark

Input: first 5 seconds of the user-provided 720p **already annotated** Tryolabs
recording. Twenty detector boxes were assigned diagnostic IDs to exercise the
pipeline; these were not verified real roster identities/teams. The ball seed was
placed on the visible ball. Some seed boxes include sideline people.

On this Linux CPU environment with four ONNX threads, default tiled mode and no
preview encoding, the final run took **13.203 seconds for 5 seconds of footage**.
The output contained 341 observed boxes (including ball appearance matches) and
364 explicitly predicted boxes. These counts are not precision/recall or proof
of correct identity. A diagnostic output frame was visually inspected.

No direct speedup factor versus the browser is claimed: hardware, footage and
configuration differ. No accuracy comparison to Tryolabs or the previous tracker
has been completed. No browser click-through QA has been completed.

## Next acceptance test

Use the same **unannotated** user clip in both trackers, with the same starting
labels and segment boundaries. Manually score player ID switches, missing visible
players, ball availability, corrections required, and elapsed processing time.
Include a crossing, pan, brief occlusion and goalkeeper return. Tune or replace
the detector based on these failures before adding analytics or expanding to
full-match storage/background jobs.
