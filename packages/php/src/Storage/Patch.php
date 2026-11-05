<?php

declare(strict_types=1);

namespace Polymorfa\Storage;

/** Patch never creates an absent row. */
final readonly class Patch extends Upsert
{
}
