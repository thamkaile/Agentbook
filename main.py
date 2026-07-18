"""Backward-compatible launcher for the terminal Study Companion."""

from __future__ import annotations

import sys

from backend.cli import main


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nProgram stopped.")
        sys.exit(0)
