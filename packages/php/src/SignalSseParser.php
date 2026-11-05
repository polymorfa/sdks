<?php

declare(strict_types=1);

namespace Polymorfa;

/** @internal Incremental LF/CRLF/CR parser retaining the SSE id and event. */
final class SignalSseParser
{
    private string $buffer = '';
    private string $id = '';
    private string $type = '';
    private string $data = '';
    private bool $hasData = false;
    private bool $skipLf = false;
    /** @return list<array{id:string,type:string,data:string}> */
    public function feed(string $chunk): array
    {
        if ($this->skipLf && $chunk !== '') {
            $this->skipLf = false;
            if ($chunk[0] === "\n") {
                $chunk = substr($chunk, 1);
            }
        }
        $this->buffer .= $chunk;
        $frames = [];
        while (preg_match('/[\r\n]/', $this->buffer, $match, PREG_OFFSET_CAPTURE)) {
            $at = $match[0][1];
            $separator = $match[0][0];
            $this->skipLf = $separator === "\r" && $at === strlen($this->buffer) - 1;
            $line = substr($this->buffer, 0, $at);
            $used = $at + 1;
            if ($separator === "\r" && substr($this->buffer, $used, 1) === "\n") {
                $used++;
            }$this->buffer = substr($this->buffer, $used);
            $line = preg_replace('/^\x{FEFF}/u', '', $line) ?? $line;
            if ($line === '') {
                if ($this->hasData) {
                    $frames[] = ['id' => $this->id,'type' => $this->type,'data' => substr($this->data, 0, -1)];
                }$this->id = $this->type = $this->data = '';
                $this->hasData = false;
                continue;
            }
            if (str_starts_with($line, ':')) {
                continue;
            }$parts = explode(':', $line, 2);
            $field = $parts[0];
            $value = $parts[1] ?? '';
            if (str_starts_with($value, ' ')) {
                $value = substr($value, 1);
            }
            if ($field === 'id') {
                if (str_contains($value, "\0")) {
                    SignalCodec::invalid();
                }$this->id = $value;
            } elseif ($field === 'event') {
                $this->type = $value;
            } elseif ($field === 'data') {
                $this->data .= $value."\n";
                $this->hasData = true;
            }
            if (strlen($this->data) > SignalCodec::MAX_BYTES) {
                SignalCodec::invalid();
            }
        }
        if (strlen($this->buffer) > SignalCodec::MAX_BYTES) {
            SignalCodec::invalid();
        }return $frames;
    }
}
