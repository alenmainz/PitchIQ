# Roadmap

## MVP
Private responsive coaching workspace, seeded tactical replay and evidence assistant, MP4 excerpt storage/manual review, durable notes/reviews/bookmarks/corrections, setup wizard and season views.

## Real computer vision
Deploy FastAPI/Python and a separate GPU worker pool. Add resumable multipart full-game uploads, codec inspection, FFmpeg HLS transcoding, durable queue leases, retries/dead letters and idempotent checkpoints. Extract calibration frames, validate corner order, solve homography, measure camera drift and propagate uncertainty. Integrate player/ball detection, multi-object tracking, team clustering, manual IDs, occlusion and substitution handling. Compute running/shape metrics from calibrated trajectories. Benchmark ID switches, detection precision/recall and calibration error against manually labeled games.

## Advanced models
Gate possession, passing, touches and shots on ball visibility/confidence. Store model versions, evidence spans and provenance. An LLM may call tenant-scoped structured-data tools; it must abstain when evidence is unavailable. Store human corrections and version analysis artifacts. Validate recurring patterns across games before generating training suggestions.

## Product completion
Migrate to normalized PostgreSQL/Prisma through an HTTP API. Add an established email/password and OAuth identity provider, verified memberships, roles/invitations, roster/season CRUD, manual event/track editing, encoded clips, permissioned expiring share links, playlists, notifications, audit logging, consent/retention enforcement and deletion cascades. Add localization and accessibility QA. Introduce billing after processing costs are measured.

## Mobile
Publish versioned OpenAPI contracts and shared artifact schemas, then React Native or Swift/Kotlin clients for review, notes and notifications. Video processing stays server-side.

## Security
Storage APIs use platform identity and owner-scoped parameterized queries. R2 objects are private. The dispatcher is the identity trust boundary; never expose a Worker where clients can forge identity headers. No uploaded footage is sent to a model. The owner can delete video bytes and metadata; bookmarks/notes remain. Production requires rate limits, media validation, complete auditing, role authorization tests and policy enforcement.

## Validation
TypeScript check and production build are local gates. Browser interaction and WebMCP validation were unavailable because the preview browser stalled. No claim of full end-to-end authentication or upload verification is made.
