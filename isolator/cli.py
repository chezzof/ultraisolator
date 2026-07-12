"""Command-line entrypoint for Esports Isolator."""

import argparse
import sys
import time

from .app import EsportsIsolatorPro
from .winapi import is_process_elevated


def main(argv=None):
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", default="config.json")
    parser.add_argument("--benchmark", action="store_true")
    parser.add_argument("--benchmark-duration-sec", type=float, default=0.0)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--recover", action="store_true", help="restore persistent IFEO/power recovery state and exit")
    parser.add_argument("--log-file", default=None, help="append timestamped log lines to this file")
    args = parser.parse_args(argv)

    if (args.recover or not args.dry_run) and not is_process_elevated():
        print("[ERROR] administrator_required", file=sys.stderr)
        return 5

    isolator = EsportsIsolatorPro(config_path=args.config, scan_game_libraries=not args.recover)
    if args.log_file:
        isolator.set_log_file(args.log_file)
    if args.recover:
        return 0 if isolator.recover() else 1
    if args.dry_run:
        return 0 if isolator.dry_run() else 1

    started = isolator.run()

    try:
        if started and args.benchmark and args.benchmark_duration_sec > 0:
            print("==================================================")
            print(f"Esports Isolator PRO benchmark mode for {args.benchmark_duration_sec:.1f}s.")
            print("==================================================")
            time.sleep(args.benchmark_duration_sec)
        elif started and not args.benchmark:
            print("==================================================")
            print("Esports Isolator PRO is running.")
            print("Press Ctrl+C in this window to stop and restore the session state.")
            print("==================================================")
            while True:
                time.sleep(1)
    except KeyboardInterrupt:
        print("\nStopping... restoring session state.")
    finally:
        isolator.shutdown()

    return 0 if started else 1
