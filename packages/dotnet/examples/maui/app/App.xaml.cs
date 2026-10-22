namespace Polymorfa.Example.Maui;
public partial class App : Application
{
    public App() { InitializeComponent(); }
    protected override Window CreateWindow(IActivationState? state) => new(new MainPage()) { Title = "Polymorfa MAUI", Width = 1024, Height = 850 };
}
