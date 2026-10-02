/*
 * Gera a imagem "hero" da página de venda (título + cena + mock do painel) em
 * PT e EN, usando o motor do plugin para a cena. Saída: site/img/hero-svg-pt.svg
 * e hero-svg-en.svg (o build-hero.ps1 rasteriza para hero.jpg / hero-en.jpg).
 * Uso: node site/render-hero.cjs
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'img');
const G = require(path.join(ROOT, 'uxp', 'geometry.js'));
const sandbox = { globalThis: {} }; sandbox.window = sandbox.globalThis;
vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'uxp', 'models.js'), 'utf8'), sandbox);
const M = sandbox.globalThis.ReferenceModels;

const W = 1200, H = 800;
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const pts = list => list.map(p => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');

// Cena do hero: quarto em 2 pontos, igual ao mock original.
function sceneSvg(w, h) {
  const state = G.normalize({ preset: 'two', projection: 'perspective', yaw: 40, pitch: 7, focalLength: 35,
    showCube: true, referenceModel: 'room', showAxes: true, opacity: 55, lineWidth: 1.3, viewZoom: 112, aspect: w / h });
  let out = `<rect width="${w}" height="${h}" fill="#ffffff"/>`;
  for (const f of M.modelFaces(G, state, w, h)) {
    const [r, g, b] = f.color;
    out += `<polygon points="${pts(f.points)}" fill="rgb(${r},${g},${b})" fill-opacity="0.8" stroke="rgba(0,0,0,0.16)" stroke-width="1"/>`;
  }
  for (const l of G.projectedLines(state, w, h)) {
    if (!l.points || l.points.length < 2) continue;
    out += `<polyline points="${pts(l.points)}" fill="none" stroke="${l.color}" stroke-opacity="${l.opacity}" stroke-width="${l.width}" stroke-linecap="round"/>`;
  }
  return out;
}

const T = {
  pt: { subtitle: 'Perspectiva dentro do Photoshop', tabs: ['Câmera', 'Grade', 'Modelo'],
    persp: 'Perspectiva', free: 'Livre', lens: 'Lente', rot: 'Rotação', tilt: 'Inclin.', view: 'Vista', custom: 'Personali…',
    focal: 'Distância focal (mm)', zoom: 'Zoom da cena (%)', roll: 'Roll (inclinação)', apply: 'Aplicar na camada' },
  en: { subtitle: 'Perspective inside Photoshop', tabs: ['Camera', 'Grid', 'Model'],
    persp: 'Perspective', free: 'Free', lens: 'Lens', rot: 'Rotation', tilt: 'Tilt', view: 'View', custom: 'Custom',
    focal: 'Focal length (mm)', zoom: 'Scene zoom (%)', roll: 'Roll (tilt)', apply: 'Apply to layer' }
};

// Mock do painel (lado direito), desenhado em SVG no estilo do painel real.
function panelSvg(x, y, w, h, t) {
  const pad = 14, rowH = 30;
  let s = `<g font-family="Segoe UI, Arial, sans-serif">`;
  s += `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" fill="#2b3032" stroke="#3a4042"/>`;
  // Barra de título
  s += `<text x="${x + pad}" y="${y + 22}" fill="#f0f0f8" font-size="13" font-weight="600">Perspective Grid</text>`;
  s += `<text x="${x + w - pad}" y="${y + 22}" fill="#9aa" font-size="15" text-anchor="end">&#187;&#8801;</text>`;
  // Mini-preview com a mesma cena, menor. O SVG embutido é desenhado direto
  // (sem <svg> aninhado) via translate+scale, para rasterizar certo.
  const pvY = y + 34, pvH = 118, pvW = w - 2 * pad;
  const baseW = 1200, scale = pvW / baseW, baseH = Math.round(pvH / scale);
  s += `<clipPath id="pv"><rect x="${x + pad}" y="${pvY}" width="${pvW}" height="${pvH}" rx="4"/></clipPath>`;
  s += `<g clip-path="url(#pv)"><g transform="translate(${x + pad} ${pvY}) scale(${scale})">${sceneSvg(baseW, baseH)}</g></g>`;
  s += `<rect x="${x + pad}" y="${pvY}" width="${pvW}" height="${pvH}" rx="4" fill="none" stroke="#555b5c"/>`;
  s += `<text x="${x + pad + 6}" y="${pvY + pvH - 7}" fill="#333" font-size="10">Artwork.psd · 3840×2160</text>`;
  let cy = pvY + pvH + 24;
  // Abas
  const tabW = (w - 2 * pad) / 3;
  t.tabs.forEach((tab, i) => {
    const tx = x + pad + tabW * i + tabW / 2;
    s += `<text x="${tx}" y="${cy}" fill="${i === 0 ? '#f0f0f8' : '#9aa'}" font-size="12" font-weight="${i === 0 ? 600 : 400}" text-anchor="middle">${esc(tab)}</text>`;
  });
  s += `<rect x="${x + pad}" y="${cy + 8}" width="${tabW}" height="2.5" fill="#f02b3b"/>`;
  cy += 30;
  const field = (label, val) => {
    let r = `<text x="${x + pad}" y="${cy + 14}" fill="#9aa" font-size="11">${esc(label)}</text>`;
    r += `<rect x="${x + w - pad - 150}" y="${cy}" width="150" height="22" rx="4" fill="#1b1e20" stroke="#3a4042"/>`;
    r += `<text x="${x + w - pad - 142}" y="${cy + 15}" fill="#f0f0f8" font-size="11">${esc(val)}</text>`;
    r += `<path d="M${x + w - pad - 18} ${cy + 9} l4 5 l4 -5" fill="none" stroke="#9aa" stroke-width="1.4"/>`;
    cy += rowH;
    return r;
  };
  s += field(t.persp, t.free);
  s += field(t.lens, '35 mm');
  // Sliders
  const slider = (label, val, frac) => {
    let r = `<text x="${x + pad}" y="${cy + 12}" fill="#9aa" font-size="11">${esc(label)}</text>`;
    r += `<text x="${x + w - pad}" y="${cy + 12}" fill="#f0f0f8" font-size="11" text-anchor="end">${esc(val)}</text>`;
    const tx = x + pad, tw = w - 2 * pad, ty = cy + 24;
    r += `<rect x="${tx}" y="${ty}" width="${tw}" height="2" rx="1" fill="#555b5c"/>`;
    r += `<circle cx="${tx + tw * frac}" cy="${ty + 1}" r="6" fill="#202425" stroke="#a8adae" stroke-width="2"/>`;
    cy += 42;
    return r;
  };
  s += slider(t.focal, '35', 0.1);
  s += slider(t.zoom, '112', 0.4);
  s += slider(t.roll, '0', 0.5);
  // Botão aplicar
  cy += 6;
  s += `<rect x="${x + pad}" y="${cy}" width="${w - 2 * pad}" height="34" rx="5" fill="#de2246"/>`;
  s += `<text x="${x + w / 2}" y="${cy + 22}" fill="#fff" font-size="12" font-weight="600" text-anchor="middle">${esc(t.apply)}</text>`;
  s += `</g>`;
  return s;
}

function hero(lang) {
  const t = T[lang];
  const sceneW = 712, sceneH = 560, sceneX = 48, sceneY = 196;
  const panelX = 792, panelY = 170, panelW = 360, panelH = 600;
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`;
  svg += `<rect width="${W}" height="${H}" fill="#1b1b22"/>`;
  // Título
  svg += `<rect x="48" y="40" width="96" height="7" fill="#de2246"/>`;
  svg += `<text x="46" y="150" fill="#f5f5fa" font-family="Space Grotesk, Arial, sans-serif" font-size="92" font-weight="800">Perspective Grid</text>`;
  svg += `<text x="50" y="188" fill="#b8bcc8" font-family="Inter, Arial, sans-serif" font-size="30">${esc(t.subtitle)}</text>`;
  // Cena grande
  svg += `<clipPath id="sc"><rect x="${sceneX}" y="${sceneY}" width="${sceneW}" height="${sceneH}" rx="4"/></clipPath>`;
  svg += `<g clip-path="url(#sc)"><svg x="${sceneX}" y="${sceneY}" width="${sceneW}" height="${sceneH}" viewBox="0 0 ${sceneW} ${sceneH}" preserveAspectRatio="xMidYMid slice">${sceneSvg(sceneW, sceneH)}</svg></g>`;
  // Painel
  svg += panelSvg(panelX, panelY, panelW, panelH, t);
  svg += `</svg>`;
  return svg;
}

fs.mkdirSync(OUT, { recursive: true });
for (const lang of ['pt', 'en']) {
  const file = path.join(OUT, `hero-svg-${lang}.svg`);
  fs.writeFileSync(file, hero(lang));
  console.log(`${path.relative(ROOT, file)}`);
}
