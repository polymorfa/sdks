using Microsoft.AspNetCore.Components.WebView;
namespace Polymorfa.Example.Maui;
public partial class MainPage : ContentPage
{
    public MainPage() { InitializeComponent(); }
    private void OnUrlLoading(object? sender, UrlLoadingEventArgs e)
    {
        // Bundled UI is the only content allowed to run with the native app bridge.
        if (e.Url.Host != "0.0.0.1" || e.Url.Scheme != "app") e.UrlLoadingStrategy = UrlLoadingStrategy.OpenExternally;
    }
}
