/*
 * Reference models as wireframe boxes, ported 1:1 from the web prototype's
 * reference-scene.js. Every model there is built entirely from BoxGeometry
 * pieces, so we reproduce the exact same boxes (size, position, color) here and
 * draw them as edges with the shared projection. No Three.js / WebGL required.
 *
 * The only visual difference from the prototype is that faces are not shaded —
 * we draw box outlines. Geometry, layout and camera match exactly.
 */
(function (root) {
  'use strict';

  // 12 edges of a box centered at `pos` with full-size dimensions `size`.
  function boxEdges(size, pos, color) {
    const hx = size[0] / 2, hy = size[1] / 2, hz = size[2] / 2;
    const [px, py, pz] = pos;
    const v = [
      [px - hx, py - hy, pz - hz], [px + hx, py - hy, pz - hz],
      [px + hx, py + hy, pz - hz], [px - hx, py + hy, pz - hz],
      [px - hx, py - hy, pz + hz], [px + hx, py - hy, pz + hz],
      [px + hx, py + hy, pz + hz], [px - hx, py + hy, pz + hz]
    ];
    const idx = [
      [0,1],[1,2],[2,3],[3,0],
      [4,5],[5,6],[6,7],[7,4],
      [0,4],[1,5],[2,6],[3,7]
    ];
    return idx.map(([a, b]) => ({ a: v[a], b: v[b], color }));
  }

  // Table sub-assembly (matches reference-scene.js `table`).
  function tableBoxes(x = 0, y = 0, z = 0, scale = 1) {
    const boxes = [];
    boxes.push(...boxEdges([3.2 * scale, .18 * scale, 1.9 * scale], [x, y, z], '#b2c9cc'));
    for (const dx of [-1.3, 1.3]) for (const dz of [-.68, .68]) {
      boxes.push(...boxEdges([.16 * scale, 1.8 * scale, .16 * scale], [x + dx * scale, y - .96 * scale, z + dz * scale], '#667c85'));
    }
    return boxes;
  }

  // Standing figure for scale/perspective reference (plugin-only; not in the web
  // prototype). Blocky mannequin about 7.5 heads tall, built from boxes like the
  // other models. Spans y = -1 (soles) to +1 (top of head), the same height as
  // the 2x2x2 box, and faces +z: the nose and the toes mark the front.
  function personBoxes() {
    const skin = '#d9b8a0', shirt = '#8fa9b3', pants = '#5d6f7a', shoes = '#465259';
    const list = [];
    const box = (size, pos, color) => list.push({ size, pos, color });
    box([.19, .267, .23], [0, .867, 0], skin);            // head
    box([.04, .05, .035], [0, .84, .1325], skin);         // nose (front = +z)
    box([.09, .073, .09], [0, .6965, 0], skin);           // neck
    box([.44, .46, .24], [0, .43, 0], shirt);             // torso
    box([.40, .267, .235], [0, .0665, 0], pants);         // hips
    for (const s of [-1, 1]) {
      box([.10, .39, .11], [s * .275, .465, 0], shirt);   // upper arm
      box([.085, .33, .095], [s * .275, .105, 0], skin);  // forearm
      box([.065, .15, .09], [s * .275, -.135, 0], skin);  // hand
      box([.165, .466, .175], [s * .105, -.30, 0], pants); // thigh
      box([.13, .397, .14], [s * .105, -.7315, 0], pants); // shin
      box([.115, .07, .26], [s * .105, -.965, .05], shoes); // foot (toe forward)
    }
    return list;
  }

  // Build the full edge list for a model (before scale/position transforms).
  function modelBoxes(name) {
    const b = [];
    if (name === 'box') {
      b.push(...boxEdges([2, 2, 2], [0, 0, 0], '#b3c4cb'));
    } else if (name === 'table') {
      b.push(...tableBoxes(0, -.6, 0));
      b.push(...boxEdges([.65, .08, .45], [-.65, -.47, .05], '#d4b685'));
      b.push(...boxEdges([.26, .4, .26], [.7, -.32, -.35], '#dcdddd'));
    } else if (name === 'room') {
      b.push(...boxEdges([6, .16, 5], [0, -1.8, 0], '#b7c0bd'));
      b.push(...boxEdges([6, 3.3, .12], [0, -.08, -2.5], '#ccd5d6'));
      b.push(...boxEdges([.12, 3.3, 5], [-3, -.08, 0], '#c1cdd1'));
      b.push(...boxEdges([1.75, .45, 3.1], [-1.55, -1.42, -.3], '#6f9096'));
      b.push(...boxEdges([1.75, .18, 3.1], [-1.55, -1.11, -.3], '#e6e8df'));
      b.push(...boxEdges([1.3, .16, .6], [-1.55, -.94, -1.35], '#f0ebe2'));
      b.push(...tableBoxes(1.35, -.35, -1.45, .63));
      b.push(...boxEdges([.75, .08, .5], [1.2, -.23, -1.5], '#d4b685'));
      b.push(...boxEdges([.7, .65, .7], [1.4, -1.4, .2], '#bb9e87'));
      b.push(...boxEdges([.7, .75, .1], [1.4, -.85, .55], '#bb9e87'));
      b.push(...boxEdges([1.2, .9, .08], [.5, .7, -2.39], '#8babad'));
    } else if (name === 'person') {
      for (const p of personBoxes()) b.push(...boxEdges(p.size, p.pos, p.color));
    }
    return b;
  }

  // Return projected, clipped 2D segments (with color) for the selected model.
  // Applies uniform boxSize scale and model position, exactly like the prototype
  // (group.scale.setScalar(boxSize); group.position = modelPositions[model]).
  function modelSegments(G, state, width, height) {
    if (!state.showCube) return [];
    const name = state.referenceModel || 'box';
    const scale = state.boxSize || 1;
    const pos = (state.modelPositions && state.modelPositions[name]) || [0, 0, 0];
    const cam = G.camera(state, width, height);
    const out = [];
    for (const edge of modelBoxes(name)) {
      const a = [edge.a[0] * scale + pos[0], edge.a[1] * scale + pos[1], edge.a[2] * scale + pos[2]];
      const b = [edge.b[0] * scale + pos[0], edge.b[1] * scale + pos[1], edge.b[2] * scale + pos[2]];
      const seg = G.segment(a, b, cam);
      if (seg) out.push({ points: seg, color: edge.color });
    }
    return out;
  }

  // The 6 faces of a box (as index sets into its 8 corners) with a normal and a
  // relative shade (0..1) for simple flat shading.
  function boxFaceDefs() {
    // corners order: 0..7 as in boxEdges
    return [
      { ids: [0,1,2,3], shade: 0.72 }, // back  (-z)
      { ids: [4,5,6,7], shade: 0.92 }, // front (+z)
      { ids: [0,4,7,3], shade: 0.80 }, // left  (-x)
      { ids: [1,5,6,2], shade: 0.86 }, // right (+x)
      { ids: [3,7,6,2], shade: 1.00 }, // top   (+y)
      { ids: [0,4,5,1], shade: 0.62 }  // bottom(-y)
    ];
  }

  function boxCorners(size, pos) {
    const hx = size[0]/2, hy = size[1]/2, hz = size[2]/2;
    const [px,py,pz] = pos;
    return [
      [px-hx,py-hy,pz-hz],[px+hx,py-hy,pz-hz],[px+hx,py+hy,pz-hz],[px-hx,py+hy,pz-hz],
      [px-hx,py-hy,pz+hz],[px+hx,py-hy,pz+hz],[px+hx,py+hy,pz+hz],[px-hx,py+hy,pz+hz]
    ];
  }

  // Build the box list with corners + color (uses same pieces as modelBoxes).
  function modelBoxList(name) {
    // Reconstruct piece boxes with their size/pos/color from modelBoxes' edges
    // is lossy; instead we mirror the definitions here compactly.
    const list = [];
    const box = (size, pos, color) => list.push({ size, pos, color });
    const table = (x=0,y=0,z=0,s=1) => {
      box([3.2*s,.18*s,1.9*s],[x,y,z],'#b2c9cc');
      for (const dx of [-1.3,1.3]) for (const dz of [-.68,.68]) box([.16*s,1.8*s,.16*s],[x+dx*s,y-.96*s,z+dz*s],'#667c85');
    };
    if (name === 'box') box([2,2,2],[0,0,0],'#b3c4cb');
    else if (name === 'table') { table(0,-.6,0); box([.65,.08,.45],[-.65,-.47,.05],'#d4b685'); box([.26,.4,.26],[.7,-.32,-.35],'#dcdddd'); }
    else if (name === 'room') {
      box([6,.16,5],[0,-1.8,0],'#b7c0bd'); box([6,3.3,.12],[0,-.08,-2.5],'#ccd5d6'); box([.12,3.3,5],[-3,-.08,0],'#c1cdd1');
      box([1.75,.45,3.1],[-1.55,-1.42,-.3],'#6f9096'); box([1.75,.18,3.1],[-1.55,-1.11,-.3],'#e6e8df'); box([1.3,.16,.6],[-1.55,-.94,-1.35],'#f0ebe2');
      table(1.35,-.35,-1.45,.63); box([.75,.08,.5],[1.2,-.23,-1.5],'#d4b685'); box([.7,.65,.7],[1.4,-1.4,.2],'#bb9e87'); box([.7,.75,.1],[1.4,-.85,.55],'#bb9e87'); box([1.2,.9,.08],[.5,.7,-2.39],'#8babad');
    }
    else if (name === 'person') list.push(...personBoxes());
    return list;
  }

  function hexToRgb(hex) {
    const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || '');
    if (!m) return [128, 128, 128];
    return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
  }
  function shade(hex, f) {
    const [r,g,b] = hexToRgb(hex);
    return [Math.round(r*f), Math.round(g*f), Math.round(b*f)];
  }

  const FISHEYE_STEPS = 16; // pontos por aresta na olho de peixe

  // Pontos ao longo do contorno de uma face (polígono fechado), steps por aresta.
  function sampleEdges(corners, steps) {
    const out = [];
    for (let e = 0; e < corners.length; e++) {
      const a = corners[e], b = corners[(e + 1) % corners.length];
      for (let s = 0; s < steps; s++) {
        const t = s / steps;
        out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
      }
    }
    return out;
  }

  // Return filled faces (projected polygons + shaded color + depth) for the
  // active model, sorted back-to-front (painter's algorithm) for occlusion.
  function modelFaces(G, state, width, height) {
    if (!state.showCube) return [];
    const name = state.referenceModel || 'box';
    const scale = state.boxSize || 1;
    const pos = (state.modelPositions && state.modelPositions[name]) || [0,0,0];
    const cam = G.camera(state, width, height);
    const faceDefs = boxFaceDefs();
    const out = [];
    for (const piece of modelBoxList(name)) {
      const corners = boxCorners(piece.size, piece.pos).map(c => [c[0]*scale+pos[0], c[1]*scale+pos[1], c[2]*scale+pos[2]]);
      for (const f of faceDefs) {
        const world = f.ids.map(i => corners[i]);
        // Na olho de peixe uma aresta reta vira curva (como as guias), então
        // cada aresta é amostrada; nas outras projeções 4 cantos bastam.
        const outline = cam.fisheye ? sampleEdges(world, FISHEYE_STEPS) : world;
        const proj = outline.map(p => G.project(p, cam));
        if (proj.some(p => !p)) continue; // face crosses the camera; skip
        // Use the farthest corner's depth for painter ordering — more robust
        // than the average when boxes are close or interpenetrate.
        const depths = world.map(p => G.dot(p.map((v,k)=>v-cam.eye[k]), cam.forward));
        const depth = Math.max(...depths);
        out.push({ points: proj, color: shade(piece.color, f.shade), depth });
      }
    }
    out.sort((a, b) => b.depth - a.depth); // far first
    return out;
  }

  root.ReferenceModels = { modelSegments, modelBoxes, modelFaces };
})(typeof window !== 'undefined' ? window : globalThis);
