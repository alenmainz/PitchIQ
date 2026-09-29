# September 29 browser tracking update

## Changes

- Upload completion reads the committed object and verifies its byte count. It no longer rejects an owner-scoped completed upload over optional R2 metadata. Existing 2 MiB request chunks, 6 MiB storage parts, retries, ownership and playback ranges remain.
- Initial automatic scan uses a lower person threshold, contained-box suppression and up to six magnified scans of crowded groups. A strongly supported near touchline can filter the technical area; grass-only filtering remains the fallback. Disable the pitch filter if a touchline player is excluded.
- After confirming one outfield example of each kit, users can propose matching teammates into available roster slots. These are inferred identities, not known names/numbers. Keepers, officials, similar kits and overlapping players still need checking.
- The default tracking path starts Norfair automatically in a Web Worker via Pyodide. Existing global assignment, appearance checks and re-entry memory select identities; Norfair filters motion and supplies short-gap predictions. Observed boxes remain exact. Failed initialization falls back to the existing tracker with visible status. Stop and unmount terminate the worker.
- The ball trail shows the preceding two seconds of sufficiently confident observations. Camera transforms keep previous locations aligned with the current image. Gaps, low-confidence predictions and camera cuts break the line. The trail is a review aid, not extra tracking evidence or a future trajectory.
- Python export/import controls removed from the client workspace. The native developer runner remains available in source.

## Verification

- Production Worker bundle was also exercised over local HTTP: 28 upload requests, completion, identical file retrieval, range seeking, anonymous rejection, tracking page/API, and byte-identical serving of every Norfair runtime asset.
- Supplied unlabelled La Liga clip: 58,185,580 bytes, 1920×1080, 30 fps, 303.43 seconds. Local upload/API tests verify exact SHA-256 round trip and playback ranges, plus ownership, retries, missing chunks and database recovery. Synthetic 100 MiB upload also passes.
- Real ONNX inference on the supplied kickoff frame: original 33 pitch candidates at 0.25 threshold; revised scan 25 at that threshold. This is candidate-count evidence, not a recall or identity-accuracy score. Officials and an overlapping pair remain; ball detection on the kickoff frame remains unreliable.
- Actual Pyodide/Norfair runtime tests cover crossing identities, inactive-player removal, correction resets and camera-compensated prediction. These tests exercise the real Python engine, not a mock.
- Tracking regression tests cover ambiguity, substitutions, keeper re-entry, future labels, ball recovery, trail gaps/cuts, kit suggestions and touchline filtering.

## Limits and next work

Processing is still slower than playback on CPU. This change does not promise real-time or full-match tracking. Browser downloads are about 30 MB for detection plus 37 MB for the enhanced runtime on first use. The tab must stay open. Saved tracking uses the existing bounded JSON document and stops before capacity; increase storage through segmented observations before enabling full-match runs.

A soccer-specific player/ball model and a labelled evaluation set are the next substantive accuracy improvements. In this broadcast the ball is only a few pixels across and is sometimes hidden against boots or the halfway line. Do not equate any white dot or an unassigned roster slot with a certain identity. Browser UI and live authenticated upload still require a user-device check; local backend and actual inference tests do not prove every browser or production gateway behaves identically.

## Runtime provenance

Norfair 2.3.0 (BSD-3-Clause), FilterPy 1.4.5 (MIT), Pyodide 0.27.7 (MPL-2.0) and their scientific Python dependencies. Licenses are included in public/norfair and in their wheel packages. The small pure-Python Norfair/FilterPy wheels are checked in. Larger official Pyodide distribution assets download automatically at build/dev time using SHA-256 pins in scripts/norfair-assets.json. Clients fetch bundled same-origin assets only. No paid external inference endpoint is used.
