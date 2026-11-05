<?php

declare(strict_types=1);
foreach (['safe','unsafe','cancel'] as $mode) {
    $process = proc_open([PHP_BINARY,__DIR__.'/media-redirect-server.php',$mode], [0 => ['pipe','r'],1 => ['pipe','w'],2 => ['pipe','w']], $pipes);
    check(is_resource($process), 'Native media redirect fixture starts');
    try {
        $target = json_decode(fgets($pipes[1]), true, flags:JSON_THROW_ON_ERROR)['url'];
        $token = new Polymorfa\CancellationToken();
        $nativeHandler = GuzzleHttp\HandlerStack::create();
        $http = new GuzzleHttp\Client(['verify' => false,'headers' => ['Authorization' => 'must-not-forward','Cookie' => 'must-not-forward','X-Caller-Secret' => 'must-not-forward'],'handler' => function ($request, $options) use ($target, $nativeHandler, $mode, $token) {
            if ($request->getUri()->getHost() === 'api.fixture.invalid') {
                return GuzzleHttp\Promise\Create::promiseFor(new GuzzleHttp\Psr7\Response(302, ['Location' => $target,'X-Request-Id' => 'redirect_review']));
            }
            check($options['allow_redirects'] === false, 'Each storage redirect is validated by SDK');
            return $nativeHandler($request, $options)->then(function ($response) use ($mode, $token) {
                if ($mode === 'cancel') {
                    $token->cancel();
                }
                return $response;
            });
        }]);
        $client = new Polymorfa\MessagingClient($credential, baseUrl:'https://api.fixture.invalid', http:$http);
        $options = new Polymorfa\RequestOptions(timeout:2, maxNetworkRetries:0, cancellation:$token);
        if ($mode === 'unsafe') {
            $error = raises(fn () => $client->media->download('fixture', $options), Polymorfa\ServerException::class);
            check($error->errorCode === 'invalid_redirect' && !str_contains($error->getMessage(), 'capability'), 'Public HTTP downgrade refused without exposing signed URL');
        } elseif ($mode === 'cancel') {
            raises(fn () => $client->media->download('fixture', $options), Polymorfa\CancelledException::class);
        } else {
            $result = $client->media->download('fixture', $options);
            check($result->data === 'native three-hop' && $result->metadata->requestId === 'redirect_review', 'Native multi-hop download retains response metadata');
        }
        $state = json_decode(fgets($pipes[1]), true, flags:JSON_THROW_ON_ERROR);
        check($state['valid'] && $state['requests'] === ($mode === 'safe' ? 3 : 1), 'Native redirect requests preserve relative paths and omit credentials');
    } finally {
        proc_terminate($process);
        foreach ($pipes as $pipe) {
            fclose($pipe);
        }
        proc_close($process);
    }
}
echo "Native media redirect hop validation, credential isolation and cancellation checks passed.\n";
