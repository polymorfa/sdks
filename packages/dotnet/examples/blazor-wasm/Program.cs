using Microsoft.AspNetCore.Components.WebAssembly.Hosting;
var builder = WebAssemblyHostBuilder.CreateDefault(args);
builder.RootComponents.Add<Polymorfa.Example.Blazor.App>("#app");
await builder.Build().RunAsync();
