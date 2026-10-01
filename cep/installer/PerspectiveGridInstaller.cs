// Instalador do Perspective Grid, versão CEP (Photoshop CC 2018 ou mais novo).
// Padrão Xuimart (GUIA_INSTALADOR_XUIMART.md): WinForms num único .exe, com o
// plugin embutido como recurso. Compilado pelo build-cep-installer.ps1 com o
// csc.exe do .NET Framework, então é C# 5: sem $"..." nem ?. .
//
// Diferença consciente do DrawlapsePS: instala só para o usuário atual
// (%APPDATA%\Adobe\CEP\extensions + HKCU). Essa pasta vale para todas as versões
// do Photoshop com CEP, e assim o instalador não precisa pedir administrador.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Reflection;
using System.Text.RegularExpressions;
using System.Threading;
using System.Windows.Forms;
using Microsoft.Win32;

[assembly: AssemblyTitle("Perspective Grid Installer")]
[assembly: AssemblyDescription("Instalador do Perspective Grid para Adobe Photoshop (versão CEP)")]
[assembly: AssemblyCompany("Xuimart")]
[assembly: AssemblyProduct("Perspective Grid")]
[assembly: AssemblyVersion("__VERSION__.0")]
[assembly: AssemblyFileVersion("__VERSION__.0")]

namespace Xuimart.PerspectiveGrid
{
    enum Level { Info, Ok, Warn, Error }

    static class Program
    {
        [STAThread]
        static int Main(string[] args)
        {
            // /silent instala sem janela e grava o log em %TEMP% (teste do build).
            if (args.Any(a => a.Equals("/silent", StringComparison.OrdinalIgnoreCase)))
            {
                File.WriteAllText(Setup.LogFile, "");
                bool ok = Setup.Install((m, l) => File.AppendAllText(Setup.LogFile, "[" + l + "] " + m + Environment.NewLine), p => { });
                return ok ? 0 : 1;
            }
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new InstallerForm());
            return 0;
        }
    }

    class PhotoshopInstall
    {
        public string Name;
        public string Folder;
        public string Version;
        public int Major;
    }

    static class Setup
    {
        public const string VERSION = "__VERSION__";
        public const string RESOURCE_NAME = "perspectivegrid_plugin.zip";
        public const string EXTENSION_ID = "com.xuimart.perspectivegrid.cep";
        // CSXS 8 = Photoshop CC 2018, 9 = 2019/2020; os demais cobrem as seguintes.
        static readonly string[] CSXS_VERSIONS = { "6", "7", "8", "9", "9.4", "10", "11", "12", "13", "14", "15" };

        public static string TargetDir
        {
            get { return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "Adobe", "CEP", "extensions", EXTENSION_ID); }
        }

        public static string LogFile
        {
            get { return Path.Combine(Path.GetTempPath(), "PerspectiveGrid_Setup.log"); }
        }

        public static bool PhotoshopRunning()
        {
            return Process.GetProcessesByName("Photoshop").Length > 0;
        }

        // Versão já instalada (lida do manifest.xml instalado) ou null.
        public static string InstalledVersion()
        {
            string manifest = Path.Combine(TargetDir, "CSXS", "manifest.xml");
            if (!File.Exists(manifest)) return null;
            Match m = Regex.Match(File.ReadAllText(manifest), "ExtensionBundleVersion=\"([^\"]+)\"");
            return m.Success ? m.Groups[1].Value : "?";
        }

        // Pastas padrão e registro, como no instalador do DrawlapsePS. Serve para
        // informar o usuário; a instalação vale para todas as versões.
        public static List<PhotoshopInstall> FindPhotoshops()
        {
            var folders = new List<string>();
            foreach (var programs in new[] { Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86) })
            {
                try
                {
                    string adobe = Path.Combine(programs, "Adobe");
                    if (Directory.Exists(adobe)) folders.AddRange(Directory.GetDirectories(adobe, "Adobe Photoshop*"));
                }
                catch { }
            }
            foreach (var view in new[] { RegistryView.Registry64, RegistryView.Registry32 })
            {
                try
                {
                    using (var hklm = RegistryKey.OpenBaseKey(RegistryHive.LocalMachine, view))
                    using (var ps = hklm.OpenSubKey(@"SOFTWARE\Adobe\Photoshop"))
                    {
                        if (ps == null) continue;
                        foreach (var name in ps.GetSubKeyNames())
                        {
                            using (var key = ps.OpenSubKey(name))
                            {
                                string path = key == null ? null : key.GetValue("ApplicationPath") as string;
                                if (!string.IsNullOrEmpty(path)) folders.Add(path);
                            }
                        }
                    }
                }
                catch { }
            }
            var found = new List<PhotoshopInstall>();
            foreach (var folder in folders.Select(f => f.TrimEnd('\\')).GroupBy(f => f.ToLowerInvariant()).Select(g => g.First()))
            {
                string exe = Path.Combine(folder, "Photoshop.exe");
                if (!File.Exists(exe)) continue;
                var info = FileVersionInfo.GetVersionInfo(exe);
                found.Add(new PhotoshopInstall
                {
                    Name = Path.GetFileName(folder),
                    Folder = folder,
                    Version = info.FileMajorPart + "." + info.FileMinorPart,
                    Major = info.FileMajorPart
                });
            }
            return found.OrderBy(p => p.Major).ThenBy(p => p.Name).ToList();
        }

        static Stream OpenPayload()
        {
            Stream stream = Assembly.GetExecutingAssembly().GetManifestResourceStream(RESOURCE_NAME);
            if (stream != null) return stream;
            // Fallback do padrão: ZIP solto ao lado do .exe (testar sem recompilar).
            string loose = Path.Combine(Path.GetDirectoryName(Application.ExecutablePath), RESOURCE_NAME);
            if (File.Exists(loose)) return File.OpenRead(loose);
            throw new Exception("o plugin embutido não foi encontrado no instalador.");
        }

        static string Normalize(string entry)
        {
            return entry.Replace('\\', '/');
        }

        public static bool Install(Action<string, Level> report, Action<int> progress)
        {
            try
            {
                report("Instalando Perspective Grid " + VERSION + " (versão CEP)...", Level.Info);
                string target = TargetDir;
                string staging = target + ".novo";
                progress(5);
                using (Stream payload = OpenPayload())
                using (var zip = new ZipArchive(payload, ZipArchiveMode.Read))
                {
                    // O pacote só reconhece o prefixo cep/; o resto é ignorado.
                    var entries = zip.Entries.Where(e => Normalize(e.FullName).StartsWith("cep/") && !Normalize(e.FullName).EndsWith("/")).ToList();
                    if (entries.Count == 0) throw new Exception("o instalador não contém os arquivos do plugin.");
                    // Extrai ao lado e só depois troca: se algo falhar no meio, a
                    // instalação anterior continua inteira.
                    if (Directory.Exists(staging)) Directory.Delete(staging, true);
                    string root = Path.GetFullPath(staging) + Path.DirectorySeparatorChar;
                    for (int i = 0; i < entries.Count; i++)
                    {
                        string rel = Normalize(entries[i].FullName).Substring(4);
                        string dest = Path.GetFullPath(Path.Combine(staging, rel.Replace('/', Path.DirectorySeparatorChar)));
                        if (!dest.StartsWith(root, StringComparison.OrdinalIgnoreCase)) throw new Exception("caminho inválido no pacote: " + rel);
                        Directory.CreateDirectory(Path.GetDirectoryName(dest));
                        entries[i].ExtractToFile(dest, true);
                        progress(10 + (i + 1) * 70 / entries.Count);
                    }
                    report(entries.Count + " arquivos do plugin extraídos.", Level.Info);
                }
                if (Directory.Exists(target)) Directory.Delete(target, true);
                Directory.Move(staging, target);
                report("Plugin instalado em " + target, Level.Ok);
                progress(90);

                // Painéis CEP que não vêm da loja da Adobe só carregam com o
                // PlayerDebugMode ligado. É texto "1", não DWORD.
                foreach (var v in CSXS_VERSIONS)
                {
                    using (var key = Registry.CurrentUser.CreateSubKey(@"Software\Adobe\CSXS." + v))
                        key.SetValue("PlayerDebugMode", "1", RegistryValueKind.String);
                }
                report("PlayerDebugMode ligado (o Photoshop exige para painéis fora da loja da Adobe).", Level.Ok);
                progress(100);
                return true;
            }
            catch (Exception ex)
            {
                string hint = PhotoshopRunning() ? " Feche o Photoshop e tente de novo." : "";
                report("Não foi possível instalar: " + ex.Message + hint, Level.Error);
                return false;
            }
        }

        public static bool Uninstall(Action<string, Level> report)
        {
            try
            {
                if (!Directory.Exists(TargetDir)) { report("O Perspective Grid não estava instalado.", Level.Info); return true; }
                Directory.Delete(TargetDir, true);
                report("Perspective Grid removido. O PlayerDebugMode continua ligado, porque outros painéis podem precisar dele.", Level.Ok);
                return true;
            }
            catch (Exception ex)
            {
                string hint = PhotoshopRunning() ? " Feche o Photoshop e tente de novo." : "";
                report("Não foi possível remover: " + ex.Message + hint, Level.Error);
                return false;
            }
        }
    }

    class InstallerForm : Form
    {
        static readonly Color BG_DARK = ColorTranslator.FromHtml("#0e0e14");
        static readonly Color BG_CARD = ColorTranslator.FromHtml("#181822");
        static readonly Color BG_PANEL = ColorTranslator.FromHtml("#20202e");
        static readonly Color ACCENT = ColorTranslator.FromHtml("#de2246");
        static readonly Color SUCCESS = ColorTranslator.FromHtml("#22c864");
        static readonly Color WARNING = ColorTranslator.FromHtml("#fbbf24");
        static readonly Color ERROR_CLR = ColorTranslator.FromHtml("#ef4444");
        static readonly Color TEXT_MAIN = ColorTranslator.FromHtml("#f0f0ff");
        static readonly Color TEXT_DIM = ColorTranslator.FromHtml("#8c8ca5");
        static readonly Color BORDER = ColorTranslator.FromHtml("#37374b");
        static readonly Color CYAN_BTN = ColorTranslator.FromHtml("#00c8c8");

        readonly RichTextBox log;
        readonly ListBox psList;
        readonly Button installBtn;
        readonly Button removeBtn;
        readonly Panel progressFill;
        readonly Panel progressTrack;

        public InstallerForm()
        {
            Text = "Instalador Perspective Grid v" + Setup.VERSION;
            AutoScaleDimensions = new SizeF(96F, 96F);
            AutoScaleMode = AutoScaleMode.Dpi;
            ClientSize = new Size(780, 540);
            FormBorderStyle = FormBorderStyle.FixedSingle;
            MaximizeBox = false;
            StartPosition = FormStartPosition.CenterScreen;
            BackColor = BG_DARK;
            ForeColor = TEXT_MAIN;
            Font = new Font("Segoe UI", 9F);
            try { Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath); } catch { }

            // Cabeçalho
            var title = new Label { Text = "Perspective Grid", Font = new Font("Segoe UI", 22F, FontStyle.Bold), ForeColor = TEXT_MAIN, AutoSize = true, Location = new Point(22, 10) };
            var subtitle = new Label { Text = "Instalador · versão " + Setup.VERSION + " · Photoshop CC 2018 ou mais novo", ForeColor = TEXT_DIM, AutoSize = true, Location = new Point(26, 52) };
            var accentLine = new Panel { BackColor = ACCENT, Location = new Point(0, 76), Size = new Size(780, 2) };
            Controls.AddRange(new Control[] { title, subtitle, accentLine });

            // Painel esquerdo: Photoshops encontrados e ações
            var left = new Panel { BackColor = BG_PANEL, Location = new Point(0, 78), Size = new Size(270, 426) };
            var listTitle = new Label { Text = "PHOTOSHOP NESTE COMPUTADOR", ForeColor = TEXT_DIM, Font = new Font("Segoe UI", 8F, FontStyle.Bold), AutoSize = true, Location = new Point(20, 18) };
            psList = new ListBox { BackColor = BG_CARD, ForeColor = TEXT_MAIN, BorderStyle = BorderStyle.None, Location = new Point(20, 42), Size = new Size(230, 190), IntegralHeight = false, SelectionMode = SelectionMode.None };
            var note = new Label { Text = "A instalação vale para todas as versões do Photoshop CC 2018 ou mais novo deste usuário. Não precisa de administrador.", ForeColor = TEXT_DIM, Location = new Point(20, 244), Size = new Size(230, 64) };
            installBtn = MakeButton("Instalar", ACCENT, Color.White, new Point(20, 318), new Size(230, 44), true);
            removeBtn = MakeButton("Desinstalar", BG_CARD, TEXT_DIM, new Point(20, 372), new Size(230, 34), false);
            installBtn.Click += (s, e) => RunInstall();
            removeBtn.Click += (s, e) => RunUninstall();
            left.Controls.AddRange(new Control[] { listTitle, psList, note, installBtn, removeBtn });
            Controls.Add(left);

            // Direita: log colorido e progresso
            var logTitle = new Label { Text = "PROGRESSO", ForeColor = TEXT_DIM, Font = new Font("Segoe UI", 8F, FontStyle.Bold), AutoSize = true, Location = new Point(290, 96) };
            log = new RichTextBox { BackColor = BG_CARD, ForeColor = TEXT_MAIN, BorderStyle = BorderStyle.None, ReadOnly = true, Location = new Point(290, 120), Size = new Size(468, 340), Font = new Font("Segoe UI", 9F), DetectUrls = false };
            progressTrack = new Panel { BackColor = BORDER, Location = new Point(290, 474), Size = new Size(468, 6) };
            progressFill = new Panel { BackColor = ACCENT, Location = new Point(0, 0), Size = new Size(0, 6) };
            progressTrack.Controls.Add(progressFill);
            Controls.AddRange(new Control[] { logTitle, log, progressTrack });

            // Rodapé: marca e apoio
            var footer = new Panel { BackColor = BG_CARD, Location = new Point(0, 504), Size = new Size(780, 36) };
            var brand = new LinkLabel { Text = "Desenvolvido por Xuimart", AutoSize = true, Location = new Point(20, 10), LinkColor = TEXT_DIM, ActiveLinkColor = TEXT_MAIN, LinkBehavior = LinkBehavior.HoverUnderline };
            brand.LinkClicked += (s, e) => Open("https://www.xuimart.com.br");
            var pix = MakeButton("Pix", CYAN_BTN, BG_DARK, new Point(614, 6), new Size(70, 24), false);
            var kofi = MakeButton("Ko-fi", BG_PANEL, TEXT_MAIN, new Point(690, 6), new Size(70, 24), false);
            pix.Click += (s, e) => Open("https://livepix.gg/xuimart");
            kofi.Click += (s, e) => Open("https://ko-fi.com/xuimart");
            footer.Controls.AddRange(new Control[] { brand, pix, kofi });
            Controls.Add(footer);

            Load += (s, e) => Detect();
        }

        Button MakeButton(string text, Color back, Color fore, Point at, Size size, bool bold)
        {
            var b = new Button { Text = text, BackColor = back, ForeColor = fore, Location = at, Size = size, FlatStyle = FlatStyle.Flat, Cursor = Cursors.Hand, UseVisualStyleBackColor = false };
            b.FlatAppearance.BorderColor = back == BG_CARD ? BORDER : back;
            b.FlatAppearance.BorderSize = 1;
            if (bold) b.Font = new Font("Segoe UI", 10F, FontStyle.Bold);
            return b;
        }

        void Open(string url)
        {
            try { Process.Start(url); } catch { }
        }

        void Detect()
        {
            var installs = Setup.FindPhotoshops();
            if (installs.Count == 0)
            {
                psList.Items.Add("Nenhum encontrado nas pastas padrão");
                Report("Não encontrei o Photoshop nas pastas padrão. Se ele estiver em outro lugar, a instalação funciona do mesmo jeito.", Level.Warn);
            }
            foreach (var p in installs)
            {
                bool ok = p.Major >= 19; // 19 = Photoshop CC 2018 (mínimo do manifest)
                psList.Items.Add(p.Name + "  ·  " + p.Version + (ok ? "" : "  (não suportado)"));
                Report("Encontrado: " + p.Name + " (" + p.Version + ")" + (ok ? "" : ": anterior ao CC 2018, não suportado"), ok ? Level.Info : Level.Warn);
            }
            string installed = Setup.InstalledVersion();
            if (installed == Setup.VERSION)
            {
                Report("A versão " + installed + " já está instalada. Clique em Reinstalar se quiser instalar de novo.", Level.Info);
                installBtn.Text = "Reinstalar";
            }
            else if (installed != null)
            {
                Report("Versão instalada: " + installed + ". Clique em Atualizar para instalar a " + Setup.VERSION + ".", Level.Info);
                installBtn.Text = "Atualizar";
            }
            else
            {
                Report("Pronto para instalar. Clique em Instalar.", Level.Info);
            }
        }

        void RunInstall()
        {
            SetBusy(true);
            SetProgress(0);
            var worker = new Thread(() =>
            {
                bool ok = Setup.Install(Report, SetProgress);
                if (ok)
                {
                    Report("Instalação concluída.", Level.Ok);
                    if (Setup.PhotoshopRunning()) Report("O Photoshop está aberto: feche por completo e abra de novo para carregar o painel.", Level.Warn);
                    else Report("Abra o Photoshop.", Level.Info);
                    Report("O painel fica em Janela > Extensões > Perspective Grid. No Photoshop 2022 ou mais novo o menu se chama Extensões (legado).", Level.Info);
                }
                Ui(() => { SetBusy(false); if (ok) installBtn.Text = "Reinstalar"; });
            });
            worker.IsBackground = true;
            worker.Start();
        }

        void RunUninstall()
        {
            SetBusy(true);
            bool ok = Setup.Uninstall(Report);
            if (ok) { installBtn.Text = "Instalar"; SetProgress(0); }
            SetBusy(false);
        }

        void Ui(Action action)
        {
            if (InvokeRequired) BeginInvoke(action); else action();
        }

        void SetBusy(bool busy)
        {
            Ui(() => { installBtn.Enabled = !busy; removeBtn.Enabled = !busy; UseWaitCursor = busy; });
        }

        void SetProgress(int percent)
        {
            Ui(() => { progressFill.Width = progressTrack.Width * Math.Max(0, Math.Min(100, percent)) / 100; });
        }

        void Report(string message, Level level)
        {
            Color color = level == Level.Ok ? SUCCESS : level == Level.Warn ? WARNING : level == Level.Error ? ERROR_CLR : TEXT_MAIN;
            string mark = level == Level.Ok ? "✓ " : level == Level.Warn ? "! " : level == Level.Error ? "✕ " : "• ";
            Ui(() =>
            {
                log.SelectionStart = log.TextLength;
                log.SelectionLength = 0;
                log.SelectionColor = color;
                log.AppendText(mark + message + Environment.NewLine);
                log.ScrollToCaret();
            });
        }
    }
}
