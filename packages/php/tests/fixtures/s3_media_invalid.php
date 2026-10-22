<?php

declare(strict_types=1);

use Polymorfa\{MediaDescriptor,RequestOptions,S3ArchiveOptions,S3MediaStore};
use Polymorfa\Resources\WhatsAppMedia;

function s3InvalidUsage(S3MediaStore $store, WhatsAppMedia $media, MediaDescriptor $descriptor): void
{
    new S3ArchiveOptions(123);
    new S3MediaStore('invalid', 'bucket');
    $store->archive($descriptor, new RequestOptions());
    $store->uploadToWhatsApp($media, 'session', 'key', new S3ArchiveOptions('key'));
}
