# GitHub Presentation Checklist

Use this checklist before sharing `chezzof/ultraisolator` publicly. Some
items are repository Settings changes and cannot be represented by committed
files alone.

## Current Metadata Audit

Checked with `gh repo view chezzof/ultraisolator` on 2026-07-06:

- Current description: `Windows process isolation and frame-time stability tool for competitive games.`
- Current topics:
  - `windows`
  - `gaming`
  - `performance`
  - `electron`
  - `react`
  - `python`
  - `process-management`
  - `cpu-sets`
  - `low-latency`
  - `frame-time`
  - `open-source`
  - `esports`
  - `windows-optimization`
  - `desktop-app`
  - `benchmarking`

## Owner-Side Settings

The repository description and topics already match the target public
presentation metadata. Keep these commands for recovery or future repo
migration checks:

```powershell
gh repo edit chezzof/ultraisolator `
  --description "Windows process isolation and frame-time stability tool for competitive games."

gh repo edit chezzof/ultraisolator `
  --add-topic windows `
  --add-topic gaming `
  --add-topic performance `
  --add-topic electron `
  --add-topic react `
  --add-topic python `
  --add-topic process-management `
  --add-topic cpu-sets `
  --add-topic low-latency `
  --add-topic frame-time `
  --add-topic open-source `
  --add-topic esports `
  --add-topic windows-optimization `
  --add-topic desktop-app `
  --add-topic benchmarking
```

If `gh repo edit` is unavailable, set the same description and topics through:

`Settings -> General -> Repository details`.

Do not buy stars, trade stars, use bots, or coordinate fake engagement.

Remaining manual owner-side item before broad sharing: upload the social
preview image in GitHub Settings.

## Social Preview

- Source: `docs/social-preview.svg`
- Upload image: `docs/social-preview.png`
- Verified PNG dimensions: `1280x640`
- Manual upload path: `Settings -> General -> Social preview -> Edit -> Upload image`

GitHub does not automatically use `docs/social-preview.png`; the owner must
upload it once in Settings.

## README Presentation Checks

- Hero banner: `docs/banner.svg`
- Actions badge: `https://github.com/chezzof/ultraisolator/actions/workflows/tests.yml`
- Release badge: `https://img.shields.io/github/v/release/chezzof/ultraisolator?sort=semver`
- Releases link: `https://github.com/chezzof/ultraisolator/releases`
- License link: `LICENSE`
- Benchmark report: `benchmark-results-hud.html`
- Security audit: `docs/security-hardening-audit.md`
- Codex for OSS: `docs/codex-for-oss-submission.md`
- Screenshots:
  - `docs/screenshots/dashboard.png`
  - `docs/screenshots/settings.png`
  - `docs/screenshots/topology.png`

Before the first public release, the badge must not claim a published release.
After release publication, it should resolve to the latest semver GitHub
Release.

## Security And Issue Intake

- Private vulnerability intake: `https://github.com/chezzof/ultraisolator/security/advisories/new`
- Public security issues should remain disabled by template guidance.
- Bug reports should ask for Windows version, Python version, game,
  Administrator status, and background-jailing status.
- Benchmark reports should ask for CPU, GPU, RAM, Windows build, game,
  map/workload, graphics settings, and Isolator config.
- Compatibility reports should capture game/anti-cheat, Administrator status,
  background jailing, and the exact blocked or skipped operation.

## Release Claims

- Current model: source plus reproducible local Windows build.
- Public releases are represented only by explicit GitHub Releases.
- Do not claim signed artifacts unless code signing is configured.
- Checksums detect corruption but do not authenticate publisher provenance
  without signed checksums or attestations.
