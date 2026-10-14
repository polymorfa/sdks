<?php

declare(strict_types=1);
$cases = [];
foreach ([['[1,2]',[1,2]],['"hello"','hello'],['42',42],['true',true],['false',false],[null,null],['{"nested":{"ok":true}}',['nested' => ['ok' => true]]]] as [$wire,$value]) {
    $cases[] = ['GET','/raw',null,$wire,fn ($c) => $c->raw->request('GET', '/raw'),$value,['responseHeaders' => ['Content-Type' => 'application/json']]];
}
$headers = Polymorfa\GraphTransport::headers('official_api');
$cases[] = ['GET','/graph/catalog',null,['ok' => true],fn ($c) => $c->raw->request('GET', '/graph/catalog', options:new Polymorfa\RequestOptions(headers:$headers)),['ok' => true],['requestHeaders' => $headers]];
nativeCases($cases, fn ($credential, $url) => new Polymorfa\Client($credential, baseUrl:$url));
raises(fn () => Polymorfa\GraphTransport::headers('unknown'), Polymorfa\ValidationException::class);
foreach (['[1,2]','"hello"','false','null'] as $wire) {
    $history = [];
    $client = new Polymorfa\Client($credential, http:mocked([new GuzzleHttp\Psr7\Response(200, ['content-type' => 'application/json'], $wire)], $history));
    raises(fn () => $client->organizations->retrieve(), Polymorfa\ServerException::class);
}
foreach ([['text/html','<html>bad</html>'],['application/json','{broken']] as [$contentType,$wire]) {
    $history = [];
    $client = new Polymorfa\Client($credential, http:mocked([new GuzzleHttp\Psr7\Response(200, ['content-type' => $contentType], $wire)], $history));
    raises(fn () => $client->raw->request('GET', '/raw'), Polymorfa\ServerException::class);
}
$scratch = getenv('HOME').'/.polymorfa-agent-work/raw-parity';
if (!is_dir($scratch)) {
    mkdir($scratch, 0700, true);
}
$state = $scratch.'/requests-'.getmypid().'.json';
file_put_contents($state, '[]');
$socket = stream_socket_server('tcp://127.0.0.1:0', $errno, $message);
$address = stream_socket_get_name($socket, false);
fclose($socket);
$server = proc_open([PHP_BINARY,'-S',$address,__DIR__.'/raw-pagination-server.php'], [0 => ['pipe','r'],1 => ['pipe','w'],2 => ['pipe','w']], $pipes, null, ['POLYMORFA_RAW_PAGINATION_STATE' => $state] + getenv());
$http = new GuzzleHttp\Client(['timeout' => 3]);
try {
    for ($i = 0;$i < 100;$i++) {
        try {
            $http->get('http://'.$address.'/health');
            break;
        } catch (GuzzleHttp\Exception\ConnectException) {
            usleep(10000);
        }
    }
    $client = new Polymorfa\Client($credential, baseUrl:'http://'.$address);
    $project = $client->project('p');
    $decoder = function ($data, $metadata) {
        check($metadata->requestId === 'pagination-wire', 'Raw decoder metadata');
        return ['items' => $data['rows'],'nextCursor' => $data['resume']];
    };
    $page = $project->raw->paginate('POST', '/search', $decoder, ['filter' => 'saved'], ['term' => 'hello'], new Polymorfa\RequestOptions(headers:['X-Test' => 'kept']), 'after');
    check(count(json_decode(file_get_contents($state), true)) === 1 && $page->items === [1,2] && $page->hasMore, 'Raw first page is lazy');
    check(iterator_to_array($page) === [1,2,3], 'Raw decoded iteration');
    $requests = json_decode(file_get_contents($state), true);
    check(count($requests) === 2 && $requests[0]['path'] === '/platform/projects/p/search?filter=saved' && $requests[1]['path'] === '/platform/projects/p/search?filter=saved&after=second', 'Custom cursor and project binding');
    foreach ($requests as $request) {
        check($request['method'] === 'POST' && $request['body'] === ['term' => 'hello'] && $request['headers']['x-test'] === 'kept' && $request['headers']['authorization'] === $credential->authorization(), 'Pagination preserves body and credential');
    }
    $next = $page->nextPage();
    check($next->items === [3] && $next->nextPage() === null, 'Raw manual next page and terminal page');
    $arrayPage = $client->raw->paginate('GET', '/array', fn ($data, $metadata) => ['items' => $data]);
    check($arrayPage->items === [1,2] && !$arrayPage->hasMore, 'Raw array decoder');
    raises(fn () => $project->raw->paginate('GET', '/platform/projects/other/search', $decoder), Polymorfa\ValidationException::class);
    raises(fn () => $client->raw->paginate('GET', '/loop', $decoder, ['after' => 'same'], cursorParameter:'after'), Polymorfa\ServerException::class);
    raises(fn () => $client->raw->paginate('GET', '/array', fn ($data, $metadata) => ['items' => 'invalid']), Polymorfa\ServerException::class);
    raises(fn () => $client->raw->paginate('GET', '/array', fn ($data, $metadata) => ['items' => [],'nextCursor' => 42]), Polymorfa\ServerException::class);
    $token = new Polymorfa\CancellationToken();
    $token->cancel();
    $before = count(json_decode(file_get_contents($state), true));
    raises(fn () => $client->raw->paginate('GET', '/array', fn ($data, $metadata) => ['items' => $data], options:new Polymorfa\RequestOptions(cancellation:$token)), Polymorfa\CancelledException::class);
    check(count(json_decode(file_get_contents($state), true)) === $before, 'Cancelled pagination sends no request');
} finally {
    proc_terminate($server);
    foreach ($pipes as $pipe) {
        fclose($pipe);
    } proc_close($server);
    unlink($state);
}
echo "Raw JSON, decoded pagination, project confinement and Graph header native checks passed.\n";
