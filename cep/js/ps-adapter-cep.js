/*
 * Adaptador do Photoshop para a versão CEP (Photoshop CC 2018 em diante).
 *
 * Mesma interface do ps-adapter.js do UXP: available, activeDocumentInfo,
 * onDocumentChanged e applyGrid. O CEP não tem a Imaging API, então a grade vira
 * um PNG temporário (gravado pelo Node do CEP) que o host.jsx abre e duplica
 * para o documento como a camada "Perspective Grid".
 *
 * O CEP também não avisa quando o documento muda, então o adaptador consulta o
 * documento ativo a cada segundo; o painel já ignora respostas repetidas.
 */
(function (root) {
  'use strict';

  const host = root.__adobe_cep__;
  // Com --mixed-context o require do Node é global; sem ele, fica em cep_node.
  const nodeRequire = typeof require === 'function' ? require
    : (root.cep_node && typeof root.cep_node.require === 'function' ? root.cep_node.require : null);
  const available = !!(host && typeof host.evalScript === 'function' && nodeRequire);
  const LAYER_NAME = 'Perspective Grid';
  const POLL_MS = 1000;

  function evalScript(code) {
    return new Promise(resolve => host.evalScript(code, result => resolve(result)));
  }

  /* ---------- documento ativo ---------- */

  let lastInfo = null, lastSig = null, polling = false;
  const listeners = [];

  function parseInfo(text) {
    try {
      const info = JSON.parse(text);
      return info && typeof info.id === 'number' ? info : null;
    } catch (_) { return null; }
  }

  function poll() {
    evalScript('pgDocInfo()').then(text => {
      const info = parseInfo(text);
      const sig = info ? [info.id, info.width, info.height, info.title].join('|') : 'none';
      if (sig === lastSig) return;
      lastSig = sig;
      lastInfo = info;
      listeners.slice().forEach(cb => { try { cb(info); } catch (_) {} });
    }, () => {}).then(() => setTimeout(poll, POLL_MS));
  }

  function activeDocumentInfo() { return lastInfo; }

  function onDocumentChanged(callback) {
    if (!available) return () => {};
    listeners.push(callback);
    if (!polling) { polling = true; poll(); }
    return () => {
      const i = listeners.indexOf(callback);
      if (i >= 0) listeners.splice(i, 1);
    };
  }

  /* ---------- PNG com o zlib do Node ---------- */

  // A grade é quase toda transparente: comprimida, o arquivo fica pequeno e o
  // Photoshop abre rápido mesmo em documentos grandes.
  let crcTable = null;
  function crc32(bytes) {
    if (!crcTable) {
      crcTable = new Int32Array(256);
      for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        crcTable[n] = c;
      }
    }
    let c = -1;
    for (let i = 0; i < bytes.length; i++) c = crcTable[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ -1) >>> 0;
  }

  function encodePng(rgba, width, height) {
    const Buffer = nodeRequire('buffer').Buffer;
    const zlib = nodeRequire('zlib');
    const chunk = (type, data) => {
      const len = Buffer.alloc(4);
      len.writeUInt32BE(data.length, 0);
      const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
      const crc = Buffer.alloc(4);
      crc.writeUInt32BE(crc32(body), 0);
      return Buffer.concat([len, body, crc]);
    };
    const stride = width * 4;
    const raw = Buffer.alloc((stride + 1) * height); // byte de filtro 0 em cada linha
    const src = Buffer.from(rgba.buffer, rgba.byteOffset, rgba.byteLength);
    for (let y = 0; y < height; y++) src.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8; ihdr[9] = 6; // 8 bits, RGBA
    return Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      chunk('IHDR', ihdr),
      chunk('IDAT', zlib.deflateSync(raw, { level: 3 })),
      chunk('IEND', Buffer.alloc(0))
    ]);
  }

  /* ---------- aplicar na camada ---------- */

  // rgba: Uint8Array width*height*4, alfa direto. Retorna { layerID, created }.
  async function applyGrid(rgba, width, height, existingLayerId) {
    if (!available) throw new Error('Photoshop indisponível: rodando fora do CEP.');
    if (rgba.length !== width * height * 4) {
      throw new Error('Buffer com tamanho inesperado para as dimensões do documento.');
    }
    const fs = nodeRequire('fs'), os = nodeRequire('os'), path = nodeRequire('path');
    const file = path.join(os.tmpdir(), 'perspective-grid-' + Date.now() + '.png');
    fs.writeFileSync(file, encodePng(rgba, width, height));
    try {
      const id = existingLayerId == null ? 'null' : String(Number(existingLayerId));
      const text = await evalScript('pgApplyGrid(' + JSON.stringify(file) + ',' + id + ')');
      let result = null;
      try { result = JSON.parse(text); } catch (_) {}
      if (!result) throw new Error('O Photoshop não respondeu como esperado. Feche e abra o painel e tente de novo.');
      if (result.error) throw new Error(result.error);
      return { layerID: result.layerID, created: !!result.created };
    } finally {
      try { fs.unlinkSync(file); } catch (_) {}
    }
  }

  root.PSAdapter = {
    available,
    LAYER_NAME,
    activeDocumentInfo,
    applyGrid,
    onDocumentChanged,
    encodePreview: async () => null,
    _encodePng: encodePng // usado só nos testes do build
  };
})(typeof window !== 'undefined' ? window : globalThis);
