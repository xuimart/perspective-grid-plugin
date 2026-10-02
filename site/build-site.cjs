/*
 * Monta a página de venda do Perspective Grid a partir de site/page.html.
 * UM arquivo só, com os dois idiomas embutidos: o botão PT/EN alterna na hora.
 *
 * Saída (dist/site/):
 *   perspectivegrid-elementor.html  bloco para o widget HTML do Elementor
 *                                   (imagens com endereço absoluto do site)
 *   preview.html                    o mesmo para abrir no navegador local
 *   img/                            imagens usadas (subir via FileZilla)
 *
 * Uso: node site/build-site.cjs [--checkout=URL] [--checkout-en=URL]
 *                               [--price="R$ 49,90"] [--price-en="$9.90"]
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'dist', 'site');
const args = Object.fromEntries(process.argv.slice(2)
  .map(a => /^--([^=]+)=(.*)$/.exec(a)).filter(Boolean).map(m => [m[1], m[2]]));

const CONFIG = {
  checkoutPt: args.checkout || 'https://chk.eduzz.com/1W322BQ592',
  checkoutEn: args['checkout-en'] || args.checkout || 'https://chk.eduzz.com/1W322BQ592',
  pricePt: args.price || '',
  priceEn: args['price-en'] || '',
  imgBase: args.img || 'https://xuimart.com.br/drawcolor/IMG/',
  pageUrl: args.page || 'https://xuimart.com.br/perspectivegrid/',
  supportEmail: 'perspectivegridsuporte@xuimart.com.br'
};

const VERSION = JSON.parse(fs.readFileSync(path.join(ROOT, 'uxp', 'manifest.json'), 'utf8')).version;
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Dicionário. 'hero.title' é o único com HTML (<br>, <em>).
const STRINGS = require('./strings.js')(VERSION);

const TEMPLATE = fs.readFileSync(path.join(__dirname, 'page.html'), 'utf8');

// Converte {{t.chave}} em marcadores que o JS troca em runtime:
//  - texto:  >{{t.k}}<            vira  data-i18n="k">TEXTO_PT<
//  - atrib.: attr="{{t.k}}"       vira  data-i18n-attr="attr:k" attr="TEXTO_PT"
// O resto fica com o texto PT como padrão (funciona mesmo sem JS).
function applyMarkers(html) {
  const dict = STRINGS.pt;
  const raw = { 'hero.title': 1 };
  const val = k => { if (!(k in dict)) throw new Error('falta a chave: ' + k); return raw[k] ? dict[k] : esc(dict[k]); };

  // Atributos: alt/aria-label/placeholder/title = "{{t.k}}"
  html = html.replace(/(\s)([a-zA-Z-]+)="\{\{t\.([a-zA-Z0-9.]+)\}\}"/g,
    (m, sp, attr, k) => `${sp}data-i18n-attr="${attr}:${k}" ${attr}="${val(k)}"`);

  // Texto entre tags: >{{t.k}}<  (um marcador sozinho entre as tags)
  html = html.replace(/>\s*\{\{t\.([a-zA-Z0-9.]+)\}\}\s*</g,
    (m, k) => ` data-i18n="${k}">${val(k)}<`);

  // Sobrou algum {{t.*}}? (ex.: dentro de texto misturado) — resolve pro PT.
  html = html.replace(/\{\{t\.([a-zA-Z0-9.]+)\}\}/g, (m, k) => val(k));
  return html;
}

function priceBlock(lang) {
  const price = lang === 'pt' ? CONFIG.pricePt : CONFIG.priceEn;
  if (!price) return '';
  return `<div class="pgr-price">${esc(price)}</div>\n        <div class="pgr-price-note" data-i18n="price.note">${esc(STRINGS[lang]['price.note'])}</div>`;
}

// Bloco <script> com os dois dicionários + runtime de troca de idioma.
function runtimeScript() {
  const data = {
    strings: STRINGS,
    img: CONFIG.imgBase,
    hero: { pt: 'hero.jpg', en: 'hero-en.jpg' },
    checkout: { pt: CONFIG.checkoutPt, en: CONFIG.checkoutEn },
    price: { pt: CONFIG.pricePt, en: CONFIG.priceEn },
    rawKeys: ['hero.title']
  };
  return `
<script>
(function () {
  'use strict';
  var DATA = ${JSON.stringify(data)};
  var root = document.getElementById('pgrEmbed');
  if (!root) return;
  var lang = 'pt';
  try { var s = localStorage.getItem('pgr-site-lang'); if (s === 'pt' || s === 'en') lang = s; } catch (e) {}

  function t(k) { var d = DATA.strings[lang] || DATA.strings.pt; return (k in d) ? d[k] : (DATA.strings.pt[k] || k); }

  function apply() {
    var i, nodes = root.querySelectorAll('[data-i18n]');
    for (i = 0; i < nodes.length; i++) {
      var key = nodes[i].getAttribute('data-i18n');
      if (DATA.rawKeys.indexOf(key) >= 0) nodes[i].innerHTML = t(key); else nodes[i].textContent = t(key);
    }
    var attrs = root.querySelectorAll('[data-i18n-attr]');
    for (i = 0; i < attrs.length; i++) {
      var spec = attrs[i].getAttribute('data-i18n-attr').split(';');
      for (var j = 0; j < spec.length; j++) { var p = spec[j].split(':'); if (p.length === 2) attrs[i].setAttribute(p[0].replace(/^\\s+|\\s+$/g, ''), t(p[1].replace(/^\\s+|\\s+$/g, ''))); }
    }
    // Imagem do hero por idioma.
    var hero = document.getElementById('pgrHero');
    if (hero) hero.src = DATA.img + DATA.hero[lang];
    // Links de checkout por idioma.
    var links = root.querySelectorAll('.pgr-checkout');
    for (i = 0; i < links.length; i++) links[i].setAttribute('href', DATA.checkout[lang]);
    // Preço (se definido).
    var box = document.getElementById('pgrPriceBox');
    if (box) {
      var pr = DATA.price[lang];
      box.innerHTML = pr ? '<div class="pgr-price">' + pr + '</div><div class="pgr-price-note">' + t('price.note') + '</div>' : '';
    }
    // Botão mostra o idioma para o qual ele troca.
    var btn = document.getElementById('pgrLangBtn');
    if (btn) btn.textContent = lang === 'pt' ? 'EN' : 'PT';
    document.documentElement.setAttribute('lang', lang === 'pt' ? 'pt-BR' : 'en');
  }

  var btn = document.getElementById('pgrLangBtn');
  if (btn) btn.addEventListener('click', function () {
    lang = lang === 'pt' ? 'en' : 'pt';
    try { localStorage.setItem('pgr-site-lang', lang); } catch (e) {}
    apply();
  });
  apply();

  // Carrossel.
  var texts = root.querySelectorAll('#pgrCarTexts .pgr-car-text');
  var track = document.getElementById('pgrTrack');
  var dotsBox = document.getElementById('pgrDots');
  var current = 0, timer = null, dots = [];
  function go(i) {
    current = (i + texts.length) % texts.length;
    for (var k = 0; k < texts.length; k++) {
      texts[k].classList.toggle('active', k === current);
      dots[k].classList.toggle('active', k === current);
    }
    track.style.transform = 'translateX(' + (-100 * current) + '%)';
  }
  function restart() { clearInterval(timer); timer = setInterval(function () { go(current + 1); }, 6000); }
  for (var d = 0; d < texts.length; d++) {
    var dot = document.createElement('button');
    dot.type = 'button'; dot.className = 'pgr-car-dot'; dot.setAttribute('aria-label', 'Slide ' + (d + 1));
    dot.addEventListener('click', (function (n) { return function () { go(n); restart(); }; })(d));
    dotsBox.appendChild(dot); dots.push(dot);
  }
  document.getElementById('pgrPrev').addEventListener('click', function () { go(current - 1); restart(); });
  document.getElementById('pgrNext').addEventListener('click', function () { go(current + 1); restart(); });
  var imgs = root.querySelector('.pgr-car-imgs');
  imgs.addEventListener('mouseenter', function () { clearInterval(timer); });
  imgs.addEventListener('mouseleave', restart);
  var startX = null;
  imgs.addEventListener('touchstart', function (e) { startX = e.touches[0].clientX; }, { passive: true });
  imgs.addEventListener('touchend', function (e) {
    if (startX === null) return;
    var dx = e.changedTouches[0].clientX - startX; startX = null;
    if (Math.abs(dx) > 40) { go(current + (dx < 0 ? 1 : -1)); restart(); }
  });
  go(0); restart();

  // FAQ.
  var qs = root.querySelectorAll('.pgr-faq-q');
  for (var q = 0; q < qs.length; q++) {
    qs[q].addEventListener('click', function () {
      var item = this.parentNode, open = !item.classList.contains('open');
      item.classList.toggle('open', open);
      this.setAttribute('aria-expanded', String(open));
    });
  }

  // Volta do FormSubmit.
  if (/[?&]enviado=1/.test(location.search)) document.getElementById('pgrSent').classList.add('show');
})();
</script>`;
}

function render(imgBase) {
  // Remove o <script> antigo do template (deixado só como referência) e usa o nosso.
  let html = TEMPLATE.replace(/<script>[\s\S]*?<\/script>\s*$/, '');
  html = applyMarkers(html)
    .split('{{IMG}}').join(imgBase)
    .split('{{HERO}}').join('hero.jpg') // padrão PT; o JS troca para hero-en.jpg no EN
    .split('{{CHECKOUT}}').join(esc(CONFIG.checkoutPt))
    .split('{{PRICE_BLOCK}}').join(priceBlock('pt'))
    .split('{{VERSION}}').join(esc(VERSION))
    .split('{{PAGE_URL}}').join(esc(CONFIG.pageUrl))
    .split('{{SUPPORT_EMAIL}}').join(esc(CONFIG.supportEmail));
  const left = html.match(/\{\{[A-Z_]+\}\}/g);
  if (left) throw new Error('marcadores sem valor: ' + [...new Set(left)].join(', '));
  return html + runtimeScript();
}

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, 'img'), { recursive: true });

const snippet = render(CONFIG.imgBase);
fs.writeFileSync(path.join(OUT, 'perspectivegrid-elementor.html'), snippet, 'utf8');

const preview = [
  '<!doctype html>', '<html lang="pt-BR">', '<head>', '<meta charset="utf-8">',
  '<meta name="viewport" content="width=device-width, initial-scale=1">',
  '<title>Perspective Grid · XuimArt</title>',
  '<meta name="description" content="' + esc(STRINGS.pt['hero.desc']) + '">',
  '<style>html,body{margin:0;background:#0a0a0f;}html{scroll-behavior:smooth;}</style>',
  '</head>', '<body>', render('img/'), '</body>', '</html>', ''
].join('\n');
fs.writeFileSync(path.join(OUT, 'preview.html'), preview);

// Copia só as imagens usadas (as duas versões do hero vão junto).
const used = new Set(['hero.jpg', 'hero-en.jpg']);
[...snippet.matchAll(/(?:src|srcset)="([^"]+)"/g)].map(m => m[1])
  .filter(u => u.startsWith(CONFIG.imgBase)).forEach(u => used.add(u.slice(CONFIG.imgBase.length)));
let bytes = 0;
for (const name of used) {
  const src = path.join(__dirname, 'img', name);
  if (!fs.existsSync(src)) throw new Error('imagem não encontrada: site/img/' + name);
  fs.copyFileSync(src, path.join(OUT, 'img', name));
  bytes += fs.statSync(src).size;
}

console.log(`versão   : ${VERSION}`);
console.log(`arquivo  : ${path.relative(ROOT, path.join(OUT, 'perspectivegrid-elementor.html'))} (um só, PT+EN) (${(snippet.length / 1024).toFixed(0)} KB)`);
console.log(`preview  : dist/site/preview.html`);
console.log(`imagens  : ${used.size} arquivos, ${(bytes / 1024).toFixed(0)} KB -> subir em ${CONFIG.imgBase}`);
if (!CONFIG.pricePt) console.log('AVISO    : sem preço PT (--price="R$ 00,00")');
if (!CONFIG.priceEn) console.log('AVISO    : sem preço EN (--price-en="$0.00")');
