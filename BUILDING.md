# Building Esports Isolator PRO Desktop

This project packages the React renderer and Electron shell with `electron-builder`.
The Python API/engine source is included as app resources and verified at startup with a backend resource integrity manifest.

## Prerequisites

- Windows 10/11.
- Python 3.12 or newer for development and packaging. `npm run build` assembles a private runtime from `EII_BUILD_PYTHON` or `python` on `PATH`; packaged production builds do not trust arbitrary inherited `EII_PYTHON` values.
- Python dependency installed for that interpreter. `requirements.txt` pins `psutil`.

- Node.js and npm.

## Production Readiness Contract

The current release model is **source plus reproducible local build**:

- CI verifies the Python engine and renderer/smoke surface.
- Local packaging creates one per-machine NSIS Windows installer under `ui/dist-packaged`.
- Packaged production startup accepts only an allowlisted absolute interpreter path under a protected install root; any developer override is explicit and non-production only.
- A backend resource integrity manifest is generated at build time and stored in the trusted app bundle.
- Builds are not code-signed. Windows SmartScreen can warn on downloaded artifacts until a signing and reputation policy is added.
- Auto-update is intentionally disabled until distribution, signing, and rollback policy are decided.

## Install

From the repository root:

```powershell
python -m pip install -r requirements.txt
npm --prefix ui install
```

## Development

From an Administrator PowerShell, start the renderer and Electron shell together:

```powershell
npm --prefix ui run dev
```

Optional smoke check for the API bridge and built renderer:

```powershell
npm --prefix ui run smoke
```

The development launcher verifies elevation before it opens a Vite port, starts Electron, or launches the Python API. A non-elevated launch exits immediately. The backend still pauses expensive UI-facing reads during game mode; logs, readiness, analysis, and MSI inspection are loaded on demand from the open renderer.

## Production Build

From the repository root:

```powershell
npm --prefix ui run build
```

The same command from `ui/` is:

```powershell
npm run build
```

The build script runs:

1. `vite build` for `ui/dist`.
2. `node scripts/generate-assets.js` for deterministic icons under `ui/assets`.
3. `node scripts/generate-backend-manifest.js` for `ui/backend-manifest.json`.
4. `electron-builder --win nsis`.
5. `scripts/release-manifest.ps1` from the release gate writes `SHA256SUMS.txt` for distributable artifacts.

Artifacts are written to `ui/dist-packaged`.

Before publishing or sharing an artifact, run:

```powershell
powershell -File scripts/release-check.ps1
```

For CI-like checks without packaging artifacts:

```powershell
powershell -File scripts/release-check.ps1 -SkipPackage
```

The release hypotheses and go/no-go criteria are documented in [`docs/release-readiness.md`](docs/release-readiness.md).

## Packaging Model

- Build tool: `electron-builder`.
- Windows target: a per-machine NSIS installer under Program Files; the install directory is not user-selectable.
- Backend: `server/`, `isolator/`, `best_isolator.py`, `requirements.txt`, and `config.json.example` are copied to `resources/backend`.
- Integrity: `ui/backend-manifest.json` is packaged in the trusted app bundle and contains SHA-256 hashes for backend files copied to `resources/backend`.
- Runtime: before launching Python, the packaged Electron app verifies that `resources/backend` is not standard-user writable, all manifest-listed files exist, file hashes match, and no source/executable backend file is missing from the manifest.
- Python: production packages include Python 3.12 and pinned `psutil` under `resources/python`. Startup verifies that the selected interpreter exists under an allowlisted protected install root; arbitrary inherited `EII_PYTHON` values are rejected.
- Config: packaged builds store editable `config.json` in Electron `userData`, not inside the install directory.
- Recovery: IFEO and power recovery state is written under protected app data with a versioned signed envelope, restrictive ACLs where Windows permits, and fail-closed restore if the file is missing its tag, tampered, downgraded, or standard-user writable.
- First-time local packaging can download Electron Builder helper binaries such as NSIS resources; the app itself does not download or execute remote code at runtime.

This keeps the engine/GUI separation intact: the Electron renderer can close to tray while the localhost API process continues until Exit.
Protection starts automatically on each application launch. A manual pause lasts for the current app session only; the next launch starts monitoring again. The Windows startup preference is implemented by the elevated `\UltraIsolator\LaunchAtLogon` scheduled task, not a per-user login item.

## Release Limitations

- The app requests Administrator elevation because the engine needs privileged Windows tuning APIs.
- Production packaged startup fails closed if `EII_PYTHON` points outside a trusted root, if the selected interpreter or its directory is standard-user writable, or if backend resource integrity verification fails.
- `EII_ALLOW_UNTRUSTED_PACKAGED_PYTHON=1` is a developer diagnostic override only. It is accepted only in non-production packaged diagnostics and still requires an absolute path.
- Packaged builds run provenance and integrity checks before backend launch, then run the Python version and `psutil` preflight. Failures are logged to `backend.log` and shown in the startup fallback window.
- The supported install layout keeps the trusted app bundle, interpreter root, and `resources/backend` under Program Files with protected ACLs. Portable and per-user builds are not produced.
- The installer is unsigned in this repository. Do not market unsigned artifacts as production-signed releases.
- The project is Windows-only; Linux/macOS builds are not supported.
- Background jailing remains opt-in in the default config.

## Runtime Diagnostics

- Backend stderr is written to `backend.log` under Electron `userData` in packaged builds.
- Runtime provenance failures are shown in the startup fallback window before Python is spawned.
- Recovery-state rejections are logged without relying on local file paths; IFEO registry restore targets are re-derived from trusted executable names before HKLM writes or deletes.
- The Logs page reads the configured `log_file` on demand and pauses live refresh during game mode.
- The Advanced Tools page is read-only for MSI mode inspection; it does not write registry values.
- First-run presets write `config.json` through the same `/api/config` validation path as Settings.
- The localhost API is protected by a per-launch token passed from Electron main to the backend. The Electron renderer never receives the raw token; it uses allowlisted IPC proxy operations owned by Electron main. Standalone browser clients must provide `Authorization: Bearer <token>` when a token is configured.

## Icons

Icons are generated locally by `ui/scripts/generate-assets.js`.

Required outputs:

- `ui/assets/icon.ico` multi-resolution Windows app icon.
- `ui/assets/tray-idle.ico`, `tray-game.ico`, `tray-error.ico`.
- 16x16 and 32x32 tray PNGs for each state.
- `ui/assets/logo.svg`, tray SVGs, `installer.png`, and `splash-logo.png`.

The palette matches the benchmark HUD: dark `#0A0A0A`, mint/cyan `#00D4AA`, grey idle, red error.

## Auto-updater

Auto-updater support is intentionally not enabled in this step. The app is single-user, localhost-only, and Windows-only; update distribution and code-signing policy should be decided before adding updater behavior.

## Useful Commands

```powershell
npm --prefix ui run build:assets
npm --prefix ui run build:backend-manifest
npm --prefix ui run build:python-runtime
npm --prefix ui run build:renderer
npm --prefix ui run pack
npm --prefix ui run build
npm --prefix ui run verify:packaged-runtime
```
