<?php

declare(strict_types=1);

namespace Polymorfa;

/** One finite CSV response, retaining its original bytes and header. */
final readonly class CampaignRecipientExportPage
{
    public function __construct(public string $csv, public ?string $nextCursor, public ?string $filename)
    {
    }
}
