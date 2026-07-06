# OSS Launch Checklist

Use this checklist before submitting Esports Isolator PRO to Codex for OSS or sharing it publicly.

## Repository

- Use the detailed GitHub metadata and link checklist in [`docs/github-presentation-checklist.md`](github-presentation-checklist.md).
- Confirm the repository owner is `chezzof` and the canonical URL is `https://github.com/chezzof/ultraisolator`.
- Confirm the GitHub description is: `Windows process isolation and frame-time stability tool for competitive games.`
- Confirm topics are: `windows`, `gaming`, `performance`, `electron`, `react`, `python`, `process-management`, `cpu-sets`, `low-latency`, `frame-time`, `open-source`, `esports`, `windows-optimization`, `desktop-app`, `benchmarking`.
- Pin the benchmark report and screenshots in the README.
- Confirm the Actions badge is green on the default branch.
- Confirm the release badge does not claim a public release before one exists.
- Confirm `config.json`, logs, and recovery files are ignored.
- Remaining manual GitHub Settings item: upload `docs/social-preview.png` in GitHub: Settings -> General -> Social preview -> Edit -> Upload image.

## Release Story

- Use source plus reproducible local build as the public release model.
- No public release exists until one is explicitly published from a green default branch.
- Treat `ui/package.json` as the source for the app version used by local package artifacts.
- Publish the first security-hardening public release only after the release gate is green on `chezzof/ultraisolator`.
- Do not claim a signed installer unless code signing is actually configured.
- Checksums detect corruption; they do not authenticate publisher provenance without signed checksums or attestations.
- Mention that packaged builds require a trusted absolute Python interpreter path.
- Include Administrator and anti-cheat cautions in release notes.

## Demo Assets

- Capture a short dashboard demo showing: start, game-mode/readiness state, topology view, logs, and settings.
- Capture one before/after benchmark clip or screenshot set.
- Keep screenshots current with the rendered UI.
- Refresh README screenshots after Dashboard, Settings, or Topology UI changes.
- Confirm visual regression and accessibility checks pass before using screenshots publicly.
- Avoid fake metrics or unverified performance claims.

## Community Outreach

- Share the project with the benchmark evidence, safety model, and contribution path.
- Ask for Windows/game compatibility feedback, not stars.
- Invite focused issues: game detection, topology quality, package build, UI clarity, and benchmark reproduction.
- Do not buy stars, trade stars, use bots, or coordinate fake engagement.

## Codex for OSS Narrative

- Problem: background Windows scheduling noise can hurt frame-time stability in competitive games.
- Solution: reversible local process isolation with protected anti-cheat/system boundaries.
- Evidence: CS2 VProf benchmark, unit tests, renderer build checks, smoke test, visual/accessibility gate, release gate, and screenshots.
- OSS value: transparent Windows API implementation, reproducible build docs, issue templates, and safety-focused contribution policy.
