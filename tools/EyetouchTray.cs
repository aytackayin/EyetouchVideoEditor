// Eyetouch Video Editor — Sistem Tepsi Başlatıcısı (taşınabilir, node gerekmez)
// Derleme: build-tray.bat (csc, .NET Framework yerleşik) veya tools/build.rsp
// Özellikler: gömülü HTTP sunucu (dist/), tepsi ikonu, Çalıştır/Yeniden Başlat/
// Güncelle/Çık menüsü, TR/EN dil, tek kopya koruması. Hiçbir kurulum gerektirmez.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.IO;
using System.Net;
using System.Net.Security;
using System.Threading;
using System.Windows.Forms;

namespace EyetouchTray
{
    static class Program
    {
        [STAThread]
        static void Main()
        {
            bool createdNew;
            using (var mutex = new Mutex(true, "Global\\EyetouchVideoEditorTray", out createdNew))
            {
                if (!createdNew)
                {
                    MessageBox.Show(
                        Lang.T("Eyetouch zaten çalışıyor.", "Eyetouch is already running."),
                        "Eyetouch", MessageBoxButtons.OK, MessageBoxIcon.Information);
                    return;
                }
                Application.EnableVisualStyles();
                Application.SetCompatibleTextRenderingDefault(false);
                Application.Run(new TrayContext());
            }
        }
    }

    static class Lang
    {
        public static string Current = "tr";
        public static string T(string tr, string en)
        {
            return Current == "en" ? en : tr;
        }
        public static void Save()
        {
            try
            {
                string dir = Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                    "EyetouchEditor");
                Directory.CreateDirectory(dir);
                File.WriteAllText(Path.Combine(dir, "lang.txt"), Current);
            }
            catch { }
        }
        public static void Load()
        {
            try
            {
                string p = Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                    "EyetouchEditor", "lang.txt");
                if (File.Exists(p))
                {
                    string v = File.ReadAllText(p).Trim().ToLowerInvariant();
                    if (v == "en" || v == "tr") Current = v;
                }
            }
            catch { }
        }
    }

    sealed class TrayContext : ApplicationContext
    {
        private NotifyIcon _tray;
        private HttpListener _http;
        private Thread _httpThread;
        private int _port;
        private Icon _icon;
        private MenuItem _miRun, _miRestart, _miUpdate, _miLangTr, _miLangEn, _miQuit;

        private static readonly Dictionary<string, string> Mime = new Dictionary<string, string>
        {
            { ".html", "text/html; charset=utf-8" },
            { ".js", "text/javascript" },
            { ".css", "text/css" },
            { ".json", "application/json" },
            { ".png", "image/png" },
            { ".jpg", "image/jpeg" },
            { ".jpeg", "image/jpeg" },
            { ".gif", "image/gif" },
            { ".svg", "image/svg+xml" },
            { ".ico", "image/x-icon" },
            { ".wasm", "application/wasm" },
            { ".mp4", "video/mp4" },
            { ".webm", "video/webm" },
            { ".mp3", "audio/mpeg" },
            { ".wav", "audio/wav" },
            { ".woff", "font/woff" },
            { ".woff2", "font/woff2" },
        };

        private string AppDir
        {
            get { return AppDomain.CurrentDomain.BaseDirectory; }
        }

        public TrayContext()
        {
            Lang.Load();
            BuildIcon();
            _tray = new NotifyIcon();
            _tray.Icon = _icon;
            _tray.Text = "Eyetouch Video Editor";
            _tray.ContextMenu = BuildContextMenu();
            _tray.Visible = true;
            _tray.BalloonTipClicked += delegate { OpenApp(); };
            _tray.DoubleClick += delegate { OpenApp(); };
            StartServer();
        }

        private void BuildIcon()
        {
            using (Bitmap bmp = new Bitmap(32, 32))
            {
                using (Graphics g = Graphics.FromImage(bmp))
                {
                    g.SmoothingMode = SmoothingMode.AntiAlias;
                    using (SolidBrush bg = new SolidBrush(Color.FromArgb(76, 127, 240)))
                    {
                        FillRoundRect(g, bg, 2, 2, 28, 28, 7);
                    }
                    using (SolidBrush fg = new SolidBrush(Color.White))
                    {
                        g.FillPolygon(fg, new PointF[]
                        {
                            new PointF(12f, 9f), new PointF(23f, 16f), new PointF(12f, 23f)
                        });
                    }
                }
                _icon = Icon.FromHandle(bmp.GetHicon());
            }
        }

        private static void FillRoundRect(Graphics g, Brush b, float x, float y, float w, float h, float r)
        {
            using (GraphicsPath p = new GraphicsPath())
            {
                p.AddArc(x, y, r * 2, r * 2, 180, 90);
                p.AddArc(x + w - r * 2, y, r * 2, r * 2, 270, 90);
                p.AddArc(x + w - r * 2, y + h - r * 2, r * 2, r * 2, 0, 90);
                p.AddArc(x, y + h - r * 2, r * 2, r * 2, 90, 90);
                p.CloseFigure();
                g.FillPath(b, p);
            }
        }

        private ContextMenu BuildContextMenu()
        {
            _miRun = new MenuItem("", delegate { StartServer(); });
            _miRestart = new MenuItem("", delegate { RestartServer(); });
            _miUpdate = new MenuItem("", delegate { RunUpdate(); });
            MenuItem sep1 = new MenuItem("-");
            _miLangTr = new MenuItem("Türkçe", delegate { SetLang("tr"); });
            _miLangEn = new MenuItem("English", delegate { SetLang("en"); });
            MenuItem sep2 = new MenuItem("-");
            _miQuit = new MenuItem("", delegate { Quit(); });
            RefreshTexts();
            return new ContextMenu(new MenuItem[]
            {
                _miRun, _miRestart, _miUpdate, sep1,
                new MenuItem(Lang.T("Dil", "Language"), new MenuItem[] { _miLangTr, _miLangEn }),
                sep2, _miQuit
            });
        }

        private void RefreshTexts()
        {
            _miRun.Text = Lang.T("Çalıştır", "Run");
            _miRestart.Text = Lang.T("Yeniden Başlat", "Restart");
            _miUpdate.Text = Lang.T("Güncelle…", "Check for Updates…");
            _miQuit.Text = Lang.T("Çık", "Quit");
            _miLangTr.Checked = Lang.Current == "tr";
            _miLangEn.Checked = Lang.Current == "en";
        }

        private void SetLang(string l)
        {
            Lang.Current = l;
            Lang.Save();
            RefreshTexts();
        }

        // ---- Gömülü HTTP sunucu (node gerekmez) ----
        private void StartServer()
        {
            if (_http != null && _http.IsListening)
            {
                OpenApp();
                return;
            }
            for (int port = 5173; port <= 5182; port++)
            {
                try
                {
                    HttpListener l = new HttpListener();
                    l.Prefixes.Add("http://localhost:" + port + "/");
                    l.Start();
                    _http = l;
                    _port = port;
                    break;
                }
                catch
                {
                    _http = null;
                }
            }
            if (_http == null)
            {
                _tray.ShowBalloonTip(5000, "Eyetouch",
                    Lang.T("Sunucu başlatılamadı (5173-5182 meşgul).",
                           "Could not start server (5173-5182 busy)."), ToolTipIcon.Error);
                return;
            }
            _httpThread = new Thread(HttpLoop);
            _httpThread.IsBackground = true;
            _httpThread.Start();
            _tray.ShowBalloonTip(2500, "Eyetouch", "http://localhost:" + _port, ToolTipIcon.Info);
            OpenApp();
        }

        private void HttpLoop()
        {
            while (_http != null && _http.IsListening)
            {
                HttpListenerContext ctx;
                try { ctx = _http.GetContext(); }
                catch { break; }
                try { Serve(ctx); }
                catch { }
            }
        }

        private void Serve(HttpListenerContext ctx)
        {
            string distRoot = Path.GetFullPath(Path.Combine(AppDir, "dist"));
            string rel = Uri.UnescapeDataString(ctx.Request.Url.AbsolutePath);
            if (rel == "/") rel = "/index.html";
            string file = Path.GetFullPath(Path.Combine(distRoot, rel.TrimStart('/').Replace('/', '\\')));
            bool exists = File.Exists(file);
            if (!exists || file != distRoot && !file.StartsWith(distRoot + Path.DirectorySeparatorChar.ToString(), StringComparison.OrdinalIgnoreCase))
            {
                // SPA geri dönüşü
                file = Path.Combine(distRoot, "index.html");
            }
            if (!File.Exists(file))
            {
                ctx.Response.StatusCode = 404;
                ctx.Response.Close();
                return;
            }
            byte[] data = File.ReadAllBytes(file);
            string ext = Path.GetExtension(file).ToLowerInvariant();
            string mime;
            if (!Mime.TryGetValue(ext, out mime)) mime = "application/octet-stream";
            ctx.Response.ContentType = mime;
            ctx.Response.ContentLength64 = data.Length;
            // ffmpeg.wasm (SharedArrayBuffer) için zorunlu başlıklar
            ctx.Response.AddHeader("Cross-Origin-Opener-Policy", "same-origin");
            ctx.Response.AddHeader("Cross-Origin-Embedder-Policy", "require-corp");
            if (ext == ".html") ctx.Response.AddHeader("Cache-Control", "no-store");
            ctx.Response.OutputStream.Write(data, 0, data.Length);
            ctx.Response.Close();
        }

        private void OpenApp()
        {
            if (_port == 0) return;
            try
            {
                Process.Start(new ProcessStartInfo("http://localhost:" + _port) { UseShellExecute = true });
            }
            catch { }
        }

        private void StopServer()
        {
            try { if (_http != null && _http.IsListening) _http.Stop(); } catch { }
            _http = null;
            _port = 0;
        }

        private void RestartServer()
        {
            StopServer();
            Thread.Sleep(200);
            StartServer();
        }

        // ---- Güncelleme: GitHub release zip'ini indir, aç, exe haricinde üstüne kopyala ----
        private const string UpdateUrl =
            "https://github.com/aytackayin/EyetouchVideoEditor/releases/latest/download/EyetouchVideoEditor.zip";

        private void RunUpdate()
        {
            _miUpdate.Enabled = false;
            _tray.ShowBalloonTip(2000, "Eyetouch",
                Lang.T("Güncellemeler denetleniyor…", "Checking for updates…"), ToolTipIcon.Info);
            Thread t = new Thread(UpdateWorker);
            t.IsBackground = true;
            t.Start();
        }

        private void UpdateWorker()
        {
            string zip = Path.Combine(Path.GetTempPath(), "eyetouch-update.zip");
            string dst = Path.Combine(Path.GetTempPath(), "eyetouch-update");
            string msg;
            bool ok = false;
            try
            {
                ServicePointManager.SecurityProtocol = SecurityProtocolType.Tls12;
                using (WebClient wc = new WebClient())
                {
                    wc.DownloadFile(UpdateUrl, zip);
                }
                if (Directory.Exists(dst)) Directory.Delete(dst, true);
                Directory.CreateDirectory(dst);
                ProcessStartInfo psi = new ProcessStartInfo();
                psi.FileName = "powershell";
                psi.Arguments = "-NoProfile -Command \"Expand-Archive -Force -LiteralPath '" + zip + "' -DestinationPath '" + dst + "'\"";
                psi.UseShellExecute = false;
                psi.CreateNoWindow = true;
                Process p = Process.Start(psi);
                p.WaitForExit(60000);
                string src = dst;
                string[] entries = Directory.GetDirectories(dst);
                string[] files = Directory.GetFiles(dst);
                if (entries.Length == 1 && files.Length == 0) src = entries[0];
                if (!File.Exists(Path.Combine(src, "server.cjs")) &&
                    !Directory.Exists(Path.Combine(src, "dist")))
                {
                    throw new Exception(Lang.T("paket içeriği tanınamadı", "unrecognized package"));
                }
                StopServer();
                Thread.Sleep(200);
                CopyAll(src, AppDir);
                ok = true;
                msg = Lang.T("Güncellendi. Sunucu yeniden başlatılıyor…",
                             "Updated. Restarting server…");
            }
            catch (WebException)
            {
                msg = Lang.T("Güncelleme bulunamadı (release henüz yok olabilir).",
                             "No update found (release may not exist yet).");
            }
            catch (Exception ex)
            {
                msg = Lang.T("Güncelleme hatası: ", "Update failed: ") + ex.Message;
            }
            try
            {
                _tray.ShowBalloonTip(4000, "Eyetouch", msg, ok ? ToolTipIcon.Info : ToolTipIcon.Warning);
            }
            catch { }
            if (ok) RestartServer();
            try { _miUpdate.Enabled = true; } catch { }
        }

        private static void CopyAll(string src, string dst)
        {
            foreach (string f in Directory.GetFiles(src))
            {
                string name = Path.GetFileName(f);
                if (name.ToLowerInvariant().EndsWith(".exe")) continue;   // çalışan exe değişmez
                File.Copy(f, Path.Combine(dst, name), true);
            }
            foreach (string d in Directory.GetDirectories(src))
            {
                string name = Path.GetFileName(d);
                if (name == ".git" || name == "node_modules" || name == "ornek-medya") continue;
                string target = Path.Combine(dst, name);
                Directory.CreateDirectory(target);
                CopyAll(d, target);
            }
        }

        private void Quit()
        {
            StopServer();
            _tray.Visible = false;
            if (_icon != null)
            {
                try { Native.DestroyIcon(_icon.Handle); } catch { }
            }
            Application.Exit();
        }

        protected override void ExitThreadCore()
        {
            StopServer();
            base.ExitThreadCore();
        }
    }

    static class Native
    {
        [System.Runtime.InteropServices.DllImport("user32.dll")]
        public static extern bool DestroyIcon(IntPtr hIcon);
    }
}
