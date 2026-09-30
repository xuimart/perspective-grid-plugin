/*
 * Panel controller (UXP). Owns the camera/grid state, renders the live preview,
 * rasterizes the grid at the document's real pixel size, and drives the
 * Photoshop adapter (Option A) or a PNG export (Option B fallback).
 *
 * The heavy math lives in geometry.js (shared with the web prototype). This file
 * only wires DOM -> state -> raster -> host.
 */
(function () {
  'use strict';

  const G = (typeof window !== 'undefined' ? window : globalThis).PerspectiveGeometry;
  const PS = (typeof window !== 'undefined' ? window : globalThis).PSAdapter;
  const $ = id => document.getElementById(id);
  const STORAGE_KEY = 'perspective-grid-uxp-v1';

  let state;
  try { state = G.normalize(JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}); }
  catch (_) { state = G.normalize({}); }

  let doc = null;            // { id, width, height, title } or null
  let gridLayerId = null;    // remembered id of the grid layer for the current doc
  let renderScheduled = false;
  let applyTimer = null;
  let busy = false;
  let applyQueued = false;
  let interactionMode = 'orbit'; // orbit | pan | model | depth
  let depthAxisSel = null;       // { axis, label } selected for depth moves
  let previewLayout = { ox: 0, oy: 0, w: 1, h: 1 }; // image rect inside the <img>

  const preview = $('preview'); // <img> element

  /* ---------- state plumbing ---------- */

  function setStatus(msg, kind) {
    const el = $('status');
    el.textContent = msg;
    el.className = 'status' + (kind ? ' ' + kind : '');
  }

  function persist() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (_) {}
  }

  function change(patch) {
    state = G.normalize({ ...state, ...patch });
    syncControls();
    scheduleRender();
    persist();
    if ($('liveApply').checked && PS && PS.available && doc) {
      // Coalesce rapid changes: schedule one apply; if an apply is running,
      // mark that another is needed and fire it as soon as the current finishes.
      if (busy) { applyQueued = true; return; }
      clearTimeout(applyTimer);
      applyTimer = setTimeout(() => { applyToLayer().catch(reportError); }, 350);
    }
  }

  function syncControls() {
    document.querySelectorAll('[data-key]').forEach(group => {
      const key = group.dataset.key;
      const input = group.matches('input') ? group : group.querySelector('input');
      if (!input) return;
      if (input.type === 'checkbox') input.checked = !!state[key];
      else {
        input.value = state[key];
        const val = group.querySelector('.val');
        if (val) val.textContent = Number(state[key]).toFixed(input.step && Number(input.step) < 1 ? 1 : 0);
      }
    });
    if (typeof ddSet === 'function') {
      ddSet($('preset'), state.preset);
      ddSet($('referenceModel'), state.referenceModel);
      ddSet($('gridStyle'), state.gridStyle);
      const lensVal = ['10','14','24','35','50','85','135','200','300'].includes(String(state.focalLength)) ? String(state.focalLength) : '';
      ddSet($('lensPreset'), lensVal);
    }
    const gc = $('gridColor'); if (gc && document.activeElement !== gc) gc.value = state.color;
    const hc = $('horizonColor'); if (hc && document.activeElement !== hc) hc.value = state.horizonColor;
    const gsw = $('gridSwatch'); if (gsw) gsw.style.background = state.color;
    const hsw = $('horizonSwatch'); if (hsw) hsw.style.background = state.horizonColor;
    // XYZ position fields (don't fight the user while typing).
    const pos = state.modelPositions[state.referenceModel] || [0,0,0];
    [['posX',0],['posY',1],['posZ',2]].forEach(([id, i]) => {
      const el = $(id); if (el && document.activeElement !== el) el.value = Number(pos[i].toFixed(2));
    });
    if (typeof refreshDepthAxisOptions === 'function') refreshDepthAxisOptions();
  }

  /* ---------- live preview ---------- */

  // The UXP canvas is too limited (no save/restore/getImageData) to trust for the
  // preview. Instead we rasterize with the same pure-JS rasterizer used for the
  // layer, composite onto a dark background, and show it via encodeImageData in
  // an <img>. This is identical to what gets written to the document.

  function scheduleRender() {
    if (renderScheduled) return;
    renderScheduled = true;
    requestAnimationFrame(() => { renderScheduled = false; drawPreview().catch(reportError); drawCube().catch(() => {}); });
  }

  // Composite an RGBA grid buffer over an opaque white background (in place).
  function compositeOverDark(rgba) {
    const bg = [255, 255, 255];
    for (let i = 0; i < rgba.length; i += 4) {
      const a = rgba[i + 3] / 255;
      rgba[i]     = Math.round(rgba[i]     * a + bg[0] * (1 - a));
      rgba[i + 1] = Math.round(rgba[i + 1] * a + bg[1] * (1 - a));
      rgba[i + 2] = Math.round(rgba[i + 2] * a + bg[2] * (1 - a));
      rgba[i + 3] = 255;
    }
    return rgba;
  }

  // Draw the orientation cube (ortho gizmo) into the #cube <img>. Uses the same
  // pure-JS rasterizer; edges of visible faces are drawn with their face color.
  async function drawCube() {
    const cubeEl = $('cube');
    if (!cubeEl) return;
    const size = 150;
    const cam = G.camera(state, size, size, true); // gizmo = ortho indicator
    const faces = G.cubeFaces(cam, 1);
    const lines = [];
    for (const face of faces) {
      const p = face.points;
      for (let i = 0; i < 4; i++) {
        lines.push({ points: [p[i], p[(i + 1) % 4]], color: '#8aa0a8', opacity: 1, width: 2, dash: [] });
      }
    }
    // Axis ticks (X/Z/Y) as short colored segments from the center.
    const cx = size / 2, cy = size * 0.46, len = 26;
    ['x','y','z'].forEach((axis, i) => {
      const end = [cx + cam.right[i] * len, cy - cam.up[i] * len];
      lines.push({ points: [[cx, cy], end], color: G.axisColors[axis], opacity: 1, width: 2.4, dash: [] });
    });
    const { data } = GridRaster.renderLines(lines, size, size);
    // Composite over the panel background so the cube reads on dark UI.
    for (let i = 0; i < data.length; i += 4) {
      const a = data[i + 3] / 255;
      const bg = 38;
      data[i]   = Math.round(data[i]   * a + bg * (1 - a));
      data[i+1] = Math.round(data[i+1] * a + bg * (1 - a));
      data[i+2] = Math.round(data[i+2] * a + bg * (1 - a));
      data[i+3] = 255;
    }
    if (PS && PS.available) {
      try { const url = await PS.encodePreview(data, size, size); if (url) cubeEl.src = url; } catch (_) {}
    } else {
      const canvas = document.createElement('canvas'); canvas.width = size; canvas.height = size;
      const ctx = canvas.getContext('2d'); const img = ctx.createImageData(size, size);
      img.data.set(data); ctx.putImageData(img, 0, 0); cubeEl.src = canvas.toDataURL('image/png');
    }
  }

  async function drawPreview() {
    // Render at a modest resolution matching the document aspect.
    const aspect = doc ? doc.width / doc.height : state.aspect;
    const w = 480, h = Math.max(1, Math.round(w / aspect));
    const lines = buildLines(w, h);
    const { data } = GridRaster.renderLines(lines, w, h);
    compositeOverDark(data);

    if (PS && PS.available) {
      try {
        const dataUrl = await PS.encodePreview(data, w, h);
        if (dataUrl) preview.src = dataUrl;
      } catch (e) {
        // Surface preview-encode failures instead of silently showing black.
        setStatus('Preview indisponível (' + (e && e.message ? e.message : e) + '). A grade na camada funciona.', 'error');
      }
    } else {
      // Browser dev fallback: use a normal canvas that supports putImageData.
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      const img = ctx.createImageData(w, h);
      img.data.set(data);
      ctx.putImageData(img, 0, 0);
      preview.src = canvas.toDataURL('image/png');
    }
  }

  /* ---------- RGBA buffer at document resolution ---------- */

  // The UXP canvas cannot return pixels (getImageData is not implemented), so we
  // rasterize the grid lines ourselves in pure JS (raster.js) into a straight-
  // alpha RGBA Uint8Array suitable for the Imaging API.
  // Combine the grid lines with the reference model's wireframe edges (if shown).
  // The model edges use the same camera, so they stay consistent with the grid.
  function buildLines(width, height) {
    const lines = G.projectedLines(state, width, height);
    if (state.showCube && typeof ReferenceModels !== 'undefined') {
      const scale = width / 1600;
      const segs = ReferenceModels.modelSegments(G, state, width, height);
      for (const seg of segs) {
        lines.push({ points: seg.points, color: seg.color, opacity: 1, width: 1.6 * scale, dash: [] });
      }
    }
    return lines;
  }

  function renderGridBuffer(width, height) {
    const lines = buildLines(width, height);
    const result = GridRaster.renderLines(lines, width, height);
    return result.data;
  }

  /* ---------- Option A: apply to layer ---------- */

  async function applyToLayer() {
    if (!PS || !PS.available) { setStatus('Photoshop indisponível (fora do host UXP).', 'error'); return; }
    if (!doc) { setStatus('Abra um documento primeiro.', 'error'); return; }
    if (busy) return;
    busy = true;
    setStatus('Aplicando grade na camada...');
    try {
      const rgba = renderGridBuffer(doc.width, doc.height);
      const result = await PS.applyGrid(rgba, doc.width, doc.height, gridLayerId);
      gridLayerId = result.layerID;
      setStatus(result.created ? 'Camada "Perspective Grid" criada e atualizada.' : 'Grade atualizada na camada.', 'ok');
    } catch (err) {
      reportError(err);
    } finally {
      busy = false;
      // If the user kept moving while we were writing, apply the latest state now.
      if (applyQueued) { applyQueued = false; applyToLayer().catch(reportError); }
    }
  }

  function reportError(err) {
    console.error(err);
    setStatus('Erro: ' + (err && err.message ? err.message : String(err)), 'error');
  }

  /* ---------- Option B: export PNG (fallback) ---------- */

  async function exportPng() {
    const width = 2400;
    const height = Math.round(width / (doc ? doc.width / doc.height : state.aspect));
    const lines = G.projectedLines(state, width, height);
    const { data } = GridRaster.renderLines(lines, width, height);
    const pngBuffer = GridRaster.encodePng(data, width, height); // transparent RGBA PNG
    try {
      const storage = require('uxp').storage;
      const fs = storage.localFileSystem;
      const file = await fs.getFileForSaving('perspective-grid.png', { types: ['png'] });
      if (!file) return; // user cancelled
      await file.write(pngBuffer, { format: storage.formats.binary });
      setStatus('PNG transparente exportado.', 'ok');
    } catch (err) {
      // Browser dev fallback: trigger a download.
      const blob = new Blob([pngBuffer], { type: 'image/png' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'perspective-grid.png';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      setStatus('PNG transparente exportado (download).', 'ok');
    }
  }

  async function exportSvg() {
    // The core already emits a scaled, transparent SVG of the grid + annotations.
    const svg = G.svg(state);
    try {
      const storage = require('uxp').storage;
      const fs = storage.localFileSystem;
      const file = await fs.getFileForSaving('perspective-grid.svg', { types: ['svg'] });
      if (!file) return;
      await file.write(svg, { format: storage.formats.utf8 });
      setStatus('SVG vetorial exportado.', 'ok');
    } catch (err) {
      const blob = new Blob([svg], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'perspective-grid.svg';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      setStatus('SVG vetorial exportado (download).', 'ok');
    }
  }

  /* ---------- document tracking ---------- */

  function refreshDoc(info) {
    const previousId = doc && doc.id;
    doc = info;
    if (!doc) {
      $('docInfo').textContent = 'Nenhum documento aberto';
      $('applyBtn').disabled = true;
      setStatus('Abra um documento no Photoshop para começar.');
    } else {
      if (doc.id !== previousId) gridLayerId = null; // don't reuse a layer across docs
      $('docInfo').textContent = `${doc.title} · ${doc.width} × ${doc.height}`;
      $('applyBtn').disabled = !(PS && PS.available);
      setStatus('Pronto. Ajuste a grade e clique em Aplicar.');
    }
    scheduleRender();
  }

  /* ---------- sp-dropdown helpers (Spectrum widget, replaces <select>) ---------- */

  function ddItems(dd) { return Array.from(dd.querySelectorAll('sp-menu-item')); }
  function ddValue(dd) {
    const items = ddItems(dd);
    const i = typeof dd.selectedIndex === 'number' && dd.selectedIndex >= 0 ? dd.selectedIndex : -1;
    if (i >= 0 && items[i]) return items[i].getAttribute('value');
    const sel = items.find(it => it.hasAttribute('selected'));
    return sel ? sel.getAttribute('value') : (items[0] ? items[0].getAttribute('value') : '');
  }
  function ddSet(dd, value) {
    const items = ddItems(dd);
    const idx = items.findIndex(it => it.getAttribute('value') === String(value));
    if (idx >= 0) { try { dd.selectedIndex = idx; } catch (_) {} }
  }
  function ddOnChange(dd, handler) {
    dd.addEventListener('change', () => handler(ddValue(dd)));
  }

  /* ---------- events ---------- */

  document.querySelectorAll('[data-key]').forEach(group => {
    const key = group.dataset.key;
    const input = group.matches('input') ? group : group.querySelector('input');
    if (!input) return;
    input.addEventListener('input', () => {
      if (input.type === 'checkbox') change({ [key]: input.checked });
      else if (input.value !== '' && Number.isFinite(input.valueAsNumber)) {
        change({ [key]: G.clamp(input.valueAsNumber, ...(G.bounds[key] || [-Infinity, Infinity])) });
      }
    });
  });

  const presetValues = {
    free: { projection: 'perspective' },
    one: { yaw: 0, pitch: 0, roll: 0, projection: 'perspective' },
    two: { yaw: 43, pitch: 0, roll: 0, projection: 'perspective' },
    three: { yaw: 43, pitch: 20, roll: 0, projection: 'perspective' },
    five: { yaw: 0, pitch: 0, roll: 0, projection: 'fisheye', focalLength: 10, distortion: 100 },
    ortho: { projection: 'ortho' }
  };
  ddOnChange($('preset'), v => change({ ...presetValues[v], preset: v }));
  ddOnChange($('referenceModel'), v => change({ referenceModel: v, showCube: true }));
  ddOnChange($('gridStyle'), v => change({ gridStyle: v }));
  ddOnChange($('lensPreset'), v => { if (v) change({ focalLength: Number(v) }); });
  const isHex = v => /^#[0-9a-fA-F]{6}$/.test(v);
  $('gridColor').addEventListener('input', e => { if (isHex(e.target.value)) change({ color: e.target.value }); });
  $('horizonColor').addEventListener('input', e => { if (isHex(e.target.value)) change({ horizonColor: e.target.value }); });
  $('centerModelBtn').addEventListener('click', () => change({ modelPositions: { ...state.modelPositions, [state.referenceModel]: [0, 0, 0] } }));

  // XYZ position fields for the active model.
  ['posX','posY','posZ'].forEach((id, i) => {
    $(id).addEventListener('change', e => {
      const v = Number(e.target.value);
      if (!Number.isFinite(v)) return;
      const pos = [...(state.modelPositions[state.referenceModel] || [0,0,0])];
      pos[i] = G.clamp(v, -100, 100);
      change({ modelPositions: { ...state.modelPositions, [state.referenceModel]: pos } });
    });
  });

  // Fit the model in frame: adjust distance/pan to frame the model's edges with
  // ~10% margin, keeping lens, zoom, scale and world position. Pure JS (no Three).
  $('fitModelBtn').addEventListener('click', () => {
    if (!state.showCube) { setStatus('Ative "Mostrar modelo" para enquadrar.'); return; }
    const w = 1600, h = Math.round(1600 / state.aspect);
    // Sample the model's edge endpoints as framing points.
    const segs = ReferenceModels.modelSegments(G, { ...state, panX: 0, panY: 0 }, w, h);
    if (!segs.length) { setStatus('Modelo fora do quadro; gire ou reduza o tamanho.'); return; }
    // Reconstruct 3D framing points from the model's boxes for a robust fit.
    const pts = modelFramingPoints();
    const distance = G.framingDistance(state, state, pts, 4);
    change({ distance, panX: 0, panY: 0 });
    setStatus('Modelo enquadrado.', 'ok');
  });

  // 3D framing points: corners of every box in the active model, scaled/placed.
  function modelFramingPoints() {
    const name = state.referenceModel, scale = state.boxSize || 1;
    const pos = state.modelPositions[name] || [0,0,0];
    const boxes = ReferenceModels.modelBoxes(name);
    const pts = [];
    for (const e of boxes) {
      for (const v of [e.a, e.b]) pts.push([v[0]*scale+pos[0], v[1]*scale+pos[1], v[2]*scale+pos[2]]);
    }
    return pts;
  }

  // Populate the depth vanishing-point selector from the current model axes.
  function refreshDepthAxisOptions() {
    const dd = $('depthAxis');
    const menu = dd.querySelector('sp-menu');
    const axes = state.showCube ? G.modelAxes(state, docW(), docH()) : [];
    menu.innerHTML = '<sp-menu-item value="">Selecione um ponto de fuga</sp-menu-item>' +
      axes.map(a => `<sp-menu-item value="${a.axis}|${a.label}">${a.label} · ${a.axis.toUpperCase()}</sp-menu-item>`).join('');
    // Keep current selection if still present.
    if (depthAxisSel) {
      const key = depthAxisSel.axis + '|' + depthAxisSel.label;
      const idx = Array.from(menu.querySelectorAll('sp-menu-item')).findIndex(it => it.getAttribute('value') === key);
      if (idx >= 0) { try { dd.selectedIndex = idx; } catch (_) {} } else depthAxisSel = null;
    }
  }
  $('depthAxis').addEventListener('change', () => {
    const v = ddValue($('depthAxis'));
    if (!v) { depthAxisSel = null; return; }
    const [axis, label] = v.split('|');
    depthAxisSel = { axis, label };
    interactionMode = 'depth';
    document.querySelectorAll('[data-mode]').forEach(b => b.classList.toggle('active', b.dataset.mode === 'depth'));
    setStatus(`Profundidade: ${label} · ${axis.toUpperCase()}. Arraste no preview.`);
  });

  // Reset scene (camera + positions) preserving grid options and preset.
  $('resetBtn').addEventListener('click', () => {
    const p = {};
    ['yaw','pitch','roll','focalLength','distortion','distance','panX','panY','viewZoom','boxSize'].forEach(k => p[k] = G.defaults[k]);
    change({ ...p, ...(presetValues[state.preset] || {}), modelPositions: G.defaults.modelPositions });
    setStatus('Cena restaurada.', 'ok');
  });

  // Camera view shortcuts.
  const views = { front:[0,0], right:[90,0], top:[0,90], iso:[43,20] };
  document.querySelectorAll('[data-view]').forEach(btn => {
    btn.addEventListener('click', () => { const [yaw, pitch] = views[btn.dataset.view] || views.iso; change({ yaw, pitch, roll: 0 }); });
  });

  // Grid quick profiles.
  const gridProfiles = {
    clean: { gridStyle:'rays', showGrid:true, xLines:true, yLines:true, zLines:true, showHorizon:true, showVps:true, showAxes:false },
    study: { gridStyle:'rays', showGrid:true, xLines:true, yLines:true, zLines:true, showHorizon:true, showVps:true, showAxes:true },
    lines: { gridStyle:'rays', showGrid:true, xLines:true, yLines:true, zLines:true, showHorizon:false, showVps:false, showAxes:false }
  };
  document.querySelectorAll('[data-grid-preset]').forEach(btn => {
    btn.addEventListener('click', () => change(gridProfiles[btn.dataset.gridPreset]));
  });

  // Accordion drawers. Toggle both the class (for the chevron) and the [hidden]
  // attribute on the body — UXP hides via [hidden] more reliably than an
  // inherited display:none, which selects were ignoring (overlap bug).
  function setDrawer(drawer, open) {
    drawer.classList.toggle('open', open);
    const body = drawer.querySelector('.drawer-body');
    if (body) { if (open) body.removeAttribute('hidden'); else body.setAttribute('hidden', ''); }
  }
  document.querySelectorAll('[data-drawer]').forEach(drawer => {
    const head = drawer.querySelector('.drawer-head');
    // Initialize from the presence of the .open class in markup.
    setDrawer(drawer, drawer.classList.contains('open'));
    head.addEventListener('click', () => setDrawer(drawer, !drawer.classList.contains('open')));
  });

  $('applyBtn').addEventListener('click', () => applyToLayer().catch(reportError));
  $('exportBtn').addEventListener('click', () => exportPng().catch(reportError));
  $('exportSvgBtn').addEventListener('click', () => exportSvg().catch(reportError));

  // Drag on the preview to orbit the grid (like the web prototype's cube/scene).
  // The drag behavior depends on the active interaction mode:
  //   orbit  -> G.orbit (yaw/pitch respecting the perspective mode)
  //   pan    -> shift framing (panX/panY)
  //   model  -> translate the model in the camera-parallel plane (G.moveModel)
  //   depth  -> move the model along the selected vanishing-point axis
  // Doc coordinates are derived by mapping the pointer into the previewed image
  // rect (object-fit: contain), so model moves land where the pointer is.
  const docW = () => (doc ? doc.width : 1600);
  const docH = () => (doc ? doc.height : 1000);

  function pointerToDoc(e) {
    const rect = preview.getBoundingClientRect();
    const aspect = doc ? doc.width / doc.height : state.aspect;
    // Recompute the contained image rect inside the <img> element.
    let w = rect.width, h = rect.width / aspect;
    if (h > rect.height) { h = rect.height; w = rect.height * aspect; }
    const ox = rect.left + (rect.width - w) / 2;
    const oy = rect.top + (rect.height - h) / 2;
    const nx = (e.clientX - ox) / w, ny = (e.clientY - oy) / h;
    return [nx * docW(), ny * docH()];
  }

  let previewDrag = null;
  preview.addEventListener('pointerdown', e => {
    previewDrag = { id: e.pointerId, x: e.clientX, y: e.clientY, start: state };
    try { preview.setPointerCapture(e.pointerId); } catch (_) {}
    e.preventDefault();
  });
  preview.addEventListener('pointermove', e => {
    if (!previewDrag || previewDrag.id !== e.pointerId) return;
    const dx = e.clientX - previewDrag.x, dy = e.clientY - previewDrag.y;
    previewDrag.x = e.clientX; previewDrag.y = e.clientY;
    if (dx === 0 && dy === 0) return;
    const w = docW(), h = docH();

    if (interactionMode === 'orbit') {
      change(G.orbit(state, dx, dy, w, h, 0.4));
    } else if (interactionMode === 'pan') {
      change({ panX: state.panX + dx / w * 100, panY: state.panY + dy / h * 100 });
    } else if (interactionMode === 'model') {
      if (!state.showCube) { setStatus('Ative "Mostrar modelo" para movê-lo.'); return; }
      // moveModel expects screen-space deltas in document pixels.
      const next = G.moveModel(state, dx * w / (preview.clientWidth || w), dy * h / (preview.clientHeight || h), w, h);
      change({ modelPositions: next.modelPositions });
    } else if (interactionMode === 'depth') {
      if (!state.showCube) { setStatus('Ative "Mostrar modelo" para mover em profundidade.'); return; }
      if (!depthAxisSel) { setStatus('Escolha um ponto de fuga na aba Referência 3D.'); return; }
      const target = pointerToDoc(e);
      const next = G.moveModelOnAxis(state, depthAxisSel.axis, target, w, h, 0.2);
      change({ modelPositions: next.modelPositions });
    }
  });
  function endPreviewDrag(e) {
    if (!previewDrag || previewDrag.id !== e.pointerId) return;
    try { preview.releasePointerCapture(previewDrag.id); } catch (_) {}
    previewDrag = null;
  }
  preview.addEventListener('pointerup', endPreviewDrag);
  preview.addEventListener('pointercancel', endPreviewDrag);
  preview.style.cursor = 'grab';

  // Interaction mode segmented buttons.
  document.querySelectorAll('[data-mode]').forEach(btn => {
    btn.addEventListener('click', () => {
      interactionMode = btn.dataset.mode;
      document.querySelectorAll('[data-mode]').forEach(b => b.classList.toggle('active', b === btn));
    });
  });

  // Orientation cube: dragging always orbits the camera (respects the mode).
  const cubeEl = $('cube');
  let cubeDrag = null;
  if (cubeEl) {
    cubeEl.addEventListener('pointerdown', e => {
      cubeDrag = { id: e.pointerId, x: e.clientX, y: e.clientY };
      try { cubeEl.setPointerCapture(e.pointerId); } catch (_) {}
      e.preventDefault();
    });
    cubeEl.addEventListener('pointermove', e => {
      if (!cubeDrag || cubeDrag.id !== e.pointerId) return;
      const dx = e.clientX - cubeDrag.x, dy = e.clientY - cubeDrag.y;
      cubeDrag.x = e.clientX; cubeDrag.y = e.clientY;
      if (dx === 0 && dy === 0) return;
      change(G.orbit(state, dx, dy, docW(), docH(), 0.6));
    });
    const endCube = e => {
      if (!cubeDrag || cubeDrag.id !== e.pointerId) return;
      try { cubeEl.releasePointerCapture(cubeDrag.id); } catch (_) {}
      cubeDrag = null;
    };
    cubeEl.addEventListener('pointerup', endCube);
    cubeEl.addEventListener('pointercancel', endCube);
  }

  window.addEventListener('resize', scheduleRender);

  /* ---------- init ---------- */

  syncControls();
  if (PS && PS.available) {
    PS.onDocumentChanged(refreshDoc);
    refreshDoc(PS.activeDocumentInfo());
  } else {
    $('applyBtn').disabled = true;
    $('docInfo').textContent = 'Modo desenvolvimento (sem Photoshop)';
    setStatus('Rodando fora do host UXP: preview e export PNG disponíveis.');
    scheduleRender();
  }
})();
