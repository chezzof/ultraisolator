# Release Readiness

This document defines the hypotheses that must hold before Esports Isolator PRO can be published as a production-ready source plus reproducible local build release.

The release is blocked until `scripts/release-check.ps1` passes.

## Release Model

Current production target:

- Windows-only source release with reproducible local NSIS and portable builds.
- Unsigned installer is allowed only when release notes clearly state the code-signing limitation.
- A trusted absolute `EII_PYTHON` interpreter is required for packaged desktop builds.
- Background jailing remains opt-in.
- No runtime API or config schema changes are required for this readiness pass.

## Hypotheses and Tests

| Hypothesis | Test | Release criterion |
|------------|------|------------------|
| Python engine behavior is stable | `python -m unittest discover -s tests -p "test_*.py" -v` | 0 failures |
| Default config is valid and safe to parse | `python best_isolator.py --dry-run` | exit code 0 |
| UI dependency tree has no known npm audit findings | `npm --prefix ui audit` | 0 vulnerabilities |
| Renderer compiles for production | `npm --prefix ui run build:renderer` | Vite exits 0 and writes `ui/dist` |
| Deterministic icon generation still works | `npm --prefix ui run build:assets` plus `git diff --exit-code -- ui/assets` | command exits 0 and tracked assets do not drift |
| Local API bridge and built renderer surface are coherent | `npm --prefix ui run smoke` | smoke exits 0 |
| Windows artifacts are reproducible locally | `npm --prefix ui run build` | NSIS and portable artifacts are written to `ui/dist-packaged` |
| Release artifacts are verifiable | `powershell -File scripts/release-manifest.ps1` plus release gate manifest checks | installer and portable artifacts are non-empty, no unexpected root artifacts remain, and `SHA256SUMS.txt` contains exactly their SHA256 hashes |
| Public docs are ready for reviewers | `scripts/release-check.ps1` public surface checks | README, build docs, security docs, OSS checklist, templates, and screenshots exist |
| Public text has no mojibake artifacts | `scripts/release-check.ps1` text checks and frontend contract tests | no common UTF-8 mojibake marker characters in checked files |
| Sensitive local files are not publishable by default | `git check-ignore` checks in `scripts/release-check.ps1` | config, logs, recovery state, and package artifacts are ignored |

## Manual Release Review

Run these checks after the automated gate:

- Open `docs/screenshots/dashboard.png`, `docs/screenshots/topology.png`, and `docs/screenshots/settings.png`; reject stale or clipped screenshots.
- Confirm release notes mention Administrator requirements, unsigned installer status, system Python dependency, Windows-only support, and anti-cheat compatibility boundaries.
- Confirm `enable_background_jailing` remains disabled in `config.json.example`.
- Confirm no local `config.json`, logs, package artifacts, or temporary QA files are staged.
- Confirm `SHA256SUMS.txt` is uploaded with any public binary artifacts.
- If sharing artifacts publicly, test the installer and portable executable on a clean Windows user profile with `EII_PYTHON` pointing at a trusted absolute Python 3.12+ interpreter.

## Known Non-Blocking Build Warning

Electron Builder can emit Node's `DEP0190` warning while packaging on recent Node versions:

```text
Passing args to a child process with shell option true can lead to security vulnerabilities
```

This is emitted by the packaging toolchain after artifacts are produced. It is not an npm audit finding and does not currently block this source plus reproducible local build release. Treat it as a dependency/toolchain item to revisit when upgrading Electron Builder or Node.

## Production Go / No-Go

Go:

- `powershell -File scripts/release-check.ps1` passes.
- Manual release review finds no stale screenshots, misleading claims, or staged local artifacts.
- Release notes disclose unsigned artifacts and trusted absolute `EII_PYTHON` requirement.
- Release artifacts include `SHA256SUMS.txt`.

No-go:

- Any automated gate fails.
- npm audit reports any vulnerability.
- Python tests fail or config dry-run fails.
- Screenshots do not match the shipped UI.
- Release notes imply signed installer, bundled Python, PATH-based packaged Python lookup, cross-platform support, or anti-cheat bypass behavior.
