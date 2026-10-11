<?php

declare(strict_types=1);

namespace Polymorfa\Resources;

use Polymorfa\{ApiResponse,RequestOptions,MediaDownloadStream,MediaDownloadUrl,MediaFiles,MediaDescriptor,WhatsAppMedia,CancellationToken,Models};

final class Media extends Resource
{
    /** @return ApiResponse<string> */
    public function download(string $id, ?RequestOptions $options = null): ApiResponse
    {
        return $this->transport->binary('/messaging/media/'.self::segment($id), $options);
    }
    public function downloadStream(string $id, ?RequestOptions $options = null): MediaDownloadStream
    {
        return $this->transport->mediaStream('/messaging/media/'.self::segment($id), $options);
    }
    public function downloadUrl(string $id, ?RequestOptions $options = null): MediaDownloadUrl
    {
        return $this->transport->mediaUrl('/messaging/media/'.self::segment($id), $options);
    }
    /** @return ApiResponse<array{path:string,bytes:int}> */
    public function downloadToFile(string $id, string $destination, bool $overwrite = true, int $maxBytes = 268435456, ?RequestOptions $options = null): ApiResponse
    {
        $download = $this->downloadStream($id, $options);
        $size = MediaFiles::write($download->body, $destination, $overwrite, $maxBytes, $options?->cancellation);
        return new ApiResponse(['path' => $destination,'bytes' => $size], $download->metadata);
    }
    public function downloadFromWhatsApp(MediaDescriptor $descriptor, int $maxBytes = WhatsAppMedia::MAX_BYTES, ?CancellationToken $cancellation = null): string
    {
        return WhatsAppMedia::download($descriptor, $maxBytes, $cancellation);
    }
    /** @return ApiResponse<array{success:true,data:array{id:string,session:string,messageId:string,mimeType:string,fileLength:int,persisted:bool,s3Url?:?string}}> */
    public function retrieve(string $id, ?RequestOptions $options = null): ApiResponse
    { /** @var ApiResponse<array{success:true,data:array{id:string,session:string,messageId:string,mimeType:string,fileLength:int,persisted:bool,s3Url?:?string}}> */ return $this->request('GET', '/messaging/media/'.self::segment($id).'/info', options:$options);
    }
    /** @return ApiResponse<array{success:bool,message?:string}> */
    public function persist(string $id, ?RequestOptions $options = null): ApiResponse
    { /** @var ApiResponse<array{success:bool,message?:string}> */ return $this->request('POST','/messaging/media/'.self::segment($id).'/download-and-save',options:$options);
    }
}
