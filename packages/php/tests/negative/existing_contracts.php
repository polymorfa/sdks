<?php

declare(strict_types=1);

function invalidExistingContracts(Polymorfa\Client $org, Polymorfa\MessagingClient $m, string $p, string $id): void
{
    $m->campaigns->create('slug', ['name' => 'x','variableMapping' => null]);
    $m->campaigns->create('slug', ['name' => 'x','variableMapping' => ['0' => ['source' => null]]]);
    $m->campaigns->create('slug', ['name' => 'x','variableMapping' => ['0' => ['fallback' => null]]]);
    $org->campaigns->create(['projectId' => $p,'name' => 'x','messagesArray' => [['version' => 3]]]);
    $org->campaigns->create(['projectId' => $p,'name' => 'x','messagesArray' => [['media' => ['url' => 'https://example.com']]]]);
    $org->campaigns->launch($id, ['skipMissingVariables' => false]);
    $org->campaigns->launch($id, ['projectId' => $p,'scheduledAt' => null]);
    $m->campaigns->launch('slug', $id, ['skipMissingVariables' => 0]);
    $m->campaigns->listRecipients('slug', $id, ['reason' => 'unknown_reason']);
    $org->sessionConfiguration->update(['configuration' => ['set' => ['historySync' => ['delivery' => 'archive']]],'revision' => 0]);
    $m->sessions->update('s', ['configuration' => ['reset' => ['signalMode']],'revision' => 0]);
    $m->quickLinks->create(['purpose' => 'add_connection','session' => 's']);
    $m->quickLinks->create(['signalMode' => 'invalid']);
    $m->messages->send('s', ['conversation' => ['id' => 'chat'],'content' => ['sticker' => []]]);
    $m->historySync->requestChunkRetry('s', ['syncType' => 'UNKNOWN','chunkOrder' => 0]);
    $org->campaigns->update($id, ['projectId' => $p], ['projectId' => $p]);
    $org->campaigns->update($id, ['id' => $id], ['projectId' => $p]);
    $m->quickLinks->getQuickLinkState('secret');
}
