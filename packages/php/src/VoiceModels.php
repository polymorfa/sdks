<?php

declare(strict_types=1);

namespace Polymorfa;

/**
 * @phpstan-type AudioBody string|resource
 * @phpstan-type Tts array{provider:string,voiceId:string,model:string,text:string,characters:int,keySource:string,credentialId:?string}
 * @phpstan-type Asset array{id:string,projectId:string,name:string,source:string,status:string,failureReason:?string,originalFormat:?string,originalContentType:?string,sizeBytes:?int,durationMs:int|float|null,contentSha256:?string,tts:Tts|null,retentionDays:?int,expiresAt:?string,inUseCount:int,revision:int,createdAt:string,updatedAt:string,readyAt:?string}
 * @phpstan-type Upload array{url:string,method:'POST',headers:array<string,string>,maxBytes:int,expiresAt:string}
 * @phpstan-type UploadCreated array{asset:Asset,upload:Upload}
 * @phpstan-type Preview array{url:string,contentType:'audio/ogg',expiresAt:string}
 * @phpstan-type ProviderCredential array{id:string,projectId:?string,provider:string,label:string,keyFingerprint:string,status:string,verifiedAt:?string,lastError:?string,revision:int,createdAt:string,updatedAt:string}
 * @phpstan-type Deleted array{id:string,deleted:true}
 * @phpstan-type ListParams array{status?:'pending_upload'|'uploaded'|'transcoding'|'ready'|'failed',cursor?:string,limit?:int}
 * @phpstan-type ContentType 'audio/mpeg'|'audio/wav'|'audio/x-wav'|'audio/ogg'|'audio/mp4'|'audio/x-m4a'
 * @phpstan-type CreateUploadInput array{name:string,contentType:ContentType,sizeBytes:int,retentionDays?:int}
 * @phpstan-type SynthesizeInput array{name:string,text:string,provider:'elevenlabs',voiceId:string,model?:'eleven_multilingual_v2'|'eleven_flash_v2_5'|'eleven_turbo_v2_5',credentialId?:string,retentionDays?:int}|array{name:string,text:string,provider:'openai',voiceId:'alloy'|'ash'|'ballad'|'coral'|'echo'|'fable'|'nova'|'onyx'|'sage'|'shimmer'|'verse',model?:'gpt-4o-mini-tts'|'tts-1'|'tts-1-hd',credentialId?:string,retentionDays?:int}
 * @phpstan-type UpdateInput array{expectedRevision?:int,name?:string,retentionDays?:?int}
 * @phpstan-type CreateCredentialInput array{provider:'elevenlabs'|'openai',label:string,apiKey:string,projectId?:?string}
 */
final class VoiceModels
{
    private function __construct()
    {
    }
}
