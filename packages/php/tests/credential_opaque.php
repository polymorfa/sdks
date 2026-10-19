<?php
declare(strict_types=1);
$org = 'pmfa_AAECAwQFBgcICQoLDA0ODxAREhM73f-k'; $project = 'pmfa_pt_AAECAwQFBgcICQoLDA0ODxAREhM73f-k';
Polymorfa\Credential::organizationApiKey($org);
Polymorfa\Credential::projectToken($project);
foreach ([$org.'=', $org."\n", 'pmfa_'.str_repeat('A', 72), str_repeat('A', 16385)] as $bad) {
    raises(fn () => Polymorfa\Credential::organizationApiKey($bad), Polymorfa\ConfigurationException::class);
}
raises(fn () => Polymorfa\Credential::projectToken('pmfa_pt_'.str_repeat('A', 94)), Polymorfa\ConfigurationException::class);
