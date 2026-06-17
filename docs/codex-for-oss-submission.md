# Codex for OSS Submission Pack

Use this after the first public `chezzof/ultraisolator` release is published from the green default branch.

## Repository URL

https://github.com/chezzof/ultraisolator

## Project Justification

Esports Isolator PRO is a Windows-only open-source tool for competitive gaming frame-time stability. It applies reversible CPU/process/power tuning, protects anti-cheat/system processes, restores state after crashes, and ships with tests, release gates, screenshots, benchmarks, checksum manifests, and safety-focused docs. Codex helped harden the repo for public OSS maintenance.

## API Credits Interest

I would use API credits to add safe local analysis workflows: explain logs, summarize benchmark sessions, suggest config changes, and help contributors triage Windows/game compatibility reports without sending secrets or configs by default.

## Evidence Trail

- Green GitHub Actions for Python and desktop UI checks.
- `scripts/release-check.ps1` covering tests, dry-run, npm audit, renderer build, smoke test, package build, checksums, and public-surface checks.
- CS2 VProf benchmark in `benchmark-results-hud.html` with structured summary in `docs/benchmarks/cs2-vprof-summary.json`.
- Screenshots under `docs/screenshots`.
- Release notes template and checksum manifest workflow for the first public release.
- Safety docs: `SECURITY.md`, `BUILDING.md`, `docs/release-readiness.md`, and `docs/oss-launch-checklist.md`.

## Outreach Boundary

Ask for testing, benchmark reproduction, compatibility reports, and focused issues. Do not buy stars, trade stars, use bots, or coordinate fake engagement.
