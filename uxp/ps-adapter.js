/*
 * Photoshop adapter (UXP). Bridges the shared geometry core to a pixel layer.
 *
 * Option A: render the grid into an RGBA buffer at the document's real size and
 * write it to a dedicated "Perspective Grid" layer via the Imaging API, inside
 * executeAsModal. Every apply is one history transaction.
 *
 * This module is defensive: if it is loaded outside a Photoshop UXP host (for
 * example the browser during development), it exposes `available = false` and
 * every host call rejects with a clear message instead of throwing on require.
 */
(function (root) {
  'use strict';

  let photoshop = null, imaging = null, core = null, app = null;
  let available = false;
  try {
    photoshop = require('photoshop');
    imaging = photoshop.imaging;
    core = photoshop.core;
    app = photoshop.app;
    available = !!(imaging && core && app);
  } catch (_) {
    available = false;
  }

  const LAYER_NAME = 'Perspective Grid';

  function requireHost() {
    if (!available) throw new Error('Photoshop indisponível: rodando fora do host UXP.');
  }

  // The active document's pixel dimensions. These are the real coordinates the
  // grid must be rendered at, not screen pixels or window zoom.
  function activeDocumentInfo() {
    if (!available || !app.activeDocument) return null;
    const doc = app.activeDocument;
    return { id: doc.id, width: doc.width, height: doc.height, title: doc.title };
  }

  // Find (or remember) the grid layer for a document. We never assume a layer by
  // name alone across calls; the panel holds the id once created.
  async function findGridLayerId(doc) {
    if (!doc) return null;
    const match = doc.layers.find(l => l.name === LAYER_NAME);
    return match ? match.id : null;
  }

  // Create an empty pixel layer to receive the grid. Runs inside a modal scope.
  async function createGridLayer(doc) {
    const layer = await doc.createLayer({ name: LAYER_NAME });
    return layer ? layer.id : null;
  }

  /*
   * Apply an RGBA buffer (Uint8, chunky, straight alpha, width*height*4) to the
   * grid layer of the active document. Creates the layer on first use.
   *
   * Returns { layerID, created }.
   */
  async function applyGrid(rgba, width, height, existingLayerId) {
    requireHost();
    const doc = app.activeDocument;
    if (!doc) throw new Error('Nenhum documento aberto.');
    if (rgba.length !== width * height * 4) {
      throw new Error('Buffer com tamanho inesperado para as dimensões do documento.');
    }

    let layerID = existingLayerId;
    let created = false;
    let imageData = null;

    await core.executeAsModal(async () => {
      // Resolve or create the target layer inside the modal transaction.
      if (layerID == null || !doc.layers.some(l => l.id === layerID)) {
        layerID = await findGridLayerId(doc);
      }
      if (layerID == null) {
        layerID = await createGridLayer(doc);
        created = true;
        if (layerID == null) throw new Error('Não foi possível criar a camada da grade.');
      }

      imageData = await imaging.createImageDataFromBuffer(rgba, {
        width, height, components: 4, chunky: true,
        colorSpace: 'RGB', colorProfile: 'sRGB IEC61966-2.1'
      });

      await imaging.putPixels({
        documentID: doc.id,
        layerID,
        imageData,
        replace: true,
        targetBounds: { left: 0, top: 0 },
        commandName: 'Atualizar grade de perspectiva'
      });
    }, { commandName: 'Perspective Grid' });

    // Release native memory as soon as the modal work is done.
    if (imageData && typeof imageData.dispose === 'function') imageData.dispose();
    return { layerID, created };
  }

  // Encode an opaque RGBA buffer to a JPEG data URL for use in an <img> preview.
  // Uses the Imaging API (the UXP canvas cannot do toDataURL reliably).
  // Encode an OPAQUE RGBA buffer to a JPEG data URL. JPEG has no alpha, so we
  // drop the alpha channel and build a 3-component RGB buffer for the encoder.
  async function encodePreview(rgba, width, height) {
    if (!available) return null;
    let imageData = null;
    try {
      const rgb = new Uint8Array(width * height * 3);
      for (let i = 0, j = 0; i < rgba.length; i += 4, j += 3) {
        rgb[j] = rgba[i]; rgb[j + 1] = rgba[i + 1]; rgb[j + 2] = rgba[i + 2];
      }
      imageData = await imaging.createImageDataFromBuffer(rgb, {
        width, height, components: 3, chunky: true,
        colorSpace: 'RGB', colorProfile: 'sRGB IEC61966-2.1'
      });
      const encoded = await imaging.encodeImageData({ imageData, base64: true });
      const base64 = typeof encoded === 'string' ? encoded : btoa(String.fromCharCode.apply(null, encoded));
      return 'data:image/jpeg;base64,' + base64;
    } finally {
      if (imageData && typeof imageData.dispose === 'function') imageData.dispose();
    }
  }

  root.PSAdapter = {
    available,
    LAYER_NAME,
    activeDocumentInfo,
    applyGrid,
    encodePreview,
    // Subscribe to document/selection changes so the panel can refresh doc size.
    onDocumentChanged(callback) {
      if (!available) return () => {};
      try {
        const listener = () => callback(activeDocumentInfo());
        photoshop.action.addNotificationListener(
          ['select', 'open', 'close', 'newDocument', 'imageSize', 'canvasSize'],
          listener
        );
        return () => {
          try { photoshop.action.removeNotificationListener(['select','open','close','newDocument','imageSize','canvasSize'], listener); } catch (_) {}
        };
      } catch (_) {
        return () => {};
      }
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
