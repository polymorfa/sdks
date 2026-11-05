<?php

declare(strict_types=1);

namespace Polymorfa\Storage;

/** Metadata-only consumption is deduplicated and cannot import content through ordinary replay. */
enum HistoryDescriptorMode: string
{
    case Decode = 'decode';
    case MetadataOnly = 'metadata-only';
}
