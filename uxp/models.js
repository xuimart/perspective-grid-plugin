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

  root.ReferenceModels = { modelSegments, modelBoxes };
})(typeof window !== 'undefined' ? window : globalThis);
