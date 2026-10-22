<?php

declare(strict_types=1);

namespace Polymorfa;

/** A customer transport receives encrypted bytes and public hashes only. */
interface WhatsAppMediaUploadTransport
{
    public function name(): string;
    public function upload(string $session, WhatsAppEncryptedUploadBody $body): WhatsAppUploadLocation;
}
