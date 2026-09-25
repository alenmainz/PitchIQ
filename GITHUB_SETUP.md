# Put this project on GitHub

Unzip the download first. Upload/commit the contents of the `pitchiq` folder, not the ZIP file. Run commands from the folder containing `package.json`.

## Fast route: GitHub CLI

With Git and GitHub CLI installed:

```sh
gh auth login
git init -b main
git add .
git commit -m "Initial PitchIQ V6 handoff"
gh repo create pitchiq --private --source=. --remote=origin --push
```

If Git asks who you are, configure your own name/email and rerun the commit. If `pitchiq` already exists in your account, use a different new repository name.

## Without GitHub CLI

Create an empty private repository at https://github.com/new. Do not initialize it with a README, license, or .gitignore, because this folder already has project files. Then:

```sh
git init -b main
git add .
git commit -m "Initial PitchIQ V6 handoff"
git remote add origin https://github.com/YOUR_USERNAME/pitchiq.git
git push -u origin main
```

Use GitHub's supported sign-in/token or credential-manager flow; a GitHub account password cannot authenticate Git pushes.

## Give your brother access

Open repository Settings → Collaborators (or Collaborators and teams) → Add people and invite his GitHub username. After accepting, he can clone:

```sh
git clone https://github.com/YOUR_USERNAME/pitchiq.git
cd pitchiq
npm install -g pnpm@11.25.0
pnpm install --frozen-lockfile
pnpm db:local
pnpm dev
```

He should read `docs/DEVELOPER_HANDOFF.md` before changing the tracking pipeline. For ongoing work, cloning is preferable to Download ZIP because it supports branches, commits and pulling updates.

The bundled model is about 20 MB and the runtime about 11 MB, individually below GitHub's 100 MiB regular-Git limit. No Git LFS setup is required for this snapshot. Do not commit match videos or local database state.

Official references:
- https://docs.github.com/en/migrations/importing-source-code/using-the-command-line-to-import-source-code/adding-locally-hosted-code-to-github
- https://cli.github.com/manual/gh_repo_create
