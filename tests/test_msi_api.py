import http.client
import json
import sys
import threading
import unittest
from unittest.mock import patch

from server.http_api import create_handler, create_server
from server.msi import build_msi_payload, read_msi_devices


class MsiPayloadTests(unittest.TestCase):
    def test_payload_summarizes_readonly_msi_devices(self):
        payload = build_msi_payload(
            status={"game_mode": False},
            devices=[
                {
                    "instance_id": r"PCI\VEN_10DE&DEV_2684",
                    "name": "NVIDIA GeForce RTX",
                    "device_class": "Display",
                    "msi_enabled": True,
                    "message_limit": 1,
                },
                {
                    "instance_id": r"PCI\VEN_144D&DEV_A808",
                    "name": "Samsung NVMe Controller",
                    "device_class": "SCSIAdapter",
                    "msi_enabled": False,
                    "message_limit": None,
                },
            ],
            available=True,
            reason=None,
            cache_hit=False,
            generated_at=123.0,
        )

        self.assertTrue(payload["available"])
        self.assertTrue(payload["readonly"])
        self.assertEqual(2, payload["summary"]["total"])
        self.assertEqual(1, payload["summary"]["enabled"])
        self.assertEqual("Display", payload["devices"][0]["device_class"])

    def test_payload_pauses_in_game_mode(self):
        payload = build_msi_payload(status={"game_mode": True}, devices=[{"name": "GPU"}])

        self.assertFalse(payload["available"])
        self.assertEqual("paused_in_game_mode", payload["reason"])
        self.assertEqual([], payload["devices"])

    def test_registry_reader_skips_inaccessible_devices_and_bad_numeric_values(self):
        class Key:
            def __init__(self, name):
                self.name = name

            def __enter__(self):
                return self

            def __exit__(self, *_args):
                return False

        class FakeWinreg:
            HKEY_LOCAL_MACHINE = object()
            tree = {
                "root": ["bad_device", "good_device"],
                "good_device": ["instance0"],
            }

            @staticmethod
            def OpenKey(parent, name):
                if parent is FakeWinreg.HKEY_LOCAL_MACHINE:
                    return Key("root")
                if name == "bad_device":
                    raise PermissionError("denied")
                if getattr(parent, "name", "") == "root" and name == "good_device":
                    return Key("good_device")
                if getattr(parent, "name", "") == "good_device" and name == "instance0":
                    return Key("instance0")
                if name.endswith("MessageSignaledInterruptProperties"):
                    return Key("msi")
                raise OSError("missing")

            @staticmethod
            def EnumKey(key, index):
                values = FakeWinreg.tree.get(key.name, [])
                if index >= len(values):
                    raise OSError("done")
                return values[index]

            @staticmethod
            def QueryValueEx(key, name):
                values = {
                    ("instance0", "Class"): "Display",
                    ("instance0", "FriendlyName"): "GPU",
                    ("msi", "MSISupported"): "bad",
                    ("msi", "MessageNumberLimit"): b"\x01",
                }
                if (key.name, name) not in values:
                    raise OSError("missing")
                return values[(key.name, name)], None

        with patch("server.msi.os.name", "nt"), patch.dict(sys.modules, {"winreg": FakeWinreg}):
            available, reason, devices = read_msi_devices()

        self.assertTrue(available)
        self.assertIsNone(reason)
        self.assertEqual(1, len(devices))
        self.assertEqual("GPU", devices[0]["name"])
        self.assertIsNone(devices[0]["msi_enabled"])
        self.assertIsNone(devices[0]["message_limit"])


class MsiHttpTests(unittest.TestCase):
    def _request_json(self, server, path):
        conn = http.client.HTTPConnection("127.0.0.1", server.server_port, timeout=2)
        try:
            conn.request("GET", path)
            response = conn.getresponse()
            data = json.loads(response.read().decode("utf-8"))
            return response.status, data
        finally:
            conn.close()

    def test_msi_endpoint_uses_bridge_snapshot(self):
        class StubBridge:
            def __init__(self):
                self.refresh_values = []

            def msi_devices(self, refresh=False):
                self.refresh_values.append(refresh)
                return {
                    "ok": True,
                    "available": True,
                    "readonly": True,
                    "summary": {"total": 1, "enabled": 1, "disabled": 0},
                    "devices": [{"name": "GPU", "msi_enabled": True}],
                }

        bridge = StubBridge()
        server = create_server(("127.0.0.1", 0), create_handler(bridge))
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            status, payload = self._request_json(server, "/api/msi?refresh=1")
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=2)

        self.assertEqual(200, status)
        self.assertTrue(payload["readonly"])
        self.assertEqual([True], bridge.refresh_values)


if __name__ == "__main__":
    unittest.main()
