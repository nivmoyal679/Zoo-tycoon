/* =========================================================
 * Zoo Tycoon — main.js
 * Camera, input, construction tools, fences, enclosures,
 * animals / staff / guests AI, depth-sorted vector rendering, HUD.
 * Depends on terrain.js and sprites.js (window.Zoo).
 * ========================================================= */
(() => {
  'use strict';

  const { TILE_H, HALF_W, HALF_H, N, EDGE_DEPTH, T, TERRAIN_NAMES, ENTRANCE, tileAt, inMap, isPath, toFx, toFy } = Zoo.terrain;
  const SPR = Zoo.sprites;

  // ---------- Config ----------
  const MIN_ZOOM = 0.35;
  const MAX_ZOOM = 3.5;
  const TAP_SLOP = 8;
  const MS_PER_DAY = 1000;
  const START_CASH = 10000;
  const ADMISSION = 15;
  const KEEPER_SALARY = 80;
  const ANIMAL_UPKEEP = 25;
  const MAX_GUESTS = 80;
  const EDGE_MARGIN = 0.3;

  const ACCENT = '#10B981';
  const DANGER = '#EF4444';

  const SPECIES = {
    lion:     { name: 'Lion',     speed: 0.55 },
    elephant: { name: 'Elephant', speed: 0.35 },
    zebra:    { name: 'Zebra',    speed: 0.75 },
  };
  const NAMES = ['Kito', 'Zara', 'Bomani', 'Tembo', 'Juma', 'Asha', 'Rafi', 'Nia', 'Duma', 'Imani', 'Jabari', 'Sefu', 'Amara', 'Kofi', 'Pili', 'Taji'];

  const REMOVE_ICON = 'data:image/svg+xml;utf8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48" fill="none" stroke="#EF4444" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M10 14h28M19 14v-3a2 2 0 012-2h6a2 2 0 012 2v3M14 14l2 24a3 3 0 003 3h10a3 3 0 003-3l2-24M21 21v13M27 21v13"/></svg>');

  // ---------- Tool catalogue ----------
  const TOOLS = {
    terrain: [
      { id: 'grass', name: 'Grass', price: 10, unit: '/tile', kind: 'terrain', terrain: T.GRASS },
      { id: 'dirt',  name: 'Dirt',  price: 10, unit: '/tile', kind: 'terrain', terrain: T.DIRT },
      { id: 'water', name: 'Water', price: 25, unit: '/tile', kind: 'terrain', terrain: T.WATER },
      { id: 'path',  name: 'Path',  price: 15, unit: '/tile', kind: 'terrain', terrain: T.PATH },
    ],
    fences: [
      { id: 'wood',   name: 'Wood Fence', price: 25, unit: '/m', kind: 'fence', fence: 1 },
      { id: 'iron',   name: 'Iron Fence', price: 50, unit: '/m', kind: 'fence', fence: 2 },
      { id: 'remove', name: 'Remove',     price: 0, kind: 'remove', icon: REMOVE_ICON },
    ],
    animals: [
      { id: 'lion',     name: 'Lion',     price: 1500, kind: 'animal', species: 'lion' },
      { id: 'elephant', name: 'Elephant', price: 2500, kind: 'animal', species: 'elephant' },
      { id: 'zebra',    name: 'Zebra',    price: 800,  kind: 'animal', species: 'zebra' },
    ],
    staff: [
      { id: 'keeper', name: 'Zookeeper', price: 300, kind: 'staff' },
      { id: 'guests', kind: 'info' },
    ],
  };
  const ALL_TOOLS = Object.values(TOOLS).flat();

  // ---------- DOM ----------
  const $ = id => document.getElementById(id);
  const canvas = $('game');
  const ctx = canvas.getContext('2d', { alpha: false });
  const cashEl = $('cash-value');
  const dateEl = $('date-value');
  const infoEl = $('tile-info');
  const infoText = $('tile-info-text');
  const loadingEl = $('loading');
  const gridBtn = $('grid-toggle');
  const hintEl = $('hint');
  const hintText = $('hint-text');
  const hintCancel = $('hint-cancel');
  const trayEl = $('tray');
  const trayItems = $('tray-items');

  // ---------- Helpers ----------
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];
  const fmtCash = n => (n < 0 ? '-$' : '$') + Math.abs(Math.round(n)).toLocaleString('en-US');
  const tileToWorld = (fx, fy) => ({ x: (fx - fy) * HALF_W, y: (fx + fy) * HALF_H });
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  function shuffled(a) {
    a = a.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }

  // =========================================================
  // Game state
  // =========================================================
  const state = { cash: START_CASH, date: new Date(2000, 0, 1), dayTimer: 0, guestTimer: 3 };
  const entities = [];
  const floats = [];
  let nextId = 1;

  // =========================================================
  // Fences on tile edges
  // vEdge(x,y): between tiles (x-1,y) and (x,y), grid point (x,y) -> (x,y+1)
  // hEdge(x,y): between tiles (x,y-1) and (x,y), grid point (x,y) -> (x+1,y)
  // =========================================================
  const vEdge = new Uint8Array((N + 1) * N);
  const hEdge = new Uint8Array(N * (N + 1));
  const vI = (x, y) => y * (N + 1) + x;
  const hI = (x, y) => y * N + x;
  const getEdge = e => (e.o === 'v' ? vEdge[vI(e.x, e.y)] : hEdge[hI(e.x, e.y)]);
  const setEdge = (e, v) => { if (e.o === 'v') vEdge[vI(e.x, e.y)] = v; else hEdge[hI(e.x, e.y)] = v; };

  function fenceBetween(ax, ay, bx, by) {
    if (bx === ax + 1) return vEdge[vI(ax + 1, ay)];
    if (bx === ax - 1) return vEdge[vI(ax, ay)];
    if (by === ay + 1) return hEdge[hI(ax, ay + 1)];
    if (by === ay - 1) return hEdge[hI(ax, ay)];
    return 0;
  }

  function fenceEdgesFor(a, b) {
    const out = [];
    const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x);
    const y0 = Math.min(a.y, b.y), y1 = Math.max(a.y, b.y);
    const hLine = y => { for (let x = x0; x < x1; x++) out.push({ o: 'h', x, y }); };
    const vLine = x => { for (let y = y0; y < y1; y++) out.push({ o: 'v', x, y }); };
    if (x0 === x1 && y0 === y1) return out;
    if (y0 === y1) hLine(y0);
    else if (x0 === x1) vLine(x0);
    else { hLine(y0); hLine(y1); vLine(x0); vLine(x1); }
    return out;
  }

  // Depth-keyed render items for fences (rebuilt when fences change)
  let fenceItems = [];
  function segItem(o, x, y, type) {
    const a = tileToWorld(x, y);
    const b = o === 'h' ? tileToWorld(x + 1, y) : tileToWorld(x, y + 1);
    return { key: (a.y + b.y) / 2 - 0.1, kind: 'seg', type, ax: a.x, ay: a.y, bx: b.x, by: b.y, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }
  function rebuildFenceItems() {
    fenceItems = [];
    const posts = new Map();
    const touch = (gx, gy, type, o) => {
      const k = gy * (N + 1) + gx;
      const p = posts.get(k) || { gx, gy, type: 0, h: false, v: false };
      p.type = Math.max(p.type, type);
      p[o] = true;
      posts.set(k, p);
    };
    for (let y = 0; y <= N; y++) for (let x = 0; x < N; x++) {
      const t = hEdge[hI(x, y)];
      if (!t) continue;
      fenceItems.push(segItem('h', x, y, t));
      touch(x, y, t, 'h'); touch(x + 1, y, t, 'h');
    }
    for (let y = 0; y < N; y++) for (let x = 0; x <= N; x++) {
      const t = vEdge[vI(x, y)];
      if (!t) continue;
      fenceItems.push(segItem('v', x, y, t));
      touch(x, y, t, 'v'); touch(x, y + 1, t, 'v');
    }
    for (const p of posts.values()) {
      const w = tileToWorld(p.gx, p.gy);
      fenceItems.push({ key: w.y + HALF_H / 2 - 0.05, kind: 'post', type: p.type, corner: p.h && p.v, x: w.x, y: w.y });
    }
  }

  // ---------- Enclosures ----------
  const comp = new Int32Array(N * N);
  let compOpen = [];
  let compSize = [];
  function computeEnclosures() {
    comp.fill(-1);
    compOpen = []; compSize = [];
    const stack = [];
    let id = 0;
    for (let s = 0; s < N * N; s++) {
      if (comp[s] !== -1) continue;
      let open = false, size = 0;
      comp[s] = id; stack.push(s);
      while (stack.length) {
        const i = stack.pop();
        const x = i % N, y = (i / N) | 0;
        size++;
        for (const [dx, dy] of DIRS) {
          const nx = x + dx, ny = y + dy;
          const f = fenceBetween(x, y, nx, ny);
          if (!inMap(nx, ny)) { if (!f) open = true; continue; }
          const j = ny * N + nx;
          if (!f && comp[j] === -1) { comp[j] = id; stack.push(j); }
        }
      }
      compOpen.push(open); compSize.push(size);
      id++;
    }
  }
  const isEnclosed = (x, y) => !compOpen[comp[y * N + x]];

  // ---------- Guest navigation ----------
  let exitDist = null;
  function computeExitDist() {
    exitDist = new Int32Array(N * N).fill(-1);
    const q = [];
    for (const e of ENTRANCE) if (isPath(e.x, e.y)) { exitDist[e.y * N + e.x] = 0; q.push(e.y * N + e.x); }
    for (let h = 0; h < q.length; h++) {
      const i = q[h], x = i % N, y = (i / N) | 0;
      for (const [dx, dy] of DIRS) {
        const nx = x + dx, ny = y + dy;
        if (!isPath(nx, ny) || fenceBetween(x, y, nx, ny)) continue;
        const j = ny * N + nx;
        if (exitDist[j] === -1) { exitDist[j] = exitDist[i] + 1; q.push(j); }
      }
    }
  }

  function worldChanged() {
    rebuildFenceItems();
    computeEnclosures();
    computeExitDist();
    for (const e of entities) {
      if (!e.tgt || e.kind === 'keeper') continue;
      const ax = Math.floor(e.fx), ay = Math.floor(e.fy);
      const bx = Math.floor(e.tgt.x), by = Math.floor(e.tgt.y);
      if ((ax !== bx || ay !== by) && fenceBetween(ax, ay, bx, by)) e.tgt = null;
    }
    for (const e of entities) if (e.kind === 'animal') e.escaped = !isEnclosed(Math.floor(e.fx), Math.floor(e.fy));
    dirty = true;
  }

  // =========================================================
  // Entities
  // =========================================================
  function spawn(kind, tx, ty, extra) {
    const e = {
      id: nextId++, kind,
      fx: tx + 0.5 + rand(-0.15, 0.15), fy: ty + 0.5 + rand(-0.15, 0.15),
      tgt: null, wait: rand(0.3, 1.5), anim: 0, facing: Math.random() < 0.5 ? 1 : -1, moving: false,
      ...extra,
    };
    entities.push(e);
    return e;
  }

  function removeEntity(e) {
    const i = entities.indexOf(e);
    if (i >= 0) entities.splice(i, 1);
    if (selectedEntity === e) { selectedEntity = null; infoEl.hidden = true; }
  }

  function stepToward(e, speed, dt) {
    const dx = e.tgt.x - e.fx, dy = e.tgt.y - e.fy;
    const d = Math.hypot(dx, dy);
    const step = speed * dt;
    const sdx = dx - dy;
    if (Math.abs(sdx) > 0.02) e.facing = sdx > 0 ? 1 : -1;
    e.moving = true;
    e.anim += step * 7;
    if (d <= step) { e.fx = e.tgt.x; e.fy = e.tgt.y; e.tgt = null; return true; }
    e.fx += (dx / d) * step;
    e.fy += (dy / d) * step;
    return false;
  }

  const randomSpot = (x, y) => ({ x: x + rand(EDGE_MARGIN, 1 - EDGE_MARGIN), y: y + rand(EDGE_MARGIN, 1 - EDGE_MARGIN) });

  function wander(e, dt, speed, canEnter) {
    if (!e.tgt) {
      e.moving = false;
      e.wait -= dt;
      if (e.wait > 0) return;
      const tx = Math.floor(e.fx), ty = Math.floor(e.fy);
      let nx = tx, ny = ty;
      if (Math.random() < 0.6) {
        for (const [dx, dy] of shuffled(DIRS)) {
          if (inMap(tx + dx, ty + dy) && canEnter(tx, ty, tx + dx, ty + dy)) { nx = tx + dx; ny = ty + dy; break; }
        }
      }
      e.tgt = randomSpot(nx, ny);
      return;
    }
    if (stepToward(e, speed, dt)) e.wait = rand(0.6, 3);
  }

  const animalCanEnter = (ax, ay, bx, by) => !fenceBetween(ax, ay, bx, by) && tileAt(bx, by) !== T.WATER;
  const keeperCanEnter = (ax, ay, bx, by) => tileAt(bx, by) !== T.WATER;

  function updateGuest(e, dt) {
    e.life -= dt;
    if (e.life <= 0) e.leaving = true;

    e.donateT -= dt;
    if (e.donateT <= 0) {
      e.donateT = rand(5, 10);
      if (!e.leaving && entities.some(a => a.kind === 'animal' && (a.fx - e.fx) ** 2 + (a.fy - e.fy) ** 2 < 16)) {
        addCash(1 + Math.floor(Math.random() * 4), e.fx, e.fy);
      }
    }

    if (e.tgt) { stepToward(e, 0.9, dt); return; }
    e.moving = false;
    if (e.wait > 0) { e.wait -= dt; return; }

    const cx = Math.floor(e.fx), cy = Math.floor(e.fy);
    if (!isPath(cx, cy)) { removeEntity(e); return; }
    const here = exitDist[cy * N + cx];
    if (e.leaving && here === 0) { removeEntity(e); return; }

    const opts = [];
    for (const [dx, dy] of DIRS) {
      const nx = cx + dx, ny = cy + dy;
      if (isPath(nx, ny) && !fenceBetween(cx, cy, nx, ny)) opts.push([nx, ny]);
    }
    if (!opts.length) { e.wait = 1; return; }

    let next;
    if (e.leaving && here > 0) next = opts.find(([x, y]) => exitDist[y * N + x] >= 0 && exitDist[y * N + x] < here);
    if (!next) {
      const fwd = opts.filter(([x, y]) => !(e.prev && e.prev.x === x && e.prev.y === y));
      next = pick(fwd.length ? fwd : opts);
      if (Math.random() < 0.15) e.wait = rand(0.5, 2.5);
    }
    e.prev = { x: cx, y: cy };
    e.tgt = { x: next[0] + 0.5 + e.ox, y: next[1] + 0.5 + e.oy };
  }

  function spawnGuest() {
    const gates = ENTRANCE.filter(g => isPath(g.x, g.y));
    if (!gates.length) return;
    const g = pick(gates);
    const e = spawn('guest', g.x, g.y, {
      look: SPR.GUEST_LOOKS[Math.floor(Math.random() * SPR.GUEST_LOOKS.length)],
      ox: rand(-0.22, 0.22), oy: rand(-0.22, 0.22),
      life: rand(40, 90), donateT: rand(3, 8), leaving: false, prev: null, wait: 0,
    });
    e.fx = g.x + 0.5 + e.ox; e.fy = g.y + 0.85;
    addCash(ADMISSION, e.fx, e.fy);
  }

  const countKind = k => entities.reduce((n, e) => n + (e.kind === k), 0);

  function updateEntities(dt) {
    for (let i = entities.length - 1; i >= 0; i--) {
      const e = entities[i];
      if (e.kind === 'animal') wander(e, dt, SPECIES[e.species].speed, animalCanEnter);
      else if (e.kind === 'keeper') wander(e, dt, 0.7, keeperCanEnter);
      else if (e.kind === 'guest') updateGuest(e, dt);
    }
    const animals = countKind('animal');
    if (animals > 0 && countKind('guest') < MAX_GUESTS) {
      state.guestTimer -= dt;
      if (state.guestTimer <= 0) {
        state.guestTimer = Math.max(1.5, 12 / (1 + animals * 0.7)) * rand(0.7, 1.3);
        spawnGuest();
      }
    }
  }

  // =========================================================
  // Money & feedback
  // =========================================================
  function addCash(amount, fx, fy) {
    state.cash += amount;
    if (fx !== undefined) {
      const w = tileToWorld(fx, fy);
      floats.push({ x: w.x, y: w.y - 24, text: (amount >= 0 ? '+' : '−') + fmtCash(Math.abs(amount)), color: amount >= 0 ? '#059669' : '#DC2626', t: 0 });
    }
    hudDirty = true;
  }

  function canAfford(cost) {
    if (cost <= state.cash) return true;
    flash(`Not enough money — you need ${fmtCash(cost)}`, 'error');
    return false;
  }

  // =========================================================
  // Camera
  // =========================================================
  const MAP_CENTER = { x: 0, y: N * HALF_H };
  const DEFAULT_ZOOM = 1;
  const cam = { x: MAP_CENTER.x, y: MAP_CENTER.y, zoom: DEFAULT_ZOOM };
  let viewW = 0, viewH = 0, dpr = 1;
  let dirty = true;
  let showGrid = true;
  let bgGradient = null;

  function resize() {
    const rect = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 3); // vector art: render at full device resolution
    viewW = rect.width;
    viewH = rect.height;
    canvas.width = Math.round(viewW * dpr);
    canvas.height = Math.round(viewH * dpr);
    bgGradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    bgGradient.addColorStop(0, '#EAF3F6');
    bgGradient.addColorStop(1, '#D3E4EA');
    dirty = true;
  }

  const screenToWorld = (sx, sy) => ({ x: cam.x + (sx - viewW / 2) / cam.zoom, y: cam.y + (sy - viewH / 2) / cam.zoom });
  const worldToScreen = (wx, wy) => ({ x: (wx - cam.x) * cam.zoom + viewW / 2, y: (wy - cam.y) * cam.zoom + viewH / 2 });

  function tileFromWorld(w) {
    const tx = Math.floor(toFx(w.x, w.y)), ty = Math.floor(toFy(w.x, w.y));
    return inMap(tx, ty) ? { x: tx, y: ty } : null;
  }
  function cornerFromWorld(w) {
    const gx = Math.round(toFx(w.x, w.y)), gy = Math.round(toFy(w.x, w.y));
    return gx >= 0 && gy >= 0 && gx <= N && gy <= N ? { x: gx, y: gy } : null;
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
    zoomAnim = { from: cam.zoom, to: target, sx, sy, t0: performance.now(), dur: 200 };
  }

  // =========================================================
  // Toolbar UI
  // =========================================================
  let activeTab = null;
  let tool = null;
  let pending = null;
  let selectedEntity = null;
  let selectedTile = null;
  let hoverWorld = null;
  let hudDirty = true;
  let hintMsg = null;

  function buildTray(tab) {
    trayItems.innerHTML = '';
    for (const t of TOOLS[tab]) {
      if (t.kind === 'info') {
        const card = document.createElement('div');
        card.className = 'tool info';
        card.innerHTML = `<span class="tool-name">Guests</span><span class="big" id="guest-count">0</span><span class="tool-name">Ticket $${ADMISSION}</span>`;
        trayItems.appendChild(card);
        continue;
      }
      const b = document.createElement('button');
      b.className = 'tool';
      b.dataset.tool = t.id;
      b.innerHTML = `<span class="tool-icon"><img alt="" src="${t.icon || SPR.icons[t.id]}"></span>` +
        `<span class="tool-name">${t.name}</span>` +
        `<span class="tool-price">${t.price ? fmtCash(t.price) + (t.unit || '') : 'Free'}</span>`;
      b.addEventListener('click', () => selectTool(tool === t ? null : t));
      trayItems.appendChild(b);
    }
    syncToolButtons();
    hudDirty = true;
    lastGuestCount = -1;
  }

  function syncToolButtons() {
    for (const b of trayItems.querySelectorAll('.tool[data-tool]')) b.classList.toggle('on', !!tool && tool.id === b.dataset.tool);
  }

  function setTab(tab) {
    if (activeTab === tab) trayEl.hidden = !trayEl.hidden;
    else { activeTab = tab; trayEl.hidden = false; buildTray(tab); }
    for (const el of document.querySelectorAll('.tab')) {
      const on = el.dataset.tab === activeTab && !trayEl.hidden;
      el.classList.toggle('on', on);
      el.setAttribute('aria-selected', String(on));
    }
    requestAnimationFrame(resize);
  }
  for (const el of document.querySelectorAll('.tab')) el.addEventListener('click', () => setTab(el.dataset.tab));

  function selectTool(t) {
    tool = t;
    pending = null;
    selectedEntity = null;
    selectedTile = null;
    infoEl.hidden = true;
    syncToolButtons();
    hintMsg = null;
    refreshHint();
    dirty = true;
  }

  function toolPrompt() {
    if (!tool) return '';
    switch (tool.kind) {
      case 'terrain': return pending ? 'Tap the opposite corner tile' : `${tool.name}: tap a tile to start an area`;
      case 'fence':   return pending ? 'Tap the end or opposite corner' : `${tool.name}: tap a grid corner to start`;
      case 'remove':  return 'Tap a fence, animal or keeper to remove';
      case 'animal':  return `${tool.name}: tap inside a fenced enclosure`;
      case 'staff':   return `Tap a tile to hire (${fmtCash(KEEPER_SALARY)}/month)`;
    }
    return '';
  }

  function setHint(text, cls = '') {
    hintText.textContent = text;
    hintEl.className = cls;
    hintEl.hidden = !text;
    hintCancel.hidden = !tool;
  }
  function refreshHint() { if (!hintMsg) setHint(toolPrompt()); }
  function flash(text, cls = '', ms = 2600) {
    hintMsg = { until: performance.now() + ms };
    setHint(text, cls);
  }
  hintCancel.addEventListener('click', () => selectTool(null));

  // =========================================================
  // Tool actions
  // =========================================================
  function applyTerrain(a, b) {
    const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x);
    const y0 = Math.min(a.y, b.y), y1 = Math.max(a.y, b.y);
    let count = 0;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (tileAt(x, y) !== tool.terrain) count++;
    if (!count) { flash('Nothing to change there'); return; }
    const cost = count * tool.price;
    if (!canAfford(cost)) return;
    Zoo.terrain.setTiles(x0, y0, x1, y1, tool.terrain);
    addCash(-cost, (x0 + x1 + 1) / 2, (y0 + y1 + 1) / 2);
    worldChanged();
  }

  function applyFence(a, b) {
    const edges = fenceEdgesFor(a, b).filter(e => getEdge(e) !== tool.fence);
    if (!edges.length) { flash('Already fenced'); return; }
    const cost = edges.length * tool.price;
    if (!canAfford(cost)) return;
    for (const e of edges) setEdge(e, tool.fence);
    addCash(-cost, (a.x + b.x) / 2, (a.y + b.y) / 2);
    worldChanged();
    const t = { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y) };
    if (a.x !== b.x && a.y !== b.y && isEnclosed(t.x, t.y)) {
      flash(`Enclosure ready (${compSize[comp[t.y * N + t.x]]} tiles) — add animals!`, 'good');
    }
  }

  function boundsFor(e) { return e.kind === 'animal' ? SPR.BOUNDS[e.species] : SPR.BOUNDS.person; }

  function entityAt(w, filter = () => true) {
    let best = null, bestY = -Infinity;
    for (const e of entities) {
      if (!filter(e)) continue;
      const bd = boundsFor(e);
      const p = tileToWorld(e.fx, e.fy);
      const x0 = e.facing > 0 ? bd.x0 : -bd.x1, x1 = e.facing > 0 ? bd.x1 : -bd.x0;
      const pad = 4;
      if (w.x >= p.x + x0 - pad && w.x <= p.x + x1 + pad && w.y >= p.y + bd.y0 - pad && w.y <= p.y + bd.y1 + pad && p.y > bestY) {
        best = e; bestY = p.y;
      }
    }
    return best;
  }

  function removeAt(w) {
    const e = entityAt(w, x => x.kind !== 'guest');
    if (e) {
      if (e.kind === 'animal') {
        const refund = Math.round(TOOLS.animals.find(t => t.species === e.species).price / 2);
        addCash(refund, e.fx, e.fy);
        flash(`Sold ${SPECIES[e.species].name} “${e.name}”`, 'good');
      } else flash('Zookeeper dismissed');
      removeEntity(e);
      return;
    }
    const fx = toFx(w.x, w.y), fy = toFy(w.x, w.y);
    const tx = Math.floor(fx), ty = Math.floor(fy);
    const u = fx - tx, v = fy - ty;
    const cands = [
      [u, { o: 'v', x: tx, y: ty }], [1 - u, { o: 'v', x: tx + 1, y: ty }],
      [v, { o: 'h', x: tx, y: ty }], [1 - v, { o: 'h', x: tx, y: ty + 1 }],
    ].filter(([d, e]) => d < 0.35 && e.x >= 0 && e.y >= 0 && e.x <= N && e.y <= N &&
      !(e.o === 'v' && e.y >= N) && !(e.o === 'h' && e.x >= N) && getEdge(e))
      .sort((p, q) => p[0] - q[0]);
    if (!cands.length) { flash('Nothing to remove here'); return; }
    setEdge(cands[0][1], 0);
    worldChanged();
    if (entities.some(x => x.kind === 'animal' && x.escaped)) flash('Warning: an enclosure is open!', 'error');
    else flash('Fence removed');
  }

  function placeAnimal(t) {
    if (tileAt(t.x, t.y) === T.WATER) { flash("Animals can't be placed in water", 'error'); return; }
    if (!isEnclosed(t.x, t.y)) { flash('Build a closed fence enclosure first', 'error'); return; }
    if (!canAfford(tool.price)) return;
    const e = spawn('animal', t.x, t.y, { species: tool.species, name: pick(NAMES), escaped: false });
    addCash(-tool.price, e.fx, e.fy);
    flash(`${SPECIES[tool.species].name} “${e.name}” arrived!`, 'good');
  }

  function placeKeeper(t) {
    if (tileAt(t.x, t.y) === T.WATER) { flash("Can't hire into water", 'error'); return; }
    if (!canAfford(tool.price)) return;
    const e = spawn('keeper', t.x, t.y, { name: pick(NAMES) });
    addCash(-tool.price, e.fx, e.fy);
    flash('Zookeeper hired', 'good');
  }

  function inspectAt(w) {
    const e = entityAt(w);
    if (e) {
      selectedEntity = selectedEntity === e ? null : e;
      selectedTile = null;
      if (selectedEntity) {
        let html;
        if (e.kind === 'animal') {
          html = `${SPECIES[e.species].name} “${e.name}”` +
            (e.escaped ? '<span class="warn">Escaped — fix the fence!</span>' : '<span class="dim">Safe in enclosure</span>');
        } else if (e.kind === 'keeper') {
          html = `Zookeeper ${e.name}<span class="dim">Salary ${fmtCash(KEEPER_SALARY)}/month</span>`;
        } else {
          html = `Guest<span class="dim">${e.leaving ? 'Heading home' : 'Enjoying the zoo'}</span>`;
        }
        infoText.innerHTML = html;
        infoEl.hidden = false;
      } else infoEl.hidden = true;
      dirty = true;
      return;
    }
    selectedEntity = null;
    const t = tileFromWorld(w);
    selectedTile = t && !(selectedTile && selectedTile.x === t.x && selectedTile.y === t.y) ? t : null;
    if (selectedTile) {
      const enc = isEnclosed(t.x, t.y) ? `Enclosure · ${compSize[comp[t.y * N + t.x]]} tiles` : `Tile ${t.x}, ${t.y}`;
      infoText.innerHTML = `${TERRAIN_NAMES[tileAt(t.x, t.y)]}<span class="dim">${enc}</span>`;
      infoEl.hidden = false;
    } else infoEl.hidden = true;
    dirty = true;
  }

  function handleTap(sx, sy) {
    const w = screenToWorld(sx, sy);
    if (!tool) { inspectAt(w); return; }
    switch (tool.kind) {
      case 'terrain': {
        const t = tileFromWorld(w);
        if (!t) return;
        if (!pending) pending = { a: t };
        else { applyTerrain(pending.a, t); pending = null; }
        break;
      }
      case 'fence': {
        const g = cornerFromWorld(w);
        if (!g) return;
        if (!pending) pending = { a: g };
        else if (pending.a.x === g.x && pending.a.y === g.y) pending = null;
        else { applyFence(pending.a, g); pending = null; }
        break;
      }
      case 'remove': removeAt(w); break;
      case 'animal': { const t = tileFromWorld(w); if (t) placeAnimal(t); break; }
      case 'staff':  { const t = tileFromWorld(w); if (t) placeKeeper(t); break; }
    }
    refreshHint();
    dirty = true;
  }

  // =========================================================
  // Input
  // =========================================================
  const pointers = new Map();
  let drag = null;
  let pinch = null;

  const localPos = e => {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  function startPinch() {
    const [a, b] = [...pointers.values()];
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, zoom: cam.zoom, world: screenToWorld(mid.x, mid.y) };
    drag = null;
  }

  canvas.addEventListener('pointerdown', e => {
    canvas.setPointerCapture(e.pointerId);
    const p = localPos(e);
    pointers.set(e.pointerId, p);
    zoomAnim = null;
    if (pointers.size === 1) drag = { startX: p.x, startY: p.y, camX: cam.x, camY: cam.y, moved: false };
    else if (pointers.size === 2) startPinch();
  });

  canvas.addEventListener('pointermove', e => {
    const p = localPos(e);
    if (e.pointerType === 'mouse') { hoverWorld = screenToWorld(p.x, p.y); dirty = true; }
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, p);

    if (pinch && pointers.size >= 2) {
      const [a, b] = [...pointers.values()];
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      cam.zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, pinch.zoom * dist / pinch.dist));
      cam.x = pinch.world.x - (mid.x - viewW / 2) / cam.zoom;
      cam.y = pinch.world.y - (mid.y - viewH / 2) / cam.zoom;
      clampCamera();
      dirty = true;
    } else if (drag) {
      const dx = p.x - drag.startX, dy = p.y - drag.startY;
      if (!drag.moved && Math.hypot(dx, dy) > TAP_SLOP) { drag.moved = true; canvas.classList.add('dragging'); }
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
    if (wasTap) handleTap(p.x, p.y);
    if (pointers.size === 1) {
      const [rest] = [...pointers.values()];
      pinch = null;
      drag = { startX: rest.x, startY: rest.y, camX: cam.x, camY: cam.y, moved: true };
    } else if (pointers.size === 0) {
      drag = null; pinch = null;
      canvas.classList.remove('dragging');
    }
  }
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);
  canvas.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') { hoverWorld = null; dirty = true; } });

  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    zoomAnim = null;
    const p = localPos(e);
    setZoom(cam.zoom * Math.exp(-e.deltaY * 0.0015), p.x, p.y);
    hoverWorld = screenToWorld(p.x, p.y);
  }, { passive: false });

  ['gesturestart', 'gesturechange', 'gestureend'].forEach(ev =>
    document.addEventListener(ev, e => e.preventDefault(), { passive: false }));
  document.addEventListener('contextmenu', e => e.preventDefault());

  function setGrid(on) {
    showGrid = on;
    gridBtn.classList.toggle('on', on);
    gridBtn.setAttribute('aria-pressed', String(on));
    dirty = true;
  }
  $('zoom-in').addEventListener('click', () => animateZoom(cam.zoom * 1.4));
  $('zoom-out').addEventListener('click', () => animateZoom(cam.zoom / 1.4));
  $('zoom-reset').addEventListener('click', () => {
    cam.x = MAP_CENTER.x; cam.y = MAP_CENTER.y;
    animateZoom(DEFAULT_ZOOM);
    dirty = true;
  });
  gridBtn.addEventListener('click', () => setGrid(!showGrid));

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
    else if (k === 'Escape') return selectTool(null);
    else return;
    clampCamera();
    dirty = true;
  });

  // =========================================================
  // Rendering (all vector, world space)
  // =========================================================
  let px = 1; // one device pixel in world units (updated every frame)

  function diamondPath(x, y, w, h) {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + w, y + h);
    ctx.lineTo(x, y + h * 2);
    ctx.lineTo(x - w, y + h);
    ctx.closePath();
  }

  function tileRectPath(a, b) {
    const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x) + 1;
    const y0 = Math.min(a.y, b.y), y1 = Math.max(a.y, b.y) + 1;
    const p0 = tileToWorld(x0, y0), p1 = tileToWorld(x1, y0), p2 = tileToWorld(x1, y1), p3 = tileToWorld(x0, y1);
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.lineTo(p3.x, p3.y);
    ctx.closePath();
  }

  /** Highlight a tile rectangle: soft tint + crisp outline (screen-constant width). */
  function highlightTiles(a, b, color, alpha) {
    tileRectPath(a, b);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.lineJoin = 'round';
    ctx.lineWidth = 2.5 / cam.zoom; // 2.5 CSS px regardless of zoom
    ctx.strokeStyle = color;
    ctx.stroke();
  }

  function drawMapShadow() {
    const span = N * HALF_W, h = N * HALF_H;
    for (const [dy, a, spread] of [[EDGE_DEPTH + 6, 0.10, 6], [EDGE_DEPTH + 16, 0.06, 18]]) {
      ctx.fillStyle = `rgba(20, 50, 70, ${a})`;
      diamondPath(0, dy, span + spread, h + spread / 2);
      ctx.fill();
    }
  }

  function drawEntity(e) {
    const p = tileToWorld(e.fx, e.fy);
    const bd = boundsFor(e);
    const w = (bd.x1 - bd.x0) * 0.36;
    ctx.fillStyle = 'rgba(20, 40, 30, 0.16)';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, w, w * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();

    const swing = e.moving ? Math.sin(e.anim * 1.7) : 0;
    ctx.save();
    ctx.translate(p.x, p.y);
    if (e.facing < 0) ctx.scale(-1, 1);
    if (e.kind === 'animal') SPR.drawAnimal(ctx, e.species, swing);
    else SPR.drawPerson(ctx, swing, e.kind === 'keeper' ? SPR.KEEPER_LOOK : e.look);
    ctx.restore();
  }

  function drawFenceItem(it) {
    if (it.kind === 'post') SPR.drawFencePost(ctx, it.type, it.x, it.y, it.corner);
    else SPR.drawFenceSegment(ctx, it.type, it.ax, it.ay, it.bx, it.by);
  }

  const drawList = [];
  function drawObjects(view) {
    drawList.length = 0;
    const inView = (x, y) => x > view.x0 - 48 && x < view.x1 + 48 && y > view.y0 - 24 && y < view.y1 + 48;
    for (const it of fenceItems) if (inView(it.x, it.y)) drawList.push(it);
    for (const e of entities) {
      const p = tileToWorld(e.fx, e.fy);
      if (inView(p.x, p.y)) drawList.push({ key: p.y, kind: 'ent', e });
    }
    drawList.sort((a, b) => a.key - b.key);
    for (const it of drawList) {
      if (it.kind === 'ent') drawEntity(it.e);
      else drawFenceItem(it);
    }
  }

  // ---------- Screen-space overlays (constant size, crisp text) ----------
  function inScreen(fn) {
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    fn();
    ctx.restore();
  }

  function pill(wx, wy, text, bg, fg = '#fff') {
    const s = worldToScreen(wx, wy);
    inScreen(() => {
      ctx.font = '700 12px Inter, system-ui, sans-serif';
      const w = ctx.measureText(text).width + 14, h = 22;
      const x = Math.round(s.x - w / 2), y = Math.round(s.y - h);
      ctx.shadowColor = 'rgba(16,24,40,0.18)'; ctx.shadowBlur = 6; ctx.shadowOffsetY = 2;
      ctx.fillStyle = bg;
      ctx.beginPath();
      ctx.moveTo(x + 11, y); ctx.arcTo(x + w, y, x + w, y + h, 11); ctx.arcTo(x + w, y + h, x, y + h, 11);
      ctx.arcTo(x, y + h, x, y, 11); ctx.arcTo(x, y, x + w, y, 11); ctx.closePath();
      ctx.fill();
      ctx.shadowColor = 'transparent';
      ctx.fillStyle = fg;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(text, x + w / 2, y + h / 2 + 0.5);
    });
  }

  function floatText(wx, wy, text, color, alpha) {
    const s = worldToScreen(wx, wy);
    inScreen(() => {
      ctx.globalAlpha = alpha;
      ctx.font = '800 14px Inter, system-ui, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      ctx.lineWidth = 4; ctx.strokeStyle = '#fff';
      ctx.strokeText(text, s.x, s.y);
      ctx.fillStyle = color;
      ctx.fillText(text, s.x, s.y);
    });
  }

  function badge(wx, wy, text, bg) {
    const s = worldToScreen(wx, wy);
    inScreen(() => {
      ctx.shadowColor = 'rgba(16,24,40,0.25)'; ctx.shadowBlur = 4; ctx.shadowOffsetY = 1;
      ctx.fillStyle = bg;
      ctx.beginPath(); ctx.arc(s.x, s.y, 9, 0, Math.PI * 2); ctx.fill();
      ctx.shadowColor = 'transparent';
      ctx.lineWidth = 2; ctx.strokeStyle = '#fff'; ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.font = '800 12px Inter, system-ui, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(text, s.x, s.y + 0.5);
    });
  }

  function cornerDot(g, fill) {
    const p = tileToWorld(g.x, g.y);
    const s = worldToScreen(p.x, p.y);
    inScreen(() => {
      ctx.shadowColor = 'rgba(16,24,40,0.25)'; ctx.shadowBlur = 4;
      ctx.beginPath(); ctx.arc(s.x, s.y, 6, 0, Math.PI * 2);
      ctx.fillStyle = fill; ctx.fill();
      ctx.shadowColor = 'transparent';
      ctx.lineWidth = 2.5; ctx.strokeStyle = '#fff'; ctx.stroke();
    });
  }

  function drawGhostFence(a, b) {
    const edges = fenceEdgesFor(a, b);
    ctx.globalAlpha = 0.55;
    for (const e of edges) {
      const it = segItem(e.o, e.x, e.y, tool.fence);
      SPR.drawFenceSegment(ctx, tool.fence, it.ax, it.ay, it.bx, it.by);
    }
    ctx.globalAlpha = 1;
    if (edges.length) {
      const cost = edges.filter(e => getEdge(e) !== tool.fence).length * tool.price;
      const p = tileToWorld(b.x, b.y);
      pill(p.x, p.y - 22, fmtCash(cost), cost > state.cash ? DANGER : '#111827');
    }
  }

  function drawToolPreview() {
    if (!tool) return;
    const hoverTile = hoverWorld && tileFromWorld(hoverWorld);
    if (tool.kind === 'terrain') {
      const a = pending ? pending.a : hoverTile;
      const b = hoverTile || (pending && pending.a);
      if (a && b) highlightTiles(a, b, ACCENT, 0.22);
    } else if (tool.kind === 'fence') {
      const hc = hoverWorld && cornerFromWorld(hoverWorld);
      if (pending && hc) drawGhostFence(pending.a, hc);
      if (hc) cornerDot(hc, 'rgba(17,24,39,0.55)');
      if (pending) cornerDot(pending.a, ACCENT);
    } else if (hoverTile && (tool.kind === 'animal' || tool.kind === 'staff')) {
      const ok = tileAt(hoverTile.x, hoverTile.y) !== T.WATER && (tool.kind === 'staff' || isEnclosed(hoverTile.x, hoverTile.y));
      highlightTiles(hoverTile, hoverTile, ok ? ACCENT : DANGER, 0.25);
    }
  }

  function render(now) {
    // Soft background
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // World transform
    const s = cam.zoom * dpr;
    ctx.setTransform(s, 0, 0, s, (viewW / 2 - cam.x * cam.zoom) * dpr, (viewH / 2 - cam.y * cam.zoom) * dpr);
    px = 1 / s;

    const tl = screenToWorld(0, 0), br = screenToWorld(viewW, viewH);
    const view = { x0: tl.x, y0: tl.y, x1: br.x, y1: br.y };

    drawMapShadow();
    Zoo.terrain.drawGround(ctx, px);
    if (showGrid) Zoo.terrain.drawGrid(ctx, cam.zoom, px);

    // Ground-level overlays
    if (!tool && hoverWorld) {
      const ht = tileFromWorld(hoverWorld);
      if (ht && !(selectedTile && ht.x === selectedTile.x && ht.y === selectedTile.y)) {
        const p = tileToWorld(ht.x, ht.y);
        diamondPath(p.x, p.y, HALF_W, HALF_H);
        ctx.lineWidth = 2 / cam.zoom;
        ctx.strokeStyle = 'rgba(255,255,255,0.9)';
        ctx.stroke();
      }
    }
    if (selectedTile) highlightTiles(selectedTile, selectedTile, ACCENT, 0.2);
    if (selectedEntity) {
      const p = tileToWorld(selectedEntity.fx, selectedEntity.fy);
      const bd = boundsFor(selectedEntity);
      const r = (bd.x1 - bd.x0) * 0.5;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, r, r * 0.45, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(16,185,129,0.18)';
      ctx.fill();
      ctx.lineWidth = 2.5 / cam.zoom;
      ctx.strokeStyle = ACCENT;
      ctx.stroke();
    }
    if (tool && tool.kind !== 'fence') drawToolPreview();

    drawObjects(view);

    if (tool && tool.kind === 'fence') drawToolPreview();

    // Status badges
    const pulse = Math.floor(now / 450) % 2 === 0;
    for (const e of entities) {
      if (e.kind === 'animal' && e.escaped && pulse) {
        const p = tileToWorld(e.fx, e.fy);
        badge(p.x, p.y + SPR.BOUNDS[e.species].y0 - 6, '!', DANGER);
      }
    }
    for (const f of floats) floatText(f.x, f.y - f.t * 20, f.text, f.color, Math.max(0, 1 - f.t / 1.4));
  }

  // =========================================================
  // HUD
  // =========================================================
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const fmtDate = d => `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
  let lastGuestCount = -1;

  function updateHUD() {
    cashEl.textContent = fmtCash(state.cash);
    cashEl.classList.toggle('negative', state.cash < 0);
    dateEl.textContent = fmtDate(state.date);
    for (const b of trayItems.querySelectorAll('.tool[data-tool]')) {
      const t = ALL_TOOLS.find(x => x.id === b.dataset.tool);
      b.classList.toggle('disabled', !!t && t.price > state.cash);
    }
    hudDirty = false;
  }

  function monthlyCosts() {
    const cost = countKind('keeper') * KEEPER_SALARY + countKind('animal') * ANIMAL_UPKEEP;
    if (!cost) return;
    state.cash -= cost;
    hudDirty = true;
    flash(`Monthly upkeep & salaries: −${fmtCash(cost)}`, 'error', 3500);
  }

  // =========================================================
  // Main loop
  // =========================================================
  let last = performance.now();
  function frame(now) {
    const dtMs = Math.min(now - last, 100);
    const dt = dtMs / 1000;
    last = now;

    state.dayTimer += dtMs;
    while (state.dayTimer >= MS_PER_DAY) {
      state.dayTimer -= MS_PER_DAY;
      state.date.setDate(state.date.getDate() + 1);
      if (state.date.getDate() === 1) monthlyCosts();
      hudDirty = true;
    }

    updateEntities(dt);
    for (let i = floats.length - 1; i >= 0; i--) {
      floats[i].t += dt;
      if (floats[i].t > 1.4) floats.splice(i, 1);
    }

    if (zoomAnim) {
      const k = Math.min(1, (now - zoomAnim.t0) / zoomAnim.dur);
      const ez = 1 - Math.pow(1 - k, 3);
      setZoom(zoomAnim.from + (zoomAnim.to - zoomAnim.from) * ez, zoomAnim.sx, zoomAnim.sy);
      if (k >= 1) zoomAnim = null;
    }

    if (hintMsg && now > hintMsg.until) { hintMsg = null; refreshHint(); }
    if (hudDirty) updateHUD();
    const gc = countKind('guest');
    if (gc !== lastGuestCount) {
      lastGuestCount = gc;
      const el = document.getElementById('guest-count');
      if (el) el.textContent = gc;
    }

    if (dirty || entities.length || floats.length || pending) {
      render(now);
      dirty = false;
    }
    requestAnimationFrame(frame);
  }

  // =========================================================
  // Boot
  // =========================================================
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 100));
  resize();
  setTab('fences');
  Zoo.terrain.buildGeometry();
  worldChanged();
  updateHUD();
  loadingEl.hidden = true;
  flash('Build a fenced enclosure, then add animals!', 'good', 5000);
  // Redraw once the web font is ready so canvas labels use it
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { dirty = true; });
  requestAnimationFrame(frame);

  window.zoo = { cam, state, entities, vEdge, hEdge, worldChanged, isEnclosed, handleTap, selectTool, TOOLS, worldToScreen, tileToWorld };
})();
