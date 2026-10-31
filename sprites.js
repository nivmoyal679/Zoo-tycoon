/* =========================================================
 * Retro Zoo Tycoon — sprites.js
 * Procedural pixel-art sprites: animals, people, fences, icons.
 * Every sprite is built from simple shapes on a tiny pixel grid,
 * then auto-shaded (lit top, dark underside) and outlined.
 * Exposes window.Zoo.sprites
 * ========================================================= */
(() => {
  'use strict';
  const Zoo = (window.Zoo = window.Zoo || {});

  // ---------- Colour helpers ----------
  function parse(hex) {
    const h = hex.slice(1);
    const v = parseInt(h.length === 8 ? h.slice(0, 6) : h, 16);
    const a = h.length === 8 ? parseInt(h.slice(6), 16) : 255;
    return [v >> 16, (v >> 8) & 255, v & 255, a];
  }
  const toHex = ([r, g, b]) => '#' + [r, g, b].map(c => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, '0')).join('');
  const shade = (hex, f) => {
    const [r, g, b] = parse(hex);
    return f >= 0
      ? toHex([r + (255 - r) * f, g + (255 - g) * f, b + (255 - b) * f])
      : toHex([r * (1 + f), g * (1 + f), b * (1 + f)]);
  };

  // ---------- Pixel grid ----------
  function grid(w, h) { return { w, h, px: new Array(w * h).fill(null) }; }
  function set(g, x, y, c) {
    x = Math.floor(x); y = Math.floor(y);
    if (x >= 0 && y >= 0 && x < g.w && y < g.h) g.px[y * g.w + x] = c;
  }
  const paint = (fill, x, y) => (typeof fill === 'function' ? fill(x, y) : fill);
  function rect(g, x, y, w, h, fill) {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) set(g, i, j, paint(fill, i, j));
  }
  function ellipse(g, cx, cy, rx, ry, fill) {
    for (let y = Math.floor(cy - ry) - 1; y <= cy + ry + 1; y++) {
      for (let x = Math.floor(cx - rx) - 1; x <= cx + rx + 1; x++) {
        const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy <= 1) set(g, x, y, paint(fill, x, y));
      }
    }
  }
  function line(g, x0, y0, x1, y1, fill, thick = 1) {
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let s = 0; s <= steps; s++) {
      const x = x0 + ((x1 - x0) * s) / steps, y = y0 + ((y1 - y0) * s) / steps;
      rect(g, Math.round(x), Math.round(y), thick, 1, fill);
    }
  }

  /** Grid -> canvas, with optional auto-shading and selective outline. */
  function finalize(g, { outline = true, light = true, outlineColor = null } = {}) {
    const { w, h } = g;
    const src = g.px;
    const out = src.slice();
    const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? null : src[y * w + x]);
    if (light) {
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const c = src[y * w + x];
        if (!c || c.length > 7) continue;
        if (!at(x, y - 1)) out[y * w + x] = shade(c, 0.22);
        else if (!at(x, y + 1)) out[y * w + x] = shade(c, -0.25);
      }
    }
    if (outline) {
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        if (src[y * w + x]) continue;
        const n = at(x, y - 1) || at(x, y + 1) || at(x - 1, y) || at(x + 1, y);
        if (n && n.length <= 7) out[y * w + x] = outlineColor || shade(n, -0.7);
      }
    }
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(w, h);
    for (let i = 0; i < out.length; i++) {
      if (!out[i]) continue;
      const [r, gg, b, a] = parse(out[i]);
      img.data.set([r, gg, b, a], i * 4);
    }
    ctx.putImageData(img, 0, 0);
    return c;
  }

  // Walk cycle: diagonal leg pairs swing opposite to each other
  const SWING = [-1, 0, 1, 0];
  function legs(f) {
    const a = SWING[f];
    return { a, b: -a, liftA: f === 1 ? 1 : 0, liftB: f === 3 ? 1 : 0 };
  }
  function leg(g, x, y, w, h, color, hoof, lift) {
    rect(g, x, y, w, h - lift, color);
    if (hoof) rect(g, x, y + h - lift - 1, w, 1, hoof);
  }

  // ---------- Animals (all drawn facing right) ----------
  const ANIMALS = {
    lion: {
      w: 32, h: 23, ax: 15, ay: 21,
      draw(g, f) {
        const body = '#d6a24a', far = '#b07c2c', mane = '#8a4515', maneL = '#a85a1e', muzzle = '#f0d9a0';
        const { a, b, liftA, liftB } = legs(f);
        line(g, 6, 11, 3, 7, body);                     // tail
        rect(g, 2, 5, 2, 2, mane);
        leg(g, 8 + b, 13, 2, 8, far, '#6b4a1c', liftB);  // far legs
        leg(g, 19 + a, 13, 2, 8, far, '#6b4a1c', liftA);
        ellipse(g, 14, 11.5, 9, 4.3, body);              // body
        rect(g, 8, 14, 12, 1, '#c99540');                 // belly line
        leg(g, 10 + a, 13, 3, 8, body, '#8a6526', liftA); // near legs
        leg(g, 21 + b, 13, 3, 8, body, '#8a6526', liftB);
        ellipse(g, 24, 8, 5.2, 5.8, (x, y) => ((x * 3 + y) % 4 === 0 ? maneL : mane)); // mane
        ellipse(g, 25.6, 8.6, 3.3, 2.9, body);           // face
        rect(g, 27, 9, 3, 2, muzzle);
        set(g, 29, 9, '#3a1a0a');                          // nose
        set(g, 26, 7, '#1a0d05');                          // eye
        set(g, 24, 4, maneL);
      },
    },
    elephant: {
      w: 42, h: 32, ax: 19, ay: 30,
      draw(g, f) {
        const skin = '#8e9098', far = '#73757d', ear = '#7b7d86', tusk = '#f4efdd', toe = '#c9c7bb';
        const { a, b, liftA, liftB } = legs(f);
        line(g, 5, 13, 3, 20, far);                      // tail
        rect(g, 2, 20, 2, 2, '#3a3a3a');
        leg(g, 9 + b, 19, 4, 11, far, '#5b5d64', liftB);  // far legs
        leg(g, 24 + a, 19, 4, 11, far, '#5b5d64', liftA);
        ellipse(g, 17, 15, 12.5, 8.8, skin);             // body
        leg(g, 12 + a, 20, 5, 10, skin, toe, liftA);      // near legs
        leg(g, 27 + b, 20, 5, 10, skin, toe, liftB);
        ellipse(g, 31, 11, 5.6, 6.2, skin);              // head
        for (let y = 13; y <= 26; y++) {                  // trunk
          const x = 34 + (y > 21 ? 1 : 0) + (y > 24 ? 1 : 0);
          rect(g, x, y, y < 18 ? 3 : 2, 1, skin);
        }
        set(g, 37, 25, skin); set(g, 37, 24, skin);
        line(g, 32, 17, 34, 19, tusk);                   // tusk
        ellipse(g, 27.5, 11.5, 4.2, 6.2, ear);            // ear
        ellipse(g, 27.8, 11.5, 2.4, 4, '#9a8088');
        set(g, 33, 9, '#111');                            // eye
      },
    },
    zebra: {
      w: 32, h: 27, ax: 14, ay: 25,
      draw(g, f) {
        const W = '#f2f0e6', K = '#1e1e22';
        const stripes = (x, y) => (((x + (y >> 1)) % 3 === 0) ? K : W);
        const legStripe = (x, y) => (y % 3 === 0 ? K : W);
        const { a, b, liftA, liftB } = legs(f);
        line(g, 5, 11, 3, 17, W);                        // tail
        rect(g, 2, 17, 2, 2, K);
        leg(g, 8 + b, 13, 2, 11, legStripe, K, liftB);   // far legs
        leg(g, 18 + a, 13, 2, 11, legStripe, K, liftA);
        ellipse(g, 13, 11.5, 8.6, 4.3, stripes);         // body
        leg(g, 10 + a, 14, 3, 10, legStripe, K, liftA);   // near legs
        leg(g, 20 + b, 14, 3, 10, legStripe, K, liftB);
        ellipse(g, 21, 7.5, 2.8, 5, (x, y) => (y % 2 === 0 ? K : W)); // neck
        line(g, 19, 7, 22, 1, K);                        // mane
        ellipse(g, 25, 4, 4.4, 2.3, stripes);            // head
        rect(g, 27, 4, 3, 2, '#2c2c30');                 // muzzle
        set(g, 25, 3, '#000');                            // eye
        set(g, 22, 0, W); set(g, 23, 0, K);              // ears
      },
    },
  };

  // ---------- People ----------
  function person(g, f, { shirt, pants, skin, hair, hat }) {
    const lift = [0, 1, 0, 0][f], lift2 = [0, 0, 0, 1][f];
    rect(g, 3, 11, 2, 5 - lift, pants);      // legs
    rect(g, 5, 11, 2, 5 - lift2, pants);
    rect(g, 3, 15 - lift, 2, 1, '#2a2018');  // shoes
    rect(g, 5, 15 - lift2, 2, 1, '#2a2018');
    rect(g, 2, 6, 6, 6, shirt);              // torso
    rect(g, 1, 7 + (f === 1 ? 1 : 0), 1, 4, shirt);
    rect(g, 8, 7 + (f === 3 ? 1 : 0), 1, 4, shirt);
    set(g, 1, 11 + (f === 1 ? 1 : 0), skin);
    set(g, 8, 11 + (f === 3 ? 1 : 0), skin);
    ellipse(g, 5, 3.6, 2.6, 2.7, skin);      // head
    if (hat) { rect(g, 1, 1, 8, 1, hat); rect(g, 3, 0, 4, 1, hat); }
    else rect(g, 3, 1, 4, 1, hair);
  }

  const GUEST_LOOKS = [
    { shirt: '#c0392b', pants: '#2c3e70', skin: '#f1c27d', hair: '#4a2c14' },
    { shirt: '#2e86c1', pants: '#3b3b3b', skin: '#c68642', hair: '#1a1a1a' },
    { shirt: '#f1c40f', pants: '#4a5a2a', skin: '#e0ac69', hair: '#8a5a2a' },
    { shirt: '#8e44ad', pants: '#2c3e50', skin: '#8d5524', hair: '#0e0e0e' },
    { shirt: '#27ae60', pants: '#5d4037', skin: '#ffdbac', hair: '#d4a24a' },
    { shirt: '#e67e22', pants: '#34495e', skin: '#f1c27d', hair: '#6d3b1a' },
    { shirt: '#ecf0f1', pants: '#7b241c', skin: '#c68642', hair: '#2b1b0e' },
  ];
  const KEEPER_LOOK = { shirt: '#9c8a4a', pants: '#6b5e32', skin: '#e0ac69', hair: '#3a2614', hat: '#c7b37a' };

  // ---------- Build sprite sheets ----------
  function build(def) {
    const frames = [];
    for (let f = 0; f < 4; f++) {
      const g = grid(def.w, def.h);
      def.draw(g, f);
      frames.push(finalize(g));
    }
    return { frames, ax: def.ax, ay: def.ay, w: def.w, h: def.h };
  }

  const animals = {};
  for (const [k, def] of Object.entries(ANIMALS)) animals[k] = build(def);

  const personDef = look => ({ w: 10, h: 17, ax: 5, ay: 15, draw: (g, f) => person(g, f, look) });
  const guests = GUEST_LOOKS.map(l => build(personDef(l)));
  const keeper = build(personDef(KEEPER_LOOK));

  // ---------- Fences ----------
  // A segment runs from its anchor point 32 px right / 16 px down (one tile
  // edge). The mirrored canvas covers edges running down-left.
  const FENCES = {
    1: { name: 'Wood Fence', height: 13 },
    2: { name: 'Iron Fence', height: 18 },
  };

  function mirror(src) {
    const c = document.createElement('canvas');
    c.width = src.width; c.height = src.height;
    const x = c.getContext('2d');
    x.translate(src.width, 0); x.scale(-1, 1);
    x.drawImage(src, 0, 0);
    return c;
  }

  function fenceSegment(type) {
    const H = FENCES[type].height;
    const g = grid(36, H + 22);
    const ax = 2, ay = H + 3;
    for (let t = 0; t <= 32; t++) {
      const gx = ax + t, gy = ay + Math.floor(t / 2);
      set(g, gx, gy + 1, '#00000048');                   // ground shadow
      if (type === 1) {
        for (const r of [4, 9]) {                        // two log rails
          set(g, gx, gy - r - 1, '#b8844a');
          set(g, gx, gy - r, '#8a5a2c');
          set(g, gx, gy - r + 1, '#4a2e17');
        }
        if (t >= 15 && t <= 16) {                         // middle picket
          for (let y = 1; y <= 11; y++) set(g, gx, gy - y, t === 15 ? '#8d5f34' : '#5a3a1c');
          set(g, gx, gy - 12, '#b8844a');
        }
      } else {
        set(g, gx, gy - 3, '#4a4a55');                    // bottom rail
        set(g, gx, gy - 2, '#1c1c22');
        set(g, gx, gy - H + 4, '#5a5a66');                // top rail
        set(g, gx, gy - H + 5, '#1c1c22');
        if (t % 3 === 1) {                               // bars with spear tips
          for (let y = 2; y <= H - 2; y++) set(g, gx, gy - y, '#2a2a31');
          set(g, gx, gy - H + 1, '#9a9aa6');
        }
      }
    }
    const right = finalize(g, { outline: false, light: false });
    return { right, left: mirror(right), ax, ay, w: g.w };
  }

  function fencePost(type, corner) {
    const H = FENCES[type].height;
    const g = grid(9, H + 8);
    const ax = 4, ay = H + 6;
    set(g, 3, ay + 1, '#00000048'); set(g, 4, ay + 1, '#00000048'); set(g, 5, ay + 1, '#00000048');
    if (type === 1) {
      const top = ay - H - 2 - (corner ? 1 : 0);
      rect(g, 3, top, 3, ay - top + 1, (x) => (x === 3 ? '#9a6a3a' : x === 4 ? '#7d5129' : '#5a3a1c'));
      rect(g, 3, top, 3, 1, '#c8955a');
      if (corner) rect(g, 2, top + 2, 5, 1, '#6b4423');
      return { canvas: finalize(g, { light: false, outlineColor: '#24150a' }), ax, ay };
    }
    const top = ay - H - 1;
    rect(g, 3, top, 3, ay - top + 1, (x) => (x === 3 ? '#5a5a66' : x === 4 ? '#33333b' : '#1e1e24'));
    const knob = corner ? 2 : 1;
    rect(g, 4 - knob + 1, top - 2, knob * 2 - 1 + (corner ? 0 : 1), 2, '#e0b84a');
    set(g, 4, top - 2, '#fff0a8');
    return { canvas: finalize(g, { light: false, outlineColor: '#121216' }), ax, ay };
  }

  const fences = {};
  for (const type of [1, 2]) {
    fences[type] = { segment: fenceSegment(type), post: fencePost(type, false), corner: fencePost(type, true) };
  }

  // ---------- Toolbar icons ----------
  function iconCanvas(w, h, fn) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const x = c.getContext('2d');
    x.imageSmoothingEnabled = false;
    fn(x);
    return c.toDataURL();
  }

  function terrainIcon(colors, extra) {
    const g = grid(34, 20);
    const rnd = Zoo.terrain.mulberry32(colors.length * 31 + colors[0].length);
    for (let y = 0; y < 17; y++) {
      const hw = y < 8 ? (y + 1) * 2 : (17 - y) * 2 - 2;
      for (let x = 17 - hw; x < 17 + hw; x++) {
        set(g, x, y + 1, colors[Math.floor(rnd() * colors.length)]);
      }
    }
    if (extra) extra(g);
    return finalize(g, { light: false, outlineColor: '#1a1008' }).toDataURL();
  }

  const H = Zoo.terrain.HEX;
  const icons = {
    grass: terrainIcon(H.grass.slice(2, 7), g => { set(g, 12, 8, '#f1dc4f'); set(g, 20, 11, '#f4f1e2'); }),
    dirt: terrainIcon(H.dirt.slice(1, 6), g => { set(g, 14, 7, '#c49d68'); set(g, 19, 12, '#c49d68'); }),
    water: terrainIcon(H.water.slice(1, 5), g => { rect(g, 10, 7, 4, 1, '#b4dcf2'); rect(g, 18, 11, 5, 1, '#6eaedb'); }),
    path: terrainIcon(H.stone.slice(1, 5), g => {
      for (let y = 2; y < 17; y += 4) for (let x = 0; x < 34; x++) if (g.px[y * 34 + x]) set(g, x, y, '#4f4535');
    }),
  };
  for (const type of [1, 2]) {
    const f = fences[type];
    icons[type === 1 ? 'wood' : 'iron'] = iconCanvas(44, 38, x => {
      const s = f.segment, p = f.post;
      x.drawImage(p.canvas, 4 - p.ax, 12 + 2 - p.ay + 8);
      x.drawImage(s.right, 4 - s.ax, 14 + 8 - s.ay);
      x.drawImage(p.canvas, 36 - p.ax, 30 - p.ay + 8);
    });
  }
  for (const k of Object.keys(animals)) {
    const a = animals[k];
    icons[k] = iconCanvas(a.w, a.h, x => x.drawImage(a.frames[0], 0, 0));
  }
  icons.keeper = iconCanvas(10, 17, x => x.drawImage(keeper.frames[0], 0, 0));
  icons.guest = iconCanvas(22, 17, x => {
    x.drawImage(guests[0].frames[0], 0, 0);
    x.drawImage(guests[1].frames[2], 11, 0);
  });

  Zoo.sprites = { animals, guests, keeper, fences, FENCES, icons };
})();
