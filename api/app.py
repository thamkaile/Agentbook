"""Compatibility entry point for ``uvicorn api.app:app``."""

from backend.api.app import app, create_app, initialize_storage

__all__ = ["app", "create_app", "initialize_storage"]

