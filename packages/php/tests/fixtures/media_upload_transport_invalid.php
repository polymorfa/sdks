<?php

declare(strict_types=1);

use Polymorfa\{Resources\WhatsAppMedia,UploadWhatsAppMediaOptions,WhatsAppEncryptedUploadBody};

function invalidEncryptedTransport(WhatsAppMedia $resource, WhatsAppEncryptedUploadBody $body): void
{
    new UploadWhatsAppMediaOptions('image', uploadTransport:'relay');
    $resource->uploadTransport('direct', 'invalid-options');
    $body->open(offset:'invalid-offset');
    $body->open(cancellation:'invalid-token');
}
