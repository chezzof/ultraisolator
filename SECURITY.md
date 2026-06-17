# Security Policy

## Scope

Esports Isolator PRO runs with **Administrator privileges** and modifies process priorities, CPU Sets, power plans, and optionally IFEO registry entries. This is inherently sensitive.

## Supported versions

| Version | Supported |
|---------|-----------|
| 1.x | Yes |

## Reporting a vulnerability

If you discover a security issue, please do not open a public issue. Open a [GitHub Security Advisory](https://github.com/chezzof/ultraisolator/security/advisories/new) or contact the repository owner privately through GitHub.

We will acknowledge receipt within 72 hours and aim to release a fix within 14 days.

## Design choices

- The runtime app does not download or execute remote code; development/build tooling may fetch npm and Electron Builder dependencies.
- `config.json` is local-only and excluded from version control.
- Recovery state (`jail_state.json`) can contain PIDs, process names, creation timestamps, CPU-set/priority state, and local tuning metadata; review it before sharing.
- IFEO registry writes are scoped to game executables listed in the user's config.
- Background jailing is opt-in and protected process lists are enforced before tuning.
- The localhost API is intended for the bundled desktop UI and local machine only; production desktop launches protect it with a per-launch bearer token.

## Operational cautions

- Run only builds you produced yourself or downloaded from a release you trust.
- Packaged elevated builds require a trusted absolute `EII_PYTHON` interpreter path; do not rely on an untrusted or ambiguous `PATH`.
- Review `config.json` before enabling background jailing or per-app priority overrides.
- Do not use this project to bypass, disable, or tamper with anti-cheat software.
- If a game or anti-cheat blocks a tuning operation, treat that as a compatibility boundary.
- Do not paste logs or configs publicly before checking for local paths and process names.

See [docs/security-hardening-audit.md](docs/security-hardening-audit.md) for the current production hardening audit summary.
