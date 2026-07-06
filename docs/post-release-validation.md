# Post-Release Install Validation

This note tracks the first-user validation pass for the public `v1.1.1`
GitHub Release.

Release URL: https://github.com/chezzof/ultraisolator/releases/tag/v1.1.1

Release target commit: `7567292fee848e5546de715b04a5cf105e2414a6`

Validation date: 2026-07-06

## Public Artifacts Checked

The artifacts were downloaded from the public GitHub Release, not reused from a
local `ui/dist-packaged` directory. Treat GitHub Release downloads as the
authoritative user-facing artifact set for post-release checks.

| Artifact | Size | SHA-256 |
|----------|------|---------|
| `Esports.Isolator.PRO.Setup.1.1.1.exe` | 301,357,635 bytes | `4754b11d045b888d13ed8c44cd44af08131454bbba0e9cc9055eac6af95c2376` |
| `Esports-Isolator-PRO-1.1.1-portable.exe` | 301,141,758 bytes | `7b7728a02d08ab8b07f1f095c728c2bf92d072969b3a440287a80f853e41e2b1` |
| `SHA256SUMS.txt` | 208 bytes | `c9859c0b1df2a1181a3873f77e2c3fe789c9cb59dfedbd882dae896640eaa2ec` |

`SHA256SUMS.txt` lists exactly the public GitHub asset names. This matters
because GitHub normalized the installer filename from the local build output
name to `Esports.Isolator.PRO.Setup.1.1.1.exe`.

## Automated Post-Release Checks

Run from a clean branch after downloading the public assets:

```powershell
$downloadDir = Join-Path $env:TEMP 'ultraisolator-v1.1.1-post-release-validation'
if (Test-Path $downloadDir) {
  Remove-Item -LiteralPath $downloadDir -Recurse -Force
}
New-Item -ItemType Directory -Path $downloadDir | Out-Null
gh release download v1.1.1 --repo chezzof/ultraisolator --dir $downloadDir
```

Results:

- Public release metadata is non-draft, non-prerelease, and tagged `v1.1.1`.
- Public asset filenames match `SHA256SUMS.txt`.
- `Get-FileHash -Algorithm SHA256` matched both downloadable executables.
- 7-Zip extraction succeeded for the public NSIS installer and portable exe.
- Both extracted payloads contained `resources/backend`.
- Both extracted payloads passed packaged runtime verification against the
  trusted app-bundle backend manifest.
- Silent NSIS install to a temporary user directory completed with exit code 0,
  wrote the expected app executable, `resources/app.asar`, `resources/backend`,
  and uninstaller, then uninstalled and removed the temporary install root.
- Executable manifest inspection found the public installer and portable
  wrappers use `asInvoker`, while the extracted packaged app executable in both
  artifacts requests `requireAdministrator`.
- From a non-elevated shell, direct `CreateProcess` launch of the extracted
  packaged app executable fails with Windows error 740 instead of running a
  partial non-Administrator app.
- Packaged Python policy rejected missing, relative, PATH-style, and untrusted
  absolute `EII_PYTHON` values.

Extraction/runtime evidence:

```text
OK public SHA256SUMS manifest verified against public asset names
Using extractor: C:\Program Files\7-Zip\7z.exe
OK public-installer backend runtime verified: $PLUGINSDIR\app-64.7z.extracted\resources\backend
OK public-portable backend runtime verified: $PLUGINSDIR\app-64.7z.extracted\resources\backend
OK public release payload extraction/runtime verification passed
```

Silent installer evidence:

```text
installer-exit-code=0
install-root=%TEMP%\ultraisolator-v1.1.1-silent-install
exists:Esports Isolator PRO.exe=True
exists:resources\backend=True
exists:resources\app.asar=True
exists:Uninstall Esports Isolator PRO.exe=True
backend-file-count=45
uninstaller-exit-code=0
cleanup-install-root-exists=False
```

Executable manifest evidence:

```text
Esports.Isolator.PRO.Setup.1.1.1.exe requestedExecutionLevel=asInvoker
Esports-Isolator-PRO-1.1.1-portable.exe requestedExecutionLevel=asInvoker
installer Esports Isolator PRO.exe requestedExecutionLevel=requireAdministrator
portable Esports Isolator PRO.exe requestedExecutionLevel=requireAdministrator
```

Non-Administrator direct launch evidence:

```text
installer direct-createprocess-error=740 The requested operation requires elevation
portable direct-createprocess-error=740 The requested operation requires elevation
```

Packaged Python policy evidence:

```text
OK rejected missing interpreter: Packaged Python runtime is missing
OK rejected relative interpreter: Packaged Python runtime must be an absolute trusted path.
OK rejected PATH-like interpreter: Packaged Python runtime must be an absolute trusted path.
OK rejected untrusted absolute interpreter: Packaged EII_PYTHON is outside trusted Python roots
```

## Manual Fresh-User First-Run Matrix

These checks require an interactive Windows 10/11 profile because the public
download wrappers are `asInvoker`, the packaged app executable inside the
installer and portable payload requests Administrator execution level, and the
download may trigger SmartScreen. Do not run them against a maintainer dev
checkout as proof of clean-user behavior.

| Scenario | Expected result | Evidence to capture |
|----------|-----------------|---------------------|
| Installer download plus checksum verification | Checksum matches `SHA256SUMS.txt`; unsigned installer caveat is understood before launch | PowerShell hash output and release URL |
| Installer launch without prior elevation | Installer wrapper may run as the current user; launching the installed app should request Administrator through the packaged app manifest | UAC/SmartScreen screenshot if shown |
| Installer launch with Administrator approval | Installed app opens, backend starts, dashboard renders, no private paths/tokens are visible | Screenshot of dashboard and app version |
| Portable launch without prior elevation | Portable wrapper may run as the current user; the extracted app should request Administrator through the packaged app manifest before privileged tuning | UAC/SmartScreen screenshot if shown |
| Portable launch with Administrator approval | Portable app opens, backend starts, dashboard renders, no private paths/tokens are visible | Screenshot of dashboard and app version |
| Missing `EII_PYTHON` | Packaged startup fails closed with a clear runtime error instead of falling back to PATH Python | Error dialog/log excerpt |
| Relative or PATH-style `EII_PYTHON` | Packaged startup rejects the value as not absolute/trusted | Error dialog/log excerpt |
| Trusted absolute `EII_PYTHON` under a protected install root | Packaged backend starts with that interpreter | Backend startup log excerpt |
| Conservative anti-cheat mode with background jailing disabled | Settings show conservative anti-cheat guidance and background jailing remains opt-in | Settings screenshot |

## Support and Debug Report Path

For public issues, ask users to include:

- Release artifact used: installer, portable, source checkout, or local build.
- Release version and asset filename.
- Windows version and build.
- Python version and whether `EII_PYTHON` is set.
- Administrator status.
- Game, launcher, overlay, and anti-cheat stack.
- `anti_cheat_mode` value.
- Background jailing status.
- Relevant log excerpt only.

Users must not paste full `config.json`, local private paths, bearer tokens,
complete process lists, or recovery-state files in public issues. Security
reports should use GitHub Security Advisories instead of public issues.
