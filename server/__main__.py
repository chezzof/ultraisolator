"""Run the Esports Isolator PRO localhost API server."""

import argparse
import ctypes
import os
import threading

from .bridge import IsolatorBridge
from .http_api import create_handler, create_server


PARENT_HEARTBEAT_INTERVAL_S = 5.0


def _parent_alive_windows(parent_pid, interval_s):
    synchronize = 0x00100000
    wait_timeout = 0x00000102
    wait_object_0 = 0x00000000
    kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
    handle = kernel32.OpenProcess(synchronize, False, int(parent_pid))
    if not handle:
        return False
    try:
        result = kernel32.WaitForSingleObject(handle, int(max(interval_s, 0.001) * 1000))
        return result == wait_timeout
    finally:
        kernel32.CloseHandle(handle)


def _parent_alive_portable(parent_pid, interval_s):
    if os.name == "nt":
        return _parent_alive_windows(parent_pid, interval_s)
    if interval_s > 0:
        threading.Event().wait(interval_s)
    return os.getppid() == int(parent_pid)


def _parent_heartbeat_loop(parent_pid, stop_event, on_parent_exit, interval_s=PARENT_HEARTBEAT_INTERVAL_S, is_parent_alive=_parent_alive_portable):
    while not stop_event.is_set():
        if not is_parent_alive(parent_pid, interval_s):
            stop_event.set()
            on_parent_exit()
            return


def _start_parent_heartbeat(parent_pid, on_parent_exit, interval_s=PARENT_HEARTBEAT_INTERVAL_S):
    stop_event = threading.Event()
    thread = threading.Thread(
        target=_parent_heartbeat_loop,
        args=(parent_pid, stop_event, on_parent_exit, interval_s),
        name="parent-heartbeat",
        daemon=True,
    )
    thread.start()
    return stop_event


def main(argv=None):
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--config", default="config.json")
    parser.add_argument("--parent-pid", type=int, default=os.getppid())
    parser.add_argument("--api-token", default=os.environ.get("EII_API_TOKEN", ""))
    args = parser.parse_args(argv)

    bridge = IsolatorBridge(config_path=args.config)
    server = create_server((args.host, args.port), create_handler(bridge, api_token=args.api_token))
    heartbeat_stop = _start_parent_heartbeat(args.parent_pid, server.shutdown)
    print(f"Esports Isolator PRO API listening on http://{args.host}:{server.server_port}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        heartbeat_stop.set()
        bridge.stop()
        server.server_close()


if __name__ == "__main__":
    main()
