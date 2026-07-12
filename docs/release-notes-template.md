# Esports Isolator PRO 1.1.1 Release Notes Template

Use this template when publishing a GitHub release.

## Summary

Esports Isolator PRO is a Windows-only process isolation tool for competitive games. It detects configured or discovered games, applies reversible CPU/process/power tuning, and restores the system after the session ends.

This patch release hardens the elevated desktop security boundary before broader public distribution.

## Artifacts

- `Esports Isolator PRO Setup 1.1.1.exe`
- `SHA256SUMS.txt`

Generate artifacts and checksums with:

```powershell
powershell -File scripts/release-check.ps1
```

## Verification

This release should be published only after the release gate passes:

```powershell
powershell -File scripts/release-check.ps1
```

Expected gate coverage:

- Python unit tests.
- Config dry-run.
- npm dependency audit.
- Renderer build.
- Deterministic asset generation.
- UI smoke test.
- Windows per-machine NSIS package build.
- SHA256 checksum manifest.
- Public docs and screenshot presence checks.
- Local config/log/recovery/package ignore checks.

## Requirements

- Windows 10/11.
- The installer includes its own Python 3.12 runtime and pinned `psutil`; no separate Python installation is required.
- Administrator elevation is mandatory; the application exits before starting its UI or backend when elevation is unavailable.

## Security and Compatibility Notes

- The installer is not code-signed in this repository. Windows SmartScreen may warn on downloaded artifacts.
- Background jailing remains opt-in.
- The desktop localhost API is protected by a per-launch token; do not expose or proxy it to other users.
- The packaged app uses its protected bundled interpreter; arbitrary inherited `EII_PYTHON` paths are rejected.
- Do not use this project to bypass, disable, or tamper with anti-cheat software.
- If a game or anti-cheat blocks a tuning operation, treat that as a compatibility boundary.
- Packaged builds can download Electron Builder helper binaries at build time; the app itself does not download or execute remote code at runtime.

## Checksums

Paste the contents of `ui/dist-packaged/SHA256SUMS.txt` here:

```text

```
