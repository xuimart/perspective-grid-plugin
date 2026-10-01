/*
 * Monta a versão CEP do Perspective Grid (Photoshop CC 2018 em diante) a partir do
 * mesmo código do plugin UXP em uxp/. Só os arquivos de cep/ são próprios desta
 * versão: widgets sp-* em HTML, polyfills, adaptador do Photoshop, host.jsx,
 * manifest.xml e o instalador.
 *
 * Todo o JavaScript é convertido para Chromium 57, o navegador do CEP 8 que
 * vem no Photoshop CC 2018 (o mais antigo aceito pelo manifest).
 *
 * Saída:
 *   dist/cep/PerspectiveGrid-CEP/            pasta pronta (plugin + instalador)
 *   dist/PerspectiveGrid-CEP-<versão>.zip    o que vai para quem testa
 * Uso: node build-cep.cjs
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const esbuild = require('esbuild');

const ROOT = __dirname;
const UXP = path.join(ROOT, 'uxp');
const CEP = path.join(ROOT, 'cep');
const ID = 'com.xuimart.perspectivegrid.cep';
const VERSION = JSON.parse(fs.readFileSync(path.join(UXP, 'manifest.json'), 'utf8')).version;
const PACKAGE = path.join(ROOT, 'dist', 'cep', 'PerspectiveGrid-CEP');
const EXT = path.join(PACKAGE, ID);
const ZIP = path.join(ROOT, 'dist', `PerspectiveGrid-CEP-${VERSION}.zip`);
const TARGET = 'chrome57';
const CEP_UPDATE_URL = 'https://raw.githubusercontent.com/xuimart/perspective-grid-plugin/master/version-cep.json';

// Ordem de carga no painel. ps-adapter-cep.js substitui o ps-adapter.js do UXP.
const SCRIPTS = [
  ['cep', 'js/polyfills.js', 'polyfills.js'],
  ['gen', null, 'config.js'],
  ['cep', 'js/sp-shim.js', 'sp-shim.js'],
  ['uxp', 'geometry.js', 'geometry.js'],
  ['uxp', 'raster.js', 'raster.js'],
  ['uxp', 'models.js', 'models.js'],
  ['cep', 'js/ps-adapter-cep.js', 'ps-adapter-cep.js'],
  ['uxp', 'update.js', 'update.js'],
  ['uxp', 'panel.js', 'panel.js']
];

const CONFIG = [
  '// Gerado por build-cep.cjs. A versão vem do uxp/manifest.json.',
  `window.PG_VERSION = ${JSON.stringify(VERSION + '-cep')};`,
  '// Aviso de atualização próprio do CEP: o version.json do UXP aponta para o',
  '// .ccx; o version-cep.json aponta para o PerspectiveGrid_CEP_Setup.exe.',
  `window.PG_UPDATE_URL = ${JSON.stringify(CEP_UPDATE_URL)};`,
  ''
].join('\n');

function write(file, content, options) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, options);
}

// O CEP roda com --mixed-context, então module/exports do Node existem na
// página. Escondê-los faz o geometry.js se registrar na janela, como no UXP.
function transpile(code, name) {
  const wrapped = `(function (module, exports) {\n${code}\n}).call(window);\n`;
  const out = esbuild.transformSync(wrapped, { loader: 'js', target: TARGET, sourcefile: name }).code;
  // Sintaxe que o Chromium 57 não entende não pode sobrar.
  if (/\?\.[A-Za-z_$[(]|\?\?/.test(out)) throw new Error(`${name}: sobrou ?. ou ?? depois da conversão`);
  return out;
}

function buildHtml() {
  let html = fs.readFileSync(path.join(UXP, 'index.html'), 'utf8');
  const before = (html.match(/<script src="[^"]+"><\/script>/g) || []).length;
  if (!before) throw new Error('index.html sem scripts: o formato mudou?');
  html = html.replace(/\s*<script src="[^"]+"><\/script>/g, '');
  const css = '<link rel="stylesheet" href="styles.css">';
  if (!html.includes(css)) throw new Error('index.html sem styles.css: o formato mudou?');
  html = html.replace(css, css + '\n  <link rel="stylesheet" href="cep.css">');
  const tags = SCRIPTS.map(([, , out]) => `  <script src="js/${out}"></script>`).join('\n');
  return html.replace('</body>', tags + '\n</body>');
}

function zip(sourceDir, zipFile) {
  // ZipArchive com "/" nos caminhos e uma pasta-raiz, para extrair organizado.
  const ps = `
    $ErrorActionPreference = 'Stop'
    Add-Type -AssemblyName System.IO.Compression
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $src = '${sourceDir}'; $zip = '${zipFile}'
    $base = Split-Path $src -Parent
    if (Test-Path $zip) { Remove-Item $zip -Force }
    $fs = [System.IO.File]::Open($zip, 'CreateNew')
    $archive = New-Object System.IO.Compression.ZipArchive($fs, [System.IO.Compression.ZipArchiveMode]::Create)
    Get-ChildItem $src -Recurse -File | ForEach-Object {
      $entry = $_.FullName.Substring($base.Length + 1).Replace('\\', '/')
      [void][System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $_.FullName, $entry, [System.IO.Compression.CompressionLevel]::Optimal)
    }
    $archive.Dispose(); $fs.Dispose()`;
  execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps], { stdio: 'inherit' });
}

function main() {
  fs.rmSync(path.join(ROOT, 'dist', 'cep'), { recursive: true, force: true });

  for (const [from, file, out] of SCRIPTS) {
    const code = from === 'gen' ? CONFIG : fs.readFileSync(path.join(from === 'uxp' ? UXP : CEP, file), 'utf8');
    write(path.join(EXT, 'js', out), transpile(code, out));
  }
  write(path.join(EXT, 'index.html'), buildHtml());
  fs.copyFileSync(path.join(UXP, 'styles.css'), path.join(EXT, 'styles.css'));
  fs.copyFileSync(path.join(CEP, 'cep.css'), path.join(EXT, 'cep.css'));
  write(path.join(EXT, 'jsx', 'host.jsx'), fs.readFileSync(path.join(CEP, 'host.jsx')));
  write(path.join(EXT, 'icons', 'icon.png'), fs.readFileSync(path.join(UXP, 'icons', 'icon@1x.png')));
  write(path.join(EXT, 'CSXS', 'manifest.xml'),
    fs.readFileSync(path.join(CEP, 'manifest.xml'), 'utf8').split('{{VERSION}}').join(VERSION));

  // O cmd.exe precisa de CRLF; o Bloco de Notas antigo precisa de BOM no UTF-8.
  for (const name of ['Instalar.cmd', 'Desinstalar.cmd']) {
    write(path.join(PACKAGE, name), fs.readFileSync(path.join(CEP, 'install', name), 'utf8').replace(/\r?\n/g, '\r\n'));
  }
  const readme = fs.readFileSync(path.join(CEP, 'install', 'LEIA-ME.txt'), 'utf8').replace(/\r?\n/g, '\r\n');
  write(path.join(PACKAGE, 'LEIA-ME.txt'), '\ufeff' + readme);

  zip(PACKAGE, ZIP);
  const count = (function walk(dir) {
    return fs.readdirSync(dir, { withFileTypes: true }).reduce((n, e) => n + (e.isDirectory() ? walk(path.join(dir, e.name)) : 1), 0);
  })(PACKAGE);
  console.log(`versão : ${VERSION}`);
  console.log(`pasta  : ${PACKAGE} (${count} arquivos)`);
  console.log(`zip    : ${ZIP} (${fs.statSync(ZIP).size} bytes)`);
}

main();
