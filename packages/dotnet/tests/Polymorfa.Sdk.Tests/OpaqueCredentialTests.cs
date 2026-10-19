using Polymorfa.Sdk;
internal static class OpaqueCredentialTests {
 internal static void Run() {
  const string org="pmfa_AAECAwQFBgcICQoLDA0ODxAREhM73f-k", project="pmfa_pt_AAECAwQFBgcICQoLDA0ODxAREhM73f-k";
  _ = Credential.OrganizationApiKey(org); _ = Credential.ProjectToken(project);
  foreach(var bad in new[]{org+"=",org+"\n","pmfa_"+new string('A',72),new string('A',16385)}) {
   try { _=Credential.OrganizationApiKey(bad); } catch(PolymorfaConfigurationException) { continue; }
   throw new Exception("Malformed or v1 credential accepted");
  }
  try { _=Credential.ProjectToken("pmfa_pt_"+new string('A',94)); } catch(PolymorfaConfigurationException) { return; }
  throw new Exception("v1 project token accepted");
 }
}
