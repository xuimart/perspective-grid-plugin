/*
 * Gera as imagens "Tipos de perspectiva" da página de venda com o MESMO motor
 * do plugin (uxp/geometry.js + uxp/models.js). Nada é desenhado à mão: cada SVG
 * é exatamente o que o painel mostra com aquela configuração.
 * Saída: site/img/scene-*.svg
 * Uso: node site/render-scenes.cjs
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'img');
const G = require(path.join(ROOT, 'uxp', 'geometry.js'));
const sandbox = { globalThis: {} };
sandbox.window = sandbox.globalThis;
vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'uxp', 'models.js'), 'utf8'), sandbox);
const M = sandbox.globalThis.ReferenceModels || sandbox.ReferenceModels;
if (!M) throw new Error('models.js não registrou ReferenceModels');

const W = 1600, H = 1000, MODEL_OPACITY = 0.85;
const colored = { showAxes: true, opacity: 100, lineWidth: 2, aspect: W / H };

// Mesmos valores dos presets do painel (presetValues em uxp/panel.js); o zoom da
// cena só aproxima a câmera para o modelo aparecer bem na miniatura do site.
const scenes = [
  ['one', { ...colored, preset: 'one', yaw: 0, pitch: 0, showCube: true, referenceModel: 'room', viewZoom: 115 }],
  ['two', { ...colored, preset: 'two', yaw: 43, pitch: 0, showCube: true, referenceModel: 'room', viewZoom: 115 }],
  ['three', { ...colored, preset: 'three', yaw: 43, pitch: 20, showCube: true, referenceModel: 'table', focalLength: 24, viewZoom: 185 }],
  ['fisheye', { ...colored, preset: 'five', projection: 'fisheye', yaw: 0, pitch: 0, focalLength: 10, distortion: 100, showCube: true, referenceModel: 'room', viewZoom: 160 }],
  ['iso', { ...colored, preset: 'ortho', projection: 'ortho', yaw: 45, pitch: 35.264, showCube: true, referenceModel: 'table', viewZoom: 175 }],
  ['person', { ...colored, preset: 'free', yaw: 30, pitch: 8, showCube: true, referenceModel: 'person', focalLength: 35, viewZoom: 210 }]
];

const pts = list => list.map(p => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');

function render(input) {
  const state = G.normalize(input);
  let out = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">\n<rect width="${W}" height="${H}" fill="#ffffff"/>\n`;
  if (state.showCube) {
    for (const f of M.modelFaces(G, state, W, H)) {
      const [r, g, b] = f.color;
      out += `<polygon points="${pts(f.points)}" fill="rgb(${r},${g},${b})" fill-opacity="${MODEL_OPACITY}" stroke="rgba(0,0,0,${(0.2 * MODEL_OPACITY).toFixed(2)})" stroke-width="1"/>\n`;
    }
  }
  for (const l of G.projectedLines(state, W, H)) {
    if (!l.points || l.points.length < 2) continue;
    const dash = l.dash && l.dash.length ? ` stroke-dasharray="${l.dash.join(',')}"` : '';
    out += `<polyline points="${pts(l.points)}" fill="none" stroke="${l.color}" stroke-opacity="${l.opacity}" stroke-width="${l.width}" stroke-linecap="round"${dash}/>\n`;
  }
  return out + '</svg>\n';
}

fs.mkdirSync(OUT, { recursive: true });
for (const [name, state] of scenes) {
  const file = path.join(OUT, `scene-${name}.svg`);
  fs.writeFileSync(file, render(state));
  console.log(`${path.relative(ROOT, file)}  ${(fs.statSync(file).size / 1024).toFixed(0)} KB`);
}
