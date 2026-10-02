/*
 * Monta a página de venda do Perspective Grid a partir de site/page.html.
 *
 * Saída (dist/site/):
 *   perspectivegrid-elementor.html  bloco para colar num widget HTML do Elementor
 *                                   (imagens com endereço absoluto do site)
 *   preview.html                    a mesma página para abrir no navegador local
 *   img/                            imagens que a página usa (subir via FileZilla)
 *
 * Uso: node site/build-site.cjs [--checkout=URL] [--price="R$ 49,90"]
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'dist', 'site');
const args = Object.fromEntries(process.argv.slice(2)
  .map(a => /^--([^=]+)=(.*)$/.exec(a)).filter(Boolean).map(m => [m[1], m[2]]));

// ---- Configuração da página -------------------------------------------------
const CONFIG = {
  // Link do checkout da Eduzz (copie da página do produto na Eduzz).
  checkout: args.checkout || 'https://chk.eduzz.com/COLOQUE-O-CODIGO-DO-PRODUTO',
  // Preço exibido no card de compra. Vazio = não mostra preço.
  price: args.price || '',
  // Pasta das imagens no site. No FileZilla: public_html/wp-content/uploads/perspectivegrid/
  imgBase: args.img || 'https://xuimart.com.br/wp-content/uploads/perspectivegrid/',
  // Endereço final da página (o formulário de suporte volta para cá).
  pageUrl: args.page || 'https://xuimart.com.br/perspectivegrid/',
  supportEmail: 'perspectivegridsuporte@xuimart.com.br'
};
// -----------------------------------------------------------------------------

const VERSION = JSON.parse(fs.readFileSync(path.join(ROOT, 'uxp', 'manifest.json'), 'utf8')).version;
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function render(imgBase) {
  const priceBlock = CONFIG.price
    ? `<div class="pgr-price">${esc(CONFIG.price)}</div>\n        <div class="pgr-price-note">pagamento único</div>`
    : '';
  const html = fs.readFileSync(path.join(__dirname, 'page.html'), 'utf8')
    .split('{{IMG}}').join(imgBase)
    .split('{{CHECKOUT}}').join(esc(CONFIG.checkout))
    .split('{{PRICE_BLOCK}}').join(priceBlock)
    .split('{{VERSION}}').join(esc(VERSION))
    .split('{{PAGE_URL}}').join(esc(CONFIG.pageUrl))
    .split('{{SUPPORT_EMAIL}}').join(esc(CONFIG.supportEmail));
  const left = html.match(/\{\{[A-Z_]+\}\}/g);
  if (left) throw new Error('marcadores sem valor: ' + [...new Set(left)].join(', '));
  return html;
}

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, 'img'), { recursive: true });

const snippet = render(CONFIG.imgBase);
fs.writeFileSync(path.join(OUT, 'perspectivegrid-elementor.html'), snippet);

const preview = [
  '<!doctype html>',
  '<html lang="pt-BR">',
  '<head>',
  '<meta charset="utf-8">',
  '<meta name="viewport" content="width=device-width, initial-scale=1">',
  '<title>Perspective Grid · XuimArt</title>',
  '<meta name="description" content="Plugin para Photoshop que monta grades de perspectiva de 1, 2 e 3 pontos, olho de peixe e isométrica numa camada do documento.">',
  '<style>html,body{margin:0;background:#0a0a0f;}html{scroll-behavior:smooth;}</style>',
  '</head>',
  '<body>',
  render('img/'),
  '</body>',
  '</html>',
  ''
].join('\n');
fs.writeFileSync(path.join(OUT, 'preview.html'), preview);

// Copia só as imagens que a página realmente usa e confere se todas existem.
const used = [...new Set([...snippet.matchAll(/(?:src|srcset)="([^"]+)"/g)]
  .map(m => m[1]).filter(u => u.startsWith(CONFIG.imgBase)).map(u => u.slice(CONFIG.imgBase.length)))];
let bytes = 0;
for (const name of used) {
  const src = path.join(__dirname, 'img', name);
  if (!fs.existsSync(src)) throw new Error('imagem não encontrada: site/img/' + name);
  fs.copyFileSync(src, path.join(OUT, 'img', name));
  bytes += fs.statSync(src).size;
}

console.log(`versão   : ${VERSION}`);
console.log(`elementor: ${path.relative(ROOT, path.join(OUT, 'perspectivegrid-elementor.html'))} (${(snippet.length / 1024).toFixed(0)} KB)`);
console.log(`preview  : ${path.relative(ROOT, path.join(OUT, 'preview.html'))}`);
console.log(`imagens  : ${used.length} arquivos, ${(bytes / 1024).toFixed(0)} KB -> subir em ${CONFIG.imgBase}`);
if (/COLOQUE/.test(CONFIG.checkout)) console.log('AVISO    : link do checkout ainda é o provisório (use --checkout=URL)');
if (!CONFIG.price) console.log('AVISO    : sem preço no card de compra (use --price="R$ 00,00")');
