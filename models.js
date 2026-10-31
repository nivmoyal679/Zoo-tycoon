/* =========================================================
 * Zoo Tycoon 3D — models.js
 * Low-poly 3D models built from primitives (Three.js):
 * animals with hinged legs, people, fences, trees.
 * Models face +X with their feet at the origin. 1 unit = 1 tile.
 * Static scenery (fences, trees) is merged into single meshes
 * with vertex colours to keep draw calls low on phones.
 * Exposes window.Zoo.models
 * ========================================================= */
(() => {
  'use strict';
  const Zoo = (window.Zoo = window.Zoo || {});
  const THREE = window.THREE;

  // ---------- Shared geometry / materials ----------
  const G = {
    sphere: new THREE.SphereGeometry(1, 18, 12),
    sphereX: new THREE.SphereGeometry(1, 20, 16).rotateZ(Math.PI / 2), // poles on the X axis
    blob: new THREE.IcosahedronGeometry(1, 1),
    cyl: new THREE.CylinderGeometry(1, 1, 1, 12),
    cone: new THREE.ConeGeometry(1, 1, 10),
    box: new THREE.BoxGeometry(1, 1, 1),
  };

  const matCache = new Map();
  function mat(color, extra) {
    const key = color + (extra ? JSON.stringify(Object.keys(extra)) + (extra.map ? extra.map.uuid : '') : '');
    let m = matCache.get(key);
    if (!m) {
      m = new THREE.MeshStandardMaterial({ color, roughness: 0.82, metalness: 0, ...extra });
      matCache.set(key, m);
    }
    return m;
  }

  function mesh(geo, material, pos = [0, 0, 0], scale = [1, 1, 1], rot = [0, 0, 0], shadow = true) {
    const m = new THREE.Mesh(geo, material);
    m.position.set(pos[0], pos[1], pos[2]);
    m.scale.set(scale[0], scale[1], scale[2]);
    m.rotation.set(rot[0], rot[1], rot[2]);
    m.castShadow = shadow;
    return m;
  }

  const UP = new THREE.Vector3(0, 1, 0);
  /** Cylinder/cone of radius r spanning point a -> b (2D points in the XY plane, z offset). */
  function between(geo, material, a, b, r, z = 0, shadow = true) {
    const va = new THREE.Vector3(a[0], a[1], z), vb = new THREE.Vector3(b[0], b[1], z);
    const dir = vb.clone().sub(va);
    const len = dir.length();
    const m = new THREE.Mesh(geo, material);
    m.position.copy(va).addScaledVector(dir, 0.5);
    m.scale.set(r, len, r);
    m.quaternion.setFromUnitVectors(UP, dir.normalize());
    m.castShadow = shadow;
    return m;
  }

  /** Hinged leg: pivot at the hip, cylinder hanging to the ground. */
  function leg(parent, x, hipY, z, r, material, foot) {
    const pivot = new THREE.Group();
    pivot.position.set(x, hipY, z);
    pivot.add(mesh(G.cyl, material, [0, -hipY / 2, 0], [r, hipY, r]));
    if (foot) pivot.add(mesh(G.cyl, foot, [0, -hipY + 0.02, 0], [r * 1.12, 0.04, r * 1.12]));
    parent.add(pivot);
    return pivot;
  }

  function stripeTexture(vertical, count) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    g.fillStyle = '#f4f2ea';
    g.fillRect(0, 0, 128, 128);
    g.fillStyle = '#1d1e22';
    const w = 128 / count;
    for (let i = 0; i < count; i++) {
      if (vertical) g.fillRect(i * w, 0, w * 0.45, 128);
      else g.fillRect(0, i * w, 128, w * 0.45);
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  }
  const STRIPES_BODY = stripeTexture(false, 11); // rings around an X-axis sphere -> vertical body stripes
  const STRIPES_H = stripeTexture(false, 6);     // rings along a cylinder -> leg/neck stripes

  const eyePair = (parent, x, y, z, r, material) => {
    parent.add(mesh(G.sphere, material, [x, y, z], [r, r, r], undefined, false));
    parent.add(mesh(G.sphere, material, [x, y, -z], [r, r, r], undefined, false));
  };

  // Diagonal leg pairs swing in opposite phase
  const LEG_LAYOUT = (fx, bx, z) => [[fx, z, 1], [fx, -z, -1], [bx, z, -1], [bx, -z, 1]];

  // ---------- Animals ----------
  function lion() {
    const root = new THREE.Group(), body = new THREE.Group();
    root.add(body);
    const tan = mat('#cf9f55'), tanD = mat('#a97c3d'), mane = mat('#7b4421'), cream = mat('#f0dcae'), ink = mat('#24170e');
    const legs = LEG_LAYOUT(0.17, -0.17, 0.075).map(([x, z, p]) => ({ pivot: leg(body, x, 0.25, z, 0.036, tan, tanD), phase: p }));
    body.add(mesh(G.sphere, tan, [0, 0.31, 0], [0.31, 0.135, 0.135]));
    const head = new THREE.Group();
    head.position.set(0.29, 0.39, 0);
    body.add(head);
    head.add(mesh(G.blob, mane, [-0.02, 0, 0], [0.11, 0.135, 0.145]));
    head.add(mesh(G.sphere, tan, [0.06, 0, 0], [0.078, 0.082, 0.078]));
    head.add(mesh(G.sphere, cream, [0.125, -0.03, 0], [0.042, 0.032, 0.042]));
    head.add(mesh(G.sphere, ink, [0.162, -0.012, 0], [0.013, 0.011, 0.016], undefined, false));
    eyePair(head, 0.118, 0.026, 0.036, 0.011, ink);
    head.add(mesh(G.sphere, tan, [0.03, 0.078, 0.052], [0.022, 0.022, 0.013]));
    head.add(mesh(G.sphere, tan, [0.03, 0.078, -0.052], [0.022, 0.022, 0.013]));
    body.add(between(G.cyl, tan, [-0.28, 0.33], [-0.43, 0.2], 0.013));
    body.add(mesh(G.sphere, mane, [-0.44, 0.19, 0], [0.032, 0.04, 0.032]));
    return { root, body, legs, height: 0.55, radius: 0.42 };
  }

  function elephant() {
    const root = new THREE.Group(), body = new THREE.Group();
    root.add(body);
    const grey = mat('#8e9197'), greyD = mat('#76797f'), ear = mat('#83868c'), pink = mat('#c7999f'), ivory = mat('#f1e9d4'), ink = mat('#1f2024');
    const legs = LEG_LAYOUT(0.25, -0.25, 0.14).map(([x, z, p]) => ({ pivot: leg(body, x, 0.44, z, 0.078, grey, greyD), phase: p }));
    body.add(mesh(G.sphere, grey, [0, 0.62, 0], [0.47, 0.31, 0.29]));
    const head = new THREE.Group();
    head.position.set(0.44, 0.74, 0);
    body.add(head);
    head.add(mesh(G.sphere, grey, [0.06, 0, 0], [0.2, 0.21, 0.19]));
    for (const s of [1, -1]) {
      head.add(mesh(G.sphere, ear, [-0.02, 0.01, 0.19 * s], [0.06, 0.21, 0.17], [0, 0.35 * s, 0]));
      head.add(mesh(G.sphere, pink, [-0.005, 0.0, 0.205 * s], [0.035, 0.14, 0.11], [0, 0.35 * s, 0], false));
      head.add(between(G.cone, ivory, [0.19, -0.12], [0.31, -0.2], 0.022, 0.075 * s));
    }
    const trunk = [[0.22, -0.04], [0.29, -0.2], [0.31, -0.36], [0.35, -0.5]];
    for (let i = 0; i < trunk.length - 1; i++) head.add(between(G.cyl, grey, trunk[i], trunk[i + 1], 0.06 - i * 0.012));
    eyePair(head, 0.2, 0.06, 0.13, 0.016, ink);
    body.add(between(G.cyl, greyD, [-0.45, 0.62], [-0.52, 0.36], 0.014));
    body.add(mesh(G.sphere, ink, [-0.525, 0.34, 0], [0.025, 0.04, 0.025]));
    return { root, body, legs, height: 1.0, radius: 0.62 };
  }

  function zebra() {
    const root = new THREE.Group(), body = new THREE.Group();
    root.add(body);
    const coat = mat('#ffffff', { map: STRIPES_BODY }), ringed = mat('#ffffff', { map: STRIPES_H });
    const black = mat('#1d1e22'), white = mat('#f4f2ea');
    const legs = LEG_LAYOUT(0.18, -0.18, 0.07).map(([x, z, p]) => ({ pivot: leg(body, x, 0.33, z, 0.03, ringed, black), phase: p }));
    body.add(mesh(G.sphereX, coat, [0, 0.42, 0], [0.3, 0.145, 0.135]));
    body.add(between(G.cyl, ringed, [0.2, 0.45], [0.33, 0.68], 0.058));
    body.add(between(G.cyl, black, [0.17, 0.53], [0.3, 0.75], 0.02));
    const head = new THREE.Group();
    head.position.set(0.37, 0.7, 0);
    head.rotation.z = -0.6;
    body.add(head);
    head.add(mesh(G.sphereX, coat, [0.06, 0, 0], [0.12, 0.058, 0.058]));
    head.add(mesh(G.sphere, mat('#3a3b40'), [0.165, -0.005, 0], [0.04, 0.042, 0.045]));
    head.add(between(G.cone, white, [0.0, 0.04], [-0.02, 0.11], 0.016, 0.03));
    head.add(between(G.cone, white, [0.0, 0.04], [-0.02, 0.11], 0.016, -0.03));
    eyePair(head, 0.07, 0.03, 0.05, 0.01, black);
    body.add(between(G.cyl, white, [-0.28, 0.44], [-0.37, 0.25], 0.011));
    body.add(mesh(G.sphere, black, [-0.375, 0.23, 0], [0.022, 0.04, 0.022]));
    return { root, body, legs, height: 0.82, radius: 0.4 };
  }

  // ---------- People ----------
  const GUEST_LOOKS = [
    { shirt: '#d94c45', pants: '#2f3b5c', skin: '#f0c7a0', hair: '#4a2e1a' },
    { shirt: '#3f86d6', pants: '#33373d', skin: '#c58a5c', hair: '#18181b' },
    { shirt: '#f2c14a', pants: '#4c5a33', skin: '#e1ae7e', hair: '#8a5a2a' },
    { shirt: '#8e62c9', pants: '#2b3646', skin: '#8a573a', hair: '#101010' },
    { shirt: '#3aa776', pants: '#5e4636', skin: '#f9d9b6', hair: '#d2a24c' },
    { shirt: '#ee8a36', pants: '#33475b', skin: '#f0c7a0', hair: '#6b3a19' },
    { shirt: '#eceff1', pants: '#7e3640', skin: '#c58a5c', hair: '#2a1a0d' },
  ];
  const KEEPER_LOOK = { shirt: '#7f8a45', pants: '#5a5f30', skin: '#e1ae7e', hair: '#3a2614', hat: '#d5bf86' };

  function person(look, shadow) {
    const root = new THREE.Group(), body = new THREE.Group();
    root.add(body);
    const legs = [1, -1].map(s => {
      const pivot = new THREE.Group();
      pivot.position.set(0, 0.165, 0.026 * s);
      pivot.add(mesh(G.box, mat(look.pants), [0, -0.08, 0], [0.04, 0.16, 0.042], undefined, shadow));
      body.add(pivot);
      return { pivot, phase: s };
    });
    body.add(mesh(G.cyl, mat(look.shirt), [0, 0.24, 0], [0.052, 0.15, 0.06], undefined, shadow));
    for (const s of [1, -1]) body.add(mesh(G.box, mat(look.shirt), [0, 0.225, 0.066 * s], [0.03, 0.13, 0.026], undefined, shadow));
    body.add(mesh(G.sphere, mat(look.skin), [0, 0.355, 0], [0.047, 0.05, 0.047], undefined, shadow));
    if (look.hat) {
      body.add(mesh(G.cyl, mat(look.hat), [0, 0.392, 0], [0.085, 0.01, 0.085], undefined, shadow));
      body.add(mesh(G.cyl, mat(look.hat), [0, 0.415, 0], [0.045, 0.04, 0.045], undefined, shadow));
    } else {
      body.add(mesh(G.sphere, mat(look.hair), [-0.006, 0.37, 0], [0.049, 0.036, 0.049], undefined, shadow));
    }
    return { root, body, legs, height: 0.45, radius: 0.18 };
  }

  const ANIMALS = { lion, elephant, zebra };

  function createAnimal(species) { return ANIMALS[species](); }
  function createPerson(look, shadow = true) { return person(look, shadow); }

  /** Walk cycle: swing in [-1,1]; legs rotate about the hip, body bobs. */
  function animate(model, swing, moving) {
    const a = moving ? swing * 0.5 : 0;
    for (const l of model.legs) l.pivot.rotation.z = a * l.phase;
    model.body.position.y = moving ? Math.abs(swing) * 0.015 : 0;
  }

  // ---------- Static geometry merging (vertex-coloured) ----------
  const NI = {
    box: new THREE.BoxGeometry(1, 1, 1).toNonIndexed(),
    sphere: new THREE.SphereGeometry(1, 8, 6).toNonIndexed(),
    cyl: new THREE.CylinderGeometry(1, 1, 1, 7).toNonIndexed(),
    cone: new THREE.ConeGeometry(1, 1, 7).toNonIndexed(),
    blob: new THREE.IcosahedronGeometry(1, 1),
  };
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
  const _c = new THREE.Color();

  function part(list, geo, color, pos, scale, rotY = 0) {
    _e.set(0, rotY, 0);
    _q.setFromEuler(_e);
    _m.compose(_p.set(pos[0], pos[1], pos[2]), _q, _s.set(scale[0], scale[1], scale[2]));
    list.push({ geo, matrix: _m.clone(), color });
  }

  function merge(parts) {
    let count = 0;
    for (const p of parts) count += p.geo.attributes.position.count;
    const pos = new Float32Array(count * 3), nor = new Float32Array(count * 3), col = new Float32Array(count * 3);
    let o = 0;
    for (const p of parts) {
      const g = p.geo.clone().applyMatrix4(p.matrix);
      const n = g.attributes.position.count;
      pos.set(g.attributes.position.array, o * 3);
      nor.set(g.attributes.normal.array, o * 3);
      _c.set(p.color); // ColorManagement converts sRGB hex -> linear working space
      for (let i = 0; i < n; i++) { col[(o + i) * 3] = _c.r; col[(o + i) * 3 + 1] = _c.g; col[(o + i) * 3 + 2] = _c.b; }
      o += n;
      g.dispose();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.computeBoundingSphere();
    return geo;
  }

  // ---------- Fences ----------
  const FENCES = { 1: { name: 'Wood Fence' }, 2: { name: 'Iron Fence' } };

  /**
   * segs:  [{x, z, axis: 'x'|'z', type}]  segment start point, runs 1 unit along axis
   * posts: [{x, z, type, corner}]
   */
  function fenceGeometry(segs, posts) {
    const parts = [];
    for (const s of segs) {
      const cx = s.x + (s.axis === 'x' ? 0.5 : 0), cz = s.z + (s.axis === 'z' ? 0.5 : 0);
      const rot = s.axis === 'x' ? 0 : Math.PI / 2;
      if (s.type === 1) {
        for (const h of [0.17, 0.33]) part(parts, NI.box, '#5c3e24', [cx, h, cz], [1, 0.05, 0.032], rot);
        part(parts, NI.box, '#4b311c', [cx, 0.2, cz], [0.05, 0.4, 0.05], rot);              // mid picket
      } else {
        for (const h of [0.07, 0.5]) part(parts, NI.box, '#2b2f35', [cx, h, cz], [1, 0.024, 0.024], rot);
        for (let i = 1; i < 8; i++) {
          const t = i / 8 - 0.5;
          const bx = cx + (s.axis === 'x' ? t : 0), bz = cz + (s.axis === 'z' ? t : 0);
          part(parts, NI.box, '#30343a', [bx, 0.29, bz], [0.016, 0.5, 0.016]);
          part(parts, NI.cone, '#5b616b', [bx, 0.565, bz], [0.016, 0.05, 0.016]);
        }
      }
    }
    for (const p of posts) {
      if (p.type === 1) {
        const w = p.corner ? 0.095 : 0.075, h = p.corner ? 0.48 : 0.43;
        part(parts, NI.box, '#4a301b', [p.x, h / 2, p.z], [w, h, w]);
        part(parts, NI.box, '#6b4a2c', [p.x, h + 0.01, p.z], [w * 1.15, 0.02, w * 1.15]);
      } else {
        const w = p.corner ? 0.07 : 0.055;
        part(parts, NI.box, '#25282d', [p.x, 0.31, p.z], [w, 0.62, w]);
        part(parts, NI.sphere, p.corner ? '#c9a347' : '#6c727c', [p.x, 0.65, p.z], [0.04, 0.04, 0.04]);
      }
    }
    return parts.length ? merge(parts) : new THREE.BufferGeometry();
  }

  // ---------- Trees & scenery ----------
  function treesGeometry(spots, rng) {
    const parts = [];
    const greens = ['#4f7f2c', '#5d8f34', '#6a9b3a', '#46732a', '#7aa645'];
    for (const t of spots) {
      const s = t.scale;
      part(parts, NI.cyl, '#5a4330', [t.x, 0.5 * s, t.z], [0.07 * s, 1.0 * s, 0.07 * s]);
      const n = 3 + Math.floor(rng() * 2);
      for (let i = 0; i < n; i++) {
        const a = rng() * Math.PI * 2, d = (i === 0 ? 0 : 0.28) * s;
        const r = (0.42 + rng() * 0.2) * s;
        part(parts, NI.blob, greens[Math.floor(rng() * greens.length)],
          [t.x + Math.cos(a) * d, (1.25 + rng() * 0.35 + (i === 0 ? 0.25 : 0)) * s, t.z + Math.sin(a) * d], [r, r * 0.9, r]);
      }
    }
    return merge(parts);
  }

  function bushesGeometry(spots, rng) {
    const parts = [];
    for (const b of spots) {
      const r = 0.25 + rng() * 0.2;
      part(parts, NI.blob, rng() < 0.5 ? '#3f6a26' : '#557f30', [b.x, r * 0.55, b.z], [r, r * 0.75, r]);
    }
    return merge(parts);
  }

  Zoo.models = {
    createAnimal, createPerson, animate, fenceGeometry, treesGeometry, bushesGeometry, merge, part, NI,
    GUEST_LOOKS, KEEPER_LOOK, FENCES, mat,
  };
})();
