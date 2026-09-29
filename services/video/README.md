# Native segment tracking (Norfair preview)

This is a working local runner and a web import/export integration, **not a hosted
GPU service**. The original browser tracker remains available. Focus: short player
and ball tracking segments; no possession, passes, formations, or coaching analysis.

## First test on a Mac

Use Python **3.11 or 3.12** and run these commands from the repository root:

```sh
python3.11 -m venv .venv
source .venv/bin/activate
python -m pip install -r services/video/requirements.txt
```

If Python 3.12 is installed instead, substitute `python3.12` on the first line.
The bundled ONNX model is used; there are no model downloads or API keys.
Set up/start the web app using the root README (`pnpm db:local`, `pnpm dev`).

1. Upload the **original MP4** to your locally running PitchIQ app.
2. Pause at a clear frame. Assign boxes to the visible players and the ball.
   Unseen players can remain on the roster without boxes.
3. Optional: seek ahead and label a player's first appearance, a substitution,
   or a difficult ball position. Confirmed labels are keyframes the runner obeys.
   Return to the original starting frame afterward.
4. In **Native tracking · Norfair preview**, select 5 or 10 seconds initially and
   click **1. Export native setup**. Save `pitchiq-setup.json` in the repo root,
   or supply its complete path below. Do not edit the roster/labels before import.
5. Run (replace the video path; quotation marks matter for spaces):

```sh
python services/video/track_segment.py \
  --video "/Users/you/Movies/match.mp4" \
  --setup pitchiq-setup.json \
  --output pitchiq-result.json \
  --preview pitchiq-preview.mp4
```

6. Click **2. Import native result** and select `pitchiq-result.json`.
   Play the segment in PitchIQ, inspect crossings/gaps, then click **Save changes**.
   Imported boxes are experimental, not automatically human-confirmed.
7. Correct a bad identity once at the relevant time, export a fresh setup, and
   rerun the segment. Manual and reviewed labels survive import. Start the next
   segment by confirming visible boxes on its starting frame.

The terminal prints processed footage time versus elapsed processing time. The
optional preview is a diagnostic 10fps video with no audio; the app continues to
play the original footage at its original timing. Preview timing is approximate
when extra keyframes fall between 10Hz samples. Omit `--preview` for less disk work.

## What runs

- Native ONNX Runtime runs the existing YOLOX-Tiny model, on full images plus
  overlapping tiles at approximately 5Hz. Frames decode sequentially.
- Norfair 2.3.0 maintains player tracks at 10Hz with Kalman motion prediction and
  camera homography estimation. Shirt appearance and ambiguity gates constrain
  matching. Only explicitly labeled people receive roster identities; extra fans
  and referees are not automatically added to your roster.
- Tracks survive short misses internally. Rendered predictions last at most
  0.3 seconds and are marked `predicted`, never treated as confirmed detections.
- Distinctive expired identities can return after three consistent detections
  with a sufficiently unique color descriptor. Similar-kit teammates remain
  unresolved. This is **not** learned re-ID, jersey OCR, or proof of identity.
- The ball combines focused neural crops, white compact shapes, size/motion
  gates, and repeated evidence after a gap. White boots and graphics can still
  fool it. After a long loss it requests a ball keyframe while players continue.
- Future labels and substitutions apply at their source-video timestamps.
  Possible camera cuts stop the segment instead of carrying identities across.
- All outputs use normalized boxes and original-video seconds. Import checks
  video identity, resolution/duration, setup staleness, intervals, roster validity,
  duplicate observations and the existing save capacity. Importing twice is safe.

`--fast` disables detector tiles. It trades small-player recall for speed; test
the default first. `--threads 4` controls CPU inference threads. An explicit
`--provider` may use another ONNX provider **if installed and available**; the
default requirements install CPU ONNX Runtime. GPU acceleration is not automatic.

## Limits and next gate

- Maximum **20 seconds per exported segment**, because the current web document
  still holds at most 6,000 observations and roughly 900 KB. Multiple segments can
  reach this capacity: export a backup before clearing old experimental passes.
- No background server, queue, cloud deployment, or full-match storage yet.
  `pipeline.py` remains the unconnected future production/analytics contract.
- Video binding uses the app ID, filename, dimensions, duration and exact setup;
  it is not a byte-content hash. `--allow-renamed-video` explicitly bypasses only
  the filename check; make sure you use the same original video.
- The generic ball model has not been trained on your drone footage. This work
  does not include Tryolabs' overfit `ball.pt` weights or Ultralytics dependencies.
- Synthetic regression tests verify safeguards, not match-wide identity accuracy.
  An annotated Tryolabs recording is only a pipeline/speed smoke test, since its
  drawn boxes and trails contaminate detection. Use an unannotated user clip for
  the next acceptance check: missed visible players, ID swaps, ball availability,
  number of corrections, and elapsed seconds per second of footage.

```sh
python -m unittest discover -s services/video -p 'test_*.py'
pnpm test
pnpm typecheck
pnpm build
```

Only after stable short-clip tracking should we choose a better soccer-trained
detector, evaluate GPU deployment, add a job API/chunked storage, and then analytics.

## Attribution

Uses [Norfair](https://github.com/tryolabs/norfair), BSD-3-Clause. Its license is
included beside this document. The architecture was informed by Tryolabs'
[soccer-video-analytics](https://github.com/tryolabs/soccer-video-analytics) demo
(MIT); no demo source, video, team presets, or model weights are copied here.
YOLOX and ONNX Runtime notices remain under `public/models` and `public/ort`.
