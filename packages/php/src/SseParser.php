<?php

declare(strict_types=1);

namespace Polymorfa;

/** Incremental WHATWG line handling, including carriage returns split across chunks. */
final class SseParser
{
    private string $buffer = '';
    private bool $carriageReturn = false;
    /** @var list<string> */
    private array $data = [];
    /** @return list<string> */
    public function feed(string $chunk): array
    {
        if ($this->carriageReturn && str_starts_with($chunk, "\n")) {
            $chunk = substr($chunk, 1);
        }
        $this->carriageReturn = str_ends_with($chunk, "\r");
        $lines = preg_split('/\r\n|\r|\n/', $this->buffer.$chunk);
        if ($lines === false) {
            throw new ServerException('Invalid event stream frame.', 'invalid_response');
        }
        $this->buffer = (string)array_pop($lines);
        $frames = [];
        foreach ($lines as $line) {
            if ($line === '') {
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
