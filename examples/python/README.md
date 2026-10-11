# Python server examples

These examples use the unpublished source SDK. From the repository root, run `uv run --project packages/python examples/python/send.py`. Set `POLYMORFA_API_KEY`, `POLYMORFA_SESSION`, `POLYMORFA_RECIPIENT`, and `POLYMORFA_IDEMPOTENCY_KEY` in your server environment. The send example makes a real authorized API request.

For FastAPI, install the `fastapi` extra and run the webhook app with an ASGI server; include the Django view in your existing application's URL configuration with the `django` extra. Set `POLYMORFA_WEBHOOK_SECRET`. Both adapters verify original request bytes, retain unknown events, and reject altered payloads. Add durable deduplication and processing in your application.

Install the `calls` extra for `calls_media.py`. The example attaches to an already admitted Call using server credentials and an authorized participant. Set the Call ID, connection ID and participant environment variables named in the source. Calls access, connection permissions and service enrollment are enforced by the API. This example receives PCM; it does not capture a microphone.
