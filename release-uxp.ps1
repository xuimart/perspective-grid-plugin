# Gera os arquivos de release do plugin UXP no padrao de update Xuimart.
#   dist\release\PerspectiveGrid.ccx  -> nome FIXO, sem versao: o link
#       /releases/latest/download/PerspectiveGrid.ccx depende disso.
#   version.json (raiz do repo)       -> lido pelo aviso de atualizacao do painel.
# Nao publica nada. Ordem do padrao: publicar a release, conferir o link
# permanente e SO DEPOIS fazer push do version.json (e ele que avisa os usuarios).
# Uso: powershell -File release-uxp.ps1 -Changelog "Texto curto das novidades"
param([Parameter(Mandatory = $true)][string]$Changelog)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$root = $PSScriptRoot
$src  = Join-Path $root 'uxp'
$out  = Join-Path $root 'dist\release'
$ccx  = Join-Path $out 'PerspectiveGrid.ccx'
$downloadUrl = 'https://github.com/xuimart/perspective-grid-plugin/releases/latest/download/PerspectiveGrid.ccx'
# Documentos de desenvolvimento e backups nao vao para o pacote.
$exclude = @('LEIA-ME-UXP.md', 'ESPECIFICACAO.md', 'STATUS-E-ROADMAP.md')
$version = (Get-Content (Join-Path $src 'manifest.json') -Raw | ConvertFrom-Json).version

New-Item -ItemType Directory -Path $out -Force | Out-Null
if (Test-Path $ccx) { Remove-Item $ccx -Force }

# ZipArchive com "/" nos caminhos (formato padrao de ZIP). O Compress-Archive
# do Windows PowerShell grava "\", o que pode falhar fora do Windows.
$files = Get-ChildItem $src -Recurse -File | Where-Object {
  $top = ($_.FullName.Substring($src.Length + 1) -split '[\\/]')[0]
  ($exclude -notcontains $top) -and ($top -notlike '_backup*')
}
$fs  = [System.IO.File]::Open($ccx, 'CreateNew')
$zip = New-Object System.IO.Compression.ZipArchive($fs, [System.IO.Compression.ZipArchiveMode]::Create)
foreach ($f in $files) {
  $entry = $f.FullName.Substring($src.Length + 1).Replace('\', '/')
  [void][System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $f.FullName, $entry, [System.IO.Compression.CompressionLevel]::Optimal)
}
$zip.Dispose(); $fs.Dispose()

# Confere o pacote: cada entrada igual a fonte e manifest com a versao certa.
$sha = [System.Security.Cryptography.SHA256]::Create()
$z = [System.IO.Compression.ZipFile]::OpenRead($ccx)
try {
  foreach ($e in $z.Entries) {
    $s = $e.Open(); $ms = New-Object System.IO.MemoryStream; $s.CopyTo($ms); $s.Dispose()
    $a = [BitConverter]::ToString($sha.ComputeHash($ms.ToArray()))
    $b = [BitConverter]::ToString($sha.ComputeHash([System.IO.File]::ReadAllBytes((Join-Path $src $e.FullName))))
    if ($a -ne $b) { throw "Entrada diferente da fonte: $($e.FullName)" }
  }
  $m = $z.Entries | Where-Object FullName -eq 'manifest.json'
  if (-not $m) { throw 'manifest.json ausente no pacote' }
  $r = New-Object System.IO.StreamReader($m.Open()); $packed = ($r.ReadToEnd() | ConvertFrom-Json).version; $r.Dispose()
  if ($packed -ne $version) { throw "Versao no pacote ($packed) diferente da fonte ($version)" }
  $count = $z.Entries.Count
} finally { $z.Dispose() }

# version.json: o downloadUrl NUNCA muda; so version e changelog. UTF-8 sem BOM
# (BOM quebra o JSON.parse em alguns clientes).
$json = [ordered]@{ version = $version; downloadUrl = $downloadUrl; changelog = $Changelog } | ConvertTo-Json
[System.IO.File]::WriteAllText((Join-Path $root 'version.json'), $json + "`n", (New-Object System.Text.UTF8Encoding($false)))

$hash = (Get-FileHash $ccx -Algorithm SHA256).Hash.ToLower()
Write-Output "versao  : $version"
Write-Output "pacote  : $ccx ($count arquivos, $((Get-Item $ccx).Length) bytes)"
Write-Output "sha256  : $hash"
Write-Output "json    : $(Join-Path $root 'version.json')"
