"""uvicorn django_app:application --host 127.0.0.1 --port 8080"""

from django.conf import settings

if not settings.configured:
    settings.configure(
        DEBUG=False,
        SECRET_KEY="loopback-example-no-django-sessions",
        ROOT_URLCONF=__name__,
        ALLOWED_HOSTS=["127.0.0.1", "localhost", "example.test"],
    )

from django.core.asgi import get_asgi_application
from django.http import HttpResponse, HttpResponseRedirect, JsonResponse
from django.urls import path, re_path
from django.views.decorators.csrf import csrf_exempt
from django.views.static import serve
from host import COOKIE, ROOT, Host
from polymorfa import PolymorfaError

settings.ROOT_URLCONF = __name__
settings.ALLOWED_HOSTS = ["127.0.0.1", "localhost", "example.test"]

host = Host()


def workspace(request, authenticated):
    response = (
        HttpResponse(host.render(authenticated, fragment=True))
        if request.headers.get("hx-request") == "true"
        else HttpResponseRedirect("/")
    )
    response["cache-control"] = "no-store"
    if response.status_code == 302:
        response.status_code = 303
    return response


@csrf_exempt
async def view(request, operation="index"):
    if operation == "index" and request.method == "GET":
        response = HttpResponse(
            host.render(host.authenticated(request.COOKIES.get(COOKIE)))
        )
        response["cache-control"] = "no-store"
        return response
    if operation == "history" and request.method == "GET":
        if not host.authenticated(request.COOKIES.get(COOKIE)):
            return JsonResponse({"error": "sign_in_required"}, status=401)
        response = JsonResponse({"data": [], "nextCursor": None})
        response["cache-control"] = "no-store"
        return response
    if request.method != "POST":
        return JsonResponse({"error": "method_not_allowed"}, status=405)
    if request.headers.get("origin") != host.origin:
        return JsonResponse({"error": "invalid_origin"}, status=403)
    if operation == "login":
        reply = host.login(request.body)
        if reply.session is None:
            return JsonResponse(reply.data, status=reply.status)
        response = workspace(request, True)
        response.set_cookie(
            COOKIE,
            reply.session,
            max_age=1800,
            httponly=True,
            samesite="Strict",
            secure=host.origin.startswith("https:"),
        )
        return response
    if operation == "logout":
        host.logout(request.COOKIES.get(COOKIE))
        response = workspace(request, False)
        response.delete_cookie(COOKIE, samesite="Strict")
        return response
    if not host.authenticated(request.COOKIES.get(COOKIE)):
        return JsonResponse({"error": "sign_in_required"}, status=401)
    try:
        result = (
            await host.mint()
            if operation == "token"
            else await host.connect_number()
            if operation == "connect"
            else None
        )
    except (PolymorfaError, ValueError, TypeError, KeyError, OverflowError):
        return JsonResponse({"error": "browser_access_unavailable"}, status=502)
    response = JsonResponse(result, safe=False, status=404 if result is None else 200)
    response["cache-control"] = "no-store"
    return response


urlpatterns = [
    path("", view),
    path("api/login", view, {"operation": "login"}),
    path("api/logout", view, {"operation": "logout"}),
    path("api/polymorfa/token", view, {"operation": "token"}),
    path("api/polymorfa/connect", view, {"operation": "connect"}),
    path("api/polymorfa/history/conversations", view, {"operation": "history"}),
    re_path(r"^assets/(?P<path>.*)$", serve, {"document_root": ROOT / "assets"}),
]
application = get_asgi_application()
