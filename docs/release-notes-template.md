# Esports Isolator PRO First Public Release Notes Template

Use this template when publishing a GitHub release.

Release tag: `v1.1.1` (must match `ui/package.json`).

## Summary

Esports Isolator PRO is a Windows-only process isolation tool for competitive games. It detects configured or discovered games, applies reversible CPU/process/power tuning, and restores the system after the session ends.

This first public release candidate packages the current security-hardening baseline for source plus reproducible local Windows builds.

## Artifacts

- `Esports Isolator PRO Setup <version>.exe`
- `Esports-Isolator-PRO-<version>-portable.exe`
- `SHA256SUMS.txt`

For `v1.1.1`, the expected artifact names are:

- `Esports Isolator PRO Setup 1.1.1.exe`
- `Esports-Isolator-PRO-1.1.1-portable.exe`
- `SHA256SUMS.txt`

Generate artifacts and checksums with:

```powershell
powershell -File scripts/release-check.ps1
```

The release gate also runs installed and portable artifact verification. It
extracts the NSIS and portable payloads with 7-Zip, checks `resources/backend`
against the trusted app-bundle manifest, and verifies packaged runtime
provenance. ACL safety is checked on `win-unpacked` before cleanup; temporary
extraction ACLs are not treated as install-location ACL evidence. If 7-Zip is
not on `PATH`, set `EII_SEVEN_ZIP` to a trusted `7z.exe`. Do not use
`EII_RELEASE_DEV_SKIP_INSTALLED_ARTIFACT_VERIFY=1` for published artifacts.

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
- Packaged runtime provenance verification.
- Installed and portable artifact verification.
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
- The desktop localhost API token is owned by Electron main; the renderer uses allowlisted IPC proxy operations and never receives the raw token.
- IFEO and power recovery state is stored as authenticated protected state and fails closed if tampered.
- Packaged startup verifies backend resource integrity and protected ACL assumptions before launching Python.
- Run the elevated packaged app only with a trusted Python interpreter configured through absolute `EII_PYTHON`.
- Do not use this project to bypass, disable, or tamper with anti-cheat software.
- If a game or anti-cheat blocks a tuning operation, treat that as a compatibility boundary.
- Packaged builds can download Electron Builder helper binaries at build time; the app itself does not download or execute remote code at runtime.

## Checksums

Paste the contents of `ui/dist-packaged/SHA256SUMS.txt` here:

```text

```
