# Guia do Instalador Xuimart — Como Replicar para Outro Plugin

Documento técnico que descreve a arquitetura do instalador WinForms C# usado
nos plugins Adobe Xuimart. Serve como referência para criar um instalador
idêntico para qualquer novo plugin CEP.

**Referência viva:** `build_5.2.13/DrawlapseInstaller.cs`

---

## 1. Visão Geral

O instalador é um **único .exe** que:
1. Auto-eleva pra administrador
2. Detecta todas as instalações do Photoshop no PC
3. Extrai os arquivos do plugin (embutidos dentro do próprio .exe)
4. Instala nas pastas corretas de cada versão
5. Habilita o debug mode no registro (CEP precisa)
6. Mostra changelog da versão na primeira execução

Não precisa de instalação prévia (como .NET installer, Visual Studio, etc).
O `csc.exe` do .NET Framework já vem no Windows.

---

## 2. Tecnologia

| Item | Valor |
|------|-------|
| Linguagem | C# 5 (compatível com csc.exe do Framework) |
| Framework | .NET Framework 4.x (WinForms) |
| Compilador | `C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe` |
| Dependências | Nenhuma externa — tudo do Framework |
| Tamanho | ~80 MB (95% é o ZIP embutido com FFmpeg) |

---

## 3. Estrutura de um Build

```
build_X.Y.Z/
  {Produto}Installer.cs      código-fonte do instalador (1 arquivo)
  installer_icon.ico         ícone do .exe
  {produto}_plugin.zip       payload com os arquivos do plugin
  {Produto}_Setup.exe        resultado da compilação
  notas.md                   notas da release (pro GitHub)
  make_zip.ps1               script que gera o ZIP
  build_installer.ps1        script que compila o .exe
```

---

## 4. Compilação

```powershell
$csc = "C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe"

$args = @(
    "/target:winexe",
    "/platform:anycpu",
    "/optimize+",
    "/win32icon:`"installer_icon.ico`"",
    "/out:`"{Produto}_Setup.exe`"",
    "/resource:`"{produto}_plugin.zip`",{produto}_plugin.zip",
    "/r:System.dll",
    "/r:System.Drawing.dll",
    "/r:System.Windows.Forms.dll",
    "/r:System.IO.Compression.dll",
    "/r:System.IO.Compression.FileSystem.dll",
    "/r:Microsoft.CSharp.dll",
    "`"{Produto}Installer.cs`""
) -join " "

Start-Process $csc -ArgumentList $args -Wait -NoNewWindow
```

**Pontos importantes:**
- `/resource:arquivo.zip,nome_do_recurso` — embutoe o ZIP como recurso do assembly
- `/target:winexe` — não mostra console ao abrir
- `/win32icon` — ícone que aparece no Explorer e na barra de tarefas
- Todos os `/r:` são assemblies do .NET Framework, sem downloads

---

## 5. Auto-elevação para Administrador

O instalador precisa escrever em `Program Files`. A primeira coisa que faz é
verificar se já está rodando como admin. Se não, se relança com `runas`:

```csharp
static void Main()
{
    if (!IsAdministrator())
    {
        var proc = new ProcessStartInfo
        {
            UseShellExecute = true,
            WorkingDirectory = Environment.CurrentDirectory,
            FileName = Application.ExecutablePath,
            Verb = "runas"   // <-- pede elevação via UAC
        };
        Process.Start(proc);
        return;  // encerra a instância não-elevada
    }

    // Aqui já é admin
    Application.Run(new InstallerForm());
}

static bool IsAdministrator()
{
    var identity = WindowsIdentity.GetCurrent();
    var principal = new WindowsPrincipal(identity);
    return principal.IsInRole(WindowsBuiltInRole.Administrator);
}
```

Se o UAC for recusado, mostra mensagem amigável explicando.

---

## 6. Detecção do Photoshop — 3 Estratégias

### 6.1. Varredura de Program Files

Procura pastas `Adobe Photoshop*` dentro de `C:\Program Files\Adobe\` e
`C:\Program Files (x86)\Adobe\`:

```csharp
foreach (var dir in Directory.GetDirectories(programDir, "Adobe"))
{
    foreach (var psDir in Directory.GetDirectories(dir, "Adobe Photoshop*"))
    {
        AddInstallIfValid(psDir);
    }
}
```

Pega: Photoshop 2018, 2019, ..., 2026, Beta.

### 6.2. Varredura do Registro

Para instalações em locais não-padrão (disco D:, por exemplo):

```csharp
void ScanRegistry(string subKeyPath, RegistryView view)
{
    using (var hklm = RegistryKey.OpenBaseKey(RegistryHive.LocalMachine, view))
    using (var adobeKey = hklm.OpenSubKey(subKeyPath))
    {
        foreach (var versionName in adobeKey.GetSubKeyNames())
        {
            using (var versionKey = adobeKey.OpenSubKey(versionName))
            {
                string installPath = versionKey.GetValue("ApplicationPath") as string
                    ?? versionKey.GetValue("Path") as string
                    ?? versionKey.GetValue("InstallPath") as string;

                if (!string.IsNullOrEmpty(installPath) && Directory.Exists(installPath))
                    AddInstallIfValid(installPath);
            }
        }
    }
}
```

Caminhos do registro:
- `SOFTWARE\Adobe\Photoshop` (32 e 64 bits)
- `SOFTWARE\Adobe\Adobe Photoshop` (32 e 64 bits)

### 6.3. Seleção Manual (fallback)

Botão "Procurar..." que abre `FolderBrowserDialog`. Valida que a pasta
selecionada contém a subpasta `Plug-ins`:

```csharp
if (Directory.Exists(Path.Combine(selected, "Plug-ins")))
{
    AddInstallIfValid(selected);
}
```

### Validação de uma instalação

```csharp
void AddInstallIfValid(string psDir)
{
    var genPath = Path.Combine(psDir, "Plug-ins", "Generator");
    var cepPath = Path.Combine(psDir, "Required", "CEP", "extensions");

    var install = new PhotoshopInstallation
    {
        Name     = Path.GetFileName(psDir),
        BasePath = psDir,
        GenPath  = genPath,
        CepPath  = cepPath,
        HasPlugin = Directory.Exists(Path.Combine(cepPath, "com.{produto}.cep")),
    };
    foundInstalls.Add(install);
}
```

### Deduplicação

Depois de varrer Program Files + Registro, deduplicar por path:

```csharp
foundInstalls = foundInstalls
    .GroupBy(i => i.BasePath.ToLowerInvariant())
    .Select(g => g.First())
    .ToList();
```

---

## 7. Estrutura do ZIP e Extração

### Estrutura obrigatória do ZIP

O instalador reconhece entradas por **prefixo**:

```
cep/...          → vai para {CepPath}/com.{produto}.cep/
generator/...    → vai para {GenPath}/com.{produto}.generator/
```

Qualquer entrada fora desses prefixos é **ignorada em silêncio**.

### Leitura do recurso embutido

```csharp
const string RESOURCE_NAME = "{produto}_plugin.zip";

var asm = Assembly.GetExecutingAssembly();
Stream stream = asm.GetManifestResourceStream(RESOURCE_NAME);

// Fallback: procurar o ZIP na mesma pasta do .exe
if (stream == null)
{
    var exeDir = Path.GetDirectoryName(Application.ExecutablePath);
    var candidates = new[] {
        Path.Combine(exeDir, "{produto}_plugin.zip"),
        // variantes de nome...
    };
}
```

### Loop de extração

```csharp
using (var archive = ZipFile.OpenRead(zipPath))
{
    foreach (var entry in archive.Entries)
    {
        string entryName = entry.FullName.Replace('\\', '/');
        if (entryName.EndsWith("/")) continue; // pasta

        if (entryName.StartsWith("generator/"))
        {
            string sub = entryName.Substring("generator/".Length);
            string destPath = Path.Combine(genDest, sub);
            // criar subpastas + extrair
            entry.ExtractToFile(destPath, overwrite: true);
        }
        else if (entryName.StartsWith("cep/"))
        {
            string sub = entryName.Substring("cep/".Length);
            // instalar em TODOS os alvos CEP marcados
            foreach (var targetBase in cepTargets)
            {
                string destPath = Path.Combine(targetBase, sub);
                entry.ExtractToFile(destPath, overwrite: true);
            }
        }
    }
}
```

---

## 8. PlayerDebugMode (obrigatório pra CEP)

Extensões CEP não assinadas só carregam se `PlayerDebugMode = "1"` estiver
no registro. O instalador escreve em todas as versões de CSXS:

```csharp
string[] csxsVersions = { "6","7","8","9","9.4","10","11","12","13","14","15" };

foreach (var ver in csxsVersions)
{
    // HKCU (usuário atual)
    using (var key = Registry.CurrentUser.CreateSubKey(@"Software\Adobe\CSXS." + ver))
        key.SetValue("PlayerDebugMode", "1", RegistryValueKind.String);

    // HKLM (todos os usuários)
    using (var key = Registry.LocalMachine.CreateSubKey(@"Software\Adobe\CSXS." + ver))
        key.SetValue("PlayerDebugMode", "1", RegistryValueKind.String);

    // WOW6432Node (apps 32-bit)
    using (var key = Registry.LocalMachine.CreateSubKey(@"Software\WOW6432Node\Adobe\CSXS." + ver))
        key.SetValue("PlayerDebugMode", "1", RegistryValueKind.String);
}
```

**É String, não DWORD.** Valor `"1"` como string.

Cobre Photoshop 2018 (CSXS 6) até 2027 (CSXS 15).

---

## 9. Alvos de Instalação CEP

O plugin CEP é instalado em múltiplos locais porque o Photoshop pode carregar
de qualquer um:

```csharp
// Alvos de instalação CEP (em ordem de prioridade)
var cepTargets = new List<string>();

// 1. Common Files (x86) — funciona em todas as versões
cepTargets.Add(Path.Combine(
    Environment.GetFolderPath(Environment.SpecialFolder.CommonProgramFilesX86),
    "Adobe", "CEP", "extensions", "com.{produto}.cep"));

// 2. Common Files (64-bit)
cepTargets.Add(Path.Combine(
    Environment.GetFolderPath(Environment.SpecialFolder.CommonProgramFiles),
    "Adobe", "CEP", "extensions", "com.{produto}.cep"));

// 3. Dentro de cada versão específica do PS (Required\CEP)
foreach (var install in foundInstalls)
{
    cepTargets.Add(Path.Combine(install.CepPath, "com.{produto}.cep"));
}
```

### Generator (se aplicável)

Um único local por versão do Photoshop:

```
{psDir}\Plug-ins\Generator\com.{produto}.generator\
```

---

## 10. Paleta do Instalador

| Nome | Hex | Uso |
|------|-----|-----|
| BG_DARK | `#0e0e14` | fundo da janela |
| BG_CARD | `#181822` | cards internos |
| BG_PANEL | `#20202e` | painéis laterais |
| ACCENT | `#de2246` | botão instalar |
| SUCCESS | `#22c864` | log de sucesso |
| WARNING | `#fbbf24` | avisos |
| ERROR_CLR | `#ef4444` | erros |
| TEXT_MAIN | `#f0f0ff` | texto principal |
| TEXT_DIM | `#8c8ca5` | texto secundário |
| BORDER | `#37374b` | bordas |
| CYAN_BTN | `#00c8c8` | botão Pix |

Janela fixa: **780 × 540px**. Fonte: Segoe UI 9pt.

---

## 11. Layout da Janela

```
┌──────────────────────────────────────────────────────┐
│  HEADER: título + versão                             │
├──────────┬───────────────────────────────────────────┤
│          │                                           │
│  LEFT    │  RIGHT PANEL                              │
│  PANEL   │                                           │
│          │  ┌─────────────────────────────────────┐  │
│  Lista   │  │  LOG (RichTextBox, colorido)        │  │
│  de PS   │  │                                     │  │
│  detecta │  │  • Photoshop 2024 [instalado]       │  │
│  dos     │  │  • Photoshop 2025 [não instalado]   │  │
│          │  │  • Plugin carregado (100% embutido) │  │
│  [✓] PS  │  │  • PlayerDebugMode ativado          │  │
│  [✓] PS  │  │  • Instalação concluída!            │  │
│          │  └─────────────────────────────────────┘  │
│          │                                           │
│  [Instal]│  [====== Progress Bar ======]             │
│  [Backup]│                                           │
│  [Procu..]│                                          │
├──────────┴───────────────────────────────────────────┤
│  FOOTER: Xuimart · Pix · Ko-fi                       │
└──────────────────────────────────────────────────────┘
```

---

## 12. Funcionalidades Extras

### Backup antes de instalar

Copia a instalação atual pra uma pasta de backup com timestamp:

```
%APPDATA%\{Produto}\backups\{timestamp}\
  generator\   (cópia completa)
  cep\         (cópia completa)
```

### Restauração

Botão "Restaurar Backup" lista os backups disponíveis e copia de volta.

### Changelog na primeira execução

`ShowChangelogOnce()` mostra um MessageBox com as novidades. O texto é
hardcoded no instalador (sem acentuação pra evitar problemas de encoding):

```csharp
void ShowChangelogOnce()
{
    string changelog =
        "{Produto} vX.Y.Z - Novidades:\n\n" +
        "CORRECAO:\n" +
        "  - ...\n\n" +
        "Desenvolvido por Xuimart\n" +
        "Apoie: https://livepix.gg/xuimart";
    MessageBox.Show(changelog, "Novidades do {Produto} vX.Y.Z",
        MessageBoxButtons.OK, MessageBoxIcon.Information);
}
```

### Aviso sobre Generator

Se o plugin usa Generator, instruir o usuário:

```
1. Vá em: Editar > Preferências > Plug-ins
2. Marque: Habilitar Generator
3. OK e reinicie o Photoshop
```

---

## 13. Adaptando para Outro Plugin

### O que trocar

| Local | De | Para |
|-------|-----|------|
| `AssemblyTitle` | "DrawlapsePS Installer" | "{NovoProduto} Installer" |
| `AssemblyVersion` | "5.2.13.0" | "1.0.0.0" |
| `this.Text` | "Instalador DrawlapsePS v5.2.13" | "Instalador {Produto} v1.0.0" |
| `RESOURCE_NAME` | "drawlapseps_plugin.zip" | "{produto}_plugin.zip" |
| `HasPlugin` check | "com.drawlapseps.cep" | "com.{produto}.cep" |
| `genDest` | "com.drawlapseps.generator" | "com.{produto}.generator" |
| Prefixos do ZIP | `cep/`, `generator/` | manter ou adaptar |
| Changelog | texto do DrawlapsePS | texto do novo plugin |
| Botões de apoio | livepix.gg/xuimart | manter (marca compartilhada) |

### O que manter igual

- Paleta de cores (identidade Xuimart)
- Layout da janela (780×540, painel esquerdo + log direito)
- Auto-elevação UAC
- Detecção via Program Files + Registro
- PlayerDebugMode em todas as versões CSXS
- Backup antes de instalar
- Fallback de browse manual
- Botões Pix + Ko-fi no footer

### Se o plugin NÃO usa Generator

Remova:
- O bloco de extração de `generator/`
- O `GenPath` do `PhotoshopInstallation`
- O aviso sobre "Habilitar Generator"
- O prefixo `generator/` do ZIP

O resto (CEP, detecção, PlayerDebugMode) continua igual.

---

## 14. Compatibilidade com Photoshops Antigos

O instalador funciona com Photoshop **2018 até 2027+** porque:

1. **Detecção:** varre `Adobe Photoshop*` (wildcard) — pega qualquer ano
2. **CEP/CSXS:** escreve PlayerDebugMode de CSXS 6 a 15 (todas as versões)
3. **Extensão:** o `manifest.xml` declara `Host Version="[19.0,99.9]"` — aceita
   Photoshop CC 2018 (v19) até qualquer versão futura
4. **Common Files:** instalar em Common Files funciona pra todas as versões
   simultaneamente, sem precisar copiar pra cada pasta individual

O único limite real é a versão do CEP/CEF embarcado no Photoshop — se a
extensão usar APIs JavaScript muito novas, versões antigas podem não suportar.
Mas o painel em si carrega.

---

## 15. Checklist para Criar Instalador de Novo Plugin

- [ ] Copiar `DrawlapseInstaller.cs` como template
- [ ] Buscar/substituir todos os nomes (`drawlapseps` → `{produto}`)
- [ ] Ajustar `AssemblyVersion` para `1.0.0.0`
- [ ] Atualizar o texto do `ShowChangelogOnce()`
- [ ] Remover referências ao Generator se não aplicável
- [ ] Criar o `make_zip.ps1` com os prefixos corretos
- [ ] Criar `installer_icon.ico` (identidade do novo produto)
- [ ] Gerar o ZIP com a estrutura `cep/...` (e `generator/...` se aplicável)
- [ ] Compilar com `csc.exe`
- [ ] Testar em máquina limpa: auto-elevação, detecção, instalação, PlayerDebugMode
- [ ] Confirmar que o painel carrega no Photoshop após instalar
- [ ] Publicar no GitHub com nome `{Produto}_Setup.exe`
