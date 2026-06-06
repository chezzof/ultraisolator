import http.client
import json
import tempfile
import threading
import unittest
from pathlib import Path

from server.bridge import IsolatorBridge
from server.http_api import create_handler, create_server


class LogApiTests(unittest.TestCase):
    def _request_json(self, server, path):
        conn = http.client.HTTPConnection("127.0.0.1", server.server_port, timeout=2)
        try:
            conn.request("GET", path)
            response = conn.getresponse()
            payload = json.loads(response.read().decode("utf-8"))
            return response.status, payload
        finally:
            conn.close()

    def _serve_bridge(self, bridge):
        server = create_server(("127.0.0.1", 0), create_handler(bridge))
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        return server, thread

    def test_logs_endpoint_returns_recent_parsed_configured_log_lines(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            tmp = Path(tmpdir)
            log_path = tmp / "isolator.log"
            log_path.write_text(
                "\n".join(
                    [
                        "2026-05-20 02:00:00 [INFO] Power scheme switched to Ultimate Performance.",
                        "2026-05-20 02:00:01 [WARN] OpenProcess failed for pid=1234: access denied",
                        "2026-05-20 02:00:02 [ERROR] Shutdown step 2 failed",
                        "2026-05-20 02:00:03 [RESTORE] pid=4321 (discord.exe): priority restored",
                    ]
                )
                + "\n",
                encoding="utf-8",
            )
            config_path = tmp / "config.json"
            config_path.write_text(json.dumps({"log_file": str(log_path)}), encoding="utf-8")
            bridge = IsolatorBridge(config_path=str(config_path))
            server, thread = self._serve_bridge(bridge)
            try:
                status, payload = self._request_json(server, "/api/logs?limit=3")
            finally:
                server.shutdown()
                server.server_close()
                thread.join(timeout=2)

        self.assertEqual(200, status)
        self.assertTrue(payload["available"])
        self.assertEqual(log_path.name, payload["path"])
        self.assertNotIn(tmpdir, payload["path"])
        self.assertEqual(3, payload["limit"])
        self.assertEqual([2, 3, 4], [entry["line"] for entry in payload["entries"]])
        self.assertEqual(["warning", "error", "info"], [entry["severity"] for entry in payload["entries"]])
        self.assertEqual(["WARN", "ERROR", "RESTORE"], [entry["tag"] for entry in payload["entries"]])
        self.assertEqual("restore", payload["entries"][2]["category"])
        self.assertIn("discord.exe", payload["entries"][2]["message"])

    def test_logs_endpoint_is_available_false_when_log_file_is_not_configured(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            bridge = IsolatorBridge(config_path=str(Path(tmpdir) / "config.json"))
            server, thread = self._serve_bridge(bridge)
            try:
                status, payload = self._request_json(server, "/api/logs")
            finally:
                server.shutdown()
                server.server_close()
                thread.join(timeout=2)

        self.assertEqual(200, status)
        self.assertFalse(payload["available"])
        self.assertEqual("log_file_not_configured", payload["reason"])
        self.assertEqual([], payload["entries"])


if __name__ == "__main__":
    unittest.main()
