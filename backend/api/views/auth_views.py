import re
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from api.auth_utils import IsAuthenticatedJWT
from api.errors import AppError
from api.services.auth_service import (
    authenticate_customer_with_pin,
    identify_customer_by_phone,
    login_with_password,
)


@api_view(["POST"])
def auth_login(request):
    body = request.data if isinstance(request.data, dict) else {}
    identifier = str(body.get("identifier") or "").strip()
    password = str(body.get("password") or "")
    portal = str(body.get("portal") or "")

    fields: dict[str, str] = {}
    if not identifier:
        fields["identifier"] = "Email or phone is required."
    if not password:
        fields["password"] = "Password is required."
    if portal not in ("admin", "owner"):
        fields["portal"] = "Invalid portal."
    if fields:
        raise AppError("VALIDATION_ERROR", "Please fix the highlighted fields.", 400, fields)

    return Response(login_with_password(identifier, password, portal))


@api_view(["POST"])
def auth_customer_identify(request):
    body = request.data if isinstance(request.data, dict) else {}
    phone = str(body.get("phone") or "")
    if len(phone) < 10:
        raise AppError(
            "VALIDATION_ERROR",
            "Enter a 10-digit phone number.",
            400,
            {"phone": "Enter a 10-digit phone number."},
        )
    return Response(identify_customer_by_phone(phone))


@api_view(["POST"])
def auth_customer_pin(request):
    body = request.data if isinstance(request.data, dict) else {}
    phone = str(body.get("phone") or "")
    pin = str(body.get("pin") or "")
    name = body.get("name")
    if len(phone) < 10:
        raise AppError("VALIDATION_ERROR", "Enter a 10-digit phone number.", 400, {"phone": "Enter a 10-digit phone number."})
    if not re.match(r"^\d{4,6}$", pin):
        raise AppError("VALIDATION_ERROR", "PIN must be 4 to 6 digits.", 400, {"pin": "PIN must be 4 to 6 digits."})
    return Response(authenticate_customer_with_pin(phone=phone, pin=pin, name=name))


@api_view(["GET"])
@permission_classes([IsAuthenticatedJWT])
def auth_me(request):
    return Response({"user": request.user.to_dict()})
