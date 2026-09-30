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
  }

  /* ---------- live preview ---------- */

  // The UXP canvas is too limited (no save/restore/getImageData) to trust for the
  // preview. Instead we rasterize with the same pure-JS rasterizer used for the
  // layer, composite onto a dark background, and show it via encodeImageData in
  // an <img>. This is identical to what gets written to the document.

  function scheduleRender() {
    if (renderScheduled) return;
    renderScheduled = true;
    requestAnimationFrame(() => { renderScheduled = false; drawPreview().catch(reportError); });
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

  // Drag on the preview to orbit the grid (like the web prototype's cube/scene).
  // Horizontal drag = yaw, vertical drag = pitch, via the shared G.orbit which
  // respects the current perspective mode's constraints.
  let previewDrag = null;
  preview.addEventListener('pointerdown', e => {
    previewDrag = { id: e.pointerId, x: e.clientX, y: e.clientY };
    try { preview.setPointerCapture(e.pointerId); } catch (_) {}
    e.preventDefault();
  });
  preview.addEventListener('pointermove', e => {
    if (!previewDrag || previewDrag.id !== e.pointerId) return;
    const dx = e.clientX - previewDrag.x, dy = e.clientY - previewDrag.y;
    previewDrag.x = e.clientX; previewDrag.y = e.clientY;
    if (dx === 0 && dy === 0) return;
    const w = doc ? doc.width : 1600, h = doc ? doc.height : 1000;
    change(G.orbit(state, dx, dy, w, h, 0.4));
  });
  function endPreviewDrag(e) {
    if (!previewDrag || previewDrag.id !== e.pointerId) return;
    try { preview.releasePointerCapture(previewDrag.id); } catch (_) {}
    previewDrag = null;
  }
  preview.addEventListener('pointerup', endPreviewDrag);
  preview.addEventListener('pointercancel', endPreviewDrag);
  preview.style.cursor = 'grab';

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
