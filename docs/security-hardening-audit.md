# Security Hardening Audit

Date: 2026-06-06

## Scope

Repository-wide production hardening review for the Windows desktop release path:

- Electron main/preload/renderer trust boundary.
- Python localhost API and config writes.
- Privileged Windows process, CPU Sets, power plan, IFEO, and recovery flows.
- Release packaging, CI, dependency pinning, and public safety documentation.

## Fixed Findings

| Area | Finding | Hardening |
|------|---------|-----------|
| Localhost API | Unauthenticated loopback callers could drive privileged API routes. | Per-launch bearer token is generated in Electron main, passed to the Python backend, exposed only through preload IPC, and required by API routes when configured. |
| Localhost API | Cross-origin browser requests could be rejected only after body reads. | Origin/token checks run before body consumption and request bodies are capped at 64 KiB. |
| Electron | Packaged app could honor arbitrary `EII_RENDERER_URL`. | Packaged builds load only bundled renderer files; URL override remains dev-only and new windows/navigation are denied. |
| Electron | Elevated packaged app could resolve Python through ambiguous PATH lookup. | Packaged builds require `EII_PYTHON` to be an absolute trusted interpreter path; PATH fallbacks remain development-only. |
| Config | Privileged engine could bypass API config validation. | Engine config loading and `set_log_file()` reuse `ConfigStore` validation, including path confinement. |
| Safety docs | `config.json.example` contradicted background-jailing opt-in claims. | Example config now keeps background jailing disabled by default. |
| Supply chain | Floating Python dependency and tag-pinned GitHub Actions. | `psutil` is pinned and core GitHub Actions are pinned to commit SHAs. |

## Production Gates

Run before release:

```powershell
powershell -File scripts/release-check.ps1
git diff --check
```

The release gate covers Python tests, config dry-run, npm audit, renderer build, deterministic asset generation, UI smoke test, Windows package build, checksum manifest generation, public docs checks, and local artifact ignore checks.

## Remaining Deliberate Limits

- Windows binaries are still unsigned; release notes must keep the SmartScreen/code-signing caveat.
- Python is not bundled; packaged users must configure a trusted absolute `EII_PYTHON`.
- Checksums detect corruption but do not authenticate release provenance. Signed checksums or Sigstore/GitHub attestations should be added before treating binary distribution as fully supply-chain hardened.
