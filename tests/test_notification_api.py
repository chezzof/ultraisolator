import http.client
import json
import threading
import unittest

from server.bridge import IsolatorBridge
from server.http_api import create_handler, create_server


class FakeNotificationEngine:
    def __init__(self, snapshots):
        self._snapshots = list(snapshots)
        self._index = 0

    def get_runtime_status(self):
        return self._snapshots[min(self._index, len(self._snapshots) - 1)]["status"]

    def get_live_snapshot(self):
        snapshot = self._snapshots[min(self._index, len(self._snapshots) - 1)]
        self._index += 1
        return snapshot


def _snapshot(running, game_mode, jailed_count=0, power_plan_active=False, failures=0):
    return {
        "status": {
            "running": running,
            "game_mode": game_mode,
            "active_game_pids": [4242] if game_mode else [],
            "jailed_process_count": jailed_count,
            "power_plan_active": power_plan_active,
            "reported_failure_count": failures,
        },
        "process_mode": "tracked_only",
        "process_count": 0,
        "processes": [],
    }


class NotificationApiTests(unittest.TestCase):
    def _serve_bridge(self, bridge):
        server = create_server(("127.0.0.1", 0), create_handler(bridge))
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        return server, thread

    def _request_text(self, server, path):
        conn = http.client.HTTPConnection("127.0.0.1", server.server_port, timeout=2)
        try:
            conn.request("GET", path)
            response = conn.getresponse()
            text = response.read().decode("utf-8")
            return response.status, text
        finally:
            conn.close()

    def test_live_stream_emits_notification_event_for_game_mode_transition(self):
        engine = FakeNotificationEngine([
            _snapshot(True, False),
            _snapshot(True, True, jailed_count=3, power_plan_active=True),
        ])
        bridge = IsolatorBridge(engine_factory=lambda *_args: engine)
        bridge._engine = engine
        bridge.notifications_for_snapshot(bridge.live_snapshot())

        server, thread = self._serve_bridge(bridge)
        try:
            status, text = self._request_text(server, "/api/live?once=1")
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=2)

        self.assertEqual(200, status)
        self.assertIn("event: snapshot", text)
        self.assertIn("event: notification", text)
        data_line = next(line for line in text.splitlines() if line.startswith("data:") and "game_detected" in line)
        event = json.loads(data_line.removeprefix("data: "))
        self.assertEqual("game_detected", event["type"])
        self.assertEqual("info", event["severity"])
        self.assertEqual({"pids": [4242]}, event["data"])
        self.assertTrue(event["suppress_in_game_mode"])

    def test_notification_generation_is_quiet_for_initial_snapshot(self):
        bridge = IsolatorBridge()
        snapshot = _snapshot(True, False)

        self.assertEqual([], bridge.notifications_for_snapshot(snapshot))


if __name__ == "__main__":
    unittest.main()
