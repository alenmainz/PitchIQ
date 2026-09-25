# PitchIQ — V6 developer handoff

Soccer video labeling and experimental tracking, exported from the live V6 source on September 25, 2026.
Source commit: `9889e0eea55871c2e9123231fa74d4039901fb60`.

**Start here:** [developer handoff](docs/DEVELOPER_HANDOFF.md) and [GitHub setup](GITHUB_SETUP.md).

## Run locally

Install Node.js 22.13 or later (Node 22 LTS is the baseline), Git, and the project's pinned pnpm:

```sh
npm install -g pnpm@11.25.0
pnpm install --frozen-lockfile
pnpm db:local
pnpm dev
```

Open http://localhost:5173. Click Sign in with ChatGPT if prompted. The existing portable-development plugin provides a **local test user**, not your real hosted account. It only works on localhost/loopback; keep this development server local. Do not use `pnpm install:ci` for normal laptop setup: that script expects the original managed environment.

The local database and video bucket are emulated by Cloudflare tooling and stored beneath `.wrangler/`. No Cloudflare credentials or AI API key are required for local development. Uploaded footage and saved matches from the hosted site are NOT in this export; upload a short MP4 locally to test. The demo analytics are seeded, not calculated from footage.

```sh
pnpm test
pnpm typecheck
pnpm build
```

Production hosting is a separate task: this is a full-stack Worker application, not a static GitHub Pages site. See the handoff before deploying elsewhere.

## What's included

- React/TypeScript UI, backend routes, schema and database migration.
- V6 player/ball trackers, appearance memory and timestamped field references.
- YOLOX-Tiny model and ONNX Web runtime binaries, with their licenses.
- Lockfile, 24 regression tests, a numeric detection fixture and benchmark script.
- Earlier roadmap and release history, including explicit prototype limitations.

The export adds local setup commands and documentation and removes the live Sites project identifier. It excludes Git history/remotes, installed dependencies, build outputs, runtime state, credentials and user-uploaded videos. The live site was not changed. The source can be placed into a new repository as an initial commit.

## License

No new license is granted for the original project code by this export; the owner should decide licensing before wider redistribution. Preserve the bundled third-party notices (`public/models`, `public/ort`, `build`, and `vendor`). npm dependencies retain their own licenses.
