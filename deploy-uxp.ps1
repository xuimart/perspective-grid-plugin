# Reempacota o plugin UXP em .ccx e reinstala via UPIA (agente oficial da Adobe).
# Uso: powershell -File deploy-uxp.ps1
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$src  = Join-Path $root 'uxp'
$dist = Join-Path $root 'dist'
$zip  = Join-Path $dist 'PerspectiveGrid.zip'
$ccx  = Join-Path $dist 'PerspectiveGrid.ccx'
$exe  = 'C:\Program Files\Common Files\Adobe\Adobe Desktop Common\RemoteComponents\UPI\UnifiedPluginInstallerAgent\UnifiedPluginInstallerAgent.exe'

New-Item -ItemType Directory -Path $dist -Force | Out-Null

# Remove versao anterior (se houver) para forcar reinstalacao dos arquivos.
& $exe /remove "Perspective Grid" 2>&1 | Select-String 'Successful|Failed' | ForEach-Object { $_.Line }
Get-ChildItem "$env:APPDATA\Adobe\UXP\Plugins\External" -Directory -ErrorAction SilentlyContinue |
  Where-Object Name -like 'com.xuimart*' | ForEach-Object { Remove-Item $_.FullName -Recurse -Force }

# Empacota o conteudo de uxp/ (manifest.json na raiz do zip), sem o LEIA-ME.
if (Test-Path $zip) { Remove-Item $zip -Force }
if (Test-Path $ccx) { Remove-Item $ccx -Force }
$items = Get-ChildItem $src -Force | Where-Object { $_.Name -ne 'LEIA-ME-UXP.md' } | ForEach-Object { $_.FullName }
Compress-Archive -Path $items -DestinationPath $zip -Force
Move-Item $zip $ccx -Force

# Instala.
& $exe /install $ccx 2>&1 | Select-String 'Successful|Failed' | ForEach-Object { $_.Line }

# Confirma versao instalada.
$reg = "$env:APPDATA\Adobe\UXP\PluginsInfo\v1\PS.json"
if (Test-Path $reg) { Write-Output "registro: $((Get-Content $reg -Raw).Trim())" }
Write-Output 'Feito. Reinicie o Photoshop para carregar a nova versao.'
