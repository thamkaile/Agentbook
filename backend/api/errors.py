from __future__ import annotations

import logging
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from backend.api.schemas import ErrorBody, ErrorResponse

LOGGER = logging.getLogger("study_companion.api")


class ApiError(Exception):
    def __init__(
        self,
        *,
        status_code: int,
        code: str,
        message: str,
        details: Any | None = None,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message
        self.details = details


def error_response(
    *,
    status_code: int,
    code: str,
    message: str,
    details: Any | None = None,
) -> JSONResponse:
    payload = ErrorResponse(
        error=ErrorBody(
            code=code,
            message=message,
            details=details,
        )
    ).model_dump(exclude_none=True)
    return JSONResponse(status_code=status_code, content=payload)


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(ApiError)
    async def handle_api_error(
        _request: Request,
        error: ApiError,
    ) -> JSONResponse:
        return error_response(
            status_code=error.status_code,
            code=error.code,
            message=error.message,
            details=error.details,
        )

    @app.exception_handler(RequestValidationError)
    async def handle_validation_error(
        _request: Request,
        error: RequestValidationError,
    ) -> JSONResponse:
        details = [
            {
                "field": ".".join(str(part) for part in item["loc"]),
                "message": item["msg"],
                "type": item["type"],
            }
            for item in error.errors()
        ]
        return error_response(
            status_code=422,
            code="validation_error",
            message="Request validation failed.",
            details=details,
        )

    @app.exception_handler(StarletteHTTPException)
    async def handle_http_error(
        _request: Request,
        error: StarletteHTTPException,
    ) -> JSONResponse:
        code = "not_found" if error.status_code == 404 else "http_error"
        message = (
            "The requested resource was not found."
            if error.status_code == 404
            else "The request could not be completed."
        )
        return error_response(
            status_code=error.status_code,
            code=code,
            message=message,
        )

    @app.exception_handler(Exception)
    async def handle_unexpected_error(
        request: Request,
        error: Exception,
    ) -> JSONResponse:
        LOGGER.error(
            "Unhandled API error method=%s route=%s error_type=%s",
            request.method,
            request.url.path,
            type(error).__name__,
        )
        return error_response(
            status_code=500,
            code="internal_error",
            message="An unexpected server error occurred.",
        )
