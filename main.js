/* =========================================================
 * Retro Zoo Tycoon — STEP 2
 * Procedural pixel-art terrain, textured cliffs & background,
 * subtle grid, pan / pinch-zoom camera, wooden status bar.
 * ========================================================= */
(() => {
  'use strict';

  // ---------- Config ----------
  const TILE_W = 64;            // diamond width  (world px)
  const TILE_H = 32;            // diamond height (world px)
  const HALF_W = TILE_W / 2;
  const HALF_H = TILE_H / 2;
  const MAP_SIZE = 40;          // 40 x 40 tiles
  const N = MAP_SIZE;
  const EDGE_DEPTH = 30;        // height of the earth cliff under the map
  const MIN_ZOOM = 0.35;
  const MAX_ZOOM = 3;
  const TAP_SLOP = 8;           // px of movement before a press becomes a drag
  const MS_PER_DAY = 1000;      // game clock speed
  const START_CASH = 10000;
  const TEX = 256;              // size of the tileable noise textures (power of 2)
  const TEX_MASK = TEX - 1;

  // ---------- Terrain types ----------
  const T = { GRASS: 0, DIRT: 1, WATER: 2, PATH: 3 };
  const TERRAIN_NAMES = ['Grass', 'Dirt', 'Water', 'Path'];

  // ---------- Palettes (dark -> light) ----------
  // Pixels are written straight into a Uint32Array, so pre-pack colours as ABGR.
  const pack = hex => {
    const v = parseInt(hex.slice(1), 16);
    return (0xff000000 | ((v & 0xff) << 16) | (v & 0xff00) | (v >> 16)) >>> 0;
  };
  const pal = list => Uint32Array.from(list, pack);

  const GRASS = pal(['#1f3d16', '#2a521c', '#356622', '#427a28', '#518d2e', '#64a036', '#7bb443', '#98c858']);
  const DIRT  = pal(['#4a321d', '#5e4126', '#73512f', '#88633a', '#9c7546', '#b08a57', '#c49d68']);
  const WATER = pal(['#163d6e', '#1c4f88', '#2463a0', '#2f78b6', '#4590c9', '#6eaedb', '#b4dcf2']);
  const STONE = pal(['#6f6450', '#8f8068', '#a39479', '#b6a88b', '#c9bc9e', '#ddd1b4']);
  const MORTAR = pack('#4f4535');
  const CURB  = pal(['#55493a', '#7a6c55', '#968670']);
  const EARTH = pal(['#1e120a', '#2a1a0e', '#3a2515', '#4b311c', '#5d3e24', '#6f4b2c', '#835b36', '#966b41']);
  const ROCK  = pal(['#3d3a35', '#5a564e', '#7a756a', '#9b968a']);
  const BANK  = pal(['#7a5432', '#664527', '#52381f', '#3f2b18']);
  const FLOWER_Y = pack('#f1dc4f');
  const FLOWER_W = pack('#f4f1e2');
  const FLOWER_P = pack('#d77fb0');
  const BG    = pal(['#101c0b', '#15240e', '#1a2c11', '#203514', '#273f18', '#2e481c']);
  const WOOD  = pal(['#3e2914', '#4a3118', '#563a1d', '#634322', '#6f4c27', '#7c562d']);

  // 4x4 ordered-dither matrix, for that crunchy retro shading
  const BAYER = Float32Array.from([0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5], v => (v + 0.5) / 16);

  // ---------- DOM ----------
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d', { alpha: false });
  const cashEl = document.getElementById('cash-value');
  const dateEl = document.getElementById('date-value');
  const infoEl = document.getElementById('tile-info');
  const infoText = document.getElementById('tile-info-text');
  const loadingEl = document.getElementById('loading');
  const gridBtn = document.getElementById('grid-toggle');

  // ---------- Random / noise helpers ----------
  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Fast integer hash -> [0, 1)
  function hash(x, y) {
    let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  const smooth = t => t * t * (3 - 2 * t);

  /**
   * Seamless (tileable) fractal value noise, TEX x TEX, normalised to [0,1].
   * octaves: [[cellsX, cellsY, weight], ...]. Different cellsX/cellsY give
   * stretched noise: tall for grass blades, wide for water ripples / wood grain.
   */
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
    // Stretch to the full [0,1] range so palettes get used end to end
    let lo = Infinity, hi = -Infinity;
    for (const v of out) { if (v < lo) lo = v; if (v > hi) hi = v; }
    const k = 1 / (hi - lo || 1);
    for (let i = 0; i < out.length; i++) out[i] = (out[i] - lo) * k;
    return out;
  }

  // Texture library (all tile seamlessly every 256 world px)
  const FINE   = noiseTable(11, [[128, 128, 0.55], [64, 64, 0.45]]);   // 2-4px grain
  const BLADE  = noiseTable(23, [[128, 64, 0.6], [128, 128, 0.25], [64, 32, 0.15]]); // short grass blades
  const PATCH  = noiseTable(37, [[16, 16, 0.6], [32, 32, 0.4]]);       // 8-16px clumps
  const LOWN   = noiseTable(41, [[8, 8, 0.7], [16, 16, 0.3]]);         // sampled at 1/4 -> big patches
  const RIPPLE = noiseTable(53, [[32, 96, 0.7], [16, 48, 0.3]]);       // horizontal water ripples
  const JX     = noiseTable(67, [[16, 16, 0.6], [32, 32, 0.4]]);       // terrain border jitter (x)
  const JY     = noiseTable(71, [[16, 16, 0.6], [32, 32, 0.4]]);       // terrain border jitter (y)
  const ROCKN  = noiseTable(83, [[24, 32, 0.7], [48, 64, 0.3]]);       // cliff boulders

  const texIdx = (x, y) => ((y & TEX_MASK) << 8) | (x & TEX_MASK);
  const lowAt = (x, y) => LOWN[texIdx(x >> 2, y >> 2)];

  // Quantise a 0..1 value onto an n-colour palette with ordered dithering
  function quant(v, n, bay) {
    const i = Math.floor(v * n + (bay - 0.5) * 0.9);
    return i < 0 ? 0 : i >= n ? n - 1 : i;
  }
  const clampI = (i, n) => (i < 0 ? 0 : i >= n ? n - 1 : i);

  // ---------- Map generation ----------
  const map = new Uint8Array(N * N);
  const tileAt = (x, y) => map[y * N + x];

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
    // Entrance path running in from the front edge
    const mid = N >> 1;
    for (let y = mid; y < N; y++) {
      map[y * N + mid] = T.PATH;
      map[y * N + mid - 1] = T.PATH;
    }
  })();

  // ---------- World <-> tile ----------
  // Tile (tx,ty) has its top vertex at world ((tx-ty)*HALF_W, (tx+ty)*HALF_H).
  const toFx = (wx, wy) => (wx / HALF_W + wy / HALF_H) * 0.5;
  const toFy = (wx, wy) => (wy / HALF_H - wx / HALF_W) * 0.5;
  const clampTile = v => (v < 0 ? 0 : v >= N ? N - 1 : v | 0);
  const isPath = (x, y) => x >= 0 && y >= 0 && x < N && y < N && map[y * N + x] === T.PATH;

  /**
   * Terrain at a world pixel, with organically jittered borders.
   * Paths are man-made, so they keep crisp edges.
   */
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
    if (blade > 0.82 && FINE[k] > 0.45) i += 1;   // sunlit blade tips
    else if (blade < 0.16) i -= 1;    // shadowy gaps between blades
    // Tiny wildflowers, clustered in lush patches
    const h = hash(wx, wy);
    if (h < 0.0016 && PATCH[k] > 0.55) {
      return h < 0.0007 ? FLOWER_Y : h < 0.0012 ? FLOWER_W : FLOWER_P;
    }
    return GRASS[clampI(i, GRASS.length)];
  }

  function dirtPixel(wx, wy, k, bay) {
    // Pebbles: a lit pixel with a shadow pixel below it
    if (hash(wx, wy) < 0.006) return DIRT[6];
    if (hash(wx, wy - 1) < 0.006) return DIRT[0];
    // Stray grass sprigs
    if (BLADE[k] > 0.86 && FINE[k] > 0.55) return GRASS[3];
    let v = 0.32 * lowAt(wx, wy) + 0.36 * PATCH[k] + 0.32 * FINE[k];
    v = (v - 0.5) * 1.7 + 0.5;
    return DIRT[quant(v, 6, bay)];
  }

  function waterPixel(wx, wy, k, bay) {
    // Distance (in px) to land directly above: the far bank shows an earth wall
    let land = 0;
    for (let s = 1; s <= 10; s++) {
      if (terrainAt(wx, wy - s) !== T.WATER) { land = s; break; }
    }
    if (land && land <= 4) return BANK[land - 1];
    if (land === 5) return WATER[6];                       // waterline foam
    // Near-side and lateral shoreline foam
    if (terrainAt(wx, wy + 1) !== T.WATER || terrainAt(wx - 2, wy) !== T.WATER || terrainAt(wx + 2, wy) !== T.WATER) {
      return bay > 0.4 ? WATER[6] : WATER[5];
    }
    const rip = RIPPLE[k];
    if (rip > 0.84 && FINE[k] > 0.45) return WATER[5];     // glints
    let v = 0.5 * lowAt(wx, wy) + 0.3 * rip + 0.2 * FINE[k];
    v = (v - 0.5) * 1.6 + 0.5;
    let i = quant(v, 5, bay);
    if (land) i += 1;                                      // lighter shallows near shore
    return WATER[clampI(i, 6)];
  }

  function pathPixel(wx, wy, fx, fy, k, bay) {
    const tx = Math.floor(fx), ty = Math.floor(fy);
    const u = fx - tx, v = fy - ty;
    // Kerb stones where the path meets other terrain
    const e = 0.075;
    if ((u < e && !isPath(tx - 1, ty)) || (u > 1 - e && !isPath(tx + 1, ty)) ||
        (v < e && !isPath(tx, ty - 1)) || (v > 1 - e && !isPath(tx, ty + 1))) {
      return CURB[bay > 0.7 ? 2 : bay > 0.2 ? 1 : 0];
    }
    // Staggered cobbles, 4 x 4 per tile
    const rv = v * 4, row = Math.floor(rv);
    const su = u * 4 + (row & 1) * 0.5, col = Math.floor(su);
    const fu = su - col, fv = rv - row;
    if (fu < 0.09 || fv < 0.11) return MORTAR;
    let i = 1 + Math.floor(hash(col + tx * 8, row + ty * 8) * 3);
    if (fv < 0.26 || fu < 0.22) i += 1;      // lit top-left bevel
    if (fv > 0.84 || fu > 0.88) i -= 1;      // shaded bottom-right bevel
    if (FINE[k] > 0.8) i -= 1;               // wear specks
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

  // face: 0 = left (lit), 1 = right (shaded). d = depth below the map edge.
  function cliffPixel(wx, wy, d, face) {
    const di = Math.floor(d);
    const k = texIdx(wx, wy);
    const bay = BAYER[((wy & 3) << 2) | (wx & 3)];
    // Ragged grass lip hanging over the edge
    const lip = 2 + Math.floor(hash(wx, 991) * 3);
    if (di < lip) return GRASS[di === 0 ? 4 - face : 2 - face];
    if (di === lip) return EARTH[1];
    // Boulders embedded in the earth
    const r = ROCKN[k];
    if (r > 0.74) {
      let i = 2;
      if (ROCKN[texIdx(wx, wy - 1)] <= 0.74 || ROCKN[texIdx(wx - 1, wy)] <= 0.74) i = 3;  // lit edge
      else if (ROCKN[texIdx(wx, wy + 1)] <= 0.74) i = 0;                                 // shadow edge
      else if (FINE[k] > 0.6) i = 3;
      return ROCK[clampI(i - face, ROCK.length)];
    }
    // Layered soil strata, wavy and dithered
    const s = d + (PATCH[k] - 0.5) * 7;
    const band = ((Math.floor(s / 6) % 4) + 4) % 4;
    let i = [6, 5, 7, 4][band] + Math.round((FINE[k] - 0.5) * 1.6 + (bay - 0.5) * 0.7);
    i -= face * 2;
    if (di > EDGE_DEPTH - 8) i -= 1;  // ambient occlusion toward the bottom
    if (di > EDGE_DEPTH - 4) i -= 1;
    return EARTH[clampI(i, EARTH.length)];
  }

  // ---------- Pre-rendered ground layer ----------
  // The whole map is shaded once into an offscreen canvas at 1 world px per
  // canvas px; each frame is then a single drawImage (fast on phones).
  const ORIGIN_X = N * HALF_W;   // world (0,0) inside the ground cache
  const ORIGIN_Y = 0;
  const ground = document.createElement('canvas');
  ground.width = N * TILE_W;
  ground.height = N * TILE_H + EDGE_DEPTH;
  const gctx = ground.getContext('2d');

  function paintRegion(x0, y0, w, h) {
    x0 = Math.max(0, x0); y0 = Math.max(0, y0);
    w = Math.min(ground.width - x0, w); h = Math.min(ground.height - y0, h);
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
          const d = wy - (bottom + wx / 2);         // below the front-left edge
          if (d >= 0 && d < EDGE_DEPTH) c = cliffPixel(wx, wy, d, 0);
        } else if (wx >= 0 && wx < halfSpan) {
          const d = wy - (bottom - wx / 2);         // below the front-right edge
          if (d >= 0 && d < EDGE_DEPTH) c = cliffPixel(wx, wy, d, 1);
        }
        buf[row + i] = c;
      }
    }
    gctx.putImageData(img, x0, y0);
  }

  // Repaint one tile (plus margin for jittered borders / banks) after an edit.
  // Not used yet; ready for building tools in later steps.
  function repaintTile(tx, ty) {
    const cx = ORIGIN_X + (tx - ty) * HALF_W, cy = ORIGIN_Y + (tx + ty) * HALF_H;
    const m = 16;
    paintRegion(cx - HALF_W - m, cy - m, TILE_W + m * 2, TILE_H + m * 2 + EDGE_DEPTH);
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

  // Dark, overgrown grass outside the zoo grounds
  const bgTexture = makeTexture(TEX, (x, y, k, bay) => {
    if (hash(x + 5000, y) < 0.004) return BG[0];
    let v = 0.42 * PATCH[k] + 0.38 * BLADE[k] + 0.2 * FINE[k];
    v = (v - 0.5) * 1.7 + 0.5;
    return BG[quant(v, BG.length, bay)];
  });

  // Pixel wood grain for the HTML UI panels
  const WOODN = noiseTable(97, [[4, 48, 0.6], [8, 96, 0.3], [32, 128, 0.1]]);
  const woodTexture = makeTexture(TEX, (x, y, k, bay) => {
    let v = 0.75 * WOODN[k] + 0.25 * FINE[k];
    if (hash(x, y) < 0.002) v -= 0.4; // knots / nail holes
    return WOOD[quant(v, WOOD.length, bay)];
  });
  document.documentElement.style.setProperty('--wood-tex', `url(${woodTexture.toDataURL()})`);

  const bgPattern = ctx.createPattern(bgTexture, 'repeat');

  // ---------- Camera ----------
  // cam.x / cam.y = world point shown at the centre of the screen.
  const MAP_CENTER = { x: 0, y: N * HALF_H };
  const DEFAULT_ZOOM = 1;
  const cam = { x: MAP_CENTER.x, y: MAP_CENTER.y, zoom: DEFAULT_ZOOM };
  let viewW = 0, viewH = 0, dpr = 1;
  let dirty = true;
  let showGrid = true;

  function resize() {
    const rect = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2); // cap for performance
    viewW = rect.width;
    viewH = rect.height;
    canvas.width = Math.round(viewW * dpr);
    canvas.height = Math.round(viewH * dpr);
    dirty = true;
  }

  const screenToWorld = (sx, sy) => ({
    x: cam.x + (sx - viewW / 2) / cam.zoom,
    y: cam.y + (sy - viewH / 2) / cam.zoom,
  });

  function worldToTile(wx, wy) {
    const tx = Math.floor(toFx(wx, wy)), ty = Math.floor(toFy(wx, wy));
    if (tx < 0 || ty < 0 || tx >= N || ty >= N) return null;
    return { x: tx, y: ty };
  }

  function clampCamera() {
    const maxX = N * HALF_W;
    cam.x = Math.max(-maxX, Math.min(maxX, cam.x));
    cam.y = Math.max(0, Math.min(N * TILE_H, cam.y));
  }

  function setZoom(z, sx = viewW / 2, sy = viewH / 2) {
    const before = screenToWorld(sx, sy);
    cam.zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z));
    cam.x = before.x - (sx - viewW / 2) / cam.zoom;
    cam.y = before.y - (sy - viewH / 2) / cam.zoom;
    clampCamera();
    dirty = true;
  }

  let zoomAnim = null;
  function animateZoom(target, sx = viewW / 2, sy = viewH / 2) {
    target = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, target));
    zoomAnim = { from: cam.zoom, to: target, sx, sy, t0: performance.now(), dur: 180 };
  }

  // ---------- Input: mouse + touch via Pointer Events ----------
  const pointers = new Map();   // pointerId -> {x, y}
  let drag = null;              // single-pointer pan state
  let pinch = null;             // two-pointer pinch state
  let hoverTile = null;
  let selectedTile = null;

  const localPos = e => {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const sameTile = (a, b) => (a === b) || (!!a && !!b && a.x === b.x && a.y === b.y);

  function startPinch() {
    const [a, b] = [...pointers.values()];
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    pinch = {
      dist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
      zoom: cam.zoom,
      world: screenToWorld(mid.x, mid.y),
    };
    drag = null;
  }

  canvas.addEventListener('pointerdown', e => {
    canvas.setPointerCapture(e.pointerId);
    const p = localPos(e);
    pointers.set(e.pointerId, p);
    zoomAnim = null;
    if (pointers.size === 1) {
      drag = { startX: p.x, startY: p.y, camX: cam.x, camY: cam.y, moved: false };
    } else if (pointers.size === 2) {
      startPinch();
    }
  });

  canvas.addEventListener('pointermove', e => {
    const p = localPos(e);

    if (e.pointerType === 'mouse' && pointers.size === 0) {
      const w = screenToWorld(p.x, p.y);
      const t = worldToTile(w.x, w.y);
      if (!sameTile(t, hoverTile)) { hoverTile = t; dirty = true; }
      return;
    }
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, p);

    if (pinch && pointers.size >= 2) {
      const [a, b] = [...pointers.values()];
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      cam.zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, pinch.zoom * dist / pinch.dist));
      // Keep the pinched world point under the fingers (zoom + pan at once)
      cam.x = pinch.world.x - (mid.x - viewW / 2) / cam.zoom;
      cam.y = pinch.world.y - (mid.y - viewH / 2) / cam.zoom;
      clampCamera();
      dirty = true;
    } else if (drag) {
      const dx = p.x - drag.startX, dy = p.y - drag.startY;
      if (!drag.moved && Math.hypot(dx, dy) > TAP_SLOP) {
        drag.moved = true;
        canvas.classList.add('dragging');
      }
      if (drag.moved) {
        cam.x = drag.camX - dx / cam.zoom;
        cam.y = drag.camY - dy / cam.zoom;
        clampCamera();
        dirty = true;
      }
    }
  });

  function endPointer(e) {
    if (!pointers.has(e.pointerId)) return;
    const p = localPos(e);
    const wasTap = drag && !drag.moved && pointers.size === 1 && e.type === 'pointerup';
    pointers.delete(e.pointerId);

    if (wasTap) selectAt(p.x, p.y);

    if (pointers.size === 1) {
      // Pinch ended with one finger still down: continue as a pan
      const [rest] = [...pointers.values()];
      pinch = null;
      drag = { startX: rest.x, startY: rest.y, camX: cam.x, camY: cam.y, moved: true };
    } else if (pointers.size === 0) {
      drag = null;
      pinch = null;
      canvas.classList.remove('dragging');
    }
  }
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);
  canvas.addEventListener('pointerleave', e => {
    if (e.pointerType === 'mouse' && hoverTile) { hoverTile = null; dirty = true; }
  });

  // Mouse wheel / trackpad zoom around the cursor
  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    zoomAnim = null;
    const p = localPos(e);
    setZoom(cam.zoom * Math.exp(-e.deltaY * 0.0015), p.x, p.y);
  }, { passive: false });

  // Stop iOS Safari's native page pinch-zoom
  ['gesturestart', 'gesturechange', 'gestureend'].forEach(ev =>
    document.addEventListener(ev, e => e.preventDefault(), { passive: false }));
  document.addEventListener('contextmenu', e => e.preventDefault());

  // Side panel buttons
  function setGrid(on) {
    showGrid = on;
    gridBtn.classList.toggle('on', on);
    gridBtn.setAttribute('aria-pressed', String(on));
    dirty = true;
  }
  document.getElementById('zoom-in').addEventListener('click', () => animateZoom(cam.zoom * 1.4));
  document.getElementById('zoom-out').addEventListener('click', () => animateZoom(cam.zoom / 1.4));
  document.getElementById('zoom-reset').addEventListener('click', () => {
    cam.x = MAP_CENTER.x; cam.y = MAP_CENTER.y;
    animateZoom(DEFAULT_ZOOM);
    dirty = true;
  });
  gridBtn.addEventListener('click', () => setGrid(!showGrid));

  // Keyboard (desktop convenience)
  window.addEventListener('keydown', e => {
    const step = 40 / cam.zoom;
    const k = e.key;
    if (k === 'ArrowLeft' || k === 'a') cam.x -= step;
    else if (k === 'ArrowRight' || k === 'd') cam.x += step;
    else if (k === 'ArrowUp' || k === 'w') cam.y -= step;
    else if (k === 'ArrowDown' || k === 's') cam.y += step;
    else if (k === '+' || k === '=') return animateZoom(cam.zoom * 1.4);
    else if (k === '-') return animateZoom(cam.zoom / 1.4);
    else if (k === 'g') return setGrid(!showGrid);
    else return;
    clampCamera();
    dirty = true;
  });

  function selectAt(sx, sy) {
    const w = screenToWorld(sx, sy);
    const t = worldToTile(w.x, w.y);
    selectedTile = sameTile(t, selectedTile) ? null : t;
    if (selectedTile) {
      const name = TERRAIN_NAMES[tileAt(selectedTile.x, selectedTile.y)];
      infoText.innerHTML = `${name.toUpperCase()}<br><span class="dim">TILE ${selectedTile.x},${selectedTile.y}</span>`;
      infoEl.hidden = false;
    } else {
      infoEl.hidden = true;
    }
    dirty = true;
  }

  // ---------- Rendering ----------
  const tileTop = (x, y) => [(x - y) * HALF_W, (x + y) * HALF_H];

  function diamondPath(x, y, w, h) {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + w, y + h);
    ctx.lineTo(x, y + h * 2);
    ctx.lineTo(x - w, y + h);
    ctx.closePath();
  }

  function strokeTile(tile, color, width) {
    const [wx, wy] = tileTop(tile.x, tile.y);
    diamondPath(wx, wy, HALF_W, HALF_H);
    ctx.lineWidth = width / cam.zoom;
    ctx.strokeStyle = color;
    ctx.stroke();
  }

  // Soft drop shadow so the map floats above the surrounding land
  function drawMapShadow() {
    const span = N * HALF_W, h = N * HALF_H;
    const passes = [[EDGE_DEPTH + 4, 0.30, 4], [EDGE_DEPTH + 12, 0.16, 14]];
    for (const [dy, a, spread] of passes) {
      ctx.fillStyle = `rgba(0,0,0,${a})`;
      diamondPath(0, dy, span + spread, h + spread / 2);
      ctx.fill();
    }
  }

  // Engraved, low-contrast grid that fades out when zoomed far away
  function drawGrid() {
    const fade = Math.max(0, Math.min(1, (cam.zoom - 0.4) / 0.5));
    if (fade <= 0) return;
    const px = 1 / cam.zoom; // one screen pixel in world units
    ctx.beginPath();
    for (let i = 1; i < N; i++) {
      let [x0, y0] = tileTop(i, 0), [x1, y1] = tileTop(i, N);
      ctx.moveTo(x0, y0); ctx.lineTo(x1, y1);
      [x0, y0] = tileTop(0, i); [x1, y1] = tileTop(N, i);
      ctx.moveTo(x0, y0); ctx.lineTo(x1, y1);
    }
    ctx.lineWidth = px;
    // dark groove...
    ctx.strokeStyle = `rgba(12, 28, 6, ${0.3 * fade})`;
    ctx.stroke();
    // ...with a faint highlight just below it
    ctx.save();
    ctx.translate(0, px);
    ctx.strokeStyle = `rgba(255, 250, 200, ${0.08 * fade})`;
    ctx.stroke();
    ctx.restore();
  }

  function render() {
    const s = cam.zoom * dpr;
    ctx.setTransform(s, 0, 0, s,
      Math.round((viewW / 2 - cam.x * cam.zoom) * dpr),
      Math.round((viewH / 2 - cam.y * cam.zoom) * dpr));
    ctx.imageSmoothingEnabled = cam.zoom < 0.75; // pixel-crisp unless far out

    const tl = screenToWorld(0, 0);
    const br = screenToWorld(viewW, viewH);

    // Background land (pattern is anchored to world space, so it pans with the map)
    ctx.fillStyle = bgPattern;
    ctx.fillRect(tl.x - 2, tl.y - 2, br.x - tl.x + 4, br.y - tl.y + 4);

    drawMapShadow();

    // Ground: blit only the visible part of the cache
    const sx = Math.max(0, Math.floor(tl.x + ORIGIN_X));
    const sy = Math.max(0, Math.floor(tl.y + ORIGIN_Y));
    const ex = Math.min(ground.width, Math.ceil(br.x + ORIGIN_X));
    const ey = Math.min(ground.height, Math.ceil(br.y + ORIGIN_Y));
    if (ex > sx && ey > sy) {
      ctx.drawImage(ground, sx, sy, ex - sx, ey - sy,
        sx - ORIGIN_X, sy - ORIGIN_Y, ex - sx, ey - sy);
    }

    if (showGrid) drawGrid();

    // Cursor overlays
    if (hoverTile && !sameTile(hoverTile, selectedTile)) strokeTile(hoverTile, 'rgba(255,255,230,0.55)', 1.5);
    if (selectedTile) {
      strokeTile(selectedTile, '#000', 4);
      strokeTile(selectedTile, '#ffd84a', 2);
    }
  }

  // ---------- Game state: cash + date ----------
  const state = {
    cash: START_CASH,
    date: new Date(2000, 0, 1),
    dayTimer: 0,
  };
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const fmtCash = n => (n < 0 ? '-$' : '$') + Math.abs(Math.round(n)).toLocaleString('en-US');
  const fmtDate = d => `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;

  function updateHUD() {
    cashEl.textContent = fmtCash(state.cash);
    dateEl.textContent = fmtDate(state.date);
  }

  // ---------- Main loop ----------
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(now - last, 250); // avoid a jump after tab switches
    last = now;

    state.dayTimer += dt;
    if (state.dayTimer >= MS_PER_DAY) {
      while (state.dayTimer >= MS_PER_DAY) {
        state.dayTimer -= MS_PER_DAY;
        state.date.setDate(state.date.getDate() + 1);
      }
      updateHUD();
    }

    if (zoomAnim) {
      const k = Math.min(1, (now - zoomAnim.t0) / zoomAnim.dur);
      const e = 1 - Math.pow(1 - k, 3);
      setZoom(zoomAnim.from + (zoomAnim.to - zoomAnim.from) * e, zoomAnim.sx, zoomAnim.sy);
      if (k >= 1) zoomAnim = null;
    }

    // Only redraw when something changed (saves battery)
    if (dirty) {
      render();
      dirty = false;
    }
    requestAnimationFrame(frame);
  }

  // ---------- Boot ----------
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 100));
  resize();
  updateHUD();

  // Let the "generating terrain" panel paint, then shade the map.
  requestAnimationFrame(() => setTimeout(() => {
    const t0 = performance.now();
    paintRegion(0, 0, ground.width, ground.height);
    console.log(`Terrain generated in ${Math.round(performance.now() - t0)} ms`);
    loadingEl.hidden = true;
    dirty = true;
    last = performance.now();
    requestAnimationFrame(frame);
  }, 30));

  // Expose a tiny debug/extension hook for later steps
  window.zoo = { map, repaintTile, cam, state };
})();
