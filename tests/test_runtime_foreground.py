import unittest

from isolator.app import EsportsIsolatorPro


class ForegroundDebounceTests(unittest.TestCase):
    def test_foreground_transition_due_respects_interval(self):
        isolator = EsportsIsolatorPro(
            config_path="__no_local_config__.json",
            scan_game_libraries=False,
        )
        isolator._foreground_transition_debounce_s = 0.5

        self.assertFalse(isolator._foreground_transition_due(1.0, 0.9))
        self.assertTrue(isolator._foreground_transition_due(1.0, 0.4))
        self.assertTrue(isolator._foreground_transition_due(1.0, 0.0))

    def test_rapid_fg_change_skips_second_transition_handler(self):
        isolator = EsportsIsolatorPro(
            config_path="__no_local_config__.json",
            scan_game_libraries=False,
        )
        isolator.enable_background_jailing = True
        isolator._foreground_transition_debounce_s = 0.5
        isolator._last_fg_transition_time = 100.0
        calls = []
        isolator._handle_foreground_transition = lambda *args: calls.append(args)

        now = 100.2
        if isolator._foreground_transition_due(now, isolator._last_fg_transition_time):
            isolator._handle_foreground_transition(10, 20, True)
            isolator._last_fg_transition_time = now

        self.assertEqual([], calls)
