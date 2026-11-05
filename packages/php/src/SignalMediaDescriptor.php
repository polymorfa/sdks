<?php

declare(strict_types=1);

namespace Polymorfa;

final readonly class SignalMediaDescriptor implements \JsonSerializable
{
    public function __construct(public string $kind, #[\SensitiveParameter] public string $directPath, #[\SensitiveParameter] public string $mediaKey, public string $fileSha256, public string $fileEncSha256, public int $fileLength, public string $mimetype, #[\SensitiveParameter] public ?string $url = null, #[\SensitiveParameter] public ?string $caption = null, #[\SensitiveParameter] public ?string $fileName = null, public ?int $width = null, public ?int $height = null, public ?int $seconds = null, public ?int $mediaKeyTimestamp = null, public ?bool $ptt = null)
    {
    }
    public static function fromUpload(WhatsAppMediaUploadResult $upload): self
    {
        $info = $upload->info;
        $result = new self($info->mediaType === 'ptt' ? 'audio' : $info->mediaType, $upload->location->directPath, $info->mediaKey, $info->fileSha256, $info->fileEncSha256, $info->fileLength, $info->mimeType ?? '', $upload->location->url, ptt:$info->mediaType === 'ptt' ? true : null);
        $result->validateSend();
        return $result;
    }
    public function validateSend(): void
    {
        if (!in_array($this->kind, ['image','video','audio','document','sticker'], true) || $this->directPath === '' || $this->mimetype === '' || $this->fileLength < 1 || strlen($this->mediaKey) !== 32 || strlen($this->fileSha256) !== 32 || strlen($this->fileEncSha256) !== 32) {
            throw new ConfigurationException('signalMedia');
        }
        foreach ([$this->width,$this->height,$this->seconds] as $value) {
            if ($value !== null && ($value < 0 || $value > 4294967295)) {
                throw new ConfigurationException('signalMedia');
            }
        }
    }
    /** @return array<string,mixed> Explicit secret-bearing send fields; do not log. */
    public function toWire(): array
    {
        $this->validateSend();
        $wire = ['kind' => $this->kind,'direct_path' => $this->directPath,'media_key' => base64_encode($this->mediaKey),'file_sha256' => base64_encode($this->fileSha256),'file_enc_sha256' => base64_encode($this->fileEncSha256),'file_length' => $this->fileLength,'mimetype' => $this->mimetype];
        foreach (['url' => $this->url,'caption' => $this->caption,'file_name' => $this->fileName,'width' => $this->width,'height' => $this->height,'seconds' => $this->seconds,'media_key_timestamp' => $this->mediaKeyTimestamp,'ptt' => $this->ptt] as $key => $value) {
            if ($value !== null) {
                $wire[$key] = $value;
            }
        }return $wire;
    }
    /** @param array<string,mixed> $data */
    public static function fromWire(array $data): self
    {
        $kind = SignalCodec::string($data, 'kind');
        if (!in_array($kind, ['image','video','audio','document','sticker'], true)) {
            SignalCodec::invalid();
        }
        $result = new self($kind, SignalCodec::string($data, 'direct_path'), SignalCodec::binary($data, 'media_key'), SignalCodec::binary($data, 'file_sha256'), SignalCodec::binary($data, 'file_enc_sha256'), SignalCodec::integer($data, 'file_length'), SignalCodec::string($data, 'mimetype'), SignalCodec::optionalString($data, 'url'), SignalCodec::optionalString($data, 'caption'), SignalCodec::optionalString($data, 'file_name'), SignalCodec::optionalInteger($data, 'width'), SignalCodec::optionalInteger($data, 'height'), SignalCodec::optionalInteger($data, 'seconds'), SignalCodec::optionalInteger($data, 'media_key_timestamp'), SignalCodec::optionalBoolean($data, 'ptt'));
        if ($result->fileLength < 0) {
            SignalCodec::invalid();
        }
        foreach ([$result->width,$result->height,$result->seconds] as $value) {
            if ($value !== null && ($value < 0 || $value > 4294967295)) {
                SignalCodec::invalid();
            }
        }
        return $result;
    }
    /** @return array{redacted:true} */public function __debugInfo(): array
    {
        return ['redacted' => true];
    }
    /** @return array{redacted:true} */public function jsonSerialize(): array
    {
        return ['redacted' => true];
    }
}
