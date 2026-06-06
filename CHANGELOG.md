# Changelog

## [Unreleased]

## [1.1.1] - 2026-06-06

- Hardened the elevated desktop localhost API with a per-launch bearer token, origin checks before request body reads, and a 64 KiB JSON body limit.
- Restricted packaged Electron startup so untrusted renderer URL overrides are ignored and unexpected navigation or pop-up windows are denied.
- Required packaged builds to use a trusted absolute `EII_PYTHON` path while keeping development PATH fallback behavior.
- Routed engine config loading and log path updates through validated `ConfigStore` boundaries.
- Pinned the Python runtime dependency and GitHub Actions references, and documented the remaining checksum/code-signing trust boundary.
- Added a security hardening audit covering reviewed surfaces, implemented controls, verification evidence, and deferred external release checks.

## [1.1.0] - 2026-06-05

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

## [0.1.0] - 2026-05-21

- Electron desktop shell with localhost Python bridge.
- Dashboard, Topology, Settings, and Logs views.
- Tray-first startup, close-to-tray behavior, and app settings.
- Live KPI strip, process table, CPU topology map, and config editor.
