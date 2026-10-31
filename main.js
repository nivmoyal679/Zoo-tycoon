/* =========================================================
 * Zoo Tycoon 3D — main.js
 * Three.js scene, orbit camera (pan / pinch-zoom / rotate),
 * construction tools, fences, enclosures, animal / staff /
 * guest AI, HUD. Depends on three.min.js, terrain.js, models.js.
 * ========================================================= */
(() => {
  'use strict';

  const THREE = window.THREE;
  const TR = Zoo.terrain;
  const M = Zoo.models;
  const { N, T, TERRAIN_NAMES, ENTRANCE, tileAt, inMap, isPath, isWater } = TR;
  const HALF = N / 2;

  // ---------- Config ----------
  const TAP_SLOP = 8;
  const MS_PER_DAY = 1000;
  const START_CASH = 10000;
  const ADMISSION = 15;
  const KEEPER_SALARY = 80;
  const ANIMAL_UPKEEP = 25;
  const MAX_GUESTS = 60;
  const EDGE_MARGIN = 0.3;
  const MIN_DIST = 3.5, MAX_DIST = 46;
  const HOME = { tx: 0, tz: 6, dist: 22, yaw: Math.PI / 4 };

  const ACCENT = '#8ce05a';
  const DANGER = '#ff5a4a';

  const SPECIES = {
    lion:     { name: 'Lion',     speed: 0.55 },
    elephant: { name: 'Elephant', speed: 0.35 },
    zebra:    { name: 'Zebra',    speed: 0.75 },
  };
  const NAMES = ['Kito', 'Zara', 'Bomani', 'Tembo', 'Juma', 'Asha', 'Rafi', 'Nia', 'Duma', 'Imani', 'Jabari', 'Sefu', 'Amara', 'Kofi', 'Pili', 'Taji'];

  const REMOVE_ICON = 'data:image/svg+xml;utf8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">' +
    '<circle cx="24" cy="24" r="20" fill="#e5483b" stroke="#fff" stroke-width="3"/>' +
    '<path d="M16 16l16 16M32 16L16 32" stroke="#fff" stroke-width="5" stroke-linecap="round"/></svg>');

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
  const ICONS = {};

  // ---------- DOM ----------
  const $ = id => document.getElementById(id);
  const canvas = $('game');
  const overlay = $('overlay');
  const octx = overlay.getContext('2d');
  const cashEl = $('cash-value');
  const dateEl = $('date-value');
  const infoEl = $('tile-info');
  const infoText = $('tile-info-text');
  const loadingEl = $('loading');
  const gridBtn = $('grid-toggle');
  const pauseBtn = $('pause-btn');
  const hintEl = $('hint');
  const hintText = $('hint-text');
  const hintCancel = $('hint-cancel');
  const trayEl = $('tray');
  const trayItems = $('tray-items');
  const dockEl = $('dock');

  // ---------- Helpers ----------
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const fmtCash = n => (n < 0 ? '-$' : '$') + Math.abs(Math.round(n)).toLocaleString('en-US');
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  function shuffled(a) {
    a = a.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }

  // =========================================================
  // Game state
  // =========================================================
  const state = { cash: START_CASH, date: new Date(2000, 0, 1), dayTimer: 0, guestTimer: 3, paused: false };
  const entities = [];
  const floats = [];
  let nextId = 1;
  let dirty = true;

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

  /** Convert edge list -> segment/post descriptors for models.fenceGeometry. */
  function fenceParts(edges) {
    const segs = [], posts = new Map();
    const touch = (gx, gy, type, o) => {
      const k = gy * (N + 1) + gx;
      const p = posts.get(k) || { x: gx - HALF, z: gy - HALF, type: 0, h: false, v: false };
      p.type = Math.max(p.type, type);
      p[o] = true;
      posts.set(k, p);
    };
    for (const e of edges) {
      segs.push({ x: e.x - HALF, z: e.y - HALF, axis: e.o === 'h' ? 'x' : 'z', type: e.type });
      if (e.o === 'h') { touch(e.x, e.y, e.type, 'h'); touch(e.x + 1, e.y, e.type, 'h'); }
      else { touch(e.x, e.y, e.type, 'v'); touch(e.x, e.y + 1, e.type, 'v'); }
    }
    return { segs, posts: [...posts.values()].map(p => ({ ...p, corner: p.h && p.v })) };
  }

  function allFenceEdges() {
    const out = [];
    for (let y = 0; y <= N; y++) for (let x = 0; x < N; x++) { const t = hEdge[hI(x, y)]; if (t) out.push({ o: 'h', x, y, type: t }); }
    for (let y = 0; y < N; y++) for (let x = 0; x <= N; x++) { const t = vEdge[vI(x, y)]; if (t) out.push({ o: 'v', x, y, type: t }); }
    return out;
  }

  // ---------- Enclosures ----------
  const comp = new Int32Array(N * N);
  let compOpen = [], compSize = [];
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

  // =========================================================
  // Three.js scene
  // =========================================================
  const IS_MOBILE = matchMedia('(pointer: coarse)').matches;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, IS_MOBILE ? 1.75 : 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.62;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 2000);

  // ---- Physical sky (atmospheric scattering) + image-based lighting from it ----
  const SUN_DIR = new THREE.Vector3(0.55, 0.62, 0.32).normalize();
  const HAZE = new THREE.Color('#b9c8cf');
  function makeSky() {
    const sky = new THREE_ADDONS.Sky();
    sky.scale.setScalar(1500);
    const u = sky.material.uniforms;
    u.turbidity.value = 5.5;
    u.rayleigh.value = 1.4;
    u.mieCoefficient.value = 0.004;
    u.mieDirectionalG.value = 0.8;
    u.sunPosition.value.copy(SUN_DIR);
    return sky;
  }
  scene.add(makeSky());
  {
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envScene = new THREE.Scene();
    envScene.add(makeSky());
    scene.environment = pmrem.fromScene(envScene, 0.02).texture;
    scene.environmentIntensity = 1;
    pmrem.dispose();
  }
  scene.fog = new THREE.FogExp2(HAZE, 0.011);

  const sun = new THREE.DirectionalLight('#fff0d6', 4.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0003;
  sun.shadow.normalBias = 0.025;
  scene.add(sun, sun.target);
  scene.add(new THREE.HemisphereLight('#dfeaf5', '#4a5a34', 0.35));

  const timeUniforms = { uTime: { value: 0 } };

  // ---- Ground: painted macro texture x tiling detail texture + detail normals ----
  const DETAIL = Zoo.textures.groundDetail();
  function detailMaterial(map, normalRepeat, detailRepeat) {
    const detail = M.tex(DETAIL.map, 1, 1, false);
    const normal = M.tex(DETAIL.normal, normalRepeat, normalRepeat, false);
    const mat = new THREE.MeshStandardMaterial({ map, normalMap: normal, normalScale: new THREE.Vector2(0.9, 0.9), roughness: 0.97 });
    mat.onBeforeCompile = sh => {
      sh.uniforms.detailMap = { value: detail };
      sh.uniforms.detailRepeat = { value: detailRepeat };
      sh.fragmentShader = 'uniform sampler2D detailMap;\nuniform float detailRepeat;\n' + sh.fragmentShader.replace('#include <map_fragment>', `
        #include <map_fragment>
        vec3 det = texture2D(detailMap, vMapUv * detailRepeat).rgb;
        vec3 det2 = texture2D(detailMap, vMapUv * detailRepeat * 0.23 + 0.37).rgb;
        diffuseColor.rgb *= det * 2.0 * mix(0.85, 1.15, det2.r);
      `);
    };
    return mat;
  }

  const groundGeo = new THREE.PlaneGeometry(N, N, N * 2, N * 2);
  groundGeo.rotateX(-Math.PI / 2);
  const groundTex = new THREE.CanvasTexture(TR.texCanvas);
  groundTex.colorSpace = THREE.SRGBColorSpace;
  groundTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const ground = new THREE.Mesh(groundGeo, detailMaterial(groundTex, N * 1.5, N * 1.5));
  ground.receiveShadow = true;
  scene.add(ground);

  function updateHeights() {
    const pos = groundGeo.attributes.position;
    const S = N * 2 + 1;
    for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) pos.setY(j * S + i, TR.vertexHeight(i, j));
    pos.needsUpdate = true;
    groundGeo.computeVertexNormals();
  }

  // ---- Water: reflects the sky, rippling normals ----
  const waterNormal = M.tex(Zoo.textures.waterNormal(), N / 3, N / 3, false);
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(N, N).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({
      color: '#24495a', roughness: 0.04, metalness: 0.05, transparent: true, opacity: 0.88,
      normalMap: waterNormal, normalScale: new THREE.Vector2(0.45, 0.45), envMapIntensity: 1.3,
    }));
  water.position.y = -0.11;
  water.receiveShadow = true;
  scene.add(water);

  // ---- Land outside the zoo, road, kerb, gate, trees ----
  (function buildSurroundings() {
    const tex = new THREE.CanvasTexture(TR.outsideTexture());
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    const mat = detailMaterial(tex, 10.5, 10.5); // uv = world / 7 -> same detail density as the zoo grounds
    const E = 400;
    const rect = (x0, z0, x1, z1) => {
      const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0).rotateX(-Math.PI / 2);
      g.translate((x0 + x1) / 2, 0, (z0 + z1) / 2);
      const p = g.attributes.position, uv = g.attributes.uv;
      for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / 7, p.getZ(i) / 7);
      const m = new THREE.Mesh(g, mat);
      m.position.y = -0.004;
      m.receiveShadow = true;
      scene.add(m);
    };
    rect(-E, -E, E, -HALF);
    rect(-E, HALF, E, E);
    rect(-E, -HALF, -HALF, HALF);
    rect(HALF, -HALF, E, HALF);

    const asphalt = new THREE.CanvasTexture(TR.swatch(T.PATH, 128));
    asphalt.colorSpace = THREE.SRGBColorSpace;
    const road = new THREE.Mesh(new THREE.PlaneGeometry(2, 60).rotateX(-Math.PI / 2), detailMaterial(asphalt, 20, 20));
    road.position.set(0, 0.003, HALF + 30);
    road.receiveShadow = true;
    scene.add(road);

    const kerbMat = new THREE.MeshStandardMaterial({ color: '#b9b4a6', roughness: 0.9 });
    const kerb = (w, d, x, z) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.08, d), kerbMat);
      m.position.set(x, 0.04, z);
      m.castShadow = m.receiveShadow = true;
      scene.add(m);
    };
    kerb(N + 0.16, 0.08, 0, -HALF);
    kerb(0.08, N, -HALF, 0);
    kerb(0.08, N, HALF, 0);
    kerb(HALF - 1, 0.08, -(HALF + 1) / 2, HALF);
    kerb(HALF - 1, 0.08, (HALF + 1) / 2, HALF);

    // Entrance gate: stone pillars, timber beam, carved sign
    const stone = new THREE.MeshStandardMaterial({ color: '#cfc6b1', roughness: 0.9, normalMap: M.tex(DETAIL.normal, 1, 3, false) });
    const timber = new THREE.MeshStandardMaterial({ color: '#7a5434', roughness: 0.85, map: M.tex(Zoo.textures.woodGrain(), 3, 1) });
    for (const s of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.28, 1.45, 0.28), stone);
      p.position.set(1.16 * s, 0.725, HALF);
      p.castShadow = p.receiveShadow = true;
      scene.add(p);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.08, 0.36), stone);
      cap.position.set(1.16 * s, 1.49, HALF);
      cap.castShadow = true;
      scene.add(cap);
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.32, 0.16), timber);
    beam.position.set(0, 1.25, HALF);
    beam.castShadow = true;
    scene.add(beam);
    const sc = document.createElement('canvas');
    sc.width = 512; sc.height = 64;
    const g = sc.getContext('2d');
    g.drawImage(Zoo.textures.woodGrain(), 0, 0, 512, 64);
    g.globalCompositeOperation = 'multiply';
    g.fillStyle = '#7a5434'; g.fillRect(0, 0, 512, 64);
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = '#f1e2b8'; g.font = '800 40px Georgia, serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('Z O O', 256, 34);
    const signTex = new THREE.CanvasTexture(sc);
    signTex.colorSpace = THREE.SRGBColorSpace;
    for (const s of [1, -1]) {
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.3), new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.8 }));
      sign.position.set(0, 1.25, HALF + 0.081 * s);
      if (s < 0) sign.rotation.y = Math.PI;
      scene.add(sign);
    }

    // Woodland around the zoo
    const rng = TR.mulberry32(77);
    const trees = [], bushes = [];
    let guard = 0;
    const treeCount = IS_MOBILE ? 170 : 260;
    while (trees.length < treeCount && guard++ < 8000) {
      const x = (rng() * 2 - 1) * (HALF + 26), z = (rng() * 2 - 1) * (HALF + 26);
      if (Math.abs(x) < HALF + 1.2 && Math.abs(z) < HALF + 1.2) continue;
      if (Math.abs(x) < 3 && z > HALF) continue;
      trees.push({ x, z, scale: 0.85 + rng() * 0.75, pine: rng() < 0.28 });
    }
    guard = 0;
    while (bushes.length < 140 && guard++ < 6000) {
      const side = Math.floor(rng() * 4), t = (rng() * 2 - 1) * HALF, off = HALF + 0.6 + rng() * 2.5;
      const x = side < 2 ? t : (side === 2 ? -off : off), z = side < 2 ? (side === 0 ? -off : off) : t;
      if (Math.abs(x) < 3 && z > HALF) continue;
      bushes.push({ x, z });
    }
    const tg = M.treesGeometry(trees, rng);
    const trunks = new THREE.Mesh(tg.trunks, M.BARK_MAT);
    trunks.castShadow = trunks.receiveShadow = true;
    const leafMat = M.LEAF_MAT;
    M.addWind(leafMat, timeUniforms, 0.012);
    const crowns = new THREE.Mesh(tg.leaves, leafMat);
    crowns.castShadow = crowns.receiveShadow = true;
    crowns.customDepthMaterial = M.LEAF_DEPTH;
    const bushMesh = new THREE.Mesh(M.bushesGeometry(bushes, rng), leafMat);
    bushMesh.castShadow = bushMesh.receiveShadow = true;
    bushMesh.customDepthMaterial = M.LEAF_DEPTH;
    scene.add(trunks, crowns, bushMesh);
  })();

  // ---- Grass tufts (instanced, swaying) on grass tiles ----
  const TUFTS_PER_TILE = IS_MOBILE ? 16 : 28;
  M.addWind(M.TUFT_MAT, timeUniforms, 0.09, [7, 15]); // tufts only near the camera
  const tuftGeo = M.tuftGeometry();
  let tufts = null;
  function rebuildTufts() {
    if (tufts) { scene.remove(tufts); tufts.dispose(); }
    const spots = [];
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      if (tileAt(x, y) !== T.GRASS) continue;
      for (let k = 0; k < TUFTS_PER_TILE; k++) spots.push([x, y, k]);
    }
    tufts = new THREE.InstancedMesh(tuftGeo, M.TUFT_MAT, spots.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3(), c = new THREE.Color();
    spots.forEach(([x, y, k], i) => {
      const h1 = TR.hash(x * 31 + k, y * 17 + 3), h2 = TR.hash(x * 7 + 11, y * 13 + k), h3 = TR.hash(x + k * 5, y * 3 + 1);
      p.set(x + 0.08 + h1 * 0.84 - HALF, 0, y + 0.08 + h2 * 0.84 - HALF);
      e.set(0, h3 * Math.PI, 0); q.setFromEuler(e);
      const sz = 0.075 + h1 * 0.07;
      s.set(sz * 1.4, sz * (0.7 + h2 * 0.6), sz * 1.4);
      m.compose(p, q, s);
      tufts.setMatrixAt(i, m);
      c.setRGB(0.74 + h3 * 0.22, 0.78 + h1 * 0.2, 0.64 + h2 * 0.16);
      tufts.setColorAt(i, c);
    });
    tufts.receiveShadow = true;
    scene.add(tufts);
  }

  // ---- Grid lines (shown while building; skipped over water) ----
  const gridMat = new THREE.LineBasicMaterial({ color: '#0c1a07', transparent: true, opacity: 0.22, depthWrite: false });
  const gridLines = new THREE.LineSegments(new THREE.BufferGeometry(), gridMat);
  gridLines.renderOrder = 1;
  scene.add(gridLines);
  let gridOn = false;
  function rebuildGrid() {
    const pts = [];
    const land = (x, y) => !isWater(x, y);
    const Y = 0.012;
    for (let y = 1; y < N; y++) for (let x = 0; x < N; x++) {
      if (land(x, y - 1) && land(x, y)) pts.push(x - HALF, Y, y - HALF, x + 1 - HALF, Y, y - HALF);
    }
    for (let x = 1; x < N; x++) for (let y = 0; y < N; y++) {
      if (land(x - 1, y) && land(x, y)) pts.push(x - HALF, Y, y - HALF, x - HALF, Y, y + 1 - HALF);
    }
    gridLines.geometry.dispose();
    gridLines.geometry = new THREE.BufferGeometry();
    gridLines.geometry.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  }

  // ---- Fences: one mesh per material ----
  function fencePair(ghost) {
    const mk = base => {
      const mat = ghost ? base.clone() : base;
      if (ghost) { mat.transparent = true; mat.opacity = 0.5; mat.depthWrite = false; }
      const m = new THREE.Mesh(new THREE.BufferGeometry(), mat);
      m.castShadow = !ghost; m.receiveShadow = true;
      scene.add(m);
      return m;
    };
    const pair = { wood: mk(M.FENCE_MATS.wood), iron: mk(M.FENCE_MATS.iron) };
    pair.set = geos => { for (const k of ['wood', 'iron']) { pair[k].geometry.dispose(); pair[k].geometry = geos[k]; } };
    pair.show = v => { pair.wood.visible = pair.iron.visible = v; };
    return pair;
  }
  const fences = fencePair(false);
  function rebuildFenceMesh() {
    const { segs, posts } = fenceParts(allFenceEdges());
    fences.set(M.fenceGeometry(segs, posts));
  }
  const ghostFence = fencePair(true);
  ghostFence.show(false);
  let ghostKey = '';

  // ---- Highlight helpers ----
  function makeArea() {
    const fill = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.3, depthWrite: false, toneMapped: false }));
    const edgeGeo = new THREE.BufferGeometry();
    edgeGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Array(15).fill(0), 3));
    const edge = new THREE.Line(edgeGeo, new THREE.LineBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false }));
    fill.renderOrder = edge.renderOrder = 2;
    fill.visible = edge.visible = false;
    scene.add(fill, edge);
    return {
      show(a, b, color, opacity) {
        const x0 = Math.min(a.x, b.x) - HALF, x1 = Math.max(a.x, b.x) + 1 - HALF;
        const z0 = Math.min(a.y, b.y) - HALF, z1 = Math.max(a.y, b.y) + 1 - HALF;
        const y = 0.06;
        fill.position.set((x0 + x1) / 2, y, (z0 + z1) / 2);
        fill.scale.set(x1 - x0, 1, z1 - z0);
        fill.material.color.set(color);
        fill.material.opacity = opacity;
        const p = edgeGeo.attributes.position;
        [[x0, z0], [x1, z0], [x1, z1], [x0, z1], [x0, z0]].forEach(([x, z], i) => p.setXYZ(i, x, y + 0.002, z));
        p.needsUpdate = true;
        edge.material.color.set(color);
        fill.visible = edge.visible = true;
      },
      hide() { fill.visible = edge.visible = false; },
    };
  }
  const selArea = makeArea();
  const toolArea = makeArea();
  const hoverArea = makeArea();

  function makeMarker(color) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.06, 24), new THREE.MeshBasicMaterial({ color, toneMapped: false }));
    m.visible = false;
    m.renderOrder = 3;
    scene.add(m);
    return m;
  }
  const pendingMarker = makeMarker(ACCENT);
  const hoverMarker = makeMarker('#ffffff');

  const selRing = new THREE.Mesh(new THREE.RingGeometry(0.82, 1, 48).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.95, depthWrite: false, toneMapped: false }));
  selRing.visible = false;
  selRing.renderOrder = 2;
  scene.add(selRing);

  function worldChanged() {
    rebuildFenceMesh();
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

  function terrainChanged() {
    groundTex.needsUpdate = true;
    updateHeights();
    rebuildGrid();
    rebuildTufts();
  }

  // =========================================================
  // Camera (orbit around a ground target)
  // =========================================================
  const cam = { ...HOME };
  let viewW = 1, viewH = 1, odpr = 1;
  let camAnim = null;

  const pitchFor = d => 0.42 + ((d - MIN_DIST) / (MAX_DIST - MIN_DIST)) * 0.6; // ~24° close .. ~58° far

  function updateCamera() {
    const lim = HALF + 2;
    cam.tx = clamp(cam.tx, -lim, lim);
    cam.tz = clamp(cam.tz, -lim, lim);
    cam.dist = clamp(cam.dist, MIN_DIST, MAX_DIST);
    const p = pitchFor(cam.dist);
    camera.position.set(
      cam.tx + Math.sin(cam.yaw) * Math.cos(p) * cam.dist,
      Math.sin(p) * cam.dist,
      cam.tz + Math.cos(cam.yaw) * Math.cos(p) * cam.dist);
    camera.lookAt(cam.tx, 0, cam.tz);
    camera.updateMatrixWorld();
    // Shadow frustum follows the view for crisp shadows when zoomed in
    const r = clamp(cam.dist * 0.95, 7, 32);
    const sc = sun.shadow.camera;
    sc.left = -r; sc.right = r; sc.top = r; sc.bottom = -r; sc.near = 1; sc.far = 140;
    sc.updateProjectionMatrix();
    sun.target.position.set(cam.tx, 0, cam.tz);
    sun.position.copy(sun.target.position).addScaledVector(SUN_DIR, 60);
    dirty = true;
  }

  function animateCam(to) {
    camAnim = { from: { ...cam }, to: { ...cam, ...to }, t0: performance.now(), dur: 320 };
  }

  function resize() {
    viewW = window.innerWidth;
    viewH = window.innerHeight;
    renderer.setSize(viewW, viewH, false);
    camera.aspect = viewW / viewH;
    camera.updateProjectionMatrix();
    odpr = Math.min(window.devicePixelRatio || 1, 2);
    overlay.width = Math.round(viewW * odpr);
    overlay.height = Math.round(viewH * odpr);
    updateCamera();
  }

  // ---------- Picking ----------
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const hitV = new THREE.Vector3();
  const projV = new THREE.Vector3();

  function setRay(sx, sy) {
    ndc.set((sx / viewW) * 2 - 1, -(sy / viewH) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
  }
  function groundAt(sx, sy) {
    setRay(sx, sy);
    return raycaster.ray.intersectPlane(groundPlane, hitV) ? { x: hitV.x, z: hitV.z } : null;
  }
  const tileOf = g => {
    if (!g) return null;
    const tx = Math.floor(g.x + HALF), ty = Math.floor(g.z + HALF);
    return inMap(tx, ty) ? { x: tx, y: ty } : null;
  };
  const cornerOf = g => {
    if (!g) return null;
    const gx = Math.round(g.x + HALF), gy = Math.round(g.z + HALF);
    return gx >= 0 && gy >= 0 && gx <= N && gy <= N ? { x: gx, y: gy } : null;
  };
  function toScreen(x, y, z) {
    projV.set(x, y, z).project(camera);
    return { x: (projV.x + 1) / 2 * viewW, y: (1 - projV.y) / 2 * viewH, ok: projV.z < 1 };
  }

  function entityAtScreen(sx, sy, filter = () => true) {
    const list = entities.filter(filter);
    setRay(sx, sy);
    const hits = raycaster.intersectObjects(list.map(e => e.model.root), true);
    if (hits.length) {
      let o = hits[0].object;
      while (o && !o.userData.entity) o = o.parent;
      if (o) return o.userData.entity;
    }
    // Generous fallback for small targets on touch screens
    let best = null, bd = 30;
    for (const e of list) {
      const s = toScreen(e.fx - HALF, e.model.height * 0.5, e.fy - HALF);
      const d = Math.hypot(s.x - sx, s.y - sy);
      if (s.ok && d < bd) { bd = d; best = e; }
    }
    return best;
  }

  // =========================================================
  // Entities
  // =========================================================
  function spawn(kind, tx, ty, extra) {
    const e = {
      id: nextId++, kind,
      fx: tx + 0.5 + rand(-0.15, 0.15), fy: ty + 0.5 + rand(-0.15, 0.15),
      tgt: null, wait: rand(0.3, 1.5), anim: 0, moving: false,
      heading: rand(0, Math.PI * 2), dirX: 0, dirZ: 0,
      ...extra,
    };
    if (kind === 'animal') e.model = M.createAnimal(e.species);
    else if (kind === 'keeper') e.model = M.createPerson(M.KEEPER_LOOK, true, true);
    else e.model = M.createPerson(e.look, false, false); // guests skip shadows to stay fast
    e.model.root.userData.entity = e;
    scene.add(e.model.root);
    syncEntity(e, 0);
    entities.push(e);
    return e;
  }

  function removeEntity(e) {
    const i = entities.indexOf(e);
    if (i >= 0) entities.splice(i, 1);
    scene.remove(e.model.root);
    if (selectedEntity === e) { selectedEntity = null; infoEl.hidden = true; }
  }

  function syncEntity(e, dt) {
    const r = e.model.root;
    r.position.set(e.fx - HALF, 0, e.fy - HALF);
    if (e.moving) {
      const want = Math.atan2(-e.dirZ, e.dirX);
      let d = want - e.heading;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      e.heading += d * Math.min(1, dt * 9);
    }
    r.rotation.y = e.heading;
    M.animate(e.model, (e.anim / e.model.stride) * Math.PI * 2, e.moving, dt);
  }

  function stepToward(e, speed, dt) {
    const dx = e.tgt.x - e.fx, dy = e.tgt.y - e.fy;
    const d = Math.hypot(dx, dy);
    const step = speed * dt;
    if (d > 1e-4) { e.dirX = dx; e.dirZ = dy; }
    e.moving = true;
    e.anim += step; // distance walked drives the gait phase
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
      look: pick(M.GUEST_LOOKS),
      ox: rand(-0.22, 0.22), oy: rand(-0.22, 0.22),
      life: rand(40, 90), donateT: rand(3, 8), leaving: false, prev: null, wait: 0,
    });
    e.fx = g.x + 0.5 + e.ox; e.fy = g.y + 0.85;
    e.heading = Math.PI / 2; // walking in from the gate
    addCash(ADMISSION, e.fx, e.fy);
  }

  const countKind = k => entities.reduce((n, e) => n + (e.kind === k), 0);

  function updateEntities(dt) {
    for (let i = entities.length - 1; i >= 0; i--) {
      const e = entities[i];
      if (e.kind === 'animal') wander(e, dt, SPECIES[e.species].speed, animalCanEnter);
      else if (e.kind === 'keeper') wander(e, dt, 0.7, keeperCanEnter);
      else updateGuest(e, dt);
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
  let hudDirty = true;
  function addCash(amount, fx, fy) {
    state.cash += amount;
    if (fx !== undefined) {
      floats.push({ x: fx - HALF, z: fy - HALF, text: (amount >= 0 ? '+' : '−') + fmtCash(Math.abs(amount)), color: amount >= 0 ? '#7dff6a' : '#ff7a6a', t: 0 });
    }
    hudDirty = true;
  }
  function canAfford(cost) {
    if (cost <= state.cash) return true;
    flash(`Not enough money — you need ${fmtCash(cost)}`, 'error');
    return false;
  }

  // =========================================================
  // Toolbar UI
  // =========================================================
  let activeTab = null;
  let tool = null;
  let pending = null;
  let selectedEntity = null;
  let selectedTile = null;
  let hoverScreen = null;
  let hintMsg = null;
  let lastGuestCount = -1;

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
      b.innerHTML = `<span class="tool-icon"><img alt="" src="${t.icon || ICONS[t.id] || ''}"></span>` +
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
    if (!tool) return state.paused ? 'Game paused' : '';
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
    hintEl.className = 'glass' + (cls ? ' ' + cls : '');
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
    TR.setTiles(x0, y0, x1, y1, tool.terrain);
    terrainChanged();
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

  function removeAt(sx, sy, g) {
    const e = entityAtScreen(sx, sy, x => x.kind !== 'guest');
    if (e) {
      if (e.kind === 'animal') {
        const refund = Math.round(TOOLS.animals.find(t => t.species === e.species).price / 2);
        addCash(refund, e.fx, e.fy);
        flash(`Sold ${SPECIES[e.species].name} “${e.name}”`, 'good');
      } else flash('Zookeeper dismissed');
      removeEntity(e);
      return;
    }
    if (!g) return;
    const fx = g.x + HALF, fy = g.z + HALF;
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

  function showEntityInfo(e) {
    let html;
    if (e.kind === 'animal') {
      const size = compSize[comp[Math.floor(e.fy) * N + Math.floor(e.fx)]];
      html = `${SPECIES[e.species].name} “${e.name}”` +
        (e.escaped ? '<span class="warn">Escaped — fix the fence!</span>' : `<span class="dim">Enclosure · ${size} tiles</span>`);
    } else if (e.kind === 'keeper') {
      html = `Zookeeper ${e.name}<span class="dim">Salary ${fmtCash(KEEPER_SALARY)}/month</span>`;
    } else {
      html = `Guest<span class="dim">${e.leaving ? 'Heading home' : 'Enjoying the zoo'}</span>`;
    }
    infoText.innerHTML = html;
    infoEl.hidden = false;
  }

  function inspectAt(sx, sy) {
    const e = entityAtScreen(sx, sy);
    if (e) {
      selectedEntity = selectedEntity === e ? null : e;
      selectedTile = null;
      if (selectedEntity) showEntityInfo(e); else infoEl.hidden = true;
      dirty = true;
      return;
    }
    selectedEntity = null;
    const t = tileOf(groundAt(sx, sy));
    selectedTile = t && !(selectedTile && selectedTile.x === t.x && selectedTile.y === t.y) ? t : null;
    if (selectedTile) {
      const enc = isEnclosed(t.x, t.y) ? `Enclosure · ${compSize[comp[t.y * N + t.x]]} tiles` : `Tile ${t.x}, ${t.y}`;
      infoText.innerHTML = `${TERRAIN_NAMES[tileAt(t.x, t.y)]}<span class="dim">${enc}</span>`;
      infoEl.hidden = false;
    } else infoEl.hidden = true;
    dirty = true;
  }

  function handleTap(sx, sy) {
    if (!tool) { inspectAt(sx, sy); return; }
    const g = groundAt(sx, sy);
    switch (tool.kind) {
      case 'terrain': {
        const t = tileOf(g);
        if (!t) return;
        if (!pending) pending = { a: t };
        else { applyTerrain(pending.a, t); pending = null; }
        break;
      }
      case 'fence': {
        const c = cornerOf(g);
        if (!c) return;
        if (!pending) pending = { a: c };
        else if (pending.a.x === c.x && pending.a.y === c.y) pending = null;
        else { applyFence(pending.a, c); pending = null; }
        break;
      }
      case 'remove': removeAt(sx, sy, g); break;
      case 'animal': { const t = tileOf(g); if (t) placeAnimal(t); break; }
      case 'staff':  { const t = tileOf(g); if (t) placeKeeper(t); break; }
    }
    refreshHint();
    dirty = true;
  }

  // =========================================================
  // Input: one finger pans, two fingers pinch-zoom + rotate,
  // mouse: left-drag pan, right-drag rotate, wheel zoom.
  // =========================================================
  const pointers = new Map();
  let drag = null, pinch = null;

  const localPos = e => ({ x: e.clientX, y: e.clientY });

  function startPinch() {
    const [a, b] = [...pointers.values()];
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    pinch = {
      len0: Math.hypot(a.x - b.x, a.y - b.y) || 1,
      ang0: Math.atan2(b.y - a.y, b.x - a.x),
      dist0: cam.dist, yaw0: cam.yaw,
      world: groundAt(mid.x, mid.y),
    };
    drag = null;
  }

  canvas.addEventListener('pointerdown', e => {
    canvas.setPointerCapture(e.pointerId);
    const p = localPos(e);
    pointers.set(e.pointerId, p);
    camAnim = null;
    if (pointers.size === 1) {
      drag = { sx: p.x, sy: p.y, moved: false, rotate: e.pointerType === 'mouse' && (e.button === 2 || e.shiftKey), world: groundAt(p.x, p.y), yaw0: cam.yaw };
    } else if (pointers.size === 2) startPinch();
  });

  canvas.addEventListener('pointermove', e => {
    const p = localPos(e);
    if (e.pointerType === 'mouse') { hoverScreen = p; dirty = true; }
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, p);

    if (pinch && pointers.size >= 2) {
      const [a, b] = [...pointers.values()];
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const len = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      cam.dist = clamp(pinch.dist0 * pinch.len0 / len, MIN_DIST, MAX_DIST);
      cam.yaw = pinch.yaw0 + (Math.atan2(b.y - a.y, b.x - a.x) - pinch.ang0);
      updateCamera();
      const g = groundAt(mid.x, mid.y);
      if (g && pinch.world) { cam.tx += pinch.world.x - g.x; cam.tz += pinch.world.z - g.z; updateCamera(); }
    } else if (drag) {
      if (!drag.moved && Math.hypot(p.x - drag.sx, p.y - drag.sy) > TAP_SLOP) { drag.moved = true; canvas.classList.add('dragging'); }
      if (!drag.moved) return;
      if (drag.rotate) {
        cam.yaw = drag.yaw0 - (p.x - drag.sx) * 0.008;
        updateCamera();
      } else {
        const g = groundAt(p.x, p.y);
        if (g && drag.world) { cam.tx += drag.world.x - g.x; cam.tz += drag.world.z - g.z; updateCamera(); }
      }
    }
  });

  function endPointer(e) {
    if (!pointers.has(e.pointerId)) return;
    const p = localPos(e);
    const wasTap = drag && !drag.moved && !drag.rotate && pointers.size === 1 && e.type === 'pointerup';
    pointers.delete(e.pointerId);
    if (wasTap) handleTap(p.x, p.y);
    if (pointers.size === 1) {
      const [rest] = [...pointers.values()];
      pinch = null;
      drag = { sx: rest.x, sy: rest.y, moved: true, rotate: false, world: groundAt(rest.x, rest.y), yaw0: cam.yaw };
    } else if (pointers.size === 0) {
      drag = null; pinch = null;
      canvas.classList.remove('dragging');
    }
  }
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);
  canvas.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') { hoverScreen = null; dirty = true; } });

  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    camAnim = null;
    const p = localPos(e);
    const g0 = groundAt(p.x, p.y);
    cam.dist = clamp(cam.dist * Math.exp(e.deltaY * 0.0012), MIN_DIST, MAX_DIST);
    updateCamera();
    const g1 = groundAt(p.x, p.y);
    if (g0 && g1) { cam.tx += g0.x - g1.x; cam.tz += g0.z - g1.z; updateCamera(); } // zoom toward cursor
  }, { passive: false });

  ['gesturestart', 'gesturechange', 'gestureend'].forEach(ev =>
    document.addEventListener(ev, e => e.preventDefault(), { passive: false }));
  document.addEventListener('contextmenu', e => e.preventDefault());

  function setGrid(on) {
    gridOn = on;
    gridBtn.classList.toggle('on', on);
    gridBtn.setAttribute('aria-pressed', String(on));
    dirty = true;
  }
  function setPaused(on) {
    state.paused = on;
    pauseBtn.classList.toggle('paused', on);
    pauseBtn.setAttribute('aria-label', on ? 'Resume' : 'Pause');
    if (!hintMsg) refreshHint();
  }
  $('zoom-in').addEventListener('click', () => animateCam({ dist: clamp(cam.dist / 1.4, MIN_DIST, MAX_DIST) }));
  $('zoom-out').addEventListener('click', () => animateCam({ dist: clamp(cam.dist * 1.4, MIN_DIST, MAX_DIST) }));
  $('rot-left').addEventListener('click', () => animateCam({ yaw: cam.yaw + Math.PI / 4 }));
  $('rot-right').addEventListener('click', () => animateCam({ yaw: cam.yaw - Math.PI / 4 }));
  $('zoom-reset').addEventListener('click', () => animateCam({ ...HOME, yaw: HOME.yaw + Math.round((cam.yaw - HOME.yaw) / (Math.PI * 2)) * Math.PI * 2 }));
  gridBtn.addEventListener('click', () => setGrid(!gridOn));
  pauseBtn.addEventListener('click', () => setPaused(!state.paused));

  window.addEventListener('keydown', e => {
    const k = e.key;
    const step = cam.dist * 0.06;
    const fx = -Math.sin(cam.yaw), fz = -Math.cos(cam.yaw); // screen "up" on the ground
    if (k === 'ArrowUp' || k === 'w') { cam.tx += fx * step; cam.tz += fz * step; }
    else if (k === 'ArrowDown' || k === 's') { cam.tx -= fx * step; cam.tz -= fz * step; }
    else if (k === 'ArrowLeft' || k === 'a') { cam.tx += fz * step; cam.tz -= fx * step; }
    else if (k === 'ArrowRight' || k === 'd') { cam.tx -= fz * step; cam.tz += fx * step; }
    else if (k === 'q') return animateCam({ yaw: cam.yaw + Math.PI / 4 });
    else if (k === 'e') return animateCam({ yaw: cam.yaw - Math.PI / 4 });
    else if (k === '+' || k === '=') return animateCam({ dist: clamp(cam.dist / 1.4, MIN_DIST, MAX_DIST) });
    else if (k === '-') return animateCam({ dist: clamp(cam.dist * 1.4, MIN_DIST, MAX_DIST) });
    else if (k === 'g') return setGrid(!gridOn);
    else if (k === 'p' || k === ' ') return setPaused(!state.paused);
    else if (k === 'Escape') return selectTool(null);
    else return;
    updateCamera();
  });

  // =========================================================
  // Overlays (3D highlights + 2D labels)
  // =========================================================
  function updateHighlights(now) {
    const g = hoverScreen ? groundAt(hoverScreen.x, hoverScreen.y) : null;
    const hoverTile = tileOf(g), hoverCorner = cornerOf(g);

    if (selectedTile) selArea.show(selectedTile, selectedTile, ACCENT, 0.3); else selArea.hide();

    if (!tool && hoverTile && !selectedEntity) hoverArea.show(hoverTile, hoverTile, '#ffffff', 0.12); else hoverArea.hide();

    toolArea.hide();
    ghostFence.show(false);
    // Grid appears automatically while placing terrain or fences
    gridLines.visible = gridOn || (!!tool && (tool.kind === 'fence' || tool.kind === 'terrain'));
    pendingMarker.visible = hoverMarker.visible = false;
    if (tool) {
      if (tool.kind === 'terrain') {
        const a = pending ? pending.a : hoverTile;
        const b = hoverTile || (pending && pending.a);
        if (a && b) toolArea.show(a, b, ACCENT, 0.32);
      } else if (tool.kind === 'fence') {
        if (pending) {
          pendingMarker.visible = true;
          pendingMarker.position.set(pending.a.x - HALF, 0.04, pending.a.y - HALF);
          pendingMarker.scale.setScalar(1 + 0.15 * Math.sin(now / 160));
        }
        if (hoverCorner) {
          hoverMarker.visible = true;
          hoverMarker.position.set(hoverCorner.x - HALF, 0.035, hoverCorner.y - HALF);
        }
        if (pending && hoverCorner) {
          const key = `${pending.a.x},${pending.a.y},${hoverCorner.x},${hoverCorner.y},${tool.fence}`;
          if (key !== ghostKey) {
            ghostKey = key;
            const edges = fenceEdgesFor(pending.a, hoverCorner).map(e => ({ ...e, type: tool.fence }));
            const { segs, posts } = fenceParts(edges);
            ghostFence.set(M.fenceGeometry(segs, posts));
          }
          ghostFence.show(true);
        }
      } else if (hoverTile && (tool.kind === 'animal' || tool.kind === 'staff')) {
        const ok = tileAt(hoverTile.x, hoverTile.y) !== T.WATER && (tool.kind === 'staff' || isEnclosed(hoverTile.x, hoverTile.y));
        toolArea.show(hoverTile, hoverTile, ok ? ACCENT : DANGER, 0.32);
      }
    }

    if (selectedEntity) {
      selRing.visible = true;
      selRing.position.set(selectedEntity.fx - HALF, 0.02, selectedEntity.fy - HALF);
      selRing.scale.setScalar(selectedEntity.model.radius * (1 + 0.06 * Math.sin(now / 200)));
    } else selRing.visible = false;

    return { hoverCorner };
  }

  function drawLabels(now, hoverCorner) {
    octx.setTransform(1, 0, 0, 1, 0, 0);
    octx.clearRect(0, 0, overlay.width, overlay.height);
    octx.setTransform(odpr, 0, 0, odpr, 0, 0);
    octx.textAlign = 'center';
    octx.textBaseline = 'middle';
    octx.lineJoin = 'round';

    for (const f of floats) {
      const s = toScreen(f.x, 0.7 + f.t * 0.6, f.z);
      if (!s.ok) continue;
      octx.globalAlpha = Math.max(0, 1 - f.t / 1.4);
      octx.font = '800 15px Inter, system-ui, sans-serif';
      octx.lineWidth = 4; octx.strokeStyle = 'rgba(0,0,0,0.75)';
      octx.strokeText(f.text, s.x, s.y);
      octx.fillStyle = f.color;
      octx.fillText(f.text, s.x, s.y);
    }
    octx.globalAlpha = 1;

    if (Math.floor(now / 450) % 2 === 0) {
      for (const e of entities) {
        if (e.kind !== 'animal' || !e.escaped) continue;
        const s = toScreen(e.fx - HALF, e.model.height + 0.25, e.fy - HALF);
        if (!s.ok) continue;
        octx.beginPath(); octx.arc(s.x, s.y, 10, 0, Math.PI * 2);
        octx.fillStyle = DANGER; octx.fill();
        octx.lineWidth = 2.5; octx.strokeStyle = '#fff'; octx.stroke();
        octx.fillStyle = '#fff'; octx.font = '800 13px Inter, system-ui, sans-serif';
        octx.fillText('!', s.x, s.y + 0.5);
      }
    }

    if (tool && tool.kind === 'fence' && pending && hoverCorner) {
      const edges = fenceEdgesFor(pending.a, hoverCorner);
      if (edges.length) {
        const cost = edges.filter(e => getEdge(e) !== tool.fence).length * tool.price;
        const s = toScreen(hoverCorner.x - HALF, 0.9, hoverCorner.y - HALF);
        if (s.ok) {
          const text = fmtCash(cost);
          octx.font = '800 13px Inter, system-ui, sans-serif';
          const w = octx.measureText(text).width + 18, h = 24;
          octx.fillStyle = 'rgba(20,28,20,0.85)';
          octx.beginPath();
          octx.roundRect ? octx.roundRect(s.x - w / 2, s.y - h / 2, w, h, 12) : octx.rect(s.x - w / 2, s.y - h / 2, w, h);
          octx.fill();
          octx.fillStyle = cost > state.cash ? DANGER : '#7dff6a';
          octx.fillText(text, s.x, s.y + 0.5);
        }
      }
    }
  }

  // =========================================================
  // HUD
  // =========================================================
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const fmtDate = d => `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;

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
  // Toolbar icons: rendered once from the real 3D models
  // =========================================================
  function renderIcons() {
    const W = 192, H = 144;
    let r;
    try {
      r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    } catch (err) { return; }
    r.setSize(W, H, false);
    r.setClearColor(0x000000, 0);
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 0.9;
    const sc = new THREE.Scene();
    sc.add(new THREE.HemisphereLight('#ffffff', '#6b7a5a', 1.6));
    const dl = new THREE.DirectionalLight('#fff4e0', 3.2);
    dl.position.set(3, 5, 4);
    sc.add(dl);
    const c = new THREE.PerspectiveCamera(28, W / H, 0.01, 100);
    const shoot = (obj, size, center) => {
      sc.add(obj);
      const d = size * 3.2;
      c.position.set(center.x + d * 0.55, center.y + d * 0.42, center.z + d * 0.85);
      c.lookAt(center.x, center.y, center.z);
      r.render(sc, c);
      const url = r.domElement.toDataURL();
      sc.remove(obj);
      return url;
    };
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    const iconOf = (model, sizeMul = 1) => {
      if (model.mixer) { // loaded GLB: frame by its normalised height
        model.mixer.update(0);
        return shoot(model.root, model.height * 0.8 * sizeMul, V(0, model.height * 0.5, 0));
      }
      model.root.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(model.root);
      const ctr = box.getCenter(new THREE.Vector3()), sz = box.getSize(new THREE.Vector3());
      return shoot(model.root, Math.max(sz.x, sz.y, sz.z) * 0.62 * sizeMul, ctr);
    };
    ICONS.lion = iconOf(M.createAnimal('lion'));
    ICONS.elephant = iconOf(M.createAnimal('elephant'));
    ICONS.zebra = iconOf(M.createAnimal('zebra'));
    ICONS.keeper = iconOf(M.createPerson(M.KEEPER_LOOK, true, true), 1.1);
    for (const [id, type] of [['wood', 1], ['iron', 2]]) {
      const { segs, posts } = fenceParts([{ o: 'h', x: 0, y: 1, type }, { o: 'v', x: 1, y: 0, type }]);
      // fenceParts offsets by HALF; shift back to the origin for the icon
      const geos = M.fenceGeometry(
        segs.map(s => ({ ...s, x: s.x + HALF - 1, z: s.z + HALF - 1 })),
        posts.map(p => ({ ...p, x: p.x + HALF - 1, z: p.z + HALF - 1 })));
      const grp = new THREE.Group();
      grp.add(new THREE.Mesh(geos.wood, M.FENCE_MATS.wood), new THREE.Mesh(geos.iron, M.FENCE_MATS.iron));
      ICONS[id] = shoot(grp, 0.75, V(-0.1, 0.3, -0.2));
    }
    const side = new THREE.MeshStandardMaterial({ color: '#6e5238', roughness: 1 });
    for (const [id, t] of [['grass', T.GRASS], ['dirt', T.DIRT], ['water', T.WATER], ['path', T.PATH]]) {
      const tex = new THREE.CanvasTexture(TR.swatch(t));
      tex.colorSpace = THREE.SRGBColorSpace;
      const top = new THREE.MeshStandardMaterial({ map: tex, roughness: t === T.WATER ? 0.2 : 0.95 });
      const box = new THREE.Mesh(new THREE.BoxGeometry(1, 0.24, 1), [side, side, top, side, side, side]);
      ICONS[id] = shoot(box, 0.62, V(0, 0, 0));
    }
    r.dispose();
    if (r.forceContextLoss) r.forceContextLoss();
  }

  /** Optional drop-in models: models/<name>.glb (+ optional models/manifest.json). Needs http(s). */
  async function loadCustomModels() {
    if (!/^https?:/.test(location.protocol) || !window.THREE_ADDONS) return [];
    let manifest = null;
    try {
      const r = await fetch('models/manifest.json', { cache: 'no-store' });
      if (r.ok) manifest = await r.json();
    } catch (e) { /* no manifest */ }
    const keys = ['lion', 'elephant', 'zebra', 'keeper', 'guest'];
    const jobs = keys.map(async k => {
      const cfg = (manifest && manifest[k]) || {};
      const url = 'models/' + (cfg.file || k + '.glb');
      try {
        const head = await fetch(url, { method: 'HEAD', cache: 'no-store' });
        if (!head.ok) return null;
        await M.loadGLB(k, url, cfg);
        return k;
      } catch (e) {
        console.warn('Could not load model', url, e);
        return null;
      }
    });
    return (await Promise.all(jobs)).filter(Boolean);
  }

  // =========================================================
  // Main loop
  // =========================================================
  let last = performance.now();
  function frame(now) {
    const dtMs = Math.min(now - last, 100);
    const dt = dtMs / 1000;
    last = now;

    if (!state.paused) {
      state.dayTimer += dtMs;
      while (state.dayTimer >= MS_PER_DAY) {
        state.dayTimer -= MS_PER_DAY;
        state.date.setDate(state.date.getDate() + 1);
        if (state.date.getDate() === 1) monthlyCosts();
        hudDirty = true;
      }
      updateEntities(dt);
    }
    for (const e of entities) syncEntity(e, dt);
    for (let i = floats.length - 1; i >= 0; i--) {
      floats[i].t += dt;
      if (floats[i].t > 1.4) floats.splice(i, 1);
    }

    if (camAnim) {
      const k = Math.min(1, (now - camAnim.t0) / camAnim.dur);
      const ez = 1 - Math.pow(1 - k, 3);
      for (const key of ['tx', 'tz', 'dist', 'yaw']) cam[key] = camAnim.from[key] + (camAnim.to[key] - camAnim.from[key]) * ez;
      updateCamera();
      if (k >= 1) camAnim = null;
    }

    if (hintMsg && now > hintMsg.until) { hintMsg = null; refreshHint(); }
    if (hudDirty) updateHUD();
    const gc = countKind('guest');
    if (gc !== lastGuestCount) {
      lastGuestCount = gc;
      const el = document.getElementById('guest-count');
      if (el) el.textContent = gc;
    }

    // Living scene (wind, water, animals) -> render every frame
    timeUniforms.uTime.value = now / 1000;
    waterNormal.offset.set((now / 1000) * 0.012, (now / 1000) * 0.007);
    const { hoverCorner } = updateHighlights(now);
    renderer.render(scene, camera);
    drawLabels(now, hoverCorner);
    dirty = false;
    requestAnimationFrame(frame);
  }

  // =========================================================
  // Boot
  // =========================================================
  new ResizeObserver(() => document.documentElement.style.setProperty('--dock-h', dockEl.offsetHeight + 'px')).observe(dockEl);
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 150));

  requestAnimationFrame(() => setTimeout(async () => {
    const t0 = performance.now();
    const custom = await loadCustomModels();
    TR.paint();
    terrainChanged();
    worldChanged();
    renderIcons();
    setTab('fences');
    resize();
    updateHUD();
    setGrid(false);
    console.log(`World built in ${Math.round(performance.now() - t0)} ms` + (custom.length ? ` (custom models: ${custom.join(', ')})` : ''));
    loadingEl.hidden = true;
    flash('Build a fenced enclosure, then add animals!', 'good', 5000);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { dirty = true; });
    last = performance.now();
    requestAnimationFrame(frame);
  }, 30));

  // Debug / test hook
  window.zoo = {
    cam, state, entities, handleTap, selectTool, TOOLS, updateCamera,
    screenOfCorner: (gx, gy) => toScreen(gx - HALF, 0, gy - HALF),
  };
})();
