/* =========================================================
 * Zoo Tycoon 3D — textures.js
 * Procedural, tileable textures for realistic surfaces:
 * ground detail + normals, water normals, grass tufts, leaves,
 * bark, wood grain and animal coats. All generated on canvases
 * at start-up (no image downloads needed).
 * Exposes window.Zoo.textures (canvases; main.js wraps them).
 * ========================================================= */
(() => {
  'use strict';
  const Zoo = (window.Zoo = window.Zoo || {});
  const { hash, mulberry32 } = Zoo.terrain;

  const smooth = t => t * t * (3 - 2 * t);
  /** Periodic value noise: tiles every `p` lattice cells. */
  function pnoise(x, y, p, seed = 0) {
    const x0 = Math.floor(x), y0 = Math.floor(y);
    const h = (a, b) => hash((((a % p) + p) % p) + seed * 131, (((b % p) + p) % p) + seed * 71);
    const sx = smooth(x - x0), sy = smooth(y - y0);
    const a = h(x0, y0), b = h(x0 + 1, y0), c = h(x0, y0 + 1), d = h(x0 + 1, y0 + 1);
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  }
  /** Tileable fBm over a `size` px texture. */
  function pfbm(x, y, size, base, octaves, seed = 0) {
    let v = 0, amp = 0.5, tot = 0, cells = base;
    for (let o = 0; o < octaves; o++) {
      v += pnoise((x / size) * cells, (y / size) * cells, cells, seed + o) * amp;
      tot += amp; amp *= 0.5; cells *= 2;
    }
    return v / tot;
  }

  function canvas(w, h = w) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }

  /** Height field (Float32Array, tileable) -> tangent-space normal map canvas. */
  function normalFromHeight(hf, size, strength) {
    const c = canvas(size);
    const g = c.getContext('2d');
    const img = g.createImageData(size, size);
    const at = (x, y) => hf[((y + size) % size) * size + ((x + size) % size)];
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const l = Math.hypot(dx, dy, 1);
      const o = (y * size + x) * 4;
      img.data[o] = ((-dx / l) * 0.5 + 0.5) * 255;
      img.data[o + 1] = ((dy / l) * 0.5 + 0.5) * 255;
      img.data[o + 2] = ((1 / l) * 0.5 + 0.5) * 255;
      img.data[o + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    return c;
  }

  // ---------- Ground detail (fine grass/grit), grey around 50% ----------
  function groundDetail() {
    const S = 256;
    const hf = new Float32Array(S * S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      hf[y * S + x] = pfbm(x, y, S, 16, 4, 3) * 0.6 + hash(x + 77, y) * 0.4;
    }
    // Short blade strokes (wrapped so the texture tiles)
    const rnd = mulberry32(5);
    for (let i = 0; i < 5000; i++) {
      const x0 = rnd() * S, y0 = rnd() * S, len = 3 + rnd() * 6, ang = -Math.PI / 2 + (rnd() - 0.5) * 0.9;
      const v = (rnd() - 0.4) * 0.5;
      for (let t = 0; t < len; t++) {
        const x = Math.round(x0 + Math.cos(ang) * t), y = Math.round(y0 + Math.sin(ang) * t);
        const k = ((y % S) + S) % S * S + ((x % S) + S) % S;
        hf[k] = Math.min(1, Math.max(0, hf[k] + v * (1 - t / len)));
      }
    }
    const c = canvas(S);
    const g = c.getContext('2d');
    const img = g.createImageData(S, S);
    for (let i = 0; i < S * S; i++) {
      const v = 96 + hf[i] * 64; // centred near 128 so it multiplies to ~1.0
      img.data.set([v, v, v, 255], i * 4);
    }
    g.putImageData(img, 0, 0);
    return { map: c, normal: normalFromHeight(hf, S, 2.2) };
  }

  // ---------- Water ripples ----------
  function waterNormal() {
    const S = 256;
    const hf = new Float32Array(S * S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      hf[y * S + x] = pfbm(x, y, S, 6, 5, 9) + 0.35 * Math.sin((x / S) * Math.PI * 2 * 6 + pfbm(x, y, S, 4, 2, 4) * 6);
    }
    return normalFromHeight(hf, S, 3.5);
  }

  // ---------- Grass tuft (alpha) ----------
  function grassTuft() {
    const c = canvas(128);
    const g = c.getContext('2d');
    const rnd = mulberry32(11);
    for (let i = 0; i < 46; i++) {
      const bx = 64 + (rnd() - 0.5) * 70, h = 60 + rnd() * 62, lean = (rnd() - 0.5) * 50;
      const w = 2 + rnd() * 3;
      const grad = g.createLinearGradient(0, 128, 0, 128 - h);
      const tone = 0.75 + rnd() * 0.5;
      grad.addColorStop(0, `rgb(${40 * tone | 0},${70 * tone | 0},${24 * tone | 0})`);
      grad.addColorStop(1, `rgb(${120 * tone | 0},${158 * tone | 0},${66 * tone | 0})`);
      g.fillStyle = grad;
      g.beginPath();
      g.moveTo(bx - w, 128);
      g.quadraticCurveTo(bx + lean * 0.3, 128 - h * 0.6, bx + lean, 128 - h);
      g.quadraticCurveTo(bx + lean * 0.3 + w * 0.5, 128 - h * 0.6, bx + w, 128);
      g.closePath();
      g.fill();
    }
    return c;
  }

  // ---------- Leaf cluster (alpha) ----------
  function leaves() {
    const S = 256;
    const c = canvas(S);
    const g = c.getContext('2d');
    const rnd = mulberry32(21);
    for (let i = 0; i < 130; i++) {
      const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * 105;
      const x = 128 + Math.cos(a) * r, y = 128 + Math.sin(a) * r;
      const tone = 0.7 + rnd() * 0.45, shade = 1 - (r / 105) * 0.25;
      g.save();
      g.translate(x, y);
      g.rotate(rnd() * Math.PI * 2);
      g.fillStyle = `rgb(${62 * tone * shade | 0},${100 * tone * shade | 0},${36 * tone * shade | 0})`;
      g.beginPath();
      g.ellipse(0, 0, 13 + rnd() * 6, 6 + rnd() * 3, 0, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = `rgba(30,50,18,0.5)`;
      g.lineWidth = 1;
      g.beginPath(); g.moveTo(-12, 0); g.lineTo(12, 0); g.stroke();
      g.restore();
    }
    return c;
  }

  // ---------- Bark & wood ----------
  function bark() {
    const W = 64, H = 256;
    const c = canvas(W, H);
    const g = c.getContext('2d');
    const img = g.createImageData(W, H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const v = pfbm(x * 4, y, 256, 8, 4, 2) * 0.7 + hash(x, y) * 0.3;
      const k = 0.55 + v * 0.6;
      img.data.set([92 * k, 72 * k, 54 * k, 255], (y * W + x) * 4);
    }
    g.putImageData(img, 0, 0);
    return c;
  }

  function woodGrain() {
    const W = 256, H = 64;
    const c = canvas(W, H);
    const g = c.getContext('2d');
    const img = g.createImageData(W, H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const grain = Math.sin((y + pfbm(x, y * 4, 256, 4, 3, 7) * 18) * 0.9) * 0.5 + 0.5;
      const v = 0.72 + grain * 0.2 + hash(x, y) * 0.08;
      img.data.set([255 * v, 255 * v, 255 * v, 255], (y * W + x) * 4);
    }
    g.putImageData(img, 0, 0);
    return c;
  }

  // ---------- Animal coats (mapped on X-axis spheres: u around, v along length) ----------
  function coat(kind) {
    const S = 256;
    const c = canvas(S);
    const g = c.getContext('2d');
    const img = g.createImageData(S, S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const n = pfbm(x, y, S, 8, 4, 13) * 0.6 + hash(x * 3, y) * 0.4; // fur grain
      // u (x) runs around the body: u=0 underneath (belly), u=0.5 along the spine
      const belly = Math.max(0, Math.cos((x / S) * Math.PI * 2)) ** 1.5;
      const spine = Math.max(0, -Math.cos((x / S) * Math.PI * 2)) ** 2;
      let r, gg, b;
      if (kind === 'lion') {
        const k = (0.82 + n * 0.3) * (1 - spine * 0.12);
        r = (172 + belly * 50) * k; gg = (122 + belly * 62) * k; b = (62 + belly * 70) * k;
      } else if (kind === 'elephant') {
        const wr = pfbm(x * 3, y, S * 3, 16, 3, 3); // irregular creases
        const k = (0.74 + n * 0.22 + wr * 0.1) * (1 - belly * 0.12) * (1 + spine * 0.05);
        r = 120 * k; gg = 114 * k; b = 108 * k;
      } else { // zebra: wavy vertical stripes running along the body length (v)
        const wob = pfbm(x, y, S, 4, 2, 5) * 2.2 + Math.sin((x / S) * Math.PI * 4) * 0.4;
        const s = Math.sin((y / S) * Math.PI * 2 * 9 + wob);
        const ink = s > 0.15 ? 1 : s > -0.05 ? (s + 0.05) / 0.2 : 0;
        const w = 228 + n * 22, k = 26 + n * 20;
        r = w + (k - w) * ink; gg = r; b = r - 6 * (1 - ink);
      }
      img.data.set([r, gg, b, 255], (y * S + x) * 4);
    }
    g.putImageData(img, 0, 0);
    return c;
  }

  /** Small fur / skin bump normal map (tileable). */
  function furNormal() {
    const S = 128;
    const hf = new Float32Array(S * S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) hf[y * S + x] = pfbm(x, y, S, 16, 3, 41) * 0.5 + hash(x, y + 5) * 0.5;
    return normalFromHeight(hf, S, 1.4);
  }

  Zoo.textures = { groundDetail, waterNormal, grassTuft, leaves, bark, woodGrain, coat, furNormal };
})();
