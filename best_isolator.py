"""Backward-compatible wrapper for the modular Esports Isolator package."""

from isolator import winapi as _winapi
from isolator.winapi import *
from isolator.app import EsportsIsolatorPro
from isolator.cli import main

__all__ = sorted(
    {name for name in dir(_winapi) if not name.startswith("_")}
    | {"EsportsIsolatorPro", "main"}
)


if __name__ == "__main__":
    raise SystemExit(main())
