"""uvicorn fastapi_app:app --host 127.0.0.1 --port 8080"""

from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from host import COOKIE, ROOT, Host
from polymorfa import PolymorfaError

app, host = FastAPI(), Host()
app.mount(
    "/assets", StaticFiles(directory=ROOT / "assets", check_dir=False), name="assets"
)


def workspace(request: Request, authenticated: bool):
    if request.headers.get("hx-request") == "true":
        return HTMLResponse(
            host.render(authenticated, fragment=True),
            headers={"cache-control": "no-store"},
        )
    return RedirectResponse("/", status_code=303, headers={"cache-control": "no-store"})


@app.get("/")
async def index(request: Request):
    return HTMLResponse(
        host.render(host.authenticated(request.cookies.get(COOKIE))),
        headers={"cache-control": "no-store"},
    )


@app.post("/api/login")
async def login(request: Request):
    if request.headers.get("origin") != host.origin:
        return JSONResponse({"error": "invalid_origin"}, status_code=403)
    reply = host.login(await request.body())
    if reply.session is None:
        return JSONResponse(reply.data, status_code=reply.status)
    response = workspace(request, True)
    response.set_cookie(
        COOKIE,
        reply.session,
        max_age=1800,
        httponly=True,
        samesite="strict",
        secure=host.origin.startswith("https:"),
    )
    return response


@app.post("/api/logout")
async def logout(request: Request):
    if request.headers.get("origin") != host.origin:
        return JSONResponse({"error": "invalid_origin"}, status_code=403)
    host.logout(request.cookies.get(COOKIE))
    response = workspace(request, False)
    response.delete_cookie(COOKIE, httponly=True, samesite="strict")
    return response


@app.post("/api/polymorfa/{operation}")
async def browser_action(operation: str, request: Request):
    if request.headers.get("origin") != host.origin:
        return JSONResponse({"error": "invalid_origin"}, status_code=403)
    if not host.authenticated(request.cookies.get(COOKIE)):
        return JSONResponse({"error": "sign_in_required"}, status_code=401)
    try:
        result = (
            await host.mint()
            if operation == "token"
            else await host.connect_number()
            if operation == "connect"
            else None
        )
    except (PolymorfaError, ValueError, TypeError, KeyError, OverflowError):
        return JSONResponse({"error": "browser_access_unavailable"}, status_code=502)
    return JSONResponse(
        result,
        status_code=404 if result is None else 200,
        headers={"cache-control": "no-store"},
    )


@app.get("/api/polymorfa/history/conversations")
async def history(request: Request):
    if not host.authenticated(request.cookies.get(COOKIE)):
        return JSONResponse({"error": "sign_in_required"}, status_code=401)
    return JSONResponse(
        {"data": [], "nextCursor": None}, headers={"cache-control": "no-store"}
    )
