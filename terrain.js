/* =========================================================
 * Zoo Tycoon 3D — terrain.js
 * Map data, the painted ground texture and ground heights.
 * One tile = 1 world unit. Tile (tx,ty) covers
 *   x in [tx - N/2, tx + 1 - N/2],  z in [ty - N/2, ty + 1 - N/2].
 * Exposes window.Zoo.terrain
 * ========================================================= */
(() => {
  'use strict';
  const Zoo = (window.Zoo = window.Zoo || {});

  const N = 40;               // map is N x N tiles
  const TEX_PX = 40;          // ground texture pixels per tile
  const WATER_DEPTH = 0.38;   // how deep lakes are dug

  const T = { GRASS: 0, DIRT: 1, WATER: 2, PATH: 3 };
  const TERRAIN_NAMES = ['Grass', 'Dirt', 'Water', 'Path'];

  // ---------- Random / noise ----------
  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hash(x, y) {
    let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  const smooth = t => t * t * (3 - 2 * t);
  /** Value noise in [0,1] */
  function vnoise(x, y) {
    const x0 = Math.floor(x), y0 = Math.floor(y);
    const sx = smooth(x - x0), sy = smooth(y - y0);
    const a = hash(x0, y0), b = hash(x0 + 1, y0), c = hash(x0, y0 + 1), d = hash(x0 + 1, y0 + 1);
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  }
  const fbm = (x, y) => vnoise(x, y) * 0.55 + vnoise(x * 2.1 + 17, y * 2.1 + 5) * 0.3 + vnoise(x * 4.3 + 31, y * 4.3 + 11) * 0.15;

  // ---------- Map ----------
  const map = new Uint8Array(N * N);
  const tileAt = (x, y) => map[y * N + x];
  const inMap = (x, y) => x >= 0 && y >= 0 && x < N && y < N;
  const isPath = (x, y) => inMap(x, y) && map[y * N + x] === T.PATH;
  const isWater = (x, y) => inMap(x, y) && map[y * N + x] === T.WATER;
  const ENTRANCE = [{ x: (N >> 1) - 1, y: N - 1 }, { x: N >> 1, y: N - 1 }];

  (function generateMap() {
    const rand = mulberry32(1987);
    const makeNoise = cell => {
      const n = Math.ceil(N / cell) + 2;
      const g = Array.from({ length: n * n }, rand);
      const at = (x, y) => g[y * n + x];
      return (x, y) => {
        const gx = x / cell, gy = y / cell;
        const x0 = Math.floor(gx), y0 = Math.floor(gy);
        const sx = smooth(gx - x0), sy = smooth(gy - y0);
        const a = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * sx;
        const b = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * sx;
        return a + (b - a) * sy;
      };
    };
    const water = makeNoise(9);
    const dirt = makeNoise(5);
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        let t = T.GRASS;
        if (water(x, y) > 0.72) t = T.WATER;
        else if (dirt(x, y) > 0.74) t = T.DIRT;
        map[y * N + x] = t;
      }
    }
    const mid = N >> 1;
    for (let y = mid - 6; y < N; y++) {
      map[y * N + mid] = T.PATH;
      map[y * N + mid - 1] = T.PATH;
    }
    for (let x = mid - 10; x < mid + 10; x++) map[(mid + 6) * N + x] = T.PATH;
  })();

  // ---------- Ground texture (painted, per pixel) ----------
  const texCanvas = document.createElement('canvas');
  texCanvas.width = texCanvas.height = N * TEX_PX;
  const tctx = texCanvas.getContext('2d');

  const clampT = v => (v < 0 ? 0 : v >= N ? N - 1 : v | 0);

  /** Terrain under a texture pixel, with organic (noise-jittered) borders. */
  function terrainAtPx(px, py) {
    const bx = clampT(px / TEX_PX), by = clampT(py / TEX_PX);
    const base = map[by * N + bx];
    if (base === T.PATH) return base;                  // paved paths keep crisp edges
    const jx = (vnoise(px * 0.06, py * 0.06) - 0.5) * 0.6;
    const jy = (vnoise(px * 0.06 + 40, py * 0.06 + 40) - 0.5) * 0.6;
    const t = map[clampT(px / TEX_PX + jx) + clampT(py / TEX_PX + jy) * N];
    return t === T.PATH ? base : t;
  }

  const mix = (a, b, t) => a + (b - a) * t;

  function grass(px, py) {
    // Painterly, blotchy grass: big soft patches + mid mottling + fine grain
    const big = fbm(px / 90, py / 90);
    const mid = vnoise(px / 14, py / 14);
    const fine = hash(px, py);
    let t = big * 0.55 + mid * 0.3 + fine * 0.15;
    t = Math.min(1, Math.max(0, (t - 0.5) * 1.5 + 0.5));
    const blade = hash(px >> 1, (py / 3) | 0) > 0.93 ? 0.08 : 0;
    return [mix(62, 132, t) + blade * 200, mix(104, 170, t) + blade * 180, mix(36, 66, t)];
  }

  function dirt(px, py) {
    const t = fbm(px / 30, py / 30) * 0.7 + hash(px, py) * 0.3;
    const pebble = hash(px * 3 + 1, py * 7) > 0.995 ? 30 : 0;
    return [mix(118, 168, t) + pebble, mix(90, 132, t) + pebble, mix(56, 88, t) + pebble];
  }

  function asphalt(px, py, tx, ty) {
    const u = px / TEX_PX - tx, v = py / TEX_PX - ty;
    const e = 0.07;
    // Light kerb where the path meets anything else
    if ((u < e && !isPath(tx - 1, ty)) || (u > 1 - e && !isPath(tx + 1, ty)) ||
        (v < e && !isPath(tx, ty - 1)) || (v > 1 - e && !isPath(tx, ty + 1))) {
      const k = 168 + hash(px, py) * 18;
      return [k, k, k - 6];
    }
    const t = vnoise(px / 20, py / 20) * 0.5 + hash(px, py) * 0.5;
    const speck = hash(px * 5, py * 3) > 0.985 ? 26 : 0;
    const k = mix(60, 82, t) + speck;
    return [k, k + 1, k + 3];
  }

  function lakebed(px, py) {
    // Seen through the semi-transparent water surface
    let shore = 0;
    for (const [dx, dy] of [[-10, 0], [10, 0], [0, -10], [0, 10]]) {
      if (terrainAtPx(px + dx, py + dy) !== T.WATER) shore++;
    }
    const t = fbm(px / 40, py / 40);
    if (shore) return [mix(108, 132, t), mix(98, 118, t), mix(70, 84, t)]; // wet sand slope
    return [mix(32, 46, t), mix(70, 86, t), mix(78, 92, t)];
  }

  /** Repaint tiles [x0..x1] x [y0..y1] (plus a margin for the jittered borders). */
  function paint(x0 = 0, y0 = 0, x1 = N - 1, y1 = N - 1) {
    const m = 1;
    x0 = Math.max(0, x0 - m); y0 = Math.max(0, y0 - m);
    x1 = Math.min(N - 1, x1 + m); y1 = Math.min(N - 1, y1 + m);
    const sx = x0 * TEX_PX, sy = y0 * TEX_PX;
    const w = (x1 - x0 + 1) * TEX_PX, h = (y1 - y0 + 1) * TEX_PX;
    const img = tctx.createImageData(w, h);
    const d = img.data;
    for (let j = 0; j < h; j++) {
      const py = sy + j;
      for (let i = 0; i < w; i++) {
        const px = sx + i;
        let c;
        switch (terrainAtPx(px, py)) {
          case T.DIRT:  c = dirt(px, py); break;
          case T.WATER: c = lakebed(px, py); break;
          case T.PATH:  c = asphalt(px, py, (px / TEX_PX) | 0, (py / TEX_PX) | 0); break;
          default:      c = grass(px, py);
        }
        const o = (j * w + i) * 4;
        d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 255;
      }
    }
    tctx.putImageData(img, sx, sy);
  }

  /** Small square swatch of a terrain type (for toolbar icons). */
  function swatch(t, size = 64) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    const img = g.createImageData(size, size);
    for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
      const px = i * 2 + 4000, py = j * 2 + 4000;
      const col = t === T.DIRT ? dirt(px, py) : t === T.WATER ? [52, 116, 150] : t === T.PATH ? [72, 74, 78] : grass(px, py);
      img.data.set([col[0], col[1], col[2], 255], (j * size + i) * 4);
    }
    g.putImageData(img, 0, 0);
    return c;
  }

  /** Darker, wilder grass for the land outside the zoo (tileable 256px). */
  function outsideTexture() {
    const S = 256;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d');
    const img = g.createImageData(S, S);
    const tile = (x, y, p) => { // periodic value noise with period p cells
      const x0 = Math.floor(x), y0 = Math.floor(y);
      const h = (a, b) => hash(((a % p) + p) % p, ((b % p) + p) % p);
      const sx = smooth(x - x0), sy = smooth(y - y0);
      const a = h(x0, y0), b = h(x0 + 1, y0), cc = h(x0, y0 + 1), d = h(x0 + 1, y0 + 1);
      return a + (b - a) * sx + (cc - a) * sy + (a - b - cc + d) * sx * sy;
    };
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      let t = tile(x / 32, y / 32, 8) * 0.6 + tile(x / 8, y / 8, 32) * 0.25 + hash(x + 999, y) * 0.15;
      t = (t - 0.5) * 1.4 + 0.5;
      img.data.set([mix(40, 84, t), mix(66, 110, t), mix(30, 50, t), 255], (y * S + x) * 4);
    }
    g.putImageData(img, 0, 0);
    return c;
  }

  // ---------- Heights ----------
  /** Height of ground-mesh vertex (i,j) on a half-tile lattice (0..2N). Lakes are dug in. */
  function vertexHeight(i, j) {
    const oddI = i & 1, oddJ = j & 1;
    let water;
    if (oddI && oddJ) water = isWater((i - 1) >> 1, (j - 1) >> 1);
    else if (oddJ) water = isWater((i >> 1) - 1, (j - 1) >> 1) && isWater(i >> 1, (j - 1) >> 1);
    else if (oddI) water = isWater((i - 1) >> 1, (j >> 1) - 1) && isWater((i - 1) >> 1, j >> 1);
    else water = isWater((i >> 1) - 1, (j >> 1) - 1) && isWater(i >> 1, (j >> 1) - 1) &&
                 isWater((i >> 1) - 1, j >> 1) && isWater(i >> 1, j >> 1);
    return water ? -WATER_DEPTH : 0;
  }

  function setTiles(x0, y0, x1, y1, t) {
    let changed = 0;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      if (map[y * N + x] !== t) { map[y * N + x] = t; changed++; }
    }
    if (changed) paint(x0, y0, x1, y1);
    return changed;
  }

  Zoo.terrain = {
    N, TEX_PX, WATER_DEPTH, T, TERRAIN_NAMES, ENTRANCE,
    map, tileAt, inMap, isPath, isWater,
    texCanvas, paint, swatch, outsideTexture, vertexHeight, setTiles,
    mulberry32, hash,
  };
})();
