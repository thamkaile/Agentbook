from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Query

from backend.api.dashboard_schemas import DashboardResponse
from backend.study.dashboard import build_dashboard

router = APIRouter(prefix="/api", tags=["dashboard"])


@router.get("/dashboard", response_model=DashboardResponse)
def get_dashboard(
    recent_limit: Annotated[int, Query(ge=1, le=50)] = 5,
) -> DashboardResponse:
    """Return a deterministic SQLite snapshot without invoking a model."""
    return DashboardResponse.model_validate(
        build_dashboard(recent_limit=recent_limit),
        from_attributes=True,
    )
