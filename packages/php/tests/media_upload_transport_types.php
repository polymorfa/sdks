<?php

declare(strict_types=1);

use Polymorfa\{Resources\WhatsAppMedia,UploadWhatsAppMediaOptions,WhatsAppEncryptedUploadBody,WhatsAppMediaUploadTransport,WhatsAppUploadLocation};
use Psr\Http\Message\StreamInterface;

function encryptedTransportTypes(WhatsAppMedia $resource, WhatsAppMediaUploadTransport $transport, WhatsAppEncryptedUploadBody $body): void
{
    $options = new UploadWhatsAppMediaOptions('image', uploadTransport:$transport);
    $resource->uploadBytes('session', 'synthetic', $options);
    $builtin = $resource->uploadTransport('relay', new UploadWhatsAppMediaOptions('image'));
    $location = $builtin->upload('session', $body);
    encryptedTransportLocation($location);
    encryptedTransportStream($body->open(offset:0));
    $resource->uploadBytes('session', 'synthetic', new UploadWhatsAppMediaOptions('image', uploadTransport:$builtin));
}
function encryptedTransportLocation(WhatsAppUploadLocation $location): void
{
}
function encryptedTransportStream(StreamInterface $stream): void
{
}
