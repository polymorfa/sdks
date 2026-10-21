<?php

declare(strict_types=1);

namespace Polymorfa;

/** Incremental WHATWG line handling, including carriage returns split across chunks. */
final class SseParser
{
    private string $buffer = '';
    private int $frameBytes = 0;
    private bool $carriageReturn = false;
    /** @var list<string> */
    private array $data = [];
    /** @return list<string> */
    public function feed(string $chunk): array
    {
        $frames = [];
        $length = strlen($chunk);
        for ($i = 0; $i < $length; ++$i) {
            $character = $chunk[$i];
            if ($this->carriageReturn) {
                $this->carriageReturn = false;
                if ($character === "\n") {
                    continue;
                }
            }
            if (++$this->frameBytes > 4 * 1024 * 1024) {
                throw new ServerException('Event stream frame exceeds its size limit.', 'invalid_response');
            }
            if ($character !== "\r" && $character !== "\n") {
                $this->buffer .= $character;
                continue;
            }
            $this->carriageReturn = $character === "\r";
            $line = $this->buffer;
            $this->buffer = '';
            if ($line === '') {
                $this->frameBytes = 0;
                if ($this->data !== []) {
                    $frames[] = implode("\n", $this->data);
                }
                $this->data = [];
            } elseif (str_starts_with($line, 'data:')) {
                $value = substr($line, 5);
                $this->data[] = str_starts_with($value, ' ') ? substr($value, 1) : $value;
            }
        }
        return $frames;
    }
}
