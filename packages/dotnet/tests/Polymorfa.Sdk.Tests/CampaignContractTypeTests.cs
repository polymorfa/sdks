using System.Diagnostics;
using System.Text.Json;

internal static class CampaignContractTypeTests
{
    public static async Task RunAsync()
    {
        var directory = new DirectoryInfo(AppContext.BaseDirectory);
        while (directory is not null && !File.Exists(Path.Combine(directory.FullName, "tests/type-fixtures/campaign-contract/cases.json"))) directory = directory.Parent;
        var project = Path.Combine(directory!.FullName, "tests/type-fixtures/campaign-contract/Contract.csproj");
        var manifest = JsonDocument.Parse(File.ReadAllText(Path.Combine(Path.GetDirectoryName(project)!, "cases.json")));
        async Task<(int Exit, string Log)> Build(string fixture)
        {
            var start = new ProcessStartInfo("dotnet") { RedirectStandardOutput = true, RedirectStandardError = true, UseShellExecute = false };
            foreach (var arg in new[] { "build", project, "--configuration", "Release", "--nologo", "--verbosity", "quiet", "-p:Fixture=" + fixture }) start.ArgumentList.Add(arg);
            using var process = Process.Start(start)!; var stdout = process.StandardOutput.ReadToEndAsync(); var stderr = process.StandardError.ReadToEndAsync();
            await process.WaitForExitAsync().WaitAsync(TimeSpan.FromMinutes(1));
            return (process.ExitCode, await stdout + await stderr);
        }
        var positive = await Build("Valid");
        if (positive.Exit != 0) throw new Exception("Campaign compiler positive control failed: " + positive.Log);
        foreach (var fixture in manifest.RootElement.EnumerateArray())
        {
            var name = fixture.GetProperty("fixture").GetString()!;
            var result = await Build(name);
            var diagnostic = result.Log.Split('\n').FirstOrDefault(line => line.Contains(name + ".cs(" + fixture.GetProperty("line").GetInt32() + ",", StringComparison.Ordinal) && line.Contains("error " + fixture.GetProperty("code").GetString() + ":", StringComparison.Ordinal));
            if (result.Exit == 0 || diagnostic is null || fixture.GetProperty("symbols").EnumerateArray().Any(symbol => !diagnostic.Contains(symbol.GetString()!, StringComparison.Ordinal))) throw new Exception("Expected campaign diagnostic missing for " + name + ": " + result.Log);
        }
        Console.WriteLine("PASS campaign compiler positive control and 15 isolated code/span/symbol negatives");
    }
}
