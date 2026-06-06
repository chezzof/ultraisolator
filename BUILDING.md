# Building Esports Isolator PRO Desktop

This project packages the React renderer and Electron shell with `electron-builder`.
The Python API/engine is included as app resources, but Python itself is not embedded; packaged builds use system Python.

## Prerequisites

- Windows 10/11.
- Python 3.12 or newer. Development can use `python` on `PATH`; packaged builds require `EII_PYTHON` to point at a trusted absolute interpreter path.
- Python dependency installed for that interpreter. `requirements.txt` pins `psutil`.

- Node.js and npm.

## Production Readiness Contract

The current release model is **source plus reproducible local build**:

- CI verifies the Python engine and renderer/smoke surface.
- Local packaging creates NSIS and portable Windows artifacts under `ui/dist-packaged`.
- Python is required on the target machine; it is not bundled into the installer.
- Builds are not code-signed. Windows SmartScreen can warn on downloaded artifacts until a signing and reputation policy is added.
- Auto-update is intentionally disabled until distribution, signing, and rollback policy are decided.

## Install

From the repository root:

```powershell
python -m pip install -r requirements.txt
npm --prefix ui install
```

## Development

Start the renderer and Electron shell together:

```powershell
npm --prefix ui run dev
```

Optional smoke check for the API bridge and built renderer:

```powershell
npm --prefix ui run smoke
```

The development shell starts the renderer, Electron main process, and Python API bridge together. The backend still pauses expensive UI-facing reads during game mode; logs, readiness, analysis, and MSI inspection are loaded on demand from the open renderer.

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
3. `electron-builder --win nsis portable`.
4. `scripts/release-manifest.ps1` from the release gate writes `SHA256SUMS.txt` for distributable artifacts.

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
- Windows targets: NSIS installer and portable executable.
- Backend: `server/`, `isolator/`, `best_isolator.py`, `requirements.txt`, and `config.json.example` are copied to `resources/backend`.
- Runtime: the packaged Electron app launches the trusted Python interpreter from `EII_PYTHON` with `-m server` from `resources/backend`.
- Config: packaged builds store editable `config.json` in Electron `userData`, not inside the install directory.
- First-time local packaging can download Electron Builder helper binaries such as NSIS resources; the app itself does not download or execute remote code at runtime.

This keeps the engine/GUI separation intact: the Electron renderer can close to tray while the localhost API process continues until Exit.

## Release Limitations

- The app requests Administrator elevation because the engine needs privileged Windows tuning APIs.
- A packaged app requires `EII_PYTHON` to point at a trusted absolute Python 3.12+ interpreter path; do not run the elevated app with an ambiguous or untrusted `PATH`.
- The installer is unsigned in this repository. Do not market unsigned artifacts as production-signed releases.
- The project is Windows-only; Linux/macOS builds are not supported.
- Background jailing remains opt-in in the default config.

## Runtime Diagnostics

- Backend stderr is written to `backend.log` under Electron `userData` in packaged builds.
- The Logs page reads the configured `log_file` on demand and pauses live refresh during game mode.
- The Advanced Tools page is read-only for MSI mode inspection; it does not write registry values.
- First-run presets write `config.json` through the same `/api/config` validation path as Settings.
- The localhost API is protected by a per-launch token passed from Electron main to the backend and renderer; standalone browser clients must provide `Authorization: Bearer <token>` when a token is configured.

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
npm --prefix ui run build:renderer
npm --prefix ui run pack
npm --prefix ui run build
```
