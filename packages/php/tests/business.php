<?php

declare(strict_types=1);

$profile = ['id' => 'user_1','address' => 'Example Street','email' => 'contact@example.com','description' => 'Store','websites' => ['https://example.com'],'coverPhotoId' => 'cover_1','categories' => [['id' => 'cat_1','name' => 'Store']], 'options' => ['commerce' => 'enabled'],'hoursTimeZone' => 'UTC','hours' => [['dayOfWeek' => 'mon','mode' => 'specific_hours','openTime' => '09:00','closeTime' => '17:00']]];
$update = ['description' => 'Updated store','hours' => ['timeZone' => 'UTC','days' => [['dayOfWeek' => 'mon','mode' => 'specific_hours','openTime' => 540,'closeTime' => 1020],['dayOfWeek' => 'tue','mode' => 'open_24h']]]];
$compliance = ['entityName' => 'Example Company','entityType' => 'PRIVATE_COMPANY','isRegistered' => true,'entityTypeCustom' => '', 'customerCare' => ['email' => 'care@example.com','landlineNumber' => '+15551234567','mobileNumber' => '+15557654321'], 'grievanceOfficer' => ['name' => 'Ada','email' => 'grievance@example.com','landlineNumber' => '+15551234567','mobileNumber' => '+15557654321']];
$linked = ['facebookPage' => ['id' => 'page_1','displayName' => 'Store','profileSync' => 'import','profilePictureUrl' => 'https://example.com/image','showOnProfile' => true,'whatsAppAsPageButton' => true,'hasActiveCTWAAd' => false,'hasCreatedAd' => true], 'facebookBusiness' => ['id' => 'business_1','displayName' => 'Store','catalogId' => 'catalog_1','catalogState' => 'import'], 'instagramProfessional' => ['handle' => 'store','displayName' => 'Store','profilePictureUrl' => 'https://example.com/image','showOnProfile' => true], 'whatsAppAdIdentity' => ['id' => 'ad_1','hasActiveCTWAAd' => false,'hasCreatedAd' => true]];
$eligibility = ['features' => [['feature' => 'meta_verified','status' => 'eligible','expiration' => 1893456000,'additionalParams' => '', 'showPrivacyInterstitialToNewUsers' => false, 'v1Enabled' => true]]];
$cases = [
 ['GET','/profile',null,$profile,fn ($r) => $r->getProfile('support')],
 ['PATCH','/profile',$update,['status' => 'OK'],fn ($r) => $r->updateProfile('support', $update)],
 ['PUT','/profile/cover-photo',['url' => 'https://example.com/cover.jpg'],['coverPhotoId' => 'cover_2'],fn ($r) => $r->setCoverPhoto('support', ['url' => 'https://example.com/cover.jpg'])],
 ['DELETE','/profile/cover-photo/cover_1',null,['status' => 'OK'],fn ($r) => $r->deleteCoverPhoto('support', 'cover_1')],
 ['GET','/compliance',null,$compliance,fn ($r) => $r->getMerchantCompliance('support')],
 ['PUT','/compliance',$compliance,$compliance,fn ($r) => $r->setMerchantCompliance('support', $compliance)],
 ['GET','/linked-accounts',null,$linked,fn ($r) => $r->getLinkedAccounts('support')],
 ['GET','/eligibility',null,$eligibility,fn ($r) => $r->getEligibility('support')],
];
foreach ($cases as [$method,$suffix,$body,$data,$invoke]) {
    foreach ($method === 'GET' ? [false] : [false,true] as $accepted) {
        $fixture = ['success' => true,'data' => $accepted ? ['requestId' => 'rpc_1'] : $data];
        $history = [];
        $client = new Polymorfa\MessagingClient($credential, http:mocked([jsonResponse($fixture, $accepted ? 202 : 200)], $history));
        $result = $invoke($client->business);
        $request = $history[0]['request'];
        check($request->getMethod() === $method && $request->getUri()->getPath() === '/messaging/support/business'.$suffix, 'Business route');
        check(json_decode((string)$request->getBody(), true) === $body, 'Business body');
        check($result->data === $fixture && $result->metadata->requestId === 'req_test', 'Business typed result and metadata');
    }
}
echo count($cases)." typed business methods and asynchronous variants passed.\n";
