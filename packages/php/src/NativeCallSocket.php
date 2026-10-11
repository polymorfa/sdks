<?php

declare(strict_types=1);

namespace Polymorfa;

use WebSocket\Client;
use WebSocket\Message\{Binary, Close};
use WebSocket\Exception\ConnectionTimeoutException;
use WebSocket\Middleware\{CloseHandler,PingResponder,SubprotocolNegotiation};

final class NativeCallSocket implements PollingCallSocket
{
    private readonly NativeCallsTransport $socket;
    private readonly bool $media;
    public function __construct(string $url, ?string $subprotocol, float $timeout)
    {
        if (!class_exists(Client::class)) {
            throw new ConfigurationException('callsDependency');
        }
        $this->media = $subprotocol === 'pmfa.calls.v2';
        $this->socket = new NativeCallsTransport($url);
        $this->socket->setTimeout($timeout)->addMiddleware(new CloseHandler())->addMiddleware(new PingResponder());
        if ($subprotocol !== null) {
            $this->socket->addMiddleware(new SubprotocolNegotiation([$subprotocol], true));
        }
    }
    public function send(#[\SensitiveParameter] string $data, bool $binary = false): void
    {
        if ($binary) {
            $this->socket->binary($data);
        } else {
            $this->socket->text($data);
        }
    }
    /** @return array{data:string,binary:bool} */
    public function receive(): array
    {
        $message = $this->socket->receive();
        if ($message instanceof Close) {
            throw CallsSocketErrors::closed($message->getCloseStatus(), $message->getContent(), $this->media);
        }
        return ['data' => $message->getContent(),'binary' => $message instanceof Binary];
    }
    public function poll(float $timeout): ?array
    {
        if (!is_finite($timeout) || $timeout <= 0) {
            throw new ConfigurationException('pollTimeout');
        }
        $this->socket->setTimeout($timeout);
        try {
            $message = $this->socket->receiveWithin($timeout);
            if ($message === null) {
                return null;
            }
            if ($message instanceof Close) {
                throw CallsSocketErrors::closed($message->getCloseStatus(), $message->getContent(), $this->media);
            }
            return ['data' => $message->getContent(),'binary' => $message instanceof Binary];
        } catch (ConnectionTimeoutException) {
            return null;
        }
    }
    public function close(): void
    {
        if ($this->socket->isConnected()) {
            $this->socket->close();
        }
    }
}
