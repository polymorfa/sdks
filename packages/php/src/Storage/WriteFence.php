<?php

declare(strict_types=1);

namespace Polymorfa\Storage;

/** Same-session CAS fence for a child delete that omits its own revision. */
final class WriteFence
{
    /**
     * @param list<array<string,mixed>> $writes */
    public static function validate(array $writes): void
    {
        $fences = [];
        foreach ($writes as $write) {
            if ($write['kind'] === 'put' && $write['entity'] === 'leases' && isset($write['expectedRev']) && $write['row']['_rev'] === $write['expectedRev'] + 1) {
                $fences[$write['row']['_id']] = true;
            }
        }
        foreach ($writes as $write) {
            if ($write['kind'] === 'delete' && !array_key_exists('expectedRev', $write) && !isset($fences[explode(':', $write['id'], 2)[0]])) {
                throw new StorageException('storage_delete_revision_required');
            }
        }
    }
}
