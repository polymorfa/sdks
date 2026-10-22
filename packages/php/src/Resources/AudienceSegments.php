<?php

declare(strict_types=1);

namespace Polymorfa\Resources;

use Polymorfa\{ApiResponse,AudienceSegmentValidation,ConfigurationException,ExistingContract,RequestOptions};

/**
 * Organization-owned saved audience segments (contracts/campaign-segments-drip.json).
 * Team keys only: campaigns:read for reads, campaigns:manage for
 * writes and unsaved previews. Revision conflicts and bounded evaluation
 * timeouts return 409 state_conflict; re-read, reconcile or simplify the rules.
 * Writes and previews are sent once.
 *
 * @phpstan-import-type Segment from \Polymorfa\AudienceSegmentModels
 * @phpstan-import-type Rules from \Polymorfa\AudienceSegmentModels
 * @phpstan-import-type Preview from \Polymorfa\AudienceSegmentModels
 * @phpstan-import-type SavedPreview from \Polymorfa\AudienceSegmentModels
 * @phpstan-import-type CreateInput from \Polymorfa\AudienceSegmentModels
 * @phpstan-import-type UpdateInput from \Polymorfa\AudienceSegmentModels
 */
final class AudienceSegments extends Resource
{
    /** @param array{cursor?:string,limit?:int} $params
     * @return ApiResponse<array{data:list<Segment>,page:array{nextCursor:?string,hasMore:bool}}> */
    public function list(array $params = [], ?RequestOptions $options = null): ApiResponse
    { /** @var ApiResponse<array{data:list<Segment>,page:array{nextCursor:?string,hasMore:bool}}> */ return ExistingContract::request($this->transport, 'GET', '/platform/audience-segments', query:$params, options:$options, model:'segments');
    }
    /** @return ApiResponse<array{data:Segment}> */
    public function retrieve(string $id, ?RequestOptions $options = null): ApiResponse
    { /** @var ApiResponse<array{data:Segment}> */ return ExistingContract::request($this->transport, 'GET', self::path($id), options:$options, model:'segment');
    }
    /** @param CreateInput $body
     * @return ApiResponse<array{data:Segment}> */
    public function create(array $body, ?RequestOptions $options = null): ApiResponse
    {
        /** @var array<string,mixed> $untyped Callers can pass arrays outside the declared shape. */
        $untyped = $body;
        AudienceSegmentValidation::rules($untyped['rules'] ?? null);
        /** @var ApiResponse<array{data:Segment}> */ return ExistingContract::request($this->transport, 'POST', '/platform/audience-segments', $body, options:self::once($options), model:'segment');
    }
    /** @param UpdateInput $body
     * @return ApiResponse<array{data:Segment}> */
    public function update(string $id, array $body, ?RequestOptions $options = null): ApiResponse
    {
        $path = self::path($id);
        if (array_key_exists('rules', $body)) {
            AudienceSegmentValidation::rules($body['rules']);
        }
        /** @var ApiResponse<array{data:Segment}> */ return ExistingContract::request($this->transport, 'PATCH', $path, $body, options:self::once($options), model:'segment');
    }
    /** Refused while an unlaunched draft uses the segment. Launched campaigns keep
     * their snapshot and recipients; their segmentId becomes null.
     * @return ApiResponse<array{data:array{deleted:true,id:string}}> */
    public function delete(string $id, int $expectedRevision, ?RequestOptions $options = null): ApiResponse
    { /** @var ApiResponse<array{data:array{deleted:true,id:string}}> */ return ExistingContract::request($this->transport, 'DELETE', self::path($id), query:['expectedRevision' => $expectedRevision], options:self::once($options), model:'segmentDeletion');
    }
    /** Evaluates the saved segment once; an evaluation timeout is a 409.
     * @return ApiResponse<array{data:SavedPreview}> */
    public function preview(string $id, ?RequestOptions $options = null): ApiResponse
    { /** @var ApiResponse<array{data:SavedPreview}> */ return ExistingContract::request($this->transport, 'GET', self::path($id).'/preview', options:self::once($options), model:'savedSegmentPreview');
    }
    /** @param Rules $rules
     * @return ApiResponse<array{data:Preview}> */
    public function previewRules(array $rules, ?RequestOptions $options = null): ApiResponse
    {
        AudienceSegmentValidation::rules($rules);
        /** @var ApiResponse<array{data:Preview}> */ return ExistingContract::request($this->transport, 'POST', '/platform/audience-segments/preview', ['rules' => $rules], options:self::once($options), model:'segmentPreview');
    }
    private static function path(string $id): string
    {
        if (trim($id) === '') {
            throw new ConfigurationException('segmentId');
        }
        return '/platform/audience-segments/'.self::segment($id);
    }
    private static function once(?RequestOptions $options): RequestOptions
    {
        return ($options ?? new RequestOptions())->withoutRetries();
    }
}
