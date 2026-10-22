<?php

declare(strict_types=1);

namespace Polymorfa;

/** Secret-bearing send metadata. Standard sends transmit the media key to
 * Polymorfa; zero-knowledge sends use the application's Signal sidecar. */
final readonly class WhatsAppMediaSendDescriptor implements \JsonSerializable
{
    public function __construct(public string $mediaType, #[\SensitiveParameter] public string $directPath, #[\SensitiveParameter] public string $url, #[\SensitiveParameter] public string $mediaKey, public string $fileSha256, public string $fileEncSha256, public int $fileLength, public string $mimeType, public WhatsAppMediaSendMetadata $metadata = new WhatsAppMediaSendMetadata())
    {
        $this->validate();
    }
    public static function fromUpload(WhatsAppMediaUploadResult $upload, ?WhatsAppMediaSendMetadata $metadata = null): self
    {
        $metadata ??= new WhatsAppMediaSendMetadata();
        return new self($upload->info->mediaType, $upload->location->directPath, $upload->location->url, $upload->info->mediaKey, $upload->info->fileSha256, $upload->info->fileEncSha256, $upload->info->fileLength, $metadata->mimeType ?? $upload->info->mimeType ?? '', $metadata);
    }
    /** Decode API response fields into a redacted descriptor.
     * @param array<string,mixed> $wire */
    public static function fromWire(string $mediaType, #[\SensitiveParameter] array $wire): self
    {
        try {
            foreach (['directPath','url','mediaKey','fileSha256','fileEncSha256','mimeType'] as $name) {
                if (!isset($wire[$name]) || !is_string($wire[$name])) {
                    throw new ConfigurationException('descriptor');
                }
            }
            foreach (['fileLength','width','height','seconds','mediaKeyTimestamp'] as $name) {
                if (($name === 'fileLength' && !isset($wire[$name])) || (isset($wire[$name]) && !is_int($wire[$name]))) {
                    throw new ConfigurationException('descriptor');
                }
            }
            if (isset($wire['isAnimated']) && !is_bool($wire['isAnimated'])) {
                throw new ConfigurationException('descriptor');
            }
            $decode = static function (mixed $value): string {
                if (!is_string($value) || !preg_match('/^[A-Za-z0-9+\/]*={0,2}$/D', $value)) {
                    throw new ConfigurationException('descriptor');
                }
                $binary = base64_decode($value, true);
                if ($binary === false || rtrim(base64_encode($binary), '=') !== rtrim($value, '=')) {
                    throw new ConfigurationException('descriptor');
                }
                return $binary;
            };
            /** @var array{directPath:string,url:string,mediaKey:string,fileSha256:string,fileEncSha256:string,fileLength:int,mimeType:string,thumbnail?:mixed,waveform?:mixed,width?:int,height?:int,seconds?:int,mediaKeyTimestamp?:int,isAnimated?:bool} $wire */
            $metadata = new WhatsAppMediaSendMetadata(thumbnail: array_key_exists('thumbnail', $wire) ? $decode($wire['thumbnail']) : null, width:$wire['width'] ?? null, height:$wire['height'] ?? null, seconds:$wire['seconds'] ?? null, waveform:array_key_exists('waveform', $wire) ? $decode($wire['waveform']) : null, mediaKeyTimestamp:$wire['mediaKeyTimestamp'] ?? null, isAnimated:$wire['isAnimated'] ?? null);
            return new self($mediaType, $wire['directPath'], $wire['url'], $decode($wire['mediaKey']), $decode($wire['fileSha256']), $decode($wire['fileEncSha256']), $wire['fileLength'], $wire['mimeType'], $metadata);
        } catch (ConfigurationException $error) {
            throw new ServerException('The API returned an invalid media descriptor.', 'invalid_response');
        }
    }
    private function validate(): void
    {
        if (!in_array($this->mediaType, ['image','video','audio','ptt','document','sticker'], true)) {
            throw new ConfigurationException('mediaType');
        }
        if ($this->mimeType === '' || strlen($this->mimeType) > 255 || !preg_match('/^[ -~]+$/D', $this->mimeType)) {
            throw new ConfigurationException('mimeType');
        }
        if (strlen($this->directPath) > 2048 || !preg_match('/^\/(?!\/)[!-~]+$/D', $this->directPath)) {
            throw new ConfigurationException('directPath');
        }
        $url = parse_url($this->url);
        if (strlen($this->url) > 2048 || !preg_match('/^https:\/\/[!-~]+$/D', $this->url) || $url === false || !isset($url['host']) || isset($url['user']) || isset($url['pass'])) {
            throw new ConfigurationException('url');
        }
        if ($this->fileLength < 1 || $this->fileLength > 2147483648) {
            throw new ConfigurationException('fileLength');
        }
        if (strlen($this->mediaKey) !== 32 || strlen($this->fileSha256) !== 32 || strlen($this->fileEncSha256) !== 32) {
            throw new ConfigurationException('mediaKey');
        }
        $extra = $this->metadata;
        if (($extra->width === null) !== ($extra->height === null) || ($extra->width !== null && ($extra->width < 1 || $extra->width > 65536 || $extra->height < 1 || $extra->height > 65536))) {
            throw new ConfigurationException('width');
        }
        if ($extra->seconds !== null && ($extra->seconds < 0 || $extra->seconds > 86400)) {
            throw new ConfigurationException('seconds');
        }
        if ($extra->thumbnail !== null && strlen($extra->thumbnail) > 16384) {
            throw new ConfigurationException('thumbnail');
        }
        if ($extra->waveform !== null && (strlen($extra->waveform) < 64 || strlen($extra->waveform) > 192)) {
            throw new ConfigurationException('waveform');
        }
        if ($extra->mediaKeyTimestamp !== null && ($extra->mediaKeyTimestamp < 1 || $extra->mediaKeyTimestamp > 1099511627776)) {
            throw new ConfigurationException('mediaKeyTimestamp');
        }
        if ($this->mediaType === 'sticker' && ($this->mimeType !== 'image/webp' || $extra->thumbnail !== null || $extra->seconds !== null || $extra->waveform !== null)) {
            throw new ConfigurationException('mediaType');
        }
        if ($this->mediaType !== 'sticker' && $extra->isAnimated !== null) {
            throw new ConfigurationException('isAnimated');
        }
    }
    /** Explicit secret-bearing wire fields; do not log the returned array.
     * @return array{directPath:string,url:string,mediaKey:string,fileSha256:string,fileEncSha256:string,fileLength:int,mimeType:string,thumbnail?:string,waveform?:string,width?:int,height?:int,seconds?:int,mediaKeyTimestamp?:int,isAnimated?:bool} */
    public function toWire(): array
    {
        $this->validate();
        $wire = ['directPath' => $this->directPath,'url' => $this->url,'mediaKey' => base64_encode($this->mediaKey),'fileSha256' => base64_encode($this->fileSha256),'fileEncSha256' => base64_encode($this->fileEncSha256),'fileLength' => $this->fileLength,'mimeType' => $this->mimeType];
        $extra = $this->metadata;
        if ($extra->thumbnail !== null) {
            $wire['thumbnail'] = base64_encode($extra->thumbnail);
        }
        if ($extra->waveform !== null) {
            $wire['waveform'] = base64_encode($extra->waveform);
        }
        if ($extra->width !== null && $extra->height !== null) {
            $wire['width'] = $extra->width;
            $wire['height'] = $extra->height;
        }
        if ($extra->seconds !== null) {
            $wire['seconds'] = $extra->seconds;
        }
        if ($extra->mediaKeyTimestamp !== null) {
            $wire['mediaKeyTimestamp'] = $extra->mediaKeyTimestamp;
        }
        if ($extra->isAnimated !== null) {
            $wire['isAnimated'] = $extra->isAnimated;
        }
        return $wire;
    }
    /** @return array{redacted:true} */
    public function __debugInfo(): array
    {
        return ['redacted' => true];
    }
    /** @return array{redacted:true} */
    public function jsonSerialize(): array
    {
        return ['redacted' => true];
    }
}
