using System.IO;
using System.IO.Pipes;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Interop;
using System.Windows.Media;
using Telerik.Windows.Documents.FormatProviders.Rtf;
using Telerik.Windows.Documents.FormatProviders.Pdf;
using Telerik.Windows.Documents.Layout;
using Telerik.Windows.Documents.Model;
using Telerik.Windows.Documents.Model.Styles;

namespace MedReportEditor.Wpf
{
    public partial class MainWindow : Window
    {
        [DllImport("user32.dll", SetLastError = true)]
        private static extern IntPtr SetParent(IntPtr hWndChild, IntPtr hWndNewParent);

        [DllImport("user32.dll", SetLastError = true)]
        private static extern int SetWindowLong(IntPtr hWnd, int nIndex, int dwNewLong);

        [DllImport("user32.dll", SetLastError = true)]
        private static extern int GetWindowLong(IntPtr hWnd, int nIndex);

        [DllImport("user32.dll", SetLastError = true)]
        private static extern bool MoveWindow(IntPtr hWnd, int x, int y, int width, int height, bool repaint);

        [DllImport("user32.dll")]
        private static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

        [DllImport("user32.dll")]
        private static extern IntPtr SetFocus(IntPtr hWnd);

        [DllImport("user32.dll")]
        private static extern IntPtr GetForegroundWindow();

        [DllImport("user32.dll")]
        private static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);

        [DllImport("kernel32.dll")]
        private static extern uint GetCurrentThreadId();

        [DllImport("user32.dll")]
        private static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool fAttach);

        private const int GWL_STYLE = -16;
        private const int GWL_EXSTYLE = -20;
        private const int WS_CHILD = 0x40000000;
        private const int WS_EX_APPWINDOW = 0x00040000;
        private const int WS_EX_TOOLWINDOW = 0x00000080;
        private const int SW_SHOW = 5;
        private const int SW_HIDE = 0;

        [DllImport("user32.dll")]
        private static extern bool ClientToScreen(IntPtr hWnd, ref POINT lpPoint);

        [StructLayout(LayoutKind.Sequential)]
        private struct POINT { public int X; public int Y; }

        private const int WS_THICKFRAME = 0x00040000;

        private IntPtr _myHwnd = IntPtr.Zero;
        private IntPtr _parentHwnd = IntPtr.Zero;
        private bool _isOverlay = false;

        private CancellationTokenSource? _cts;
        private NamedPipeServerStream? _pipeServer;
        private bool _isDocumentDirty = false;

        // Font sizes comuni per la ComboBox
        private static readonly double[] FontSizes = { 8, 9, 10, 11, 12, 13, 14, 16, 18, 20, 22, 24, 26, 28, 36, 48 };

        // Font families comuni
        private static readonly string[] CommonFonts = {
            "Arial", "Arial Narrow", "Calibri", "Cambria", "Comic Sans MS",
            "Consolas", "Courier New", "Georgia", "Segoe UI", "Tahoma",
            "Times New Roman", "Trebuchet MS", "Verdana"
        };

        private bool _suppressFontFamilyChange = false;
        private bool _suppressFontSizeChange = false;
        private bool _suppressZoomSlider = false;

        public MainWindow()
        {
            InitializeComponent();
            editor.DocumentChanged += (s, e) => _isDocumentDirty = true;

            // Popola ComboBox font family
            foreach (var font in CommonFonts)
                cmbFontFamily.Items.Add(font);
            cmbFontFamily.SelectedItem = "Arial";

            // Popola ComboBox font size
            foreach (var size in FontSizes)
                cmbFontSize.Items.Add(size);
            cmbFontSize.SelectedItem = 12.0;

            // Aggiorna le combobox quando cambia la selezione nell'editor
            editor.CurrentEditingStyleChanged += Editor_CurrentEditingStyleChanged;
        }

        private void Editor_CurrentEditingStyleChanged(object sender, EventArgs e)
        {
            try
            {
                // Aggiorna font family combobox
                var currentFontFamily = editor.CurrentEditingStyle.GetPropertyValue(Span.FontFamilyProperty) as FontFamily;
                if (currentFontFamily != null)
                {
                    _suppressFontFamilyChange = true;
                    cmbFontFamily.Text = currentFontFamily.Source;
                    _suppressFontFamilyChange = false;
                }

                // Aggiorna font size combobox
                var currentFontSize = editor.CurrentEditingStyle.GetPropertyValue(Span.FontSizeProperty);
                if (currentFontSize is double fontSize && fontSize > 0)
                {
                    _suppressFontSizeChange = true;
                    // Telerik usa unit-less value (in DIP), il font size in punti = DIP * 72 / 96
                    var pointSize = Math.Round(fontSize * 72.0 / 96.0, 1);
                    cmbFontSize.Text = pointSize.ToString();
                    _suppressFontSizeChange = false;
                }
            }
            catch
            {
                // Ignora errori durante l'aggiornamento delle combobox
            }
        }

        private async void Window_Loaded(object sender, RoutedEventArgs e)
        {
            _cts = new CancellationTokenSource();
            statusText.Text = $"Pipe: {App.PipeName}";
            await StartPipeServerAsync(_cts.Token);
        }

        private void Window_Closing(object sender, System.ComponentModel.CancelEventArgs e)
        {
            _cts?.Cancel();
            _pipeServer?.Dispose();
        }

        #region Toolbar Handlers

        private void BtnBold_Click(object sender, RoutedEventArgs e)
        {
            editor.ToggleBold();
            editor.Focus();
        }

        private void BtnItalic_Click(object sender, RoutedEventArgs e)
        {
            editor.ToggleItalic();
            editor.Focus();
        }

        private void BtnUnderline_Click(object sender, RoutedEventArgs e)
        {
            editor.ToggleUnderline();
            editor.Focus();
        }

        private void BtnStrikethrough_Click(object sender, RoutedEventArgs e)
        {
            editor.ToggleStrikethrough();
            editor.Focus();
        }

        private void BtnUndo_Click(object sender, RoutedEventArgs e)
        {
            editor.Undo();
            editor.Focus();
        }

        private void BtnRedo_Click(object sender, RoutedEventArgs e)
        {
            editor.Redo();
            editor.Focus();
        }

        private void BtnAlignLeft_Click(object sender, RoutedEventArgs e)
        {
            editor.ChangeTextAlignment(RadTextAlignment.Left);
            editor.Focus();
        }

        private void BtnAlignCenter_Click(object sender, RoutedEventArgs e)
        {
            editor.ChangeTextAlignment(RadTextAlignment.Center);
            editor.Focus();
        }

        private void BtnAlignRight_Click(object sender, RoutedEventArgs e)
        {
            editor.ChangeTextAlignment(RadTextAlignment.Right);
            editor.Focus();
        }

        private void BtnAlignJustify_Click(object sender, RoutedEventArgs e)
        {
            editor.ChangeTextAlignment(RadTextAlignment.Justify);
            editor.Focus();
        }

        private void BtnBullets_Click(object sender, RoutedEventArgs e)
        {
            editor.Commands.ToggleBulletsCommand.Execute();
            editor.Focus();
        }

        private void BtnNumbering_Click(object sender, RoutedEventArgs e)
        {
            editor.Commands.ToggleNumberedCommand.Execute();
            editor.Focus();
        }

        private void BtnDecreaseIndent_Click(object sender, RoutedEventArgs e)
        {
            editor.Commands.DecrementParagraphLeftIndentCommand.Execute();
            editor.Focus();
        }

        private void BtnIncreaseIndent_Click(object sender, RoutedEventArgs e)
        {
            editor.Commands.IncrementParagraphLeftIndentCommand.Execute();
            editor.Focus();
        }

        private void CmbFontFamily_SelectionChanged(object sender, SelectionChangedEventArgs e)
        {
            if (_suppressFontFamilyChange) return;
            if (cmbFontFamily.SelectedItem is string fontName && !string.IsNullOrEmpty(fontName))
            {
                editor.ChangeFontFamily(new FontFamily(fontName));
                editor.Focus();
            }
        }

        private void CmbFontSize_SelectionChanged(object sender, SelectionChangedEventArgs e)
        {
            if (_suppressFontSizeChange) return;
            if (cmbFontSize.SelectedItem is double size && size > 0)
            {
                editor.ChangeFontSize(size);
                editor.Focus();
            }
        }

        private void CmbFontSize_KeyDown(object sender, KeyEventArgs e)
        {
            if (e.Key == Key.Enter)
            {
                if (double.TryParse(cmbFontSize.Text, out var size) && size > 0 && size <= 200)
                {
                    editor.ChangeFontSize(size);
                    editor.Focus();
                }
            }
        }

        #endregion

        #region Zoom Handlers

        private void BtnZoomIn_Click(object sender, RoutedEventArgs e)
        {
            var newZoom = Math.Min(sliderZoom.Value + 10, 400);
            sliderZoom.Value = newZoom;
        }

        private void BtnZoomOut_Click(object sender, RoutedEventArgs e)
        {
            var newZoom = Math.Max(sliderZoom.Value - 10, 25);
            sliderZoom.Value = newZoom;
        }

        private void SliderZoom_ValueChanged(object sender, RoutedPropertyChangedEventArgs<double> e)
        {
            if (_suppressZoomSlider || editor == null || txtZoomLevel == null) return;
            var zoomPercent = (int)Math.Round(e.NewValue);
            var scale = zoomPercent / 100.0;
            editor.ScaleFactor = new Size(scale, scale);
            txtZoomLevel.Text = $"{zoomPercent}%";
        }

        private void SetZoomLevel(double zoomPercent)
        {
            zoomPercent = Math.Max(25, Math.Min(400, zoomPercent));
            _suppressZoomSlider = true;
            sliderZoom.Value = zoomPercent;
            _suppressZoomSlider = false;
            var scale = zoomPercent / 100.0;
            editor.ScaleFactor = new Size(scale, scale);
            txtZoomLevel.Text = $"{(int)Math.Round(zoomPercent)}%";
        }

        #endregion

        private async Task StartPipeServerAsync(CancellationToken ct)
        {
            while (!ct.IsCancellationRequested)
            {
                try
                {
                    _pipeServer = new NamedPipeServerStream(
                        App.PipeName!,
                        PipeDirection.InOut,
                        1,
                        PipeTransmissionMode.Byte,
                        PipeOptions.Asynchronous);

                    statusText.Text = "In attesa di connessione...";
                    await _pipeServer.WaitForConnectionAsync(ct);
                    statusText.Text = "Electron connesso";

                    var utf8NoBom = new UTF8Encoding(encoderShouldEmitUTF8Identifier: false);
                    using var reader = new StreamReader(_pipeServer, utf8NoBom, leaveOpen: true);
                    using var writer = new StreamWriter(_pipeServer, utf8NoBom, leaveOpen: true) { AutoFlush = true };

                    await SendMessageAsync(writer, new { type = "READY" });

                    while (_pipeServer.IsConnected && !ct.IsCancellationRequested)
                    {
                        var line = await reader.ReadLineAsync(ct);
                        if (line == null) break;

                        await ProcessCommandAsync(line, writer);
                    }
                }
                catch (OperationCanceledException)
                {
                    break;
                }
                catch (Exception ex)
                {
                    statusText.Text = $"Errore pipe: {ex.Message}";
                }
                finally
                {
                    _pipeServer?.Dispose();
                    _pipeServer = null;
                }
            }
        }

        private async Task ProcessCommandAsync(string json, StreamWriter writer)
        {
            try
            {
                using var doc = JsonDocument.Parse(json);
                var root = doc.RootElement;
                var command = root.GetProperty("command").GetString();

                switch (command)
                {
                    case "LOAD_RTF":
                        await LoadRtfAsync(root, writer);
                        break;

                    case "GET_RTF":
                        await GetRtfAsync(writer);
                        break;

                    case "GET_PDF":
                        await GetPdfAsync(writer);
                        break;

                    case "SHOW":
                        Dispatcher.Invoke(() =>
                        {
                            if (_myHwnd != IntPtr.Zero)
                                ShowWindow(_myHwnd, SW_SHOW);
                            else
                            {
                                Show();
                                Activate();
                            }
                        });
                        await SendMessageAsync(writer, new { type = "OK", command = "SHOW" });
                        break;

                    case "HIDE":
                        Dispatcher.Invoke(() =>
                        {
                            if (_myHwnd != IntPtr.Zero)
                                ShowWindow(_myHwnd, SW_HIDE);
                            else
                                Hide();
                        });
                        await SendMessageAsync(writer, new { type = "OK", command = "HIDE" });
                        break;

                    case "SET_BOUNDS":
                        SetBounds(root);
                        await SendMessageAsync(writer, new { type = "OK", command = "SET_BOUNDS" });
                        break;

                    case "SET_PARENT":
                        SetParentWindow(root);
                        await SendMessageAsync(writer, new { type = "OK", command = "SET_PARENT" });
                        break;

                    case "IS_DIRTY":
                        await SendMessageAsync(writer, new { type = "IS_DIRTY", dirty = _isDocumentDirty });
                        break;

                    case "SET_ZOOM":
                        var zoom = root.TryGetProperty("zoom", out var zv) ? zv.GetDouble() : 100;
                        Dispatcher.Invoke(() => SetZoomLevel(zoom));
                        await SendMessageAsync(writer, new { type = "OK", command = "SET_ZOOM" });
                        break;

                    case "FOCUS":
                        Dispatcher.Invoke(() => ForceFocusEditor());
                        await SendMessageAsync(writer, new { type = "OK", command = "FOCUS" });
                        break;

                    case "INSERT_TEXT":
                        var text = root.TryGetProperty("text", out var tv) ? tv.GetString() ?? "" : "";
                        Dispatcher.Invoke(() =>
                        {
                            // Inserisce testo alla posizione corrente del cursore.
                            // Gestisce newline come line break (Shift+Enter).
                            var lines = text.Split(new[] { "\r\n", "\n" }, StringSplitOptions.None);
                            for (int i = 0; i < lines.Length; i++)
                            {
                                if (i > 0)
                                    editor.InsertLineBreak();
                                if (!string.IsNullOrEmpty(lines[i]))
                                    editor.Insert(lines[i]);
                            }
                            _isDocumentDirty = true;
                        });
                        await SendMessageAsync(writer, new { type = "OK", command = "INSERT_TEXT" });
                        break;

                    case "PING":
                        await SendMessageAsync(writer, new { type = "PONG" });
                        break;

                    default:
                        await SendMessageAsync(writer, new { type = "ERROR", message = $"Comando sconosciuto: {command}" });
                        break;
                }
            }
            catch (Exception ex)
            {
                await SendMessageAsync(writer, new { type = "ERROR", message = ex.Message });
            }
        }

        private async Task LoadRtfAsync(JsonElement root, StreamWriter writer)
        {
            var rtfBase64 = root.GetProperty("data").GetString();
            if (string.IsNullOrEmpty(rtfBase64))
            {
                await SendMessageAsync(writer, new { type = "ERROR", message = "Dati RTF mancanti" });
                return;
            }

            var rtfBytes = Convert.FromBase64String(rtfBase64);

            Dispatcher.Invoke(() =>
            {
                statusText.Text = "Caricamento RTF...";
                var rtfProvider = new RtfFormatProvider();
                using var stream = new MemoryStream(rtfBytes);
                editor.Document = rtfProvider.Import(stream);
                _isDocumentDirty = false;
                statusText.Text = "Documento caricato";
            });

            await SendMessageAsync(writer, new { type = "OK", command = "LOAD_RTF" });
        }

        private async Task GetRtfAsync(StreamWriter writer)
        {
            string rtfBase64 = "";

            Dispatcher.Invoke(() =>
            {
                statusText.Text = "Esportazione RTF...";
                var rtfProvider = new RtfFormatProvider();
                using var stream = new MemoryStream();
                rtfProvider.Export(editor.Document, stream);
                rtfBase64 = Convert.ToBase64String(stream.ToArray());
                _isDocumentDirty = false;
                statusText.Text = "RTF esportato";
            });

            await SendMessageAsync(writer, new { type = "RTF_CONTENT", data = rtfBase64 });
        }

        private async Task GetPdfAsync(StreamWriter writer)
        {
            string pdfBase64 = "";

            Dispatcher.Invoke(() =>
            {
                statusText.Text = "Esportazione PDF...";
                var pdfProvider = new PdfFormatProvider();
                using var stream = new MemoryStream();
                pdfProvider.Export(editor.Document, stream);
                pdfBase64 = Convert.ToBase64String(stream.ToArray());
                statusText.Text = "PDF esportato";
            });

            await SendMessageAsync(writer, new { type = "PDF_CONTENT", data = pdfBase64 });
        }

        private void SetParentWindow(JsonElement root)
        {
            Dispatcher.Invoke(() =>
            {
                var hwndStr = root.GetProperty("hwnd").GetString();
                if (string.IsNullOrEmpty(hwndStr)) return;

                _parentHwnd = new IntPtr(long.Parse(hwndStr));
                var helper = new WindowInteropHelper(this);
                _myHwnd = helper.EnsureHandle();

                // Overlay approach: ownership fa si' che WPF resti sempre sopra Electron
                // ma NON child window (Chromium GPU compositor blocca mouse input sulle child HWND)
                helper.Owner = _parentHwnd;

                // Rimuovi TUTTE le decorazioni: caption, border, thick frame (sizing border)
                var style = GetWindowLong(_myHwnd, GWL_STYLE);
                SetWindowLong(_myHwnd, GWL_STYLE, style & ~0x00C00000 & ~WS_THICKFRAME);

                // Nascondi da Alt+Tab
                var exStyle = GetWindowLong(_myHwnd, GWL_EXSTYLE);
                SetWindowLong(_myHwnd, GWL_EXSTYLE, (exStyle & ~WS_EX_APPWINDOW) | WS_EX_TOOLWINDOW);

                _isOverlay = true;

                // Posiziona fuori schermo e nascondi
                MoveWindow(_myHwnd, -10000, -10000, 1, 1, false);
                ShowWindow(_myHwnd, SW_HIDE);
            });
        }

        private void SetBounds(JsonElement root)
        {
            Dispatcher.Invoke(() =>
            {
                int x = root.TryGetProperty("x", out var xv) ? (int)xv.GetDouble() : 0;
                int y = root.TryGetProperty("y", out var yv) ? (int)yv.GetDouble() : 0;
                int w = root.TryGetProperty("width", out var wv) ? (int)wv.GetDouble() : 800;
                int h = root.TryGetProperty("height", out var hv) ? (int)hv.GetDouble() : 600;

                if (_isOverlay && _parentHwnd != IntPtr.Zero && _myHwnd != IntPtr.Zero)
                {
                    // Converti da coordinate relative alla client-area di Electron
                    // a coordinate schermo assolute
                    var pt = new POINT { X = x, Y = y };
                    ClientToScreen(_parentHwnd, ref pt);
                    MoveWindow(_myHwnd, pt.X, pt.Y, w, h, true);
                }
                else if (_myHwnd != IntPtr.Zero)
                {
                    MoveWindow(_myHwnd, x, y, w, h, true);
                }
                else
                {
                    Left = x; Top = y; Width = w; Height = h;
                }
            });
        }

        /// <summary>
        /// Forza il focus sull'editor WPF overlay cross-process.
        /// Usa AttachThreadInput per collegare temporaneamente i thread di input
        /// di Electron e WPF, poi chiama SetFocus.
        /// </summary>
        private void ForceFocusEditor()
        {
            if (_myHwnd == IntPtr.Zero) return;

            var foreground = GetForegroundWindow();
            if (foreground == IntPtr.Zero) return;

            uint foregroundThreadId = GetWindowThreadProcessId(foreground, out _);
            uint currentThreadId = GetCurrentThreadId();

            if (foregroundThreadId != currentThreadId)
            {
                AttachThreadInput(currentThreadId, foregroundThreadId, true);
                SetFocus(_myHwnd);
                editor.Focus();
                AttachThreadInput(currentThreadId, foregroundThreadId, false);
            }
            else
            {
                SetFocus(_myHwnd);
                editor.Focus();
            }
        }

        private static async Task SendMessageAsync(StreamWriter writer, object message)
        {
            var json = JsonSerializer.Serialize(message);
            await writer.WriteLineAsync(json);
        }
    }
}
