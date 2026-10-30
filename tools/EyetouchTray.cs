// Eyetouch Video Editor — Sistem Tepsi Başlatıcısı (taşınabilir, node gerekmez)
// Derleme: build-tray.bat (csc, .NET Framework yerleşik) veya tools/build.rsp
// Özellikler: gömülü TCP HTTP sunucu (dist/), tepsi ikonu, Çalıştır/Yeniden
// Başlat/Güncelle/Çık + Uzaktan erişim (Tailscale/LAN) anahtarı, TR/EN dil,
// tek kopya koruması. Hiçbir kurulum/yönetici hakkı gerektirmez.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.IO;
using System.Net;
using System.Net.Security;
using System.Net.Sockets;
using System.Text;
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
                        Settings.T("Eyetouch zaten çalışıyor.", "Eyetouch is already running."),
                        "Eyetouch", MessageBoxButtons.OK, MessageBoxIcon.Information);
                    return;
                }
                Application.EnableVisualStyles();
                Application.SetCompatibleTextRenderingDefault(false);
                Application.Run(new TrayContext());
            }
        }
    }

    // Ayarlar: %LOCALAPPDATA%\EyoutuchEditor yerine EyetouchEditor\settings.txt
    static class Settings
    {
        public static string Lang = "tr";
        public static bool Remote = false;
        public static string T(string tr, string en) { return Lang == "en" ? en : tr; }

        private static string Path_()
        {
            return Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "EyetouchEditor", "settings.txt");
        }

        public static void Load()
        {
            try
            {
                string p = Path_();
                if (File.Exists(p))
                {
                    foreach (string line in File.ReadAllLines(p))
                    {
                        string[] kv = line.Split(new char[] { '=' }, 2);
                        if (kv.Length != 2) continue;
                        if (kv[0] == "lang" && (kv[1] == "tr" || kv[1] == "en")) Lang = kv[1];
                        if (kv[0] == "remote" && kv[1] == "1") Remote = true;
                    }
                }
                else
                {
                    // eski sürümün lang.txt'si
                    string eski = Path.Combine(
                        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                        "EyoutuchEditor".Replace("Eyoutuch", "Eyetouch"), "lang.txt");
                    if (File.Exists(eski))
                    {
                        string v = File.ReadAllText(eski).Trim().ToLowerInvariant();
                        if (v == "en" || v == "tr") Lang = v;
                    }
                }
            }
            catch { }
        }

        public static void Save()
        {
            try
            {
                string dir = Path.GetDirectoryName(Path_());
                Directory.CreateDirectory(dir);
                File.WriteAllText(Path_(), "lang=" + Lang + "\r\nremote=" + (Remote ? "1" : "0") + "\r\n");
            }
            catch { }
        }
    }

    sealed class TrayContext : ApplicationContext
    {
        private NotifyIcon _tray;
        private TcpListener _tcp;
        private Thread _acceptThread;
        private int _port;
        private Icon _icon;
        private MenuItem _miRun, _miRestart, _miUpdate, _miRemote, _miLangTr, _miLangEn, _miQuit;

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
            Settings.Load();
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
            _miRemote = new MenuItem("", delegate { ToggleRemote(); });
            MenuItem sep1 = new MenuItem("-");
            _miLangTr = new MenuItem("Türkçe", delegate { SetLang("tr"); });
            _miLangEn = new MenuItem("English", delegate { SetLang("en"); });
            MenuItem sep2 = new MenuItem("-");
            _miQuit = new MenuItem("", delegate { Quit(); });
            RefreshTexts();
            return new ContextMenu(new MenuItem[]
            {
                _miRun, _miRestart, _miUpdate, sep1, _miRemote,
                new MenuItem(Settings.T("Dil", "Language"), new MenuItem[] { _miLangTr, _miLangEn }),
                sep2, _miQuit
            });
        }

        private void RefreshTexts()
        {
            _miRun.Text = Settings.T("Çalıştır", "Run");
            _miRestart.Text = Settings.T("Yeniden Başlat", "Restart");
            _miUpdate.Text = Settings.T("Güncelle…", "Check for Updates…");
            _miRemote.Text = Settings.T("Uzaktan erişim (Tailscale/Ağ)", "Remote access (Tailscale/LAN)");
            _miQuit.Text = Settings.T("Çık", "Quit");
            _miRemote.Checked = Settings.Remote;
            _miLangTr.Checked = Settings.Lang == "tr";
            _miLangEn.Checked = Settings.Lang == "en";
        }

        private void SetLang(string l)
        {
            Settings.Lang = l;
            Settings.Save();
            RefreshTexts();
        }

        private void ToggleRemote()
        {
            Settings.Remote = !Settings.Remote;
            Settings.Save();
            RefreshTexts();
            RestartServer();
        }

        // ---- Gömülü TCP HTTP sunucu (http.sys/URLACL/yönetici gerekmez) ----

        /** Tailscale adresi (100.64.0.0/10 aralığı) — yoksa null. */
        private static string TailscaleIp()
        {
            try
            {
                foreach (System.Net.NetworkInformation.NetworkInterface ni in
                    System.Net.NetworkInformation.NetworkInterface.GetAllNetworkInterfaces())
                {
                    foreach (System.Net.NetworkInformation.UnicastIPAddressInformation a in
                        ni.GetIPProperties().UnicastAddresses)
                    {
                        if (a.Address.AddressFamily != AddressFamily.InterNetwork) continue;
                        byte[] b = a.Address.GetAddressBytes();
                        if (b[0] == 100 && b[1] >= 64 && b[1] <= 127) return a.Address.ToString();
                    }
                }
            }
            catch { }
            return null;
        }

        private void StartServer()
        {
            if (_tcp != null)
            {
                OpenApp();
                return;
            }
            IPAddress bind = Settings.Remote ? IPAddress.Any : IPAddress.Loopback;
            for (int port = 5173; port <= 5182; port++)
            {
                try
                {
                    TcpListener l = new TcpListener(bind, port);
                    l.Start(8);
                    _tcp = l;
                    _port = port;
                    break;
                }
                catch
                {
                    _tcp = null;
                }
            }
            if (_tcp == null)
            {
                _tray.ShowBalloonTip(5000, "Eyetouch",
                    Settings.T("Sunucu başlatılamadı (5173-5182 meşgul).",
                               "Could not start server (5173-5182 busy)."), ToolTipIcon.Error);
                return;
            }
            _acceptThread = new Thread(AcceptLoop);
            _acceptThread.IsBackground = true;
            _acceptThread.Start();

            string msg = "http://localhost:" + _port;
            if (Settings.Remote)
            {
                string ts = TailscaleIp();
                if (ts != null) msg += Settings.T("\nTailscale: http://", "\nTailscale: http://") + ts + ":" + _port;
                else msg += Settings.T("\n(Tailscale ağı bulunamadı — yerel IP kullanın)", "\n(No Tailscale network found — use your LAN IP)");
                msg += Settings.T("\nİlk bağlantıda Güvenlik Duvarı'na izin verin.", "\nAllow access in Windows Firewall on first connect.");
            }
            _tray.ShowBalloonTip(4000, "Eyetouch", msg, ToolTipIcon.Info);
            OpenApp();
        }

        private void AcceptLoop()
        {
            while (_tcp != null)
            {
                Socket s;
                try { s = _tcp.AcceptSocket(); }
                catch { break; }
                try { ThreadPool.QueueUserWorkItem(HandleClient, s); }
                catch { try { s.Close(); } catch { } }
            }
        }

        private void HandleClient(object state)
        {
            Socket s = (Socket)state;
            try
            {
                s.ReceiveTimeout = 10000;
                s.SendTimeout = 30000;
                // istek başlıklarını oku (\r\n\r\n kadar)
                MemoryStream ms = new MemoryStream();
                byte[] buf = new byte[8192];
                string head = "";
                while (ms.Length < 65536)
                {
                    int n = s.Receive(buf);
                    if (n <= 0) break;
                    ms.Write(buf, 0, n);
                    head = Encoding.ASCII.GetString(ms.ToArray());
                    if (head.Contains("\r\n\r\n")) break;
                }
                if (head.Length == 0) return;
                string[] ilk = head.Split(' ');
                if (ilk.Length < 2) return;
                string method = ilk[0];
                string rawPath = ilk[1];
                if (method != "GET" && method != "HEAD")
                {
                    SendSimple(s, "405 Method Not Allowed", "text/plain", new byte[0]);
                    return;
                }
                // sorgu kısmını at, %XX çöz
                string rel = rawPath.Split('?')[0];
                rel = UrlDecode(rel);
                if (rel == "/") rel = "/index.html";
                string distRoot = Path.GetFullPath(Path.Combine(AppDir, "dist"));
                string file = Path.GetFullPath(Path.Combine(distRoot,
                    rel.TrimStart('/').Replace('/', Path.DirectorySeparatorChar)));
                bool ok = file == distRoot ||
                          file.StartsWith(distRoot + Path.DirectorySeparatorChar.ToString(), StringComparison.OrdinalIgnoreCase);
                if (!ok || !File.Exists(file))
                {
                    file = Path.Combine(distRoot, "index.html"); // SPA geri dönüşü
                }
                if (!File.Exists(file))
                {
                    SendSimple(s, "404 Not Found", "text/plain; charset=utf-8", new byte[0]);
                    return;
                }
                byte[] data = File.ReadAllBytes(file);
                string ext = Path.GetExtension(file).ToLowerInvariant();
                string mime;
                if (!Mime.TryGetValue(ext, out mime)) mime = "application/octet-stream";
                StringBuilder h = new StringBuilder();
                h.Append("HTTP/1.1 200 OK\r\nContent-Type: ").Append(mime)
                 .Append("\r\nContent-Length: ").Append(data.Length)
                 .Append("\r\nCross-Origin-Opener-Policy: same-origin")
                 .Append("\r\nCross-Origin-Embedder-Policy: require-corp")
                 .Append("\r\nCache-Control: ").Append(ext == ".html" ? "no-store" : "max-age=3600")
                 .Append("\r\nConnection: close\r\n\r\n");
                byte[] hb = Encoding.ASCII.GetBytes(h.ToString());
                s.Send(hb);
                if (method == "GET") s.Send(data);
            }
            catch { }
            finally
            {
                try { s.Close(); } catch { }
            }
        }

        private static void SendSimple(Socket s, string status, string mime, byte[] body)
        {
            string h = "HTTP/1.1 " + status + "\r\nContent-Type: " + mime +
                       "\r\nContent-Length: " + body.Length + "\r\nConnection: close\r\n\r\n";
            byte[] hb = Encoding.ASCII.GetBytes(h);
            s.Send(hb);
            if (body.Length > 0) s.Send(body);
        }

        private static string UrlDecode(string s)
        {
            s = s.Replace("+", " ");
            StringBuilder sb = new StringBuilder();
            for (int i = 0; i < s.Length; i++)
            {
                if (s[i] == '%' && i + 2 < s.Length)
                {
                    int v;
                    if (int.TryParse(s.Substring(i + 1, 2),
                        System.Globalization.NumberStyles.HexNumber, null, out v))
                    {
                        sb.Append((char)v);
                        i += 2;
                        continue;
                    }
                }
                sb.Append(s[i]);
            }
            return sb.ToString();
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
            try { if (_tcp != null) _tcp.Stop(); } catch { }
            _tcp = null;
            _port = 0;
        }

        private void RestartServer()
        {
            StopServer();
            Thread.Sleep(200);
            StartServer();
        }

        // ---- Güncelleme ----
        private const string UpdateUrl =
            "https://github.com/aytackayin/EyetouchVideoEditor/releases/latest/download/EyetouchVideoEditor.zip";

        private void RunUpdate()
        {
            _miUpdate.Enabled = false;
            _tray.ShowBalloonTip(2000, "Eyetouch",
                Settings.T("Güncellemeler denetleniyor…", "Checking for updates…"), ToolTipIcon.Info);
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
                    throw new Exception(Settings.T("paket içeriği tanınamadı", "unrecognized package"));
                }
                StopServer();
                Thread.Sleep(200);
                CopyAll(src, AppDir);
                ok = true;
                msg = Settings.T("Güncellendi. Sunucu yeniden başlatılıyor…",
                                 "Updated. Restarting server…");
            }
            catch (WebException)
            {
                msg = Settings.T("Güncelleme bulunamadı (release henüz yok olabilir).",
                                 "No update found (release may not exist yet).");
            }
            catch (Exception ex)
            {
                msg = Settings.T("Güncelleme hatası: ", "Update failed: ") + ex.Message;
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
                if (name.ToLowerInvariant().EndsWith(".exe")) continue;
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
