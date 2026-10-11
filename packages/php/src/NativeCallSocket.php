<?php

declare(strict_types=1);

namespace Polymorfa;

use WebSocket\Client;
use WebSocket\Message\Binary;
use WebSocket\Middleware\{CloseHandler,PingResponder,SubprotocolNegotiation};

final class NativeCallSocket implements CallSocket
{
    private readonly Client $socket;
    public function __construct(string $url, ?string $subprotocol, float $timeout)
    {
        if (!class_exists(Client::class)) {
            throw new ConfigurationException('callsDependency');
        }
        $this->socket = new Client($url);
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
        return ['data' => $message->getContent(),'binary' => $message instanceof Binary];
    }
    public function close(): void
    {
        $this->socket->close();
    }
}
