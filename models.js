/* =========================================================
 * Zoo Tycoon 3D — models.js
 * Procedural 3D models (Three.js) with natural proportions,
 * textured coats and jointed legs; textured fences; leaf-card
 * trees; grass tufts; and drop-in GLB model support.
 * Models face +X with their feet at the origin. 1 unit = 1 tile.
 * Exposes window.Zoo.models
 * ========================================================= */
(() => {
  'use strict';
  const Zoo = (window.Zoo = window.Zoo || {});
  const THREE = window.THREE;
  const TX = Zoo.textures;

  // ---------- Texture helpers ----------
  function tex(canvas, rx = 1, ry = 1, srgb = true) {
    const t = new THREE.CanvasTexture(canvas);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(rx, ry);
    t.anisotropy = 4;
    return t;
  }
  const FUR_N = TX.furNormal();
  const T = {
    lion: tex(TX.coat('lion')),
    elephant: tex(TX.coat('elephant')),
    zebra: tex(TX.coat('zebra')),
    furN: tex(FUR_N, 4, 2, false),
    skinN: tex(FUR_N, 8, 4, false),
    bark: tex(TX.bark(), 1, 2),
    wood: tex(TX.woodGrain(), 1, 1),
    leaves: tex(TX.leaves()),
    tuft: tex(TX.grassTuft()),
  };
  T.tuft.wrapS = T.tuft.wrapT = THREE.ClampToEdgeWrapping;
  T.leaves.wrapS = T.leaves.wrapT = THREE.ClampToEdgeWrapping;

  // Leg stripes for the zebra: rings along a cylinder (v axis)
  const RINGS = (() => {
    const c = document.createElement('canvas');
    c.width = 16; c.height = 128;
    const g = c.getContext('2d');
    g.fillStyle = '#ecebe4'; g.fillRect(0, 0, 16, 128);
    g.fillStyle = '#222226';
    for (let i = 0; i < 9; i++) g.fillRect(0, i * 14.2 + 2, 16, 6 - i * 0.4);
    return tex(c);
  })();

  // ---------- Geometry / materials ----------
  const G = {
    sphere: new THREE.SphereGeometry(1, 24, 16),
    sphereX: new THREE.SphereGeometry(1, 28, 18).rotateZ(Math.PI / 2), // poles on X: u wraps around the body
    cone: new THREE.ConeGeometry(1, 1, 12),
    box: new THREE.BoxGeometry(1, 1, 1),
  };
  const taperCache = new Map();
  function taperGeo(r0, r1) {
    const k = r0.toFixed(4) + ',' + r1.toFixed(4);
    let g = taperCache.get(k);
    if (!g) { g = new THREE.CylinderGeometry(r0, r1, 1, 14, 1); taperCache.set(k, g); }
    return g;
  }

  /**
   * One smooth, organic torso: an X-axis sphere deformed by a profile along its length.
   * prof(x) -> [top, bottom, side] radius multipliers, x in [-1 (tail), 1 (head)].
   */
  function bodyGeo(prof) {
    const g = new THREE.SphereGeometry(1, 48, 32).rotateZ(Math.PI / 2);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const [top, bot, side] = prof(x);
      p.setXYZ(i, x, y * (y > 0 ? top : bot), z * side);
    }
    g.computeVertexNormals();
    return g;
  }
  const bump = (x, c, w) => Math.exp(-(((x - c) / w) ** 2));
  const BODY = {
    lion: bodyGeo(x => [0.92 + 0.14 * bump(x, 0.55, 0.3) + 0.06 * bump(x, -0.6, 0.3), 0.86 - 0.18 * bump(x, -0.1, 0.4), 1 - 0.14 * bump(x, -0.05, 0.35)]),
    zebra: bodyGeo(x => [0.94 + 0.1 * bump(x, 0.6, 0.3) + 0.08 * bump(x, -0.6, 0.3), 0.95 - 0.05 * bump(x, -0.4, 0.3), 0.97 - 0.06 * bump(x, 0, 0.4)]),
    elephant: bodyGeo(x => [1 + 0.14 * bump(x, 0.42, 0.35) - 0.04 * bump(x, -0.2, 0.3), 1.05 + 0.12 * bump(x, 0.05, 0.5), 1 + 0.04 * bump(x, 0.3, 0.5)]),
  };

  /** Shaggy sphere (mane, tail tuft): smooth noise displacement. */
  const SHAGGY = (() => {
    const g = new THREE.SphereGeometry(1, 36, 26);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const r = 1 + 0.13 * Math.sin(9 * x + 2) * Math.sin(8 * y + 1) * Math.sin(10 * z) + 0.07 * Math.sin(23 * x + 17 * y + 11 * z) + 0.05 * Math.sin(31 * y - 19 * z);
      p.setXYZ(i, x * r, y * r, z * r);
    }
    g.computeVertexNormals();
    return g;
  })();

  const matCache = new Map();
  function mat(key, params) {
    let m = matCache.get(key);
    if (!m) { m = new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0, ...params }); matCache.set(key, m); }
    return m;
  }
  const MAT = {
    lion: mat('lion', { map: T.lion, normalMap: T.furN, normalScale: new THREE.Vector2(0.6, 0.6), roughness: 0.92 }),
    lionMane: mat('lionMane', { color: '#6b3f1d', normalMap: T.furN, normalScale: new THREE.Vector2(1.2, 1.2), roughness: 0.95 }),
    lionMuzzle: mat('lionMuzzle', { color: '#e3cda4', roughness: 0.9 }),
    elephant: mat('elephant', { map: T.elephant, normalMap: T.skinN, normalScale: new THREE.Vector2(1.1, 1.1), roughness: 0.95 }),
    elephantEar: mat('elephantEar', { color: '#6a6560', normalMap: T.skinN, roughness: 0.95, side: THREE.DoubleSide }),
    ivory: mat('ivory', { color: '#ece3cc', roughness: 0.45 }),
    zebra: mat('zebra', { map: T.zebra, normalMap: T.furN, normalScale: new THREE.Vector2(0.4, 0.4), roughness: 0.9 }),
    zebraRings: mat('zebraRings', { map: RINGS, roughness: 0.9 }),
    zebraWhite: mat('zebraWhite', { color: '#e9e7df', roughness: 0.9 }),
    darkMuzzle: mat('darkMuzzle', { color: '#2a2a2d', roughness: 0.7 }),
    hoof: mat('hoof', { color: '#1d1c1b', roughness: 0.6 }),
    eye: mat('eye', { color: '#0b0a09', roughness: 0.12 }),
    nose: mat('nose', { color: '#3a2620', roughness: 0.5 }),
  };

  function mesh(geo, material, pos = [0, 0, 0], scale = [1, 1, 1], rot = [0, 0, 0], shadow = true) {
    const m = new THREE.Mesh(geo, material);
    m.position.set(pos[0], pos[1], pos[2]);
    m.scale.set(scale[0], scale[1], scale[2]);
    m.rotation.set(rot[0], rot[1], rot[2]);
    m.castShadow = shadow;
    m.receiveShadow = true;
    return m;
  }

  const UP = new THREE.Vector3(0, 1, 0);
  /** Tapered cylinder from 2D point a (radius r0) to b (radius r1), at depth z. */
  function limbSeg(material, a, b, r0, r1, z = 0, shadow = true) {
    const va = new THREE.Vector3(a[0], a[1], z), vb = new THREE.Vector3(b[0], b[1], z);
    const dir = vb.clone().sub(va);
    const m = new THREE.Mesh(taperGeo(r1, r0), material); // CylinderGeometry: radiusTop, radiusBottom
    m.position.copy(va).addScaledVector(dir, 0.5);
    m.scale.set(1, dir.length(), 1);
    m.quaternion.setFromUnitVectors(UP, dir.normalize());
    m.castShadow = shadow;
    m.receiveShadow = true;
    return m;
  }

  /** Jointed leg: hip pivot -> upper segment -> knee pivot -> lower segment -> hoof/paw. */
  function leg(parent, { x, z, hip, upper, lower, r, mats, foot, phase, shadow = true }) {
    const h = new THREE.Group();
    h.position.set(x, hip, z);
    h.add(limbSeg(mats[0], [0, 0], [0, -upper], r[0], r[1], 0, shadow));
    const k = new THREE.Group();
    k.position.y = -upper;
    h.add(k);
    k.add(limbSeg(mats[1] || mats[0], [0, 0], [0, -lower], r[2], r[3], 0, shadow));
    if (foot) k.add(foot(lower));
    parent.add(h);
    return { pivot: h, knee: k, phase };
  }

  // ---------- Animals ----------
  function lion() {
    const root = new THREE.Group(), body = new THREE.Group();
    root.add(body);
    const C = MAT.lion;
    const legs = [];
    const paw = len => mesh(G.sphere, C, [0.012, -len + 0.013, 0], [0.033, 0.017, 0.028]);
    for (const [x, z, ph] of [[0.16, 0.058, 0], [0.16, -0.058, Math.PI], [-0.17, 0.058, Math.PI], [-0.17, -0.058, 0]]) {
      legs.push(leg(body, { x, z, hip: 0.33, upper: 0.17, lower: 0.16, r: [0.046, 0.032, 0.028, 0.024], mats: [C], foot: paw, phase: ph }));
    }
    body.add(mesh(BODY.lion, C, [0, 0.37, 0], [0.29, 0.122, 0.104]));
    body.add(limbSeg(C, [0.2, 0.42], [0.3, 0.5], 0.075, 0.06));
    const head = new THREE.Group();
    head.position.set(0.33, 0.49, 0);
    body.add(head);
    head.add(mesh(SHAGGY, MAT.lionMane, [-0.05, -0.02, 0], [0.12, 0.15, 0.135]));
    body.add(mesh(SHAGGY, MAT.lionMane, [0.21, 0.4, 0], [0.085, 0.1, 0.09]));
    head.add(mesh(G.sphere, C, [0, 0, 0], [0.072, 0.068, 0.062]));
    head.add(mesh(G.sphereX, MAT.lionMuzzle, [0.058, -0.026, 0], [0.05, 0.036, 0.04]));
    head.add(mesh(G.sphere, MAT.nose, [0.104, -0.015, 0], [0.012, 0.01, 0.016], undefined, false));
    for (const s of [1, -1]) {
      head.add(mesh(G.sphere, MAT.eye, [0.048, 0.016, 0.032 * s], [0.0085, 0.0085, 0.0085], undefined, false));
      head.add(mesh(G.sphere, C, [-0.022, 0.058, 0.045 * s], [0.018, 0.022, 0.01]));
    }
    body.add(limbSeg(C, [-0.25, 0.39], [-0.38, 0.27], 0.014, 0.011));
    body.add(limbSeg(C, [-0.38, 0.27], [-0.45, 0.2], 0.011, 0.009));
    body.add(mesh(SHAGGY, MAT.lionMane, [-0.46, 0.19, 0], [0.024, 0.034, 0.024]));
    return { root, body, head, legs, height: 0.6, radius: 0.42, stride: 0.42 };
  }

  function elephant() {
    const root = new THREE.Group(), body = new THREE.Group();
    root.add(body);
    const C = MAT.elephant;
    const legs = [];
    const foot = len => {
      const g = new THREE.Group();
      g.add(mesh(taperGeo(0.098, 0.106), C, [0, -len + 0.025, 0], [1, 0.05, 1]));
      for (const a of [-0.6, 0, 0.6]) g.add(mesh(G.sphere, MAT.ivory, [0.085 * Math.cos(a), -len + 0.02, 0.085 * Math.sin(a)], [0.018, 0.014, 0.02], undefined, false));
      return g;
    };
    for (const [x, z, ph] of [[0.27, 0.15, 0], [0.27, -0.15, Math.PI], [-0.27, 0.15, Math.PI], [-0.27, -0.15, 0]]) {
      legs.push(leg(body, { x, z, hip: 0.6, upper: 0.31, lower: 0.29, r: [0.125, 0.1, 0.1, 0.096], mats: [C], foot, phase: ph }));
    }
    body.add(mesh(BODY.elephant, C, [0, 0.8, 0], [0.5, 0.32, 0.29]));
    const head = new THREE.Group();
    head.position.set(0.52, 0.96, 0);
    body.add(head);
    head.add(mesh(G.sphere, C, [0, 0, 0], [0.2, 0.23, 0.19]));
    head.add(mesh(G.sphere, C, [0.05, 0.1, 0], [0.14, 0.12, 0.15]));
    for (const s of [1, -1]) {
      head.add(mesh(G.sphere, MAT.elephantEar, [-0.12, -0.02, 0.17 * s], [0.025, 0.22, 0.17], [0.15 * s, 0.75 * s, 0]));
      head.add(mesh(G.sphere, MAT.eye, [0.14, 0.05, 0.135 * s], [0.012, 0.012, 0.012], undefined, false));
      const tusk = [[0.13, -0.17], [0.22, -0.25], [0.3, -0.25]];
      head.add(limbSeg(MAT.ivory, tusk[0], tusk[1], 0.026, 0.02, 0.085 * s));
      head.add(limbSeg(MAT.ivory, tusk[1], tusk[2], 0.02, 0.008, 0.085 * s));
    }
    const trunk = [[0.15, -0.03], [0.22, -0.2], [0.25, -0.38], [0.26, -0.54], [0.25, -0.68], [0.29, -0.78]];
    const radii = [0.09, 0.072, 0.06, 0.05, 0.042, 0.036];
    for (let i = 0; i < trunk.length - 1; i++) head.add(limbSeg(C, trunk[i], trunk[i + 1], radii[i], radii[i + 1]));
    body.add(limbSeg(C, [-0.45, 0.85], [-0.52, 0.5], 0.02, 0.014));
    body.add(mesh(G.sphere, MAT.hoof, [-0.525, 0.48, 0], [0.018, 0.035, 0.018]));
    return { root, body, head, legs, height: 1.2, radius: 0.7, stride: 0.38 };
  }

  function zebra() {
    const root = new THREE.Group(), body = new THREE.Group();
    root.add(body);
    const C = MAT.zebra;
    const legs = [];
    const hoof = len => mesh(taperGeo(0.019, 0.023), MAT.hoof, [0.004, -len + 0.017, 0], [1, 0.034, 1]);
    for (const [x, z, ph] of [[0.16, 0.055, 0], [0.16, -0.055, Math.PI], [-0.17, 0.055, Math.PI], [-0.17, -0.055, 0]]) {
      legs.push(leg(body, { x, z, hip: 0.44, upper: 0.22, lower: 0.22, r: [0.04, 0.026, 0.021, 0.017], mats: [MAT.zebraRings, MAT.zebraWhite], foot: hoof, phase: ph }));
    }
    body.add(mesh(BODY.zebra, C, [0, 0.48, 0], [0.28, 0.13, 0.112]));
    body.add(limbSeg(MAT.zebraRings, [0.2, 0.53], [0.33, 0.73], 0.068, 0.044));
    body.add(limbSeg(MAT.hoof, [0.18, 0.6], [0.31, 0.8], 0.016, 0.014));
    const head = new THREE.Group();
    head.position.set(0.34, 0.76, 0);
    head.rotation.z = -1.0;
    body.add(head);
    head.add(mesh(G.sphereX, C, [0.075, 0, 0], [0.11, 0.05, 0.048]));
    head.add(mesh(G.sphere, MAT.darkMuzzle, [0.175, 0, 0], [0.04, 0.042, 0.042]));
    for (const s of [1, -1]) {
      head.add(mesh(G.sphere, MAT.eye, [0.06, 0.032, 0.04 * s], [0.008, 0.008, 0.008], undefined, false));
      head.add(limbSeg(MAT.zebraWhite, [-0.01, 0.03], [-0.04, 0.1], 0.016, 0.004, 0.028 * s));
    }
    body.add(limbSeg(MAT.zebraWhite, [-0.25, 0.5], [-0.33, 0.33], 0.012, 0.009));
    body.add(mesh(SHAGGY, MAT.hoof, [-0.335, 0.31, 0], [0.018, 0.04, 0.018]));
    return { root, body, head, legs, height: 0.86, radius: 0.42, stride: 0.5 };
  }

  // ---------- People (merged parts per body section for speed) ----------
  const GUEST_LOOKS = [
    { shirt: '#9b3b36', pants: '#2d3446', skin: '#e6b993', hair: '#3b2616', shoes: '#2b2622' },
    { shirt: '#3d6d9e', pants: '#3a3b3e', skin: '#b98258', hair: '#151515', shoes: '#efefef' },
    { shirt: '#d8c08a', pants: '#4c5233', skin: '#d6a47a', hair: '#7a5228', shoes: '#4a3a2c' },
    { shirt: '#5b4a7a', pants: '#2a3442', skin: '#7c4f35', hair: '#0e0e0e', shoes: '#1d1d1d' },
    { shirt: '#4f7d5f', pants: '#5d4636', skin: '#f2d2b2', hair: '#c49a4c', shoes: '#3a3530' },
    { shirt: '#c06d3a', pants: '#2f3e52', skin: '#e6b993', hair: '#5d3418', shoes: '#ddd' },
    { shirt: '#e5e6e8', pants: '#6d2f37', skin: '#b98258', hair: '#24170c', shoes: '#2b2622' },
  ];
  const KEEPER_LOOK = { shirt: '#6d7240', pants: '#5a5634', skin: '#d6a47a', hair: '#3a2614', shoes: '#3a2a1c', hat: '#c9b07a' };

  const personGeoCache = new Map();
  function personGeos(look) {
    const key = JSON.stringify(look);
    let g = personGeoCache.get(key);
    if (g) return g;
    const torso = [];
    part(torso, NI.taper(0.058, 0.07), look.shirt, [0, 0.37, 0], [1, 0.2, 0.68]);
    part(torso, NI.sphere, look.shirt, [0, 0.47, 0], [0.07, 0.03, 0.048]);
    part(torso, NI.cyl, look.skin, [0, 0.495, 0], [0.021, 0.04, 0.021]);
    part(torso, NI.sphere, look.skin, [0, 0.545, 0], [0.047, 0.057, 0.048]);
    part(torso, NI.sphere, look.skin, [0.044, 0.545, 0], [0.008, 0.012, 0.008]);
    if (look.hat) {
      part(torso, NI.cyl, look.hat, [0, 0.592, 0], [0.085, 0.008, 0.085]);
      part(torso, NI.taper(0.04, 0.047), look.hat, [0, 0.615, 0], [1, 0.045, 1]);
    } else {
      part(torso, NI.sphere, look.hair, [-0.006, 0.566, 0], [0.05, 0.038, 0.05]);
    }
    part(torso, NI.taper(0.06, 0.058), look.pants, [0, 0.265, 0], [1, 0.03, 0.68]);
    const legP = [];
    part(legP, NI.taper(0.026, 0.02), look.pants, [0, -0.13, 0], [1, 0.26, 1]);
    part(legP, NI.box, look.shoes, [0.012, -0.258, 0], [0.06, 0.022, 0.032]);
    const armP = [];
    part(armP, NI.taper(0.019, 0.015), look.shirt, [0, -0.09, 0], [1, 0.18, 1]);
    part(armP, NI.sphere, look.skin, [0, -0.19, 0], [0.016, 0.02, 0.016]);
    g = { torso: merge(torso), leg: merge(legP), arm: merge(armP) };
    personGeoCache.set(key, g);
    return g;
  }
  const PERSON_MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });

  function person(look, shadow) {
    const root = new THREE.Group(), body = new THREE.Group();
    root.add(body);
    const g = personGeos(look);
    const torso = new THREE.Mesh(g.torso, PERSON_MAT);
    torso.castShadow = shadow;
    body.add(torso);
    const legs = [];
    for (const [z, ph] of [[0.028, 0], [-0.028, Math.PI]]) {
      const p = new THREE.Group();
      p.position.set(0, 0.27, z);
      const m = new THREE.Mesh(g.leg, PERSON_MAT);
      m.castShadow = shadow;
      p.add(m);
      body.add(p);
      legs.push({ pivot: p, knee: null, phase: ph });
    }
    for (const [z, ph] of [[0.083, Math.PI], [-0.083, 0]]) {
      const p = new THREE.Group();
      p.position.set(0, 0.46, z);
      const m = new THREE.Mesh(g.arm, PERSON_MAT);
      m.castShadow = shadow;
      p.add(m);
      body.add(p);
      legs.push({ pivot: p, knee: null, phase: ph, arm: true });
    }
    return { root, body, legs, height: 0.62, radius: 0.18, stride: 0.35 };
  }

  const ANIMALS = { lion, elephant, zebra };

  // ---------- Drop-in GLB models ----------
  const glb = {};
  const TARGET_H = { lion: 0.6, elephant: 1.2, zebra: 0.86, keeper: 0.62, guest: 0.62 };
  const RADIUS = { lion: 0.42, elephant: 0.7, zebra: 0.42, keeper: 0.18, guest: 0.18 };

  async function loadGLB(key, url, opts = {}) {
    const A = window.THREE_ADDONS;
    if (!A) throw new Error('add-ons missing');
    const gltf = await new A.GLTFLoader().loadAsync(url);
    const box = new THREE.Box3().setFromObject(gltf.scene);
    const size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
    const h = opts.height || TARGET_H[key] || 0.6;
    glb[key] = {
      scene: gltf.scene, animations: gltf.animations,
      scale: h / (size.y || 1), center, minY: box.min.y,
      rotY: ((opts.rotationY ?? 90) * Math.PI) / 180, // glTF faces +Z; our models face +X
      height: h, radius: opts.radius || RADIUS[key] || 0.4,
    };
    return glb[key];
  }

  function fromGLB(key) {
    const t = glb[key];
    const A = window.THREE_ADDONS;
    const inst = A.SkeletonUtils.clone(t.scene);
    inst.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    const scaled = new THREE.Group();
    scaled.scale.setScalar(t.scale);
    scaled.position.set(-t.center.x * t.scale, -t.minY * t.scale, -t.center.z * t.scale);
    scaled.add(inst);
    const pivot = new THREE.Group();
    pivot.rotation.y = t.rotY;
    pivot.add(scaled);
    const root = new THREE.Group(), body = new THREE.Group();
    root.add(body);
    body.add(pivot);
    const mixer = new THREE.AnimationMixer(inst);
    const find = re => t.animations.find(c => re.test(c.name));
    const walkClip = find(/walk|run|trot|gallop|move/i);
    const idleClip = find(/idle|stand|breath|rest/i) || (walkClip ? null : t.animations[0]);
    const actions = {
      walk: walkClip ? mixer.clipAction(walkClip) : null,
      idle: idleClip ? mixer.clipAction(idleClip) : null,
    };
    return { root, body, legs: [], mixer, actions, current: null, height: t.height, radius: t.radius, stride: 0.4 };
  }

  function createAnimal(species) { return glb[species] ? fromGLB(species) : ANIMALS[species](); }
  function createPerson(look, shadow = true, keeper = false) {
    const key = keeper ? 'keeper' : 'guest';
    return glb[key] ? fromGLB(key) : person(look, shadow);
  }

  /** Walk cycle driven by gait phase `theta` (radians). */
  function animate(model, theta, moving, dt) {
    if (model.mixer) {
      const want = moving ? (model.actions.walk || model.actions.idle) : (model.actions.idle || null);
      if (want !== model.current) {
        if (model.current) model.current.fadeOut(0.25);
        if (want) want.reset().fadeIn(0.25).play();
        model.current = want;
      }
      if (!want && model.actions.walk) model.actions.walk.stop();
      model.mixer.update(dt);
      return;
    }
    for (const l of model.legs) {
      const ph = theta + l.phase;
      const amp = l.arm ? 0.45 : 0.42;
      l.pivot.rotation.z = moving ? Math.sin(ph) * amp : 0;
      if (l.knee) l.knee.rotation.z = moving ? -Math.max(0, Math.cos(ph)) * 0.75 : 0;
    }
    model.body.position.y = moving ? Math.abs(Math.sin(theta)) * 0.008 : 0;
    if (model.head) model.head.rotation.x = moving ? 0 : Math.sin(performance.now() / 1400 + model.root.id) * 0.06;
  }

  // ---------- Static geometry merging (uv + vertex colours) ----------
  const NI = {
    box: new THREE.BoxGeometry(1, 1, 1).toNonIndexed(),
    sphere: new THREE.SphereGeometry(1, 10, 8).toNonIndexed(),
    cyl: new THREE.CylinderGeometry(1, 1, 1, 8).toNonIndexed(),
    cone: new THREE.ConeGeometry(1, 1, 10).toNonIndexed(),
    plane: new THREE.PlaneGeometry(1, 1).toNonIndexed(),
    _taper: new Map(),
    taper(r0, r1) {
      const k = r0 + ',' + r1;
      let g = this._taper.get(k);
      if (!g) { g = new THREE.CylinderGeometry(r1, r0, 1, 10).toNonIndexed(); this._taper.set(k, g); } // r0 bottom, r1 top
      return g;
    },
  };
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
  const _c = new THREE.Color();

  function part(list, geo, color, pos, scale, rot = [0, 0, 0], quat = null) {
    if (quat) _q.copy(quat); else { _e.set(rot[0], rot[1], rot[2]); _q.setFromEuler(_e); }
    _m.compose(_p.set(pos[0], pos[1], pos[2]), _q, _s.set(scale[0], scale[1], scale[2]));
    list.push({ geo, matrix: _m.clone(), color });
  }
  const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _d = new THREE.Vector3();
  /** Part spanning 3D points a -> b (Y-axis aligned source geometry). */
  function partBetween(list, geo, color, a, b, sx, sz = sx) {
    _a.set(a[0], a[1], a[2]); _b.set(b[0], b[1], b[2]);
    _d.copy(_b).sub(_a);
    const len = _d.length();
    const q = new THREE.Quaternion().setFromUnitVectors(UP, _d.normalize());
    part(list, geo, color, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], [sx, len, sz], undefined, q);
  }

  function merge(parts) {
    let count = 0;
    for (const p of parts) count += p.geo.attributes.position.count;
    const pos = new Float32Array(count * 3), nor = new Float32Array(count * 3), col = new Float32Array(count * 3), uv = new Float32Array(count * 2);
    let o = 0;
    for (const p of parts) {
      const g = p.geo.clone().applyMatrix4(p.matrix);
      const n = g.attributes.position.count;
      pos.set(g.attributes.position.array, o * 3);
      nor.set(g.attributes.normal.array, o * 3);
      if (g.attributes.uv) uv.set(g.attributes.uv.array, o * 2);
      _c.set(p.color);
      for (let i = 0; i < n; i++) { col[(o + i) * 3] = _c.r; col[(o + i) * 3 + 1] = _c.g; col[(o + i) * 3 + 2] = _c.b; }
      o += n;
      g.dispose();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.computeBoundingSphere();
    return geo;
  }

  // ---------- Fences (separate wood / iron geometry for proper materials) ----------
  const FENCES = { 1: { name: 'Wood Fence' }, 2: { name: 'Iron Fence' } };

  function fenceGeometry(segs, posts) {
    const wood = [], iron = [];
    for (const s of segs) {
      const cx = s.x + (s.axis === 'x' ? 0.5 : 0), cz = s.z + (s.axis === 'z' ? 0.5 : 0);
      const rot = [0, s.axis === 'x' ? 0 : Math.PI / 2, 0];
      if (s.type === 1) {
        for (const h of [0.16, 0.31]) part(wood, NI.box, '#6e4b2e', [cx, h, cz], [1, 0.05, 0.03], rot);
      } else {
        for (const h of [0.06, 0.48]) part(iron, NI.box, '#2a2d31', [cx, h, cz], [1, 0.022, 0.022], rot);
        for (let i = 1; i < 10; i++) {
          const t = i / 10 - 0.5;
          const bx = cx + (s.axis === 'x' ? t : 0), bz = cz + (s.axis === 'z' ? t : 0);
          part(iron, NI.cyl, '#2e3136', [bx, 0.28, bz], [0.007, 0.5, 0.007]);
          part(iron, NI.cone, '#3b3f45', [bx, 0.545, bz], [0.012, 0.035, 0.012]);
        }
      }
    }
    for (const p of posts) {
      if (p.type === 1) {
        const w = p.corner ? 0.085 : 0.07, h = p.corner ? 0.44 : 0.4;
        part(wood, NI.cyl, '#5e3f25', [p.x, h / 2, p.z], [w / 2, h, w / 2]);
        part(wood, NI.cone, '#5e3f25', [p.x, h + 0.015, p.z], [w / 2, 0.03, w / 2]);
      } else {
        const w = p.corner ? 0.06 : 0.048;
        part(iron, NI.box, '#25282c', [p.x, 0.3, p.z], [w, 0.6, w]);
        part(iron, NI.sphere, p.corner ? '#a88a3c' : '#3b3f45', [p.x, 0.625, p.z], [0.032, 0.032, 0.032]);
      }
    }
    return { wood: wood.length ? merge(wood) : new THREE.BufferGeometry(), iron: iron.length ? merge(iron) : new THREE.BufferGeometry() };
  }

  const FENCE_MATS = {
    wood: new THREE.MeshStandardMaterial({ vertexColors: true, map: T.wood, roughness: 0.9 }),
    iron: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0.6 }),
  };

  // ---------- Trees (bark trunks + leaf cards) ----------
  function treesGeometry(spots, rng) {
    const trunks = [], leaves = [];
    const tints = ['#ffffff', '#e2ecd0', '#cfdcb4', '#f0f5e2', '#bccb9c'];
    for (const t of spots) {
      const s = t.scale;
      if (t.pine) {
        partBetween(trunks, NI.taper(0.09 * s, 0.04 * s), '#ffffff', [t.x, 0, t.z], [t.x, 2.2 * s, t.z], 1);
        for (let i = 0; i < 5; i++) {
          const y = (0.55 + i * 0.36) * s, r = (0.78 - i * 0.13) * s;
          part(leaves, NI.cone, pick(rng, ['#9fb48d', '#8ea67c', '#a9bd95']), [t.x, y + 0.3 * s, t.z], [r, 0.75 * s, r], [0, rng() * 6, 0]);
        }
        continue;
      }
      const h = (1.15 + rng() * 0.3) * s;
      partBetween(trunks, NI.taper(0.11 * s, 0.05 * s), '#ffffff', [t.x, 0, t.z], [t.x + (rng() - 0.5) * 0.15 * s, h, t.z + (rng() - 0.5) * 0.15 * s], 1);
      for (let i = 0; i < 4; i++) {
        const a = rng() * Math.PI * 2, y = (0.7 + rng() * 0.4) * s;
        partBetween(trunks, NI.taper(0.04 * s, 0.018 * s), '#ffffff', [t.x, y, t.z],
          [t.x + Math.cos(a) * 0.45 * s, y + 0.35 * s, t.z + Math.sin(a) * 0.45 * s], 1);
      }
      const cy = h + 0.35 * s;
      const n = 46;
      for (let i = 0; i < n; i++) {
        const u = rng() * 2 - 1, th = rng() * Math.PI * 2, r = Math.pow(rng(), 0.4);
        const sxz = Math.sqrt(1 - u * u) * r;
        const px = t.x + Math.cos(th) * sxz * 0.78 * s, pz = t.z + Math.sin(th) * sxz * 0.78 * s, py = cy + u * r * 0.6 * s;
        const sz = (0.48 + rng() * 0.3) * s;
        part(leaves, NI.plane, tints[Math.floor(rng() * tints.length)], [px, py, pz], [sz, sz, sz], [rng() * 6.28, rng() * 6.28, rng() * 6.28]);
      }
    }
    return { trunks: merge(trunks), leaves: merge(leaves) };
  }
  const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];

  function bushesGeometry(spots, rng) {
    const leaves = [];
    const tints = ['#d4e2bd', '#c2d3a5', '#e6eed6'];
    for (const b of spots) {
      const s = 0.6 + rng() * 0.5;
      for (let i = 0; i < 14; i++) {
        const th = rng() * Math.PI * 2, r = rng() * 0.32 * s;
        const sz = (0.32 + rng() * 0.2) * s;
        part(leaves, NI.plane, tints[Math.floor(rng() * tints.length)],
          [b.x + Math.cos(th) * r, (0.16 + rng() * 0.22) * s, b.z + Math.sin(th) * r], [sz, sz, sz], [rng() * 6.28, rng() * 6.28, rng() * 6.28]);
      }
    }
    return merge(leaves);
  }

  const BARK_MAT = new THREE.MeshStandardMaterial({ map: T.bark, roughness: 0.95, vertexColors: true });
  const LEAF_MAT = new THREE.MeshStandardMaterial({ map: T.leaves, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.85, vertexColors: true });
  const LEAF_DEPTH = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: T.leaves, alphaTest: 0.45 });

  // ---------- Grass tuft (3 crossed cards, upward normals for soft lighting) ----------
  function tuftGeometry() {
    const parts = [];
    for (let k = 0; k < 3; k++) part(parts, NI.plane, '#ffffff', [0, 0.5, 0], [1, 1, 1], [0, (k * Math.PI) / 3, 0]);
    const g = merge(parts);
    const n = g.attributes.normal;
    for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
    g.deleteAttribute('color');
    return g;
  }
  const TUFT_MAT = new THREE.MeshStandardMaterial({ map: T.tuft, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.95 });

  /**
   * Inject a gentle wind sway into a material's vertex shader (works with instancing).
   * Optional fade = [near, far]: dithered fade-out by camera distance (for grass tufts).
   */
  function addWind(material, uniforms, amount, fade) {
    material.onBeforeCompile = sh => {
      sh.uniforms.uTime = uniforms.uTime;
      sh.vertexShader = 'uniform float uTime;\nvarying float vFadeDist;\n' + sh.vertexShader
        .replace('#include <begin_vertex>', `
          #include <begin_vertex>
          #ifdef USE_INSTANCING
            vec3 wpos = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
          #else
            vec3 wpos = (modelMatrix * vec4(position, 1.0)).xyz;
          #endif
          float sway = sin(uTime * 1.6 + wpos.x * 0.7 + wpos.z * 0.5) + 0.5 * sin(uTime * 2.7 + wpos.x * 1.9);
          transformed.x += sway * ${amount.toFixed(3)} * position.y;
          transformed.z += sway * ${(amount * 0.6).toFixed(3)} * position.y;
        `)
        .replace('#include <project_vertex>', '#include <project_vertex>\n  vFadeDist = -mvPosition.z;');
      if (fade) {
        sh.fragmentShader = 'varying float vFadeDist;\n' + sh.fragmentShader.replace('void main() {', `void main() {
          float fadeK = clamp((vFadeDist - ${fade[0].toFixed(1)}) / ${(fade[1] - fade[0]).toFixed(1)}, 0.0, 1.0);
          if (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) < fadeK) discard;`);
      }
    };
  }

  Zoo.models = {
    createAnimal, createPerson, animate, loadGLB, glb,
    fenceGeometry, FENCE_MATS, FENCES,
    treesGeometry, bushesGeometry, BARK_MAT, LEAF_MAT, LEAF_DEPTH,
    tuftGeometry, TUFT_MAT, addWind,
    GUEST_LOOKS, KEEPER_LOOK, tex,
  };
})();
