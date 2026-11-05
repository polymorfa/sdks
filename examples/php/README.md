# PHP server examples

Run `composer install` inside `packages/php`, then run `php examples/php/send.php` from the repository root. Set `POLYMORFA_API_KEY`, `POLYMORFA_SESSION`, `POLYMORFA_RECIPIENT`, and `POLYMORFA_IDEMPOTENCY_KEY` in your server environment. This source SDK has not been published to Packagist. The send example makes a real authorized API request.

The Laravel and Symfony snippets verify original request content with `WebhookRequest` before decoding JSON. Configure the signing secret in your application's secret store. Add durable deduplication by the verified event ID before processing. Unknown event payloads remain available.

`calls-media.php` requires `phrity/websocket` and attaches to an already admitted Call. Set the Call ID, connection ID and authorized participant environment variables named in its source. Server credentials travel in the first WebSocket frame; the URL contains only the Call ID. This synchronous example receives PCM. Applications must drive control messages and media receive calls while connected.
