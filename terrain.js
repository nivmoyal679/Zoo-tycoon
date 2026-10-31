/* =========================================================
 * Retro Zoo Tycoon — terrain.js
 * Map data + procedural pixel-art ground renderer.
 * Exposes window.Zoo.terrain
 * ========================================================= */
(() => {
  'use strict';
  const Zoo = (window.Zoo = window.Zoo || {});

  // ---------- Config ----------
  const TILE_W = 64;            // diamond width  (world px)
  const TILE_H = 32;            // diamond height (world px)
  const HALF_W = TILE_W / 2;
  const HALF_H = TILE_H / 2;
  const N = 40;                 // map is N x N tiles
  const EDGE_DEPTH = 30;        // height of the earth cliff under the map
  const TEX = 256;              // tileable noise texture size (power of 2)
  const TEX_MASK = TEX - 1;

  // ---------- Terrain types ----------
  const T = { GRASS: 0, DIRT: 1, WATER: 2, PATH: 3 };
  const TERRAIN_NAMES = ['Grass', 'Dirt', 'Water', 'Path'];

  // ---------- Palettes (dark -> light) ----------
  const HEX = {
    grass: ['#1f3d16', '#2a521c', '#356622', '#427a28', '#518d2e', '#64a036', '#7bb443', '#98c858'],
    dirt:  ['#4a321d', '#5e4126', '#73512f', '#88633a', '#9c7546', '#b08a57', '#c49d68'],
    water: ['#163d6e', '#1c4f88', '#2463a0', '#2f78b6', '#4590c9', '#6eaedb', '#b4dcf2'],
    stone: ['#6f6450', '#8f8068', '#a39479', '#b6a88b', '#c9bc9e', '#ddd1b4'],
    earth: ['#1e120a', '#2a1a0e', '#3a2515', '#4b311c', '#5d3e24', '#6f4b2c', '#835b36', '#966b41'],
    bg:    ['#101c0b', '#15240e', '#1a2c11', '#203514', '#273f18', '#2e481c'],
    wood:  ['#3e2914', '#4a3118', '#563a1d', '#634322', '#6f4c27', '#7c562d'],
  };

  // Pixels are written straight into a Uint32Array, so pre-pack colours as ABGR.
  const pack = hex => {
    const v = parseInt(hex.slice(1), 16);
    return (0xff000000 | ((v & 0xff) << 16) | (v & 0xff00) | (v >> 16)) >>> 0;
  };
  const pal = list => Uint32Array.from(list, pack);

  const GRASS = pal(HEX.grass);
  const DIRT  = pal(HEX.dirt);
  const WATER = pal(HEX.water);
  const STONE = pal(HEX.stone);
  const EARTH = pal(HEX.earth);
  const BG    = pal(HEX.bg);
  const WOOD  = pal(HEX.wood);
  const MORTAR = pack('#4f4535');
  const CURB  = pal(['#55493a', '#7a6c55', '#968670']);
  const ROCK  = pal(['#3d3a35', '#5a564e', '#7a756a', '#9b968a']);
  const BANK  = pal(['#7a5432', '#664527', '#52381f', '#3f2b18']);
  const FLOWER_Y = pack('#f1dc4f');
  const FLOWER_W = pack('#f4f1e2');
  const FLOWER_P = pack('#d77fb0');

  // 4x4 ordered-dither matrix
  const BAYER = Float32Array.from([0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5], v => (v + 0.5) / 16);

  // ---------- Random / noise helpers ----------
  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function hash(x, y) {
    let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  const smooth = t => t * t * (3 - 2 * t);

  /** Seamless fractal value noise (TEX x TEX) normalised to [0,1]. */
  function noiseTable(seed, octaves, size = TEX) {
    const rnd = mulberry32(seed);
    const out = new Float32Array(size * size);
    for (const [cx, cy, w] of octaves) {
      const lat = new Float32Array(cx * cy);
      for (let i = 0; i < lat.length; i++) lat[i] = rnd();
      for (let y = 0; y < size; y++) {
        const gy = (y / size) * cy;
        const y0 = Math.floor(gy), ty = smooth(gy - y0);
        const r0 = y0 * cx, r1 = ((y0 + 1) % cy) * cx;
        for (let x = 0; x < size; x++) {
          const gx = (x / size) * cx;
          const x0 = Math.floor(gx), tx = smooth(gx - x0);
          const x1 = (x0 + 1) % cx;
          const a = lat[r0 + x0] + (lat[r0 + x1] - lat[r0 + x0]) * tx;
          const b = lat[r1 + x0] + (lat[r1 + x1] - lat[r1 + x0]) * tx;
          out[y * size + x] += (a + (b - a) * ty) * w;
        }
      }
    }
    let lo = Infinity, hi = -Infinity;
    for (const v of out) { if (v < lo) lo = v; if (v > hi) hi = v; }
    const k = 1 / (hi - lo || 1);
    for (let i = 0; i < out.length; i++) out[i] = (out[i] - lo) * k;
    return out;
  }

  const FINE   = noiseTable(11, [[128, 128, 0.55], [64, 64, 0.45]]);
  const BLADE  = noiseTable(23, [[128, 64, 0.6], [128, 128, 0.25], [64, 32, 0.15]]);
  const PATCH  = noiseTable(37, [[16, 16, 0.6], [32, 32, 0.4]]);
  const LOWN   = noiseTable(41, [[8, 8, 0.7], [16, 16, 0.3]]);
  const RIPPLE = noiseTable(53, [[32, 96, 0.7], [16, 48, 0.3]]);
  const JX     = noiseTable(67, [[16, 16, 0.6], [32, 32, 0.4]]);
  const JY     = noiseTable(71, [[16, 16, 0.6], [32, 32, 0.4]]);
  const ROCKN  = noiseTable(83, [[24, 32, 0.7], [48, 64, 0.3]]);
  const WOODN  = noiseTable(97, [[4, 48, 0.6], [8, 96, 0.3], [32, 128, 0.1]]);

  const texIdx = (x, y) => ((y & TEX_MASK) << 8) | (x & TEX_MASK);
  const lowAt = (x, y) => LOWN[texIdx(x >> 2, y >> 2)];

  function quant(v, n, bay) {
    const i = Math.floor(v * n + (bay - 0.5) * 0.9);
    return i < 0 ? 0 : i >= n ? n - 1 : i;
  }
  const clampI = (i, n) => (i < 0 ? 0 : i >= n ? n - 1 : i);

  // ---------- Map ----------
  const map = new Uint8Array(N * N);
  const tileAt = (x, y) => map[y * N + x];
  const inMap = (x, y) => x >= 0 && y >= 0 && x < N && y < N;
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
    // Entrance avenue running in from the front edge, plus a cross path
    const mid = N >> 1;
    for (let y = mid - 6; y < N; y++) {
      map[y * N + mid] = T.PATH;
      map[y * N + mid - 1] = T.PATH;
    }
    for (let x = mid - 10; x < mid + 10; x++) map[(mid + 6) * N + x] = T.PATH;
  })();

  // ---------- World <-> tile ----------
  const toFx = (wx, wy) => (wx / HALF_W + wy / HALF_H) * 0.5;
  const toFy = (wx, wy) => (wy / HALF_H - wx / HALF_W) * 0.5;
  const clampTile = v => (v < 0 ? 0 : v >= N ? N - 1 : v | 0);
  const isPath = (x, y) => inMap(x, y) && map[y * N + x] === T.PATH;

  function terrainAt(wx, wy) {
    const bx = clampTile(Math.floor(toFx(wx, wy)));
    const by = clampTile(Math.floor(toFy(wx, wy)));
    const base = map[by * N + bx];
    if (base === T.PATH) return base;
    const k = texIdx(wx, wy);
    const jx = wx + (JX[k] - 0.5) * 22;
    const jy = wy + (JY[k] - 0.5) * 11;
    const t = map[clampTile(Math.floor(toFy(jx, jy))) * N + clampTile(Math.floor(toFx(jx, jy)))];
    return t === T.PATH ? base : t;
  }

  // ---------- Per-pixel shaders ----------
  function grassPixel(wx, wy, k, bay) {
    const blade = BLADE[k];
    let v = 0.34 * lowAt(wx, wy) + 0.34 * PATCH[k] + 0.18 * blade + 0.14 * FINE[k];
    v = (v - 0.5) * 1.75 + 0.5;
    let i = quant(v, GRASS.length, bay);
    if (blade > 0.82 && FINE[k] > 0.45) i += 1;
    else if (blade < 0.16) i -= 1;
    const h = hash(wx, wy);
    if (h < 0.0016 && PATCH[k] > 0.55) {
      return h < 0.0007 ? FLOWER_Y : h < 0.0012 ? FLOWER_W : FLOWER_P;
    }
    return GRASS[clampI(i, GRASS.length)];
  }

  function dirtPixel(wx, wy, k, bay) {
    if (hash(wx, wy) < 0.006) return DIRT[6];
    if (hash(wx, wy - 1) < 0.006) return DIRT[0];
    if (BLADE[k] > 0.86 && FINE[k] > 0.55) return GRASS[3];
    let v = 0.32 * lowAt(wx, wy) + 0.36 * PATCH[k] + 0.32 * FINE[k];
    v = (v - 0.5) * 1.7 + 0.5;
    return DIRT[quant(v, 6, bay)];
  }

  function waterPixel(wx, wy, k, bay) {
    let land = 0;
    for (let s = 1; s <= 10; s++) {
      if (terrainAt(wx, wy - s) !== T.WATER) { land = s; break; }
    }
    if (land && land <= 4) return BANK[land - 1];
    if (land === 5) return WATER[6];
    if (terrainAt(wx, wy + 1) !== T.WATER || terrainAt(wx - 2, wy) !== T.WATER || terrainAt(wx + 2, wy) !== T.WATER) {
      return bay > 0.4 ? WATER[6] : WATER[5];
    }
    const rip = RIPPLE[k];
    if (rip > 0.84 && FINE[k] > 0.45) return WATER[5];
    let v = 0.5 * lowAt(wx, wy) + 0.3 * rip + 0.2 * FINE[k];
    v = (v - 0.5) * 1.6 + 0.5;
    let i = quant(v, 5, bay);
    if (land) i += 1;
    return WATER[clampI(i, 6)];
  }

  function pathPixel(wx, wy, fx, fy, k, bay) {
    const tx = Math.floor(fx), ty = Math.floor(fy);
    const u = fx - tx, v = fy - ty;
    const e = 0.075;
    if ((u < e && !isPath(tx - 1, ty)) || (u > 1 - e && !isPath(tx + 1, ty)) ||
        (v < e && !isPath(tx, ty - 1)) || (v > 1 - e && !isPath(tx, ty + 1))) {
      return CURB[bay > 0.7 ? 2 : bay > 0.2 ? 1 : 0];
    }
    const rv = v * 4, row = Math.floor(rv);
    const su = u * 4 + (row & 1) * 0.5, col = Math.floor(su);
    const fu = su - col, fv = rv - row;
    if (fu < 0.09 || fv < 0.11) return MORTAR;
    let i = 1 + Math.floor(hash(col + tx * 8, row + ty * 8) * 3);
    if (fv < 0.26 || fu < 0.22) i += 1;
    if (fv > 0.84 || fu > 0.88) i -= 1;
    if (FINE[k] > 0.8) i -= 1;
    return STONE[clampI(i, STONE.length)];
  }

  function surfacePixel(wx, wy, fx, fy) {
    const k = texIdx(wx, wy);
    const bay = BAYER[((wy & 3) << 2) | (wx & 3)];
    switch (terrainAt(wx, wy)) {
      case T.DIRT:  return dirtPixel(wx, wy, k, bay);
      case T.WATER: return waterPixel(wx, wy, k, bay);
      case T.PATH:  return pathPixel(wx, wy, fx, fy, k, bay);
      default:      return grassPixel(wx, wy, k, bay);
    }
  }

  function cliffPixel(wx, wy, d, face) {
    const di = Math.floor(d);
    const k = texIdx(wx, wy);
    const bay = BAYER[((wy & 3) << 2) | (wx & 3)];
    const lip = 2 + Math.floor(hash(wx, 991) * 3);
    if (di < lip) return GRASS[di === 0 ? 4 - face : 2 - face];
    if (di === lip) return EARTH[1];
    const r = ROCKN[k];
    if (r > 0.74) {
      let i = 2;
      if (ROCKN[texIdx(wx, wy - 1)] <= 0.74 || ROCKN[texIdx(wx - 1, wy)] <= 0.74) i = 3;
      else if (ROCKN[texIdx(wx, wy + 1)] <= 0.74) i = 0;
      else if (FINE[k] > 0.6) i = 3;
      return ROCK[clampI(i - face, ROCK.length)];
    }
    const s = d + (PATCH[k] - 0.5) * 7;
    const band = ((Math.floor(s / 6) % 4) + 4) % 4;
    let i = [6, 5, 7, 4][band] + Math.round((FINE[k] - 0.5) * 1.6 + (bay - 0.5) * 0.7);
    i -= face * 2;
    if (di > EDGE_DEPTH - 8) i -= 1;
    if (di > EDGE_DEPTH - 4) i -= 1;
    return EARTH[clampI(i, EARTH.length)];
  }

  // ---------- Pre-rendered ground layer ----------
  const ORIGIN_X = N * HALF_W;
  const ORIGIN_Y = 0;
  const ground = document.createElement('canvas');
  ground.width = N * TILE_W;
  ground.height = N * TILE_H + EDGE_DEPTH;
  const gctx = ground.getContext('2d');

  function paintRegion(x0, y0, w, h) {
    x0 = Math.max(0, Math.floor(x0)); y0 = Math.max(0, Math.floor(y0));
    w = Math.min(ground.width - x0, Math.ceil(w)); h = Math.min(ground.height - y0, Math.ceil(h));
    if (w <= 0 || h <= 0) return;
    const img = gctx.createImageData(w, h);
    const buf = new Uint32Array(img.data.buffer);
    const halfSpan = N * HALF_W, bottom = N * TILE_H;
    for (let j = 0; j < h; j++) {
      const wy = y0 + j - ORIGIN_Y;
      const row = j * w;
      for (let i = 0; i < w; i++) {
        const wx = x0 + i - ORIGIN_X;
        const fx = toFx(wx, wy), fy = toFy(wx, wy);
        let c = 0;
        if (fx >= 0 && fy >= 0 && fx < N && fy < N) {
          c = surfacePixel(wx, wy, fx, fy);
        } else if (wx < 0 && wx >= -halfSpan) {
          const d = wy - (bottom + wx / 2);
          if (d >= 0 && d < EDGE_DEPTH) c = cliffPixel(wx, wy, d, 0);
        } else if (wx >= 0 && wx < halfSpan) {
          const d = wy - (bottom - wx / 2);
          if (d >= 0 && d < EDGE_DEPTH) c = cliffPixel(wx, wy, d, 1);
        }
        buf[row + i] = c;
      }
    }
    gctx.putImageData(img, x0, y0);
  }

  /** Repaint the ground for the tile rectangle [x0..x1] x [y0..y1] (inclusive). */
  function repaintTiles(x0, y0, x1, y1) {
    const m = 18; // margin for jittered borders, banks and kerbs
    const left = (x0 - y1) * HALF_W - HALF_W;
    const right = (x1 - y0) * HALF_W + HALF_W;
    const top = (x0 + y0) * HALF_H;
    const bottom = (x1 + y1) * HALF_H + TILE_H;
    paintRegion(ORIGIN_X + left - m, ORIGIN_Y + top - m, right - left + m * 2, bottom - top + m * 2 + EDGE_DEPTH);
  }

  function setTiles(x0, y0, x1, y1, t) {
    let changed = 0;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (map[y * N + x] !== t) { map[y * N + x] = t; changed++; }
      }
    }
    if (changed) repaintTiles(x0, y0, x1, y1);
    return changed;
  }

  // ---------- Small tileable textures (background, UI wood) ----------
  function makeTexture(size, shade) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    const img = g.createImageData(size, size);
    const buf = new Uint32Array(img.data.buffer);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        buf[y * size + x] = shade(x, y, texIdx(x, y), BAYER[((y & 3) << 2) | (x & 3)]);
      }
    }
    g.putImageData(img, 0, 0);
    return c;
  }

  const bgTexture = makeTexture(TEX, (x, y, k, bay) => {
    if (hash(x + 5000, y) < 0.004) return BG[0];
    let v = 0.42 * PATCH[k] + 0.38 * BLADE[k] + 0.2 * FINE[k];
    v = (v - 0.5) * 1.7 + 0.5;
    return BG[quant(v, BG.length, bay)];
  });

  const woodTexture = makeTexture(TEX, (x, y, k, bay) => {
    let v = 0.75 * WOODN[k] + 0.25 * FINE[k];
    if (hash(x, y) < 0.002) v -= 0.4;
    return WOOD[quant(v, WOOD.length, bay)];
  });

  Zoo.terrain = {
    TILE_W, TILE_H, HALF_W, HALF_H, N, EDGE_DEPTH, ORIGIN_X, ORIGIN_Y,
    T, TERRAIN_NAMES, HEX, ENTRANCE,
    map, tileAt, inMap, isPath, toFx, toFy,
    ground, paintAll: () => paintRegion(0, 0, ground.width, ground.height),
    setTiles, repaintTiles,
    bgTexture, woodTexture, mulberry32, hash,
  };
})();
