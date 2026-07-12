import http.client
import json
import threading
import unittest

from isolator.app import EsportsIsolatorPro
from server.bridge import IsolatorBridge
from server.http_api import create_handler, create_server


def _install_sample_topology(isolator):
    isolator._topology = {
        "cpu_sets": [
            {"id": 1, "group": 0, "logical_index": 0, "core_index": 0, "llc_index": 0, "numa_index": 0, "efficiency_class": 10, "parked": False, "allocated": False, "allocated_to_target_process": False, "realtime": False, "scheduling_class": 0, "l3_size": 32},
            {"id": 2, "group": 0, "logical_index": 1, "core_index": 0, "llc_index": 0, "numa_index": 0, "efficiency_class": 10, "parked": False, "allocated": False, "allocated_to_target_process": False, "realtime": False, "scheduling_class": 0, "l3_size": 32},
            {"id": 3, "group": 0, "logical_index": 2, "core_index": 1, "llc_index": 1, "numa_index": 0, "efficiency_class": 1, "parked": True, "allocated": False, "allocated_to_target_process": False, "realtime": False, "scheduling_class": 0, "l3_size": 16},
        ],
        "core_groups": [
            {"key": (0, 0), "group": 0, "core_index": 0, "llc_key": (0, 0), "llc_index": 0, "efficiency_class": 10, "cpu_set_ids": [1, 2], "logical_indices": [0, 1], "parked": False, "allocated": False, "realtime": False, "l3_size": 32},
            {"key": (0, 1), "group": 0, "core_index": 1, "llc_key": (0, 1), "llc_index": 1, "efficiency_class": 1, "cpu_set_ids": [3], "logical_indices": [2], "parked": True, "allocated": False, "realtime": False, "l3_size": 16},
        ],
        "llc_groups": [
            {"key": (0, 0), "group": 0, "llc_index": 0, "l3_size": 32, "core_keys": [(0, 0)], "efficiency_class": 10},
            {"key": (0, 1), "group": 0, "llc_index": 1, "l3_size": 16, "core_keys": [(0, 1)], "efficiency_class": 1},
        ],
        "heterogeneous_efficiency": True,
        "multi_llc": True,
    }
    isolator._cpu_partitions = {
        "game": [1, 2],
        "background": [3],
        "housekeeping": [],
        "game_cores": [isolator._topology["core_groups"][0]],
    }
    isolator._last_topology_refresh = 123.5


class TopologySnapshotTests(unittest.TestCase):
    def test_topology_snapshot_is_self_descriptive_for_core_map(self):
        isolator = EsportsIsolatorPro(
            config_path="__no_local_config__.json",
            scan_game_libraries=False,
        )
        _install_sample_topology(isolator)

        snapshot = isolator.get_topology_snapshot()

        self.assertTrue(snapshot["available"])
        self.assertFalse(snapshot["refresh"]["performed"])
        self.assertEqual(2, snapshot["summary"]["core_count"])
        self.assertEqual(3, snapshot["summary"]["logical_processor_count"])
        self.assertEqual("game", snapshot["cores"][0]["partition"])
        self.assertEqual("performance", snapshot["cores"][0]["efficiency_type"])
        self.assertEqual("background", snapshot["cores"][1]["partition"])
        self.assertEqual("efficiency", snapshot["cores"][1]["efficiency_type"])
        self.assertEqual(["g0c0"], snapshot["llc_groups"][0]["core_ids"])
        self.assertEqual([1, 2], snapshot["partitions"]["game"]["cpu_set_ids"])
        self.assertEqual(["g0c0"], snapshot["partitions"]["game"]["core_ids"])

    def test_refresh_is_blocked_during_game_mode(self):
        isolator = EsportsIsolatorPro(
            config_path="__no_local_config__.json",
            scan_game_libraries=False,
        )
        _install_sample_topology(isolator)
        with isolator._state_lock:
            isolator._entry_gen += 1
            isolator._touched[42] = {
                "name": "cs2.exe",
                "create_time": 123,
                "state": {},
                "threads": {},
                "source": "optimize_game",
                "gen": isolator._entry_gen,
            }
        isolator._refresh_topology = lambda reason: (_ for _ in ()).throw(AssertionError("refresh must not run in game mode"))

        snapshot = isolator.get_topology_snapshot(refresh=True)

        self.assertFalse(snapshot["refresh"]["performed"])
        self.assertEqual("game_mode", snapshot["refresh"]["blocked_reason"])


class FakeTopologyEngine:
    def __init__(self):
        self.refresh_requested = []

    def run(self):
        return True

    def get_runtime_status(self):
        return {"running": True, "game_mode": False}

    def get_topology_snapshot(self, refresh=False):
        self.refresh_requested.append(refresh)
        return {
            "available": True,
            "summary": {"core_count": 0, "logical_processor_count": 0},
            "cores": [],
            "llc_groups": [],
            "partitions": {},
            "refresh": {"requested": refresh, "performed": False},
        }


class TopologyHttpTests(unittest.TestCase):
    def test_topology_endpoint_returns_bridge_snapshot(self):
        engine = FakeTopologyEngine()
        bridge = IsolatorBridge(engine_factory=lambda *_args: engine, admin_check=lambda: True)
        bridge.start()
        server = create_server(("127.0.0.1", 0), create_handler(bridge))
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        conn = http.client.HTTPConnection("127.0.0.1", server.server_port, timeout=2)
        try:
            conn.request("GET", "/api/topology?refresh=1")
            response = conn.getresponse()
            body = json.loads(response.read().decode("utf-8"))
        finally:
            conn.close()
            server.shutdown()
            server.server_close()
            thread.join(timeout=2)

        self.assertEqual(200, response.status)
        self.assertTrue(body["available"])
        self.assertEqual([True], engine.refresh_requested)


if __name__ == "__main__":
    unittest.main()
