/*
 * Pure-JS line rasterizer. The UXP canvas cannot return pixels (getImageData is
 * not implemented), so we rasterize the grid lines ourselves into an RGBA
 * Uint8Array that the Imaging API can consume directly.
 *
 * Anti-aliased lines via Xiaolin Wu, extended to arbitrary thickness by drawing
 * the line as a filled capsule (distance-to-segment coverage). This is O(pixels
 * touched) rather than O(width*height), so it stays cheap for thin grids.
 */
(function (root) {
  'use strict';

  function hexToRgb(hex) {
    const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || '');
    if (!m) return [0, 0, 0];
    return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
  }

  // Create a transparent RGBA buffer.
  function createBuffer(width, height) {
    return new Uint8Array(width * height * 4);
  }

  // Alpha-over compositing of one pixel (straight alpha), with coverage in 0..1.
  function blend(buf, width, height, x, y, r, g, b, a) {
    if (x < 0 || y < 0 || x >= width || y >= height || a <= 0) return;
    const i = (y * width + x) * 4;
    const sa = a;
    const da = buf[i + 3] / 255;
    const outA = sa + da * (1 - sa);
    if (outA <= 0) { buf[i] = buf[i + 1] = buf[i + 2] = buf[i + 3] = 0; return; }
    buf[i]     = Math.round((r * sa + buf[i]     * da * (1 - sa)) / outA);
    buf[i + 1] = Math.round((g * sa + buf[i + 1] * da * (1 - sa)) / outA);
    buf[i + 2] = Math.round((b * sa + buf[i + 2] * da * (1 - sa)) / outA);
    buf[i + 3] = Math.round(outA * 255);
  }

  // Distance from point (px,py) to segment (ax,ay)-(bx,by).
  function distToSegment(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy;
    let t = len2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const cx = ax + t * dx, cy = ay + t * dy;
    return Math.hypot(px - cx, py - cy);
  }

  // Rasterize one thick, anti-aliased segment.
  function drawSegment(buf, width, height, ax, ay, bx, by, thickness, r, g, b, alpha, dashState) {
    const half = Math.max(0.5, thickness / 2);
    const pad = half + 1;
    const minX = Math.max(0, Math.floor(Math.min(ax, bx) - pad));
    const maxX = Math.min(width - 1, Math.ceil(Math.max(ax, bx) + pad));
    const minY = Math.max(0, Math.floor(Math.min(ay, by) - pad));
    const maxY = Math.min(height - 1, Math.ceil(Math.max(ay, by) + pad));
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const d = distToSegment(x + 0.5, y + 0.5, ax, ay, bx, by);
        // Coverage: full inside (half - 0.5), fading to 0 over one pixel at the edge.
        let cov = half - d + 0.5;
        if (cov <= 0) continue;
        if (cov > 1) cov = 1;
        blend(buf, width, height, x, y, r, g, b, cov * alpha);
      }
    }
  }

  // Split a polyline into dashed pieces if dash is set; returns array of segments.
  function segmentsForLine(points, dash) {
    const segs = [];
    if (!dash || !dash.length) {
      for (let i = 1; i < points.length; i++) segs.push([points[i - 1], points[i]]);
      return segs;
    }
    const pattern = dash;
    let di = 0, remaining = pattern[0], drawing = true;
    for (let i = 1; i < points.length; i++) {
      let [x0, y0] = points[i - 1];
      const [x1, y1] = points[i];
      let segLen = Math.hypot(x1 - x0, y1 - y0);
      const ux = (x1 - x0) / (segLen || 1), uy = (y1 - y0) / (segLen || 1);
      while (segLen > 0) {
        const step = Math.min(remaining, segLen);
        const nx = x0 + ux * step, ny = y0 + uy * step;
        if (drawing) segs.push([[x0, y0], [nx, ny]]);
        x0 = nx; y0 = ny;
        segLen -= step;
        remaining -= step;
        if (remaining <= 1e-6) { di = (di + 1) % pattern.length; remaining = pattern[di]; drawing = !drawing; }
      }
    }
    return segs;
  }

  /*
   * Render the geometry-core line list into an RGBA Uint8Array.
   * lines: output of PerspectiveGeometry.projectedLines(state, width, height).
   * Returns { data, width, height }.
   */
  function renderLines(lines, width, height) {
    const buf = createBuffer(width, height);
    const scale = width / 1600;
    for (const line of lines) {
      const [r, g, b] = hexToRgb(line.color);
      const thickness = Math.max(0.5, line.width * scale);
      const alpha = line.opacity == null ? 1 : line.opacity;
      const dash = (line.dash || []).map(v => v * scale);
      const segs = segmentsForLine(line.points, dash);
      for (const [a, c] of segs) {
        drawSegment(buf, width, height, a[0], a[1], c[0], c[1], thickness, r, g, b, alpha);
      }
    }
    return { data: buf, width, height };
  }

  /* ---------- minimal PNG encoder (RGBA, no external deps) ---------- */

  function crc32(buf) {
    let c, tab = crc32.tab;
    if (!tab) {
      tab = crc32.tab = [];
      for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; tab[n] = c; }
    }
    let crc = 0xffffffff;
    for (let i = 0; i < buf.length; i++) crc = tab[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  }

  // Adler-32 for the zlib wrapper.
  function adler32(buf) {
    let a = 1, b = 0;
    for (let i = 0; i < buf.length; i++) { a = (a + buf[i]) % 65521; b = (b + a) % 65521; }
    return ((b << 16) | a) >>> 0;
  }

  // Store-only (uncompressed) zlib stream. Simple and dependency-free.
  function zlibStore(data) {
    const blocks = [];
    let pos = 0;
    const MAX = 65535;
    while (pos < data.length) {
      const len = Math.min(MAX, data.length - pos);
      const last = pos + len >= data.length ? 1 : 0;
      const header = new Uint8Array(5);
      header[0] = last;
      header[1] = len & 0xff; header[2] = (len >>> 8) & 0xff;
      header[3] = ~len & 0xff; header[4] = (~len >>> 8) & 0xff;
      blocks.push(header, data.subarray(pos, pos + len));
      pos += len;
    }
    const body = concat(blocks);
    const out = new Uint8Array(2 + body.length + 4);
    out[0] = 0x78; out[1] = 0x01; // zlib header
    out.set(body, 2);
    const ad = adler32(data);
    out[out.length - 4] = (ad >>> 24) & 0xff;
    out[out.length - 3] = (ad >>> 16) & 0xff;
    out[out.length - 2] = (ad >>> 8) & 0xff;
    out[out.length - 1] = ad & 0xff;
    return out;
  }

  function concat(arrays) {
    let total = 0;
    for (const a of arrays) total += a.length;
    const out = new Uint8Array(total);
    let o = 0;
    for (const a of arrays) { out.set(a, o); o += a.length; }
    return out;
  }

  function chunk(type, data) {
    const len = new Uint8Array(4);
    len[0] = (data.length >>> 24) & 0xff; len[1] = (data.length >>> 16) & 0xff;
    len[2] = (data.length >>> 8) & 0xff; len[3] = data.length & 0xff;
    const typeBytes = new Uint8Array([type.charCodeAt(0), type.charCodeAt(1), type.charCodeAt(2), type.charCodeAt(3)]);
    const crc = crc32(concat([typeBytes, data]));
    const crcBytes = new Uint8Array(4);
    crcBytes[0] = (crc >>> 24) & 0xff; crcBytes[1] = (crc >>> 16) & 0xff;
    crcBytes[2] = (crc >>> 8) & 0xff; crcBytes[3] = crc & 0xff;
    return concat([len, typeBytes, data, crcBytes]);
  }

  // Encode a straight-alpha RGBA Uint8Array to a PNG ArrayBuffer.
  function encodePng(rgba, width, height) {
    const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
    const ihdr = new Uint8Array(13);
    ihdr[0] = (width >>> 24) & 0xff; ihdr[1] = (width >>> 16) & 0xff; ihdr[2] = (width >>> 8) & 0xff; ihdr[3] = width & 0xff;
    ihdr[4] = (height >>> 24) & 0xff; ihdr[5] = (height >>> 16) & 0xff; ihdr[6] = (height >>> 8) & 0xff; ihdr[7] = height & 0xff;
    ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0; // 8-bit RGBA
    // Add a filter byte (0 = none) at the start of each scanline.
    const stride = width * 4;
    const raw = new Uint8Array((stride + 1) * height);
    for (let y = 0; y < height; y++) {
      raw[y * (stride + 1)] = 0;
      raw.set(rgba.subarray(y * stride, y * stride + stride), y * (stride + 1) + 1);
    }
    const idat = zlibStore(raw);
    const png = concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', new Uint8Array(0))]);
    return png.buffer;
  }

  // Fill a convex/simple polygon (array of [x,y]) into the RGBA buffer using a
  // scanline fill. Used to render solid model faces (painter's order handled by
  // the caller). alpha in 0..1.
  function fillPolygon(buf, width, height, pts, r, g, b, alpha) {
    if (!pts || pts.length < 3) return;
    let minY = Infinity, maxY = -Infinity;
    for (const p of pts) { if (p[1] < minY) minY = p[1]; if (p[1] > maxY) maxY = p[1]; }
    minY = Math.max(0, Math.floor(minY));
    maxY = Math.min(height - 1, Math.ceil(maxY));
    for (let y = minY; y <= maxY; y++) {
      const yc = y + 0.5;
      const xs = [];
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const a = pts[i], c = pts[j];
        if ((a[1] <= yc && c[1] > yc) || (c[1] <= yc && a[1] > yc)) {
          xs.push(a[0] + (yc - a[1]) / (c[1] - a[1]) * (c[0] - a[0]));
        }
      }
      xs.sort((p, q) => p - q);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const x0 = Math.max(0, Math.round(xs[k])), x1 = Math.min(width - 1, Math.round(xs[k + 1]));
        for (let x = x0; x <= x1; x++) blend(buf, width, height, x, y, r, g, b, alpha);
      }
    }
  }

  root.GridRaster = { renderLines, hexToRgb, encodePng, fillPolygon, hexToRgb };
})(typeof window !== 'undefined' ? window : globalThis);
