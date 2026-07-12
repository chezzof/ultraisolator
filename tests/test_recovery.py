import os
import json
import subprocess
import tempfile
import time
import unittest
from unittest.mock import MagicMock, patch

from isolator.app import EsportsIsolatorPro
from isolator.ifeo_power import IFEO_STATE_OWNER, IFEO_STATE_VERSION, IfeoPowerMixin
from isolator import protected_state
from isolator.protected_state import write_protected_state_file
from isolator.recovery import RecoveryMixin
from isolator.winapi import HIGH_PERFORMANCE_GUID, IFEO_VALUES, make_guid


def _is_under(parent, child):
    parent = os.path.abspath(parent)
    child = os.path.abspath(child)
    try:
        return os.path.commonpath([parent, child]) == parent
    except ValueError:
        return False


def _write_test_protected_state_file(path, payload):
    with patch("isolator.protected_state.apply_protected_state_acl", return_value=True), patch(
        "isolator.protected_state.is_protected_state_path_safe", return_value=True
    ):
        return write_protected_state_file(path, payload)


class DummyRecovery(RecoveryMixin):
    def __init__(self):
        self._persistent_recovery_incomplete = False
        self._ifeo_original = {}
        self.messages = []
        self.once_keys = set()

    def _log(self, message):
        self.messages.append(message)

    def _log_once(self, key, message):
        if key in self.once_keys:
            return
        self.once_keys.add(key)
        self._log(message)

    def _load_ifeo_backups(self):
        return None

    def _restore_ifeo_priorities(self):
        return None

    def _set_power_scheme(self, guid):
        return True


class DummyIfeo(IfeoPowerMixin):
    def __init__(self):
        self._ifeo_original = {}
        self.messages = []
        self.once_keys = set()

    def _log_once(self, key, message):
        if key in self.once_keys:
            return
        self.once_keys.add(key)
        self.messages.append(message)

    def _normalize_name(self, name):
        return os.path.basename(str(name or "")).strip().lower()

    def _normalize_game_name(self, name):
        normalized = self._normalize_name(name).rstrip(". \t")
        if not normalized:
            return ""
        return normalized if normalized.endswith(".exe") else f"{normalized}.exe"


class DummyRecoverWithMutex(RecoveryMixin):
    def __init__(self, ensure_ok=True, persistent_ok=True, jail_ok=True, admin=True):
        self.ensure_ok = ensure_ok
        self.persistent_ok = persistent_ok
        self.jail_ok = jail_ok
        self.admin = admin
        self.calls = []

    def _check_admin(self):
        self.calls.append("admin")
        return self.admin

    def _log(self, message):
        self.calls.append(("log", message))

    def _ensure_single_instance(self):
        self.calls.append("ensure")
        return self.ensure_ok

    def _release_single_instance(self):
        self.calls.append("release")

    def _recover_persistent_state(self, auto=False):
        self.calls.append(("persistent", auto))
        return self.persistent_ok

    def _recover_jail_state_from_crash(self, auto=False):
        self.calls.append(("jail", auto))
        return self.jail_ok


class RecoveryStateTests(unittest.TestCase):
    def test_privileged_recovery_paths_use_app_data_not_repository_root(self):
        import isolator.winapi as winapi

        repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

        self.assertFalse(_is_under(repo_root, winapi.IFEO_BACKUP_PATH))
        self.assertFalse(_is_under(repo_root, winapi.RECOVERY_STATE_PATH))
        self.assertIn("EsportsIsolatorPRO", winapi.IFEO_BACKUP_PATH)
        self.assertIn("EsportsIsolatorPRO", winapi.RECOVERY_STATE_PATH)

    def _ifeo_snapshot(self, exe_name="cs2.exe"):
        base_path = r"SOFTWARE\Microsoft\Windows NT\CurrentVersion\Image File Execution Options"
        return {
            "version": IFEO_STATE_VERSION,
            "owner": IFEO_STATE_OWNER,
            "exe_name": exe_name,
            "exe_path": rf"{base_path}\{exe_name}",
            "perf_path": rf"{base_path}\{exe_name}\PerfOptions",
            "exe_key_exists": False,
            "perf_key_exists": False,
            "values": {value_name: {"value": None, "type": None} for value_name in IFEO_VALUES},
        }

    def test_tampered_ifeo_backup_is_rejected(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            ifeo_path = os.path.join(tmpdir, "ifeo_backup.json")
            with open(ifeo_path, "w", encoding="utf-8") as handle:
                json.dump({"cs2.exe": self._ifeo_snapshot()}, handle)

            with patch("isolator.ifeo_power.IFEO_BACKUP_PATH", ifeo_path):
                ifeo = DummyIfeo()
                ifeo._load_ifeo_backups()

            self.assertEqual({}, ifeo._ifeo_original)
            self.assertIn("rejected", " ".join(ifeo.messages).lower())

    def test_ifeo_backup_does_not_trust_serialized_registry_paths(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            ifeo_path = os.path.join(tmpdir, "ifeo_backup.json")
            snapshot = self._ifeo_snapshot("cs2.exe")
            snapshot["exe_path"] = r"SOFTWARE\Microsoft\Windows NT\CurrentVersion\Image File Execution Options\lsass.exe"
            snapshot["perf_path"] = r"SOFTWARE\Microsoft\Windows NT\CurrentVersion\Image File Execution Options\lsass.exe\PerfOptions"
            with open(ifeo_path, "w", encoding="utf-8") as handle:
                json.dump({"cs2.exe": snapshot}, handle)

            with patch("isolator.ifeo_power.IFEO_BACKUP_PATH", ifeo_path):
                ifeo = DummyIfeo()
                ifeo._load_ifeo_backups()

            self.assertEqual({}, ifeo._ifeo_original)
            self.assertIn("path", " ".join(ifeo.messages).lower())

    def test_authenticated_ifeo_backup_path_mismatch_is_rejected(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            ifeo_path = os.path.join(tmpdir, "ifeo_backup.json")
            snapshot = self._ifeo_snapshot("cs2.exe")
            snapshot["exe_path"] = r"SOFTWARE\Microsoft\Windows NT\CurrentVersion\Image File Execution Options\lsass.exe"
            snapshot["perf_path"] = r"SOFTWARE\Microsoft\Windows NT\CurrentVersion\Image File Execution Options\lsass.exe\PerfOptions"
            _write_test_protected_state_file(
                ifeo_path,
                {"version": IFEO_STATE_VERSION, "snapshots": {"cs2.exe": snapshot}},
            )

            with patch("isolator.ifeo_power.IFEO_BACKUP_PATH", ifeo_path), patch.object(
                DummyIfeo, "_is_ifeo_state_acl_safe", return_value=True
            ):
                ifeo = DummyIfeo()
                ifeo._load_ifeo_backups()

            self.assertEqual({}, ifeo._ifeo_original)
            self.assertIn("path", " ".join(ifeo.messages).lower())

    def test_authenticated_ifeo_backup_with_extra_debugger_value_is_rejected(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            ifeo_path = os.path.join(tmpdir, "ifeo_backup.json")
            snapshot = self._ifeo_snapshot("cs2.exe")
            snapshot["values"]["Debugger"] = {"value": None, "type": None}
            _write_test_protected_state_file(
                ifeo_path,
                {"version": IFEO_STATE_VERSION, "snapshots": {"cs2.exe": snapshot}},
            )

            with patch("isolator.ifeo_power.IFEO_BACKUP_PATH", ifeo_path), patch.object(
                DummyIfeo, "_is_ifeo_state_acl_safe", return_value=True
            ):
                ifeo = DummyIfeo()
                ifeo._load_ifeo_backups()

            self.assertEqual({}, ifeo._ifeo_original)
            self.assertIn("ownership", " ".join(ifeo.messages).lower())

    def test_tampered_authenticated_ifeo_hmac_is_rejected(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            ifeo_path = os.path.join(tmpdir, "ifeo_backup.json")
            _write_test_protected_state_file(
                ifeo_path,
                {"version": IFEO_STATE_VERSION, "snapshots": {"cs2.exe": self._ifeo_snapshot()}},
            )
            with open(ifeo_path, "r", encoding="utf-8") as handle:
                envelope = json.load(handle)
            envelope["payload"]["snapshots"]["cs2.exe"]["values"]["CpuPriorityClass"]["value"] = 31
            with open(ifeo_path, "w", encoding="utf-8") as handle:
                json.dump(envelope, handle)

            with patch("isolator.ifeo_power.IFEO_BACKUP_PATH", ifeo_path), patch.object(
                DummyIfeo, "_is_ifeo_state_acl_safe", return_value=True
            ):
                ifeo = DummyIfeo()
                ifeo._load_ifeo_backups()

            self.assertEqual({}, ifeo._ifeo_original)
            self.assertIn("tampered", " ".join(ifeo.messages).lower())

    def test_recovery_state_unsafe_acl_fails_closed(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            recovery_path = os.path.join(tmpdir, "recovery_state.json")
            ifeo_path = os.path.join(tmpdir, "ifeo_backup.json")
            with open(recovery_path, "w", encoding="utf-8") as handle:
                json.dump({"version": 1}, handle)

            with patch("isolator.recovery.RECOVERY_STATE_PATH", recovery_path), patch(
                "isolator.recovery.IFEO_BACKUP_PATH", ifeo_path
            ), patch.object(DummyRecovery, "_is_recovery_state_acl_safe", return_value=False, create=True):
                recovery = DummyRecovery()

                self.assertFalse(recovery._recover_persistent_state(auto=True))

            self.assertTrue(recovery._persistent_recovery_incomplete)
            self.assertIn("acl", " ".join(recovery.messages).lower())

    def test_windows_protected_state_acl_does_not_grant_current_user(self):
        calls = []

        def fake_icacls(args):
            calls.append(args)
            return subprocess.CompletedProcess(["icacls", *args], 0, "", "")

        with patch("isolator.protected_state.os.name", "nt"), patch(
            "isolator.protected_state.os.path.isdir", return_value=True
        ), patch("isolator.protected_state._is_reparse_point", return_value=False), patch(
            "isolator.protected_state._current_user_sid", return_value="S-1-5-21-1000"
        ), patch("isolator.protected_state._acl_grants_untrusted_write", return_value=False), patch(
            "isolator.protected_state._run_icacls", side_effect=fake_icacls
        ):
            self.assertTrue(protected_state.apply_protected_state_acl(r"C:\ProgramData\EsportsIsolatorPRO\Recovery"))

        grant_call = next(args for args in calls if "/grant:r" in args)
        self.assertIn("*S-1-5-18:(OI)(CI)(F)", grant_call)
        self.assertIn("*S-1-5-32-544:(OI)(CI)(F)", grant_call)
        self.assertNotIn("*S-1-5-21-1000:(OI)(CI)(F)", grant_call)
        remove_call = next(args for args in calls if "/remove:g" in args)
        self.assertIn("*S-1-5-21-1000", remove_call)

    def test_windows_protected_state_acl_tolerates_absent_removed_sid(self):
        def fake_icacls(args):
            if "/remove:g" in args:
                return subprocess.CompletedProcess(["icacls", *args], 1332, "", "No mapping between account names and security IDs was done.")
            return subprocess.CompletedProcess(["icacls", *args], 0, "", "")

        with patch("isolator.protected_state.os.name", "nt"), patch(
            "isolator.protected_state.os.path.isdir", return_value=True
        ), patch("isolator.protected_state._is_reparse_point", return_value=False), patch(
            "isolator.protected_state._current_user_sid", return_value=None
        ), patch("isolator.protected_state._acl_grants_untrusted_write", return_value=False), patch(
            "isolator.protected_state._run_icacls", side_effect=fake_icacls
        ):
            self.assertTrue(protected_state.apply_protected_state_acl(r"C:\ProgramData\EsportsIsolatorPRO\Recovery"))

    def test_windows_protected_state_rejects_writable_non_admin_sid(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            recovery_path = os.path.join(tmpdir, "recovery_state.json")
            with open(recovery_path, "w", encoding="utf-8") as handle:
                handle.write("{}")

            with patch("isolator.protected_state.os.name", "nt"), patch(
                "isolator.protected_state._is_reparse_point", return_value=False
            ), patch(
                "isolator.protected_state._acl_entries_for_path",
                return_value=[{"Sid": "S-1-5-21-1000", "Rights": 278, "Type": "Allow"}],
            ):
                self.assertFalse(protected_state.is_protected_state_path_safe(recovery_path))

    def test_recovery_state_write_uses_authenticated_atomic_envelope(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            recovery_path = os.path.join(tmpdir, "recovery_state.json")
            ifeo_path = os.path.join(tmpdir, "ifeo_backup.json")

            with patch("isolator.recovery.RECOVERY_STATE_PATH", recovery_path), patch(
                "isolator.recovery.IFEO_BACKUP_PATH", ifeo_path
            ), patch("isolator.protected_state.apply_protected_state_acl", return_value=True), patch(
                "isolator.protected_state.is_protected_state_path_safe", return_value=True
            ):
                recovery = DummyRecovery()
                self.assertTrue(recovery._save_recovery_state({"power": {"switched": False}}))

            with open(recovery_path, "r", encoding="utf-8") as handle:
                saved = json.load(handle)

            self.assertEqual(2, saved.get("version"))
            self.assertIn("payload", saved)
            self.assertIn("tag", saved)
            self.assertTrue(str(saved["tag"]).startswith("sha256:"))
            self.assertNotIn("power", saved)
            self.assertFalse(os.path.exists(recovery_path + ".tmp"))

    def test_tampered_power_recovery_state_is_rejected(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            recovery_path = os.path.join(tmpdir, "recovery_state.json")
            ifeo_path = os.path.join(tmpdir, "ifeo_backup.json")
            guid = make_guid(HIGH_PERFORMANCE_GUID)
            with open(recovery_path, "w", encoding="utf-8") as handle:
                json.dump(
                    {
                        "version": 1,
                        "power": {
                            "switched": True,
                            "original_scheme": DummyRecovery._guid_to_state(guid),
                            "scheme_in_use": "ultimate",
                        },
                    },
                    handle,
                )

            with patch("isolator.recovery.RECOVERY_STATE_PATH", recovery_path), patch(
                "isolator.recovery.IFEO_BACKUP_PATH", ifeo_path
            ):
                recovery = DummyRecovery()
                recovery._set_power_scheme = MagicMock(return_value=True)

                self.assertFalse(recovery._recover_persistent_state(auto=True))

            recovery._set_power_scheme.assert_not_called()
            self.assertTrue(recovery._persistent_recovery_incomplete)
            self.assertIn("tampered", " ".join(recovery.messages).lower())

    def test_tampered_authenticated_power_recovery_hmac_is_rejected(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            recovery_path = os.path.join(tmpdir, "recovery_state.json")
            ifeo_path = os.path.join(tmpdir, "ifeo_backup.json")
            guid = make_guid(HIGH_PERFORMANCE_GUID)
            _write_test_protected_state_file(
                recovery_path,
                {
                    "version": 2,
                    "power": {
                        "switched": True,
                        "original_scheme": DummyRecovery._guid_to_state(guid),
                        "scheme_in_use": "ultimate",
                    },
                },
            )
            with open(recovery_path, "r", encoding="utf-8") as handle:
                envelope = json.load(handle)
            envelope["payload"]["power"]["original_scheme"] = "00000000-0000-0000-0000-000000000000"
            with open(recovery_path, "w", encoding="utf-8") as handle:
                json.dump(envelope, handle)

            with patch("isolator.recovery.RECOVERY_STATE_PATH", recovery_path), patch(
                "isolator.recovery.IFEO_BACKUP_PATH", ifeo_path
            ), patch.object(DummyRecovery, "_is_recovery_state_acl_safe", return_value=True):
                recovery = DummyRecovery()
                recovery._set_power_scheme = MagicMock(return_value=True)

                self.assertFalse(recovery._recover_persistent_state(auto=True))

            recovery._set_power_scheme.assert_not_called()
            self.assertIn("tampered", " ".join(recovery.messages).lower())

    def test_authenticated_power_recovery_requires_boolean_switched_flag(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            recovery_path = os.path.join(tmpdir, "recovery_state.json")
            ifeo_path = os.path.join(tmpdir, "ifeo_backup.json")
            guid = make_guid(HIGH_PERFORMANCE_GUID)
            _write_test_protected_state_file(
                recovery_path,
                {
                    "version": 2,
                    "power": {
                        "switched": "false",
                        "original_scheme": DummyRecovery._guid_to_state(guid),
                        "scheme_in_use": "ultimate",
                    },
                },
            )

            with patch("isolator.recovery.RECOVERY_STATE_PATH", recovery_path), patch(
                "isolator.recovery.IFEO_BACKUP_PATH", ifeo_path
            ), patch.object(DummyRecovery, "_is_recovery_state_acl_safe", return_value=True):
                recovery = DummyRecovery()
                recovery._set_power_scheme = MagicMock(return_value=True)

                self.assertFalse(recovery._recover_persistent_state(auto=True))

            recovery._set_power_scheme.assert_not_called()
            self.assertIn("power recovery state is invalid", " ".join(recovery.messages).lower())

    def test_ifeo_delete_key_preserves_non_owned_values(self):
        key = MagicMock()
        key.__enter__.return_value = key
        key.__exit__.return_value = None
        with patch("isolator.ifeo_power.winreg.OpenKey", return_value=key), patch(
            "isolator.ifeo_power.winreg.QueryInfoKey", return_value=(0, 1, 0)
        ), patch("isolator.ifeo_power.winreg.DeleteKey") as delete_key:
            IfeoPowerMixin._delete_registry_key_if_empty("Software\\Example")

        delete_key.assert_not_called()

    def test_ifeo_restore_ignores_unowned_debugger_value(self):
        ifeo = DummyIfeo()
        snapshot = self._ifeo_snapshot("cs2.exe")
        snapshot["values"]["Debugger"] = {"value": None, "type": None}
        ifeo._ifeo_original = {"cs2.exe": snapshot}

        key = MagicMock()
        key.__enter__.return_value = key
        key.__exit__.return_value = None
        with patch("isolator.ifeo_power.winreg.CreateKeyEx", return_value=key), patch(
            "isolator.ifeo_power.winreg.DeleteValue"
        ) as delete_value, patch.object(DummyIfeo, "_delete_registry_key_if_empty"), patch(
            "isolator.ifeo_power.remove_protected_state_file"
        ):
            ifeo._restore_ifeo_priorities()

        deleted_values = [call.args[1] for call in delete_value.call_args_list]
        self.assertNotIn("Debugger", deleted_values)

    def test_invalid_recovery_json_fails_closed_and_preserves_file(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            recovery_path = os.path.join(tmpdir, "recovery_state.json")
            ifeo_path = os.path.join(tmpdir, "ifeo_backup.json")
            with open(recovery_path, "w", encoding="utf-8") as handle:
                handle.write("{not json")

            with patch("isolator.recovery.RECOVERY_STATE_PATH", recovery_path), patch(
                "isolator.recovery.IFEO_BACKUP_PATH", ifeo_path
            ):
                recovery = DummyRecovery()

                self.assertFalse(recovery._recover_persistent_state(auto=True))
                self.assertTrue(recovery._persistent_recovery_incomplete)
                self.assertTrue(os.path.exists(recovery_path))
                self.assertIn("invalid", " ".join(recovery.messages).lower())

    def test_non_object_recovery_json_fails_closed_and_preserves_file(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            recovery_path = os.path.join(tmpdir, "recovery_state.json")
            ifeo_path = os.path.join(tmpdir, "ifeo_backup.json")
            with open(recovery_path, "w", encoding="utf-8") as handle:
                handle.write("[]")

            with patch("isolator.recovery.RECOVERY_STATE_PATH", recovery_path), patch(
                "isolator.recovery.IFEO_BACKUP_PATH", ifeo_path
            ):
                recovery = DummyRecovery()

                self.assertFalse(recovery._recover_persistent_state(auto=True))
                self.assertTrue(recovery._persistent_recovery_incomplete)
                self.assertTrue(os.path.exists(recovery_path))

    def test_non_object_power_recovery_state_fails_closed_and_preserves_file(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            recovery_path = os.path.join(tmpdir, "recovery_state.json")
            ifeo_path = os.path.join(tmpdir, "ifeo_backup.json")
            with open(recovery_path, "w", encoding="utf-8") as handle:
                handle.write('{"power": []}')

            with patch("isolator.recovery.RECOVERY_STATE_PATH", recovery_path), patch(
                "isolator.recovery.IFEO_BACKUP_PATH", ifeo_path
            ):
                recovery = DummyRecovery()

                self.assertFalse(recovery._recover_persistent_state(auto=True))
                self.assertTrue(recovery._persistent_recovery_incomplete)
                self.assertTrue(os.path.exists(recovery_path))
                self.assertIn("power recovery state is invalid", " ".join(recovery.messages).lower())

    def test_recover_holds_single_instance_mutex_around_recovery_work(self):
        recovery = DummyRecoverWithMutex()

        self.assertTrue(recovery.recover())

        self.assertEqual(
            ["admin", "ensure", ("persistent", False), ("jail", False), "release"],
            recovery.calls,
        )

    def test_recover_releases_mutex_when_persistent_recovery_fails(self):
        recovery = DummyRecoverWithMutex(persistent_ok=False)

        self.assertFalse(recovery.recover())

        self.assertEqual(["admin", "ensure", ("persistent", False), "release"], recovery.calls)

    def test_recover_returns_false_when_jail_recovery_fails(self):
        recovery = DummyRecoverWithMutex(jail_ok=False)

        self.assertFalse(recovery.recover())

        self.assertEqual(["admin", "ensure", ("persistent", False), ("jail", False), "release"], recovery.calls)

    def test_recover_requires_administrator_before_mutex_or_recovery(self):
        recovery = DummyRecoverWithMutex(admin=False)

        self.assertFalse(recovery.recover())

        self.assertEqual(["admin", ("log", "[ERROR] administrator_required")], recovery.calls)

    def test_invalid_jail_json_fails_closed_and_preserves_file(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            jail_path = os.path.join(tmpdir, "jail_state.json")
            with open(jail_path, "w", encoding="utf-8") as handle:
                handle.write("{not json")

            isolator = EsportsIsolatorPro(
                config_path="__no_local_config__.json",
                scan_game_libraries=False,
            )
            messages = []
            isolator._log_once = lambda key, message: messages.append(message)

            with patch("isolator.recovery.JAIL_STATE_PATH", jail_path):
                self.assertFalse(isolator._recover_jail_state_from_crash(auto=True))

            self.assertTrue(os.path.exists(jail_path))
            self.assertIn("Failed to load jail state", " ".join(messages))

    def test_crash_jail_recovery_skips_when_current_create_time_unknown(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            jail_path = os.path.join(tmpdir, "jail_state.json")
            with open(jail_path, "w", encoding="utf-8") as handle:
                json.dump(
                    {
                        "pids": {
                            "4242": {
                                "name": "svchost.exe",
                                "create_time": 123,
                                "source": "jail",
                                "state": {"priority_class": 64},
                                "updated_at": time.time(),
                            }
                        }
                    },
                    handle,
                )

            isolator = EsportsIsolatorPro(
                config_path="__no_local_config__.json",
                scan_game_libraries=False,
            )
            messages = []
            restored = []
            isolator._log = messages.append
            isolator._log_once = lambda key, message: messages.append(message)
            isolator._open_process = lambda *args, **kwargs: 99
            isolator._get_process_create_time = lambda handle: 0
            isolator._restore_process = lambda pid: restored.append(pid) or True

            with patch("isolator.recovery.JAIL_STATE_PATH", jail_path):
                with patch("isolator.recovery.kernel32.CloseHandle"):
                    self.assertTrue(isolator._recover_jail_state_from_crash(auto=False))

            self.assertEqual([], restored)
            self.assertIn("create_time", " ".join(messages))
            self.assertFalse(os.path.exists(jail_path))

    def test_crash_jail_recovery_fails_closed_when_fresh_entry_cannot_open(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            jail_path = os.path.join(tmpdir, "jail_state.json")
            with open(jail_path, "w", encoding="utf-8") as handle:
                json.dump(
                    {
                        "pids": {
                            "4242": {
                                "name": "discord.exe",
                                "create_time": 123,
                                "source": "jail",
                                "state": {"priority_class": 64},
                                "updated_at": time.time(),
                            }
                        }
                    },
                    handle,
                )

            isolator = EsportsIsolatorPro(
                config_path="__no_local_config__.json",
                scan_game_libraries=False,
            )
            messages = []
            isolator._log = messages.append
            isolator._log_once = lambda key, message: messages.append(message)
            isolator._open_process = MagicMock(return_value=None)

            with patch("isolator.recovery.JAIL_STATE_PATH", jail_path):
                self.assertFalse(isolator._recover_jail_state_from_crash(auto=True))

            self.assertTrue(os.path.exists(jail_path))
            self.assertIn("cannot open", " ".join(messages).lower())

    def test_crash_jail_recovery_prunes_stale_entries_without_opening_process(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            jail_path = os.path.join(tmpdir, "jail_state.json")
            with open(jail_path, "w", encoding="utf-8") as handle:
                json.dump(
                    {
                        "pids": {
                            "4242": {
                                "name": "discord.exe",
                                "create_time": 123,
                                "source": "jail",
                                "state": {},
                                "updated_at": time.time() - (25 * 60 * 60),
                            }
                        }
                    },
                    handle,
                )

            isolator = EsportsIsolatorPro(
                config_path="__no_local_config__.json",
                scan_game_libraries=False,
            )
            messages = []
            isolator._log = messages.append
            isolator._log_once = lambda key, message: messages.append(message)
            isolator._open_process = MagicMock(return_value=99)

            with patch("isolator.recovery.JAIL_STATE_PATH", jail_path):
                self.assertTrue(isolator._recover_jail_state_from_crash(auto=False))

            isolator._open_process.assert_not_called()
            self.assertIn("stale", " ".join(messages).lower())
            self.assertFalse(os.path.exists(jail_path))


if __name__ == "__main__":
    unittest.main()
