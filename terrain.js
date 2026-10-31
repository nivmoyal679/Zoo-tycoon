/* =========================================================
 * Zoo Tycoon — terrain.js
 * Map data + flat-vector isometric ground renderer.
 * Ground geometry is cached as Path2D objects (rebuilt only when
 * terrain changes) and drawn in world space every frame, so it
 * stays razor-sharp at any zoom level / device pixel ratio.
 * Exposes window.Zoo.terrain
 * ========================================================= */
(() => {
  'use strict';
  const Zoo = (window.Zoo = window.Zoo || {});

  // ---------- Config ----------
  const TILE_W = 64;
  const TILE_H = 32;
  const HALF_W = TILE_W / 2;
  const HALF_H = TILE_H / 2;
  const N = 40;                 // map is N x N tiles
  const EDGE_DEPTH = 16;        // thickness of the map "slab"
  const WATER_DROP = 5;         // how far water sits below the land

  // ---------- Terrain types & palette ----------
  const T = { GRASS: 0, DIRT: 1, WATER: 2, PATH: 3 };
  const TERRAIN_NAMES = ['Grass', 'Dirt', 'Water', 'Path'];
  const KEYS = ['grass', 'dirt', 'water', 'path'];

  // Each terrain has 3 near-identical tones -> subtle low-poly facets
  const COLORS = {
    grass: ['#A8D98B', '#A1D483', '#B0DE94'],
    dirt:  ['#EBD8AA', '#E4CF9E', '#F0DEB4'],
    water: ['#3A86C8', '#3580C1', '#3F8DD0'],
    path:  ['#DCDFE4', '#D5D9DF', '#E3E6EA'],
  };
  const SIDE = { grass: '#7DB563', dirt: '#CDB27F', water: '#2A68A3', path: '#B3B9C2' };
  const SOIL_L = '#C9A27A';
  const SOIL_R = '#AD8660';
  const WATER_WALL = '#2B649C';
  const CURB = '#B7BDC6';
  const RIPPLE = 'rgba(255,255,255,0.45)';

  // ---------- Random helpers ----------
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

  // ---------- World <-> tile ----------
  // Grid point (gx,gy) sits at world ((gx-gy)*HALF_W, (gx+gy)*HALF_H)
  const toFx = (wx, wy) => (wx / HALF_W + wy / HALF_H) * 0.5;
  const toFy = (wx, wy) => (wy / HALF_H - wx / HALF_W) * 0.5;
  const gp = (gx, gy) => [(gx - gy) * HALF_W, (gx + gy) * HALF_H];

  // ---------- Geometry cache ----------
  let geo = null;

  function addQuad(p, a, b, c, d) {
    p.moveTo(a[0], a[1]); p.lineTo(b[0], b[1]); p.lineTo(c[0], c[1]); p.lineTo(d[0], d[1]); p.closePath();
  }
  const down = (pt, dy) => [pt[0], pt[1] + dy];

  function buildGeometry() {
    const fills = new Map();      // colour -> Path2D
    const sides = new Map();      // colour -> Path2D (front strips of the slab)
    const walls = new Path2D();
    const curbs = new Path2D();
    const ripples = new Path2D();
    const getPath = (m, c) => { let p = m.get(c); if (!p) { p = new Path2D(); m.set(c, p); } return p; };

    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const t = map[y * N + x];
        const key = KEYS[t];
        const tone = Math.floor(hash(x, y) * 3);
        const top = gp(x, y), right = gp(x + 1, y), bottom = gp(x + 1, y + 1), left = gp(x, y + 1);
        addQuad(getPath(fills, COLORS[key][tone]), top, right, bottom, left);

        if (t === T.WATER) {
          // Back banks: land behind the water casts a short vertical wall
          if (inMap(x - 1, y) && !isWater(x - 1, y)) addQuad(walls, top, left, down(left, WATER_DROP), down(top, WATER_DROP));
          if (inMap(x, y - 1) && !isWater(x, y - 1)) addQuad(walls, top, right, down(right, WATER_DROP), down(top, WATER_DROP));
          if (hash(x * 3 + 1, y * 7 + 2) < 0.35) {
            const cx = top[0] + (hash(x, y + 99) - 0.5) * 20, cy = top[1] + HALF_H + 3 + (hash(x + 99, y) - 0.5) * 8;
            ripples.moveTo(cx - 7, cy); ripples.lineTo(cx + 7, cy);
            ripples.moveTo(cx - 2, cy + 4); ripples.lineTo(cx + 6, cy + 4);
          }
        }
        if (t === T.PATH) {
          const edge = (nx, ny, a, b) => { if (!isPath(nx, ny)) { curbs.moveTo(a[0], a[1]); curbs.lineTo(b[0], b[1]); } };
          edge(x - 1, y, top, left);
          edge(x, y - 1, top, right);
          edge(x + 1, y, right, bottom);
          edge(x, y + 1, left, bottom);
        }
        // Coloured lip on the front faces of the slab
        if (y === N - 1) addQuad(getPath(sides, SIDE[key]), left, bottom, down(bottom, 5), down(left, 5));
        if (x === N - 1) addQuad(getPath(sides, SIDE[key]), bottom, right, down(right, 5), down(bottom, 5));
      }
    }
    geo = { fills, sides, walls, curbs, ripples };
  }

  const MAP_L = gp(0, N), MAP_B = gp(N, N), MAP_R = gp(N, 0), MAP_T = gp(0, 0);

  /** Draw the whole ground in world space. px = one device pixel in world units. */
  function drawGround(ctx, px) {
    if (!geo) buildGeometry();
    // Slab sides
    ctx.fillStyle = SOIL_L;
    ctx.beginPath(); addQuad(ctx, MAP_L, MAP_B, down(MAP_B, EDGE_DEPTH), down(MAP_L, EDGE_DEPTH)); ctx.fill();
    ctx.fillStyle = SOIL_R;
    ctx.beginPath(); addQuad(ctx, MAP_B, MAP_R, down(MAP_R, EDGE_DEPTH), down(MAP_B, EDGE_DEPTH)); ctx.fill();
    for (const [c, p] of geo.sides) { ctx.fillStyle = c; ctx.fill(p); }

    // Base fill hides anti-aliasing seams between tiles of different colours
    ctx.fillStyle = COLORS.grass[0];
    ctx.beginPath(); addQuad(ctx, MAP_T, MAP_R, MAP_B, MAP_L); ctx.fill();
    for (const [c, p] of geo.fills) { ctx.fillStyle = c; ctx.fill(p); }

    ctx.fillStyle = WATER_WALL;
    ctx.fill(geo.walls);

    ctx.lineCap = 'round';
    ctx.strokeStyle = RIPPLE;
    ctx.lineWidth = 1.3;
    ctx.stroke(geo.ripples);

    ctx.strokeStyle = CURB;
    ctx.lineWidth = Math.max(1.5, px * 1.5);
    ctx.stroke(geo.curbs);

    // Crisp highlight along the front edges of the slab
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth = px * 1.5;
    ctx.beginPath(); ctx.moveTo(MAP_L[0], MAP_L[1]); ctx.lineTo(MAP_B[0], MAP_B[1]); ctx.lineTo(MAP_R[0], MAP_R[1]); ctx.stroke();
  }

  /** Thin, low-opacity grid lines (one device pixel wide). */
  function drawGrid(ctx, zoom, px) {
    const fade = Math.max(0, Math.min(1, (zoom - 0.35) / 0.4));
    if (fade <= 0) return;
    ctx.beginPath();
    for (let i = 1; i < N; i++) {
      let a = gp(i, 0), b = gp(i, N);
      ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]);
      a = gp(0, i); b = gp(N, i);
      ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]);
    }
    ctx.lineWidth = px;
    ctx.strokeStyle = `rgba(20, 45, 35, ${0.13 * fade})`;
    ctx.stroke();
  }

  function setTiles(x0, y0, x1, y1, t) {
    let changed = 0;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (map[y * N + x] !== t) { map[y * N + x] = t; changed++; }
      }
    }
    if (changed) geo = null; // rebuilt lazily on next draw
    return changed;
  }

  Zoo.terrain = {
    TILE_W, TILE_H, HALF_W, HALF_H, N, EDGE_DEPTH,
    T, TERRAIN_NAMES, KEYS, COLORS, SIDE, SOIL_L, SOIL_R, ENTRANCE,
    map, tileAt, inMap, isPath, toFx, toFy,
    drawGround, drawGrid, setTiles, buildGeometry,
    mulberry32, hash,
  };
})();
