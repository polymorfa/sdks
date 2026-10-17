<?php
declare(strict_types=1);
$org = 'pmfa_AlsicmZjODAzMi10ZXN0LW9ubHkiLCJ0ZXN0IiwiaHR0cHM6Ly9wbGF0Zm9ybS5leGFtcGxlLnRlc3QiLCJwb2x5bW9yZmEtYXBpIiwia2V5IiwiMTExMTExMTEtMTExMS00MTExLTgxMTEtMTExMTExMTExMTExIixudWxsXbjN-6gasxNDFbo2VaQINFS9h-9IDV4h2FAnK4ji8ByM53uN7XQ6MPjmBq13cVl96c-KYIU14G-UZynW-8KxGw8'; $project = 'pmfa_pt_AlsicmZjODAzMi10ZXN0LW9ubHkiLCJ0ZXN0IiwiaHR0cHM6Ly9wbGF0Zm9ybS5leGFtcGxlLnRlc3QiLCJwb2x5bW9yZmEtYXBpIiwicHJvamVjdCIsIjIyMjIyMjIyLTIyMjItNDIyMi04MjIyLTIyMjIyMjIyMjIyMiIsbnVsbF35YUtyQHHoF1XFbKgPs7VdbBDzqsuY-qE64Aai_khRLdsvB9SBCsw4YPnmdjSVA6rW4CdtP6NKuj-KlYMZDuAL';
Polymorfa\Credential::organizationApiKey($org);
Polymorfa\Credential::projectToken($project);
foreach ([$org.'=', $org."\n", 'pmfa_'.str_repeat('A', 72), str_repeat('A', 16385)] as $bad) {
    raises(fn () => Polymorfa\Credential::organizationApiKey($bad), Polymorfa\ConfigurationException::class);
}
raises(fn () => Polymorfa\Credential::projectToken('pmfa_pt_'.str_repeat('A', 94)), Polymorfa\ConfigurationException::class);
