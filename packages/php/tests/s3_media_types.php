<?php

declare(strict_types=1);

use Polymorfa\{MediaDescriptor,S3ArchiveOptions,S3MediaStore,UploadWhatsAppMediaOptions};
use Polymorfa\Resources\WhatsAppMedia;

function s3TypedUsage(object $officialClient, WhatsAppMedia $resource, MediaDescriptor $descriptor, string $scratch): void
{
    $store = new S3MediaStore($officialClient, 'customer-bucket', prefix:'media/');
    $store->uploadToWhatsApp($resource, 'session', 'object', new UploadWhatsAppMediaOptions('document', egress:'direct'));
    $result = $store->archive($descriptor, new S3ArchiveOptions('archive', metadata:['purpose' => 'customer'], scratchDirectory:$scratch));
    if ($result->bytes < 0) {
        throw new LogicException('Invalid archive size.');
    } $store->close();
}
