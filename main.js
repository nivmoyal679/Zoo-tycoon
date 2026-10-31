/* =========================================================
 * Retro Zoo Tycoon — STEP 1
 * Isometric map, pan / pinch-zoom camera, status bar.
 * ========================================================= */
(() => {
  'use strict';

  // ---------- Config ----------
  const TILE_W = 64;            // diamond width  (px, world units)
  const TILE_H = 32;            // diamond height (px, world units)
  const HALF_W = TILE_W / 2;
  const HALF_H = TILE_H / 2;
  const MAP_SIZE = 40;          // 40 x 40 tiles
  const EDGE_DEPTH = 14;        // earth "cliff" under the map border
  const MIN_ZOOM = 0.35;
  const MAX_ZOOM = 3;
  const TAP_SLOP = 8;           // px of movement before a press counts as a drag
  const MS_PER_DAY = 1000;      // game clock speed

  const START_CASH = 10000;

  // ---------- Terrain ----------
  const T = { GRASS: 0, DIRT: 1, WATER: 2, PATH: 3 };
  const TERRAIN = {
    [T.GRASS]: { name: 'Grass', base: '#4f9a2e', dark: '#3f8224', light: '#66b23c', edge: '#3a7420' },
    [T.DIRT]:  { name: 'Dirt',  base: '#9b7240', dark: '#86602f', light: '#b08550', edge: '#76542a' },
    [T.WATER]: { name: 'Water', base: '#2f74c0', dark: '#2662a8', light: '#5a9be0', edge: '#22599a' },
    [T.PATH]:  { name: 'Path',  base: '#c9b48a', dark: '#b39e74', light: '#ddc9a0', edge: '#a38e66' },
  };

  // ---------- DOM ----------
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d', { alpha: false });
  const cashEl = document.getElementById('cash-value');
  const dateEl = document.getElementById('date-value');
  const infoEl = document.getElementById('tile-info');

  // ---------- Seeded RNG + value noise (deterministic map) ----------
  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const rand = mulberry32(1987);

  function makeNoise(size, cell) {
    const g = [];
    const n = Math.ceil(size / cell) + 2;
    for (let i = 0; i < n * n; i++) g.push(rand());
    const at = (x, y) => g[y * n + x];
    const smooth = t => t * t * (3 - 2 * t);
    return (x, y) => {
      const gx = x / cell, gy = y / cell;
      const x0 = Math.floor(gx), y0 = Math.floor(gy);
      const sx = smooth(gx - x0), sy = smooth(gy - y0);
      const a = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * sx;
      const b = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * sx;
      return a + (b - a) * sy;
    };
  }

  // ---------- Map generation ----------
  const map = new Uint8Array(MAP_SIZE * MAP_SIZE);
  const tileAt = (x, y) => map[y * MAP_SIZE + x];

  (function generateMap() {
    const water = makeNoise(MAP_SIZE, 9);
    const dirt = makeNoise(MAP_SIZE, 5);
    const mid = Math.floor(MAP_SIZE / 2);
    for (let y = 0; y < MAP_SIZE; y++) {
      for (let x = 0; x < MAP_SIZE; x++) {
        let t = T.GRASS;
        if (water(x, y) > 0.72) t = T.WATER;
        else if (dirt(x, y) > 0.74) t = T.DIRT;
        map[y * MAP_SIZE + x] = t;
      }
    }
    // Entrance path running in from the front edge of the map
    for (let y = mid; y < MAP_SIZE; y++) {
      map[y * MAP_SIZE + mid] = T.PATH;
      map[y * MAP_SIZE + mid - 1] = T.PATH;
    }
  })();

  // ---------- Pre-rendered ground layer ----------
  // The whole map is drawn once into an offscreen canvas. Each frame is then a
  // single drawImage, which keeps panning/zooming smooth on phones.
  const ORIGIN_X = MAP_SIZE * HALF_W;  // world (0,0) inside the ground cache
  const ORIGIN_Y = 0;
  const ground = document.createElement('canvas');
  ground.width = MAP_SIZE * TILE_W;
  ground.height = MAP_SIZE * TILE_H + EDGE_DEPTH;
  const gctx = ground.getContext('2d');

  // Half-width of a pixel-art diamond at row r (0..TILE_H-1)
  const rowHalf = r => (r < HALF_H ? (r + 1) * 2 : (TILE_H - r) * 2);

  function drawTile(tx, ty) {
    const t = TERRAIN[tileAt(tx, ty)];
    const cx = ORIGIN_X + (tx - ty) * HALF_W;   // top vertex
    const cy = ORIGIN_Y + (tx + ty) * HALF_H;
    const r = mulberry32(tx * 7919 + ty * 104729);

    // Earth cliff under the front edges of the map (drawn first so the
    // tile body sits on top of it)
    const sideL = ty === MAP_SIZE - 1;
    const sideR = tx === MAP_SIZE - 1;
    if (sideL || sideR) {
      for (let row = HALF_H; row < TILE_H; row++) {
        const hw = rowHalf(row);
        if (sideL) { gctx.fillStyle = '#6b4423'; gctx.fillRect(cx - hw, cy + row + 1, hw, EDGE_DEPTH); }
        if (sideR) { gctx.fillStyle = '#4e301a'; gctx.fillRect(cx, cy + row + 1, hw, EDGE_DEPTH); }
      }
    }

    // Body, row by row (crisp, seam-free pixel diamond)
    gctx.fillStyle = t.base;
    for (let row = 0; row < TILE_H; row++) {
      const hw = rowHalf(row);
      gctx.fillRect(cx - hw, cy + row, hw * 2, 1);
    }

    // Speckle texture
    for (let i = 0; i < 14; i++) {
      const row = 2 + Math.floor(r() * (TILE_H - 4));
      const hw = rowHalf(row) - 2;
      if (hw <= 2) continue;
      const px = cx - hw + Math.floor(r() * (hw * 2 - 2));
      gctx.fillStyle = r() < 0.5 ? t.dark : t.light;
      gctx.fillRect(px, cy + row, 2, 1);
    }

    // Subtle grid: shade the two top edges of the diamond
    gctx.fillStyle = t.edge;
    for (let row = 0; row < HALF_H; row++) {
      const hw = rowHalf(row);
      gctx.fillRect(cx - hw, cy + row, 2, 1);
      gctx.fillRect(cx + hw - 2, cy + row, 2, 1);
    }

  }

  function renderGround() {
    gctx.clearRect(0, 0, ground.width, ground.height);
    // Back-to-front so the cliff edges overlap correctly
    for (let s = 0; s < MAP_SIZE * 2 - 1; s++) {
      for (let tx = 0; tx <= s; tx++) {
        const ty = s - tx;
        if (tx < MAP_SIZE && ty < MAP_SIZE) drawTile(tx, ty);
      }
    }
  }
  renderGround();

  // ---------- Camera ----------
  // cam.x / cam.y = world point shown at the centre of the screen.
  const MAP_CENTER = { x: 0, y: MAP_SIZE * HALF_H };
  const cam = { x: MAP_CENTER.x, y: MAP_CENTER.y, zoom: 1 };
  let viewW = 0, viewH = 0, dpr = 1;
  let dirty = true;

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
    const fx = (wx / HALF_W + wy / HALF_H) / 2;
    const fy = (wy / HALF_H - wx / HALF_W) / 2;
    const tx = Math.floor(fx), ty = Math.floor(fy);
    if (tx < 0 || ty < 0 || tx >= MAP_SIZE || ty >= MAP_SIZE) return null;
    return { x: tx, y: ty };
  }

  function clampCamera() {
    // Keep the camera centre within the map's diamond bounding box
    const maxX = MAP_SIZE * HALF_W;
    cam.x = Math.max(-maxX, Math.min(maxX, cam.x));
    cam.y = Math.max(0, Math.min(MAP_SIZE * TILE_H, cam.y));
  }

  function setZoom(z, sx = viewW / 2, sy = viewH / 2) {
    const before = screenToWorld(sx, sy);
    cam.zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z));
    // Keep the world point under (sx, sy) fixed
    cam.x = before.x - (sx - viewW / 2) / cam.zoom;
    cam.y = before.y - (sy - viewH / 2) / cam.zoom;
    clampCamera();
    dirty = true;
  }

  // Smooth animated zoom for buttons
  let zoomAnim = null;
  function animateZoom(target, sx, sy) {
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
      // Anchor the pinched world point under the fingers (zoom + pan at once)
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

  // Zoom buttons
  document.getElementById('zoom-in').addEventListener('click', () => animateZoom(cam.zoom * 1.4, viewW / 2, viewH / 2));
  document.getElementById('zoom-out').addEventListener('click', () => animateZoom(cam.zoom / 1.4, viewW / 2, viewH / 2));
  document.getElementById('zoom-reset').addEventListener('click', () => {
    cam.x = MAP_CENTER.x; cam.y = MAP_CENTER.y;
    animateZoom(1, viewW / 2, viewH / 2);
    dirty = true;
  });

  // Keyboard (desktop convenience)
  window.addEventListener('keydown', e => {
    const step = 40 / cam.zoom;
    const k = e.key;
    if (k === 'ArrowLeft' || k === 'a') cam.x -= step;
    else if (k === 'ArrowRight' || k === 'd') cam.x += step;
    else if (k === 'ArrowUp' || k === 'w') cam.y -= step;
    else if (k === 'ArrowDown' || k === 's') cam.y += step;
    else if (k === '+' || k === '=') return animateZoom(cam.zoom * 1.4, viewW / 2, viewH / 2);
    else if (k === '-') return animateZoom(cam.zoom / 1.4, viewW / 2, viewH / 2);
    else return;
    clampCamera();
    dirty = true;
  });

  const sameTile = (a, b) => (a === b) || (a && b && a.x === b.x && a.y === b.y);

  function selectAt(sx, sy) {
    const w = screenToWorld(sx, sy);
    const t = worldToTile(w.x, w.y);
    selectedTile = sameTile(t, selectedTile) ? null : t;
    if (selectedTile) {
      const name = TERRAIN[tileAt(selectedTile.x, selectedTile.y)].name;
      infoEl.innerHTML = `TILE ${selectedTile.x},${selectedTile.y}<br>${name.toUpperCase()}`;
      infoEl.hidden = false;
    } else {
      infoEl.hidden = true;
    }
    dirty = true;
  }

  // ---------- Rendering ----------
  function strokeTile(tile, color, width) {
    const wx = (tile.x - tile.y) * HALF_W;
    const wy = (tile.x + tile.y) * HALF_H;
    ctx.beginPath();
    ctx.moveTo(wx, wy);
    ctx.lineTo(wx + HALF_W, wy + HALF_H);
    ctx.lineTo(wx, wy + TILE_H);
    ctx.lineTo(wx - HALF_W, wy + HALF_H);
    ctx.closePath();
    ctx.lineWidth = width / cam.zoom;
    ctx.strokeStyle = color;
    ctx.stroke();
  }

  function render() {
    // Background
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#1b2a12';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // World transform: screen = (world - cam) * zoom + viewCenter
    const s = cam.zoom * dpr;
    ctx.setTransform(s, 0, 0, s,
      Math.round((viewW / 2 - cam.x * cam.zoom) * dpr),
      Math.round((viewH / 2 - cam.y * cam.zoom) * dpr));
    ctx.imageSmoothingEnabled = cam.zoom < 1; // pixel-crisp when zoomed in

    // Ground: blit only the visible part of the cache
    const tl = screenToWorld(0, 0);
    const br = screenToWorld(viewW, viewH);
    const sx = Math.max(0, Math.floor(tl.x + ORIGIN_X));
    const sy = Math.max(0, Math.floor(tl.y + ORIGIN_Y));
    const ex = Math.min(ground.width, Math.ceil(br.x + ORIGIN_X));
    const ey = Math.min(ground.height, Math.ceil(br.y + ORIGIN_Y));
    if (ex > sx && ey > sy) {
      ctx.drawImage(ground, sx, sy, ex - sx, ey - sy,
        sx - ORIGIN_X, sy - ORIGIN_Y, ex - sx, ey - sy);
    }

    // Overlays
    if (hoverTile && !sameTile(hoverTile, selectedTile)) strokeTile(hoverTile, 'rgba(255,255,255,0.6)', 1.5);
    if (selectedTile) strokeTile(selectedTile, '#ffe14d', 2.5);
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

    // Game clock
    state.dayTimer += dt;
    if (state.dayTimer >= MS_PER_DAY) {
      while (state.dayTimer >= MS_PER_DAY) {
        state.dayTimer -= MS_PER_DAY;
        state.date.setDate(state.date.getDate() + 1);
      }
      updateHUD();
    }

    // Zoom animation
    if (zoomAnim) {
      const k = Math.min(1, (now - zoomAnim.t0) / zoomAnim.dur);
      const e = 1 - Math.pow(1 - k, 3);
      setZoom(zoomAnim.from + (zoomAnim.to - zoomAnim.from) * e, zoomAnim.sx, zoomAnim.sy);
      if (k >= 1) zoomAnim = null;
    }

    // Only redraw the canvas when something changed (saves battery)
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
  requestAnimationFrame(frame);
})();
