# Gera o instalador .exe da versao CEP (Photoshop CC 2018+) no padrao Xuimart:
# WinForms compilado com o csc.exe do .NET Framework, com o plugin embutido.
#   dist\installer\PerspectiveGrid_CEP_Setup.exe
# Roda o build-cep.cjs antes, entao o plugin embutido e sempre o atual.
# Com -Changelog tambem grava o version-cep.json (aviso de atualizacao do CEP).
# Ordem do padrao: publicar a release, conferir o link e SO DEPOIS fazer push
# do version-cep.json (e ele que avisa os usuarios).
# Uso: powershell -File build-cep-installer.ps1 [-Changelog "Novidades"]
param([string]$Changelog)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
Add-Type -AssemblyName System.Drawing

$root    = $PSScriptRoot
$csc     = 'C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$ext     = Join-Path $root 'dist\cep\PerspectiveGrid-CEP\com.xuimart.perspectivegrid.cep'
$out     = Join-Path $root 'dist\installer'
$zip     = Join-Path $out 'perspectivegrid_plugin.zip'
$ico     = Join-Path $out 'installer_icon.ico'
$cs      = Join-Path $out 'PerspectiveGridInstaller.cs'
$exe     = Join-Path $out 'PerspectiveGrid_CEP_Setup.exe'
$version = (Get-Content (Join-Path $root 'uxp\manifest.json') -Raw | ConvertFrom-Json).version

# 1. Plugin atualizado.
& node (Join-Path $root 'build-cep.cjs') | Out-Null
if ($LASTEXITCODE) { throw 'build-cep.cjs falhou' }
if (Test-Path $out) { Remove-Item $out -Recurse -Force }
New-Item -ItemType Directory -Path $out -Force | Out-Null

# 2. Payload: tudo sob o prefixo cep/. O instalador ignora entradas fora dele,
#    entao a contagem precisa bater com os arquivos da extensao.
$files = Get-ChildItem $ext -Recurse -File
$fs = [System.IO.File]::Open($zip, 'CreateNew')
$archive = New-Object System.IO.Compression.ZipArchive($fs, [System.IO.Compression.ZipArchiveMode]::Create)
foreach ($f in $files) {
  $entry = 'cep/' + $f.FullName.Substring($ext.Length + 1).Replace('\', '/')
  [void][System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $f.FullName, $entry, [System.IO.Compression.CompressionLevel]::Optimal)
}
$archive.Dispose(); $fs.Dispose()

# 3. Icone multi-tamanho a partir do logo PG (imagens PNG dentro do ICO).
$logo = [System.Drawing.Image]::FromFile((Join-Path $root 'assets\logo-source.png'))
$images = @()
foreach ($s in 16, 24, 32, 48, 64, 128, 256) {
  $bmp = New-Object System.Drawing.Bitmap $s, $s
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = 'HighQualityBicubic'; $g.SmoothingMode = 'HighQuality'; $g.PixelOffsetMode = 'HighQuality'
  $g.Clear([System.Drawing.Color]::Transparent)
  $k = [Math]::Min($s / $logo.Width, $s / $logo.Height)
  $w = [int]($logo.Width * $k); $h = [int]($logo.Height * $k)
  $g.DrawImage($logo, [int](($s - $w) / 2), [int](($s - $h) / 2), $w, $h)
  $g.Dispose()
  $ms = New-Object System.IO.MemoryStream
  $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png); $bmp.Dispose()
  $images += ,@($s, $ms.ToArray())
}
$logo.Dispose()
$icoStream = [System.IO.File]::Create($ico)
$bw = New-Object System.IO.BinaryWriter($icoStream)
$bw.Write([UInt16]0); $bw.Write([UInt16]1); $bw.Write([UInt16]$images.Count)
$offset = 6 + 16 * $images.Count
foreach ($im in $images) {
  $dim = if ($im[0] -ge 256) { 0 } else { $im[0] }   # 0 = 256 no formato ICO
  $bw.Write([byte]$dim); $bw.Write([byte]$dim); $bw.Write([byte]0); $bw.Write([byte]0)
  $bw.Write([UInt16]1); $bw.Write([UInt16]32); $bw.Write([UInt32]$im[1].Length); $bw.Write([UInt32]$offset)
  $offset += $im[1].Length
}
foreach ($im in $images) { $bw.Write([byte[]]$im[1]) }
$bw.Dispose()

# 4. Compila. /codepage:65001 porque o .cs tem acentos (UTF-8).
$source = (Get-Content (Join-Path $root 'cep\installer\PerspectiveGridInstaller.cs') -Raw -Encoding UTF8).Replace('__VERSION__', $version)
[System.IO.File]::WriteAllText($cs, $source, (New-Object System.Text.UTF8Encoding($false)))
$cscArgs = @('/nologo', '/target:winexe', '/platform:anycpu', '/optimize+', '/codepage:65001',
  "/win32icon:$ico", "/out:$exe", "/resource:$zip,perspectivegrid_plugin.zip",
  '/r:System.dll', '/r:System.Core.dll', '/r:System.Drawing.dll', '/r:System.Windows.Forms.dll',
  '/r:System.IO.Compression.dll', '/r:System.IO.Compression.FileSystem.dll', $cs)
& $csc @cscArgs
if ($LASTEXITCODE -or -not (Test-Path $exe)) { throw 'csc falhou' }

# 5. Confere lendo do proprio .exe: recurso presente, contagem e versao.
$asm = [System.Reflection.Assembly]::LoadFile($exe)
$res = $asm.GetManifestResourceStream('perspectivegrid_plugin.zip')
if (-not $res) { throw 'recurso perspectivegrid_plugin.zip ausente no .exe' }
$z = New-Object System.IO.Compression.ZipArchive($res, [System.IO.Compression.ZipArchiveMode]::Read)
$cepEntries = @($z.Entries | Where-Object { $_.FullName.StartsWith('cep/') }).Count
$other = $z.Entries.Count - $cepEntries
$m = $z.GetEntry('cep/CSXS/manifest.xml')
$r = New-Object System.IO.StreamReader($m.Open()); $xml = $r.ReadToEnd(); $r.Dispose(); $z.Dispose()
$packed = [regex]::Match($xml, 'ExtensionBundleVersion="([^"]+)"').Groups[1].Value
if ($cepEntries -ne $files.Count -or $other -ne 0) { throw "payload com $cepEntries entradas cep/ e $other fora (esperado $($files.Count) e 0)" }
if ($packed -ne $version) { throw "versao embutida $packed diferente de $version" }
$fv = [System.Diagnostics.FileVersionInfo]::GetVersionInfo($exe)

# 6. version-cep.json: o downloadUrl NUNCA muda. UTF-8 sem BOM.
if ($Changelog) {
  $downloadUrl = 'https://github.com/xuimart/perspective-grid-plugin/releases/latest/download/PerspectiveGrid_CEP_Setup.exe'
  $json = [ordered]@{ version = $version; downloadUrl = $downloadUrl; changelog = $Changelog } | ConvertTo-Json
  [System.IO.File]::WriteAllText((Join-Path $root 'version-cep.json'), $json + "`n", (New-Object System.Text.UTF8Encoding($false)))
  Write-Output "json    : $(Join-Path $root 'version-cep.json')"
}

Write-Output "versao  : $version (arquivo $($fv.FileVersion))"
Write-Output "payload : $cepEntries arquivos sob cep/, $other fora"
Write-Output "exe     : $exe ($([math]::Round((Get-Item $exe).Length / 1KB)) KB)"
Write-Output "sha256  : $((Get-FileHash $exe -Algorithm SHA256).Hash.ToLower())"
