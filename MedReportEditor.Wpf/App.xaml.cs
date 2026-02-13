using System.Windows;

namespace MedReportEditor.Wpf
{
    public partial class App : Application
    {
        public static string? PipeName { get; private set; }

        protected override void OnStartup(StartupEventArgs e)
        {
            base.OnStartup(e);

            // Parse command line: --pipe <pipeName>
            for (int i = 0; i < e.Args.Length - 1; i++)
            {
                if (e.Args[i] == "--pipe")
                {
                    PipeName = e.Args[i + 1];
                    break;
                }
            }

            if (string.IsNullOrEmpty(PipeName))
            {
                PipeName = "MedReportEditor_" + System.Diagnostics.Process.GetCurrentProcess().Id;
            }
        }
    }
}
