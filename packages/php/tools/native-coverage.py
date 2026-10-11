"""Reconcile explicit handwritten native evidence; never generates SDK resources or types."""
import json
from pathlib import Path
package = Path(__file__).resolve().parents[1]
manifest = json.loads((package / 'coverage.json').read_text())
evidence = [
 ('GET','/platform/team','organizations.retrieve','accounts'),
 ('GET','/platform/members','members.list','accounts'),
 ('GET','/platform/keys','apiKeys.list','accounts'),
 ('DELETE','/platform/keys/{keyId}','apiKeys.deactivate','accounts'),
 ('GET','/platform/tokens','projectTokens.list','accounts'),
 ('GET','/platform/projects','projects.list','accounts'),
 ('POST','/platform/projects','projects.create','accounts'),
 ('GET','/platform/projects/{projectId}/hybrid-merge-candidates','projects.listHybridMergeCandidates','accounts'),
 ('POST','/platform/projects/{projectId}/promote','projects.requestProductionEnrollment','accounts'),
 ('POST','/platform/projects/{projectId}/production-enrollments/{operationId}/approve','projects.approveProductionEnrollment','accounts'),
 ('POST','/platform/projects/{projectId}/production-enrollments/{operationId}/cancel','projects.cancelProductionEnrollment','accounts'),
 ('GET','/platform/sessions','sessions.list','platform_sessions'),
 ('GET','/platform/sessions/{sessionId}','sessions.retrieve','platform_sessions'),
 ('PUT','/platform/sessions/{sessionId}','sessions.update','platform_sessions'),
 ('POST','/platform/sessions/{sessionId}/start','sessions.start','platform_sessions'),
 ('POST','/platform/sessions/{sessionId}/stop','sessions.stop','platform_sessions'),
 ('POST','/platform/sessions/stop','sessions.stopMany','platform_sessions'),
 ('DELETE','/platform/sessions/{sessionId}','sessions.delete','platform_sessions'),
 ('POST','/platform/sessions/delete','sessions.deleteMany','platform_sessions'),
 ('POST','/platform/sessions/{sessionId}/tier-quotes','sessions.quoteTierChange','platform_sessions'),
 ('GET','/platform/sessions/{sessionId}/tier-quotes/{quoteId}','sessions.retrieveTierChange','platform_sessions'),
 ('PATCH','/platform/sessions/{sessionId}','sessions.setTierOverride','platform_sessions'),
 ('GET','/platform/sessions/{sessionId}/capabilities','sessions.getCapabilities','platform_sessions'),
 ('GET','/platform/audit','auditLogs.list','security'),
 ('GET','/platform/bans','sessionBans.list','security'),
 ('GET','/platform/bans/active','sessionBans.listActive','security'),
 ('GET','/platform/incidents','securityIncidents.list','security'),
 ('POST','/platform/incidents/{incidentId}/acknowledge','securityIncidents.acknowledge','security'),
 ('GET','/platform/optouts','optOuts.list','security'),
 ('POST','/platform/optouts','optOuts.create','security'),
 ('POST','/platform/optouts/batch','optOuts.createBatch','security'),
 ('GET','/platform/optouts/settings','optOuts.getSettings','security'),
 ('PUT','/platform/optouts/settings','optOuts.updateSettings','security'),
 ('DELETE','/platform/optouts/{phone}','optOuts.delete','security'),
 ('GET','/platform/billing','billing.retrieve','billing'),
 ('GET','/platform/billing/usage','billing.usage','billing'),
 ('GET','/platform/billing/transactions','billing.listTransactions','billing'),
 ('GET','/platform/billing/pricing','billing.listPricing','billing'),
 ('GET','/platform/billing/controls/{scope}/{resourceId}','billing.getResourceControls','billing'),
 ('PUT','/platform/billing/controls/{scope}/{resourceId}','billing.setResourceControls','billing'),
 ('GET','/platform/billing/limits','billing.getLimits','billing'),
 ('PUT','/platform/billing/limits/{scope}/{resourceId}','billing.setLimit','billing'),
 ('GET','/platform/billing/priorities','billing.getPriorities','billing'),
 ('PUT','/platform/billing/priorities/{scope}/{resourceId}','billing.setPriority','billing'),
 ('PUT','/platform/billing/priorities','billing.reorderPriorities','billing'),
]
for method,path,name,test in evidence:
 matches=[op for op in manifest['operations'] if op['family']=='platform' and op['method']==method and op['path']==path]
 assert len(matches)==1, (method,path)
 assert (package/'tests'/f'{test}.php').exists()
 op=matches[0]
 for field in ['reason','milestone']:op.pop(field,None)
 op.update(status='covered',sdkMethod=f'Client::{name}',testFile=f'tests/{test}.php')
(package/'coverage.json').write_text(json.dumps(manifest,indent=2)+'\n')
print({status:sum(op['status']==status for op in manifest['operations']) for status in ['covered','excluded','missing']})
