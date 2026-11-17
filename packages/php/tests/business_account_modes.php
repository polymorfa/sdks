<?php

declare(strict_types=1);

$businessModeCases = [];
foreach (['whatsapp_app', 'business_app', 'meta_cloud', 'meta_coexistence'] as $account) {
    $businessModeCases[] = ['PUT', '/messaging/demo%20%2Fa/phone/account-mode', ['accountType' => $account], ['session' => 'demo /a', 'accountType' => $account, 'primaryPlatform' => null, 'changed' => true, 'unlinkedDevices' => [2, 7]], fn ($c) => $c->testing->setAccountMode('demo /a', ['accountType' => $account])];
}
$businessModeCases[] = ['PUT', '/messaging/demo/phone/account-mode', ['accountType' => 'business_app', 'primaryPlatform' => 'ios'], ['session' => 'demo', 'accountType' => 'business_app', 'primaryPlatform' => 'ios', 'changed' => false, 'unlinkedDevices' => []], fn ($c) => $c->testing->setAccountMode('demo', ['accountType' => 'business_app', 'primaryPlatform' => 'ios'])];
nativeCases($businessModeCases, fn ($credential, $url) => new Polymorfa\MessagingClient($credential, baseUrl: $url));
foreach ([[], ['accountType' => 'personal'], ['accountType' => 'business'], ['accountType' => 'meta_cloud', 'primaryPlatform' => 'android'], ['accountType' => 'business_app', 'primaryPlatform' => null], ['accountType' => 'business_app', 'extra' => true]] as $invalid) {
    $captured = [];
    $client = new Polymorfa\MessagingClient($credential, http: mocked([], $captured));
    raises(fn () => $client->testing->setAccountMode('demo', $invalid), Polymorfa\ConfigurationException::class);
    check($captured === [], 'Invalid mode refused before transport');
}
raises(fn () => (new Polymorfa\MessagingClient(Polymorfa\Credential::clientToken('pmfa_ct_Zml4dHVyZQ')))->testing->setAccountMode('demo', ['accountType' => 'business_app']), Polymorfa\ConfigurationException::class);
foreach ([[], ['session' => 'demo', 'accountType' => 'business', 'primaryPlatform' => null, 'changed' => false, 'unlinkedDevices' => []], ['session' => 'demo', 'accountType' => 'business_app', 'changed' => false, 'unlinkedDevices' => []]] as $malformed) {
    $captured = [];
    $client = new Polymorfa\MessagingClient($credential, http: mocked([jsonResponse($malformed)], $captured));
    raises(fn () => $client->testing->setAccountMode('demo', ['accountType' => 'business_app']), Polymorfa\ServerException::class);
}
$encryptionCases = [];
foreach (['end_to_end', 'hybrid', 'not_end_to_end', null] as $encryption) {
    $profile = ['id' => '123', 'address' => '', 'email' => '', 'description' => '', 'websites' => [], 'coverPhotoId' => '', 'categories' => [], 'options' => (object) [], 'hoursTimeZone' => '', 'hours' => []];
    if ($encryption !== null) { $profile['encryption'] = $encryption; }
    $body = ['success' => true, 'data' => $profile];
    // The PHP public model returns JSON objects as associative maps.
    $expected = json_decode(json_encode($body, JSON_THROW_ON_ERROR), true, 512, JSON_THROW_ON_ERROR);
    $encryptionCases[] = ['GET', '/messaging/demo/contacts/123/business-profile', null, $body, fn ($c) => $c->contacts->businessProfile('demo', '123'), $expected];
}
nativeCases($encryptionCases, fn ($credential, $url) => new Polymorfa\MessagingClient($credential, baseUrl: $url));

$businessQuickLink = ['configuration' => ['testing' => ['configuration' => ['accountType' => 'business_app', 'primaryPlatform' => 'ios', 'replyBehavior' => 'echo']]]];
nativeCases([['POST', '/messaging/quicklinks', $businessQuickLink, ['success' => true, 'data' => ['id' => 'ql', 'url' => 'https://example.test/ql', 'session' => 'demo', 'purpose' => 'initial', 'connectionGoal' => 'single', 'expiresAt' => null]], fn ($c) => $c->quickLinks->create($businessQuickLink)]], fn ($credential, $url) => new Polymorfa\MessagingClient($credential, baseUrl: $url));
foreach ([['accountType' => 'business'], ['accountType' => 'meta_cloud', 'primaryPlatform' => 'ios']] as $mode) {
    $captured = [];
    $client = new Polymorfa\MessagingClient($credential, http: mocked([], $captured));
    raises(fn () => $client->quickLinks->create(['configuration' => ['testing' => ['configuration' => $mode]]]), Polymorfa\ConfigurationException::class);
    check($captured === [], 'Invalid QuickLink mode refused before transport');
}
