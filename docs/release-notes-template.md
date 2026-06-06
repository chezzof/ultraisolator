# Esports Isolator PRO 1.1.1 Release Notes Template

Use this template when publishing a GitHub release.

## Summary

Esports Isolator PRO is a Windows-only process isolation tool for competitive games. It detects configured or discovered games, applies reversible CPU/process/power tuning, and restores the system after the session ends.

This patch release hardens the elevated desktop security boundary before broader public distribution.

## Artifacts

- `Esports.Isolator.PRO.Setup.1.1.1.exe`
- `Esports-Isolator-PRO-1.1.1-portable.exe`
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
- Windows NSIS and portable package build.
- SHA256 checksum manifest.
- Public docs and screenshot presence checks.
- Local config/log/recovery/package ignore checks.

## Requirements

- Windows 10/11.
- Python 3.12+; packaged builds require `EII_PYTHON` set to a trusted absolute interpreter path.
- Administrator elevation for full CPU Sets, IFEO, power plan, timer, and process tuning behavior.

## Security and Compatibility Notes

- The installer is not code-signed in this repository. Windows SmartScreen may warn on downloaded artifacts.
- Background jailing remains opt-in.
- The desktop localhost API is protected by a per-launch token; do not expose or proxy it to other users.
- Run the elevated packaged app only with a trusted Python interpreter configured through absolute `EII_PYTHON`.
- Do not use this project to bypass, disable, or tamper with anti-cheat software.
- If a game or anti-cheat blocks a tuning operation, treat that as a compatibility boundary.
- Packaged builds can download Electron Builder helper binaries at build time; the app itself does not download or execute remote code at runtime.

## Checksums

Paste the contents of `ui/dist-packaged/SHA256SUMS.txt` here:

```text

```
