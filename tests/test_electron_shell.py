import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
UI = ROOT / "ui"


class ElectronShellContractTests(unittest.TestCase):
    def test_package_declares_electron_entry_and_scripts(self):
        package = json.loads((UI / "package.json").read_text(encoding="utf-8"))

        self.assertEqual("electron-main.js", package["main"])
        self.assertEqual("electron .", package["scripts"]["start"])
        self.assertIn("electron", package["devDependencies"])
        self.assertIn("react", package["dependencies"])
        self.assertIn("backend-runtime.js", package["build"]["files"])
        for group_name in ("dependencies", "devDependencies"):
            for name, version in package[group_name].items():
                self.assertNotRegex(version, r"^[~^>=<*]", f"{name} should be pinned")

    def test_main_spawns_python_api_server_and_hides_window_to_tray(self):
        main = (UI / "electron-main.js").read_text(encoding="utf-8")

        self.assertIn("spawn(pythonCommand", main)
        self.assertIn("'-m', 'server'", main)
        self.assertIn("'--api-token'", main)
        self.assertIn("show: false", main)
        self.assertIn("event.preventDefault()", main)
        self.assertIn("mainWindow.hide()", main)
        self.assertIn("rendererLoaded", main)
        self.assertIn("ensureRendererLoaded", main)
        self.assertIn("await ensureRendererLoaded()", main)
        self.assertIn("new Tray", main)
        self.assertIn("Open Dashboard", main)
        self.assertIn("Start Isolator", main)
        self.assertIn("Stop Isolator", main)
        self.assertIn("Exit", main)
        self.assertIn("globalShortcut.register('CommandOrControl+Q'", main)
        self.assertIn("gracefulShutdownBackend", main)
        self.assertIn("/api/stop", main)
        self.assertIn("--api-token", main)
        self.assertIn("backendApiToken", main)
        self.assertIn("Authorization: `Bearer ${backendApiToken}`", main)
        self.assertIn("app.disableHardwareAcceleration()", main)
        self.assertIn("EII_BACKEND_LOG_STDIO", main)
        self.assertIn("const backendStdio", main)
        self.assertIn("stdio: backendStdio", main)
        self.assertNotIn("stdio: ['ignore', 'pipe', 'pipe']", main)
        self.assertIn("startTrayStatusPolling", main)
        self.assertIn("setInterval(refreshStatusOnce, 15000)", main)
        smoke = (UI / "scripts" / "smoke-test.js").read_text(encoding="utf-8")
        self.assertIn("--api-token", smoke)
        self.assertIn("Authorization: `Bearer ${apiToken}`", smoke)

    def test_packaged_backend_stderr_is_logged_to_user_data(self):
        runtime = (UI / "backend-runtime.js").read_text(encoding="utf-8")
        main = (UI / "electron-main.js").read_text(encoding="utf-8")

        self.assertIn("backend.log", runtime)
        self.assertIn("app.getPath('userData')", runtime)
        self.assertIn("fs.createWriteStream", runtime)
        self.assertIn("backendLogStream = createBackendLogStream(app)", main)
        self.assertIn("app.isPackaged ? ['ignore', 'ignore', 'pipe']", main)
        self.assertIn("backendProcess.stderr.pipe", main)

    def test_backend_runtime_module_owns_python_preflight_and_logs(self):
        runtime = (UI / "backend-runtime.js").read_text(encoding="utf-8")
        main = (UI / "electron-main.js").read_text(encoding="utf-8")

        self.assertIn("function backendRoot", runtime)
        self.assertIn("function backendConfigPath", runtime)
        self.assertIn("function resolvePythonCommand", runtime)
        self.assertIn("function createBackendLogStream", runtime)
        self.assertIn("function appendBackendStartupLog", runtime)
        self.assertIn("function closeBackendLogStream", runtime)
        self.assertIn("function runPythonProbe", runtime)
        self.assertIn("async function preflightPythonRuntime", runtime)
        self.assertIn("--version", runtime)
        self.assertIn("import psutil", runtime)
        self.assertIn("Python 3.12 or newer", runtime)
        self.assertIn("module.exports", runtime)

        self.assertIn("require('./backend-runtime')", main)
        self.assertNotIn("function runPythonProbe", main)
        self.assertNotIn("async function preflightPythonRuntime", main)
        self.assertIn("await preflightPythonRuntime(app, PROJECT_ROOT, pythonCommand)", main)

    def test_main_records_backend_startup_error_for_renderer_fallback(self):
        main = (UI / "electron-main.js").read_text(encoding="utf-8")

        self.assertIn("let backendStartupError = null", main)
        self.assertIn("backendStartupError = error instanceof Error ? error.message : String(error)", main)
        self.assertIn("appendBackendStartupLog(app, backendStartupError)", main)
        self.assertIn("backendStartupError", main[main.index("function rendererUrl"):])
        self.assertIn("Startup safety check failed", main)

    def test_preload_exposes_minimal_ipc_api(self):
        preload = (UI / "electron-preload.js").read_text(encoding="utf-8")

        self.assertIn("contextBridge.exposeInMainWorld('isolator'", preload)
        self.assertIn("getBackendUrl", preload)
        self.assertIn("windowMinimize", preload)
        self.assertIn("windowCloseToTray", preload)
        self.assertIn("showWindow", preload)
        self.assertIn("getAppSettings", preload)
        self.assertIn("updateAppSettings", preload)
        self.assertNotIn("ipcRenderer.send(", preload)

    def test_electron_renderer_is_sandboxed(self):
        main = (UI / "electron-main.js").read_text(encoding="utf-8")

        self.assertIn("sandbox: true", main)
        self.assertNotIn("sandbox: false", main)

    def test_main_persists_app_settings_and_login_item(self):
        main = (UI / "electron-main.js").read_text(encoding="utf-8")

        self.assertIn("DEFAULT_APP_SETTINGS", main)
        self.assertIn("app.getLoginItemSettings", main)
        self.assertIn("app.setLoginItemSettings", main)
        self.assertIn("app-settings.json", main)
        self.assertIn("app-settings:get", main)
        self.assertIn("app-settings:update", main)
        self.assertIn("startIsolatorAutomatically", main)
        self.assertIn("minimizeToTrayOnStart", main)
        self.assertIn("ipcHandlersRegistered", main)
        self.assertIn("if (appSettings.minimizeToTrayOnStart)", main)
        self.assertIn("firstRunCompleted", main)

    def test_package_declares_windows_builder_targets_and_backend_resources(self):
        package = json.loads((UI / "package.json").read_text(encoding="utf-8"))

        self.assertEqual("npm run clean:packaged && npm run build:renderer && npm run build:assets && npm run build:backend-manifest && electron-builder --win nsis portable && node scripts/harden-packaged-backend-acl.js dist-packaged/win-unpacked", package["scripts"]["build"])
        self.assertEqual("node scripts/generate-assets.js", package["scripts"]["build:assets"])
        self.assertEqual("node scripts/generate-backend-manifest.js", package["scripts"]["build:backend-manifest"])
        self.assertEqual("node scripts/verify-packaged-runtime.js", package["scripts"]["verify:packaged-runtime"])
        self.assertIn("electron-builder", package["devDependencies"])
        self.assertNotRegex(package["devDependencies"]["electron-builder"], r"^[~^>=<*]")

        build = package["build"]
        self.assertEqual("com.esportsisolator.pro", build["appId"])
        self.assertEqual("Esports Isolator PRO", build["productName"])
        self.assertEqual("assets/icon.ico", build["win"]["icon"])
        self.assertEqual("requireAdministrator", build["win"]["requestedExecutionLevel"])
        self.assertIn("nsis", build["win"]["target"])
        self.assertIn("portable", build["win"]["target"])
        self.assertEqual("dist-packaged", build["directories"]["output"])
        resource_targets = {entry["to"] for entry in build["extraResources"]}
        self.assertIn("backend/server", resource_targets)
        self.assertIn("backend/isolator", resource_targets)
        self.assertIn("backend/requirements.txt", resource_targets)

    def test_main_uses_packaged_backend_resources_and_static_tray_icons(self):
        runtime = (UI / "backend-runtime.js").read_text(encoding="utf-8")
        main = (UI / "electron-main.js").read_text(encoding="utf-8")

        self.assertIn("app.isPackaged", runtime)
        self.assertIn("process.resourcesPath", runtime)
        self.assertIn("function backendRoot", runtime)
        self.assertIn("function backendConfigPath", runtime)
        self.assertIn("backendRoot(app, PROJECT_ROOT)", main)
        self.assertIn("backendConfigPath(app, PROJECT_ROOT)", main)
        self.assertIn("!app.isPackaged && process.env.EII_RENDERER_URL", main)
        self.assertIn("verifyBackendResourceIntegrity", main)
        self.assertIn("resolvePackagedPythonCommand", main)
        self.assertIn("setWindowOpenHandler", main)
        self.assertIn("assets/tray-${state}.ico", main)
        self.assertIn("assets/icon.ico", main)

    def test_packaging_assets_and_build_docs_exist(self):
        required_assets = [
            "icon.ico",
            "icon.png",
            "installer.png",
            "splash-logo.png",
            "logo.svg",
            "tray-idle.svg",
            "tray-game.svg",
            "tray-error.svg",
            "tray-idle.ico",
            "tray-game.ico",
            "tray-error.ico",
            "tray-idle-16.png",
            "tray-idle-32.png",
            "tray-game-16.png",
            "tray-game-32.png",
            "tray-error-16.png",
            "tray-error-32.png",
        ]
        for asset_name in required_assets:
            with self.subTest(asset=asset_name):
                asset = UI / "assets" / asset_name
                self.assertTrue(asset.exists(), f"{asset_name} is missing")
                self.assertGreater(asset.stat().st_size, 0, f"{asset_name} is empty")

        docs = (ROOT / "BUILDING.md").read_text(encoding="utf-8")
        self.assertIn("npm run build", docs)
        self.assertIn("Python 3.12", docs)
        self.assertIn("psutil", docs)
        self.assertIn("allowlisted protected install root", docs)
        self.assertIn("NSIS", docs)
        self.assertIn("portable", docs)
        self.assertIn("Auto-updater", docs)

    def test_dev_workflow_and_smoke_scripts_are_declared(self):
        package = json.loads((UI / "package.json").read_text(encoding="utf-8"))

        self.assertEqual("node scripts/dev-runner.js", package["scripts"]["dev"])
        self.assertEqual("node scripts/smoke-test.js", package["scripts"]["smoke"])
        self.assertIn("vite --host 127.0.0.1", package["scripts"]["dev:renderer"])

        dev_runner = (UI / "scripts" / "dev-runner.js").read_text(encoding="utf-8")
        self.assertIn("EII_RENDERER_URL", dev_runner)
        self.assertIn("EII_BACKEND_LOG_STDIO", dev_runner)
        self.assertIn("waitForHttp", dev_runner)
        self.assertIn("'vite', 'bin', 'vite.js'", dev_runner)
        self.assertIn("electron", dev_runner)
        self.assertIn("shutdown", dev_runner)
        self.assertIn("taskkill", dev_runner)
        self.assertNotIn("&& !child.killed", dev_runner)

        smoke = (UI / "scripts" / "smoke-test.js").read_text(encoding="utf-8")
        self.assertIn("python", smoke)
        self.assertIn("-m", smoke)
        self.assertIn("server", smoke)
        self.assertIn("/api/status", smoke)
        self.assertIn("/api/config/defaults", smoke)
        self.assertIn("authorized === false", smoke)
        self.assertIn("invalid JSON", smoke)
        self.assertIn("dist asset is missing", smoke)
        self.assertIn("/api/topology?refresh=1", smoke)
        self.assertIn("dist/index.html", smoke)

    def test_electron_handles_process_signals_with_graceful_shutdown(self):
        main = (UI / "electron-main.js").read_text(encoding="utf-8")

        self.assertIn("process.on('SIGINT'", main)
        self.assertIn("process.on('SIGTERM'", main)
        self.assertIn("quitApplication()", main)
        self.assertIn("gracefulShutdownBackend", main)

    def test_electron_uses_single_instance_lock(self):
        main = (UI / "electron-main.js").read_text(encoding="utf-8")

        self.assertIn("app.requestSingleInstanceLock()", main)
        self.assertIn("if (!singleInstanceLock)", main)
        self.assertIn("app.quit()", main)
        self.assertIn("app.on('second-instance'", main)
        self.assertIn("showMainWindow()", main)

    def test_readme_documents_ui_dev_prod_and_smoke_workflow(self):
        readme = (ROOT / "README.md").read_text(encoding="utf-8")

        self.assertIn("## Desktop UI", readme)
        self.assertIn("npm --prefix ui install", readme)
        self.assertIn("npm --prefix ui run dev", readme)
        self.assertIn("npm --prefix ui run smoke", readme)
        self.assertIn("npm --prefix ui run build", readme)
        self.assertIn("tray", readme.lower())
        self.assertIn("Python 3.12", readme)


if __name__ == "__main__":
    unittest.main()
