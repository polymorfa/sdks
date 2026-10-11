<?php

declare(strict_types=1);

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use Polymorfa\{WebhookRequest,WebhookSignatureException};

Route::post('/webhooks/polymorfa',function(Request $request) {
    try {
        $event=WebhookRequest::fromLaravel($request,(string)config('services.polymorfa.webhook_secret'));
    } catch(WebhookSignatureException) {
        return response()->json(['error'=>'invalid_signature'],400);
    }
    // Persist event.id for delivery deduplication before processing its payload.
    return response()->json(['received'=>$event->id]);
});
