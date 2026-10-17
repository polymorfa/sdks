using Polymorfa.Example.Maui.Bridge;
namespace Polymorfa.Example.Maui;
public static class MauiProgram
{
    public static MauiApp CreateMauiApp()
    {
        var builder = MauiApp.CreateBuilder().UseMauiApp<App>();
        builder.Services.AddMauiBlazorWebView();
        // These are build-owned addresses; JavaScript and runtime environment cannot repoint a signed app.
#if DEBUG
        var applicationServer = new Uri("http://127.0.0.1:58284/");
#else
        var applicationServer = new Uri("https://your-application.example/");
#endif
        builder.Services.AddSingleton(new ApplicationBridge(applicationServer));
        return builder.Build();
    }
}
