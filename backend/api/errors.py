import logging
from typing import Any, Optional

logger = logging.getLogger(__name__)


class AppError(Exception):
    def __init__(
        self,
        code: str,
        message: str,
        status: int = 400,
        fields: Optional[dict[str, str]] = None,
    ):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status = status
        self.fields = fields


def custom_exception_handler(exc: Exception, context: dict[str, Any]):
    from rest_framework.response import Response
    from rest_framework.views import exception_handler as drf_exception_handler
    if isinstance(exc, AppError):
        payload: dict[str, Any] = {
            "code": exc.code,
            "message": exc.message,
        }
        if exc.fields:
            payload["fields"] = exc.fields
        return Response(payload, status=exc.status)

    response = drf_exception_handler(exc, context)
    if response is not None:
        status_code = response.status_code
        if status_code == 401:
            return Response(
                {"code": "UNAUTHORIZED", "message": "Please sign in to continue."},
                status=401,
            )
        if status_code == 403:
            return Response(
                {
                    "code": "FORBIDDEN",
                    "message": "You do not have permission to access this resource.",
                },
                status=403,
            )
        if status_code == 400 and isinstance(response.data, dict):
            fields: dict[str, str] = {}
            for k, v in response.data.items():
                if isinstance(v, list) and v:
                    fields[k] = str(v[0])
                elif isinstance(v, str):
                    fields[k] = v
            return Response(
                {
                    "code": "VALIDATION_ERROR",
                    "message": "Please fix the highlighted fields.",
                    "fields": fields,
                },
                status=400,
            )
        return Response(
            {
                "code": "HTTP_ERROR",
                "message": str(response.data.get("detail", "Request failed."))
                if isinstance(response.data, dict)
                else "Request failed.",
            },
            status=status_code,
        )

    logger.exception("Unhandled API error", exc_info=exc)
    return Response(
        {
            "code": "INTERNAL_ERROR",
            "message": "Something went wrong on the server. Please try again.",
        },
        status=500,
    )
