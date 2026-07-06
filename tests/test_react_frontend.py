import json
import re
import unicodedata
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
UI = ROOT / "ui"
SRC = UI / "src"


class ReactFrontendContractTests(unittest.TestCase):
    def test_vite_react_entrypoints_exist(self):
        self.assertTrue((UI / "index.html").exists())
        self.assertTrue((SRC / "main.jsx").exists())
        self.assertTrue((SRC / "App.jsx").exists())
        self.assertTrue((SRC / "styles.css").exists())

    def test_package_declares_carbon_renderer_stack(self):
        package = json.loads((UI / "package.json").read_text(encoding="utf-8"))

        self.assertIn("@carbon/react", package["dependencies"])
        self.assertIn("@carbon/icons-react", package["dependencies"])
        self.assertIn("sass", package["devDependencies"])
        for group_name in ("dependencies", "devDependencies"):
            for name, version in package[group_name].items():
                self.assertNotRegex(version, r"^[~^>=<*]", f"{name} should be pinned")

    def test_package_declares_visual_and_a11y_quality_gates(self):
        package = json.loads((UI / "package.json").read_text(encoding="utf-8"))
        scripts = package["scripts"]
        dev_dependencies = package["devDependencies"]

        self.assertEqual(scripts.get("test:visual"), "playwright test --config playwright.config.js tests/visual")
        self.assertEqual(scripts.get("test:a11y"), "playwright test --config playwright.config.js tests/a11y")
        self.assertEqual(scripts.get("test:ui-quality"), "npm run build:renderer && npm run test:visual && npm run test:a11y")
        self.assertIn("@playwright/test", dev_dependencies)
        self.assertIn("@axe-core/playwright", dev_dependencies)
        self.assertTrue((UI / "playwright.config.js").exists())
        self.assertTrue((UI / "tests" / "visual").is_dir())
        self.assertTrue((UI / "tests" / "a11y").is_dir())
        self.assertTrue((UI / "tests" / "fixtures" / "rendererMock.js").exists())

    def test_visual_tests_cover_redesigned_renderer_states_with_mock_data(self):
        visual_dir = UI / "tests" / "visual"
        visual_sources = "\n".join(
            path.read_text(encoding="utf-8")
            for path in sorted(visual_dir.glob("*.spec.js"))
        ) if visual_dir.exists() else ""

        for marker in (
            "#dashboard",
            "#settings",
            "#topology",
            "backend-unavailable",
            "installRendererMock",
            "toHaveScreenshot",
            "dashboard-command-center",
            "settings-page",
            "topology-core-map",
        ):
            self.assertIn(marker, visual_sources)

        self.assertNotIn("getBackendToken", visual_sources)
        self.assertNotIn("getBackendUrl", visual_sources)
        self.assertNotIn("Authorization", visual_sources)
        self.assertNotIn("Bearer", visual_sources)
        self.assertNotIn("127.0.0.1", visual_sources)

    def test_a11y_tests_cover_main_renderer_pages_with_axe(self):
        a11y_dir = UI / "tests" / "a11y"
        a11y_sources = "\n".join(
            path.read_text(encoding="utf-8")
            for path in sorted(a11y_dir.glob("*.spec.js"))
        ) if a11y_dir.exists() else ""

        for marker in (
            "@axe-core/playwright",
            "AxeBuilder",
            "#dashboard",
            "#settings",
            "#topology",
            "installRendererMock",
            "violations",
        ):
            self.assertIn(marker, a11y_sources)

        self.assertNotIn("getBackendToken", a11y_sources)
        self.assertNotIn("getBackendUrl", a11y_sources)
        self.assertNotIn("Authorization", a11y_sources)
        self.assertNotIn("Bearer", a11y_sources)
        self.assertNotIn("127.0.0.1", a11y_sources)

    def test_layout_has_sidebar_navigation_and_three_placeholder_pages(self):
        app = (SRC / "App.jsx").read_text(encoding="utf-8")

        self.assertIn("Dashboard", app)
        self.assertIn("Settings", app)
        self.assertIn("Topology", app)
        self.assertIn("SideNav", app)
        self.assertIn("useLiveSnapshot", app)
        self.assertIn("placeholder", app.lower())

    def test_renderer_is_split_into_pages_components_constants_and_utils(self):
        expected_files = (
            "constants/navigation.js",
            "constants/processes.js",
            "constants/settings.js",
            "constants/topology.js",
            "components/ErrorBoundary.jsx",
            "components/KpiCell.jsx",
            "components/PageHeading.jsx",
            "components/StatusTag.jsx",
            "pages/Dashboard.jsx",
            "pages/Placeholder.jsx",
            "pages/Settings.jsx",
            "pages/Topology.jsx",
            "utils/appSettings.js",
            "utils/config.js",
            "utils/format.js",
            "utils/lifecycle.js",
            "utils/topology.js",
        )
        for relative_path in expected_files:
            with self.subTest(path=relative_path):
                self.assertTrue((SRC / relative_path).exists(), f"{relative_path} is missing")

        app = (SRC / "App.jsx").read_text(encoding="utf-8")
        self.assertLess(len(app.splitlines()), 180)
        for component_name in ("DashboardPage", "SettingsPage", "TopologyPage", "ProcessTable", "ConfigField"):
            self.assertNotIn(f"function {component_name}", app)
        self.assertIn("from './pages/Dashboard.jsx'", app)
        self.assertIn("from './pages/Settings.jsx'", app)
        self.assertIn("from './pages/Topology.jsx'", app)
        self.assertIn("from './components/ErrorBoundary.jsx'", app)

    def test_shared_ui_design_foundation_exists(self):
        expected_files = (
            "styles/tokens.css",
            "components/layout/PageHeader.jsx",
            "components/layout/SectionGrid.jsx",
            "components/cards/MetricCard.jsx",
            "components/cards/ActionPanel.jsx",
            "components/status/StatusPill.jsx",
            "components/states/EmptyState.jsx",
            "components/states/ErrorState.jsx",
        )
        for relative_path in expected_files:
            with self.subTest(path=relative_path):
                self.assertTrue((SRC / relative_path).exists(), f"{relative_path} is missing")

    def test_design_tokens_define_surfaces_spacing_type_and_status_colors(self):
        tokens = (SRC / "styles" / "tokens.css").read_text(encoding="utf-8")

        for token in (
            "--eii-color-bg",
            "--eii-color-surface",
            "--eii-color-surface-raised",
            "--eii-color-border",
            "--eii-color-accent",
            "--eii-color-success",
            "--eii-color-warning",
            "--eii-color-danger",
            "--eii-color-info",
            "--eii-font-ui",
            "--eii-font-mono",
            "--eii-space-1",
            "--eii-space-2",
            "--eii-space-3",
            "--eii-space-4",
            "--eii-space-5",
            "--eii-space-6",
            "--eii-radius-sm",
            "--eii-radius-md",
        ):
            self.assertIn(token, tokens)

    def test_shared_primitives_are_presentational_and_token_based(self):
        component_paths = (
            SRC / "components" / "layout" / "PageHeader.jsx",
            SRC / "components" / "layout" / "SectionGrid.jsx",
            SRC / "components" / "cards" / "MetricCard.jsx",
            SRC / "components" / "cards" / "ActionPanel.jsx",
            SRC / "components" / "status" / "StatusPill.jsx",
            SRC / "components" / "states" / "EmptyState.jsx",
            SRC / "components" / "states" / "ErrorState.jsx",
        )

        for path in component_paths:
            with self.subTest(path=path.name):
                source = path.read_text(encoding="utf-8")
                self.assertNotIn("requestJson", source)
                self.assertNotIn("window.isolator", source)
                self.assertNotIn("fetch(", source)

        status_pill = (SRC / "components" / "status" / "StatusPill.jsx").read_text(encoding="utf-8")
        for tone in ("neutral", "connected", "success", "warning", "danger", "inactive"):
            self.assertIn(tone, status_pill)

        metric_card = (SRC / "components" / "cards" / "MetricCard.jsx").read_text(encoding="utf-8")
        self.assertIn("metric-card", metric_card)
        self.assertIn("metric-card-value", metric_card)

    def test_existing_low_risk_wrappers_use_shared_primitives(self):
        page_heading = (SRC / "components" / "PageHeading.jsx").read_text(encoding="utf-8")
        status_tag = (SRC / "components" / "StatusTag.jsx").read_text(encoding="utf-8")
        kpi_cell = (SRC / "components" / "KpiCell.jsx").read_text(encoding="utf-8")
        main = (SRC / "main.jsx").read_text(encoding="utf-8")

        self.assertIn("./layout/PageHeader.jsx", page_heading)
        self.assertIn("./status/StatusPill.jsx", status_tag)
        self.assertIn("./cards/MetricCard.jsx", kpi_cell)
        self.assertIn("./styles/tokens.css", main)

    def test_dashboard_has_live_kpi_status_panel_and_quick_actions(self):
        dashboard = (SRC / "pages" / "Dashboard.jsx").read_text(encoding="utf-8")
        lifecycle = (SRC / "utils" / "lifecycle.js").read_text(encoding="utf-8")

        self.assertIn("function DashboardPage", dashboard)
        self.assertIn("dashboard-command-center", dashboard)
        self.assertIn("Game mode", dashboard)
        self.assertIn("Admin", dashboard)
        self.assertIn("Power Plan", dashboard)
        self.assertIn("Timer", dashboard)
        self.assertIn("CPU Partitions", dashboard)
        self.assertIn("Capability Notes", dashboard)
        self.assertIn("Start", dashboard)
        self.assertIn("Stop", dashboard)
        self.assertIn("Restore", dashboard)
        self.assertIn("postLifecycleAction", dashboard)
        self.assertIn("requestJson", lifecycle)
        self.assertNotIn("CPU/RAM", dashboard)

    def test_dashboard_is_status_first_command_center(self):
        dashboard = (SRC / "pages" / "Dashboard.jsx").read_text(encoding="utf-8")

        for primitive in (
            "../components/cards/ActionPanel.jsx",
            "../components/layout/SectionGrid.jsx",
            "../components/status/StatusPill.jsx",
            "../components/states/EmptyState.jsx",
            "../components/states/ErrorState.jsx",
        ):
            self.assertIn(primitive, dashboard)

        for marker in (
            "dashboard-command-center",
            "dashboard-hero",
            "Dashboard command center",
            "dashboard-action-panel",
            "dashboard-primary-action",
            "dashboard-action-reason",
            "dashboard-empty-state",
            "dashboard-metric-groups",
            "Session state",
            "System readiness",
            "Optimization impact",
            "Recovery/safety",
            "dashboard-readiness-section",
            "warnings and errors",
        ):
            self.assertIn(marker, dashboard)

        self.assertNotIn("getBackendToken", dashboard)
        self.assertNotIn("getBackendUrl", dashboard)
        self.assertNotIn("Authorization", dashboard)
        self.assertNotIn("Bearer", dashboard)
        self.assertNotIn("127.0.0.1", dashboard)

    def test_dashboard_has_process_table_filters_and_columns(self):
        table = (SRC / "components" / "ProcessTable.jsx").read_text(encoding="utf-8")
        process_constants = (SRC / "constants" / "processes.js").read_text(encoding="utf-8")
        styles = (SRC / "styles.css").read_text(encoding="utf-8")

        self.assertIn("function ProcessTable", table)
        self.assertIn("process-filter-bar", table)
        self.assertIn("Search PID, name, source", table)
        for label in ("All", "Jailed", "Game", "Protected"):
            self.assertIn(label, table + process_constants)
        for column in ("PID", "Name", "Priority", "CPU Sets", "Status"):
            self.assertIn(column, table)
        self.assertIn("useMemo", table)
        self.assertIn(".process-table", styles)
        self.assertIn(".status-badge", styles)
        self.assertNotIn("setInterval", table)

    def test_settings_has_config_editor_and_app_settings(self):
        settings = (SRC / "pages" / "Settings.jsx").read_text(encoding="utf-8")
        settings_constants = (SRC / "constants" / "settings.js").read_text(encoding="utf-8")
        app_settings = (SRC / "utils" / "appSettings.js").read_text(encoding="utf-8")
        config_utils = (SRC / "utils" / "config.js").read_text(encoding="utf-8")
        styles = (SRC / "styles.css").read_text(encoding="utf-8")

        self.assertIn("function SettingsPage", settings)
        self.assertIn("/api/config/defaults", settings)
        self.assertIn("/api/config", settings)
        self.assertIn("validateConfigDraft", settings)
        for section in ("Game Detection", "Jailing", "Timing", "Protection", "Advanced", "Application"):
            self.assertIn(section, settings + settings_constants)
        for field in (
            "games",
            "auto_detect_steam_games",
            "auto_detect_epic_games",
            "steam_library_paths",
            "epic_library_paths",
            "enable_background_jailing",
            "maintenance_jail_batch_size",
            "maintenance_jail_interval_ms",
            "maintenance_jail_batch_cooldown_ms",
            "maintenance_skip_after_quiet_cycles",
            "poll_interval_active_ms",
            "poll_interval_idle_ms",
            "housekeeping_cores",
            "disable_power_scheme_switch",
            "disable_timer_resolution_tweak",
            "disable_game_priority_boost",
            "game_close_debounce_s",
            "game_exit_restore_delay_s",
            "gc_full_collect_interval_s",
            "anti_cheat_mode",
            "protected_extra",
            "log_file",
            "enable_hot_thread_tuning",
            "hot_thread_refresh_ms",
            "event_backend",
            "allow_mmcss_injection",
        ):
            self.assertIn(field, settings + settings_constants)
        for label in (
            "Launch at Windows startup",
            "Minimize to tray on start",
            "Start isolator automatically",
            "Save",
            "Reset",
            "Reload",
        ):
            self.assertIn(label, settings)
        self.assertIn("window.isolator?.getAppSettings", app_settings)
        self.assertIn("window.isolator?.updateAppSettings", app_settings)
        self.assertIn("validateConfigDraft", config_utils)
        self.assertIn(".settings-grid", styles)
        self.assertIn(".settings-field", styles)
        self.assertIn(".toggle-row", styles)

    def test_settings_is_risk_grouped_and_safety_aware(self):
        settings = (SRC / "pages" / "Settings.jsx").read_text(encoding="utf-8")
        constants = (SRC / "constants" / "settings.js").read_text(encoding="utf-8")

        for primitive in (
            "../components/cards/ActionPanel.jsx",
            "../components/layout/SectionGrid.jsx",
            "../components/status/StatusPill.jsx",
            "../components/states/EmptyState.jsx",
            "../components/states/ErrorState.jsx",
        ):
            self.assertIn(primitive, settings)

        for marker in (
            "settings-safety-overview",
            "Background jailing is opt-in",
            "Use conservative anti-cheat mode",
            "Some changes require restart",
            "settings-risk-grid",
            "settings-risk-section",
            "Game detection",
            "Safe/basic behavior",
            "Performance tuning",
            "Anti-cheat and protection",
            "Advanced background jailing",
            "App profiles / custom paths",
            "settings-risk-danger",
            "settings-restart-note",
            "No Steam or Epic library paths configured",
            "No app profiles configured",
        ):
            self.assertIn(marker, settings)

        self.assertNotIn("getBackendToken", settings)
        self.assertNotIn("getBackendUrl", settings)
        self.assertNotIn("Authorization", settings)
        self.assertNotIn("Bearer", settings)
        self.assertNotIn("127.0.0.1", settings)

        old_fields = set()
        config_sections = constants[
            constants.find("export const CONFIG_SECTIONS"):constants.find("export const FIELD_LABELS")
        ]
        for group in re.finditer(r"fields:\s*\[([^\]]*)\]", config_sections, flags=re.S):
            old_fields.update(re.findall(r"'([a-zA-Z0-9_]+)'", group.group(1)))
        grouped_fields = set()
        for group in re.finditer(r"fields:\s*\[([^\]]*)\]", settings, flags=re.S):
            grouped_fields.update(re.findall(r"'([a-zA-Z0-9_]+)'", group.group(1)))
        self.assertFalse(old_fields - grouped_fields)

    def test_settings_risk_groups_are_translated(self):
        settings = (SRC / "pages" / "Settings.jsx").read_text(encoding="utf-8")
        i18n = (SRC / "i18n.jsx").read_text(encoding="utf-8")

        for key in (
            "settings.risk.gameDetection.title",
            "settings.risk.gameDetection.detail",
            "settings.risk.gameDetection.badge",
            "settings.risk.safeBasic.title",
            "settings.risk.safeBasic.detail",
            "settings.risk.safeBasic.badge",
            "settings.risk.performance.title",
            "settings.risk.performance.detail",
            "settings.risk.performance.badge",
            "settings.risk.protection.title",
            "settings.risk.protection.detail",
            "settings.risk.protection.badge",
            "settings.risk.advancedJailing.title",
            "settings.risk.advancedJailing.detail",
            "settings.risk.advancedJailing.badge",
            "settings.risk.appProfiles.title",
            "settings.risk.appProfiles.detail",
            "settings.risk.appProfiles.badge",
        ):
            self.assertGreaterEqual(i18n.count(key), 2, key)

        concrete_settings_keys = set(re.findall(r"t\('([^']+)'", settings))
        concrete_settings_keys.update(re.findall(r't\("([^"]+)"', settings))
        for key in sorted(key for key in concrete_settings_keys if key.startswith("settings.")):
            self.assertGreaterEqual(i18n.count(key), 2, key)

    def test_settings_has_per_app_profiles_crud_editor(self):
        settings = (SRC / "pages" / "Settings.jsx").read_text(encoding="utf-8")
        config_utils = (SRC / "utils" / "config.js").read_text(encoding="utf-8")
        styles = (SRC / "styles.css").read_text(encoding="utf-8")

        self.assertIn("APP_PROFILES_RISK_GROUP", settings)
        self.assertIn("app-profiles", settings)
        self.assertIn("addProfile", settings)
        self.assertIn("removeProfile", settings)
        self.assertIn("updateProfile", settings)
        self.assertIn("Profile executable", settings)
        for label in ("Treat as game", "Never jail", "Always jail", "Priority"):
            self.assertIn(label, settings)
        self.assertIn("app_profiles", settings + config_utils)
        self.assertIn("validateAppProfilesDraft", config_utils)
        self.assertIn(".profiles-editor", styles)

    def test_first_run_wizard_applies_presets_and_tracks_completion(self):
        app = (SRC / "App.jsx").read_text(encoding="utf-8")
        constants = (SRC / "constants" / "settings.js").read_text(encoding="utf-8")
        app_settings = (SRC / "utils" / "appSettings.js").read_text(encoding="utf-8")
        wizard_path = SRC / "components" / "FirstRunWizard.jsx"
        self.assertTrue(wizard_path.exists())
        wizard = wizard_path.read_text(encoding="utf-8")
        styles = (SRC / "styles.css").read_text(encoding="utf-8")

        self.assertIn("FirstRunWizard", app)
        self.assertIn("firstRunCompleted", constants + app_settings + wizard)
        self.assertIn("CONFIG_PRESETS", constants)
        for label in ("Competitive", "Casual", "Streaming"):
            self.assertIn(label, constants + wizard)
        self.assertIn("/api/config", wizard)
        self.assertIn("saveAppSettings", wizard)
        self.assertIn("first-run-overlay", wizard)
        self.assertIn(".first-run-overlay", styles)

    def test_settings_can_apply_config_presets_after_first_run(self):
        settings = (SRC / "pages" / "Settings.jsx").read_text(encoding="utf-8")
        constants = (SRC / "constants" / "settings.js").read_text(encoding="utf-8")

        self.assertIn("Config Presets", settings)
        self.assertIn("applyPresetToDraft", settings)
        self.assertIn("CONFIG_PRESETS", settings + constants)
        for label in ("Competitive", "Casual", "Streaming"):
            self.assertIn(label, settings + constants)

    def test_settings_reset_requires_confirmation(self):
        settings = (SRC / "pages" / "Settings.jsx").read_text(encoding="utf-8")
        reset_body = settings[settings.index("const resetToDefaults = () => {"):settings.index("const saveSettings = async")]

        self.assertIn("window.confirm", reset_body)
        self.assertLess(reset_body.index("window.confirm"), reset_body.index("setDraft("))

    def test_topology_has_cpu_map_summary_and_core_details(self):
        topology = (SRC / "pages" / "Topology.jsx").read_text(encoding="utf-8")
        topology_utils = (SRC / "utils" / "topology.js").read_text(encoding="utf-8")
        styles = (SRC / "styles.css").read_text(encoding="utf-8")

        self.assertIn("function TopologyPage", topology)
        self.assertIn("/api/topology", topology)
        self.assertIn("refresh=1", topology)
        self.assertIn("groupCoresByLlc", topology)
        self.assertIn("function groupCoresByLlc", topology_utils)
        self.assertIn("selectedCore", topology)
        for label in ("CPU Map", "Total Cores", "Game", "Background", "Housekeeping", "LLC", "P-core", "E-core", "Parked"):
            self.assertIn(label, topology)
        self.assertIn("partition-game", topology)
        self.assertIn("partition-background", topology)
        self.assertIn("partition-housekeeping", topology)
        self.assertIn("core-tile", topology)
        self.assertIn(".topology-map", styles)
        self.assertIn(".llc-group", styles)
        self.assertIn(".core-tile", styles)
        self.assertIn(".core-detail-panel", styles)

    def test_topology_uses_shared_primitives_and_release_ready_states(self):
        topology = (SRC / "pages" / "Topology.jsx").read_text(encoding="utf-8")
        styles = (SRC / "styles.css").read_text(encoding="utf-8")

        for primitive in (
            "../components/cards/ActionPanel.jsx",
            "../components/cards/MetricCard.jsx",
            "../components/layout/PageHeader.jsx",
            "../components/layout/SectionGrid.jsx",
            "../components/status/StatusPill.jsx",
            "../components/states/EmptyState.jsx",
            "../components/states/ErrorState.jsx",
        ):
            self.assertIn(primitive, topology)

        for marker in (
            "topology-page-header",
            "topology-state-panel",
            "topology-summary-grid",
            "topology-legend-grid",
            "topology-legend-card",
            "topology-core-map",
            "core-tile-meta",
            "core-detail-panel",
            "core-detail-section",
            "core-detail-empty",
            "topology-loading-state",
            "topology-empty-state",
            "topology-error-state",
            "topology-selected-core",
            "Partition legend",
        ):
            self.assertIn(marker, topology + styles)

        for label in ("Game", "Background", "Housekeeping", "Unassigned"):
            self.assertIn(label, topology)

        self.assertNotIn("getBackendToken", topology)
        self.assertNotIn("getBackendUrl", topology)
        self.assertNotIn("Authorization", topology)
        self.assertNotIn("Bearer", topology)
        self.assertNotIn("127.0.0.1", topology)

    def test_topology_grids_use_responsive_css_not_inline_columns(self):
        topology = (SRC / "pages" / "Topology.jsx").read_text(encoding="utf-8")
        styles = (SRC / "styles.css").read_text(encoding="utf-8")

        self.assertNotIn('className="topology-summary-grid" columns=', topology)
        self.assertNotIn('className="topology-legend-grid" columns=', topology)
        self.assertIn(".topology-summary-grid", styles)
        self.assertIn(".topology-legend-grid", styles)
        self.assertIn("@media (max-width: 1040px)", styles)
        self.assertIn("@media (max-width: 640px)", styles)

    def test_logs_page_has_log_viewer_filters_and_game_mode_pause(self):
        app = (SRC / "App.jsx").read_text(encoding="utf-8")
        navigation = (SRC / "constants" / "navigation.js").read_text(encoding="utf-8")
        logs_path = SRC / "pages" / "Logs.jsx"
        self.assertTrue(logs_path.exists())
        logs = logs_path.read_text(encoding="utf-8")
        styles = (SRC / "styles.css").read_text(encoding="utf-8")

        self.assertIn("LogsPage", app)
        self.assertIn("from './pages/Logs.jsx'", app)
        self.assertIn("Logs", navigation)
        self.assertIn("/api/logs", logs)
        self.assertIn("setInterval", logs)
        self.assertIn("game_mode", logs)
        self.assertIn("Log refresh paused during game mode", logs)
        self.assertIn("Search logs", logs)
        self.assertIn("All categories", logs)
        for label in ("All", "INFO", "WARN", "ERROR"):
            self.assertIn(label, logs)
        self.assertIn(".logs-page", styles)
        self.assertIn(".log-table", styles)

    def test_advanced_tools_has_readonly_msi_viewer(self):
        app = (SRC / "App.jsx").read_text(encoding="utf-8")
        navigation = (SRC / "constants" / "navigation.js").read_text(encoding="utf-8")
        tools_path = SRC / "pages" / "AdvancedTools.jsx"
        self.assertTrue(tools_path.exists())
        tools = tools_path.read_text(encoding="utf-8")
        styles = (SRC / "styles.css").read_text(encoding="utf-8")

        self.assertIn("AdvancedToolsPage", app)
        self.assertIn("Advanced Tools", navigation)
        self.assertIn("Message Signaled Interrupts", tools)
        self.assertIn("/api/msi", tools)
        self.assertIn("readonly", tools.lower())
        self.assertIn("Restart required", tools)
        self.assertIn("paused during game mode", tools)
        self.assertIn("msi-table", tools)
        self.assertIn(".advanced-tools-page", styles)
        self.assertIn(".msi-table", styles)

    def test_app_has_memory_only_notification_toasts_and_history_drawer(self):
        app = (SRC / "App.jsx").read_text(encoding="utf-8")
        hook_path = SRC / "hooks" / "useLiveSnapshot.js"
        center_path = SRC / "components" / "NotificationCenter.jsx"
        self.assertTrue(center_path.exists())
        hook = hook_path.read_text(encoding="utf-8")
        center = center_path.read_text(encoding="utf-8")
        settings = (SRC / "pages" / "Settings.jsx").read_text(encoding="utf-8")
        app_settings = (SRC / "constants" / "settings.js").read_text(encoding="utf-8")
        styles = (SRC / "styles.css").read_text(encoding="utf-8")

        self.assertIn("NotificationCenter", app)
        self.assertIn("eventName === 'notification'", hook)
        self.assertIn("malformed notification frame", hook)
        self.assertIn("notifications", hook)
        self.assertIn("notification-history-drawer", center)
        self.assertIn("notification-toast-stack", center)
        self.assertIn("suppress_in_game_mode", center)
        self.assertIn("Notifications", settings)
        self.assertIn("Show notification toasts", settings)
        self.assertIn("notificationToastsEnabled", app_settings)
        self.assertIn(".notification-toast-stack", styles)
        self.assertIn(".notification-history-drawer", styles)

    def test_dashboard_has_system_analysis_widget(self):
        app = (SRC / "App.jsx").read_text(encoding="utf-8")
        dashboard = (SRC / "pages" / "Dashboard.jsx").read_text(encoding="utf-8")
        analysis_path = SRC / "components" / "SystemAnalysis.jsx"
        self.assertTrue(analysis_path.exists())
        analysis = analysis_path.read_text(encoding="utf-8")
        styles = (SRC / "styles.css").read_text(encoding="utf-8")

        self.assertIn("SystemAnalysis", app)
        self.assertIn("from './components/SystemAnalysis.jsx'", app)
        self.assertIn("Analysis", dashboard)
        self.assertIn("/api/analysis", analysis)
        self.assertIn("Optimization Score", analysis)
        self.assertIn("Boost Potential", analysis)
        self.assertIn("CPU isolation", analysis)
        self.assertIn("GPU bottleneck", analysis)
        self.assertIn("game_mode", analysis)
        self.assertIn("paused", analysis)
        self.assertIn(".analysis-panel", styles)
        self.assertIn(".analysis-score", styles)

    def test_dashboard_has_game_readiness_checklist_widget(self):
        dashboard = (SRC / "pages" / "Dashboard.jsx").read_text(encoding="utf-8")
        readiness_path = SRC / "components" / "ReadinessChecklist.jsx"
        self.assertTrue(readiness_path.exists())
        readiness = readiness_path.read_text(encoding="utf-8")
        styles = (SRC / "styles.css").read_text(encoding="utf-8")

        self.assertIn("ReadinessChecklist", dashboard)
        self.assertIn("/api/readiness", readiness)
        self.assertIn("Game Readiness", readiness)
        self.assertIn("paused during game mode", readiness)
        for label in ("Power plan", "Timer resolution", "Background jailing", "IFEO priority"):
            self.assertIn(label, readiness)
        self.assertIn(".readiness-panel", styles)
        self.assertIn(".readiness-check", styles)

    def test_app_wraps_main_content_in_error_boundary(self):
        app = (SRC / "App.jsx").read_text(encoding="utf-8")
        boundary = (SRC / "components" / "ErrorBoundary.jsx").read_text(encoding="utf-8")

        self.assertIn("class ErrorBoundary", boundary)
        self.assertIn("componentDidCatch", boundary)
        self.assertIn("Something went wrong", boundary)
        self.assertIn("window.location.reload()", boundary)
        self.assertIn("<ErrorBoundary>", app)
        self.assertIn("</ErrorBoundary>", app)

    def test_live_hook_uses_lazy_sse_only_when_visible(self):
        hook = (SRC / "hooks" / "useLiveSnapshot.js").read_text(encoding="utf-8")

        self.assertIn("window.isolator?.startLiveSnapshot", hook)
        self.assertIn("window.isolator?.stopLiveSnapshot", hook)
        self.assertIn("window.isolator?.onLiveSnapshot", hook)
        self.assertIn("document.visibilityState === 'visible'", hook)
        self.assertIn("visibilitychange", hook)
        self.assertNotIn("fetch(", hook)
        self.assertNotIn("/api/live", hook)
        self.assertNotIn("Authorization", hook)
        self.assertNotIn("resolveBackendUrl", hook)
        self.assertNotIn("resolveBackendToken", hook)
        self.assertNotIn("setInterval", hook)
        self.assertNotIn("/api/status", hook)

    def test_config_validation_rejects_blank_numeric_fields(self):
        config_utils = (SRC / "utils" / "config.js").read_text(encoding="utf-8")

        self.assertIn("is required", config_utils)
        self.assertIn("if (!text)", config_utils)
        self.assertNotIn("Number(String(value).trim())", config_utils)

    def test_backend_requests_use_preload_proxy_without_renderer_secrets(self):
        app = (SRC / "App.jsx").read_text(encoding="utf-8")
        hook = (SRC / "hooks" / "useLiveSnapshot.js").read_text(encoding="utf-8")
        settings = (SRC / "pages" / "Settings.jsx").read_text(encoding="utf-8")
        topology = (SRC / "pages" / "Topology.jsx").read_text(encoding="utf-8")
        api_path = SRC / "utils" / "api.js"
        self.assertTrue(api_path.exists())
        api = api_path.read_text(encoding="utf-8")

        self.assertIn("export async function requestJson", api)
        self.assertIn("window.isolator?.backendRequest", api)
        self.assertIn("function operationForRequest", api)
        self.assertIn("backend proxy is unavailable", api)
        self.assertNotIn("fetch(", api)
        self.assertNotIn("DEFAULT_BACKEND_URL", api)
        self.assertNotIn("VITE_API_BASE_URL", api)
        self.assertNotIn("getBackendUrl", api)
        self.assertNotIn("getBackendToken", api)
        self.assertNotIn("VITE_API_TOKEN", api)
        self.assertNotIn("Authorization", api)
        self.assertNotIn("Bearer", api)
        self.assertNotIn("resolveBackendUrl", app)
        self.assertNotIn("resolveBackendUrl", hook)
        self.assertNotIn("resolveBackendToken", hook)
        self.assertNotIn("from '../utils/api.js'", hook)
        self.assertIn("from '../utils/api.js'", settings)
        self.assertIn("from '../utils/api.js'", topology)

    def test_english_analysis_points_are_not_russian(self):
        i18n = (SRC / "i18n.jsx").read_text(encoding="utf-8")
        english_block = i18n[:i18n.index("  ru: {")]

        self.assertIn("'analysis.points': '{{points}} points'", english_block)
        self.assertNotIn("\u043e\u0447\u043a\u043e\u0432", english_block)

    def test_styles_reuse_benchmark_hud_tokens(self):
        styles = (SRC / "styles.css").read_text(encoding="utf-8")

        for token in ("#00D4AA", "#0A0A0A", "#111316", "#1E2328", "JetBrains Mono", "Inter"):
            self.assertIn(token, styles)
        self.assertIn("--eii-accent", styles)
        self.assertIn("Open-source clean pass", styles)
        self.assertIn(".kpi-cell", styles)
        self.assertIn("grid-template-columns: repeat(3", styles)

    def test_public_text_has_no_mojibake_artifacts(self):
        checked_files = (
            ROOT / "README.md",
            ROOT / "BUILDING.md",
            ROOT / "CONTRIBUTING.md",
            ROOT / "SECURITY.md",
            SRC / "i18n.jsx",
        )
        mojibake_markers = (
            "\u00d0",
            "\u00d1",
            "\u00e2\u20ac\u201d",
            "\u00e2\u20ac\u201c",
            "\u00e2\u201d",
        )

        for path in checked_files:
            with self.subTest(path=path.name):
                text = path.read_text(encoding="utf-8")
                for marker in mojibake_markers:
                    self.assertNotIn(marker, text)

    def test_frontend_and_tests_have_no_hidden_control_characters(self):
        allowed = {"\n", "\r", "\t"}
        hits = []
        for root in (SRC, ROOT / "tests"):
            for path in root.rglob("*"):
                if path.suffix.lower() not in {".css", ".js", ".jsx", ".ts", ".tsx", ".py"}:
                    continue
                text = path.read_text(encoding="utf-8", errors="ignore")
                for line_no, line in enumerate(text.splitlines(True), 1):
                    for col_no, char in enumerate(line, 1):
                        if unicodedata.category(char) in {"Cf", "Cc"} and char not in allowed:
                            hits.append((str(path.relative_to(ROOT)), line_no, col_no, f"U+{ord(char):04X}"))
        self.assertEqual([], hits)

    def test_react_frontend_contract_source_is_ascii(self):
        text = Path(__file__).read_text(encoding="utf-8")
        non_ascii = [
            (line_no, col_no, f"U+{ord(char):04X}")
            for line_no, line in enumerate(text.splitlines(), 1)
            for col_no, char in enumerate(line, 1)
            if ord(char) > 127
        ]
        self.assertEqual([], non_ascii)

    def test_repository_has_oss_launch_hygiene_files(self):
        expected_files = (
            ROOT / "docs" / "oss-launch-checklist.md",
            ROOT / "docs" / "release-readiness.md",
            ROOT / "docs" / "release-notes-template.md",
            ROOT / "docs" / "post-release-validation.md",
            ROOT / "scripts" / "release-check.ps1",
            ROOT / "scripts" / "release-manifest.ps1",
            ROOT / ".github" / "ISSUE_TEMPLATE" / "bug_report.yml",
            ROOT / ".github" / "ISSUE_TEMPLATE" / "benchmark_report.md",
            ROOT / ".github" / "pull_request_template.md",
        )
        for path in expected_files:
            with self.subTest(path=path):
                self.assertTrue(path.exists(), f"{path} is missing")

        launch = (ROOT / "docs" / "oss-launch-checklist.md").read_text(encoding="utf-8")
        self.assertIn("Do not buy stars", launch)
        self.assertIn("Codex for OSS", launch)

        readiness = (ROOT / "docs" / "release-readiness.md").read_text(encoding="utf-8")
        self.assertIn("Hypotheses and Tests", readiness)
        self.assertIn("Production Go / No-Go", readiness)
        self.assertIn("docs/post-release-validation.md", readiness)

        release_check = (ROOT / "scripts" / "release-check.ps1").read_text(encoding="utf-8")
        for command in (
            "python -m unittest discover",
            "python best_isolator.py --dry-run",
            "npm --prefix ui audit",
            "npm --prefix ui run smoke",
            "npm --prefix ui run build",
            "npm --prefix ui run clean:packaged",
            "scripts/release-manifest.ps1",
            "git check-ignore",
            "Remove-PackageOutputItem $packageOutput $item",
            "npm --prefix ui run verify:installed-artifacts",
        ):
            self.assertIn(command, release_check)

        manifest_script = (ROOT / "scripts" / "release-manifest.ps1").read_text(encoding="utf-8")
        self.assertIn("Get-FileHash -Algorithm SHA256", manifest_script)
        self.assertIn("SHA256SUMS.txt", manifest_script)

        release_notes = (ROOT / "docs" / "release-notes-template.md").read_text(encoding="utf-8")
        self.assertIn("SHA256SUMS.txt", release_notes)
        self.assertIn("not code-signed", release_notes)

    def test_post_release_validation_documents_public_download_checks(self):
        validation = (ROOT / "docs" / "post-release-validation.md").read_text(encoding="utf-8")
        readme = (ROOT / "README.md").read_text(encoding="utf-8")
        bug_report = (ROOT / ".github" / "ISSUE_TEMPLATE" / "bug_report.yml").read_text(encoding="utf-8")
        compatibility_report = (
            ROOT / ".github" / "ISSUE_TEMPLATE" / "compatibility_report.yml"
        ).read_text(encoding="utf-8")

        for required in (
            "https://github.com/chezzof/ultraisolator/releases/tag/v1.1.1",
            "Esports.Isolator.PRO.Setup.1.1.1.exe",
            "Esports-Isolator-PRO-1.1.1-portable.exe",
            "SHA256SUMS.txt",
            "GitHub Release downloads",
            "Silent installer evidence",
            "cleanup-install-root-exists=False",
            "Manual Fresh-User First-Run Matrix",
            "Administrator",
            "asInvoker",
            "requireAdministrator",
            "direct-createprocess-error=740",
            "SmartScreen",
            "EII_PYTHON",
            "Support and Debug Report Path",
        ):
            self.assertIn(required, validation)

        self.assertIn("docs/post-release-validation.md", readme)
        self.assertIn("id: release-artifact", bug_report)
        self.assertIn("id: release-artifact", compatibility_report)
        self.assertIn("EII_PYTHON", bug_report)
        self.assertIn("EII_PYTHON", compatibility_report)


if __name__ == "__main__":
    unittest.main()
