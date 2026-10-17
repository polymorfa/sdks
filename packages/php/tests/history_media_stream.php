<?php

declare(strict_types=1);

$historyPath = '/messaging/support%2Fone/chats/chat%2Fone/messages/message%2Fone/media';
$readHistory = static function (Polymorfa\MessagingClient $client): Polymorfa\ApiResponse {
    $download = $client->chats->downloadMessageMediaStream('support/one', 'chat/one', 'message/one', new Polymorfa\RequestOptions(headers: ['X-History-Proof' => 'stream']));
    try {
        check($download->contentType === 'image/png' && $download->contentLength === 5 && $download->filename === 'stored copy.png' && !$download->redirected, 'Stored history stream keeps native headers and sanitized filename');
        check($download->metadata->status === 200 && $download->metadata->attempts === 1 && $download->metadata->apiVersion === '2026-09-22' && $download->metadata->transport === 'official_api', 'Stored history stream keeps API version, transport and attempts');
        $first = $download->body->read(2);
        check($first === "\x00A", 'Stored history exposes readable incremental binary body');
        return new Polymorfa\ApiResponse($first.$download->body->getContents(), $download->metadata);
    } finally {
        $download->close();
    }
};
foreach ([$credential, Polymorfa\Credential::projectToken('pmfa_pt_AgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA')] as $historyCredential) {
    nativeCases([
        ['GET', $historyPath, null, "\x00ABC\x00", $readHistory, "\x00ABC\x00", [
            'requestHeaders' => ['X-History-Proof' => 'stream', 'Accept' => 'application/octet-stream'],
            'responseHeaders' => ['Content-Type' => 'image/png', 'Content-Length' => '5', 'Content-Disposition' => "attachment; filename*=UTF-8''..%2Fstored%20copy.png", 'Polymorfa-Version' => '2026-09-22', 'X-Polymorfa-Transport' => 'official_api'],
        ]],
    ], static fn ($provided, $url) => new Polymorfa\MessagingClient($provided, baseUrl: $url), $historyCredential);
}

nativeCases([
    ['GET', $historyPath, null, ['error' => ['code' => 'hms_history_not_enabled', 'message' => 'History access is unavailable.']], static function ($client) {
        $error = raises(fn () => $client->chats->downloadMessageMediaStream('support/one', 'chat/one', 'message/one'), Polymorfa\AuthorizationException::class);
        check($error->status === 403 && $error->errorCode === 'hms_history_not_enabled', 'Stored history server authorization is authoritative');
        return new Polymorfa\ApiResponse($error->errorCode, $error->metadata);
    }, 'hms_history_not_enabled', ['status' => 403]],
    ['GET', $historyPath, null, 'AB', static function ($client) {
        $token = new Polymorfa\CancellationToken();
        $download = $client->chats->downloadMessageMediaStream('support/one', 'chat/one', 'message/one', new Polymorfa\RequestOptions(timeout: 1, cancellation: $token));
        try {
            check($download->body->read(1) === 'A', 'Native history stream hands off the flushed prefix before completion');
            $token->cancel();
            raises(fn () => $download->body->read(1), Polymorfa\CancelledException::class);
            return new Polymorfa\ApiResponse('cancelled', $download->metadata);
        } finally {
            $download->close();
        }
    }, 'cancelled', ['bodyDelaySeconds' => 0.2]],
    ['GET', $historyPath, null, 'AB', static function ($client) {
        // Allow response admission first; the three-second body delay exceeds this budget.
        $download = $client->chats->downloadMessageMediaStream('support/one', 'chat/one', 'message/one', new Polymorfa\RequestOptions(timeout: 1, maxNetworkRetries: 2));
        try {
            check($download->body->read(1) === 'A', 'Native history timeout follows a real admitted body prefix');
            $error = raises(fn () => $download->body->getContents(), Polymorfa\ConnectionException::class);
            check($error->metadata->operationId === 'history_operation' && $error->metadata->requestId === 'native_request' && $error->metadata->attempts === 1, 'History body read failure retains admission and request metadata without restarting stream: '.json_encode(['operationId' => $error->metadata?->operationId, 'requestId' => $error->metadata?->requestId, 'attempts' => $error->metadata?->attempts], JSON_THROW_ON_ERROR));
            return new Polymorfa\ApiResponse('body_failure', $error->metadata);
        } finally {
            $download->close();
        }
    }, 'body_failure', ['bodyDelaySeconds' => 3, 'responseHeaders' => ['X-Polymorfa-Operation-Id' => 'history_operation']]],
], static fn ($provided, $url) => new Polymorfa\MessagingClient($provided, baseUrl: $url));

foreach ([Polymorfa\Credential::clientToken('pmfa_ct_fixture'), $credential] as $historyCredential) {
    $history = [];
    $client = new Polymorfa\MessagingClient($historyCredential, http: mocked([], $history));
    if ($historyCredential->kind === 'client_token') {
        raises(fn () => $client->chats->downloadMessageMediaStream('support', 'chat', 'message'), Polymorfa\ConfigurationException::class);
    } else {
        $token = new Polymorfa\CancellationToken();
        $token->cancel();
        raises(fn () => $client->chats->downloadMessageMediaStream('support', 'chat', 'message', new Polymorfa\RequestOptions(cancellation: $token)), Polymorfa\CancelledException::class);
        foreach ([['', 'chat', 'message'], ['support', '', 'message'], ['support', 'chat', '']] as [$session, $chat, $message]) {
            raises(fn () => $client->chats->downloadMessageMediaStream($session, $chat, $message), Polymorfa\ConfigurationException::class);
        }
    }
    check($history === [], 'History stream credential, identifier and cancellation guards precede HTTP');
}
echo "Stored-history native streaming, scope, filename, authorization and cancellation checks passed.\n";
