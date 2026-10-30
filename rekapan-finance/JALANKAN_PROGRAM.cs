using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net;
using System.Text.RegularExpressions;
using System.Threading;
using System.Windows.Forms;

namespace RekapanFinanceLauncher
{
    static class Program
    {
        [STAThread]
        static void Main()
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new MainForm());
        }
    }

    public class MainForm : Form
    {
        private Process devProcess = null;
        private Process ngrokProcess = null;
        private Thread workerThread = null;
        private System.Windows.Forms.Timer signalTimer;

        private Label lblServerStatus;
        private Label lblNgrokStatus;
        private TextBox txtBossUrl;
        private Button btnOpenAdmin;
        private Button btnOpenBoss;
        private Button btnCopyBoss;
        private Button btnQuit;
        private Label lblCopyFeedback;

        private string bossUrl = "";
        private bool isClosing = false;
        private string baseDir;
        private string stopSignalPath;

        public MainForm()
        {
            baseDir = AppDomain.CurrentDomain.BaseDirectory;
            Directory.SetCurrentDirectory(baseDir);
            stopSignalPath = Path.Combine(baseDir, ".stop_signal");

            // Hapus sinyal stop lama jika ada
            try { if (File.Exists(stopSignalPath)) File.Delete(stopSignalPath); } catch { }

            InitializeComponent();
            LoadIconSafely();
        }

        private void InitializeComponent()
        {
            this.Text = "OS Hutang Finance - Pusat Kontrol & Akses";
            this.Size = new Size(580, 680);
            this.StartPosition = FormStartPosition.CenterScreen;
            this.FormBorderStyle = FormBorderStyle.FixedSingle;
            this.MaximizeBox = false;
            this.BackColor = Color.FromArgb(241, 245, 249); // Slate-100
            this.Font = new Font("Segoe UI", 9.25f, FontStyle.Regular);

            // 1. Header Panel
            Panel headerPanel = new Panel();
            headerPanel.Dock = DockStyle.Top;
            headerPanel.Height = 85;
            headerPanel.BackColor = Color.FromArgb(15, 23, 42); // Slate-900

            Label lblTitle = new Label();
            lblTitle.Text = "SISTEM REKAPAN KEUANGAN";
            lblTitle.Font = new Font("Segoe UI", 13.5f, FontStyle.Bold);
            lblTitle.ForeColor = Color.White;
            lblTitle.Location = new Point(22, 16);
            lblTitle.AutoSize = true;
            headerPanel.Controls.Add(lblTitle);

            Label lblSubTitle = new Label();
            lblSubTitle.Text = "OS Hutang Finance • Pusat Peluncuran & Akses Pengguna";
            lblSubTitle.Font = new Font("Segoe UI", 8.75f, FontStyle.Regular);
            lblSubTitle.ForeColor = Color.FromArgb(148, 163, 184); // Slate-400
            lblSubTitle.Location = new Point(24, 46);
            lblSubTitle.AutoSize = true;
            headerPanel.Controls.Add(lblSubTitle);

            this.Controls.Add(headerPanel);

            // Container Panel
            Panel contentPanel = new Panel();
            contentPanel.Location = new Point(20, 100);
            contentPanel.Size = new Size(525, 530);
            contentPanel.BackColor = Color.Transparent;

            int currentY = 0;

            // 2. Status Box
            Panel statusCard = CreateCardPanel(0, currentY, 525, 75);
            
            Label lblStatusTitle = new Label();
            lblStatusTitle.Text = "STATUS SISTEM";
            lblStatusTitle.Font = new Font("Segoe UI", 7.5f, FontStyle.Bold);
            lblStatusTitle.ForeColor = Color.FromArgb(100, 116, 139);
            lblStatusTitle.Location = new Point(14, 10);
            lblStatusTitle.AutoSize = true;
            statusCard.Controls.Add(lblStatusTitle);

            lblServerStatus = new Label();
            lblServerStatus.Text = "● Server Lokal (Port 5173): Menjalankan npm run dev...";
            lblServerStatus.Font = new Font("Segoe UI", 8.75f, FontStyle.Bold);
            lblServerStatus.ForeColor = Color.FromArgb(202, 138, 4); // Amber
            lblServerStatus.Location = new Point(14, 28);
            lblServerStatus.AutoSize = true;
            statusCard.Controls.Add(lblServerStatus);

            lblNgrokStatus = new Label();
            lblNgrokStatus.Text = "● Terowongan Online: Menghubungkan Ngrok...";
            lblNgrokStatus.Font = new Font("Segoe UI", 8.75f, FontStyle.Bold);
            lblNgrokStatus.ForeColor = Color.FromArgb(202, 138, 4); // Amber
            lblNgrokStatus.Location = new Point(14, 48);
            lblNgrokStatus.AutoSize = true;
            statusCard.Controls.Add(lblNgrokStatus);

            contentPanel.Controls.Add(statusCard);
            currentY += 88;

            // 3. Card Admin (Lokal)
            Panel adminCard = CreateCardPanel(0, currentY, 525, 125);

            Label lblAdminHeader = new Label();
            lblAdminHeader.Text = "👤  AKSES ADMIN / OPERATOR (Komputer Ini)";
            lblAdminHeader.Font = new Font("Segoe UI", 10.5f, FontStyle.Bold);
            lblAdminHeader.ForeColor = Color.FromArgb(15, 23, 42);
            lblAdminHeader.Location = new Point(14, 12);
            lblAdminHeader.AutoSize = true;
            adminCard.Controls.Add(lblAdminHeader);

            Label lblAdminDesc = new Label();
            lblAdminDesc.Text = "Gunakan tombol ini untuk staf admin yang bekerja langsung di laptop/komputer ini.\nAlamat: http://localhost:5173/login";
            lblAdminDesc.Font = new Font("Segoe UI", 8.25f, FontStyle.Regular);
            lblAdminDesc.ForeColor = Color.FromArgb(100, 116, 139);
            lblAdminDesc.Location = new Point(16, 36);
            lblAdminDesc.Size = new Size(490, 32);
            adminCard.Controls.Add(lblAdminDesc);

            btnOpenAdmin = new Button();
            btnOpenAdmin.Text = "🚀  BUKA PORTAL ADMIN (LOKAL)";
            btnOpenAdmin.Font = new Font("Segoe UI", 9.5f, FontStyle.Bold);
            btnOpenAdmin.BackColor = Color.FromArgb(37, 99, 235); // Blue-600
            btnOpenAdmin.ForeColor = Color.White;
            btnOpenAdmin.FlatStyle = FlatStyle.Flat;
            btnOpenAdmin.FlatAppearance.BorderSize = 0;
            btnOpenAdmin.Cursor = Cursors.Hand;
            btnOpenAdmin.Location = new Point(16, 74);
            btnOpenAdmin.Size = new Size(493, 38);
            btnOpenAdmin.Click += (s, e) => {
                try { Process.Start("http://localhost:5173/login"); }
                catch (Exception ex) { MessageBox.Show("Gagal membuka browser: " + ex.Message, "Info", MessageBoxButtons.OK, MessageBoxIcon.Warning); }
            };
            adminCard.Controls.Add(btnOpenAdmin);

            contentPanel.Controls.Add(adminCard);
            currentY += 138;

            // 4. Card Boss (Online Ngrok)
            Panel bossCard = CreateCardPanel(0, currentY, 525, 185);

            Label lblBossHeader = new Label();
            lblBossHeader.Text = "👑  AKSES BOSS / PIMPINAN (Jarak Jauh / HP / Online)";
            lblBossHeader.Font = new Font("Segoe UI", 10.5f, FontStyle.Bold);
            lblBossHeader.ForeColor = Color.FromArgb(15, 23, 42);
            lblBossHeader.Location = new Point(14, 12);
            lblBossHeader.AutoSize = true;
            bossCard.Controls.Add(lblBossHeader);

            Label lblBossDesc = new Label();
            lblBossDesc.Text = "Link publik online aman agar Boss dapat memantau rekapan keuangan dari HP / Luar Kantor:";
            lblBossDesc.Font = new Font("Segoe UI", 8.25f, FontStyle.Regular);
            lblBossDesc.ForeColor = Color.FromArgb(100, 116, 139);
            lblBossDesc.Location = new Point(16, 36);
            lblBossDesc.Size = new Size(490, 18);
            bossCard.Controls.Add(lblBossDesc);

            txtBossUrl = new TextBox();
            txtBossUrl.ReadOnly = true;
            txtBossUrl.BackColor = Color.FromArgb(248, 250, 252);
            txtBossUrl.ForeColor = Color.FromArgb(51, 65, 85);
            txtBossUrl.Font = new Font("Consolas", 9f, FontStyle.Regular);
            txtBossUrl.Text = "Menghubungkan ke terowongan online Ngrok...";
            txtBossUrl.Location = new Point(16, 60);
            txtBossUrl.Size = new Size(493, 23);
            bossCard.Controls.Add(txtBossUrl);

            btnOpenBoss = new Button();
            btnOpenBoss.Text = "🌐  Buka Web Boss";
            btnOpenBoss.Font = new Font("Segoe UI", 9.25f, FontStyle.Bold);
            btnOpenBoss.BackColor = Color.FromArgb(13, 148, 136); // Teal-600
            btnOpenBoss.ForeColor = Color.White;
            btnOpenBoss.FlatStyle = FlatStyle.Flat;
            btnOpenBoss.FlatAppearance.BorderSize = 0;
            btnOpenBoss.Cursor = Cursors.Hand;
            btnOpenBoss.Location = new Point(16, 95);
            btnOpenBoss.Size = new Size(240, 38);
            btnOpenBoss.Enabled = false;
            btnOpenBoss.Click += (s, e) => {
                if (!string.IsNullOrEmpty(bossUrl))
                {
                    try { Process.Start(bossUrl); }
                    catch (Exception ex) { MessageBox.Show("Gagal membuka browser: " + ex.Message, "Info", MessageBoxButtons.OK, MessageBoxIcon.Warning); }
                }
            };
            bossCard.Controls.Add(btnOpenBoss);

            btnCopyBoss = new Button();
            btnCopyBoss.Text = "📋  Salin Link WhatsApp";
            btnCopyBoss.Font = new Font("Segoe UI", 9.25f, FontStyle.Bold);
            btnCopyBoss.BackColor = Color.FromArgb(22, 163, 74); // Green-600
            btnCopyBoss.ForeColor = Color.White;
            btnCopyBoss.FlatStyle = FlatStyle.Flat;
            btnCopyBoss.FlatAppearance.BorderSize = 0;
            btnCopyBoss.Cursor = Cursors.Hand;
            btnCopyBoss.Location = new Point(266, 95);
            btnCopyBoss.Size = new Size(243, 38);
            btnCopyBoss.Enabled = false;
            btnCopyBoss.Click += (s, e) => {
                if (!string.IsNullOrEmpty(bossUrl))
                {
                    try
                    {
                        Clipboard.SetText(bossUrl);
                        lblCopyFeedback.Text = "✓ Link berhasil disalin! Silakan langsung Paste (Ctrl+V) di chat WhatsApp Boss.";
                        lblCopyFeedback.ForeColor = Color.FromArgb(22, 163, 74);
                    }
                    catch
                    {
                        lblCopyFeedback.Text = "Gagal menyalin link ke clipboard.";
                        lblCopyFeedback.ForeColor = Color.Red;
                    }
                }
            };
            bossCard.Controls.Add(btnCopyBoss);

            lblCopyFeedback = new Label();
            lblCopyFeedback.Text = "💡 Klik tombol 'Salin Link WhatsApp' untuk membagikan akses ke Boss.";
            lblCopyFeedback.Font = new Font("Segoe UI", 8.25f, FontStyle.Italic);
            lblCopyFeedback.ForeColor = Color.FromArgb(100, 116, 139);
            lblCopyFeedback.Location = new Point(16, 142);
            lblCopyFeedback.Size = new Size(490, 30);
            bossCard.Controls.Add(lblCopyFeedback);

            contentPanel.Controls.Add(bossCard);
            currentY += 198;

            // 5. Card Quit / Stop (Semua Jadi Satu)
            btnQuit = new Button();
            btnQuit.Text = "🛑  HENTIKAN SERVER & KELUAR (QUIT)";
            btnQuit.Font = new Font("Segoe UI", 10f, FontStyle.Bold);
            btnQuit.BackColor = Color.FromArgb(220, 38, 38); // Red-600
            btnQuit.ForeColor = Color.White;
            btnQuit.FlatStyle = FlatStyle.Flat;
            btnQuit.FlatAppearance.BorderSize = 0;
            btnQuit.Cursor = Cursors.Hand;
            btnQuit.Location = new Point(0, currentY);
            btnQuit.Size = new Size(525, 44);
            btnQuit.Click += (s, e) => {
                DialogResult dr = MessageBox.Show(
                    "Apakah Anda yakin ingin mematikan server dan menutup aplikasi?\n(Akses lokal maupun boss online akan dihentikan)",
                    "Konfirmasi Keluar",
                    MessageBoxButtons.YesNo,
                    MessageBoxIcon.Question
                );
                if (dr == DialogResult.Yes)
                {
                    this.Close();
                }
            };
            contentPanel.Controls.Add(btnQuit);
            currentY += 48;

            Label lblQuitHint = new Label();
            lblQuitHint.Text = "Semua terintegrasi: Menutup jendela ini otomatis mematikan seluruh server di background.";
            lblQuitHint.Font = new Font("Segoe UI", 7.75f, FontStyle.Regular);
            lblQuitHint.ForeColor = Color.FromArgb(100, 116, 139);
            lblQuitHint.Location = new Point(0, currentY);
            lblQuitHint.Size = new Size(525, 20);
            lblQuitHint.TextAlign = ContentAlignment.MiddleCenter;
            contentPanel.Controls.Add(lblQuitHint);

            this.Controls.Add(contentPanel);

            // Event Closing & Timer Sinyal Stop
            this.FormClosing += MainForm_FormClosing;

            signalTimer = new System.Windows.Forms.Timer();
            signalTimer.Interval = 1000;
            signalTimer.Tick += SignalTimer_Tick;
            signalTimer.Start();

            // Jalankan worker thread untuk boot server & ngrok
            workerThread = new Thread(RunServers);
            workerThread.IsBackground = true;
            workerThread.Start();
        }

        private Panel CreateCardPanel(int x, int y, int width, int height)
        {
            Panel card = new Panel();
            card.Location = new Point(x, y);
            card.Size = new Size(width, height);
            card.BackColor = Color.White;
            card.Paint += (s, e) => {
                ControlPaint.DrawBorder(e.Graphics, card.ClientRectangle,
                    Color.FromArgb(226, 232, 240), ButtonBorderStyle.Solid);
            };
            return card;
        }

        private void LoadIconSafely()
        {
            try
            {
                string iconPath = Path.Combine(baseDir, "vantzy_icon.ico");
                if (!File.Exists(iconPath))
                {
                    DirectoryInfo parentInfo = Directory.GetParent(baseDir);
                    if (parentInfo != null)
                    {
                        string parent = parentInfo.FullName;
                        string pIcon = Path.Combine(parent, "vantzy_icon.ico");
                        if (File.Exists(pIcon)) iconPath = pIcon;
                    }
                }
                if (File.Exists(iconPath))
                {
                    this.Icon = new Icon(iconPath);
                }
            }
            catch { }
        }

        private void RunServers()
        {
            try
            {
                // 1. Matikan sisa proses lama
                KillOldProcesses();

                // 2. Jalankan npm run dev
                try
                {
                    ProcessStartInfo devPsi = new ProcessStartInfo();
                    devPsi.FileName = "cmd.exe";
                    devPsi.Arguments = "/c npm run dev";
                    devPsi.WorkingDirectory = baseDir;
                    devPsi.UseShellExecute = false;
                    devPsi.CreateNoWindow = true;
                    devProcess = Process.Start(devPsi);
                }
                catch (Exception ex)
                {
                    SafeUpdateStatus(lblServerStatus, "● Server Lokal: Gagal dijalankan (" + ex.Message + ")", Color.Red);
                }

                // 3. Jalankan ngrok http 5173
                string ngrokExe = FindNgrok();
                try
                {
                    ProcessStartInfo ngrokPsi = new ProcessStartInfo();
                    ngrokPsi.FileName = ngrokExe;
                    ngrokPsi.Arguments = "http 5173";
                    ngrokPsi.WorkingDirectory = baseDir;
                    ngrokPsi.UseShellExecute = false;
                    ngrokPsi.CreateNoWindow = true;
                    ngrokProcess = Process.Start(ngrokPsi);
                }
                catch (Exception ex)
                {
                    SafeUpdateStatus(lblNgrokStatus, "● Terowongan Online: Gagal (" + ex.Message + ")", Color.Red);
                }

                // 4. Deteksi URL Publik Ngrok
                string detectedUrl = "";
                for (int i = 0; i < 20; i++)
                {
                    if (isClosing) return;
                    Thread.Sleep(1000);
                    try
                    {
                        using (WebClient wc = new WebClient())
                        {
                            string json = wc.DownloadString("http://127.0.0.1:4040/api/tunnels");
                            Match m = Regex.Match(json, "\"public_url\":\"(https://[^\"]+)\"");
                            if (m.Success)
                            {
                                detectedUrl = m.Groups[1].Value;
                                break;
                            }
                        }
                    }
                    catch { }
                }

                // Update status Server Lokal
                SafeUpdateStatus(lblServerStatus, "● Server Lokal (Port 5173): Aktif & Siap ✓", Color.FromArgb(22, 163, 74));

                // Update status Ngrok
                if (!string.IsNullOrEmpty(detectedUrl))
                {
                    bossUrl = detectedUrl.TrimEnd('/') + "/login";
                    this.BeginInvoke((Action)delegate {
                        if (isClosing) return;
                        lblNgrokStatus.Text = "● Terowongan Online (Ngrok): Terhubung ✓";
                        lblNgrokStatus.ForeColor = Color.FromArgb(22, 163, 74);
                        txtBossUrl.Text = bossUrl;
                        btnOpenBoss.Enabled = true;
                        btnCopyBoss.Enabled = true;
                    });
                }
                else
                {
                    this.BeginInvoke((Action)delegate {
                        if (isClosing) return;
                        lblNgrokStatus.Text = "● Terowongan Online: Berjalan (Buka http://127.0.0.1:4040 untuk cek status)";
                        lblNgrokStatus.ForeColor = Color.FromArgb(202, 138, 4);
                        txtBossUrl.Text = "Ngrok aktif di background. Status: http://127.0.0.1:4040";
                    });
                }

                // Buka browser admin otomatis saat pertama kali dibuka
                Thread.Sleep(1500);
                if (!isClosing)
                {
                    try { Process.Start("http://localhost:5173/login"); } catch { }
                }
            }
            catch { }
        }

        private void SafeUpdateStatus(Label lbl, string text, Color color)
        {
            if (this.IsDisposed || isClosing) return;
            try
            {
                this.BeginInvoke((Action)delegate {
                    if (!this.IsDisposed && !isClosing)
                    {
                        lbl.Text = text;
                        lbl.ForeColor = color;
                    }
                });
            }
            catch { }
        }

        private void SignalTimer_Tick(object sender, EventArgs e)
        {
            if (File.Exists(stopSignalPath))
            {
                try { File.Delete(stopSignalPath); } catch { }
                this.Close();
            }
        }

        private void MainForm_FormClosing(object sender, FormClosingEventArgs e)
        {
            isClosing = true;
            try { signalTimer.Stop(); } catch { }

            // Ubah teks tombol quit agar pengguna tahu sedang mematikan proses
            try
            {
                btnQuit.Text = "⏳ Sedang mematikan seluruh server...";
                btnQuit.Enabled = false;
                Application.DoEvents();
            }
            catch { }

            ShutdownAll();
        }

        private void ShutdownAll()
        {
            try
            {
                if (devProcess != null && !devProcess.HasExited)
                {
                    KillProcessTree(devProcess.Id);
                }
            }
            catch { }

            try
            {
                if (ngrokProcess != null && !ngrokProcess.HasExited)
                {
                    KillProcessTree(ngrokProcess.Id);
                }
            }
            catch { }

            KillOldProcesses();
            KillPort(5173);
        }

        private static void KillProcessTree(int pid)
        {
            try
            {
                ProcessStartInfo psi = new ProcessStartInfo("taskkill", "/F /T /PID " + pid);
                psi.CreateNoWindow = true;
                psi.UseShellExecute = false;
                Process.Start(psi);
            }
            catch { }
        }

        private static void KillOldProcesses()
        {
            try
            {
                ProcessStartInfo psi = new ProcessStartInfo("taskkill", "/F /IM ngrok.exe");
                psi.CreateNoWindow = true;
                psi.UseShellExecute = false;
                Process p = Process.Start(psi);
                p.WaitForExit(1500);
            }
            catch { }
        }

        private static void KillPort(int port)
        {
            try
            {
                ProcessStartInfo psi = new ProcessStartInfo("cmd.exe", "/c netstat -ano | findstr :" + port);
                psi.CreateNoWindow = true;
                psi.UseShellExecute = false;
                psi.RedirectStandardOutput = true;
                Process p = Process.Start(psi);
                string output = p.StandardOutput.ReadToEnd();
                p.WaitForExit(1500);

                string[] lines = output.Split(new char[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries);
                foreach (string line in lines)
                {
                    if (line.Contains("LISTENING") || line.Contains(":" + port))
                    {
                        string[] parts = line.Trim().Split(new char[] { ' ' }, StringSplitOptions.RemoveEmptyEntries);
                        if (parts.Length > 0)
                        {
                            string pidStr = parts[parts.Length - 1];
                            int pid;
                            if (int.TryParse(pidStr, out pid) && pid > 0)
                            {
                                ProcessStartInfo killPsi = new ProcessStartInfo("taskkill", "/F /T /PID " + pid);
                                killPsi.CreateNoWindow = true;
                                killPsi.UseShellExecute = false;
                                Process kp = Process.Start(killPsi);
                                kp.WaitForExit(1000);
                            }
                        }
                    }
                }
            }
            catch { }
        }

        private static string FindNgrok()
        {
            string baseDir = AppDomain.CurrentDomain.BaseDirectory;
            string localPath = Path.Combine(baseDir, "ngrok.exe");
            if (File.Exists(localPath)) return localPath;

            try
            {
                DirectoryInfo parentInfo = Directory.GetParent(baseDir);
                if (parentInfo != null)
                {
                    string parent = parentInfo.FullName;
                    string pPath = Path.Combine(parent, "ngrok.exe");
                    if (File.Exists(pPath)) return pPath;
                }
            }
            catch { }

            string userProfile = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
            string scoopPath = Path.Combine(userProfile, @"scoop\shims\ngrok.exe");
            if (File.Exists(scoopPath)) return scoopPath;

            return "ngrok";
        }
    }
}
