/*
 * Panel controller (UXP) — rewritten for speed and stability.
 *
 * The preview uses a local RGBA raster and PNG image. Host pixel writes happen
 * only through the Apply / Update actions; layout changes do not write layers.
 *
 * Layout stability: tabs mount only the active section; native UXP widgets in
 * inactive tabs are removed from the DOM so they cannot escape/overlap.
 */
(function () {
  'use strict';

  const G = (typeof window !== 'undefined' ? window : globalThis).PerspectiveGeometry;
  const PS = (typeof window !== 'undefined' ? window : globalThis).PSAdapter;
  const I18N = (typeof window !== 'undefined' ? window : globalThis).PGI18n;
  const T = (key, vars) => (I18N ? I18N.t(key, vars) : key);
  const $ = id => document.getElementById(id);
  const STORAGE_KEY = 'perspective-grid-uxp-v2';

  let state;
  try { state = G.normalize(JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}); }
  catch (_) { state = G.normalize({}); }
  // Migração: versões 0.8.0–0.8.2 usaram 'floor' como grade padrão. Volta ao
  // estilo original 'rays' para quem já tinha o estado salvo.
  if (state.gridStyle === 'floor') { state.gridStyle = 'rays'; }

  let doc = null;
  let gridLayerId = null;
  let applyTimer = null;
  let busy = false, applyQueued = false;
  let modelOpacity = 0.85; // filled-model opacity (0..1), UI-only
  let moveMode = 'orbit';  // orbit | plane | depth (preview drag behavior)
  let depthAxisSel = null; // { axis, label } for depth moves

  // The wrapper owns pointer events and the box size; the preview surfaces
  // stack inside it. `preview` = wrapper (events/measurements).
  //
  // LIVE PREVIEW = inline <svg>. We draw the grid lines and model faces as
  // vector elements (<polyline>/<polygon>) and update them by rewriting the
  // SVG DOM. There is NO PNG encode and NO <img> src swap during movement, so
  // there is nothing to "drop and reload" — the cause of the flicker is gone.
  // The PNG is only built when applying to the layer (the button handlers).
  //
  // The <img> buffers remain as a fallback in case SVG rendering ever fails,
  // so the panel is never left blank.
  const SVGNS = 'http://www.w3.org/2000/svg';
  const previewSvg = $('previewSvg');
  const previewA = $('previewA'), previewB = $('previewB');
  const preview = previewA.parentElement; // .preview-wrap
  let svgWorks = null; // null = untested; true/false after first attempt
  let bufFront = previewA, bufBack = previewB;
  function swapBuffers() {
    bufFront.classList.add('buf-hidden');
    bufBack.classList.remove('buf-hidden');
    const t = bufFront; bufFront = bufBack; bufBack = t;
  }
  function useSvgSurface() {
    previewSvg.classList.remove('buf-hidden');
    previewA.classList.add('buf-hidden');
    previewB.classList.add('buf-hidden');
  }
  function useImgSurface() {
    previewSvg.classList.add('buf-hidden');
  }
  function ptsAttr(points) {
    let s = '';
    for (let i = 0; i < points.length; i++) s += (i ? ' ' : '') + points[i][0].toFixed(2) + ',' + points[i][1].toFixed(2);
    return s;
  }
  // Draw the whole scene as vector elements into the SVG. Returns false if the
  // SVG DOM can't be built, so the caller can fall back to the PNG-in-img path.
  function paintSvg(w, h) {
    try {
      previewSvg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
      // White backdrop so the flattened look matches the layer output.
      let markup = '<rect x="0" y="0" width="' + w + '" height="' + h + '" fill="#ffffff"/>';
      // Filled model faces first (under the grid), already sorted far-to-near.
      if (state.showCube && typeof ReferenceModels !== 'undefined') {
        const faces = ReferenceModels.modelFaces(G, state, w, h);
        for (const f of faces) {
          const [r, g, b] = f.color;
          markup += '<polygon points="' + ptsAttr(f.points) + '" fill="rgb(' + r + ',' + g + ',' + b + ')"'
                 + ' fill-opacity="' + modelOpacity.toFixed(3) + '" stroke="rgba(0,0,0,' + (0.2 * modelOpacity).toFixed(3) + ')" stroke-width="1"/>';
        }
      }
      // Grid lines on top.
      const lines = buildLines(w, h);
      for (const ln of lines) {
        if (!ln.points || ln.points.length < 2) continue;
        const dash = ln.dash && ln.dash.length ? ' stroke-dasharray="' + ln.dash.join(',') + '"' : '';
        markup += '<polyline points="' + ptsAttr(ln.points) + '" fill="none" stroke="' + ln.color + '"'
               + ' stroke-opacity="' + (ln.opacity != null ? ln.opacity : 1) + '" stroke-width="' + (ln.width || 1) + '"'
               + ' stroke-linecap="round" stroke-linejoin="round"' + dash + '/>';
      }
      previewSvg.innerHTML = markup;
      return true;
    } catch (_) { return false; }
  }
  // User-controlled preview scale (1 = fit width to document aspect). Dragging
  // the handle grows it; width stays 100% of the panel, height follows aspect.
  let previewScale = 1;

  // Height = (panel width / document aspect) * scale. This makes the image box
  // match the document proportions exactly, so there are no white borders.
  // Preview ampliado (botão no canto do preview): a cena ocupa o painel inteiro,
  // mantendo a proporção do documento. Bom para demonstrações.
  let previewMax = false;
  function fitPreviewBox() {
    const aspect = doc ? doc.width / doc.height : state.aspect;
    if (previewMax) {
      const top = preview.parentElement;
      const pad = 16; // .preview-max .top usa 8px de padding em cada lado
      const availW = Math.max(60, (top.clientWidth || 320) - pad);
      const availH = Math.max(60, (document.querySelector('.panel').clientHeight || 640) - pad);
      const w = Math.min(availW, availH * aspect), h = w / aspect;
      preview.style.width = Math.round(w) + 'px';
      preview.style.height = Math.round(h) + 'px';
      preview.style.marginTop = Math.max(0, Math.round((availH - h) / 2)) + 'px';
      return;
    }
    preview.style.width = '';
    preview.style.marginTop = '';
    const availW = preview.clientWidth || 320;
    // Leave room for controls even with portrait documents and short panels.
    const panelHeight = document.querySelector('.panel').clientHeight || 640;
    const limit = Math.max(90, Math.min(360, panelHeight * 0.4, panelHeight - 270));
    const h = Math.min(limit, Math.max(90, Math.round((availW / aspect) * previewScale)));
    preview.style.height = h + 'px';
  }

  const docW = () => (doc ? doc.width : 1600);
  const docH = () => (doc ? doc.height : 1000);

  /* ---------- status / persist ---------- */

  function setStatus(msg, kind) {
    const el = $('status'); el.textContent = msg; el.className = 'status' + (kind ? ' ' + kind : '');
  }
  function persist() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (_) {} }

  /* ---------- state change ---------- */

  function change(patch) {
    state = G.normalize({ ...state, ...patch });
    syncControls();
    drawPreview();  // local preview only; the layer updates on demand (button)
    persist();
  }

  function syncControls() {
    document.querySelectorAll('[data-key]').forEach(el => {
      const key = el.dataset.key;
      const isCb = el.tagName === 'SP-CHECKBOX' || el.type === 'checkbox';
      if (isCb) el.checked = !!state[key];
      else if (document.activeElement !== el) el.value = state[key];
    });
    if (typeof ddSet === 'function') {
      ddSet($('preset'), state.preset);
      ddSet($('referenceModel'), state.showCube ? state.referenceModel : 'none');
      ddSet($('gridStyle'), state.gridStyle);
      const lensVal = ['10','14','24','35','50','85','135','200','300'].includes(String(state.focalLength)) ? String(state.focalLength) : '';
      ddSet($('lensPreset'), lensVal);
    }
    // Derive the line-style dropdown from state.
    const cs = state.showAxes ? 'color' : (state.color === '#111111' ? 'black' : 'gray');
    if (typeof ddSet === 'function') ddSet($('colorStyle'), cs);
    // Roll is only editable in Free mode; other modes force roll = 0.
    const rollEl = $('roll'), rollVal = $('rollVal');
    if (rollEl) {
      const editable = state.preset === 'free';
      if (editable) rollEl.removeAttribute('disabled'); else rollEl.setAttribute('disabled', '');
      if (rollVal) {
        rollVal.textContent = Math.round(state.roll) + '°';
        rollVal.classList.toggle('disabled', !editable);
      }
    }
    // Orthographic: show numeric axis angles so the user knows the exact opening.
    const orthoBox = $('orthoAngles');
    if (orthoBox) {
      orthoBox.removeAttribute('hidden');
      const yd = $('yawDeg'), pd = $('pitchDeg');
      if (yd && document.activeElement !== yd) yd.value = Math.round(state.yaw);
      if (pd && document.activeElement !== pd) pd.value = Math.round(state.pitch);
      if (yd) yd.disabled = state.preset === 'one';
      if (pd) pd.disabled = state.preset === 'one' || state.preset === 'two';
      const views = { iso:[45,35.264], dimetric:[20.5,19.5], trimetric:[35,25], front:[0,0], right:[90,0], top:[0,89] };
      const match = Object.keys(views).find(key => Math.abs(state.yaw-views[key][0])<0.1 && Math.abs(state.pitch-views[key][1])<0.1);
      ddSet($('orthoPreset'), match || 'custom');
    }
    ['focalLength','lensPreset'].forEach(id => {
      const el = $(id); if (!el) return;
      if (state.preset === 'ortho') el.setAttribute('disabled', ''); else el.removeAttribute('disabled');
    });
    const distortion = $('distortion');
    if (distortion) { if (state.preset === 'five') distortion.removeAttribute('hidden'); else distortion.setAttribute('hidden', ''); }
    const mo = $('modelOpacity'); if (mo && document.activeElement !== mo) mo.value = Math.round(modelOpacity * 100);
    const pos = state.modelPositions[state.referenceModel] || [0,0,0];
    [['posX',0],['posY',1],['posZ',2]].forEach(([id, i]) => {
      const el = $(id); if (el && document.activeElement !== el) el.value = Number(pos[i].toFixed(2));
    });
    // Guide-count number fields mirror the sliders.
    [['xCountNum','xCount'],['zCountNum','zCount'],['yCountNum','yCount']].forEach(([id, key]) => {
      const el = $(id); if (el && document.activeElement !== el) el.value = state[key];
      if (el) el.disabled = !state[key[0] + 'Lines'];
    });
    // Move mode + depth PF options (model tab).
    if (typeof ddSet === 'function') ddSet($('moveMode'), moveMode);
    const depthRow = $('depthAxisRow');
    if (depthRow) { if (moveMode === 'depth') depthRow.removeAttribute('hidden'); else depthRow.setAttribute('hidden', ''); }
    if (typeof refreshDepthAxisOptions === 'function') refreshDepthAxisOptions();
  }

  /* ---------- fast local preview (canvas stroke, no host) ---------- */

  // Grid lines only (model is now drawn as filled faces, below the grid).
  function buildLines(w, h) {
    return G.projectedLines(state, w, h);
  }

  // Render the full scene into an RGBA buffer: filled model faces FIRST (so they
  // sit under the grid), then the grid lines ON TOP.
  function renderScene(width, height) {
    const R = GridRaster;
    let buf;
    if (state.showCube && typeof ReferenceModels !== 'undefined') {
      buf = new Uint8Array(width * height * 4);
      const faces = ReferenceModels.modelFaces(G, state, width, height);
      for (const f of faces) {
        const [r, g, b] = f.color;
        R.fillPolygon(buf, width, height, f.points, r, g, b, modelOpacity); // solid face
        drawPolyOutline(buf, width, height, f.points, 0.2 * modelOpacity);
      }
      // Now composite the grid lines on top of the same buffer.
      const gridBuf = R.renderLines(buildLines(width, height), width, height).data;
      compositeOver(buf, gridBuf);
    } else {
      buf = R.renderLines(buildLines(width, height), width, height).data;
    }
    return buf;
  }

  // Draw a thin dark outline around a polygon (in place) for face definition.
  function drawPolyOutline(buf, w, h, pts, alpha) {
    const segs = [];
    for (let i = 0; i < pts.length; i++) segs.push([pts[i], pts[(i + 1) % pts.length]]);
    const lines = segs.map(s => ({ points: s, color: '#2b3236', opacity: alpha, width: 1, dash: [] }));
    const edge = GridRaster.renderLines(lines, w, h).data;
    compositeOver(buf, edge);
  }

  // Alpha-over composite src (RGBA straight) onto dst (in place).
  function compositeOver(dst, src) {
    for (let i = 0; i < dst.length; i += 4) {
      const sa = src[i + 3] / 255;
      if (sa <= 0) continue;
      const da = dst[i + 3] / 255;
      const outA = sa + da * (1 - sa);
      if (outA <= 0) continue;
      dst[i]   = Math.round((src[i]   * sa + dst[i]   * da * (1 - sa)) / outA);
      dst[i+1] = Math.round((src[i+1] * sa + dst[i+1] * da * (1 - sa)) / outA);
      dst[i+2] = Math.round((src[i+2] * sa + dst[i+2] * da * (1 - sa)) / outA);
      dst[i+3] = Math.round(outA * 255);
    }
  }

  // The live preview is now vector (SVG), so there is no per-frame PNG cost and
  // no need for a low/high quality split. We just coalesce rapid changes into
  // one draw per animation frame.
  let interacting = false;
  let previewBusy = false, previewDue = false, previewTimer = null;

  function drawPreview() {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(() => {
      if (previewBusy) { previewDue = true; return; }
      renderPreview();
      drawCube();
    }, 0);
  }

  function renderPreview() {
    previewBusy = true;
    try {
      const aspect = doc ? doc.width / doc.height : state.aspect;
      // SVG is resolution-independent; a fixed logical width keeps line widths
      // and dash sizes consistent, and the viewBox scales it to the box.
      const w = 600;
      const h = Math.max(1, Math.round(w / aspect));

      // Primary path: draw vector SVG — no PNG, no <img> src swap, no flash.
      if (svgWorks !== false) {
        const ok = paintSvg(w, h);
        if (ok) { svgWorks = true; useSvgSurface(); return; }
        svgWorks = false; // remember it failed; use PNG fallback from now on
      }

      // Fallback: raster to RGBA, composite over white, encode PNG, swap <img>.
      const data = renderScene(w, h);
      for (let i = 0; i < data.length; i += 4) {
        const a = data[i + 3] / 255;
        data[i]   = Math.round(data[i]   * a + 255 * (1 - a));
        data[i+1] = Math.round(data[i+1] * a + 255 * (1 - a));
        data[i+2] = Math.round(data[i+2] * a + 255 * (1 - a));
        data[i+3] = 255;
      }
      const png = GridRaster.encodePng(data, w, h);
      bufBack.src = 'data:image/png;base64,' + base64FromBytes(new Uint8Array(png));
      swapBuffers();
      useImgSurface();
    } catch (e) { /* keep last image */ }
    finally {
      previewBusy = false;
      if (previewDue) { previewDue = false; renderPreview(); }
    }
  }

  // Fast base64 for a byte buffer (chunked to avoid call-stack limits).
  function base64FromBytes(bytes) {
    let bin = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(bin);
  }

  // Orientation cube: ortho gizmo drawn in pure JS, shown in the #cube <img>.
  // Only redraws when orientation changes (cheap).
  let lastCubeSig = '';
  function drawCube() {
    const el = $('cube'); if (!el) return;
    const sig = [state.yaw, state.pitch, state.roll].join(',');
    if (sig === lastCubeSig) return;
    lastCubeSig = sig;
    const W = 84, H = 150;
    const cam = G.camera(state, W, H, true); // gizmo ortho
    const lines = [];
    for (const face of G.cubeFaces(cam, 1)) {
      const p = face.points;
      for (let i = 0; i < 4; i++) lines.push({ points: [p[i], p[(i+1)%4]], color: '#8aa0a8', opacity: 1, width: 1.6, dash: [] });
    }
    const cx = W/2, cy = H*0.5, len = 22;
    ['x','y','z'].forEach((axis, i) => {
      lines.push({ points: [[cx, cy], [cx + cam.right[i]*len, cy - cam.up[i]*len]], color: G.axisColors[axis], opacity: 1, width: 2.2, dash: [] });
    });
    const { data } = GridRaster.renderLines(lines, W, H);
    // Composite over panel background.
    for (let i = 0; i < data.length; i += 4) {
      const a = data[i+3]/255, bg = 38;
      data[i]=Math.round(data[i]*a+bg*(1-a)); data[i+1]=Math.round(data[i+1]*a+bg*(1-a)); data[i+2]=Math.round(data[i+2]*a+bg*(1-a)); data[i+3]=255;
    }
    try { el.src = 'data:image/png;base64,' + base64FromBytes(new Uint8Array(GridRaster.encodePng(data, W, H))); } catch (_) {}
  }

  /* ---------- RGBA buffer for the layer (host) ---------- */

  function renderGridBuffer(width, height) {
    return renderScene(width, height);
  }

  /* ---------- Apply to layer (host) ---------- */

  async function applyToLayer() {
    if (!PS || !PS.available) { setStatus(T('status.noPs'), 'error'); return; }
    if (!doc) { setStatus(T('status.needDoc'), 'error'); return; }
    if (busy) { applyQueued = true; return; }
    busy = true;
    setStatus(T('status.applying'));
    try {
      const rgba = renderGridBuffer(doc.width, doc.height);
      const result = await PS.applyGrid(rgba, doc.width, doc.height, gridLayerId);
      gridLayerId = result.layerID;
      setStatus(result.created ? T('status.layerCreated') : T('status.gridUpdated'), 'ok');
    } catch (err) { reportError(err); }
    finally {
      busy = false;
      if (applyQueued) { applyQueued = false; applyToLayer().catch(reportError); }
    }
  }

  function reportError(err) {
    console.error(err);
    setStatus(T('status.error', { msg: (err && err.message ? err.message : String(err)) }), 'error');
  }

  /* ---------- export ---------- */

  /* ---------- doc tracking ---------- */

  let lastDocSig = '';
  function refreshDoc(info) {
    // Photoshop fires document notifications (select, etc.) very frequently.
    // Only react when the document IDENTITY or SIZE actually changed, otherwise
    // we would redraw the preview on every selection event and flicker forever.
    const sig = info ? (info.id + ':' + info.width + 'x' + info.height) : 'none';
    if (sig === lastDocSig) return;
    const prev = doc && doc.id;
    lastDocSig = sig;
    doc = info;
    const enabled = !!(doc && PS && PS.available);
    $('applyBtn').disabled = !enabled;
    if (!doc) {
      $('docInfo').textContent = T('doc.none');
      setStatus(T('status.openDoc'));
    } else {
      if (doc.id !== prev) gridLayerId = null;
      $('docInfo').textContent = `${doc.title} · ${doc.width}×${doc.height}`;
      setStatus(T('status.ready'));
    }
    fitPreviewBox();
    drawPreview();
  }

  /* ---------- sp-dropdown helpers ---------- */

  function ddItems(dd) { return dd ? Array.from(dd.querySelectorAll('sp-menu-item')) : []; }
  function ddValue(dd) {
    if (!dd) return '';
    const items = ddItems(dd);
    const i = typeof dd.selectedIndex === 'number' && dd.selectedIndex >= 0 ? dd.selectedIndex : -1;
    if (i >= 0 && items[i]) return items[i].getAttribute('value');
    return items[0] ? items[0].getAttribute('value') : '';
  }
  function ddSet(dd, value) {
    if (!dd) return;
    const idx = ddItems(dd).findIndex(it => it.getAttribute('value') === String(value));
    if (idx >= 0) { try { dd.selectedIndex = idx; } catch (_) {} }
  }

  /* ---------- presets ---------- */

  const presetValues = {
    free: { projection: 'perspective' },
    one: { yaw: 0, pitch: 0, roll: 0, projection: 'perspective' },
    two: { yaw: 43, pitch: 0, roll: 0, projection: 'perspective' },
    three: { yaw: 43, pitch: 20, roll: 0, projection: 'perspective' },
    five: { yaw: 0, pitch: 0, roll: 0, projection: 'fisheye', focalLength: 10, distortion: 100 },
    ortho: { projection: 'ortho' }
  };
  const gridProfiles = {
    clean: { gridStyle:'rays', showGrid:true, xLines:true, yLines:true, zLines:true, showHorizon:true, showVps:true, showAxes:false },
    study: { gridStyle:'rays', showGrid:true, xLines:true, yLines:true, zLines:true, showHorizon:true, showVps:true, showAxes:true },
    lines: { gridStyle:'rays', showGrid:true, xLines:true, yLines:true, zLines:true, showHorizon:false, showVps:false, showAxes:false }
  };

  // Populate the depth PF selector from the current model axes.
  function refreshDepthAxisOptions() {
    const dd = $('depthAxis'); if (!dd) return;
    const menu = dd.querySelector('sp-menu'); if (!menu) return;
    const axes = state.showCube ? G.modelAxes(state, docW(), docH()) : [];
    menu.innerHTML = '<sp-menu-item value="">' + T('depth.pick') + '</sp-menu-item>' +
      axes.map(a => `<sp-menu-item value="${a.axis}|${a.label}">${a.label} · ${a.axis.toUpperCase()}</sp-menu-item>`).join('');
  }

  function modelFramingPoints() {
    const name = state.referenceModel, scale = state.boxSize || 1;
    const pos = state.modelPositions[name] || [0,0,0];
    const pts = [];
    for (const e of ReferenceModels.modelBoxes(name)) {
      for (const v of [e.a, e.b]) pts.push([v[0]*scale+pos[0], v[1]*scale+pos[1], v[2]*scale+pos[2]]);
    }
    return pts;
  }

  /* ---------- events (delegated where controls live in tabs) ---------- */

  const tabScroll = document.querySelector('.tab-scroll');
  const isHex = v => /^#[0-9a-fA-F]{6}$/.test(v);

  // UXP range inputs and sp-dropdowns do NOT reliably bubble events to a parent,
  // so delegation fails. We attach listeners directly to each control, and
  // re-run this every time a tab is mounted (its controls are fresh in the DOM).
  function isCheckbox(el) { return el.tagName === 'SP-CHECKBOX' || el.type === 'checkbox'; }

  function wireControls() {
    // Spectrum widgets (sp-slider, sp-checkbox) with data-key. These fire
    // 'input'/'change' reliably, unlike the HTML range input in UXP.
    document.querySelectorAll('[data-key]').forEach(el => {
      if (el._wired) return;
      el._wired = true;
      const key = el.dataset.key;
      const apply = () => {
        if (isCheckbox(el)) change({ [key]: !!el.checked });
        else {
          const num = Number(el.value);
          if (Number.isFinite(num)) change({ [key]: G.clamp(num, ...(G.bounds[key] || [-Infinity, Infinity])) });
        }
      };
      // 'input' fires continuously (dragging the slider) -> low-res fast preview.
      // 'change' fires when released -> crisp final preview.
      el.addEventListener('input', () => { interacting = true; apply(); });
      el.addEventListener('change', () => { interacting = false; apply(); });
    });
    // Guide-count number fields (type the exact number of guides).
    [['xCountNum','xCount'],['zCountNum','zCount'],['yCountNum','yCount']].forEach(([id, key]) => {
      const el = $(id); if (!el || el._wired) return; el._wired = true;
      el.addEventListener('change', () => {
        const v = Math.round(Number(el.value));
        if (Number.isFinite(v)) change({ [key]: G.clamp(v, 1, 64) });
      });
    });
    // XYZ number fields.
    ['posX','posY','posZ'].forEach((id, idx) => {
      const el = $(id); if (!el || el._wired) return; el._wired = true;
      el.addEventListener('change', () => {
        const v = Number(el.value); if (!Number.isFinite(v)) return;
        const pos = [...(state.modelPositions[state.referenceModel] || [0,0,0])];
        pos[idx] = G.clamp(v, -100, 100);
        change({ modelPositions: { ...state.modelPositions, [state.referenceModel]: pos } });
      });
    });
    // Dropdowns.
    wireDd('preset', v => change({ ...presetValues[v], preset: v }));
    // "Nenhum" (value vazio/none) desliga o modelo; qualquer modelo liga.
    wireDd('referenceModel', v => {
      if (!v || v === 'none') change({ showCube: false });
      else change({ referenceModel: v, showCube: true });
    });
    wireDd('gridStyle', v => change({ gridStyle: v }));
    wireDd('lensPreset', v => { if (v) change({ focalLength: Number(v) }); });
    // Line-style presets: gray / black / colored (by vanishing point).
    wireDd('colorStyle', v => {
      if (v === 'gray') change({ showAxes: false, color: '#414447' });
      else if (v === 'black') change({ showAxes: false, color: '#111111' });
      else if (v === 'color') change({ showAxes: true });
    });
    // Buttons.
    wireBtn('resetBtn', () => {
      const p = {};
      ['yaw','pitch','roll','focalLength','distortion','distance','panX','panY','viewZoom','boxSize'].forEach(k => p[k] = G.defaults[k]);
      change({ ...p, ...(presetValues[state.preset] || {}), modelPositions: G.defaults.modelPositions });
      setStatus(T('status.sceneReset'), 'ok');
    });
    // Model opacity slider (UI-only; not part of the geometry state).
    const mo = $('modelOpacity');
    if (mo && !mo._wired) {
      mo._wired = true;
      const h = () => { const v = Number(mo.value); if (Number.isFinite(v)) { modelOpacity = G.clamp(v, 10, 100) / 100; drawPreview(); } };
      mo.addEventListener('input', () => { interacting = true; h(); });
      mo.addEventListener('change', () => { interacting = false; h(); });
    }
    // Orthographic axis angles (numeric yaw/pitch) + quick presets.
    const yawDeg = $('yawDeg'), pitchDeg = $('pitchDeg');
    if (yawDeg && !yawDeg._wired) {
      yawDeg._wired = true;
      yawDeg.addEventListener('change', () => { const v = Number(yawDeg.value); if (Number.isFinite(v)) change({ yaw: G.clamp(v, -180, 180) }); });
    }
    if (pitchDeg && !pitchDeg._wired) {
      pitchDeg._wired = true;
      pitchDeg.addEventListener('change', () => { const v = Number(pitchDeg.value); if (Number.isFinite(v)) change({ pitch: G.clamp(v, -89, 89) }); });
    }
    wireDd('orthoPreset', v => {
      if (v === 'custom') return;
      // Axonometric standards (camera yaw/pitch producing each projection):
      //  iso        - equal foreshortening on all axes (edges 30° from horizontal)
      //  dimetric   - two axes equal, one different
      //  trimetric  - all three axes different
      const p = {
        iso:       [45, 35.264], // edges 30°/30°
        dimetric:  [20.5, 19.5], // edges ~7°/42° (classic dimetric)
        trimetric: [35, 25],     // three distinct axis angles
        front:     [0, 0],
        right:     [90, 0],
        top:       [0, 89]
      }[v] || [45, 35.264];
      // Isométrica, dimétrica e trimétrica só existem na projeção ortográfica:
      // escolher uma delas já troca a perspectiva para Ortográfica.
      const axonometric = v === 'iso' || v === 'dimetric' || v === 'trimetric';
      change(axonometric ? { ...presetValues.ortho, preset: 'ortho', yaw: p[0], pitch: p[1] } : { yaw: p[0], pitch: p[1] });
    });
    wireBtn('centerModelBtn', () => change({ modelPositions: { ...state.modelPositions, [state.referenceModel]: [0,0,0] } }));
    wireBtn('modelAdvancedBtn', () => {
      const button = $('modelAdvancedBtn'), body = $('modelAdvanced');
      const open = button.getAttribute('aria-expanded') !== 'true';
      button.setAttribute('aria-expanded', String(open));
      if (open) body.removeAttribute('hidden'); else body.setAttribute('hidden', '');
    });
    wireBtn('fitModelBtn', () => {
      if (!state.showCube) { setStatus(T('status.enableShow')); return; }
      const distance = G.framingDistance(state, state, modelFramingPoints(), 4);
      change({ distance, panX: 0, panY: 0 }); setStatus(T('status.modelFit'), 'ok');
    });
    // Movement mode: orbit (default) / plane / depth. Shows the PF selector for depth.
    wireDd('moveMode', v => {
      moveMode = v;
      const row = $('depthAxisRow');
      if (row) { if (v === 'depth') row.removeAttribute('hidden'); else row.setAttribute('hidden', ''); }
      refreshDepthAxisOptions();
    });
    wireDd('depthAxis', v => {
      if (!v) { depthAxisSel = null; return; }
      const [axis, label] = v.split('|');
      depthAxisSel = { axis, label };
    });
  }
  function wireDd(id, fn) {
    const dd = $(id); if (!dd || dd._wired) return; dd._wired = true;
    dd.addEventListener('change', () => fn(ddValue(dd)));
  }
  function wireBtn(id, fn) {
    const b = $(id); if (!b || b._wired) return; b._wired = true;
    b.addEventListener('click', fn);
  }

  /* ---------- tabs (mount only active) ---------- */

  const tabBodies = {};
  document.querySelectorAll('[data-tabbody]').forEach(body => {
    const name = body.dataset.tabbody;
    const ph = document.createComment('tab-' + name);
    body.parentNode.insertBefore(ph, body.nextSibling);
    tabBodies[name] = { body, ph, mounted: true };
    body.removeAttribute('hidden');
  });
  function mountTab(name) {
    Object.entries(tabBodies).forEach(([n, t]) => {
      if (n === name && !t.mounted) { t.ph.parentNode.insertBefore(t.body, t.ph); t.mounted = true; }
      else if (n !== name && t.mounted) { t.body.parentNode.removeChild(t.body); t.mounted = false; }
    });
    // Re-mounted controls are fresh DOM nodes: (re)attach their listeners and
    // reapply the current language (the HTML markup is in Portuguese).
    wireControls();
    if (I18N) I18N.applyStatic(tabScroll);
    syncControls();
    tabScroll.scrollTop = 0;
    document.querySelectorAll('[data-tab]').forEach(button => button.setAttribute('aria-selected', String(button.dataset.tab === name)));
  }
  document.querySelectorAll('[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-tab]').forEach(b => b.classList.toggle('active', b === btn));
      mountTab(btn.dataset.tab);
    });
  });
  mountTab('camera');

  /* ---------- footer actions ---------- */

  $('applyBtn').addEventListener('click', () => applyToLayer().catch(reportError));

  /* ---------- drag on preview to orbit ---------- */

  // Left drag = orbit; right drag (or button 2) = pan the framing.
  preview.addEventListener('contextmenu', e => e.preventDefault());
  let drag = null;
  preview.addEventListener('pointerdown', e => {
    const pan = (e.button === 2 || e.button === 1);
    // Shift + Alt + arrastar = mover o modelo livremente no plano da tela.
    const model = !pan && e.shiftKey && e.altKey;
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, pan, model };
    if (model) setStatus(state.showCube ? T('status.modelMoving') : T('status.enableModel'));
    interacting = true;
    try { preview.setPointerCapture(e.pointerId); } catch (_) {}
    e.preventDefault();
  });
  // Map a pointer event to document coordinates inside the preview image.
  function pointerToDoc(e) {
    const rect = preview.getBoundingClientRect();
    const aspect = docW() / docH();
    const width = Math.min(rect.width, rect.height * aspect), height = width / aspect;
    const nx = (e.clientX - rect.left - (rect.width - width) / 2) / width;
    const ny = (e.clientY - rect.top - (rect.height - height) / 2) / height;
    return [nx * docW(), ny * docH()];
  }
  preview.addEventListener('pointermove', e => {
    if (!drag || drag.id !== e.pointerId) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    drag.x = e.clientX; drag.y = e.clientY;
    if (!dx && !dy) return;
    const w = docW(), h = docH();
    // Right/middle button always pans the framing, regardless of move mode.
    if (drag.pan) {
      change({ panX: state.panX + dx / (preview.clientWidth || 300) * 100,
               panY: state.panY + dy / (preview.clientHeight || 150) * 100 });
      return;
    }
    if (drag.model || (e.shiftKey && e.altKey)) {
      if (!state.showCube) return;
      const next = G.moveModel(state, dx * w / (preview.clientWidth || w), dy * h / (preview.clientHeight || h), w, h);
      change({ modelPositions: next.modelPositions });
      return;
    }
    if (moveMode === 'plane' && state.showCube) {
      const next = G.moveModel(state, dx * w / (preview.clientWidth || w), dy * h / (preview.clientHeight || h), w, h);
      change({ modelPositions: next.modelPositions });
    } else if (moveMode === 'depth' && state.showCube && depthAxisSel) {
      const target = pointerToDoc(e);
      const next = G.moveModelOnAxis(state, depthAxisSel.axis, target, w, h, 0.2);
      change({ modelPositions: next.modelPositions });
    } else {
      change(G.orbit(state, dx, dy, w, h, 0.4));
    }
  });
  const endDrag = e => {
    if (!drag || drag.id !== e.pointerId) return;
    try { preview.releasePointerCapture(drag.id); } catch (_) {}
    drag = null;
    interacting = false;
    drawPreview(); // crisp final render
  };
  preview.addEventListener('pointerup', endDrag);
  preview.addEventListener('pointercancel', endDrag);

  // Botão flutuante: amplia o preview para o painel inteiro e volta.
  const expandBtn = $('expandBtn');
  function setPreviewMax(on) {
    previewMax = !!on;
    document.querySelector('.panel').classList.toggle('preview-max', previewMax);
    const label = previewMax ? T('preview.collapse') : T('preview.expand');
    if (expandBtn) {
      expandBtn.title = label;
      expandBtn.setAttribute('aria-label', label);
      expandBtn.setAttribute('aria-pressed', String(previewMax));
    }
    fitPreviewBox();
    drawPreview();
  }
  if (expandBtn) {
    // Não deixa o clique no botão virar um arraste de órbita no preview.
    expandBtn.addEventListener('pointerdown', e => { e.stopPropagation(); });
    expandBtn.addEventListener('click', e => { e.stopPropagation(); setPreviewMax(!previewMax); });
  }
  document.addEventListener('keydown', e => {
    if (previewMax && (e.key === 'Escape' || e.keyCode === 27)) { e.preventDefault(); setPreviewMax(false); }
  });

  // Shift + Alt + Z = devolve o modelo ao centro (mesma ação do botão "Centralizar").
  document.addEventListener('keydown', e => {
    const isZ = e.code === 'KeyZ' || e.keyCode === 90 || (e.key && e.key.toLowerCase() === 'z');
    if (!isZ || !e.shiftKey || !e.altKey) return;
    e.preventDefault();
    if (e.stopPropagation) e.stopPropagation();
    change({ modelPositions: { ...state.modelPositions, [state.referenceModel]: [0,0,0] } });
    setStatus(T('status.modelCentered'));
  }, true);

  // Orientation cube: dragging always orbits the camera.
  const cubeEl = $('cube');
  if (cubeEl) {
    let cd = null;
    cubeEl.addEventListener('pointerdown', e => { cd = { id: e.pointerId, x: e.clientX, y: e.clientY }; interacting = true; try { cubeEl.setPointerCapture(e.pointerId); } catch (_) {} e.preventDefault(); });
    cubeEl.addEventListener('pointermove', e => {
      if (!cd || cd.id !== e.pointerId) return;
      const dx = e.clientX - cd.x, dy = e.clientY - cd.y; cd.x = e.clientX; cd.y = e.clientY;
      if (dx || dy) change(G.orbit(state, dx, dy, docW(), docH(), 0.6));
    });
    const endCube = e => { if (!cd || cd.id !== e.pointerId) return; try { cubeEl.releasePointerCapture(cd.id); } catch (_) {} cd = null; interacting = false; drawPreview(); };
    cubeEl.addEventListener('pointerup', endCube);
    cubeEl.addEventListener('pointercancel', endCube);
  }

  // Scroll wheel over the preview = scene zoom (viewZoom); Shift + wheel = lens
  // focal length (mm). We stop the event hard so it does not scroll the panel.
  let wheelSettle = null;
  function onWheel(e) {
    if (e.preventDefault) e.preventDefault();
    if (e.stopPropagation) e.stopPropagation();
    if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
    // Normalize delta across wheel / mousewheel / DOMMouseScroll. With Shift the
    // system usually turns the wheel into horizontal scroll, hence deltaX.
    let delta = 0;
    if (typeof e.deltaY === 'number' && e.deltaY !== 0) delta = e.deltaY;
    else if (typeof e.deltaX === 'number' && e.deltaX !== 0) delta = e.deltaX;
    else if (typeof e.wheelDelta === 'number' && e.wheelDelta !== 0) delta = -e.wheelDelta;
    else if (typeof e.detail === 'number' && e.detail !== 0) delta = e.detail * 40;
    if (!delta) return false;
    const factor = Math.exp(-delta * 0.0015);
    interacting = true;
    if (e.shiftKey) {
      // Roda para cima = lente mais longa. Passo mínimo de 1 mm para nunca travar.
      if (state.projection === 'ortho') setStatus(T('status.orthoNoLens'));
      else {
        const now = Math.round(state.focalLength);
        let mm = Math.round(G.clamp(state.focalLength * factor, 10, 300));
        if (mm === now) mm = G.clamp(now + (delta < 0 ? 1 : -1), 10, 300);
        change({ focalLength: mm });
        setStatus(T('status.focal', { mm: mm }));
      }
    } else {
      change({ viewZoom: G.clamp(state.viewZoom * factor, 25, 300) });
    }
    clearTimeout(wheelSettle);
    wheelSettle = setTimeout(() => { interacting = false; drawPreview(); }, 160);
    return false;
  }
  // Register on both event names (UXP may emit 'mousewheel' rather than 'wheel')
  // and also at the document level filtered to the preview, since UXP sometimes
  // only delivers wheel events on the document, not on the element.
  let hoveringPreview = false;
  preview.addEventListener('pointerenter', () => { hoveringPreview = true; });
  preview.addEventListener('pointerleave', () => { hoveringPreview = false; });

  ['wheel', 'mousewheel', 'DOMMouseScroll'].forEach(evt => {
    preview.addEventListener(evt, onWheel, { passive: false, capture: true });
    document.addEventListener(evt, e => {
      // If the pointer is over the preview, treat document-level wheel as zoom.
      if (hoveringPreview || e.target === preview || (e.target.closest && e.target.closest('#preview'))) {
        onWheel(e);
      }
    }, { passive: false, capture: true });
  });

  window.addEventListener('resize', () => { fitPreviewBox(); drawPreview(); });

  /* ---------- idioma (PT/EN) ---------- */

  function applyLang() {
    if (I18N) I18N.applyStatic(document);
    const lb = $('langBtn');
    if (lb && I18N) { lb.textContent = I18N.t('lang.toggle'); lb.title = 'Português / English'; }
    // Textos derivados do estado (ex.: rótulo do botão de ampliar) e opções de PF.
    if (typeof setPreviewMax === 'function') setPreviewMax(previewMax);
    if (typeof refreshDepthAxisOptions === 'function') refreshDepthAxisOptions();
    syncControls();
  }
  if (I18N) {
    I18N.applyStatic(document);
    const langBtn = $('langBtn');
    if (langBtn) {
      langBtn.textContent = I18N.t('lang.toggle');
      langBtn.addEventListener('click', () => { I18N.toggle(); applyLang(); });
    }
  }

  /* ---------- init ---------- */

  syncControls();
  fitPreviewBox();
  if (PS && PS.available) {
    PS.onDocumentChanged(refreshDoc);
    refreshDoc(PS.activeDocumentInfo());
  } else {
    $('applyBtn').disabled = true;
    $('docInfo').textContent = T('doc.dev');
    setStatus(T('status.localPreview'));
    drawPreview();
  }

  /* ---------- aviso de atualização (padrão Xuimart) ---------- */

  const UPD = (typeof window !== 'undefined' ? window : globalThis).PGUpdate;
  if (UPD) {
    const installed = UPD.localVersion();
    $('versionLabel').textContent = installed ? 'Perspective Grid v' + installed : 'Perspective Grid (dev)';
    // O aviso ocupa espaço no topo: recalcula o preview quando ele entra ou sai.
    const updateOptions = manual => ({ manual, onStatus: setStatus, onLayout: () => { fitPreviewBox(); drawPreview(); } });
    $('checkUpdateBtn').addEventListener('click', () => { UPD.check(updateOptions(true)); });
    // Check automático alguns segundos depois de abrir, para nunca atrasar o carregamento.
    setTimeout(() => { UPD.check(updateOptions(false)); }, 4000);
  }
})();
