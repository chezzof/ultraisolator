<p align="center">
  <a href="https://github.com/chezzof/ultraisolator/releases/latest">
    <img src="docs/social-preview.png" alt="UltraIsolator — protect the frame with local, reversible Windows process isolation" width="100%">
  </a>
</p>

<h1 align="center">UltraIsolator</h1>

<p align="center">
  <strong>Local Windows process isolation for smoother competitive-game sessions.</strong><br>
  Detect the game, protect critical processes, reduce eligible background interference, and restore Windows when the session ends.
</p>

<p align="center">
  <a href="https://github.com/chezzof/ultraisolator/actions/workflows/tests.yml"><img alt="Tests" src="https://github.com/chezzof/ultraisolator/actions/workflows/tests.yml/badge.svg"></a>
  <a href="https://github.com/chezzof/ultraisolator/releases/latest"><img alt="Latest release" src="https://img.shields.io/github/v/release/chezzof/ultraisolator?sort=semver"></a>
  <img alt="Windows 10 and 11" src="https://img.shields.io/badge/Windows-10%20%7C%2011-2F81F7?logo=windows11&logoColor=white">
  <a href="LICENSE"><img alt="MIT License" src="https://img.shields.io/badge/license-MIT-20C997"></a>
</p>

<p align="center">
  <a href="https://github.com/chezzof/ultraisolator/releases/latest"><strong>Download for Windows</strong></a>
  &nbsp;&nbsp;·&nbsp;&nbsp;
  <a href="#how-it-works">How it works</a>
  &nbsp;&nbsp;·&nbsp;&nbsp;
  <a href="#measured-on-cs2">Measured results</a>
  &nbsp;&nbsp;·&nbsp;&nbsp;
  <a href="#safety-by-design">Safety</a>
</p>

<p align="center"><sub>Windows 10/11 · Administrator access required · Local by design · MIT licensed</sub></p>

## How it works

| 01 — Detect | 02 — Prepare |
|---|---|
| Watches configured game processes and scans Steam and Epic libraries. | Checks administrator access, CPU topology, configured games, and restore readiness. |

| 03 — Protect | 04 — Restore |
|---|---|
| Applies the selected CPU, priority, timer, and power tuning for the active session. | Returns tracked Windows state when the game closes or you restore manually. |

Game detection is independent from process-tuning success. A game remains visible when anti-cheat or Windows access rules block direct tuning.

## Why UltraIsolator

- **Game-aware.** Detection follows the active game before tuning, including access-denied and conservative anti-cheat paths.
- **Protected by default.** Windows, Steam, FACEIT, anti-cheat, terminals, and configured protected processes stay outside background isolation.
- **Local.** The desktop UI communicates only with an authenticated loopback API. No cloud account is required.
- **Reversible.** Process state, timer resolution, IFEO hints, and the original power plan are restored after the session.

Background isolation is optional and defaults to off. When enabled, it runs in batches so maintenance work does not become a new source of frame-time noise.

## Real product. Local control.

<p align="center">
  <img src="docs/screenshots/dashboard.png" alt="UltraIsolator Overview showing session protection, game state, safe restore, and local system readiness" width="100%">
</p>

The Overview keeps the current game, protection state, next required action, and safe-restore status in one place. Settings and CPU Map use the same responsive layout in English and Russian.

<details>
<summary><strong>See Settings and CPU Map</strong></summary>

<br>

<img src="docs/screenshots/settings.png" alt="UltraIsolator Settings with aligned responsive toggles" width="100%">

<br>

<img src="docs/screenshots/topology.png" alt="UltraIsolator CPU Map showing game, background, and housekeeping partitions" width="100%">

</details>

## Measured on CS2

The included Counter-Strike 2 VProf comparison uses the same workload with and without UltraIsolator. The strongest result was lower high-percentile frame-time spikes—not a promise of universal FPS gain.

| VProf metric | Without | With UltraIsolator | Change |
|---|---:|---:|---:|
| FrameTotal P95 spike | 8.87 ms | 6.56 ms | **−26.0%** |
| Client Rendering P95 spike | 5.29 ms | 2.75 ms | **−48.0%** |
| Average frame time | 1.77 ms | 1.61 ms | **−9.0%** |
| Average FPS | 564.5 | 619.7 | **+9.8%** |

Results are workload- and hardware-specific. Reproduce the test on the target machine before making tuning decisions.

[Open the benchmark report](docs/benchmarks/cs2-vprof-report.html) · [Inspect the structured summary](docs/benchmarks/cs2-vprof-summary.json)

## Install on Windows

1. Open the [latest release](https://github.com/chezzof/ultraisolator/releases/latest).
2. Download the NSIS installer and matching `SHA256SUMS.txt`.
3. Verify the checksum, run the installer, and approve the Windows UAC prompt.
4. Launch UltraIsolator. Monitoring starts automatically and Overview shows the game when it is detected.

> Current `main` produces a per-machine NSIS installer with a private Python runtime. A portable asset on an older release is legacy and should not be used for the current build.

The installer is currently unsigned. Windows may show an unknown-publisher warning; verify the published SHA-256 checksum before continuing.

## Safety by design

- Mutating desktop, CLI, benchmark, and recovery paths require Administrator elevation and fail closed without it. `--dry-run` remains available to standard users.
- UltraIsolator does not inject into game or anti-cheat processes.
- The application does not download or execute remote code at runtime.
- Packaged startup verifies the bundled backend, private Python runtime, resource permissions, and integrity manifest before launching.
- Local logs and recovery files can contain process names and local paths. Review them before sharing.

<details>
<summary><strong>Packaging and anti-cheat details</strong></summary>

- Production is NSIS-only and installs per-machine under `Program Files`. The installer currently appears as **Esports Isolator PRO** to preserve the existing Windows package identity.
- End users do not install Python separately. The package includes Python 3.12 and `psutil`.
- Startup fails closed when the runtime, backend, or manifest is missing, modified, or standard-user writable.
- Production ignores arbitrary inherited Python paths. Developer overrides are restricted to non-production diagnostics.
- Use `anti_cheat_mode: "conservative"` for stricter anti-cheat stacks.

</details>

## Configuration

Copy [`config.json.example`](config.json.example) to `config.json`. The most important controls are:

| Key | Default | Purpose |
|---|---:|---|
| `games` | `[...]` | Executable names treated as games |
| `auto_detect_steam_games` | `true` | Scan configured and discovered Steam libraries |
| `auto_detect_epic_games` | `true` | Read Epic manifests and configured library paths |
| `enable_background_jailing` | `false` | Limit eligible background processes while a game is active |
| `disable_power_scheme_switch` | `false` | Set `true` to leave the current power plan untouched |
| `disable_timer_resolution_tweak` | `false` | Set `true` to skip the low-latency timer |
| `disable_game_priority_boost` | `false` | Set `true` to skip game priority and IFEO tuning |
| `anti_cheat_mode` | `"aggressive"` | Use `"conservative"` for stricter anti-cheat stacks |
| `game_close_debounce_s` | `3` | Confirm game exit before restoring the session |

See [`config.json.example`](config.json.example) for the complete reference.

## Build and contribute

<details>
<summary><strong>Build from source</strong></summary>

Requirements: Windows 10/11, Python 3.12+, Node.js, and an Administrator terminal for mutating runs.

```powershell
git clone https://github.com/chezzof/ultraisolator.git
cd ultraisolator
python -m pip install -r requirements.txt
copy config.json.example config.json
python best_isolator.py --dry-run
python best_isolator.py
```

The dry run validates configuration without requiring elevation or changing the system. See [BUILDING.md](BUILDING.md) for production packaging.

</details>

## Desktop UI

The Electron + React desktop app runs the same Python engine, keeps monitoring available from the tray, and exposes the backend only through an allowlisted IPC bridge.

<details>
<summary><strong>Desktop UI development</strong></summary>

```powershell
python -m pip install -r requirements.txt
npm --prefix ui install
npm --prefix ui run dev
```

```powershell
npm --prefix ui run build:renderer
npm --prefix ui run test:ui-quality
npm --prefix ui run smoke
npm --prefix ui run build
npm --prefix ui run verify:packaged-runtime
```

</details>

<details>
<summary><strong>CLI and architecture</strong></summary>

```powershell
python best_isolator.py
python best_isolator.py --config myconfig.json
python best_isolator.py --dry-run
python best_isolator.py --recover
python best_isolator.py --benchmark --benchmark-duration-sec 30
```

```text
Electron + React renderer
        │ allowlisted IPC
        ▼
Electron main process ── authenticated 127.0.0.1 API
        │
        ▼
Bundled Python engine
  ├─ game discovery: config + Steam + Epic
  ├─ CPU topology and partitions
  ├─ reversible process, timer, IFEO, and power tuning
  └─ protected-process and anti-cheat boundaries
```

</details>

<details>
<summary><strong>Verification</strong></summary>

```powershell
python -m unittest discover -s tests -p "test_*.py" -v
npm --prefix ui run test:unit
npm --prefix ui run test:ui-quality
```

Full Windows release gate:

```powershell
powershell -File scripts/release-check.ps1
```

</details>

Contributions should be reproducible, anti-cheat-aware, and reversible. Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request. Report vulnerabilities privately through GitHub Security Advisories as described in [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE)
