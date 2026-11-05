<?php

declare(strict_types=1);
$id = '12345678-1234-1234-1234-123456789abc';
$upper = strtoupper($id);
$budget = ['scope' => 'project','resourceId' => $id,'projectId' => $id,'name' => 'Project','limitCredits' => null,'spentCredits' => 1.234567,'reservedCredits' => 0,'revision' => 2];
$controls = ['budget' => $budget,'priority' => 3,'priorityRevision' => 4];
$priorities = ['revision' => 4,'projects' => [['id' => $id,'name' => 'Project','priority' => 3]],'customers' => [],'numbers' => []];
$limits = ['checkedAt' => '2026-10-11T00:00:00Z','periodStart' => '2026-10-01T00:00:00Z','periodEnd' => '2026-11-01T00:00:00Z','todayCredits' => 1.234567,'monthCredits' => 2,'daily' => [['date' => '2026-10-11','credits' => 1.234567]],'budgets' => [$budget]];
$cases = [
 ['GET','/platform/billing',null,['data' => ['balanceCents' => 1.234567,'preferredCurrency' => 'USD']],fn ($c) => $c->billing->retrieve()],
 ['GET','/platform/billing/usage',null,['data' => ['activeNumbers' => 2,'totalChargedCents' => 1.234567]],fn ($c) => $c->billing->usage()],
 ['GET','/platform/billing/transactions',null,['data' => [['id' => 'transaction','amountCents' => 1.234567,'balanceAfterCents' => 2,'type' => 'debit','description' => 'Usage','sessionId' => null,'projectId' => null,'tier' => null,'currency' => null,'paymentStatus' => 'paid','createdAt' => 1]]],fn ($c) => $c->billing->listTransactions()],
 ['GET','/platform/billing/pricing',null,['data' => [['id' => 'price','tier' => 'standard','dailyRateCents' => 1.234567,'label' => 'Standard','description' => 'Standard','features' => ['messages']]]],fn ($c) => $c->billing->listPricing()],
 ['GET','/platform/billing/controls/project/'.$id,null,['data' => $controls],fn ($c) => $c->billing->getResourceControls('project', $upper)],
 ['PUT','/platform/billing/controls/project/'.$id,['limitCredits' => null,'priority' => 3,'expectedBudgetRevision' => 2,'expectedPriorityRevision' => 4],['data' => $controls],fn ($c) => $c->billing->setResourceControls('project', $upper, ['limitCredits' => null,'priority' => 3,'expectedBudgetRevision' => 2,'expectedPriorityRevision' => 4])],
 ['GET','/platform/billing/limits?projectId='.$id.'&scope=project',null,['data' => $limits],fn ($c) => $c->billing->getLimits(['projectId' => $upper,'scope' => 'project'])],
 ['PUT','/platform/billing/limits/project/'.$id,['limitCredits' => 1.234567,'expectedRevision' => 2],['data' => ['saved' => true]],fn ($c) => $c->billing->setLimit('project', $upper, ['limitCredits' => 1.234567,'expectedRevision' => 2])],
 ['GET','/platform/billing/priorities?projectId='.$id.'&scope=project',null,['data' => $priorities],fn ($c) => $c->billing->getPriorities(['projectId' => $upper,'scope' => 'project'])],
 ['PUT','/platform/billing/priorities/project/'.$id,['priority' => 3,'expectedRevision' => 4],['data' => $priorities],fn ($c) => $c->billing->setPriority('project', $upper, ['priority' => 3,'expectedRevision' => 4])],
 ['PUT','/platform/billing/priorities',['scope' => 'project','resourceIds' => [$id],'expectedRevision' => 4],['data' => $priorities],fn ($c) => $c->billing->reorderPriorities(['scope' => 'project','resourceIds' => [$upper],'expectedRevision' => 4])],
 ['PUT','/platform/billing/priorities',['scope' => 'resource','projectId' => $id,'resources' => [['scope' => 'number','resourceId' => $id]],'expectedRevision' => 4],['data' => $priorities],fn ($c) => $c->billing->reorderPriorities(['scope' => 'resource','projectId' => $upper,'resources' => [['scope' => 'number','resourceId' => $upper]],'expectedRevision' => 4])],
];
nativeCases($cases, fn ($credential, $url) => new Polymorfa\Client($credential, baseUrl:$url));
$guard = new Polymorfa\Client($credential);
foreach ([1.0000001,0.1 + 0.2,-1,INF] as $value) {
    $error = raises(fn () => $guard->billing->setLimit('project', $id, ['limitCredits' => $value,'expectedRevision' => 0]), Polymorfa\ValidationException::class);
    check($error->errorCode === 'invalid_billing_control', 'Billing error code');
}
raises(fn () => $guard->billing->getResourceControls('project', 'not-a-uuid'), Polymorfa\ValidationException::class);
raises(fn () => $guard->billing->setPriority('project', $id, ['priority' => 1000001,'expectedRevision' => 0]), Polymorfa\ValidationException::class);
raises(fn () => $guard->billing->reorderPriorities(['scope' => 'project','resourceIds' => [$id,$upper],'expectedRevision' => 0]), Polymorfa\ValidationException::class);
