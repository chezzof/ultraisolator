import unittest
from unittest.mock import MagicMock, patch

from isolator.cli import main


class CliTests(unittest.TestCase):
    @patch("isolator.cli.is_process_elevated", return_value=True)
    @patch("isolator.cli.EsportsIsolatorPro")
    def test_recover_exits_zero_on_success(self, isolator_cls, _admin):
        isolator = MagicMock()
        isolator.recover.return_value = True
        isolator_cls.return_value = isolator

        code = main(["--recover"])

        self.assertEqual(0, code)
        isolator_cls.assert_called_once_with(config_path="config.json", scan_game_libraries=False)
        isolator.recover.assert_called_once()

    @patch("isolator.cli.is_process_elevated", return_value=True)
    @patch("isolator.cli.EsportsIsolatorPro")
    def test_recover_exits_one_on_failure(self, isolator_cls, _admin):
        isolator = MagicMock()
        isolator.recover.return_value = False
        isolator_cls.return_value = isolator

        code = main(["--recover"])

        self.assertEqual(1, code)

    @patch("isolator.cli.EsportsIsolatorPro")
    def test_dry_run_exits_zero_on_success(self, isolator_cls):
        isolator = MagicMock()
        isolator.dry_run.return_value = True
        isolator_cls.return_value = isolator

        code = main(["--dry-run"])

        self.assertEqual(0, code)
        isolator.dry_run.assert_called_once()

    @patch("isolator.cli.is_process_elevated", return_value=False)
    @patch("isolator.cli.EsportsIsolatorPro")
    def test_dry_run_remains_available_without_administrator(self, isolator_cls, _admin):
        isolator = MagicMock()
        isolator.dry_run.return_value = True
        isolator_cls.return_value = isolator

        code = main(["--dry-run"])

        self.assertEqual(0, code)
        isolator.dry_run.assert_called_once()

    @patch("isolator.cli.is_process_elevated", return_value=False)
    @patch("isolator.cli.EsportsIsolatorPro")
    def test_run_refuses_access_before_engine_creation_without_administrator(self, isolator_cls, _admin):
        code = main(["--benchmark"])

        self.assertEqual(5, code)
        isolator_cls.assert_not_called()

    @patch("isolator.cli.is_process_elevated", return_value=False)
    @patch("isolator.cli.EsportsIsolatorPro")
    def test_recover_refuses_access_before_engine_creation_without_administrator(self, isolator_cls, _admin):
        code = main(["--recover"])

        self.assertEqual(5, code)
        isolator_cls.assert_not_called()

    @patch("isolator.cli.is_process_elevated", return_value=False)
    @patch("isolator.cli.EsportsIsolatorPro")
    def test_recover_cannot_be_disguised_as_dry_run(self, isolator_cls, _admin):
        code = main(["--recover", "--dry-run"])

        self.assertEqual(5, code)
        isolator_cls.assert_not_called()

    @patch("isolator.cli.EsportsIsolatorPro")
    def test_log_file_is_applied(self, isolator_cls):
        isolator = MagicMock()
        isolator.dry_run.return_value = True
        isolator_cls.return_value = isolator

        main(["--dry-run", "--log-file", "session.log"])

        isolator.set_log_file.assert_called_once_with("session.log")

    @patch("isolator.cli.is_process_elevated", return_value=True)
    @patch("isolator.cli.time.sleep")
    @patch("isolator.cli.EsportsIsolatorPro")
    def test_benchmark_runs_then_shuts_down(self, isolator_cls, sleep_mock, _admin):
        isolator = MagicMock()
        isolator.run.return_value = True
        isolator_cls.return_value = isolator

        code = main(["--benchmark", "--benchmark-duration-sec", "1.5"])

        self.assertEqual(0, code)
        sleep_mock.assert_called_once_with(1.5)
        isolator.shutdown.assert_called_once()
