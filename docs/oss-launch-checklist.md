# OSS Launch Checklist

Use this checklist before submitting Esports Isolator PRO to Codex for OSS or sharing it publicly.

## Repository

- Set the GitHub description to: `Windows process isolation and frame-time stability tool for competitive games.`
- Add topics: `windows`, `gaming`, `performance`, `electron`, `react`, `python`, `process-management`, `cpu-sets`, `low-latency`, `frame-time`, `open-source`, `esports`.
- Pin the benchmark report and screenshots in the README.
- Confirm the Actions badge is green on the default branch.
- Confirm `config.json`, logs, and recovery files are ignored.

## Release Story

- Use source plus reproducible local build as the public release model.
- Publish the first security-hardening public release only after the release gate is green on `chezzof/ultraisolator`.
- Do not claim a signed installer unless code signing is actually configured.
- Mention that packaged builds require a trusted absolute Python interpreter path.
- Include Administrator and anti-cheat cautions in release notes.

## Demo Assets

- Capture a short dashboard demo showing: start, game-mode/readiness state, topology view, logs, and settings.
- Capture one before/after benchmark clip or screenshot set.
- Keep screenshots current with the rendered UI.
- Avoid fake metrics or unverified performance claims.

## Community Outreach

- Share the project with the benchmark evidence, safety model, and contribution path.
- Ask for Windows/game compatibility feedback, not stars.
- Invite focused issues: game detection, topology quality, package build, UI clarity, and benchmark reproduction.
- Do not buy stars, trade stars, use bots, or coordinate fake engagement.

## Codex for OSS Narrative

- Problem: background Windows scheduling noise can hurt frame-time stability in competitive games.
- Solution: reversible local process isolation with protected anti-cheat/system boundaries.
- Evidence: CS2 VProf benchmark, unit tests, renderer build checks, smoke test, and screenshots.
- OSS value: transparent Windows API implementation, reproducible build docs, issue templates, and safety-focused contribution policy.
