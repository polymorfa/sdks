using Microsoft.AspNetCore.Components.WebAssembly.Hosting;
using Polymorfa.Storage.IndexedDb.BrowserTests;
var builder = WebAssemblyHostBuilder.CreateDefault(args);
builder.RootComponents.Add<App>("#app");
await builder.Build().RunAsync();
