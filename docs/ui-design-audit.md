# Desktop UI Design Audit

Date: 2026-06-17

Scope: Electron React renderer only. This audit does not change backend behavior, Electron security boundaries, packaged runtime provenance, or IFEO/power recovery logic.

Evidence set:

| Page | Screenshot |
| --- | --- |
| Dashboard | [docs/screenshots/current/dashboard.png](screenshots/current/dashboard.png) |
| CPU Topology | [docs/screenshots/current/topology.png](screenshots/current/topology.png) |
| Settings | [docs/screenshots/current/settings.png](screenshots/current/settings.png) |

Verification used for this audit:

```powershell
npm.cmd --prefix ui run build:renderer
npm.cmd --prefix ui run smoke
python -m unittest tests.test_react_frontend -v
```

## Executive Summary

The renderer already has a credible dark desktop foundation: Carbon shell navigation, stable page routing, clear local connection status, status tags, dense operational data, and no obvious marketing-page styling. It reads like a real Windows utility rather than a web landing page.

The release risk is visual polish and information architecture. The current UI often gives primary status, secondary telemetry, readiness warnings, and controls similar visual weight. Settings is functionally complete but dense. Styling is concentrated in one large stylesheet with multiple later "refresh" passes appended, which makes the design direction harder to maintain and easier to regress.

Target direction: a premium dark Windows desktop control room for competitive performance tuning. It should feel calmer, more structured, and more product-like while staying Carbon-compatible and telemetry-first.

## Current Strengths

| Area | Evidence | Why it helps |
| --- | --- | --- |
| Desktop shell | `ui/src/App.jsx` uses Carbon `Header`, persistent `SideNav`, and `Content`. | The navigation model already fits a desktop operations app. |
| Token boundary is preserved | Renderer API contracts are covered by `tests/test_react_frontend.py`. | UI work can proceed without reopening security architecture. |
| Dashboard data surface is rich | `ui/src/pages/Dashboard.jsx` contains live status, action controls, KPIs, analysis, readiness, and process table. | The data needed for a strong command center already exists. |
| Topology concept is strong | `ui/src/pages/Topology.jsx` already has core tiles, partition legend, and core details. | The best UX path is refinement, not replacing the view with abstract charts. |
| Settings are complete | `ui/src/pages/Settings.jsx` has config schema loading, validation, presets, app settings, profiles, and save/reset/reload flows. | The redesign can focus on grouping and density, not inventing behavior. |

## Findings

### 1. Dashboard Hierarchy Is Too Flat

Severity: high for public polish, not a functional blocker.

Evidence: [dashboard screenshot](screenshots/current/dashboard.png), `ui/src/pages/Dashboard.jsx`

The dashboard includes a hero-like status panel, six KPI cards, system analysis, readiness checks, and process data. Most modules use similar card borders, shadows, labels, and scale. The result is visually dense even when the engine is idle.

What users need first:

1. Is a game detected?
2. Is optimization active?
3. Is the setup safe?
4. What action should I take?

Current issue: "Engine idle", quick actions, tracked processes, timer, CPU partitions, readiness, and system analysis compete at similar visual strength. The large `Engine idle` readout is prominent, but its surrounding cards and warnings dilute the hierarchy.

Recommendation: make the dashboard a status-first command center with one dominant state region, one primary action, and secondary cards ordered by operational importance.

### 2. Readiness And Safety Signals Need A Clearer Warning Ladder

Severity: medium.

Evidence: [dashboard screenshot](screenshots/current/dashboard.png), `ui/src/components/ReadinessChecklist.jsx`

Readiness checks are useful, but warning cards sit in a dense grid with limited distinction between caution and safe states. A public release UI should make it immediately clear whether a warning is informational, blocks optimization, or requires operator action.

Recommendation: introduce a shared `SafetyBanner` and severity scale:

| Severity | Use |
| --- | --- |
| Healthy | All required controls available. |
| Notice | Optional capability missing or inactive. |
| Caution | Feature available but not applied. |
| Blocked | Cannot safely start or recover. |
| Failed | Startup/runtime safety check failed. |

### 3. Settings Page Is Functionally Complete But Hard To Scan

Severity: high for usability.

Evidence: [settings screenshot](screenshots/current/settings.png), `ui/src/pages/Settings.jsx`

Settings presents many controls at once: game detection, jailing, timing, protection, app preferences, notifications, presets, and app profiles. The current structure is logical to an engineer, but the visual grouping does not separate safe preferences from risky tuning controls strongly enough.

Recommendation: group settings by intent and risk:

| Group | Examples |
| --- | --- |
| Everyday | Language, startup behavior, notifications. |
| Game detection | Game executable names, Steam/Epic library paths. |
| Performance tuning | polling, priority, power plan, timer resolution. |
| Advanced isolation | background jailing, IFEO, per-app profiles. |
| Recovery and safety | restore behavior, warnings, validation state. |

Dangerous or restart-required controls should be visually distinct without relying only on helper text.

### 4. Topology Page Has The Right Primitive But Needs Better Storytelling

Severity: medium.

Evidence: [topology screenshot](screenshots/current/topology.png), `ui/src/pages/Topology.jsx`

The core tile map is the right model for this product. It shows game, background, and housekeeping partitions directly. The gap is explanatory framing: the page should tell the user what changed after optimization and why the partition map matters.

Recommendation: keep core tiles. Add a short interpretation band above the map:

| State | Example message |
| --- | --- |
| Engine idle | "Start the engine to apply core partitions." |
| Game mode active | "Game cores are reserved for foreground gameplay." |
| Topology unavailable | "CPU topology is unavailable, so partition details cannot be verified." |

### 5. CSS Architecture Makes Visual Drift Likely

Severity: high for maintainability.

Evidence: `ui/src/styles.css`

The stylesheet is large and includes multiple appended design passes:

1. Base renderer styling.
2. "Production desktop refresh".
3. "GitHub utility reference pass".
4. "Open-source clean pass".

This explains the current inconsistency: later sections override earlier sections instead of converging on shared tokens and component primitives. The next UI implementation should not start by redesigning pages. It should first introduce stable design tokens and layout primitives, then migrate pages in small PRs.

Recommendation: create a small UI foundation:

| Primitive | Purpose |
| --- | --- |
| `AppShell` styles | Single source for desktop chrome spacing and page width. |
| `PageHeader` | Shared title, subtitle, status tags, and actions. |
| `SectionGrid` | Consistent responsive grid behavior. |
| `MetricCard` | Stable KPI surface. |
| `StatusPill` | Consistent state labels. |
| `SafetyBanner` | Shared warning and blocked-state treatment. |
| `EmptyState`, `LoadingState`, `ErrorState` | Consistent non-happy-path surfaces. |

### 6. Responsive Behavior Needs Explicit Release Targets

Severity: medium.

Evidence: screenshots are 1440x1050 and page CSS has responsive sections, but release screenshots do not cover small laptop, 1440p, and 4K layouts.

Required release targets:

| Viewport | Purpose |
| --- | --- |
| 1366x768 | Small Windows laptop and streaming setups. |
| 1920x1080 | Common desktop baseline. |
| 2560x1440 | Enthusiast gaming monitors. |
| 3840x2160 | 4K desktop scaling sanity check. |

Recommendation: add visual regression after the redesign foundation and first page pass, not before. Baselines should cover deterministic mock states.

## Page-by-Page Audit

### Dashboard

Keep:

1. Existing live state source.
2. Existing Start, Stop, Restore actions.
3. System analysis and readiness widgets.
4. Process table.

Improve:

1. Promote a single "current system state" hero.
2. Use one primary CTA based on engine state.
3. Split operational KPIs from readiness/safety warnings.
4. Add explicit empty state for no game running.
5. Add explicit backend unavailable state.

### CPU Topology

Keep:

1. Core tile map.
2. Partition legend.
3. Core detail panel.

Improve:

1. Add an interpretation summary above the map.
2. Make game/background/housekeeping color semantics reusable.
3. Show active and inactive partition state more clearly.
4. Make selection affordance clearer.

### Settings

Keep:

1. Existing schema-driven config editing.
2. Validation and restart-required behavior.
3. Config presets.
4. Per-app profiles.

Improve:

1. Split settings into risk/purpose sections.
2. Make advanced controls visually quieter until expanded or focused.
3. Put destructive/reset actions in a separate action group.
4. Make validation errors and restart-required state persistent near the save area.

### Logs And Readiness

Current screenshot coverage is missing from this audit evidence set. The redesign plan should capture logs/readiness screenshots before implementation.

Improve:

1. Keep logs dense and scannable.
2. Add clear severity filters.
3. Avoid color-only severity meaning.
4. Align logs visual language with readiness and safety banners.

## What Not To Touch In UI Redesign PRs

The redesign should not change:

1. Electron token boundary.
2. Preload API shape.
3. Backend API routes.
4. Packaged runtime provenance.
5. Bundled Python staging or verification.
6. IFEO/power recovery logic.
7. Config schema semantics.
8. Tuning behavior.

## Acceptance Criteria For The Next UI PR

The next PR should add design foundation only:

1. Shared tokens for surfaces, text, spacing, borders, status colors, and layout width.
2. Shared layout primitives for page header, grids, cards, status, and states.
3. No page redesign beyond replacing duplicated wrappers where safe.
4. `npm.cmd --prefix ui run build:renderer` passes.
5. `npm.cmd --prefix ui run smoke` passes.
6. `python -m unittest tests.test_react_frontend -v` passes.
7. `git diff --check` passes.
