using System.Diagnostics;
using System.Net;
using System.Runtime.InteropServices;

internal static class Program
{
    private const string GameUrl = "http://localhost:8027";

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int MessageBox(IntPtr hWnd, string text, string caption, uint type);

    [STAThread]
    private static async Task<int> Main()
    {
        string? root = FindGameRoot(AppContext.BaseDirectory);
        if (root is null)
        {
            ShowError("Could not find server.js. Keep the launcher in the game folder or one of its subfolders.");
            return 1;
        }

        string logPath = Path.Combine(root, "server.log");
        try
        {
            if (!await IsServerReady())
            {
                var start = new ProcessStartInfo
                {
                    FileName = "node",
                    WorkingDirectory = root,
                    UseShellExecute = false,
                    CreateNoWindow = true,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true
                };
                start.ArgumentList.Add("server.js");

                var server = new Process { StartInfo = start, EnableRaisingEvents = true };
                server.OutputDataReceived += (_, e) => AppendLog(logPath, e.Data);
                server.ErrorDataReceived += (_, e) => AppendLog(logPath, e.Data);
                server.Start();
                server.BeginOutputReadLine();
                server.BeginErrorReadLine();

                bool ready = false;
                for (int i = 0; i < 30; i++)
                {
                    await Task.Delay(500);
                    if (await IsServerReady())
                    {
                        ready = true;
                        break;
                    }
                    if (server.HasExited)
                        break;
                }

                if (!ready)
                {
                    ShowError($"The game server did not start. Make sure Node.js 18 or newer is installed and try again.\n\nDetails: {logPath}");
                    return 1;
                }
            }

            Process.Start(new ProcessStartInfo(GameUrl) { UseShellExecute = true });
            return 0;
        }
        catch (Exception ex)
        {
            AppendLog(logPath, ex.ToString());
            ShowError($"Could not start the game. Make sure Node.js 18 or newer is installed.\n\nDetails: {logPath}");
            return 1;
        }
    }

    private static string? FindGameRoot(string start)
    {
        var directory = new DirectoryInfo(start);
        while (directory is not null)
        {
            if (File.Exists(Path.Combine(directory.FullName, "server.js")) &&
                Directory.Exists(Path.Combine(directory.FullName, "node_modules")))
                return directory.FullName;
            directory = directory.Parent;
        }
        return null;
    }

    private static async Task<bool> IsServerReady()
    {
        try
        {
            using var client = new HttpClient { Timeout = TimeSpan.FromSeconds(1) };
            using var response = await client.GetAsync(GameUrl);
            return response.IsSuccessStatusCode;
        }
        catch (HttpRequestException) { return false; }
        catch (TaskCanceledException) { return false; }
    }

    private static void AppendLog(string path, string? line)
    {
        if (line is null) return;
        try { File.AppendAllText(path, $"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] {line}{Environment.NewLine}"); }
        catch { }
    }

    private static void ShowError(string message) =>
        MessageBox(IntPtr.Zero, message, "Run Game", 0x10);
}
