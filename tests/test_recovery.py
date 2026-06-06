import os
import json
import tempfile
import time
import unittest
from unittest.mock import MagicMock, patch

from isolator.app import EsportsIsolatorPro
from isolator.recovery import RecoveryMixin


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


class DummyRecoverWithMutex(RecoveryMixin):
    def __init__(self, ensure_ok=True, persistent_ok=True, jail_ok=True):
        self.ensure_ok = ensure_ok
        self.persistent_ok = persistent_ok
        self.jail_ok = jail_ok
        self.calls = []

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
            ["ensure", ("persistent", False), ("jail", False), "release"],
            recovery.calls,
        )

    def test_recover_releases_mutex_when_persistent_recovery_fails(self):
        recovery = DummyRecoverWithMutex(persistent_ok=False)

        self.assertFalse(recovery.recover())

        self.assertEqual(["ensure", ("persistent", False), "release"], recovery.calls)

    def test_recover_returns_false_when_jail_recovery_fails(self):
        recovery = DummyRecoverWithMutex(jail_ok=False)

        self.assertFalse(recovery.recover())

        self.assertEqual(["ensure", ("persistent", False), ("jail", False), "release"], recovery.calls)

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
