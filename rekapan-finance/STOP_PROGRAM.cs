using System;
using System.Diagnostics;
using System.IO;
using System.Threading;

namespace RekapanFinanceStopper
{
    class Program
    {
        static void Main(string[] args)
        {
            try
            {
                Console.Title = "OS Hutang Finance - Menghentikan Program";
            }
            catch { }

            Console.ForegroundColor = ConsoleColor.Cyan;
            Console.WriteLine("=============================================================");
            Console.WriteLine("      MENGHENTIKAN SISTEM REKAPAN KEUANGAN & NGROK...        ");
            Console.WriteLine("=============================================================");
            Console.ResetColor();

            string baseDir = AppDomain.CurrentDomain.BaseDirectory;

            // 1. Tulis sinyal stop untuk JALANKAN_PROGRAM
            try
            {
                File.WriteAllText(Path.Combine(baseDir, ".stop_signal"), "stop");
            }
            catch { }

            // 2. Matikan proses JALANKAN_PROGRAM jika ada
            Console.WriteLine(" [1/3] Menutup aplikasi launcher...");
            KillByName("JALANKAN_PROGRAM");

            // 3. Matikan ngrok
            Console.WriteLine(" [2/3] Menutup terowongan online Ngrok...");
            KillByName("ngrok");

            // 4. Cari dan matikan proses node yang mendengarkan port 5173
            Console.WriteLine(" [3/3] Mematikan server port 5173 (Vite / Node)...");
            KillPort(5173);

            // 5. Bersihkan file sinyal
            try
            {
                string signalPath = Path.Combine(baseDir, ".stop_signal");
                if (File.Exists(signalPath)) File.Delete(signalPath);
            }
            catch { }

            Console.WriteLine();
            Console.ForegroundColor = ConsoleColor.Green;
            Console.WriteLine("=============================================================");
            Console.WriteLine(" [✓] Seluruh server dan terowongan Ngrok berhasil ditutup!   ");
            Console.WriteLine("=============================================================");
            Console.ResetColor();

            Console.WriteLine("\nJendela ini akan otomatis tertutup dalam 2 detik...");
            Thread.Sleep(2000);
        }

        static void KillByName(string processName)
        {
            try
            {
                ProcessStartInfo psi = new ProcessStartInfo("taskkill", "/F /T /IM " + processName + ".exe");
                psi.CreateNoWindow = true;
                psi.UseShellExecute = false;
                Process p = Process.Start(psi);
                p.WaitForExit(1500);
            }
            catch { }
        }

        static void KillPort(int port)
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
    }
}
