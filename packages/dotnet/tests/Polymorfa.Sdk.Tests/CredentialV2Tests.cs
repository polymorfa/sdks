using Polymorfa.Sdk;
internal static class CredentialV2Tests {
 internal static void Run() {
  const string org="pmfa_AlsicmZjODAzMi10ZXN0LW9ubHkiLCJ0ZXN0IiwiaHR0cHM6Ly9wbGF0Zm9ybS5leGFtcGxlLnRlc3QiLCJwb2x5bW9yZmEtYXBpIiwia2V5IiwiMTExMTExMTEtMTExMS00MTExLTgxMTEtMTExMTExMTExMTExIixudWxsXbjN-6gasxNDFbo2VaQINFS9h-9IDV4h2FAnK4ji8ByM53uN7XQ6MPjmBq13cVl96c-KYIU14G-UZynW-8KxGw8", project="pmfa_pt_AlsicmZjODAzMi10ZXN0LW9ubHkiLCJ0ZXN0IiwiaHR0cHM6Ly9wbGF0Zm9ybS5leGFtcGxlLnRlc3QiLCJwb2x5bW9yZmEtYXBpIiwicHJvamVjdCIsIjIyMjIyMjIyLTIyMjItNDIyMi04MjIyLTIyMjIyMjIyMjIyMiIsbnVsbF35YUtyQHHoF1XFbKgPs7VdbBDzqsuY-qE64Aai_khRLdsvB9SBCsw4YPnmdjSVA6rW4CdtP6NKuj-KlYMZDuAL";
  _ = Credential.OrganizationApiKey(org); _ = Credential.ProjectToken(project);
  foreach(var bad in new[]{org+"=",org+"\n","pmfa_"+new string('A',72),new string('A',16385)}) {
   try { _=Credential.OrganizationApiKey(bad); } catch(PolymorfaConfigurationException) { continue; }
   throw new Exception("Malformed or v1 credential accepted");
  }
  try { _=Credential.ProjectToken("pmfa_pt_"+new string('A',94)); } catch(PolymorfaConfigurationException) { return; }
  throw new Exception("v1 project token accepted");
 }
}
