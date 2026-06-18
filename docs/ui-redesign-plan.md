# Desktop UI Redesign Plan

Date: 2026-06-17

Goal: turn Esports Isolator PRO from a functional engineering dashboard into a polished release-ready Windows desktop product UI.

Primary direction: premium dark desktop utility, Carbon-compatible structure, telemetry-first hierarchy, calm safety indicators, and deterministic visual regression coverage.

This plan is intentionally layered. Do not start with a full-page redesign.

## Design Principles

1. Status first: every page should answer the user's immediate operational question before showing dense details.
2. Safety is visible: warnings, blocked states, recovery state, and dangerous controls need consistent semantics.
3. Carbon stays: keep Carbon components and tokens as the base instead of mixing UI kits.
4. Dense but organized: this is a desktop operations tool, not a marketing site.
5. No runtime drift: UI work must not change backend behavior or Electron security boundaries.

## Target Visual Direction

| Attribute | Direction |
| --- | --- |
| Overall feel | Premium Windows control room for competitive performance tuning. |
| Color | Dark graphite base, restrained cyan/blue performance accent, green only for healthy, amber for caution, red only for errors or danger. |
| Typography | Compact, readable, technical; avoid oversized headings inside panels. |
| Layout | Fixed desktop shell, constrained content width, stable cards, clear vertical rhythm. |
| Components | Carbon-compatible surfaces, buttons, tags, toggles, toolbars, tables, and forms. |
| Motion | Minimal; no decorative animation needed. |

## PR Sequence

### PR 1: Add Design Tokens And Layout Primitives

Scope:

1. `ui/src/styles/*` or a clearly separated design-token section.
2. Shared layout components under `ui/src/components/layout/*`.
3. Shared status/state/card components under `ui/src/components/*`.
4. Focused tests in `tests/test_react_frontend.py`.

Deliverables:

| Component | Purpose |
| --- | --- |
| `PageHeader` | Shared title, subtitle, status tags, and action slot. |
| `SectionGrid` | Responsive page sections with stable gaps. |
| `MetricCard` | KPI and status metric surface. |
| `StatusPill` | Semantic state labels. |
| `SafetyBanner` | Warning, blocked, failed, and healthy state messaging. |
| `EmptyState` | No data or no game state. |
| `LoadingState` | Deterministic loading surface. |
| `ErrorState` | Backend unavailable or failed request surface. |

Rules:

1. Do not redesign all pages in this PR.
2. Do not touch `ui/electron-main.js` or `ui/electron-preload.js`.
3. Do not add direct backend URL or token access.
4. Remove duplicated styling only where a shared primitive replaces it directly.

Verification:

```powershell
node --check ui\electron-main.js ui\electron-preload.js
python -m unittest tests.test_react_frontend -v
python -m unittest discover -s tests -p "test_*.py" -v
npm.cmd --prefix ui run build:renderer
npm.cmd --prefix ui run smoke
git diff --check
```

### PR 2: Redesign Dashboard Information Hierarchy

Scope:

1. `ui/src/pages/Dashboard.jsx`
2. Dashboard-specific components under `ui/src/components/dashboard/*`
3. Existing dashboard hooks and API helpers, read-only.
4. Screenshot evidence.

Target structure:

| Region | Content |
| --- | --- |
| Hero status | Game detection, engine mode, optimization state, safety state. |
| Primary action | One obvious action based on current state. |
| Operational cards | Current game, CPU partition, background jail, power plan, timer, recovery. |
| Safety/readiness | Readiness summary with severity hierarchy. |
| Activity | Recent events and process table. |

Required states:

1. Engine idle with no game.
2. Engine running without game mode.
3. Game mode active.
4. Backend unavailable.
5. Readiness warnings.

Rules:

1. Use existing data only.
2. Do not add backend routes.
3. Do not alter lifecycle action semantics.

Verification:

```powershell
python -m unittest tests.test_react_frontend -v
npm.cmd --prefix ui run build:renderer
npm.cmd --prefix ui run smoke
git diff --check
```

### PR 3: Improve Topology And Settings UX

Scope:

1. `ui/src/pages/Topology.jsx`
2. `ui/src/pages/Settings.jsx`
3. Optional components under `ui/src/components/topology/*` and `ui/src/components/settings/*`
4. Existing config schema and API behavior, unchanged.

Topology goals:

1. Keep the core tile map.
2. Add an interpretation summary.
3. Make partition legend and selected core state clearer.
4. Show active/inactive optimization state.
5. Preserve keyboard and button accessibility.

Settings goals:

1. Group controls by purpose and risk.
2. Make advanced controls visually distinct.
3. Keep anti-cheat and background jailing warnings visible.
4. Preserve save, reset, reload, validation, and restart-required behavior.
5. Keep per-app profiles scannable.

Risk groups:

| Group | Examples |
| --- | --- |
| Everyday | language, startup, tray, notifications. |
| Game detection | game executable names, Steam/Epic paths. |
| Performance tuning | polling, priority, power plan, timer. |
| Advanced isolation | background jailing, IFEO, per-app overrides. |
| Recovery and safety | validation, restore notes, restart-required state. |

Verification:

```powershell
python -m unittest tests.test_react_frontend -v
npm.cmd --prefix ui run build:renderer
npm.cmd --prefix ui run smoke
git diff --check
```

### PR 4: Add Visual Regression And Accessibility Gates

Scope:

1. Playwright config and deterministic renderer test harness.
2. Visual tests for dashboard, topology, settings, logs, and diagnostic/error states.
3. Accessibility smoke tests for headings, labels, contrast-adjacent states, and keyboard path.
4. Package scripts and docs for updating baselines.

Visual baseline states:

| Page | State |
| --- | --- |
| Dashboard | idle/no game |
| Dashboard | active game mode |
| Dashboard | backend unavailable |
| Topology | topology available |
| Settings | default config loaded |
| Logs | mixed severity entries |

Rules:

1. Use deterministic mock data.
2. Disable animations where practical.
3. Keep screenshots small and intentional.
4. Do not depend on paid visual testing services.
5. Do not use real local paths, usernames, tokens, or process lists in screenshots.

Verification:

```powershell
npm.cmd --prefix ui run build:renderer
npm.cmd --prefix ui run test:visual
npm.cmd --prefix ui run test:a11y
npm.cmd --prefix ui run smoke
python -m unittest discover -s tests -p "test_*.py" -v
git diff --check
```

Local gate details:

1. `npm.cmd --prefix ui run test:visual` runs Playwright screenshot comparisons at `1366x768` against deterministic mock renderer data.
2. `npm.cmd --prefix ui run test:a11y` runs `@axe-core/playwright` smoke checks for Dashboard, Settings, and Topology.
3. `npm.cmd --prefix ui run test:ui-quality` builds the renderer, then runs both visual and accessibility gates.
4. Baselines are committed under `ui/tests/visual/*-snapshots/`.
5. To intentionally refresh baselines after a reviewed UI change, run:

```powershell
npm.cmd --prefix ui run test:visual -- --update-snapshots
```

6. The gate defaults to the installed Chrome channel for local stability. Override with `EII_PLAYWRIGHT_CHANNEL` only when validating another installed Playwright browser channel.
7. These scripts are local/manual release-quality gates first; do not make them mandatory in CI until the snapshot set has proven stable across runner images.

### PR 5: Refresh Public Screenshots

Scope:

1. `docs/screenshots/*`
2. README screenshot references if needed.
3. Release notes screenshot references if needed.

Rules:

1. Capture dashboard, topology, settings, logs, and diagnostic/error states.
2. Use mock/demo data.
3. Do not show local usernames, tokens, private paths, personal process lists, or private configs.
4. Keep screenshot dimensions consistent.

Verification:

```powershell
python -m unittest tests.test_react_frontend -v
npm.cmd --prefix ui run build:renderer
npm.cmd --prefix ui run smoke
git diff --check
```

## Component Inventory

Current app-level surfaces:

| File | Role |
| --- | --- |
| `ui/src/App.jsx` | Carbon shell, navigation, live snapshot, notifications, first-run wizard. |
| `ui/src/pages/Dashboard.jsx` | Live state, lifecycle actions, KPIs, analysis, readiness, process table. |
| `ui/src/pages/Topology.jsx` | CPU topology summary, core tile map, core detail panel. |
| `ui/src/pages/Settings.jsx` | Config editor, app settings, presets, profiles, validation. |
| `ui/src/pages/Logs.jsx` | Log search/filter/readiness-adjacent operational history. |
| `ui/src/styles.css` | Current global style source with multiple appended design passes. |

## Non-Goals

Do not change:

1. Backend API behavior.
2. Electron main/preload security model.
3. Renderer token boundary.
4. Packaged runtime provenance.
5. Bundled Python staging or verification.
6. Protected recovery state.
7. IFEO/power tuning behavior.
8. Config schema semantics.
9. Release/package scripts unless visual test wiring requires a local-only npm script.

## Release Readiness Definition

The UI is release-ready when:

1. Dashboard communicates game state, optimization state, safety state, and next action in under five seconds.
2. Topology communicates game/background/housekeeping partitioning without requiring source-code knowledge.
3. Settings separate ordinary preferences from advanced or dangerous tuning.
4. Logs and diagnostics are readable under failure conditions.
5. Visual regression baselines cover the main desktop states.
6. Accessibility smoke checks pass for labels, keyboard flow, headings, and non-color-only status meaning.
7. README screenshots match the current UI.
