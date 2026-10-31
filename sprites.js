/* =========================================================
 * Zoo Tycoon — sprites.js
 * Flat-vector characters & fences drawn with canvas paths.
 * All drawing happens in world units around the subject's feet
 * (0,0), facing right; the caller flips with scale(-1,1).
 * Because everything is a path, sprites stay crisp at any zoom.
 * Exposes window.Zoo.sprites
 * ========================================================= */
(() => {
  'use strict';
  const Zoo = (window.Zoo = window.Zoo || {});
  const TAU = Math.PI * 2;

  // ---------- Shape helpers ----------
  function ell(c, x, y, rx, ry, fill) {
    c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, TAU); c.fillStyle = fill; c.fill();
  }
  const circ = (c, x, y, r, fill) => ell(c, x, y, r, r, fill);

  function rrectPath(c, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }
  function rrect(c, x, y, w, h, r, fill) { rrectPath(c, x, y, w, h, r); c.fillStyle = fill; c.fill(); }

  function poly(c, pts, fill) {
    c.beginPath();
    c.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]);
    c.closePath();
    c.fillStyle = fill; c.fill();
  }

  function stroke(c, color, width, fn) {
    c.strokeStyle = color; c.lineWidth = width; c.lineCap = 'round'; c.lineJoin = 'round';
    c.beginPath(); fn(); c.stroke();
  }

  /** Ellipse with a flat darker underside (simple two-tone shading). */
  function shadedEll(c, x, y, rx, ry, fill, shade) {
    ell(c, x, y, rx, ry, fill);
    c.save();
    c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, TAU); c.clip();
    c.fillStyle = shade;
    c.beginPath(); c.ellipse(x, y + ry * 0.95, rx * 1.1, ry * 0.62, 0, 0, TAU); c.fill();
    c.restore();
  }

  const lift = v => Math.max(0, v) * 1.6;

  /** Rounded leg from `top` down to the ground (minus lift), optional hoof/paw. */
  function leg(c, x, top, w, lifted, fill, foot) {
    const bottom = -lifted;
    rrect(c, x - w / 2, top, w, bottom - top, w / 2, fill);
    if (foot) rrect(c, x - w / 2, bottom - 1.6, w, 1.6, 0.8, foot);
  }

  function eye(c, x, y, r = 0.95) {
    circ(c, x, y, r, '#23262D');
    circ(c, x + r * 0.35, y - r * 0.35, r * 0.35, '#FFFFFF');
  }

  // ---------- Animals ----------
  const ANIMALS = {
    lion(c, s) {
      const b = -Math.abs(s) * 0.8;
      const body = '#F4B942', bodyD = '#DE9A2A', mane = '#D2722F', maneD = '#B25B22', face = '#F9CB63', muzzle = '#FFE7AE';
      stroke(c, bodyD, 2, () => { c.moveTo(-9, -12 + b); c.quadraticCurveTo(-16, -12 + b, -15, -19 + b); });
      circ(c, -15, -20 + b, 2.4, maneD);
      leg(c, -6 + s * 1.8, -10 + b, 3.4, lift(-s), bodyD);
      leg(c, 6 - s * 1.8, -10 + b, 3.4, lift(s), bodyD);
      shadedEll(c, 0, -13 + b, 10.5, 6.2, body, bodyD);
      leg(c, -4 - s * 1.8, -10 + b, 3.8, lift(s), body, '#FBD98C');
      leg(c, 8 + s * 1.8, -10 + b, 3.8, lift(-s), body, '#FBD98C');
      // Mane: a scalloped disc
      for (let i = 0; i < 11; i++) {
        const a = (i / 11) * TAU;
        circ(c, 9 + Math.cos(a) * 6.4, -19 + b + Math.sin(a) * 6.4, 2.9, i % 2 ? mane : maneD);
      }
      circ(c, 9, -19 + b, 7, mane);
      circ(c, 6.6, -23.2 + b, 1.7, face);
      circ(c, 12.6, -23.2 + b, 1.7, face);
      circ(c, 9.6, -18.6 + b, 5, face);
      ell(c, 10.6, -16.4 + b, 3, 2, muzzle);
      eye(c, 8.1, -19.8 + b);
      eye(c, 12, -19.8 + b);
      poly(c, [9.5, -17.6 + b, 11.7, -17.6 + b, 10.6, -16.3 + b], '#5A3520');
    },

    elephant(c, s) {
      const b = -Math.abs(s) * 0.6;
      const skin = '#A9B5C4', skinD = '#8E9BAC', ear = '#97A4B5', inner = '#F2B8C4', tusk = '#FFFDF2';
      stroke(c, skinD, 1.5, () => { c.moveTo(-14, -18 + b); c.quadraticCurveTo(-17, -14 + b, -16.5, -10 + b); });
      circ(c, -16.5, -9.5 + b, 1.3, '#4A5160');
      leg(c, -8 + s * 1.5, -12 + b, 5.6, lift(-s), skinD);
      leg(c, 6 - s * 1.5, -12 + b, 5.6, lift(s), skinD);
      shadedEll(c, -1, -17 + b, 14, 10.5, skin, skinD);
      for (const [x, l] of [[-5 - s * 1.5, lift(s)], [9 + s * 1.5, lift(-s)]]) {
        leg(c, x, -11 + b, 6.2, l, skin);
        ell(c, x + 1.2, -l - 1, 1.3, 0.8, '#E9EDF2');
        ell(c, x - 1.4, -l - 1, 1.1, 0.7, '#E9EDF2');
      }
      circ(c, 13, -22 + b, 8.4, skin);
      stroke(c, skin, 4.4, () => { c.moveTo(18.5, -19 + b); c.bezierCurveTo(22.5, -14 + b, 20.5, -8.5 + b, 23.5, -6.5 + b); });
      circ(c, 23.6, -6.6 + b, 2.2, skin);
      stroke(c, tusk, 1.9, () => { c.moveTo(17, -15 + b); c.quadraticCurveTo(19, -11.5 + b, 21.5, -12.5 + b); });
      ell(c, 7.2, -21 + b, 6.2, 8.2, ear);
      ell(c, 7.6, -21 + b, 3.9, 5.7, inner);
      eye(c, 15.4, -24.3 + b, 1.05);
      circ(c, 17.5, -21 + b, 1.2, 'rgba(242,184,196,0.7)');
    },

    zebra(c, s) {
      const b = -Math.abs(s) * 0.8;
      const W = '#FBFBF7', Wd = '#E2E3DC', K = '#262A31';
      stroke(c, W, 1.7, () => { c.moveTo(-10, -15 + b); c.quadraticCurveTo(-13.5, -13 + b, -14, -9 + b); });
      ell(c, -14.1, -8.2 + b, 1.4, 2.2, K);
      leg(c, -6 + s * 1.8, -11 + b, 2.9, lift(-s), Wd, K);
      leg(c, 6 - s * 1.8, -11 + b, 2.9, lift(s), Wd, K);
      shadedEll(c, 0, -14 + b, 10.5, 5.9, W, Wd);
      // Stripes clipped to the body
      c.save();
      c.beginPath(); c.ellipse(0, -14 + b, 10.5, 5.9, 0, 0, TAU); c.clip();
      for (const x of [-8, -4.4, -0.8, 2.8, 6.4]) {
        stroke(c, K, 1.5, () => { c.moveTo(x - 1.5, -21 + b); c.quadraticCurveTo(x + 1.8, -14 + b, x - 1, -7 + b); });
      }
      c.restore();
      for (const [x, l] of [[-4 - s * 1.8, lift(s)], [8 + s * 1.8, lift(-s)]]) {
        leg(c, x, -10.5 + b, 3.1, l, W, K);
        rrect(c, x - 1.55, -6.5 - l, 3.1, 1.3, 0.5, K);
      }
      // Neck with stripes
      const neck = [5, -16 + b, 8.2, -27 + b, 13, -26 + b, 10.4, -13 + b];
      poly(c, neck, W);
      c.save();
      c.beginPath(); c.moveTo(neck[0], neck[1]); for (let i = 2; i < 8; i += 2) c.lineTo(neck[i], neck[i + 1]); c.closePath(); c.clip();
      for (const y of [-24, -20.5, -17]) stroke(c, K, 1.4, () => { c.moveTo(4, y + b); c.lineTo(14, y + 1.5 + b); });
      c.restore();
      stroke(c, K, 2.6, () => { c.moveTo(5.6, -17 + b); c.lineTo(8.4, -29.5 + b); });
      // Head
      c.save();
      c.translate(13.6, -27.6 + b);
      c.rotate(0.38);
      ell(c, 0, 0, 5.8, 3.3, W);
      stroke(c, K, 1.2, () => { c.moveTo(-2.8, -3); c.lineTo(-2.2, 3); c.moveTo(-0.2, -3.2); c.lineTo(0.2, 3.2); });
      ell(c, 4.4, 0.3, 2.5, 2.6, '#3B3F47');
      c.restore();
      poly(c, [9.4, -30.2 + b, 10.4, -34.6 + b, 12.4, -30.6 + b], W);
      poly(c, [9.9, -32.5 + b, 10.4, -34.6 + b, 11.2, -32.6 + b], K);
      eye(c, 13, -29.3 + b, 0.95);
    },
  };

  // Hit-test / label bounds relative to the feet, facing right
  const BOUNDS = {
    lion:     { x0: -18, x1: 17, y0: -28, y1: 2 },
    elephant: { x0: -19, x1: 26, y0: -32, y1: 2 },
    zebra:    { x0: -16, x1: 17, y0: -36, y1: 2 },
    person:   { x0: -6,  x1: 6,  y0: -23, y1: 2 },
  };

  // ---------- People ----------
  const GUEST_LOOKS = [
    { shirt: '#EF6461', pants: '#3D4A6B', skin: '#F3C9A0', hair: '#5A3A22' },
    { shirt: '#4C9BE8', pants: '#3A3F47', skin: '#C98B5B', hair: '#1F1F24' },
    { shirt: '#F7C548', pants: '#5B6B3A', skin: '#E2AF7E', hair: '#8A5A2A' },
    { shirt: '#9B6DD6', pants: '#2F3B4C', skin: '#8D5A3B', hair: '#121212' },
    { shirt: '#3BBF8A', pants: '#6A4E3D', skin: '#FCDCB8', hair: '#D8A94F' },
    { shirt: '#F28C38', pants: '#34495E', skin: '#F3C9A0', hair: '#6D3B1A' },
    { shirt: '#F4F5F7', pants: '#8E3B46', skin: '#C98B5B', hair: '#2B1B0E' },
  ];
  const KEEPER_LOOK = { shirt: '#8C9A4E', pants: '#5E6634', skin: '#E2AF7E', hair: '#3A2614', hat: '#D9C38A' };

  function darken(hex, f) {
    const v = parseInt(hex.slice(1), 16);
    const ch = s => Math.round(((v >> s) & 255) * (1 - f));
    return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
  }

  function drawPerson(c, s, look) {
    const l1 = Math.max(0, s) * 1.3, l2 = Math.max(0, -s) * 1.3;
    rrect(c, -2.7 + s * 0.8, -7.5, 2.4, 7.5 - l1, 1.2, look.pants);
    rrect(c, 0.3 - s * 0.8, -7.5, 2.4, 7.5 - l2, 1.2, look.pants);
    const arm = darken(look.shirt, 0.15);
    rrect(c, -4.9, -14 - s * 0.7, 2, 6, 1, arm);
    rrect(c, 2.9, -14 + s * 0.7, 2, 6, 1, arm);
    rrect(c, -3.6, -15, 7.2, 8.6, 2.8, look.shirt);
    circ(c, 0, -18.2, 3.2, look.skin);
    if (look.hat) {
      ell(c, 0, -20.2, 4.8, 1.4, look.hat);
      rrect(c, -2.6, -23.4, 5.2, 3.4, 1.8, look.hat);
      rrect(c, -2.6, -21.2, 5.2, 0.9, 0.3, darken(look.hat, 0.25));
    } else {
      c.beginPath(); c.arc(0, -18.4, 3.3, Math.PI * 1.05, Math.PI * 1.95); c.closePath();
      c.fillStyle = look.hair; c.fill();
    }
  }

  // ---------- Fences ----------
  const FENCES = {
    1: { name: 'Wood Fence', height: 12 },
    2: { name: 'Iron Fence', height: 16 },
  };
  const FC = {
    1: { top: '#E7B37A', left: '#C88B4C', right: '#A86F38', rail: '#C98C4E', railTop: '#EBB880' },
    2: { top: '#8A93A3', left: '#5A6271', right: '#434A57', rail: '#4E5563', railTop: '#8A93A3', bar: '#434A57', tip: '#B9C1CC' },
  };

  function drawFenceSegment(c, type, ax, ay, bx, by) {
    const f = FC[type], H = FENCES[type].height;
    stroke(c, 'rgba(0,0,0,0.12)', 2.4, () => { c.moveTo(ax, ay + 1.2); c.lineTo(bx, by + 1.2); });
    if (type === 1) {
      for (const r of [4, 9]) {
        poly(c, [ax, ay - r - 2.6, bx, by - r - 2.6, bx, by - r, ax, ay - r], f.rail);
        stroke(c, f.railTop, 0.9, () => { c.moveTo(ax, ay - r - 2.6); c.lineTo(bx, by - r - 2.6); });
      }
    } else {
      c.strokeStyle = f.bar; c.lineWidth = 1; c.lineCap = 'butt';
      c.beginPath();
      for (let i = 1; i < 8; i++) {
        const t = i / 8, x = ax + (bx - ax) * t, y = ay + (by - ay) * t;
        c.moveTo(x, y); c.lineTo(x, y - H + 1.5);
      }
      c.stroke();
      for (const r of [3, H - 3.5]) poly(c, [ax, ay - r - 1.5, bx, by - r - 1.5, bx, by - r, ax, ay - r], f.rail);
      for (let i = 1; i < 8; i++) {
        const t = i / 8;
        circ(c, ax + (bx - ax) * t, ay + (by - ay) * t - H + 1.2, 0.8, f.tip);
      }
    }
  }

  /** Isometric box post: top + two visible side faces. */
  function drawFencePost(c, type, x, y, corner) {
    const f = FC[type];
    const w = corner ? 3.4 : 2.7, h = FENCES[type].height + (corner ? 2.5 : 1.5), hw = w / 2;
    ell(c, x, y + 0.6, w + 1.2, (w + 1.2) / 2, 'rgba(0,0,0,0.12)');
    poly(c, [x - w, y - h, x, y - h + hw, x, y + hw, x - w, y], f.left);
    poly(c, [x, y - h + hw, x + w, y - h, x + w, y, x, y + hw], f.right);
    poly(c, [x, y - h - hw, x + w, y - h, x, y - h + hw, x - w, y - h], f.top);
    if (type === 2) circ(c, x, y - h - 1.2, w * 0.75, corner ? '#E3B94F' : f.tip);
  }

  // ---------- Icons for the toolbar (rendered at high resolution) ----------
  function icon(w, h, scale, fn) {
    const c = document.createElement('canvas');
    c.width = Math.round(w * scale); c.height = Math.round(h * scale);
    const x = c.getContext('2d');
    x.scale(scale, scale);
    fn(x);
    return c.toDataURL();
  }

  function terrainIcon(key) {
    const TR = Zoo.terrain;
    return icon(48, 34, 4, c => {
      const cx = 24, cy = 4, w = 22, h = 11, d = 7;
      poly(c, [cx - w, cy + h, cx, cy + h * 2, cx, cy + h * 2 + d, cx - w, cy + h + d], key === 'water' ? '#2A68A3' : TR.SOIL_L);
      poly(c, [cx, cy + h * 2, cx + w, cy + h, cx + w, cy + h + d, cx, cy + h * 2 + d], key === 'water' ? '#245A8E' : TR.SOIL_R);
      poly(c, [cx - w, cy + h, cx, cy + h * 2, cx, cy + h * 2 + 2.5, cx - w, cy + h + 2.5], TR.SIDE[key]);
      poly(c, [cx, cy + h * 2, cx + w, cy + h, cx + w, cy + h + 2.5, cx, cy + h * 2 + 2.5], TR.SIDE[key]);
      poly(c, [cx, cy, cx + w, cy + h, cx, cy + h * 2, cx - w, cy + h], TR.COLORS[key][0]);
      if (key === 'water') stroke(c, 'rgba(255,255,255,0.55)', 1.4, () => { c.moveTo(16, 15); c.lineTo(26, 15); c.moveTo(22, 19); c.lineTo(30, 19); });
      if (key === 'path') stroke(c, '#B7BDC6', 1.2, () => { c.moveTo(cx - w * 0.5, cy + h * 0.5); c.lineTo(cx + w * 0.5, cy + h * 1.5); });
      if (key === 'grass') { circ(c, 18, 14, 1.3, '#7DB563'); circ(c, 29, 18, 1.3, '#7DB563'); }
      if (key === 'dirt') { circ(c, 19, 16, 1.1, '#CDB27F'); circ(c, 28, 13, 1.1, '#CDB27F'); }
    });
  }

  const icons = {};
  for (const k of ['grass', 'dirt', 'water', 'path']) icons[k] = terrainIcon(k);
  for (const [id, type] of [['wood', 1], ['iron', 2]]) {
    icons[id] = icon(48, 34, 4, c => {
      drawFencePost(c, type, 6, 22, false);
      drawFenceSegment(c, type, 6, 22, 24, 31);
      drawFencePost(c, type, 24, 31, false);
      drawFenceSegment(c, type, 24, 31, 42, 22);
      drawFencePost(c, type, 42, 22, true);
    });
  }
  icons.lion = icon(40, 34, 4, c => { c.translate(20, 31); ANIMALS.lion(c, 0); });
  icons.elephant = icon(48, 38, 4, c => { c.translate(22, 35); ANIMALS.elephant(c, 0); });
  icons.zebra = icon(36, 40, 4, c => { c.translate(17, 38); ANIMALS.zebra(c, 0); });
  icons.keeper = icon(20, 28, 4, c => { c.translate(10, 26); drawPerson(c, 0, KEEPER_LOOK); });

  Zoo.sprites = {
    drawAnimal: (c, species, swing) => ANIMALS[species](c, swing),
    drawPerson, drawFenceSegment, drawFencePost,
    GUEST_LOOKS, KEEPER_LOOK, FENCES, BOUNDS, icons,
  };
})();
