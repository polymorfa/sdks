<?php

declare(strict_types=1);

namespace Polymorfa\Resources;

use GuzzleHttp\ClientInterface;
use Polymorfa\HttpTransport;

final readonly class Voice
{
    public VoiceAudio $audio;
    public VoiceProviderCredentials $providerCredentials;
    public function __construct(HttpTransport $transport, ?string $projectId = null, bool $confineById = false, ?ClientInterface $storage = null)
    {
        $this->audio = new VoiceAudio($transport, $projectId, $confineById, $storage);
        $this->providerCredentials = new VoiceProviderCredentials($transport, $projectId, $confineById);
    }
}
