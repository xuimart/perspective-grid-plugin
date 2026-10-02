# Tira screenshots do painel CEP de verdade (dist\cep, gerado por build-cep.cjs)
# no Edge headless, para o carrossel "Conheça cada tela" da página de venda.
# O Photoshop é simulado só o suficiente para o painel abrir com um documento.
# Saída: site\img\panel-*.png
# Uso: powershell -File site\capture-panel.ps1
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$ext  = Join-Path $root 'dist\cep\PerspectiveGrid-CEP\com.xuimart.perspectivegrid.cep'
$out  = Join-Path $PSScriptRoot 'img'
$edge = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
if (-not (Test-Path $ext)) { & node (Join-Path $root 'build-cep.cjs') | Out-Null }
New-Item -ItemType Directory $out -Force | Out-Null

$t = Join-Path $env:TEMP 'pg-capture'
if (Test-Path $t) { Remove-Item -Recurse -Force $t }
Copy-Item -Recurse $ext $t
$base = Get-Content (Join-Path $t 'index.html') -Raw -Encoding UTF8

Add-Type -AssemblyName System.Drawing

# shot: arquivo | aba | estado salvo | ação extra depois de abrir | largura | altura (px CSS)
$shots = @(
  @('panel-camera', 'camera', '{"showCube":true,"referenceModel":"room","showAxes":true,"yaw":38,"pitch":6,"focalLength":35}', '', 340, 680),
  @('panel-grid',   'grid',   '{"showCube":true,"referenceModel":"room","showAxes":true,"yaw":38,"pitch":6,"preset":"three","focalLength":24}', '', 340, 680),
  @('panel-model',  'model',  '{"showCube":true,"referenceModel":"person","showAxes":true,"yaw":28,"pitch":6,"viewZoom":150}', '', 340, 680),
  @('panel-fisheye','camera', '{"showCube":true,"referenceModel":"room","showAxes":true,"preset":"five","projection":"fisheye","yaw":0,"pitch":0,"focalLength":10,"viewZoom":140}', '', 340, 680),
  @('panel-expanded','camera','{"showCube":true,"referenceModel":"room","showAxes":true,"yaw":38,"pitch":6,"focalLength":35}', 'document.getElementById("expandBtn").click();', 640, 400)
)

foreach ($s in $shots) {
  $stub = @"
<script>
localStorage.setItem('perspective-grid-uxp-v2', JSON.stringify($($s[2])));
window.fetch = function () { return Promise.reject(new Error('offline')); };
window.__adobe_cep__ = { evalScript: function (c, cb) { setTimeout(function () { cb(c.indexOf('pgDocInfo') === 0 ? JSON.stringify({ id: 1, width: 3840, height: 2160, title: 'Ilustracao.psd' }) : ''); }, 0); }, registerKeyEventsInterest: function () {}, getHostEnvironment: function () { return '{}'; } };
window.require = function () { return { tmpdir: function () { return 'C:/tmp'; }, writeFileSync: function () {}, deflateSync: function (b) { return b; }, join: function () { return Array.prototype.join.call(arguments, '/'); } }; };
</script>
"@
  $act = @"
<script>
setTimeout(function () {
  var b = document.querySelector('[data-tab="$($s[1])"]'); if (b) b.click();
  $($s[3])
  document.getElementById('status').textContent = 'Pronto. Ajuste e clique em Aplicar/Atualizar.';
}, 1200);
</script>
"@
  $html = $base.Replace('<script src="js/polyfills.js"></script>', $stub + '<script src="js/polyfills.js"></script>').Replace('</body>', $act + '</body>')
  $inner = Join-Path $t "$($s[0])-panel.html"
  [IO.File]::WriteAllText($inner, $html, (New-Object System.Text.UTF8Encoding($false)))
  # O painel roda num iframe do tamanho exato: assim as media queries enxergam a
  # largura real do painel, como no Photoshop.
  $frame = "<!doctype html><html><body style=`"margin:0;background:#202425`"><iframe src=`"$([IO.Path]::GetFileName($inner))`" style=`"border:0;display:block;width:$($s[4])px;height:$($s[5])px`"></iframe></body></html>"
  $page = Join-Path $t "$($s[0]).html"
  [IO.File]::WriteAllText($page, $frame, (New-Object System.Text.UTF8Encoding($false)))
  $png = Join-Path $out "$($s[0]).png"
  if (Test-Path $png) { Remove-Item $png }
  $raw = Join-Path $t "$($s[0])-raw.png"
  # O Edge headless não abre janela com menos de ~500 px de largura, então a
  # janela é maior e a imagem é recortada no tamanho do iframe.
  $edgeArgs = @('--headless', '--disable-gpu', '--hide-scrollbars', '--allow-file-access-from-files',
    "--user-data-dir=`"$t\profile-$($s[0])`"", '--force-device-scale-factor=2', '--window-size=900,900',
    '--virtual-time-budget=4000', "--screenshot=`"$raw`"", ([Uri]$page).AbsoluteUri)
  Start-Process -FilePath $edge -ArgumentList $edgeArgs -Wait -WindowStyle Hidden
  if (-not (Test-Path $raw)) { throw "screenshot falhou: $($s[0])" }
  $img = [System.Drawing.Image]::FromFile($raw)
  $crop = New-Object System.Drawing.Bitmap ($s[4] * 2), ($s[5] * 2)
  $g = [System.Drawing.Graphics]::FromImage($crop)
  $g.DrawImage($img, (New-Object System.Drawing.Rectangle 0, 0, $crop.Width, $crop.Height), (New-Object System.Drawing.Rectangle 0, 0, $crop.Width, $crop.Height), [System.Drawing.GraphicsUnit]::Pixel)
  $g.Dispose(); $img.Dispose()
  $crop.Save($png, [System.Drawing.Imaging.ImageFormat]::Png); $crop.Dispose()
  Write-Output "$($s[0]).png  $($s[4])x$($s[5]) @2x  $([math]::Round((Get-Item $png).Length / 1KB)) KB"
}
Remove-Item -Recurse -Force $t
