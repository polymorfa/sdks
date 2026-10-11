"""FastAPI endpoint authenticating original bytes before application JSON parsing."""

import os

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from polymorfa import WebhookSignatureError
from polymorfa.integrations import fastapi_webhook_event

app = FastAPI()


@app.post("/webhooks/polymorfa")
async def webhook(request: Request) -> JSONResponse:
    try:
        event = await fastapi_webhook_event(request, os.environ["POLYMORFA_WEBHOOK_SECRET"])
    except WebhookSignatureError:
        return JSONResponse({"error": "invalid_signature"}, status_code=400)
    # Store event.id in your delivery deduplication table before processing.
    # Unknown event payloads remain available in event.payload.
    return JSONResponse({"received": event.id})
