# Changelog

## [Unreleased]

## [1.1.1] - First public release candidate

- Prepared the first public Windows 10/11 release candidate for source plus reproducible local builds.
- Documented the unsigned installer caveat, Administrator requirement, anti-cheat compatibility boundary, and opt-in background jailing model.
- Kept packaged production startup fail-closed around trusted absolute `EII_PYTHON`, backend manifest verification, and protected packaged resource ACLs.
- Kept the desktop localhost API token inside Electron main and routed renderer requests through allowlisted IPC proxy operations.
- Protected IFEO and power recovery state with authenticated, ACL-checked state files and constrained restore targets.
- Confirmed the release gate covers Python tests, config dry-run, npm audit, renderer build, smoke test, package build, packaged runtime verification, and SHA-256 checksum generation.

## Internal development history

These entries describe pre-public milestones. No public GitHub release has been published yet.

### 2026-06-06

- Hardened the elevated desktop localhost API with a per-launch bearer token, origin checks before request body reads, and a 64 KiB JSON body limit.
- Restricted packaged Electron startup so untrusted renderer URL overrides are ignored and unexpected navigation or pop-up windows are denied.
- Required packaged builds to use a trusted absolute `EII_PYTHON` path while keeping development PATH fallback behavior.
- Routed engine config loading and log path updates through validated `ConfigStore` boundaries.
- Pinned the Python runtime dependency and GitHub Actions references, and documented the remaining checksum/code-signing trust boundary.
- Added a security hardening audit covering reviewed surfaces, implemented controls, verification evidence, and deferred external release checks.

### 2026-06-05

- Prepared the repository for public OSS launch with a refreshed README, Codex for OSS narrative, launch checklist, issue templates, and PR template.
- Documented reproducible local build expectations, unsigned installer limitations, Administrator requirements, and anti-cheat cautions.
- Added CI coverage for the desktop renderer build, deterministic asset generation, and UI smoke test.
- Polished the Electron UI toward a calmer open-source desktop tool visual system.
- Added desktop application documentation and screenshot assets.
- Clarified UI install, dev, and build workflow.
- Added memory-only notification toasts and compact history drawer.
- Added system analysis score and game readiness checklist widgets.
- Added per-app profiles for game detection, jailing, and priority overrides.
- Added first-run config presets with a Settings preset selector.
- Added read-only MSI mode viewer under Advanced Tools.

### 2026-05-21

- Electron desktop shell with localhost Python bridge.
- Dashboard, Topology, Settings, and Logs views.
- Tray-first startup, close-to-tray behavior, and app settings.
- Live KPI strip, process table, CPU topology map, and config editor.
