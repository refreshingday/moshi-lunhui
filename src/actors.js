// Visual actors: instanced crowd (civilians/zombies), player, the Butcher, and FX pools.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Builder } from './world.js';

const V3 = THREE.Vector3;

// ---------------------------------------------------------------- crowd (instanced humanoids)
function part(w, h, d, x, y, z, partId, matId, color = 0x222222) {
  const g = new THREE.BoxGeometry(w, h, d).toNonIndexed();
  g.deleteAttribute('uv');
  g.translate(x, y, z);
  const n = g.attributes.position.count;
  g.setAttribute('aPart', new THREE.BufferAttribute(new Float32Array(n).fill(partId), 1));
  g.setAttribute('aMat', new THREE.BufferAttribute(new Float32Array(n).fill(matId), 1));
  const c = new THREE.Color(color); const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

export class Crowd {
  constructor(scene, max = 180) {
    this.max = max;
    const P = [];
    // legs (1 = left, 2 = right): pants + shoe
    for (const [id, x] of [[1, 0.033], [2, -0.033]]) {
      P.push(part(0.046, 0.13, 0.052, x, 0.085, 0, id, 2));
      P.push(part(0.05, 0.03, 0.07, x, 0.015, 0.008, id, 3, 0x2a2420));
    }
    P.push(part(0.124, 0.125, 0.078, 0, 0.212, 0, 0, 1));             // torso (shirt)
    P.push(part(0.13, 0.03, 0.082, 0, 0.16, 0, 0, 2));                // belt line
    P.push(part(0.098, 0.092, 0.092, 0, 0.322, 0, 0, 0));              // head
    P.push(part(0.104, 0.03, 0.098, 0, 0.372, -0.004, 0, 3, 0x2b2119)); // hair
    P.push(part(0.104, 0.05, 0.03, 0, 0.345, -0.04, 0, 3, 0x2b2119));
    P.push(part(0.018, 0.016, 0.01, 0.022, 0.328, 0.047, 0, 5, 0x1a1414)); // eyes
    P.push(part(0.018, 0.016, 0.01, -0.022, 0.328, 0.047, 0, 5, 0x1a1414));
    for (const [id, x] of [[3, 0.082], [4, -0.082]]) {
      P.push(part(0.038, 0.055, 0.044, x, 0.243, 0, id, 1));
      P.push(part(0.034, 0.07, 0.04, x, 0.18, 0, id, 0));
    }
    const geo = mergeGeometries(P);
    this.aAnim = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.aShirt = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.aSkin = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.aPants = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aAnim', this.aAnim); geo.setAttribute('aShirt', this.aShirt); geo.setAttribute('aSkin', this.aSkin); geo.setAttribute('aPants', this.aPants);
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
    this.uTime = { value: 0 };
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = this.uTime;
      const common = `#include <common>
        attribute float aPart; attribute float aMat; attribute vec4 aAnim;
        attribute vec3 aShirt; attribute vec3 aSkin; attribute vec3 aPants;
        varying float vFlash; varying float vBurn; varying float vEye;
        mat3 rotX(float a){ float c=cos(a), s=sin(a); return mat3(1.,0.,0., 0.,c,s, 0.,-s,c); }
        float partAngle(){
          if (aPart > 0.5 && aPart < 2.5) return sin(aAnim.x) * 0.6 * (aPart < 1.5 ? 1. : -1.);
          if (aPart > 2.5) return -aAnim.y + sin(aAnim.x + 1.6) * 0.18 * (aPart < 3.5 ? 1. : -1.);
          return 0.;
        }
        vec3 partPivot(){ return aPart > 2.5 ? vec3(0., 0.262, 0.) : vec3(0., 0.15, 0.); }`;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', common)
        .replace('#include <beginnormal_vertex>', `vec3 objectNormal = rotX(partAngle()) * normal;
          #ifdef USE_TANGENT
          vec3 objectTangent = vec3( tangent.xyz );
          #endif`)
        .replace('#include <begin_vertex>', `vec3 piv = partPivot();
          vec3 transformed = rotX(partAngle()) * (position - piv) + piv;
          transformed.y += abs(sin(aAnim.x)) * 0.012;
          vFlash = aAnim.z; vBurn = aAnim.w; vEye = aMat > 4.5 ? 1. : 0.;`)
        .replace('#include <color_vertex>', `vColor = color;
          if (aMat < 0.5) vColor = aSkin; else if (aMat < 1.5) vColor = aShirt; else if (aMat < 2.5) vColor = aPants;`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
          varying float vFlash; varying float vBurn; varying float vEye; uniform float uTime;`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          totalEmissiveRadiance += vec3(1.0, 0.95, 0.9) * vFlash * 1.4;
          totalEmissiveRadiance += vec3(1.0, 0.38, 0.06) * vBurn * (0.9 + 0.5 * sin(uTime * 23.0 + vViewPosition.x * 40.0));
          totalEmissiveRadiance += vec3(0.9, 1.0, 0.4) * vEye * step(0.5, aZomb) * 1.2;`)
        .replace('varying float vEye;', 'varying float vEye; varying float aZomb;');
      sh.vertexShader = sh.vertexShader.replace('varying float vEye;', 'varying float vEye; varying float aZomb;')
        .replace('vEye = aMat > 4.5 ? 1. : 0.;', 'vEye = aMat > 4.5 ? 1. : 0.; aZomb = step(0.6, aAnim.y);');
    };
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.count = 0; this.mesh.frustumCulled = false; this.mesh.castShadow = true; this.mesh.receiveShadow = true;
    scene.add(this.mesh);
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._e = new THREE.Euler(0, 0, 0, 'YXZ'); this._s = new V3(); this._p = new V3();
  }
  // agents: {x,y,z,ry,tilt,scale,phase,arm,flash,burn,shirt:Color,skin:Color,pants:Color}
  sync(agents, t) {
    this.uTime.value = t;
    const n = Math.min(agents.length, this.max);
    for (let i = 0; i < n; i++) {
      const a = agents[i];
      this._e.set(a.tilt || 0, a.ry, a.roll || 0);
      this._q.setFromEuler(this._e);
      const s = a.scale || 1;
      this._m.compose(this._p.set(a.x, a.y || 0, a.z), this._q, this._s.set(s, s, s));
      this.mesh.setMatrixAt(i, this._m);
      this.aAnim.setXYZW(i, a.phase, a.arm, a.flash, a.burn);
      this.aShirt.setXYZ(i, a.shirt.r, a.shirt.g, a.shirt.b);
      this.aSkin.setXYZ(i, a.skin.r, a.skin.g, a.skin.b);
      this.aPants.setXYZ(i, a.pants.r, a.pants.g, a.pants.b);
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.aAnim.needsUpdate = this.aShirt.needsUpdate = this.aSkin.needsUpdate = this.aPants.needsUpdate = true;
  }
}

// ---------------------------------------------------------------- simple part mesh helper
const stdMat = (c, o = {}) => new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: 0.8 }, o));
function boxMesh(w, h, d, mat, x = 0, y = 0, z = 0) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.castShadow = true; return m; }

// ---------------------------------------------------------------- player
export class PlayerView {
  constructor(scene) {
    const g = this.root = new THREE.Group();
    const jacket = stdMat(0x2f4a63), pants = stdMat(0x3a3530), skin = stdMat(0xf0c9a4), hair = stdMat(0x1f1915), pack = stdMat(0xb59563), shoe = stdMat(0x1e1b18), scarf = stdMat(0xc4442b);
    this.legs = [];
    for (const x of [0.034, -0.034]) {
      const p = new THREE.Group(); p.position.set(x, 0.15, 0);
      p.add(boxMesh(0.048, 0.13, 0.054, pants, 0, -0.065, 0)); p.add(boxMesh(0.052, 0.03, 0.072, shoe, 0, -0.135, 0.008));
      g.add(p); this.legs.push(p);
    }
    this.body = new THREE.Group(); g.add(this.body);
    this.body.add(boxMesh(0.13, 0.13, 0.08, jacket, 0, 0.215, 0));
    this.body.add(boxMesh(0.135, 0.028, 0.086, scarf, 0, 0.27, 0));
    this.body.add(boxMesh(0.1, 0.11, 0.05, pack, 0, 0.215, -0.065));
    this.body.add(boxMesh(0.1, 0.095, 0.095, skin, 0, 0.33, 0));
    this.body.add(boxMesh(0.108, 0.04, 0.104, hair, 0, 0.385, -0.004));
    this.body.add(boxMesh(0.108, 0.06, 0.03, hair, 0, 0.355, -0.04));
    this.arms = [];
    for (const x of [0.085, -0.085]) {
      const p = new THREE.Group(); p.position.set(x, 0.265, 0);
      p.add(boxMesh(0.04, 0.06, 0.046, jacket, 0, -0.03, 0)); p.add(boxMesh(0.036, 0.065, 0.042, skin, 0, -0.09, 0));
      this.body.add(p); this.arms.push(p);
    }
    this.hand = new THREE.Group(); this.hand.position.set(0, -0.12, 0.01); this.arms[1].add(this.hand);
    this.weapons = {};
    const metal = stdMat(0xcfd4d8, { metalness: 0.7, roughness: 0.3 }), wood = stdMat(0x8a5a33), red = stdMat(0xc4302a, { roughness: 0.5 }), gold = stdMat(0xffc94a, { metalness: 0.6, roughness: 0.35, emissive: 0x5a3a00 });
    const mk = (name, parts) => { const w = new THREE.Group(); parts.forEach(p => w.add(p)); w.visible = false; this.hand.add(w); this.weapons[name] = w; };
    mk('fist', []);
    mk('knife', [boxMesh(0.02, 0.05, 0.02, wood, 0, 0, 0.0), boxMesh(0.012, 0.03, 0.12, metal, 0, 0.005, 0.07)]);
    mk('bat', [boxMesh(0.026, 0.026, 0.3, wood, 0, 0, 0.12)]);
    mk('axe', [boxMesh(0.022, 0.022, 0.32, red, 0, 0, 0.13), boxMesh(0.012, 0.09, 0.07, gold, 0, 0.03, 0.25)]);
    this.setWeapon('fist');
    // aim ring
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.26, 0.3, 32, 1, -0.6, 1.2), new THREE.MeshBasicMaterial({ color: 0xffe0b0, transparent: true, opacity: 0.0, depthWrite: false, toneMapped: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.02; this.ring = ring; g.add(ring);
    const sh = new THREE.Mesh(new THREE.CircleGeometry(0.09, 16), new THREE.MeshBasicMaterial({ color: 0, transparent: true, opacity: 0.25, depthWrite: false }));
    sh.rotation.x = -Math.PI / 2; sh.position.y = 0.012; g.add(sh);
    g.traverse(o => { if (o.isMesh) o.castShadow = true; });
    scene.add(g);
    this.walk = 0; this.swing = 0;
  }
  setWeapon(k) { for (const n in this.weapons) this.weapons[n].visible = n === k; }
  update(dt, p) {
    const r = this.root;
    r.position.set(p.x, p.y || 0, p.z); r.rotation.y = p.ry;
    r.visible = p.visible !== false;
    const sp = Math.min(1, p.speed / 2);
    this.walk += dt * (6 + p.speed * 5) * (sp > 0.05 ? 1 : 0);
    const s = Math.sin(this.walk) * 0.7 * sp;
    this.legs[0].rotation.x = s; this.legs[1].rotation.x = -s;
    this.arms[0].rotation.x = -s * 0.7;
    // attack swing: wind up then slash
    const a = p.attack; // 1 → 0
    if (a > 0) {
      const t = 1 - a;
      this.arms[1].rotation.x = t < 0.25 ? -2.6 * (t / 0.25) : -2.6 + 3.2 * Math.min(1, (t - 0.25) / 0.35);
      this.arms[1].rotation.z = t < 0.25 ? 0.4 : -0.3;
      this.body.rotation.y = t < 0.25 ? 0.35 : -0.4 * Math.min(1, (t - 0.25) / 0.3);
    } else {
      this.arms[1].rotation.x = s * 0.7 - 0.35; this.arms[1].rotation.z = 0; this.body.rotation.y *= 0.8;
    }
    this.body.position.y = Math.abs(Math.sin(this.walk)) * 0.015 * sp;
    this.ring.material.opacity = p.ringOpacity ?? 0;
    // death pose
    r.rotation.x = p.down ? -Math.min(1.45, p.down * 3) : 0;
    if (p.dodge > 0) r.rotation.x = Math.sin((1 - p.dodge) * Math.PI) * 0.6;
  }
}

// ---------------------------------------------------------------- the Butcher
export class ButcherView {
  constructor(scene) {
    const g = this.root = new THREE.Group();
    const skin = stdMat(0xa79a9a), apron = stdMat(0xe8e0d2), blood = stdMat(0x7a1610, { roughness: 0.4 }), dark = stdMat(0x2b2422), metal = stdMat(0xc9cfd3, { metalness: 0.8, roughness: 0.25 }), stitch = stdMat(0x3a1a18);
    this.tumorMat = stdMat(0xff7a2a, { emissive: 0xff5a10, emissiveIntensity: 1.2, roughness: 0.4 });
    const S = 2.6;
    this.inner = new THREE.Group(); this.inner.scale.setScalar(S); g.add(this.inner);
    const I = this.inner;
    this.legs = [];
    for (const x of [0.045, -0.045]) { const p = new THREE.Group(); p.position.set(x, 0.13, 0); p.add(boxMesh(0.06, 0.13, 0.065, dark, 0, -0.065, 0)); I.add(p); this.legs.push(p); }
    this.torso = new THREE.Group(); I.add(this.torso);
    const T = this.torso;
    T.add(boxMesh(0.19, 0.17, 0.13, skin, 0, 0.22, 0));
    T.add(boxMesh(0.17, 0.08, 0.12, skin, 0, 0.15, 0.015)); // belly
    T.add(boxMesh(0.16, 0.2, 0.012, apron, 0, 0.2, 0.072));
    T.add(boxMesh(0.07, 0.06, 0.004, blood, 0.03, 0.18, 0.08)); T.add(boxMesh(0.04, 0.05, 0.004, blood, -0.04, 0.24, 0.08));
    T.add(boxMesh(0.1, 0.09, 0.1, skin, 0, 0.36, 0.01)); // head
    T.add(boxMesh(0.08, 0.004, 0.003, stitch, 0, 0.385, 0.062));
    T.add(boxMesh(0.06, 0.03, 0.01, dark, 0, 0.345, 0.062)); // mask strap
    const eyeM = new THREE.MeshBasicMaterial({ color: 0xffd36a, toneMapped: false });
    T.add(boxMesh(0.016, 0.01, 0.006, eyeM, 0.022, 0.37, 0.062)); T.add(boxMesh(0.016, 0.01, 0.006, eyeM, -0.022, 0.37, 0.062));
    this.tumor = boxMesh(0.07, 0.07, 0.04, this.tumorMat, 0.02, 0.25, -0.075); T.add(this.tumor); // the weak spot
    T.add(boxMesh(0.1, 0.012, 0.02, dark, 0, 0.29, -0.07));
    this.arms = [];
    for (const x of [0.12, -0.12]) { const p = new THREE.Group(); p.position.set(x, 0.29, 0); p.add(boxMesh(0.06, 0.16, 0.07, skin, 0, -0.08, 0)); T.add(p); this.arms.push(p); }
    const cleaver = new THREE.Group(); cleaver.position.set(0, -0.16, 0.02);
    cleaver.add(boxMesh(0.02, 0.02, 0.06, dark, 0, 0, 0.02)); cleaver.add(boxMesh(0.008, 0.08, 0.13, metal, 0, -0.02, 0.1)); cleaver.add(boxMesh(0.009, 0.03, 0.05, blood, 0, -0.045, 0.13));
    this.arms[1].add(cleaver);
    g.traverse(o => { if (o.isMesh) o.castShadow = true; });
    // ground telegraph
    this.tele = new THREE.Mesh(new THREE.CircleGeometry(1, 40, -0.9, 1.8), new THREE.MeshBasicMaterial({ color: 0xff3a1a, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }));
    this.tele.rotation.x = -Math.PI / 2; this.tele.rotation.z = Math.PI / 2; this.tele.position.y = 0.03; g.add(this.tele);
    g.visible = false; scene.add(g);
    this.walk = 0;
  }
  update(dt, b, t) {
    const r = this.root; r.visible = !!b && b.visible;
    if (!b) return;
    r.position.set(b.x, b.y || 0, b.z); r.rotation.y = b.ry;
    this.walk += dt * b.speed * 7;
    const s = Math.sin(this.walk) * 0.5 * Math.min(1, b.speed);
    this.legs[0].rotation.x = s; this.legs[1].rotation.x = -s; this.arms[0].rotation.x = -s * 0.5 - 0.2;
    // swing: windup (telegraph) then chop
    if (b.state === 'windup') { this.arms[1].rotation.x = -2.8 * Math.min(1, b.st / 0.3); this.torso.rotation.x = -0.15; }
    else if (b.state === 'chop') { this.arms[1].rotation.x = -2.8 + 3.6 * Math.min(1, b.st / 0.12); this.torso.rotation.x = 0.25; }
    else if (b.state === 'charge') { this.arms[1].rotation.x = -1.2; this.torso.rotation.x = 0.35; }
    else { this.arms[1].rotation.x = -0.3 + s * 0.3; this.torso.rotation.x *= 0.85; }
    this.tele.material.opacity = b.state === 'windup' ? 0.25 + 0.2 * Math.sin(t * 30) : b.state === 'chargeprep' ? 0.3 : 0;
    this.tele.scale.setScalar(b.state === 'chargeprep' ? 2.4 : 1.15);
    this.tumorMat.emissiveIntensity = (b.burning > 0 ? 3.2 : 1.0) + Math.sin(t * 6) * 0.4;
    this.inner.children.forEach(() => {});
    r.rotation.x = b.dead ? -Math.min(1.5, b.dead * 1.2) : 0;
    r.position.y = (b.y || 0) - (b.dead ? Math.max(0, b.dead - 1.5) * 0.2 : 0);
  }
}

// ---------------------------------------------------------------- particles
export class Particles {
  constructor(scene, max, additive) {
    this.max = max; this.n = 0;
    this.p = new Float32Array(max * 3); this.v = new Float32Array(max * 3); this.life = new Float32Array(max); this.maxLife = new Float32Array(max);
    this.size = new Float32Array(max); this.col = new Float32Array(max * 3); this.grav = new Float32Array(max);
    const g = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.BufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.aSize = new THREE.BufferAttribute(new Float32Array(max), 1).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.aPos); g.setAttribute('aCol', this.aCol); g.setAttribute('aSize', this.aSize);
    const mat = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 400 } },
      vertexShader: `attribute vec4 aCol; attribute float aSize; uniform float uScale; varying vec4 vCol;
        void main(){ vCol = aCol; vec4 mv = modelViewMatrix * vec4(position,1.); gl_Position = projectionMatrix * mv; gl_PointSize = aSize * uScale / -mv.z; }`,
      fragmentShader: `varying vec4 vCol; void main(){ vec2 d = gl_PointCoord - .5; float r = length(d); if(r>.5) discard; float a = smoothstep(.5, ${additive ? '0.0' : '0.35'}, r) * vCol.a; gl_FragColor = vec4(vCol.rgb * ${additive ? 'a' : '1.0'}, ${additive ? 'a' : 'a'}); }`,
      transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.mat = mat;
    this.points = new THREE.Points(g, mat); this.points.frustumCulled = false; this.points.renderOrder = 5;
    scene.add(this.points);
  }
  emit(x, y, z, vx, vy, vz, life, size, color, grav = -4) {
    let i = this.n < this.max ? this.n++ : Math.floor(Math.random() * this.max);
    this.p[i * 3] = x; this.p[i * 3 + 1] = y; this.p[i * 3 + 2] = z;
    this.v[i * 3] = vx; this.v[i * 3 + 1] = vy; this.v[i * 3 + 2] = vz;
    this.life[i] = this.maxLife[i] = life; this.size[i] = size; this.grav[i] = grav;
    this.col[i * 3] = color.r; this.col[i * 3 + 1] = color.g; this.col[i * 3 + 2] = color.b;
  }
  burst(x, y, z, count, speed, life, size, color, grav = -4, up = 1) {
    for (let k = 0; k < count; k++) {
      const a = Math.random() * Math.PI * 2, s = speed * (0.4 + Math.random() * 0.6);
      this.emit(x, y, z, Math.cos(a) * s, (0.4 + Math.random()) * speed * up, Math.sin(a) * s, life * (0.6 + Math.random() * 0.6), size * (0.6 + Math.random() * 0.7), color, grav);
    }
  }
  update(dt, pxScale) {
    this.mat.uniforms.uScale.value = pxScale;
    let w = 0;
    for (let i = 0; i < this.n; i++) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) continue;
      // compact
      if (w !== i) {
        for (let k = 0; k < 3; k++) { this.p[w * 3 + k] = this.p[i * 3 + k]; this.v[w * 3 + k] = this.v[i * 3 + k]; this.col[w * 3 + k] = this.col[i * 3 + k]; }
        this.life[w] = this.life[i]; this.maxLife[w] = this.maxLife[i]; this.size[w] = this.size[i]; this.grav[w] = this.grav[i];
      }
      this.v[w * 3 + 1] += this.grav[w] * dt;
      this.p[w * 3] += this.v[w * 3] * dt; this.p[w * 3 + 1] += this.v[w * 3 + 1] * dt; this.p[w * 3 + 2] += this.v[w * 3 + 2] * dt;
      if (this.p[w * 3 + 1] < 0.02 && this.grav[w] < 0) { this.p[w * 3 + 1] = 0.02; this.v[w * 3] *= 0.6; this.v[w * 3 + 2] *= 0.6; this.v[w * 3 + 1] = 0; }
      const f = this.life[w] / this.maxLife[w];
      this.aPos.setXYZ(w, this.p[w * 3], this.p[w * 3 + 1], this.p[w * 3 + 2]);
      this.aCol.setXYZW(w, this.col[w * 3], this.col[w * 3 + 1], this.col[w * 3 + 2], Math.min(1, f * 2.5));
      this.aSize.setX(w, this.size[w] * (0.5 + 0.5 * f));
      w++;
    }
    this.n = w;
    this.points.geometry.setDrawRange(0, w);
    this.aPos.needsUpdate = this.aCol.needsUpdate = this.aSize.needsUpdate = true;
  }
}

// ---------------------------------------------------------------- fire pool decal
export function makeFireMesh() {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uLife: { value: 1 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }`,
    fragmentShader: `varying vec2 vUv; uniform float uTime, uLife;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
      float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+1.),f.x), f.y); }
      void main(){ vec2 d = vUv - .5; float r = length(d) * 2.;
        float k = n(d * 7. + vec2(0., -uTime * 2.3)) * .6 + n(d * 15. - uTime * 3.1) * .4;
        float m = smoothstep(1., .25, r + k * .45) * uLife;
        vec3 c = mix(vec3(1.2,.25,.04), vec3(1.6,1.0,.35), smoothstep(.3,.9,k*m));
        gl_FragColor = vec4(c * m * 1.6, m); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const m = new THREE.Mesh(new THREE.CircleGeometry(1, 28), mat);
  m.rotation.x = -Math.PI / 2; m.renderOrder = 4;
  return m;
}

// ---------------------------------------------------------------- loot crate meshes
export function makeLootMesh(kind) {
  const b = new Builder();
  if (kind === 'box') { b.box(0.26, 0.2, 0.2, 0xb08a58, 0, 0, 0); b.box(0.27, 0.03, 0.21, 0x8a6a40, 0, 0.1, 0, 0, { ao: false }); b.box(0.28, 0.03, 0.04, 0x6e5232, 0, 0.17, 0, 0, { ao: false }); }
  if (kind === 'barrel') { b.cyl(0.085, 0.085, 0.26, 0xc8432f, 0, 0, 0, 12); b.cyl(0.088, 0.088, 0.02, 0x7a2a1d, 0, 0.07, 0, 12, { ao: false }); b.cyl(0.088, 0.088, 0.02, 0x7a2a1d, 0, 0.18, 0, 12, { ao: false }); }
  if (kind === 'car') { b.box(0.22, 0.04, 0.14, 0x6a6762, 0, 0, 0); b.box(0.06, 0.06, 0.06, 0x8a8781, 0.05, 0.04, 0.02); b.box(0.08, 0.03, 0.05, 0x9a7a52, -0.05, 0.04, -0.02); }
  if (kind === 'bag') { b.box(0.14, 0.12, 0.08, 0x4f6b3a, 0, 0, 0); b.box(0.1, 0.05, 0.02, 0x3d5530, 0, 0.03, 0.05, 0, { ao: false }); }
  if (kind === 'gold') { b.box(0.22, 0.14, 0.15, 0xc9a04a, 0, 0, 0); b.box(0.23, 0.03, 0.16, 0x7a5a1a, 0, 0.14, 0, 0, { ao: false }); }
  const m = b.build(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, emissive: kind === 'gold' ? 0x4a3000 : 0x000000 }));
  m.castShadow = true;
  return m;
}

export function makeBarricade(axis, width) {
  const g = new THREE.Group();
  const wood = stdMat(0x9b7046), dark = stdMat(0x5e4430), nail = stdMat(0x777777);
  const planks = [];
  for (let i = 0; i < 4; i++) {
    const p = boxMesh(width + 0.08, 0.06, 0.035, i % 2 ? dark : wood, 0, 0.08 + i * 0.085, 0);
    p.rotation.z = (i % 2 ? 1 : -1) * 0.12 * (i === 3 ? 2 : 1);
    g.add(p); planks.push(p);
  }
  for (const x of [-width / 2, width / 2]) g.add(boxMesh(0.05, 0.42, 0.05, dark, x, 0.21, 0.02));
  g.add(boxMesh(0.04, 0.04, 0.04, nail, 0, 0.3, 0.03));
  if (axis === 'z') g.rotation.y = Math.PI / 2;
  g.userData.planks = planks;
  return g;
}

export function makeTrapMesh(kind) {
  const g = new THREE.Group();
  if (kind === 'spike') {
    g.add(boxMesh(0.3, 0.015, 0.3, stdMat(0x5a5048), 0, 0.008, 0));
    const sm = stdMat(0xb8bcc0, { metalness: 0.7, roughness: 0.35 });
    for (let i = 0; i < 9; i++) { const c = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.07, 4), sm); c.position.set(((i % 3) - 1) * 0.09, 0.05, (Math.floor(i / 3) - 1) * 0.09); c.castShadow = true; g.add(c); }
  } else {
    g.add(boxMesh(0.22, 0.015, 0.22, stdMat(0x3a3330), 0, 0.008, 0));
    const can = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.12, 10), stdMat(0xc8432f)); can.position.y = 0.07; can.castShadow = true; g.add(can);
    const wick = boxMesh(0.01, 0.04, 0.01, new THREE.MeshBasicMaterial({ color: 0xffa040, toneMapped: false }), 0, 0.15, 0); g.add(wick);
  }
  return g;
}

export function makePickup(color) {
  const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.05), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.6, roughness: 0.4 }));
  m.castShadow = true;
  return m;
}

export function makeBottle() {
  const g = new THREE.Group();
  g.add(boxMesh(0.035, 0.07, 0.035, stdMat(0x5b8a4a, { roughness: 0.2 }), 0, 0, 0));
  g.add(boxMesh(0.015, 0.03, 0.015, new THREE.MeshBasicMaterial({ color: 0xffb040, toneMapped: false }), 0, 0.05, 0));
  return g;
}
