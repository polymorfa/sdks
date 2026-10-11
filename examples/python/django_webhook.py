"""Include this view in your Django URL configuration."""

import os

from django.http import HttpRequest, JsonResponse
from django.views.decorators.csrf import csrf_exempt

from polymorfa import WebhookSignatureError
from polymorfa.integrations import django_webhook_event


@csrf_exempt
def webhook(request: HttpRequest) -> JsonResponse:
    if request.method != "POST":
        return JsonResponse({"error": "method_not_allowed"}, status=405)
    try:
        event = django_webhook_event(request, os.environ["POLYMORFA_WEBHOOK_SECRET"])
    except WebhookSignatureError:
        return JsonResponse({"error": "invalid_signature"}, status=400)
    return JsonResponse({"received": event.id})
