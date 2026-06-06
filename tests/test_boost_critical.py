import unittest
from unittest.mock import patch

from isolator.app import EsportsIsolatorPro
from isolator.winapi import HIGH_PRIORITY_CLASS


class BoostSystemCriticalTests(unittest.TestCase):
    def test_boost_system_critical_skips_pid_when_set_priority_class_fails(self):
        isolator = EsportsIsolatorPro(
            config_path="__no_local_config__.json",
            scan_game_libraries=False,
        )
        isolator._get_processes = lambda: [(42, "dwm.exe")]
        isolator._open_process = lambda *args, **kwargs: 99

        with patch("isolator.tuning.kernel32.GetPriorityClass", return_value=32):
            with patch("isolator.tuning.kernel32.SetPriorityClass", return_value=0):
                with patch("isolator.tuning.kernel32.CloseHandle"):
                    isolator._boost_system_critical()

        self.assertNotIn(42, isolator._boosted_critical)

    def test_boost_system_critical_records_original_on_success(self):
        isolator = EsportsIsolatorPro(
            config_path="__no_local_config__.json",
            scan_game_libraries=False,
        )
        isolator._get_processes = lambda: [(42, "dwm.exe")]
        isolator._open_process = lambda *args, **kwargs: 99

        with patch("isolator.tuning.kernel32.GetPriorityClass", return_value=32):
            with patch("isolator.tuning.kernel32.SetPriorityClass", return_value=1) as set_priority:
                with patch("isolator.tuning.kernel32.CloseHandle"):
                    isolator._boost_system_critical()

        set_priority.assert_called_once_with(99, HIGH_PRIORITY_CLASS)
        self.assertEqual(32, isolator._boosted_critical[42])
