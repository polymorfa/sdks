<?php

declare(strict_types=1);

use Polymorfa\{WebhookRequest,WebhookSignatureException};
use Symfony\Component\HttpFoundation\{Request,JsonResponse};

function polymorfaWebhook(Request $request,string $signingSecret):JsonResponse
{
    if($request->getMethod()!=='POST') { return new JsonResponse(['error'=>'method_not_allowed'],405); }
    try {
        $event=WebhookRequest::fromSymfony($request,$signingSecret);
    } catch(WebhookSignatureException) {
        return new JsonResponse(['error'=>'invalid_signature'],400);
    }
    return new JsonResponse(['received'=>$event->id]);
}
