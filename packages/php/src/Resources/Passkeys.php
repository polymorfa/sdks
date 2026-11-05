<?php

declare(strict_types=1);
namespace Polymorfa\Resources;

use Polymorfa\{ApiResponse, RequestOptions, PasskeyModels, ValidationException};

/**
 * @phpstan-import-type Issue from PasskeyModels
 * @phpstan-import-type Ticket from PasskeyModels
 * @phpstan-import-type Submit from PasskeyModels
 * @phpstan-import-type AssertionResult from PasskeyModels
 * @phpstan-import-type Confirm from PasskeyModels
 * @phpstan-import-type Confirmation from PasskeyModels
 */
final class Passkeys extends Resource
{
    private function path(string $session): string
    {
        $this->server();
        return '/messaging/'.$this->segment($session).'/passkey';
    }
    private static function text(mixed $value, ?int $limit = null): bool
    {
        if (!is_string($value) || $value === '') { return false; }
        if ($limit === null) { return true; }
        // JSON escaped UTF-16 units, without requiring an optional mbstring extension.
        $encoded = json_encode($value, JSON_THROW_ON_ERROR);
        preg_match_all('/\\\\u[0-9a-fA-F]{4}|\\\\.|[^"\\\\]/', substr($encoded, 1, -1), $units);
        return count($units[0]) <= $limit;
    }
    /** @param array<string,mixed> $body */
    private static function budget(array $body): void
    {
        if (strlen(json_encode((object)$body, JSON_THROW_ON_ERROR)) > 1048576) { throw new ValidationException('Passkey request exceeds 1 MiB.'); }
    }
    /**
     * Callers can pass any array at runtime, so validate the received shape, not the phpdoc.
     * @param array<string,mixed> $body
     */
    private static function checkIssue(array $body): void
    {
        if ((array_key_exists('challengeB64Url', $body) && !self::text($body['challengeB64Url'])) || (array_key_exists('ttlSeconds', $body) && !is_int($body['ttlSeconds'])) || (array_key_exists('timeoutMs', $body) && (!is_int($body['timeoutMs']) || $body['timeoutMs'] <= 0)) || (array_key_exists('userVerification', $body) && !in_array($body['userVerification'], ['required','preferred','discouraged'], true))) { throw new ValidationException('Invalid challenge options.'); }
    }
    /** @param array<string,mixed> $body */
    private static function checkSubmit(array $body): void
    {
        $a = $body['assertion'] ?? null; $r = is_array($a) ? ($a['response'] ?? null) : null;
        if (!self::text($body['ticketId'] ?? null) || !is_array($a) || !self::text($a['id'] ?? null,1364) || !self::text($a['rawIdB64Url'] ?? null,1364) || !is_array($r) || !self::text($r['authenticatorDataB64'] ?? null) || !self::text($r['clientDataJSONB64'] ?? null) || !self::text($r['signatureB64'] ?? null)) { throw new ValidationException('Provide the ticket and bounded assertion.'); }
        if (array_key_exists('userHandleB64',$r) && (!is_string($r['userHandleB64']) || ($r['userHandleB64'] !== '' && !self::text($r['userHandleB64'],86)))) { throw new ValidationException('userHandleB64 exceeds 86 characters.'); }
    }
    /** @param array<string,mixed> $body */
    private static function checkConfirm(array $body): void
    {
        if (!self::text($body['ticketId'] ?? null) || (array_key_exists('code',$body) && (!is_string($body['code']) || !preg_match('/^[A-Z0-9]{4}-[A-Z0-9]{4}$/D',$body['code'])))) { throw new ValidationException('Provide the ticket and optional confirmation code.'); }
    }
    /**
     * userVerification and timeoutMs are deprecated ignored inputs; the runner owns them.
     * @param Issue $body
     * @return ApiResponse<array{success:true,data:Ticket}>
     */
    public function issueChallenge(string $session, array $body = [], ?RequestOptions $options = null): ApiResponse
    {
        $path = $this->path($session);
        self::checkIssue($body);
        self::budget($body);
        /** @var ApiResponse<array{success:true,data:Ticket}> */
        return $this->request('POST', $path.'/challenge', (object)$body, options:($options ?? new RequestOptions())->withoutRetries());
    }
    /** @return ApiResponse<array{success:true,data:Ticket}> */
    public function getChallenge(string $session, string $ticketId, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<array{success:true,data:Ticket}> */
        return $this->request('GET', $this->path($session).'/challenge/'.$this->segment($ticketId), options:$options);
    }
    /**
     * @param Submit $body
     * @return ApiResponse<array{success:true,data:AssertionResult}>
     */
    public function submitAssertion(string $session, array $body, ?RequestOptions $options = null): ApiResponse
    {
        $path = $this->path($session);
        self::checkSubmit($body);
        self::budget($body);
        /** @var ApiResponse<array{success:true,data:AssertionResult}> */
        return $this->request('POST', $path.'/assertion', $body, options:($options ?? new RequestOptions())->withoutRetries());
    }
    /** @return ApiResponse<array{success:true,data:Confirmation}> */
    public function getConfirmation(string $session, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<array{success:true,data:Confirmation}> */
        return $this->request('GET', $this->path($session).'/confirmation', options:$options);
    }
    /**
     * @param Confirm $body
     * @return ApiResponse<array{success:true,data:Confirmation}>
     */
    public function confirm(string $session, array $body, ?RequestOptions $options = null): ApiResponse
    {
        $path = $this->path($session);
        self::checkConfirm($body);
        self::budget($body);
        /** @var ApiResponse<array{success:true,data:Confirmation}> */
        return $this->request('POST', $path.'/confirmation', $body, options:($options ?? new RequestOptions())->withoutRetries());
    }
}
