import unittest
from unittest import mock

from isolator.app import EsportsIsolatorPro


class GameCloseDebounceTests(unittest.TestCase):
    def test_single_miss_does_not_confirm_close(self):
        isolator = EsportsIsolatorPro(scan_game_libraries=False)
        isolator.game_close_debounce_s = 3.0

        new_games, confirmed, active, pending = isolator._process_game_pid_transitions(
            active_games={12328},
            current_game_pids=set(),
            pending_closed={},
            now=100.0,
        )

        self.assertEqual(set(), new_games)
        self.assertEqual([], confirmed)
        self.assertEqual(set(), active)
        self.assertEqual({12328: 100.0}, pending)

    def test_miss_long_enough_confirms_close(self):
        isolator = EsportsIsolatorPro(scan_game_libraries=False)
        isolator.game_close_debounce_s = 3.0

        _, _, active, pending = isolator._process_game_pid_transitions(
            {12328}, set(), {}, 100.0
        )
        new_games, confirmed, active, pending = isolator._process_game_pid_transitions(
            active, set(), pending, 104.0
        )

        self.assertEqual(set(), new_games)
        self.assertEqual([12328], confirmed)
        self.assertEqual(set(), active)
        self.assertEqual({}, pending)

    def test_reappear_before_debounce_cancels_pending(self):
        isolator = EsportsIsolatorPro(scan_game_libraries=False)
        isolator.game_close_debounce_s = 3.0

        _, _, active, pending = isolator._process_game_pid_transitions(
            {12328}, set(), {}, 100.0
        )
        new_games, confirmed, active, pending = isolator._process_game_pid_transitions(
            active, {12328}, pending, 101.0
        )

        self.assertEqual({12328}, new_games)
        self.assertEqual([], confirmed)
        self.assertEqual({12328}, active)
        self.assertEqual({}, pending)


class GameRestoreVacTests(unittest.TestCase):
    def test_restore_game_affinity_denied_logs_info(self):
        isolator = EsportsIsolatorPro(scan_game_libraries=False)
        messages = []
        isolator._log_once = lambda key, message: messages.append(message)

        with mock.patch("isolator.tuning.ctypes.get_last_error", return_value=5):
            isolator._log_restore_access_issue(12328, "cs2.exe", "optimize_game", "SetProcessAffinityMask")

        self.assertEqual(1, len(messages))
        self.assertTrue(messages[0].startswith("[INFO]"))
        self.assertIn("VAC/anti-cheat blocked", messages[0])


if __name__ == "__main__":
    unittest.main()
