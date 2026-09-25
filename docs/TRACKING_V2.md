# Match labeling and short tracking passes

Open an uploaded video from Overview with **Label & track**. Uploads now go directly into `/tracking/[videoId]`, with their own roster and observations, without simulated processing.

1. Pause on a clear frame. Choose a player and draw a snug rectangle. Click to place a default small rectangle; redraw to correct. Edit the selected name and number. Repeat for other players and optionally the ball.
2. Save changes. Roster, annotations, reference corners, substitutions, and review states are persisted in an owner-scoped D1 record linked to the video.
3. Run **Track next 5 seconds** from a labeled frame. This is browser-side RGB template matching, sampled at 5 Hz and downscaled to at most 960 pixels wide. It is not a trained player detector, jersey recognizer, or robust long-term re-identification system.
4. Review observations. Manual labels and reviewed boxes use solid outlines; unreviewed experimental boxes use dashed outlines and question marks. Confirm visible boxes at a paused frame or redraw a player's box. Redrawing invalidates that player's later experimental observations, retaining other players and manual labels.
5. For substitutions, add a bench player, select the outgoing player at the correct time, and record the incoming player. Active intervals can include re-entry. Label the incoming player on the video. The latest substitution can be undone; now-invalid observations are removed.

## Constraints

- Five-second passes, 6,000 saved points, 100 substitutions, 61 total roster entries including the ball, 100 MB MP4 upload limit.
- The matcher uses a fixed initial patch. It stops on low similarity, non-unique candidates, excessive movement, or overlapping player boxes. These heuristics do not guarantee correct identity. Every experimental point needs review.
- No motion compensation, automatic recovery after leaving view, learned detection, jersey OCR, facial recognition, or inferred ball possession. Short visibility gaps are not interpolated.
- Field corners are saved against an actual frame as setup data. They do not yet create a homography or support distance calculations. A panning camera needs calibration over time.
- Labels at the current moment are shown within 0.125 seconds of their sample time. Playback without observations has no overlay.
- Frame-step FPS is a viewing preference, selected by the coach; source FPS is not automatically probed.
- Saved revisions use compare-and-swap updates. A stale editor receives a conflict and retains local changes. There is no merge interface.
- Authentication uses existing Sites identity. Every tracking GET/POST verifies ownership of its parent video. Removing a video also removes its tracking record.

## Validation

`node --test tests/tracking.test.cjs` exercises movement/disappearance, active roster intervals and re-entry, correction invalidation, missing-frame behavior, schema rejection, owner isolation, saved round trips, and stale revision conflicts against in-memory SQLite. TypeScript is checked with `node node_modules/typescript/bin/tsc --noEmit`.

A smoke test using six manually selected player patches on the supplied 37-second clip produced tracks lasting 0 to 5 seconds before ambiguity or appearance stops; one lasted the entire five-second pass. This is a functional check, not a validated tracking-accuracy benchmark. The interface still needs a coach's hands-on review; browser preview was inaccessible in this build environment.
