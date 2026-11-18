from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from api.auth_utils import IsAuthenticatedJWT
from api.errors import AppError
from api.models import NotificationPreference
from api.services.notification_service import (
    delete_notification,
    list_notifications,
    mark_all_notifications_read,
    mark_notification_read,
)


@api_view(["GET"])
@permission_classes([IsAuthenticatedJWT])
def notifications_list(request):
    filter_mode = "unread" if request.query_params.get("filter") == "unread" else "all"
    notif_type = request.query_params.get("type")
    return Response(list_notifications(request.user.id, filter_mode, notif_type))


@api_view(["POST"])
@permission_classes([IsAuthenticatedJWT])
def notifications_read_all(request):
    mark_all_notifications_read(request.user.id)
    return Response({"ok": True})


@api_view(["POST"])
@permission_classes([IsAuthenticatedJWT])
def notification_mark_read(request, notification_id: str):
    mark_notification_read(request.user.id, notification_id)
    return Response({"ok": True})


@api_view(["DELETE"])
@permission_classes([IsAuthenticatedJWT])
def notification_delete(request, notification_id: str):
    delete_notification(request.user.id, notification_id)
    return Response({"ok": True})


@api_view(["GET", "PUT"])
@permission_classes([IsAuthenticatedJWT])
def notification_preferences(request):
    if request.method == "GET":
        rows = NotificationPreference.objects.filter(user_id=request.user.id)
        return Response([{"typeCode": r.type_code, "enabled": bool(r.enabled)} for r in rows])

    body = request.data if isinstance(request.data, dict) else {}
    type_code = body.get("typeCode")
    enabled = body.get("enabled")
    if not type_code or not isinstance(enabled, bool):
        raise AppError("VALIDATION_ERROR", "typeCode and enabled are required.", 400)

    NotificationPreference.objects.update_or_create(
        user_id=request.user.id,
        type_code=str(type_code),
        defaults={"enabled": enabled},
    )
    return Response({"ok": True})
