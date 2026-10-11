<?php

declare(strict_types=1);

namespace Polymorfa;

/**
 * @phpstan-type Theme 'light'|'dark'|'system'
 * @phpstan-type Shape 'square'|'rounded'|'pill'
 * @phpstan-type LogoMode 'none'|'custom'|'organization'|'project'
 * @phpstan-type HistorySync 'ask'|'force_on'|'force_off'
 * @phpstan-type Method 'qr'|'pairing'
 * @phpstan-type Settings array{id:string,projectId:?string,enabled:bool,successCallbackUrl:?string,failureCallbackUrl:?string,businessName:?string,headline:?string,description:?string,successMessage:?string,supportUrl:?string,privacyUrl:?string,termsUrl:?string,accent:?string,theme:Theme,hideWatermark:bool,allowPhoneChange:bool,shape:Shape|null,radiusPx:?int,logoMode:LogoMode,logoStorageId:?string,logoSourceStorageId:?string,logoUrl:?string,historySync:HistorySync,methods:list<Method>|null,defaultMethod:Method|null,createdAt:int,updatedAt:int}
 * @phpstan-type UpdateInput array{enabled?:bool,successCallbackUrl?:?string,failureCallbackUrl?:?string,businessName?:?string,headline?:?string,description?:?string,successMessage?:?string,supportUrl?:?string,privacyUrl?:?string,termsUrl?:?string,accent?:?string,theme?:Theme,hideWatermark?:bool,allowPhoneChange?:bool,shape?:Shape|null,radiusPx?:?int,logoMode?:LogoMode,logoStorageId?:?string,logoSourceStorageId?:?string,historySync?:HistorySync,methods?:list<Method>|null,defaultMethod?:Method|null}
 */
final class QuickLinkSettingsModels
{
    private function __construct()
    {
    }
}
