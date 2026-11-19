// The city: a 48×48 slab of 临江市 with the 幸福里 compound near the middle.
// Everything static is merged into one vertex-coloured mesh plus one emissive "glow" mesh.
// Buildings between the camera and the player are cut away in the shader (CUT uniforms).
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

const V3 = THREE.Vector3;
let seed = 1337;
export const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const rr = (a, b) => a + (b - a) * rnd();

// ---------------------------------------------------------------- Builder
export class Builder {
  constructor() { this.geos = []; }
  add(geo, color, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1, opt = {}) {
    let g = geo.index ? geo.toNonIndexed() : geo;
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
    const m = new THREE.Matrix4().compose(new V3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new V3(sx, sy, sz));
    g.applyMatrix4(m);
    const c = new THREE.Color(color);
    const jit = opt.jitter ?? 0.05;
    const k = 1 + (rnd() - 0.5) * jit * 2;
    const pos = g.attributes.position; const n = pos.count;
    const col = new Float32Array(n * 3);
    const ao = opt.ao ?? true;
    for (let i = 0; i < n; i++) {
      let f = k;
      if (ao) { const py = pos.getY(i); f *= 0.68 + 0.32 * Math.min(1, Math.max(0, (py - (opt.base ?? 0)) / 0.32)); }
      col[i * 3] = c.r * f; col[i * 3 + 1] = c.g * f; col[i * 3 + 2] = c.b * f;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.geos.push(g);
    return this;
  }
  box(w, h, d, color, x, y, z, ry = 0, opt) { return this.add(new THREE.BoxGeometry(w, h, d), color, x, y + h / 2, z, 0, ry, 0, 1, 1, 1, opt); }
  cyl(rt, rb, h, color, x, y, z, seg = 10, opt, rx = 0, rz = 0) { return this.add(new THREE.CylinderGeometry(rt, rb, h, seg), color, x, y + h / 2, z, rx, 0, rz, 1, 1, 1, opt); }
  sphere(r, color, x, y, z, opt, sy = 1) { return this.add(new THREE.IcosahedronGeometry(r, 1), color, x, y, z, 0, 0, 0, 1, sy, 1, opt); }
  quad(w, d, color, x, y, z, ry = 0, opt) { return this.add(new THREE.PlaneGeometry(w, d), color, x, y, z, -Math.PI / 2, 0, 0, 1, 1, 1, Object.assign({ ao: false }, opt)).rotLast(ry, x, z); }
  rotLast(ry, x, z) { if (!ry) return this; const g = this.geos[this.geos.length - 1]; g.translate(-x, 0, -z); g.rotateY(ry); g.translate(x, 0, z); return this; }
  build(mat) {
    const g = mergeGeometries(this.geos, false);
    g.computeBoundingSphere();
    return new THREE.Mesh(g, mat);
  }
}

// ---------------------------------------------------------------- see-through cutout
export const CUT = { uP: { value: new V3(0, 0, 0) }, uC: { value: new V3(0, 30, 30) }, uR: { value: 1.0 } };
export function addCutout(mat) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uCutP = CUT.uP; sh.uniforms.uCutC = CUT.uC; sh.uniforms.uCutR = CUT.uR;
    sh.vertexShader = 'varying vec3 vCutW;\n' + sh.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
      vec4 cutw = vec4(transformed, 1.0);
      #ifdef USE_INSTANCING
        cutw = instanceMatrix * cutw;
      #endif
      vCutW = (modelMatrix * cutw).xyz;`);
    sh.fragmentShader = 'uniform vec3 uCutP; uniform vec3 uCutC; uniform float uCutR; varying vec3 vCutW;\n' + sh.fragmentShader.replace('void main() {', `void main() {
      if (uCutR > 0.0 && vCutW.y > 0.16) {
        vec3 seg = uCutP - uCutC; float L2 = dot(seg, seg);
        float t = dot(vCutW - uCutC, seg) / max(L2, 1e-4);
        if (t > 0.0 && t < 0.975) {
          vec3 q = uCutC + seg * t;
          float d = length(vCutW - q);
          // a surface well below the sight line (a low roof you stand beside) hides nothing: keep it
          if (vCutW.y < q.y - 0.45) d = 1e3;
          float r = uCutR * (0.55 + 0.45 * smoothstep(0.75, 0.97, t));
          if (d < r * 0.78) discard;
          if (d < r && mod(floor(gl_FragCoord.x) + floor(gl_FragCoord.y), 2.0) < 1.0) discard;
        }
      }`);
  };
  mat.customProgramCacheKey = () => 'cutout';
  return mat;
}

function roundedRect(w, d, r) {
  const s = new THREE.Shape(); const x = -w / 2, y = -d / 2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + d - r); s.quadraticCurveTo(x + w, y + d, x + w - r, y + d);
  s.lineTo(x + r, y + d); s.quadraticCurveTo(x, y + d, x, y + d - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return s;
}
function slab(b, w, r, y0, y1, color, bevel = 0) {
  const geo = new THREE.ExtrudeGeometry(roundedRect(w, w, r), { depth: y1 - y0 - bevel * 2, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 10 });
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, y0 + bevel, 0);
  b.add(geo, color, 0, 0, 0, 0, 0, 0, 1, 1, 1, { ao: false, jitter: 0.01 });
}

function signTexture(text, bg, fg, w = 512, h = 128, font = '900 84px "Noto Serif SC", serif') {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.fillStyle = fg; g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, w / 2, h / 2 + 4);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

// ---------------------------------------------------------------- layout
export const L = {
  HALF: 24, R: 1.2,
  ROAD_Z: 2.2, ROAD_HW: 0.75,
  CROSS_X: 1.0, CROSS_HW: 0.65,
  comp: { x0: -5.4, x1: -0.25, z0: -5.4, z1: 0.85 },
  apt: { x0: -5.0, x1: -1.4, z0: -5.1, z1: -2.7 },
  door: new V3(-3.2, 0, -2.42),
  mart: { x0: 2.4, x1: 5.6, z0: -5.5, z1: -2.6 },
  gas: { x0: 2.4, x1: 5.6, z0: 3.5, z1: 5.6 },
  park: { x0: -5.6, x1: -0.2, z0: 3.5, z1: 12.4 },
};
export const ROADS = [
  { ax: 'x', c: -12.5, hw: 0.7 }, { ax: 'x', c: L.ROAD_Z, hw: L.ROAD_HW }, { ax: 'x', c: 14, hw: 0.7 },
  { ax: 'z', c: -13, hw: 0.7 }, { ax: 'z', c: L.CROSS_X, hw: L.CROSS_HW }, { ax: 'z', c: 14, hw: 0.7 },
];
const HROADS = ROADS.filter(r => r.ax === 'x'), VROADS = ROADS.filter(r => r.ax === 'z');
const nearRoadCross = (r, t, pad) => (r.ax === 'x' ? VROADS : HROADS).some(o => Math.abs(t - o.c) < o.hw + pad);

// walk-in spots (prep phase). x/z = trigger centre.
export const SPOTS = [
  { id: 'home', kind: 'home', x: -3.2, z: -1.95, r: 0.5 },
  { id: 'mart', kind: 'shop', x: 4.0, z: -2.05, r: 0.6 },
  { id: 'pharm', kind: 'shop', x: -10.25, z: 0.78, r: 0.55 },
  { id: 'hw', kind: 'shop', x: 10.4, z: 12.62, r: 0.6 },
  { id: 'gas', kind: 'shop', x: 4.4, z: 3.85, r: 0.5 },
  { id: 'bank', kind: 'bank', x: 10.25, z: -2.1, r: 0.6 },
  { id: 'gym', kind: 'gym', x: -9.75, z: 12.62, r: 0.6 },
  { id: 'wang', kind: 'npc', rumor: 0, x: -2.0, z: 7.4, r: 0.7 },
  { id: 'xiao', kind: 'npc', rumor: 1, x: 3.3, z: 3.2, r: 0.6 },
  { id: 'radio', kind: 'npc', rumor: 2, x: -6.25, z: 3.95, r: 0.6 },
  { id: 'li', kind: 'npc', rumor: 3, x: -4.3, z: 0.45, r: 0.6 },
];

export function buildWorld(scene) {
  seed = 1337;
  const b = new Builder();
  const gl = new Builder();
  const colliders = [];
  const addCol = (x0, x1, z0, z1, tag, h = 0) => colliders.push({ x0, x1, z0, z1, tag, h }); // h: occluder height for the see-through cutout
  const mapBlds = []; // minimap rects
  const mapRect = (x0, x1, z0, z1, k) => mapBlds.push({ x0, x1, z0, z1, k });
  const signs = [];
  const sign = (text, bg, fg, w, h, x, y, z, ry = 0, font) => {
    const mat = new THREE.MeshBasicMaterial({ map: signTexture(text, bg, fg, 512, 128, font), toneMapped: false });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat); m.position.set(x, y, z); m.rotation.y = ry; scene.add(m); signs.push(m); return m;
  };
  const H = L.HALF;

  // ---------- slab & soil cross-section ----------
  const W = H * 2, R = L.R;
  slab(b, W + 0.8, R + 0.4, -1.26, -1.1, 0xd8c7a6, 0.04);
  slab(b, W, R, -1.1, -0.66, 0x5b4636);
  slab(b, W, R, -0.66, -0.5, 0x9c8a72);
  slab(b, W, R, -0.5, -0.14, 0x7a5c43);
  slab(b, W, R, -0.14, -0.02, 0x8f8b84);
  slab(b, W - 0.02, R, -0.02, 0.0, 0x6e6a63);
  for (let i = 0; i < 360; i++) {
    const side = Math.floor(rnd() * 4); const t = rr(-H + 1, H - 1); const y = rr(-1.0, -0.2);
    const p = side === 0 ? [t, H] : side === 1 ? [t, -H] : side === 2 ? [H, t] : [-H, t];
    b.sphere(rr(0.04, 0.1), rnd() < 0.5 ? 0xb5a58c : 0x4a3a2e, p[0], y, p[1], { ao: false }, 0.7);
  }
  for (const [x, z, ry] of [[-1.3, H, 0], [H, -6, Math.PI / 2], [-H, 8, -Math.PI / 2]]) { // sewer pipes peeking out
    const dx = Math.sin(ry), dz = Math.cos(ry);
    b.add(new THREE.CylinderGeometry(0.3, 0.3, 1.6, 16, 1, true), 0x7c7a74, x - dx * 0.75, -0.42, z - dz * 0.75, Math.PI / 2, ry, 0, 1, 1, 1, { ao: false });
    b.add(new THREE.CircleGeometry(0.26, 16), 0x16120f, x + dx * 0.02, -0.42, z + dz * 0.02, 0, ry, 0, 1, 1, 1, { ao: false });
  }

  // ---------- ground tints per block ----------
  const Y = 0.004;
  const asphalt = 0x4b4b50, side = 0xb8b0a2, curb = 0xd6cfc2, grass = 0x7f9a58, line = 0xe9e2cf;
  // ---------- roads ----------
  for (const r of ROADS) {
    const yo = r.ax === 'z' ? 0.0012 : 0;
    if (r.ax === 'x') b.quad(W, r.hw * 2, asphalt, 0, Y + yo, r.c); else b.quad(r.hw * 2, W, asphalt, r.c, Y + yo, 0);
    for (let t = -H + 0.6; t < H - 0.4; t += 0.75) {
      if (nearRoadCross(r, t, 0.5)) continue;
      if (r.ax === 'x') b.quad(0.38, 0.05, line, t, Y + 0.003, r.c); else b.quad(0.05, 0.38, line, r.c, Y + 0.003, t);
    }
    // sidewalks & curbs, broken at the crossings
    const cuts = (r.ax === 'x' ? VROADS : HROADS).map(o => [o.c - o.hw - 0.42, o.c + o.hw + 0.42]).sort((a, c) => a[0] - c[0]);
    let s0 = -H + 0.2;
    const segs = [];
    for (const [a, c] of cuts) { segs.push([s0, a]); s0 = c; }
    segs.push([s0, H - 0.2]);
    for (const [a, c] of segs) {
      const len = c - a, mid = (a + c) / 2;
      for (const sgn of [-1, 1]) {
        const off = r.c + sgn * (r.hw + 0.21), offc = r.c + sgn * r.hw;
        if (r.ax === 'x') { b.box(len, 0.05, 0.42, side, mid, 0, off, 0, { ao: false }); b.box(len, 0.06, 0.05, curb, mid, 0, offc, 0, { ao: false }); }
        else { b.box(0.42, 0.05, len, side, off, 0, mid, 0, { ao: false }); b.box(0.05, 0.06, len, curb, offc, 0, mid, 0, { ao: false }); }
      }
    }
  }
  // zebra crossings at every junction
  for (const h of HROADS) for (const v of VROADS) {
    for (const sgn of [-1, 1]) {
      const zx = v.c + sgn * (v.hw + 0.55);
      for (let i = 0; i < 6; i++) b.quad(0.6, 0.13, line, zx, Y + 0.004, h.c - h.hw + 0.18 + i * (h.hw * 2 - 0.36) / 5);
      const zz = h.c + sgn * (h.hw + 0.55);
      for (let i = 0; i < 6; i++) b.quad(0.13, 0.6, line, v.c - v.hw + 0.18 + i * (v.hw * 2 - 0.36) / 5, Y + 0.004, zz);
    }
  }

  // ---------- generic building helpers ----------
  const WARM = [0xe9dfcd, 0xd9c7a8, 0xc9b8a0, 0xe4d2b8, 0xb8a58c, 0xd8b49a, 0xa8b5b0, 0xc7c0b0, 0xdcc6b0, 0xb9c2b4];
  const windowsOn = (x0, x1, z0, z1, h, fl, litP, face) => {
    const nf = Math.max(1, Math.floor((h - 0.15) / fl));
    if (face === 'z') {
      const w = x1 - x0, nc = Math.max(1, Math.floor(w / 0.58));
      for (let f = 0; f < nf; f++) for (let i = 0; i < nc; i++) {
        const x = x0 + (i + 0.5) * w / nc, y = f * fl + 0.2;
        b.box(0.32, 0.3, 0.02, 0x4e5660, x, y, z1 + 0.01, 0, { ao: false });
        gl.box(0.26, 0.24, 0.02, rnd() < litP ? 0xffc27a : 0x2c3640, x, y + 0.03, z1 + 0.022, 0, { ao: false, jitter: 0.2 });
      }
    } else {
      const d = z1 - z0, nc = Math.max(1, Math.floor(d / 0.58));
      for (let f = 0; f < nf; f++) for (let i = 0; i < nc; i++) {
        const z = z0 + (i + 0.5) * d / nc, y = f * fl + 0.2;
        b.box(0.02, 0.3, 0.32, 0x4e5660, x1 + 0.01, y, z, 0, { ao: false });
        gl.box(0.02, 0.24, 0.26, rnd() < litP ? 0xffcf8a : 0x2c3640, x1 + 0.022, y + 0.03, z, 0, { ao: false, jitter: 0.2 });
      }
    }
  };
  const tower = (x0, x1, z0, z1, h, color, opts = {}) => {
    const w = x1 - x0, d = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    b.box(w, h, d, color, cx, 0, cz);
    b.box(w + 0.06, 0.1, d + 0.06, 0xb7a68e, cx, 0, cz);
    const fl = 0.62;
    for (let f = 1; f * fl < h - 0.2; f++) b.box(w + 0.03, 0.03, d + 0.03, 0xc8b79d, cx, f * fl - 0.02, cz, 0, { ao: false });
    b.box(w + 0.05, 0.14, d + 0.05, 0xd8cbb6, cx, h, cz);
    b.box(w - 0.14, 0.03, d - 0.14, 0x77726b, cx, h + 0.02, cz, 0, { ao: false });
    if (rnd() < 0.7) b.box(rr(0.4, 0.7), 0.3, rr(0.3, 0.5), 0xd4c7b1, x0 + rr(0.3, w - 0.6), h, z0 + rr(0.3, d - 0.5));
    if (rnd() < 0.5) b.cyl(0.2, 0.2, 0.3, 0x9ab0b8, x1 - 0.4, h + 0.15, z0 + 0.4, 10);
    for (let i = 0; i < Math.floor(w * d / 3); i++) b.box(0.18, 0.12, 0.14, 0xe0e0dc, x0 + rr(0.2, w - 0.2), h + 0.03, z0 + rr(0.2, d - 0.2));
    if (!opts.noWin) { windowsOn(x0, x1, z0, z1, h, fl, opts.lit ?? 0.35, 'z'); windowsOn(x0, x1, z0, z1, h, fl, opts.lit ?? 0.35, 'x'); }
    if (opts.balcony) for (let f = 1; f * fl < h - 0.4; f++) for (let x = x0 + 0.5; x < x1 - 0.3; x += 1.2) b.box(0.6, 0.12, 0.2, 0xd9ccb7, x, f * fl - 0.04, z1 + 0.1, 0, { ao: false });
    addCol(x0, x1, z0, z1, 'bld', h + 0.14); mapRect(x0, x1, z0, z1, opts.k || 'bld');
  };
  const shopFront = (x0, x1, z0, z1, h, wall, band, signTxt, sbg, sfg, k) => {
    const w = x1 - x0, d = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    b.box(w, h, d, wall, cx, 0, cz);
    b.box(w + 0.04, 0.2, d + 0.04, band, cx, h - 0.2, cz, 0, { ao: false });
    b.box(w + 0.06, 0.05, d + 0.06, 0xdcd5c8, cx, h, cz, 0, { ao: false });
    b.box(w - 0.2, 0.03, d - 0.2, 0x8c8780, cx, h + 0.035, cz, 0, { ao: false }); // top must clear the cap (h+0.05) or it z-fights
    b.box(w - 0.3, 0.7, 0.04, 0x3c4a55, cx, 0.05, z1 + 0.01, 0, { ao: false });
    gl.box(w - 0.4, 0.62, 0.02, 0xdff2ff, cx, 0.08, z1 + 0.035, 0, { ao: false, jitter: 0 });
    for (let i = 0; i <= 5; i++) b.box(0.035, 0.72, 0.05, 0x9aa1a6, x0 + 0.2 + i * (w - 0.4) / 5, 0.05, z1 + 0.04, 0, { ao: false });
    b.box(w + 0.2, 0.04, 0.45, band, cx, 0.8, z1 + 0.22, 0, { ao: false });
    windowsOn(x0, x1, z0 + 0.2, z1 - 0.2, h - 0.25, 0.62, 0.5, 'x');
    b.box(Math.min(w * 0.6, 2.0) + 0.1, 0.46, 0.05, 0x2a2420, cx, h + 0.06, z1 - 0.21);
    sign(signTxt, sbg, sfg, Math.min(w * 0.6, 2.0), 0.4, cx, h + 0.29, z1 - 0.18);
    addCol(x0, x1, z0, z1, k, h + 0.06); mapRect(x0, x1, z0, z1, k);
  };

  // ---------- safehouse compound (幸福里 7 栋) ----------
  const C = L.comp;
  b.box(C.x1 - C.x0, 0.03, C.z1 - C.z0, 0xcfc4b2, (C.x0 + C.x1) / 2, 0, (C.z0 + C.z1) / 2);
  for (let x = C.x0 + 0.4; x < C.x1; x += 0.4) b.quad(0.012, C.z1 - C.z0, 0xb9ad99, x, 0.034, (C.z0 + C.z1) / 2);
  mapRect(C.x0, C.x1, C.z0, C.z1, 'yard');
  const wallC = 0xa45f45, wallCap = 0xd9cbb5, WH = 0.34, WT = 0.12;
  const wall = (x0, x1, z0, z1) => {
    const w = Math.max(x1 - x0, WT), d = Math.max(z1 - z0, WT), cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    b.box(w, WH, d, wallC, cx, 0, cz);
    b.box(w + 0.03, 0.04, d + 0.03, wallCap, cx, WH, cz, 0, { ao: false });
    addCol(cx - w / 2, cx + w / 2, cz - d / 2, cz + d / 2, 'wall');
  };
  const FG = { a: -3.35, b: -2.45 }, EG = { a: -1.45, b: -0.55 };
  wall(C.x0, FG.a, C.z1 - WT / 2, C.z1 + WT / 2);
  wall(FG.b, C.x1, C.z1 - WT / 2, C.z1 + WT / 2);
  wall(C.x1 - WT / 2, C.x1 + WT / 2, EG.b, C.z1);
  wall(C.x1 - WT / 2, C.x1 + WT / 2, C.z0, EG.a);
  wall(C.x0, C.x1, C.z0 - WT / 2, C.z0 + WT / 2);
  wall(C.x0 - WT / 2, C.x0 + WT / 2, C.z0, C.z1);
  for (const x of [FG.a, FG.b]) { b.box(0.16, 0.48, 0.16, 0xc9b9a0, x, 0, C.z1); b.box(0.2, 0.04, 0.2, 0x7b6b5b, x, 0.48, C.z1); }
  for (const z of [EG.a, EG.b]) { b.box(0.16, 0.48, 0.16, 0xc9b9a0, C.x1, 0, z); b.box(0.2, 0.04, 0.2, 0x7b6b5b, C.x1, 0.48, z); }

  const A = L.apt, aw = A.x1 - A.x0, ad = A.z1 - A.z0, acx = (A.x0 + A.x1) / 2, acz = (A.z0 + A.z1) / 2;
  const FL = 0.72, NF = 4, AH = FL * NF;
  b.box(aw, AH, ad, 0xe9dfcd, acx, 0, acz);
  b.box(aw + 0.06, 0.12, ad + 0.06, 0xb7a68e, acx, 0, acz);
  for (let f = 1; f <= NF; f++) b.box(aw + 0.04, 0.035, ad + 0.04, 0xc8b79d, acx, f * FL - 0.02, acz, 0, { ao: false });
  b.box(aw + 0.04, 0.16, ad + 0.04, 0xd8cbb6, acx, AH, acz);
  b.box(aw - 0.16, 0.04, ad - 0.16, 0x77726b, acx, AH + 0.02, acz, 0, { ao: false });
  b.box(0.7, 0.4, 0.5, 0xd4c7b1, A.x0 + 0.7, AH, A.z0 + 0.5);
  b.cyl(0.22, 0.22, 0.34, 0x9ab0b8, A.x1 - 0.6, AH + 0.2, A.z0 + 0.6, 12);
  for (const [dx, dz] of [[-0.12, -0.12], [0.12, -0.12], [-0.12, 0.12], [0.12, 0.12]]) b.box(0.03, 0.2, 0.03, 0x555555, A.x1 - 0.6 + dx, AH, A.z0 + 0.6 + dz);
  b.add(new THREE.BoxGeometry(0.8, 0.02, 0.45), 0x2c3b52, acx + 0.3, AH + 0.2, acz + 0.3, -0.35, 0, 0);
  b.cyl(0.01, 0.01, 0.5, 0x444444, A.x0 + 0.3, AH, A.z1 - 0.3, 5);
  for (let f = 0; f < NF; f++) {
    const y = f * FL + 0.24;
    for (let i = 0; i < 5; i++) {
      const x = A.x0 + 0.42 + i * 0.68;
      if (f === 0 && i === 2) continue;
      b.box(0.36, 0.34, 0.03, 0x4e5660, x, y, A.z1 + 0.012, 0, { ao: false });
      gl.box(0.3, 0.28, 0.02, rnd() < 0.42 ? 0xffc27a : 0x2c3640, x, y + 0.03, A.z1 + 0.03, 0, { ao: false, jitter: 0.15 });
      b.box(0.42, 0.03, 0.08, 0xd3c4ad, x, y - 0.03, A.z1 + 0.04, 0, { ao: false });
      if (f > 0 && i % 2 === 0) {
        b.box(0.55, 0.03, 0.22, 0xc4b49c, x, y - 0.07, A.z1 + 0.12, 0, { ao: false });
        b.box(0.55, 0.13, 0.02, 0xd9ccb7, x, y - 0.04, A.z1 + 0.22, 0, { ao: false });
      } else if (f > 0) b.box(0.16, 0.11, 0.08, 0xeeeeea, x + 0.24, y - 0.04, A.z1 + 0.05, 0, { ao: false });
    }
    for (let i = 0; i < 3; i++) {
      const z = A.z0 + 0.45 + i * 0.75;
      b.box(0.03, 0.34, 0.36, 0x4e5660, A.x1 + 0.012, y, z, 0, { ao: false });
      gl.box(0.02, 0.28, 0.3, rnd() < 0.42 ? 0xffcf8a : 0x2c3640, A.x1 + 0.03, y + 0.03, z, 0, { ao: false, jitter: 0.15 });
    }
  }
  b.box(0.6, 0.04, 0.32, 0x8f8778, L.door.x, 0.5, A.z1 + 0.16);
  b.box(0.5, 0.5, 0.03, 0x3a3532, L.door.x, 0, A.z1 + 0.01, 0, { ao: false });
  b.box(0.7, 0.05, 0.42, 0xa59a88, L.door.x, 0, A.z1 + 0.2);
  addCol(A.x0, A.x1, A.z0, A.z1, 'apt', AH + 0.6); mapRect(A.x0, A.x1, A.z0, A.z1, 'home');
  b.box(0.9, 0.03, 0.55, 0x5a7f8a, -0.95, 0.42, -4.6); for (const [dx, dz] of [[-0.42, -0.25], [0.42, -0.25], [-0.42, 0.25], [0.42, 0.25]]) b.box(0.03, 0.42, 0.03, 0x666666, -0.95 + dx, 0, -4.6 + dz);
  for (let i = 0; i < 3; i++) b.cyl(0.07, 0.07, 0.015, 0x222222, -1.2 + i * 0.25, 0.08, -4.6, 10, { ao: false }, Math.PI / 2);
  addCol(-1.45, -0.45, -4.9, -4.3, 'shed');
  b.box(1.4, 0.1, 0.45, 0x8a6a4a, -4.4, 0, -1.6); b.box(1.32, 0.04, 0.38, 0x5f7a3c, -4.4, 0.1, -1.6, 0, { ao: false });
  for (let i = 0; i < 6; i++) b.sphere(0.07, [0xd9644a, 0xf0c04a, 0xe8e1d0][i % 3], -4.95 + i * 0.22, 0.17, -1.6 + rr(-0.08, 0.08), { ao: false });
  addCol(-5.1, -3.7, -1.85, -1.35, 'bed');
  b.cyl(0.015, 0.015, 0.55, 0x777777, -2.0, 0, -0.3, 5); b.cyl(0.015, 0.015, 0.55, 0x777777, -0.7, 0, -0.3, 5);
  b.add(new THREE.BoxGeometry(1.3, 0.006, 0.006), 0x999999, -1.35, 0.53, -0.3);
  for (let i = 0; i < 4; i++) b.box(0.14, 0.17, 0.01, [0xd9644a, 0x5b8aa8, 0xf2ede2, 0xe6b84a][i], -1.85 + i * 0.3, 0.36, -0.3, 0, { ao: false });
  b.box(0.55, 0.5, 0.5, 0xd8cdb8, -4.85, 0, 0.35); b.box(0.62, 0.05, 0.57, 0x6e665d, -4.85, 0.5, 0.35); gl.box(0.3, 0.16, 0.02, 0xbfe0ff, -4.85, 0.25, 0.61, 0, { ao: false });
  addCol(-5.12, -4.58, 0.1, 0.6, 'booth');

  // ---------- NW: neighbours + pharmacy ----------
  tower(-12, -8.6, -11, -7.8, 2.9, 0xe4d2b8, { balcony: true, k: 'res' });
  tower(-12, -8.6, -6.6, -3.4, 2.2, 0xd9c7a8, { balcony: true, k: 'res' });
  tower(-4.6, -0.6, -11, -7.6, 3.3, 0xdcc6b0, { balcony: true, k: 'res' });
  tower(-7.6, -6.2, -11, -6.2, 1.5, 0xc9b8a0, { k: 'res' });
  shopFront(-12, -8.5, -2.2, 0.3, 1.1, 0xf2efe6, 0x2f8a5f, '大药房', '#2f8a5f', '#ffffff', 'pharm');
  // green cross
  gl.box(0.08, 0.3, 0.02, 0x6dff9a, -8.75, 0.95, 0.34, 0, { ao: false, jitter: 0 }); gl.box(0.3, 0.08, 0.02, 0x6dff9a, -8.75, 1.06, 0.34, 0, { ao: false, jitter: 0 });

  // ---------- NE: supermarket, bank, offices ----------
  const M = L.mart, mw = M.x1 - M.x0, md = M.z1 - M.z0, mcx = (M.x0 + M.x1) / 2, mcz = (M.z0 + M.z1) / 2, MH = 1.25;
  b.box(mw, MH, md, 0xf1ede4, mcx, 0, mcz);
  b.box(mw + 0.04, 0.22, md + 0.04, 0xc23b2b, mcx, MH - 0.22, mcz, 0, { ao: false });
  b.box(mw + 0.06, 0.05, md + 0.06, 0xdcd5c8, mcx, MH, mcz, 0, { ao: false });
  b.box(mw - 0.2, 0.03, md - 0.2, 0x8c8780, mcx, MH + 0.035, mcz, 0, { ao: false });
  for (let i = 0; i < 3; i++) b.box(0.4, 0.18, 0.3, 0xcfcfcf, M.x0 + 0.6 + i * 1.0, MH + 0.04, M.z0 + 0.8);
  b.box(mw - 0.3, 0.75, 0.04, 0x3c4a55, mcx, 0.05, M.z1 + 0.01, 0, { ao: false });
  gl.box(mw - 0.4, 0.68, 0.02, 0xdff2ff, mcx, 0.08, M.z1 + 0.035, 0, { ao: false, jitter: 0 });
  for (let i = 0; i <= 6; i++) b.box(0.035, 0.76, 0.05, 0x9aa1a6, M.x0 + 0.2 + i * (mw - 0.4) / 6, 0.05, M.z1 + 0.04, 0, { ao: false });
  b.box(mw + 0.3, 0.04, 0.5, 0xc23b2b, mcx, 0.85, M.z1 + 0.25, 0, { ao: false });
  addCol(M.x0, M.x1, M.z0, M.z1, 'mart', MH + 0.6); mapRect(M.x0, M.x1, M.z0, M.z1, 'mart');
  sign('华联超市', '#c23b2b', '#fff6e8', 1.7, 0.42, mcx, MH + 0.32, M.z1 - 0.18);
  b.box(1.8, 0.48, 0.05, 0x8a2a1f, mcx, MH + 0.08, M.z1 - 0.21);
  b.box(mw + 0.2, 0.02, 3.3, 0x5a5a5e, mcx, 0, M.z1 + 1.65, 0, { ao: false });
  for (let i = 0; i < 5; i++) b.quad(0.04, 0.9, line, M.x0 + 0.3 + i * 0.75, 0.024, M.z1 + 2.3);
  for (let i = 0; i < 3; i++) { const x = M.x1 - 0.5 - i * 0.12; b.box(0.18, 0.12, 0.26, 0xb7bcc2, x, 0.05, M.z1 + 0.5, 0.1); }
  // bank: stone, columns
  const BK = { x0: 8, x1: 12.5, z0: -5.6, z1: -2.6 }, bcx = (BK.x0 + BK.x1) / 2;
  b.box(BK.x1 - BK.x0 + 1.2, 0.03, 3.2, 0xcfc7b8, bcx, 0, BK.z1 + 1.6, 0, { ao: false }); // plaza
  b.box(BK.x1 - BK.x0, 1.7, BK.z1 - BK.z0, 0xe2dccf, bcx, 0, (BK.z0 + BK.z1) / 2);
  b.box(BK.x1 - BK.x0 + 0.3, 0.12, BK.z1 - BK.z0 + 0.5, 0xb9b0a0, bcx, 0, (BK.z0 + BK.z1) / 2 + 0.1);
  b.box(BK.x1 - BK.x0 + 0.3, 0.22, BK.z1 - BK.z0 + 0.6, 0xcfc6b5, bcx, 1.7, (BK.z0 + BK.z1) / 2 + 0.1);
  b.add(new THREE.CylinderGeometry(0.01, 2.6, 0.45, 4, 1), 0xd8d0c0, bcx, 2.14, BK.z1 - 0.3, 0, Math.PI / 4, 0, 1, 1, 0.22);
  for (let i = 0; i < 6; i++) b.cyl(0.09, 0.1, 1.58, 0xf2ede2, BK.x0 + 0.4 + i * (BK.x1 - BK.x0 - 0.8) / 5, 0.12, BK.z1 + 0.25, 10);
  gl.box(0.36, 0.5, 0.02, 0x9fd0ff, bcx - 1.0, 0.3, BK.z1 + 0.012, 0, { ao: false, jitter: 0 }); // ATM screens
  gl.box(0.36, 0.5, 0.02, 0x9fd0ff, bcx + 1.0, 0.3, BK.z1 + 0.012, 0, { ao: false, jitter: 0 });
  b.box(0.9, 1.0, 0.03, 0x3c3530, bcx, 0.12, BK.z1 + 0.01, 0, { ao: false });
  addCol(BK.x0, BK.x1, BK.z0, BK.z1 + 0.35, 'bank', 2.2); mapRect(BK.x0, BK.x1, BK.z0, BK.z1, 'bank');
  sign('临江银行', '#1f3f6e', '#f3e7c8', 1.8, 0.4, bcx, 1.48, BK.z1 + 0.37);
  tower(3, 7, -11, -7.5, 4.6, 0xb9c2b4, { lit: 0.55, k: 'office' });
  tower(8.5, 12.5, -11, -7.6, 3.6, 0xa8b5b0, { lit: 0.5, k: 'office' });

  // ---------- SE: gas station, construction yard, hardware market ----------
  const G = L.gas, gcx = (G.x0 + G.x1) / 2, gcz = (G.z0 + G.z1) / 2;
  b.box(G.x1 - G.x0, 0.025, G.z1 - G.z0, 0x8f8c86, gcx, 0, gcz, 0, { ao: false }); mapRect(G.x0, G.x1, G.z0, G.z1, 'gas');
  b.box(2.6, 0.14, 1.5, 0xf4f1ea, gcx - 0.4, 0.92, gcz - 0.1);
  b.box(2.62, 0.06, 1.52, 0x2f8a5f, gcx - 0.4, 0.98, gcz - 0.1, 0, { ao: false });
  gl.box(2.4, 0.01, 1.3, 0xfff6e0, gcx - 0.4, 0.915, gcz - 0.1, 0, { ao: false, jitter: 0 });
  for (const [dx, dz] of [[-1.1, -0.6], [0.3, -0.6], [-1.1, 0.4], [0.3, 0.4]]) b.box(0.08, 0.92, 0.08, 0xdedad2, gcx - 0.4 + dx + 0.4, 0, gcz + dz);
  for (const dx of [-0.95, 0.15]) {
    const x = gcx - 0.4 + dx + 0.4;
    b.box(0.5, 0.06, 0.24, 0xbdb6a8, x, 0, gcz - 0.1); b.box(0.2, 0.36, 0.14, 0xc8432f, x, 0.06, gcz - 0.1); gl.box(0.12, 0.08, 0.01, 0x9fe0b8, x, 0.3, gcz - 0.025, 0, { ao: false });
    addCol(x - 0.25, x + 0.25, gcz - 0.22, gcz + 0.02, 'pump');
  }
  b.box(0.85, 0.55, 1.0, 0xe8e2d6, G.x1 - 0.5, 0, G.z0 + 0.55); b.box(0.9, 0.05, 1.05, 0x2f8a5f, G.x1 - 0.5, 0.55, G.z0 + 0.55);
  gl.box(0.02, 0.28, 0.6, 0xe9f3ff, G.x1 - 0.93, 0.15, G.z0 + 0.55, 0, { ao: false });
  addCol(G.x1 - 0.93, G.x1 - 0.07, G.z0 + 0.05, G.z0 + 1.05, 'kiosk');
  b.box(0.08, 1.2, 0.08, 0x7a7a7a, G.x0 + 0.15, 0, G.z1 - 0.25);
  sign('加油 92#', '#2f8a5f', '#fff', 0.5, 0.25, G.x0 + 0.15, 1.2, G.z1 - 0.2, 0, '900 70px "Noto Sans SC", sans-serif');
  // construction yard (fenced, planks, scaffold)
  const CY = { x0: 2.4, x1: 7.2, z0: 8.6, z1: 12.4 };
  b.box(CY.x1 - CY.x0, 0.02, CY.z1 - CY.z0, 0x9a8466, (CY.x0 + CY.x1) / 2, 0, (CY.z0 + CY.z1) / 2, 0, { ao: false }); mapRect(CY.x0, CY.x1, CY.z0, CY.z1, 'yardc');
  for (let x = CY.x0; x <= CY.x1 + 0.01; x += 0.6) b.box(0.03, 0.35, 0.03, 0x8c8c8c, x, 0, CY.z0);
  b.box(CY.x1 - CY.x0, 0.22, 0.01, 0x2f6aa0, (CY.x0 + CY.x1) / 2, 0.08, CY.z0, 0, { ao: false });
  addCol(CY.x0, CY.x1, CY.z0 - 0.05, CY.z0 + 0.05, 'fence');
  for (const [x, z] of [[3.2, 10.6], [4.2, 11.6], [6.2, 10.4]]) { for (let i = 0; i < 4; i++) b.box(0.9, 0.06, 0.32, i % 2 ? 0xc49a62 : 0xb08050, x, i * 0.06, z, i * 0.1); addCol(x - 0.45, x + 0.45, z - 0.2, z + 0.2, 'planks'); }
  for (let fx = 0; fx < 3; fx++) for (let fy = 0; fy < 3; fy++) { const x = 5.0 + fx * 0.6; b.box(0.03, 0.6, 0.03, 0xd08a3a, x, fy * 0.6, 12.0); b.box(0.6, 0.03, 0.03, 0xd08a3a, x + 0.3, fy * 0.6 + 0.58, 12.0); }
  b.box(1.8, 1.9, 0.6, 0xc9c1b2, 5.6, 0, 12.4 - 0.3, 0, {}); addCol(4.7, 6.5, 11.8, 12.4, 'bld', 1.9);
  b.box(0.3, 2.4, 0.3, 0xe0b040, 3.0, 0, 9.2); b.box(2.4, 0.12, 0.14, 0xe0b040, 3.9, 2.3, 9.2); b.box(0.08, 0.6, 0.02, 0x555555, 4.8, 1.7, 9.2); addCol(2.85, 3.15, 9.05, 9.35, 'crane');
  shopFront(8, 12.8, 9.4, 12.2, 1.35, 0xe6dccb, 0xd49a2a, '五金建材', '#d49a2a', '#2b2118', 'hw');
  for (const [x, z] of [[8.6, 7.6], [10.0, 7.6], [11.6, 7.6]]) { for (let i = 0; i < 5; i++) b.box(1.0, 0.07, 0.42, 0xc49a62, x, i * 0.07, z, (i % 2) * 0.05); addCol(x - 0.5, x + 0.5, z - 0.24, z + 0.24, 'lumber'); }
  for (const [x, z] of [[8.6, 5.4], [10.2, 5.0]]) { b.cyl(0.18, 0.18, 0.4, 0x5a6a7a, x, 0, z, 10); b.cyl(0.18, 0.18, 0.4, 0x6a5a4a, x + 0.42, 0, z, 10); addCol(x - 0.2, x + 0.62, z - 0.2, z + 0.2, 'drum'); }
  tower(11.8, 12.8, 3.6, 6.2, 1.2, 0xd8b49a, { k: 'bld' });

  // ---------- SW: park (with pond), gym, newsstand ----------
  const P = L.park, pcx = (P.x0 + P.x1) / 2, pcz = (P.z0 + P.z1) / 2;
  b.box(P.x1 - P.x0, 0.04, P.z1 - P.z0, grass, pcx, 0, pcz, 0, { ao: false, jitter: 0.02 }); mapRect(P.x0, P.x1, P.z0, P.z1, 'park');
  for (let i = 0; i < 700; i++) { const x = rr(P.x0 + 0.1, P.x1 - 0.1), z = rr(P.z0 + 0.1, P.z1 - 0.1); if (Math.hypot(x + 3.4, z - 9.6) < 1.5) continue; b.add(new THREE.ConeGeometry(0.02, rr(0.05, 0.1), 3), rnd() < 0.5 ? 0x6c8a46 : 0x93ad62, x, 0.07, z, 0, rnd() * 3, 0, 1, 1, 1, { ao: false }); }
  for (let i = 0; i < 40; i++) { const t = i / 39; const x = P.x0 + 0.3 + t * (P.x1 - P.x0 - 0.6); const z = 4.6 + Math.sin(t * 5) * 0.55; b.add(new THREE.CylinderGeometry(0.2, 0.2, 0.012, 10), 0xd6ccb8, x, 0.046, z, 0, 0, 0, 1, 1, 1, { ao: false }); }
  for (let i = 0; i < 30; i++) { const t = i / 29; const z = 5.2 + t * 6.8; const x = -1.4 + Math.sin(t * 4) * 0.5; b.add(new THREE.CylinderGeometry(0.19, 0.19, 0.012, 10), 0xd6ccb8, x, 0.046, z, 0, 0, 0, 1, 1, 1, { ao: false }); }
  b.add(new THREE.CylinderGeometry(1.35, 1.35, 0.02, 28), 0xa9a08e, -3.4, 0.04, 9.6, 0, 0, 0, 1, 1, 1, { ao: false });
  gl.add(new THREE.CylinderGeometry(1.22, 1.22, 0.02, 28), 0x3d6f86, -3.4, 0.055, 9.6, 0, 0, 0, 1, 1, 1, { ao: false, jitter: 0 });
  addCol(-4.6, -2.2, 8.5, 10.7, 'pond');
  b.box(0.5, 0.03, 0.14, 0x8a5a3a, -3.3, 0.14, 4.0); b.box(0.5, 0.12, 0.03, 0x8a5a3a, -3.3, 0.17, 3.94); b.box(0.04, 0.14, 0.12, 0x333333, -3.52, 0, 4.0); b.box(0.04, 0.14, 0.12, 0x333333, -3.08, 0, 4.0);
  b.box(0.3, 0.42, 0.3, 0xe0b040, -4.9, 0, 5.0); b.add(new THREE.BoxGeometry(0.2, 0.03, 0.75), 0xd94f3a, -4.9, 0.22, 4.55, -0.55, 0, 0);
  addCol(-5.08, -4.72, 4.82, 5.18, 'slide');
  b.cyl(0.17, 0.17, 0.02, 0x4a4743, -1.3, 0.04, 4.7, 16, { ao: false });
  for (let i = 0; i < 3; i++) b.box(0.24, 0.006, 0.02, 0x2e2c29, -1.3, 0.062, 4.64 + i * 0.06, 0, { ao: false });
  // chess table (王大爷)
  b.cyl(0.16, 0.16, 0.03, 0xb8a58c, -2.35, 0.17, 7.4, 12); b.cyl(0.04, 0.05, 0.17, 0x7a6a58, -2.35, 0, 7.4, 6);
  b.quad(0.2, 0.2, 0xd8b56a, -2.35, 0.205, 7.4); addCol(-2.5, -2.2, 7.25, 7.55, 'table');
  b.cyl(0.07, 0.07, 0.12, 0x7a6a58, -2.65, 0, 7.4, 6);
  // pavilion
  for (const [dx, dz] of [[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]]) b.box(0.07, 0.75, 0.07, 0xa4442b, -1.6 + dx, 0, 10.6 + dz);
  b.add(new THREE.ConeGeometry(1.15, 0.45, 4), 0x3d5a4a, -1.6, 0.98, 10.6, 0, Math.PI / 4, 0);
  // gym
  shopFront(-12, -7.5, 9.4, 12.2, 1.45, 0x5e5852, 0xc4442b, '拳　馆', '#26221d', '#f0c04a', 'gym');
  tower(-12, -8.2, 3.7, 7.6, 1.9, 0xd8b49a, { balcony: true, k: 'res' });
  // newsstand + radio
  b.box(0.8, 0.55, 0.8, 0x3f6b4f, -7.2, 0, 3.9); b.box(1.0, 0.04, 1.0, 0x2f5a3f, -7.2, 0.55, 3.9, 0, { ao: false });
  for (let i = 0; i < 4; i++) b.box(0.02, 0.14, 0.1, [0xe6b84a, 0xd9644a, 0xf2ede2, 0x5b8aa8][i], -6.79, 0.22, 3.6 + i * 0.18, 0, { ao: false });
  b.box(0.16, 0.1, 0.08, 0x6a4a3a, -6.85, 0.55, 4.15); b.cyl(0.004, 0.004, 0.18, 0x333333, -6.8, 0.65, 4.15, 4);
  addCol(-7.6, -6.8, 3.5, 4.3, 'kiosk'); mapRect(-7.6, -6.8, 3.5, 4.3, 'bld');

  // ---------- outer districts (procedural) ----------
  const XB = [-H, -13, 1, 14, H], ZB = [-H, -12.5, 2.2, 14, H];
  const roadM = 1.4, edgeM = 0.8;
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    if (i > 0 && i < 3 && j > 0 && j < 3) continue;
    const x0 = XB[i] + (i === 0 ? edgeM : roadM), x1 = XB[i + 1] - (i === 3 ? edgeM : roadM);
    const z0 = ZB[j] + (j === 0 ? edgeM : roadM), z1 = ZB[j + 1] - (j === 3 ? edgeM : roadM);
    const north = j === 0;
    const rows = (z1 - z0) > 6.5 ? [[z0, (z0 + z1) / 2 - 0.45], [(z0 + z1) / 2 + 0.45, z1]] : [[z0, z1]];
    for (const [rz0, rz1] of rows) {
      let x = x0;
      while (x < x1 - 1.5) {
        const w = Math.min(rr(2.6, 4.4), x1 - x);
        const lx0 = x, lx1 = x + w; x += w + rr(0.4, 0.8);
        if (lx1 - lx0 < 1.4) continue;
        const roll = rnd();
        const d0 = rz0 + rr(0, 0.4), d1 = rz1 - rr(0, 0.4);
        if (roll < 0.62) tower(lx0, lx1, d0, d1, north ? rr(2.6, 5.2) : rr(1.4, 3.4), WARM[Math.floor(rnd() * WARM.length)], { balcony: rnd() < 0.5, k: 'bld' });
        else if (roll < 0.85) { // low shop row with awning
          const h = rr(0.8, 1.2), cx = (lx0 + lx1) / 2, cz = (d0 + d1) / 2, aw2 = [0xc23b2b, 0x2f6aa0, 0x2f8a5f, 0xd49a2a, 0x8a6aa0][Math.floor(rnd() * 5)];
          b.box(lx1 - lx0, h, d1 - d0, WARM[Math.floor(rnd() * WARM.length)], cx, 0, cz);
          b.box(lx1 - lx0 + 0.04, 0.12, d1 - d0 + 0.04, aw2, cx, h - 0.12, cz, 0, { ao: false });
          b.box(lx1 - lx0 - 0.2, 0.03, d1 - d0 - 0.2, 0x8c8780, cx, h + 0.01, cz, 0, { ao: false });
          gl.box(lx1 - lx0 - 0.4, 0.45, 0.02, rnd() < 0.6 ? 0xffe4b8 : 0xcfe8ff, cx, 0.08, d1 + 0.02, 0, { ao: false, jitter: 0.1 });
          b.box(lx1 - lx0 + 0.1, 0.03, 0.36, aw2, cx, 0.62, d1 + 0.18, 0, { ao: false });
          windowsOn(lx0, lx1, d0 + 0.2, d1 - 0.2, h, 0.62, 0.4, 'x');
          addCol(lx0, lx1, d0, d1, 'bld', h + 0.05); mapRect(lx0, lx1, d0, d1, 'bld');
        } else { // parking lot or pocket garden
          const cx = (lx0 + lx1) / 2, cz = (d0 + d1) / 2;
          if (rnd() < 0.5) { b.box(lx1 - lx0, 0.02, d1 - d0, 0x5a5a5e, cx, 0, cz, 0, { ao: false }); mapRect(lx0, lx1, d0, d1, 'lot'); }
          else { b.box(lx1 - lx0, 0.04, d1 - d0, grass, cx, 0, cz, 0, { ao: false }); mapRect(lx0, lx1, d0, d1, 'park'); }
        }
      }
    }
  }

  // ---------- street furniture ----------
  const lamps = [];
  for (const r of ROADS) {
    let k = 0;
    for (let t = -H + 2; t < H - 1.5; t += 5.2) {
      if (nearRoadCross(r, t, 1.4)) continue;
      const sgn = (k++ % 2) ? 1 : -1;
      const off = r.c + sgn * (r.hw + 0.3);
      const x = r.ax === 'x' ? t : off, z = r.ax === 'x' ? off : t;
      if (SPOTS.some(s => Math.hypot(s.x - x, s.z - z) < 0.9)) continue;
      lamps.push([x, z, r.ax === 'x' ? 0 : -sgn * 0.18, r.ax === 'x' ? -sgn * 0.18 : 0]);
    }
  }
  for (const [x, z, dx, dz] of lamps) {
    b.cyl(0.025, 0.035, 1.05, 0x3d3f42, x, 0, z, 6);
    b.box(0.04 + Math.abs(dx), 0.03, 0.04 + Math.abs(dz), 0x3d3f42, x + dx / 2, 1.03, z + dz / 2, 0, { ao: false });
    b.box(0.14, 0.04, 0.09, 0x2f3134, x + dx, 1.0, z + dz, 0, { ao: false });
    gl.box(0.11, 0.015, 0.07, 0xffe0a8, x + dx, 0.99, z + dz, 0, { ao: false, jitter: 0 });
    addCol(x - 0.04, x + 0.04, z - 0.04, z + 0.04, 'lamp');
  }
  for (const [x, z, c] of [[-0.05, -3.4, 0x3f6b4f], [2.05, 0.3, 0x3f5d7a], [-8.2, 1.25, 0x3f6b4f], [13.0, 1.3, 0x3f5d7a], [-12.4, -12.0, 0x3f6b4f]]) { b.box(0.22, 0.24, 0.38, c, x, 0, z); b.box(0.24, 0.03, 0.4, 0x2b2b2b, x, 0.24, z); addCol(x - 0.12, x + 0.12, z - 0.2, z + 0.2, 'bin'); }
  // trees: hand-placed near home + avenue rows along every road
  const treeSpots = [[-4.6, 4.2], [-3.9, 5.2], [-2.6, 5.1], [-2.0, 3.9], [-0.7, 5.3], [-4.9, -0.6], [-1.0, -2.0],
    [-4.8, 6.6], [-0.8, 6.8], [-4.9, 8.4], [-0.6, 8.9], [-5.0, 11.6], [-3.0, 11.8], [-0.7, 12.0], [-4.2, 7.6], [-2.8, 6.3],
    [5.9, 3.9], [5.9, 5.2], [7.6, 3.8], [7.6, -1.0], [13.0, -1.5], [-8.0, -2.5], [-12.4, 2.9]];
  for (const r of ROADS) {
    for (let t = -H + 1.2; t < H - 1; t += 2.6) {
      if (nearRoadCross(r, t, 1.0) || rnd() < 0.35) continue;
      const sgn = rnd() < 0.5 ? 1 : -1;
      const off = r.c + sgn * (r.hw + 0.33);
      const x = r.ax === 'x' ? t : off, z = r.ax === 'x' ? off : t;
      if (SPOTS.some(s => Math.hypot(s.x - x, s.z - z) < 1.2) || lamps.some(l => Math.hypot(l[0] - x, l[1] - z) < 0.6)) continue;
      if (Math.hypot(x - 4.0, z - L.ROAD_Z + 1) < 1.8) continue; // mart driveway
      treeSpots.push([x, z]);
    }
  }
  const blobs = [];
  for (const [x, z] of treeSpots) {
    const h = rr(0.45, 0.72);
    b.cyl(0.035, 0.05, h, 0x5e4635, x, 0, z, 6);
    const n = 3 + Math.floor(rnd() * 3);
    for (let i = 0; i < n; i++) blobs.push([x + rr(-0.18, 0.18), h + rr(-0.05, 0.25), z + rr(-0.18, 0.18), rr(0.17, 0.3)]);
    addCol(x - 0.06, x + 0.06, z - 0.06, z + 0.06, 'tree');
  }

  // cars
  const car = (x, z, ry, col, wreck = false) => {
    const L0 = 0.62, Wd = 0.3;
    const g = new Builder();
    g.box(L0, 0.13, Wd, col, 0, 0.05, 0); g.box(L0 * 0.55, 0.11, Wd * 0.92, wreck ? 0x3d3a37 : col, -0.03, 0.18, 0);
    g.box(L0 * 0.5, 0.09, Wd * 0.94, 0x2c3540, -0.03, 0.19, 0, 0, { ao: false });
    for (const [dx, dz] of [[-0.2, -0.15], [0.2, -0.15], [-0.2, 0.15], [0.2, 0.15]]) g.add(new THREE.CylinderGeometry(0.06, 0.06, 0.05, 10), 0x1d1d1d, dx, 0.06, dz, Math.PI / 2, 0, 0, 1, 1, 1, { ao: false });
    g.box(0.02, 0.04, 0.07, 0xfff4d0, L0 / 2, 0.11, 0.09, 0, { ao: false }); g.box(0.02, 0.04, 0.07, 0xfff4d0, L0 / 2, 0.11, -0.09, 0, { ao: false });
    for (const gg of g.geos) { gg.rotateY(ry); gg.translate(x, 0, z); }
    b.geos.push(...g.geos);
    const cx = Math.abs(Math.cos(ry)) * L0 / 2 + Math.abs(Math.sin(ry)) * Wd / 2, cz = Math.abs(Math.sin(ry)) * L0 / 2 + Math.abs(Math.cos(ry)) * Wd / 2;
    addCol(x - cx, x + cx, z - cz, z + cz, 'car');
  };
  const CARC = [0x5d8a8c, 0xa5483c, 0xd9c9a3, 0x51657e, 0xe0dccf, 0x7f8f6a, 0x3a3a40, 0xc9b07a];
  car(-4.3, 2.75, 0.05, 0x5d8a8c); car(3.0, 1.6, 0.4, 0xa5483c, true); car(4.8, 2.7, -0.12, 0xd9c9a3);
  car(1.32, -3.3, Math.PI / 2 + 0.25, 0x51657e, true); car(3.2, -0.6, Math.PI / 2, 0xe0dccf); car(4.6, -0.6, Math.PI / 2, 0x7f8f6a);
  car(-8.0, 13.6, 0.1, 0x7a3a30, true); car(14.45, -4.0, Math.PI / 2, 0x3a4560, true);
  for (let i = 0; i < 26; i++) {
    const r = ROADS[Math.floor(rnd() * ROADS.length)]; const t = rr(-H + 1.5, H - 1.5);
    if (nearRoadCross(r, t, 1.2)) continue;
    const sgn = rnd() < 0.5 ? 1 : -1; const off = r.c + sgn * (r.hw - 0.22);
    const x = r.ax === 'x' ? t : off, z = r.ax === 'x' ? off : t;
    if (Math.hypot(x + 3, z - 1) < 9 || SPOTS.some(s => Math.hypot(s.x - x, s.z - z) < 1.5)) continue; // keep the home approaches clear
    const wreck = rnd() < 0.4;
    car(x, z, (r.ax === 'x' ? 0 : Math.PI / 2) + (wreck ? rr(-0.6, 0.6) : rr(-0.05, 0.05)), CARC[Math.floor(rnd() * CARC.length)], wreck);
  }

  // ---------- assemble ----------
  const solidMat = addCutout(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.86, metalness: 0.0 }));
  const solid = b.build(solidMat); solid.castShadow = true; solid.receiveShadow = true; scene.add(solid);
  const glowMat = addCutout(new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }));
  glowMat.color.setScalar(0.35);
  const glow = gl.build(glowMat); scene.add(glow);

  let blobGeo = new THREE.IcosahedronGeometry(1, 2);
  blobGeo.deleteAttribute('uv'); blobGeo = mergeVertices(blobGeo);
  const bp = blobGeo.attributes.position;
  for (let i = 0; i < bp.count; i++) { const v = new V3().fromBufferAttribute(bp, i); const n = 1 + 0.13 * Math.sin(v.x * 5.1 + v.y * 3.3) * Math.cos(v.z * 4.7 - v.y * 2.1); v.multiplyScalar(n); v.y *= 0.82; bp.setXYZ(i, v.x, v.y, v.z); }
  blobGeo.computeVertexNormals();
  const leafMat = addCutout(new THREE.MeshStandardMaterial({ roughness: 0.9, flatShading: true }));
  const leaves = new THREE.InstancedMesh(blobGeo, leafMat, blobs.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  const leafBase = [];
  blobs.forEach(([x, y, z, s], i) => {
    q.setFromEuler(e.set(rnd() * 3, rnd() * 3, rnd() * 3));
    m4.compose(new V3(x, y, z), q, new V3(s, s, s)); leaves.setMatrixAt(i, m4);
    const c = new THREE.Color().setHSL(rr(0.22, 0.29), rr(0.32, 0.45), rr(0.32, 0.42) + (y - 0.6) * 0.15);
    leafBase.push(c.clone()); leaves.setColorAt(i, c);
  });
  leaves.castShadow = true; leaves.receiveShadow = true; scene.add(leaves);
  const decayCol = new THREE.Color(0x7d6a4a), tmpC = new THREE.Color();
  function setDecay(d) { leafBase.forEach((c, i) => { tmpC.copy(c).lerp(decayCol, d * 0.55); leaves.setColorAt(i, tmpC); }); leaves.instanceColor.needsUpdate = true; }

  const sc = document.createElement('canvas'); sc.width = sc.height = 256; const sg = sc.getContext('2d');
  const grd = sg.createRadialGradient(128, 128, 40, 128, 128, 128); grd.addColorStop(0, 'rgba(40,25,10,0.55)'); grd.addColorStop(0.6, 'rgba(40,25,10,0.22)'); grd.addColorStop(1, 'rgba(40,25,10,0)');
  sg.fillStyle = grd; sg.fillRect(0, 0, 256, 256);
  const floorShadow = new THREE.Mesh(new THREE.PlaneGeometry(W * 1.8, W * 1.8), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(sc), transparent: true, depthWrite: false, toneMapped: false }));
  floorShadow.rotation.x = -Math.PI / 2; floorShadow.position.set(2, -1.3, 2); floorShadow.renderOrder = -1; scene.add(floorShadow);

  // ---------- gameplay anchors ----------
  const gates = {
    front: { id: 'front', name: '正门', x: (FG.a + FG.b) / 2, z: C.z1, axis: 'x', w: FG.b - FG.a, out: new V3((FG.a + FG.b) / 2, 0, C.z1 + 0.55), inn: new V3((FG.a + FG.b) / 2, 0, C.z1 - 0.5) },
    east: { id: 'east', name: '侧门', x: C.x1, z: (EG.a + EG.b) / 2, axis: 'z', w: EG.b - EG.a, out: new V3(C.x1 + 0.55, 0, (EG.a + EG.b) / 2), inn: new V3(C.x1 - 0.5, 0, (EG.a + EG.b) / 2) },
  };
  const fx = gates.front.x, ez = gates.east.z;
  // night spawns sit on the road axes ~9 units out; routes are road waypoints to the gate
  const spawns = { E: new V3(10.5, 0, L.ROAD_Z), W: new V3(-11.8, 0, L.ROAD_Z), N: new V3(L.CROSS_X, 0, -10.6) };
  const ROUTES = {
    'E-front': [[fx, L.ROAD_Z]], 'E-east': [[L.CROSS_X, L.ROAD_Z], [L.CROSS_X, ez]],
    'W-front': [[fx, L.ROAD_Z]], 'W-east': [[fx, L.ROAD_Z]],
    'N-east': [[L.CROSS_X, ez]], 'N-front': [[L.CROSS_X, L.ROAD_Z], [fx, L.ROAD_Z]],
  };
  // civilian lanes on the sidewalks; day wander points on the roads
  const lanes = [], wander = [];
  for (const r of ROADS) {
    const cuts = [-H + 1, ...(r.ax === 'x' ? VROADS : HROADS).map(o => o.c), H - 1];
    for (let i = 0; i < cuts.length - 1; i++) {
      const a = cuts[i] + 1.3, c = cuts[i + 1] - 1.3; if (c - a < 2) continue;
      for (const sgn of [-1, 1]) {
        const off = r.c + sgn * (r.hw + 0.18);
        lanes.push(r.ax === 'x' ? [a, off, c, off] : [off, a, off, c]);
      }
      for (let k = 0; k < 2; k++) { const t = rr(a, c); wander.push(r.ax === 'x' ? [t, r.c + rr(-0.4, 0.4)] : [r.c + rr(-0.4, 0.4), t]); }
    }
  }
  wander.push([7.0, -1.0], [10.0, -0.8], [-10.5, -1.0], [6.0, 7.0], [9.6, 6.4], [-9.6, 8.4], [-2.0, 10.0], [-11.0, -6.0], [4.6, -6.6], [11.0, -6.6]);

  const map = { half: H, roads: ROADS, blds: mapBlds, spots: SPOTS };
  const home = new V3(-3.2, 0, -1.9);

  return {
    colliders, gates, spawns, setDecay, glowMat, glow, solid, leaves, signs,
    lamps: lamps.map(([x, z, dx, dz]) => [x + dx, 0.95, z + dz]),
    loot: buildLootSpots(), spots: SPOTS, lanes, wander, map, home, bounds: H - 0.45,
    route(side, gate) { return (ROUTES[`${side}-${gate}`] || []).map(([x, z]) => new V3(x, 0, z)); },
    inCompound(x, z) { return x > C.x0 && x < C.x1 && z > C.z0 && z < C.z1; },
    door: L.door,
  };
}

function buildLootSpots() {
  return [
    { id: 'm1', kind: 'box', x: 2.75, z: -1.95, name: '超市货箱', table: [['food', 3, 5], ['water', 3, 5]] },
    { id: 'm2', kind: 'box', x: 3.55, z: -2.05, name: '超市货箱', table: [['liquor', 2, 3], ['food', 1, 3]] },
    { id: 'm3', kind: 'box', x: 4.35, z: -1.95, name: '超市货箱', table: [['water', 2, 4], ['medkit', 1, 1]] },
    { id: 'm4', kind: 'box', x: 5.2, z: -1.6, name: '仓储箱', table: [['liquor', 2, 2], ['nails', 3, 5]] },
    { id: 'g1', kind: 'barrel', x: 2.75, z: 5.3, name: '汽油桶', table: [['gas', 2, 2]] },
    { id: 'g2', kind: 'barrel', x: 3.05, z: 5.35, name: '汽油桶', table: [['gas', 2, 2]] },
    { id: 'g3', kind: 'barrel', x: 4.3, z: 5.25, name: '汽油桶', table: [['gas', 1, 2], ['scrap', 1, 2]] },
    { id: 'c1', kind: 'car', x: 3.0, z: 1.2, name: '翻倒的轿车', table: [['scrap', 3, 4], ['nails', 2, 3]] },
    { id: 'c2', kind: 'car', x: 1.32, z: -2.75, name: '撞毁的 SUV', table: [['scrap', 2, 3], ['wood', 2, 3]] },
    { id: 'c3', kind: 'car', x: -8.0, z: 13.1, name: '冒烟的面包车', table: [['scrap', 2, 3], ['gas', 1, 1]] },
    { id: 'c4', kind: 'car', x: 13.95, z: -4.0, name: '运钞车', table: [['scrap', 3, 4], ['medkit', 1, 1]] },
    { id: 'p1', kind: 'bag', x: -3.3, z: 4.25, name: '遗落的背包', table: [['medkit', 1, 1], ['food', 1, 2]] },
    { id: 'p2', kind: 'box', x: -5.15, z: 3.9, name: '工地木料', table: [['wood', 4, 6]] },
    { id: 'ph1', kind: 'box', x: -9.2, z: 0.75, name: '药房货箱', table: [['medkit', 1, 2]] },
    { id: 'ph2', kind: 'box', x: -11.3, z: 0.75, name: '药房货箱', table: [['medkit', 1, 1], ['water', 2, 3]] },
    { id: 'h1', kind: 'box', x: 9.2, z: 12.62, name: '五金货箱', table: [['wood', 4, 5], ['nails', 3, 4]] },
    { id: 'h2', kind: 'box', x: 11.6, z: 12.62, name: '五金货箱', table: [['scrap', 2, 3], ['nails', 2, 3]] },
    { id: 'w1', kind: 'box', x: 3.6, z: 9.6, name: '工地木料', table: [['wood', 4, 6]] },
    { id: 'w2', kind: 'box', x: 6.6, z: 9.4, name: '工具箱', table: [['scrap', 2, 2], ['nails', 2, 3]] },
    { id: 'gy1', kind: 'box', x: -8.6, z: 12.62, name: '自动售货机', table: [['food', 2, 3], ['water', 2, 3]] },
    { id: 'b1', kind: 'box', x: 11.7, z: -1.9, name: '银行茶水间', table: [['liquor', 1, 2], ['food', 1, 2]] },
    { id: 'o1', kind: 'box', x: 5.0, z: -7.1, name: '写字楼储物间', table: [['food', 2, 3], ['water', 2, 3]] },
    { id: 'r1', kind: 'bag', x: -10.3, z: -7.4, name: '邻居的行李', table: [['food', 2, 2], ['medkit', 1, 1]] },
    { id: 'gold', kind: 'gold', x: -1.3, z: 4.7, name: '井盖下的东西', table: [['axe', 1, 1], ['gas', 3, 3]], hidden: true },
  ];
}
