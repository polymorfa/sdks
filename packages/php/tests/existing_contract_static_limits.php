<?php

declare(strict_types=1);

/** PHPStan uses structural array shapes. These excess keys are deliberately
 * accepted by the analyzer; public runtime guards must reject them before HTTP. */
function phpstanStructuralLimits(Polymorfa\Client $team, Polymorfa\MessagingClient $m, string $p, string $id): void
{
    $m->campaigns->create('slug', ['name' => 'x','variableMapping' => ['0' => ['future' => false]]]);
    $team->campaigns->launch($id, ['projectId' => $p,'extra' => false]);
    $team->project($p)->connectionConfiguration->update(['configuration' => [],'revision' => 0,'projectId' => 'foreign']);
    $m->quickLinks->create(['purpose' => 'add_method','connection' => 's','addMethod' => 'linked_devices','signalMode' => 'standard']);
}
