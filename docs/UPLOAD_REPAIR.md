# Upload repair — September 29, 2026

## Confirmed cause

V7 sent 4 MiB multipart parts directly to R2. Production logs for
`POST /api/videos?action=complete` showed R2 error 10011: parts below the
minimum allowed size. R2 requires all non-final parts to be at least 5 MiB.
Earlier single-request uploads also encountered a gateway 413 response.

## Repair

- Browser sends 2 MiB chunks. The server stages them as private R2 objects.
- Completion assembles three chunks into each 6 MiB R2 part; only the last
  part may be smaller. It never buffers the whole match.
- Server-owned sessions bind the filename, size, metadata and storage keys
  to the authenticated owner. Every chunk's actual byte count is checked.
- Completion verifies the assembled size, then writes the video record.
  Retrying after a lost response or failed database write is safe.
- Successful completion removes temporary chunks. Selecting a different
  file aborts the previous unfinished upload when possible.
- The client retries transient chunk/completion failures twice, handles
  non-JSON gateway errors, retains its session for retries in the same page,
  and distinguishes transfer progress from final verification.
- Video retrieval now returns 200 for full files, 206 for valid ranges and
  416 for unsatisfiable ranges, including suffix/open-ended seeking.

The existing player/ball tracking algorithms and saved labeling format are
unchanged. The native Norfair runner still requires local Python; this repair
does not turn it into a hosted processing service.

## Verification

```sh
pnpm test
pnpm test:upload
PITCHIQ_TEST_VIDEO=/absolute/path/to/match.mp4 pnpm test:upload
pnpm typecheck
pnpm build
node tests/upload-built.mjs /absolute/path/to/match.mp4
```

Upload tests use actual local Cloudflare R2/D1 emulation, not storage stubs.
They reproduce the former failure, cover 1 byte through 100 MiB, exact byte
round trips, ownership, invalid/missing chunks, retries and database recovery.
The built-bundle smoke test uses local HTTP with an isolated test identity,
checks the actual MP4 hash, byte-range reads, page/assets and tracking API.
No test bypass or fabricated identity is installed in production.

Verified with the supplied 58.86-second, 16,669,916-byte soccer MP4. Browser
visual playback and the live sign-in/upload round trip still need user testing;
local HTTP tests do not prove the hosting gateway or browser UI behaves identically.

## Remaining limits

- Upload cap remains 100 MiB. Tracking is still an experimental short-segment
  workflow, not full-match analytics.
- Closing the tab loses client retry state. Abandoned temporary chunks can
  remain in storage; a scheduled expiry/cleanup job is not implemented.
  Session use expires after 24 hours.
- Refresh previously opened tabs after deployment: the upload protocol changed.
- The legacy direct form endpoint remains for compatibility; the UI uses the
  new chunked path, so large files should not use a single form POST.
