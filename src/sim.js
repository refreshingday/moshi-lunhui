// Gameplay simulation: player, zombies, the Butcher, barricades, traps, fire, loot.
import * as THREE from 'three';
import { Crowd, PlayerView, ButcherView, Particles, makeFireMesh, makeLootMesh, makeBarricade, makeTrapMesh, makePickup, makeBottle } from './actors.js';

const V3 = THREE.Vector3;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const col = (h) => new THREE.Color(h);

export const WEAPONS = {
  fist: { name: '拳头', dmg: 9, range: 0.38, arc: 1.3, cd: 0.34, kb: 0.7 },
  knife: { name: '菜刀', dmg: 17, range: 0.45, arc: 1.4, cd: 0.36, kb: 0.7 },
  bat: { name: '棒球棍', dmg: 25, range: 0.56, arc: 1.8, cd: 0.48, kb: 1.8 },
  axe: { name: '消防斧·金', dmg: 46, range: 0.64, arc: 2.0, cd: 0.52, kb: 2.0 },
};

const SHIRTS = [0x6d8fb0, 0xc9b07a, 0xb8574a, 0x7a9a6a, 0xe0d8c8, 0x5a5a6a, 0xd08a4a, 0x8a6aa0].map(col);
const PANTS = [0x3a4560, 0x4a4038, 0x2e2e33, 0x6a5a48].map(col);
const SKIN = [0xf0c9a4, 0xe2b48c, 0xd8a47e].map(col);
const ZSKIN = [0x9fb08a, 0x8fa38a, 0xa8a88a].map(col);
const pick = (a) => a[Math.floor(Math.random() * a.length)];

export class Sim {
  constructor(scene, world, hooks) {
    this.scene = scene; this.world = world; this.hooks = hooks;
    this.crowd = new Crowd(scene, 200);
    this.pv = new PlayerView(scene);
    this.bv = new ButcherView(scene);
    this.embers = new Particles(scene, 900, true);
    this.dust = new Particles(scene, 700, false);
    this.agents = []; this.boss = null;
    this.fires = []; this.projs = []; this.pickups = []; this.traps = [];
    this.shake = 0; this.time = 0; this.mode = 'idle';
    this.player = { x: world.home.x, z: world.home.z, ry: 0, hp: 100, maxHp: 100, speed: 0, cd: 0, attack: 0, hitPending: -1, dodge: 0, dodgeCd: 0, down: 0, inv: 0, vx: 0, vz: 0, visible: true };
    this.door = { hp: 150, max: 150 };
    // barricades
    this.bars = {};
    for (const k in world.gates) {
      const g = world.gates[k];
      const mesh = makeBarricade(g.axis, g.w); mesh.position.set(g.x, 0, g.z); mesh.visible = false; scene.add(mesh);
      this.bars[k] = { gate: g, hp: 0, max: 120, mesh };
    }
    // loot crates
    this.crates = world.loot.map(s => { const m = makeLootMesh(s.kind); m.position.set(s.x, 0, s.z); m.rotation.y = Math.random() * 0.6 - 0.3; m.visible = false; scene.add(m); return { s, mesh: m, opened: false, prog: 0 }; });
    // extraction ring
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.34, 0.42, 40), new THREE.MeshBasicMaterial({ color: 0x7cf0a8, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(world.door.x, 0.05, world.door.z + 0.2); scene.add(ring); this.exitRing = ring;
    this._v = new V3();
    this.fireTmp = new THREE.Color(0xff8a30); this.bloodC = new THREE.Color(0x5a1410); this.smokeC = new THREE.Color(0x3a3430); this.sparkC = new THREE.Color(0xffe0a0); this.goldC = new THREE.Color(0xffd45a);
  }

  // ------------------------------------------------ setup helpers
  reset() {
    for (const a of this.agents) a.dead = 9;
    this.agents = [];
    this.fires.forEach(f => this.scene.remove(f.mesh)); this.fires = [];
    this.projs.forEach(p => this.scene.remove(p.mesh)); this.projs = [];
    this.pickups.forEach(p => this.scene.remove(p.mesh)); this.pickups = [];
    this.traps.forEach(t => this.scene.remove(t.mesh)); this.traps = [];
    for (const k in this.bars) { this.bars[k].hp = 0; this.bars[k].mesh.visible = false; }
    this.crates.forEach(c => { c.opened = false; c.prog = 0; c.mesh.visible = false; c.mesh.scale.setScalar(1); });
    this.boss = null;
    Object.assign(this.player, { x: this.world.home.x, z: this.world.home.z, hp: this.player.maxHp, down: 0, attack: 0, dodge: 0, visible: true });
  }
  spawnCivilians(n) {
    const lanes = this.world.lanes;
    for (let i = 0; i < n; i++) {
      const l = pick(lanes), t = Math.random();
      this.agents.push(this.makeAgent('civ', l[0] + (l[2] - l[0]) * t, l[1] + (l[3] - l[1]) * t, { lane: l, dir: Math.random() < 0.5 ? 1 : -1, t }));
    }
  }
  makeAgent(kind, x, z, extra = {}) {
    const civ = kind === 'civ';
    const a = Object.assign({
      kind, x, z, y: 0, ry: Math.random() * 6, hp: kind === 'runner' ? 30 : 46, max: kind === 'runner' ? 30 : 46,
      speed: kind === 'runner' ? 1.05 : civ ? 0.45 : 0.42 + Math.random() * 0.16,
      phase: Math.random() * 6, arm: civ ? 0 : 1.35, flash: 0, burn: 0, tilt: 0, roll: 0, scale: 1,
      shirt: pick(SHIRTS).clone(), pants: pick(PANTS).clone(), skin: (civ ? pick(SKIN) : pick(ZSKIN)).clone(),
      atk: 0, dead: 0, rise: 1, kx: 0, kz: 0, gate: null, stuck: 0, lastD: 99, trapT: 0, slow: 0,
    }, extra);
    if (!civ) { a.shirt.multiplyScalar(0.62); a.pants.multiplyScalar(0.7); }
    return a;
  }
  // turn civilians into the dead (the moment the world ends)
  turnCivilians() {
    for (const a of this.agents) if (a.kind === 'civ') {
      if (a.still && this.world.inCompound(a.x, a.z)) { a.x = -4.4; a.z = 1.5; } // the guard stumbles out of the yard
      a.kind = 'walker'; a.still = false; a.turning = 1.6 + Math.random() * 1.8; a.hp = a.max = 46; a.speed = 0.4 + Math.random() * 0.15;
      a.targetSkin = pick(ZSKIN).clone();
    }
  }
  spawnZombie(side, kind = 'walker') {
    const s = this.world.spawns[side];
    const a = this.makeAgent(kind, s.x + (Math.random() - 0.5) * 0.9 * (side === 'N' ? 1 : 0), s.z + (Math.random() - 0.5) * 0.9 * (side === 'N' ? 0 : 1));
    a.rise = 0; a.y = -0.45; a.ry = Math.atan2(-s.x, -s.z);
    a.gate = side === 'W' ? 'front' : side === 'N' ? 'east' : (Math.random() < 0.5 ? 'east' : 'front');
    a.wp = this.world.route(side, a.gate);
    if (kind === 'runner') a.speed *= 1.0; else a.speed *= 1.25; // longer streets, a little faster
    this.agents.push(a);
    return a;
  }
  spawnBoss(r2) {
    const s = this.world.spawns.E;
    this.boss = { wp: this.world.route('E', 'east'), x: s.x, z: s.z, y: -1.0, ry: -Math.PI / 2, hp: 1800, max: 1800, state: 'rise', st: 0, speed: 0, burning: 0, visible: true, chargeCd: 5, dead: 0, regen: r2 ? 6 : 26, enrage: 0, kx: 0, kz: 0, flashT: 0 };
    this.shake = 1.2;
    this.hooks.sfx('roar');
  }
  showCrates(on) { this.crates.forEach(c => { c.mesh.visible = on && !c.opened; }); }
  activeZombies() { let n = 0; for (const a of this.agents) if (!a.dead && a.kind !== 'civ') n++; return n; }

  // ------------------------------------------------ main update
  update(dt, input, G) {
    this.time += dt;
    const P = this.player;
    this.G = G;
    const combat = G.combat; // night/day/boss
    // -------- player
    if (P.down > 0) {
      P.down += dt; P.speed = 0;
    } else if (combat || G.canMove) {
      let mx = input.mx, mz = input.mz;
      const ml = Math.hypot(mx, mz); if (ml > 1) { mx /= ml; mz /= ml; }
      let sp = (combat ? 2.1 : 2.9) * G.moveMult;
      if (P.dodge > 0) { P.dodge -= dt * 3.2; sp = 5.2; mx = P.dx; mz = P.dz; }
      else if (combat && input.dodge && P.dodgeCd <= 0 && ml > 0.1) { P.dodge = 1; P.dodgeCd = 0.9; P.dx = mx; P.dz = mz; P.inv = 0.35; this.hooks.sfx('whoosh'); }
      P.dodgeCd -= dt; P.inv -= dt;
      P.vx = mx * sp; P.vz = mz * sp;
      P.x += P.vx * dt; P.z += P.vz * dt;
      this.collide(P, 0.09, false);
      P.speed = Math.hypot(P.vx, P.vz);
      // facing
      const ax = input.aim.x - P.x, az = input.aim.z - P.z;
      let face = (P.attack > 0 || input.aimLock) && Math.hypot(ax, az) > 0.05 ? Math.atan2(ax, az) : (P.speed > 0.1 ? Math.atan2(P.vx, P.vz) : P.ry);
      P.ry = lerpAngle(P.ry, face, 1 - Math.exp(-dt * 16));
      // attack
      P.cd -= dt;
      const w = WEAPONS[G.weapon];
      if (combat && input.attack && P.cd <= 0 && P.dodge <= 0) {
        P.cd = w.cd; P.attack = 1; P.hitPending = 0.09;
        if (Math.hypot(ax, az) > 0.05) P.ry = Math.atan2(ax, az);
        this.hooks.sfx('swing');
      }
      if (P.attack > 0) P.attack = Math.max(0, P.attack - dt / 0.36);
      if (P.hitPending >= 0) { P.hitPending -= dt; if (P.hitPending < 0) this.meleeHit(w, G); }
      // throw molotov
      if (!combat) { /* prep: walking only */ }
      else if (input.throw && G.take('molotov', 1)) this.throwMolotov(P, input.aim);
      // trap
      if (combat && input.trap) this.placeTrap(G);
      if (combat && input.heal && P.hp < P.maxHp && G.take('medkit', 1)) { P.hp = Math.min(P.maxHp, P.hp + 55); this.hooks.float('+55', P.x, 0.5, P.z, 'loot'); this.hooks.sfx('heal'); }
      // regen a touch
    } else { P.speed = 0; }

    // -------- agents
    const doorPt = this.world.door;
    const pInside = this.world.inCompound(P.x, P.z);
    const night = G.phase === 'night';
    let alive = 0;
    for (let i = this.agents.length - 1; i >= 0; i--) {
      const a = this.agents[i];
      if (a.dead) {
        a.dead += dt; a.tilt = -Math.min(1.5, a.dead * 4); a.y = -Math.max(0, a.dead - 1.2) * 0.25; a.flash = Math.max(0, a.flash - dt * 4); a.burn = Math.max(0, a.burn - dt);
        if (a.dead > 2.6) this.agents.splice(i, 1);
        continue;
      }
      a.flash = Math.max(0, a.flash - dt * 5);
      if (a.turning > 0) { // civilian → zombie
        a.turning -= dt; a.phase += dt * 14; a.roll = Math.sin(this.time * 20 + i) * 0.15 * Math.min(1, a.turning);
        a.skin.lerp(a.targetSkin, dt * 1.5); a.shirt.multiplyScalar(1 - dt * 0.25);
        a.arm = Math.min(1.35, a.arm + dt * 0.8);
        if (a.turning <= 0) { a.roll = 0; a.gate = Math.random() < 0.5 ? 'east' : 'front'; a.roam = true; } // turned neighbours wander the streets; the horde at the gates comes from the city edge
        continue;
      }
      if (a.kind === 'civ') { this.walkCivilian(a, dt); continue; }
      alive++;
      // rising from the block's edge
      if (a.rise < 1) { a.rise = Math.min(1, a.rise + dt * 0.9); a.y = -0.45 * (1 - a.rise) * (1 - a.rise); }
      // burning
      if (a.burn > 0) { a.burn -= dt; this.damageAgent(a, 26 * dt, 'burn'); if (Math.random() < dt * 20) this.embers.emit(a.x + (Math.random() - .5) * .1, 0.2 + Math.random() * 0.15, a.z + (Math.random() - .5) * .1, 0, 0.6, 0, 0.5, 0.05, this.fireTmp, 0.5); if (a.dead) continue; }
      // choose target
      let tx, tz, mode = 'path';
      const dP = Math.hypot(P.x - a.x, P.z - a.z);
      const aInside = this.world.inCompound(a.x, a.z);
      const canSee = P.down <= 0 && G.combat && (aInside === pInside || dP < 0.8);
      const aggro = night ? 1.7 : 2.4;
      if (canSee && dP < (a.roam ? aggro * 1.6 : aggro)) { tx = P.x; tz = P.z; mode = 'player'; }
      else if ((night || G.phase === 'boss') && !a.roam) {
        if (a.wp && a.wp.length && !aInside) {
          const w = a.wp[0]; tx = w.x; tz = w.z;
          if (Math.hypot(w.x - a.x, w.z - a.z) < 0.35) a.wp.shift();
        } else if (!aInside) {
          const gt = this.world.gates[a.gate || 'front'];
          const bar = this.bars[gt.id];
          const dg = Math.hypot(gt.out.x - a.x, gt.out.z - a.z);
          if (bar.hp > 0 && Math.hypot(gt.x - a.x, gt.z - a.z) < 0.62) { mode = 'bar'; tx = gt.x; tz = gt.z; }
          else if (dg < 0.35 || a.passing) { a.passing = true; tx = gt.inn.x; tz = gt.inn.z; }
          else { tx = gt.out.x; tz = gt.out.z; }
        } else { a.passing = false; tx = doorPt.x; tz = doorPt.z + 0.12; mode = 'door'; }
      } else { // day wander
        const lim = this.world.bounds;
        if (!a.wt || a.wt < 0) { a.wx = clamp(a.x + (Math.random() - 0.5) * 3, -lim, lim); a.wz = clamp(a.z + (Math.random() - 0.5) * 3, -lim, lim); a.wt = 3 + Math.random() * 3; }
        a.wt -= dt; tx = a.wx; tz = a.wz; mode = 'wander';
      }
      let dx = tx - a.x, dz = tz - a.z; const dl = Math.hypot(dx, dz) || 1;
      const reach = mode === 'player' ? 0.24 : mode === 'bar' ? 0.5 : mode === 'door' ? 0.3 : 0.05;
      a.atk -= dt;
      let moving = dl > reach;
      if (!moving) {
        if (a.atk <= 0) {
          a.atk = a.kind === 'runner' ? 0.8 : 1.15; a.lunge = 0.25;
          if (mode === 'player') this.hurtPlayer(a.kind === 'runner' ? 6 : 9, a.x, a.z);
          else if (mode === 'bar') { const b = this.bars[this.world.gates[a.gate].id]; b.hp -= 9; this.hooks.sfx('thud'); this.dust.burst(b.gate.x, 0.2, b.gate.z, 3, 0.8, 0.5, 0.04, col(0x9b7046)); if (b.hp <= 0) { b.hp = 0; this.hooks.toast(`${b.gate.name}被冲破了`, true, 'barricade'); this.hooks.sfx('break'); } }
          else if (mode === 'door') { this.door.hp -= 5; this.hooks.sfx('thud'); this.shake = Math.max(this.shake, 0.15); if (this.door.hp <= 0) { this.door.hp = 0; this.hooks.doorBroken(); } }
        }
      }
      const slow = a.slow > 0 ? 0.45 : 1; a.slow -= dt;
      const sp = moving ? a.speed * slow * (G.phase === 'boss' ? 1.1 : 1) : 0;
      let vx = (dx / dl) * sp, vz = (dz / dl) * sp;
      // stuck nudge
      if (moving && mode !== 'wander') { if (dl > a.lastD - 0.002) a.stuck += dt; else a.stuck = Math.max(0, a.stuck - dt); a.lastD = dl; if (a.stuck > 0.8) { vx += -dz / dl * 0.5; vz += dx / dl * 0.5; if (a.stuck > 2) a.stuck = 0; } }
      a.x += (vx + a.kx) * dt; a.z += (vz + a.kz) * dt;
      a.kx *= Math.exp(-dt * 8); a.kz *= Math.exp(-dt * 8);
      if (sp > 0) a.ry = lerpAngle(a.ry, Math.atan2(vx, vz), 1 - Math.exp(-dt * 6));
      else a.ry = lerpAngle(a.ry, Math.atan2(dx, dz), 1 - Math.exp(-dt * 6));
      a.phase += dt * (sp * 9 + 1);
      a.lunge = Math.max(0, (a.lunge || 0) - dt);
      a.tilt = a.lunge > 0 ? 0.3 : 0.08;
      if (a.rise >= 1) this.collide(a, 0.08, true);
      // traps
      for (const t of this.traps) {
        if (Math.abs(t.x - a.x) < 0.18 && Math.abs(t.z - a.z) < 0.18) {
          if (t.kind === 'spike') { a.slow = 0.3; t.cd -= dt; if (t.cd <= 0) { t.cd = 0.55; this.damageAgent(a, 13, 'trap'); t.uses--; } }
          else if (!t.fired) { t.fired = true; t.uses = 0; this.spawnFire(t.x, t.z, 0.95, 6); }
        }
      }
    }
    // separation (cheap, O(n²) on live zombies only)
    const L = this.agents;
    for (let i = 0; i < L.length; i++) {
      const a = L[i]; if (a.dead || a.kind === 'civ' || a.turning > 0) continue;
      for (let j = i + 1; j < L.length; j++) {
        const b = L[j]; if (b.dead || b.kind === 'civ') continue;
        const dx = b.x - a.x, dz = b.z - a.z, d2 = dx * dx + dz * dz;
        if (d2 < 0.024 && d2 > 1e-6) { const d = Math.sqrt(d2), push = (0.155 - d) * 0.5; a.x -= dx / d * push; a.z -= dz / d * push; b.x += dx / d * push; b.z += dz / d * push; }
      }
    }
    this.traps = this.traps.filter(t => { if (t.uses <= 0) { this.scene.remove(t.mesh); this.dust.burst(t.x, 0.05, t.z, 6, 0.6, 0.5, 0.05, this.smokeC); return false; } return true; });

    // -------- boss
    if (this.boss) this.updateBoss(dt, G);

    // -------- fires
    for (let i = this.fires.length - 1; i >= 0; i--) {
      const f = this.fires[i]; f.life -= dt;
      const lf = clamp(f.life / 0.8, 0, 1) * clamp((f.max - f.life) / 0.15, 0, 1);
      f.mesh.material.uniforms.uTime.value = this.time + i * 3; f.mesh.material.uniforms.uLife.value = lf;
      f.mesh.scale.setScalar(f.r * (0.9 + 0.1 * Math.sin(this.time * 9 + i)));
      if (Math.random() < dt * 60 * lf) { const a = Math.random() * 6.28, r = Math.random() * f.r * 0.8; this.embers.emit(f.x + Math.cos(a) * r, 0.05, f.z + Math.sin(a) * r, (Math.random() - .5) * .2, 0.6 + Math.random() * 0.9, (Math.random() - .5) * .2, 0.6 + Math.random() * 0.5, 0.07 + Math.random() * 0.06, this.fireTmp, 0.4); }
      if (Math.random() < dt * 8 * lf) this.dust.emit(f.x + (Math.random() - .5) * f.r, 0.4, f.z + (Math.random() - .5) * f.r, 0, 0.5, 0, 1.6, 0.18, this.smokeC, 0.15);
      for (const a of this.agents) if (!a.dead && a.kind !== 'civ' && Math.hypot(a.x - f.x, a.z - f.z) < f.r) { if (a.burn <= 0) this.hooks.sfx('ignite'); a.burn = 2.5; }
      const B = this.boss;
      if (B && !B.dead && Math.hypot(B.x - f.x, B.z - f.z) < f.r + 0.15) { if (B.burning <= 0) { this.hooks.float('弱点暴露！', B.x, 1.3, B.z, 'fire'); this.hooks.bossBurn(); } B.burning = 3.2; }
      if (P.down <= 0 && Math.hypot(P.x - f.x, P.z - f.z) < f.r * 0.8) { P.burnT = (P.burnT || 0) - dt; if (P.burnT <= 0) { P.burnT = 0.5; this.hurtPlayer(4, f.x, f.z, true); } }
      if (f.life <= 0) { this.scene.remove(f.mesh); this.fires.splice(i, 1); }
    }
    // -------- projectiles
    for (let i = this.projs.length - 1; i >= 0; i--) {
      const p = this.projs[i]; p.t += dt / p.dur;
      const t = Math.min(1, p.t);
      p.mesh.position.set(p.fx + (p.tx - p.fx) * t, 0.3 + Math.sin(t * Math.PI) * p.h, p.fz + (p.tz - p.fz) * t);
      p.mesh.rotation.x += dt * 14; p.mesh.rotation.z += dt * 6;
      if (Math.random() < 0.6) this.embers.emit(p.mesh.position.x, p.mesh.position.y + 0.04, p.mesh.position.z, 0, 0.2, 0, 0.3, 0.05, this.fireTmp, 0);
      if (t >= 1) {
        this.scene.remove(p.mesh); this.projs.splice(i, 1);
        this.spawnFire(p.tx, p.tz, 0.78, 5);
        this.embers.burst(p.tx, 0.1, p.tz, 26, 1.8, 0.6, 0.08, this.fireTmp, -2);
        this.dust.burst(p.tx, 0.1, p.tz, 8, 1.4, 0.4, 0.035, col(0x6a9a5a), -6);
        this.hooks.sfx('glass'); this.shake = Math.max(this.shake, 0.25);
        const B = this.boss; if (B && !B.dead && Math.hypot(B.x - p.tx, B.z - p.tz) < 0.9) { this.damageBoss(70, true); }
      }
    }
    // -------- pickups
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const k = this.pickups[i]; k.t += dt;
      k.mesh.position.y = 0.12 + Math.sin(k.t * 4) * 0.03; k.mesh.rotation.y += dt * 3;
      const d = Math.hypot(P.x - k.x, P.z - k.z);
      if (d < 1.0 && P.down <= 0) { k.x += (P.x - k.x) * dt * 6; k.z += (P.z - k.z) * dt * 6; k.mesh.position.x = k.x; k.mesh.position.z = k.z; }
      if (d < 0.18 && P.down <= 0) { this.scene.remove(k.mesh); this.pickups.splice(i, 1); this.hooks.pickup(k.item, k.n, k.x, k.z); }
      else if (k.t > 25) { this.scene.remove(k.mesh); this.pickups.splice(i, 1); }
    }
    // -------- crates (hold E)
    let near = null;
    if (G.phase === 'day' && P.down <= 0) {
      for (const c of this.crates) {
        if (c.opened) continue;
        if (c.s.hidden && !G.knows('manhole') && !c.revealed) { if (Math.hypot(P.x - c.s.x, P.z - c.s.z) < 0.35) { c.revealed = true; c.mesh.visible = true; this.hooks.toast('井盖下有东西', false, 'key'); } else continue; }
        const d = Math.hypot(P.x - c.s.x, P.z - c.s.z);
        if (d < 0.42 && (!near || d < near.d)) near = { c, d };
      }
      if (near) {
        const c = near.c;
        if (input.use) { c.prog += dt / (c.s.kind === 'gold' ? 2.0 : 1.1); if (Math.random() < dt * 10) this.dust.emit(c.s.x, 0.2, c.s.z, (Math.random() - .5), 0.8, (Math.random() - .5), 0.4, 0.03, this.sparkC); }
        else c.prog = Math.max(0, c.prog - dt * 2);
        if (c.prog >= 1) this.openCrate(c);
      }
    }
    this.nearCrate = near ? near.c : null;
    // barricade near?
    this.nearBar = null;
    if ((G.combat || G.canMove) && P.down <= 0) for (const k in this.bars) { const b = this.bars[k]; if (Math.hypot(P.x - b.gate.x, P.z - b.gate.z) < 0.7) this.nearBar = b; }
    if (this.nearBar && input.usePressed && G.phase !== 'day') this.hooks.buildBar(this.nearBar);
    this.prepUse = !G.combat && input.usePressed;
    if (this.nearBar && input.usePressed && G.phase === 'day' && !this.nearCrate) this.hooks.buildBar(this.nearBar);
    for (const k in this.bars) { const b = this.bars[k]; b.mesh.visible = b.hp > 0; const f = b.hp / b.max; b.mesh.userData.planks.forEach((p, i) => p.visible = f > i * 0.25); }

    // exit ring (day)
    this.exitRing.material.opacity = G.phase === 'day' ? 0.55 + 0.3 * Math.sin(this.time * 4) : 0;
    this.exitRing.scale.setScalar(1 + 0.08 * Math.sin(this.time * 4));

    // fx
    const pxs = innerHeight * 0.9;
    this.embers.update(dt, pxs); this.dust.update(dt, pxs);
    // views
    this.pv.update(dt, { x: P.x, z: P.z, ry: P.ry, speed: P.speed, attack: P.attack, down: P.down, dodge: P.dodge, visible: P.visible, ringOpacity: G.combat && P.down <= 0 ? 0.35 : 0 });
    this.bv.update(dt, this.boss, this.time);
    this.crowd.sync(this.agents, this.time);
    this.shake = Math.max(0, this.shake - dt * 2.2);
    P.hp = Math.max(0, P.hp);
    return alive;
  }

  walkCivilian(a, dt) {
    if (a.still) { a.phase += dt * 0.6; return; }
    const l = a.lane; a.t += dt * a.speed / Math.hypot(l[2] - l[0], l[3] - l[1]) * a.dir;
    if (a.t > 1 || a.t < 0) { a.dir *= -1; a.t = clamp(a.t, 0, 1); }
    const nx = l[0] + (l[2] - l[0]) * a.t + (a.dir > 0 ? 0.12 : -0.12) * (l[1] === l[3] ? 0 : 1), nz = l[1] + (l[3] - l[1]) * a.t + (a.dir > 0 ? 0.12 : -0.12) * (l[1] === l[3] ? 1 : 0);
    a.ry = Math.atan2(nx - a.x, nz - a.z) || a.ry; a.x = nx; a.z = nz; a.phase += dt * 5;
  }

  collide(o, r, isZombie) {
    const C = this.world.colliders;
    for (let k = 0; k < C.length; k++) this.pushOut(o, C[k], r);
    if (isZombie) for (const key in this.bars) {
      const b = this.bars[key]; if (b.hp <= 0) continue; const g = b.gate;
      const box = g.axis === 'x' ? { x0: g.x - g.w / 2, x1: g.x + g.w / 2, z0: g.z - 0.08, z1: g.z + 0.08 } : { x0: g.x - 0.08, x1: g.x + 0.08, z0: g.z - g.w / 2, z1: g.z + g.w / 2 };
      this.pushOut(o, box, r);
    }
    const lim = this.world.bounds; o.x = clamp(o.x, -lim, lim); o.z = clamp(o.z, -lim, lim);
  }
  pushOut(o, c, r) {
    const cx = clamp(o.x, c.x0, c.x1), cz = clamp(o.z, c.z0, c.z1);
    const dx = o.x - cx, dz = o.z - cz, d2 = dx * dx + dz * dz;
    if (d2 >= r * r) return;
    if (d2 > 1e-8) { const d = Math.sqrt(d2), p = r - d; o.x += dx / d * p; o.z += dz / d * p; }
    else { // inside: push along smallest axis
      const l = o.x - c.x0, rr = c.x1 - o.x, t = o.z - c.z0, bb = c.z1 - o.z, m = Math.min(l, rr, t, bb);
      if (m === l) o.x = c.x0 - r; else if (m === rr) o.x = c.x1 + r; else if (m === t) o.z = c.z0 - r; else o.z = c.z1 + r;
    }
  }

  meleeHit(w, G) {
    const P = this.player; const dmg = w.dmg * G.dmgMult;
    const fx = Math.sin(P.ry), fz = Math.cos(P.ry);
    let hits = 0;
    for (const a of this.agents) {
      if (a.dead || a.kind === 'civ' || a.turning > 0) continue;
      const dx = a.x - P.x, dz = a.z - P.z, d = Math.hypot(dx, dz);
      if (d > w.range + 0.08) continue;
      const ang = Math.acos(clamp((dx * fx + dz * fz) / (d || 1), -1, 1));
      if (ang > w.arc / 2 && d > 0.12) continue;
      const crit = Math.random() < 0.12;
      this.damageAgent(a, dmg * (crit ? 1.8 : 1), crit ? 'crit' : 'hit');
      a.kx += dx / (d || 1) * w.kb; a.kz += dz / (d || 1) * w.kb;
      hits++;
    }
    const B = this.boss;
    if (B && !B.dead && B.state !== 'rise') {
      const dx = B.x - P.x, dz = B.z - P.z, d = Math.hypot(dx, dz);
      const ang = Math.acos(clamp((dx * fx + dz * fz) / (d || 1), -1, 1));
      if (d < w.range + 0.32 && ang < w.arc / 2 + 0.3) { this.damageBoss(dmg, false); hits++; }
    }
    if (hits) { this.hooks.sfx('hit'); this.shake = Math.max(this.shake, 0.08 + 0.03 * hits); this.hooks.hitstop(0.045); }
  }
  damageAgent(a, dmg, kind) {
    a.hp -= dmg;
    if (kind !== 'burn') {
      a.flash = 1;
      this.dust.burst(a.x, 0.22, a.z, 5, 1.1, 0.5, 0.035, this.bloodC, -6);
      this.hooks.float(Math.round(dmg), a.x, 0.45, a.z, kind === 'crit' ? 'crit' : '');
    }
    if (a.hp <= 0 && !a.dead) {
      a.dead = 0.001; a.arm = 0.4;
      this.hooks.kill(a);
      if (Math.random() < 0.3) this.dropPickup(a.x, a.z);
    }
  }
  dropPickup(x, z) {
    const r = Math.random();
    const [item, n, c] = r < 0.35 ? ['scrap', 1, 0x9aa3ad] : r < 0.6 ? ['nails', 2, 0xd0d4d8] : r < 0.8 ? ['food', 1, 0xf0b040] : r < 0.92 ? ['wood', 1, 0xb08050] : ['liquor', 1, 0x7ac070];
    const m = makePickup(c); m.position.set(x, 0.12, z); this.scene.add(m);
    this.pickups.push({ x, z, item, n, mesh: m, t: 0 });
  }
  hurtPlayer(d, fx, fz, fire = false) {
    const P = this.player;
    if (P.down > 0 || P.inv > 0 || !this.G.combat) return;
    P.hp -= d; P.inv = 0.25;
    const dx = P.x - fx, dz = P.z - fz, l = Math.hypot(dx, dz) || 1;
    P.x += dx / l * 0.06; P.z += dz / l * 0.06;
    this.hooks.hurt(d);
    this.dust.burst(P.x, 0.25, P.z, 4, 1, 0.4, 0.035, this.bloodC, -6);
    if (P.hp <= 0) { P.hp = 0; P.down = 0.001; this.hooks.playerDown(); }
  }
  throwMolotov(P, aim) {
    let tx = aim.x, tz = aim.z; const d = Math.hypot(tx - P.x, tz - P.z);
    if (d > 3.2) { tx = P.x + (tx - P.x) / d * 3.2; tz = P.z + (tz - P.z) / d * 3.2; }
    if (d < 0.4) { tx = P.x + Math.sin(P.ry) * 0.8; tz = P.z + Math.cos(P.ry) * 0.8; }
    const m = makeBottle(); this.scene.add(m);
    this.projs.push({ mesh: m, fx: P.x, fz: P.z, tx, tz, t: 0, dur: 0.35 + Math.min(d, 3.2) * 0.08, h: 0.4 + Math.min(d, 3.2) * 0.18 });
    P.attack = 1; P.ry = Math.atan2(tx - P.x, tz - P.z);
    this.hooks.sfx('whoosh');
  }
  spawnFire(x, z, r, life) {
    const m = makeFireMesh(); m.position.set(x, 0.035, z); this.scene.add(m);
    this.fires.push({ x, z, r, life, max: life, mesh: m });
    this.hooks.sfx('fire');
  }
  placeTrap(G) {
    const P = this.player;
    const kind = G.has('firetrap', 1) && (G.trapPref === 'fire' || !G.has('spike', 1)) ? 'firetrap' : G.has('spike', 1) ? 'spike' : null;
    if (!kind) { this.hooks.toast('✕ · C', true, 'spike'); return; }
    G.take(kind, 1);
    const m = makeTrapMesh(kind === 'spike' ? 'spike' : 'fire');
    const x = P.x + Math.sin(P.ry) * 0.3, z = P.z + Math.cos(P.ry) * 0.3;
    m.position.set(x, 0, z); this.scene.add(m);
    this.traps.push({ kind: kind === 'spike' ? 'spike' : 'fire', x, z, uses: kind === 'spike' ? 14 : 1, cd: 0, mesh: m });
    this.hooks.sfx('place');
  }
  openCrate(c) {
    c.opened = true; c.mesh.visible = false;
    this.embers.burst(c.s.x, 0.15, c.s.z, c.s.kind === 'gold' ? 40 : 10, 1.2, 0.8, 0.06, c.s.kind === 'gold' ? this.goldC : this.sparkC, -3);
    this.hooks.lootOpened(c.s);
    if (c.s.kind === 'gold') { // greed has a price
      this.hooks.toast('金光引来了更凶的东西……', true); this.shake = 0.5;
      for (let i = 0; i < 6; i++) setTimeout(() => this.spawnZombie(['W', 'E', 'N'][i % 3], 'runner'), i * 450);
    }
  }

  // ------------------------------------------------ boss
  damageBoss(d, fire) {
    const B = this.boss; if (!B || B.dead) return;
    const burning = B.burning > 0 || fire;
    const dmg = burning ? d * 2 : d * 0.22;
    B.hp -= dmg; B.flashT = 0.1;
    this.hooks.float(burning ? Math.round(dmg) : `${Math.round(dmg)}`, B.x + (Math.random() - .5) * .3, 1.0, B.z, burning ? 'fire' : '');
    if (!burning && Math.random() < 0.25) this.hooks.float('皮糙肉厚', B.x, 1.25, B.z, '');
    this.dust.burst(B.x, 0.5, B.z, 4, 1.2, 0.5, 0.04, this.bloodC, -6);
    if (B.hp <= 0) { B.hp = 0; B.dead = 0.001; B.state = 'dead'; this.hooks.bossDead(); this.shake = 1.4; this.embers.burst(B.x, 0.6, B.z, 80, 2.5, 1.2, 0.09, this.fireTmp, -1.5); }
  }
  updateBoss(dt, G) {
    const B = this.boss, P = this.player;
    if (B.dead) { B.dead += dt; B.speed = 0; if (B.dead > 4) B.visible = false; return; }
    B.st += dt;
    if (B.burning > 0) { B.burning -= dt; B.hp -= 22 * dt; if (Math.random() < dt * 40) this.embers.emit(B.x + (Math.random() - .5) * .35, 0.3 + Math.random() * 0.6, B.z + (Math.random() - .5) * .35, 0, 0.9, 0, 0.6, 0.08, this.fireTmp, 0.5); if (B.hp <= 0) { this.damageBoss(1, true); return; } }
    else B.hp = Math.min(B.max, B.hp + B.regen * dt);
    B.enrage += dt;
    const sp = 0.62 + (G.round === 1 ? Math.min(0.9, B.enrage / 80) : 0);
    const dP = Math.hypot(P.x - B.x, P.z - B.z);
    const alive = P.down <= 0;
    B.chargeCd -= dt;
    let tx, tz;
    const inside = this.world.inCompound(B.x, B.z), pin = this.world.inCompound(P.x, P.z);
    const chasing = alive && (dP < 3.8 || (inside && pin));
    if (chasing) { tx = P.x; tz = P.z; }
    else if (!inside && B.wp && B.wp.length) { const w = B.wp[0]; tx = w.x; tz = w.z; if (Math.hypot(w.x - B.x, w.z - B.z) < 0.45) B.wp.shift(); }
    else if (!inside) { const g = this.world.gates.east; const bar = this.bars.east; if (bar.hp > 0 && Math.hypot(g.x - B.x, g.z - B.z) < 0.85) { tx = g.x; tz = g.z; } else if (Math.hypot(g.out.x - B.x, g.out.z - B.z) < 0.4 || B.passing) { B.passing = true; tx = g.inn.x; tz = g.inn.z; } else { tx = g.out.x; tz = g.out.z; } }
    else { tx = this.world.door.x; tz = this.world.door.z + 0.2; }
    const dx = tx - B.x, dz = tz - B.z, dl = Math.hypot(dx, dz) || 1;
    switch (B.state) {
      case 'rise': B.y = Math.min(0, B.y + dt * 0.6); B.x -= dt * 0.25; if (B.y >= 0) { B.state = 'walk'; B.st = 0; } B.speed = 0.3; break;
      case 'walk': {
        B.speed = sp;
        B.x += dx / dl * sp * dt; B.z += dz / dl * sp * dt;
        B.ry = lerpAngle(B.ry, Math.atan2(dx, dz), 1 - Math.exp(-dt * 4));
        const near = chasing ? dP < 0.72 : dl < 0.75;
        if (near) { B.state = 'windup'; B.st = 0; this.hooks.sfx('growl'); }
        else if (chasing && B.chargeCd <= 0 && dP > 1.4 && dP < 4.2) { B.state = 'chargeprep'; B.st = 0; B.cdir = Math.atan2(dx, dz); this.hooks.sfx('growl'); }
        break;
      }
      case 'windup': B.speed = 0; if (chasing) B.ry = lerpAngle(B.ry, Math.atan2(dx, dz), 1 - Math.exp(-dt * 3)); if (B.st > 0.6) { B.state = 'chop'; B.st = 0; this.bossChop(); } break;
      case 'chop': if (B.st > 0.55) { B.state = 'walk'; B.st = 0; } break;
      case 'chargeprep': B.speed = 0; B.ry = lerpAngle(B.ry, B.cdir, 1 - Math.exp(-dt * 8)); if (B.st > 0.8) { B.state = 'charge'; B.st = 0; this.hooks.sfx('roar'); } break;
      case 'charge': {
        B.speed = 2; const v = 4.4; B.x += Math.sin(B.ry) * v * dt; B.z += Math.cos(B.ry) * v * dt;
        if (Math.random() < 0.6) this.dust.emit(B.x, 0.05, B.z, (Math.random() - .5), 0.5, (Math.random() - .5), 0.6, 0.12, this.smokeC, 0);
        if (alive && Math.hypot(P.x - B.x, P.z - B.z) < 0.4) { this.hurtPlayer(26, B.x, B.z); P.x += Math.sin(B.ry) * 0.5; P.z += Math.cos(B.ry) * 0.5; this.shake = 0.6; B.state = 'walk'; B.st = 0; B.chargeCd = 6; }
        if (B.st > 0.85) { B.state = 'walk'; B.st = 0; B.chargeCd = 6 + Math.random() * 2; }
        break;
      }
    }
    this.collide(B, 0.22, true);
    // break barricades / traps it walks over
    for (const k in this.bars) { const b = this.bars[k]; if (b.hp > 0 && Math.hypot(b.gate.x - B.x, b.gate.z - B.z) < 0.5 && B.state === 'walk') { /* handled by chop */ } }
    for (const t of this.traps) if (Math.hypot(t.x - B.x, t.z - B.z) < 0.3) { if (t.kind === 'fire' && !t.fired) { t.fired = true; this.spawnFire(t.x, t.z, 1.0, 6); } t.uses = 0; }
  }
  bossChop() {
    const B = this.boss, P = this.player;
    this.shake = 0.7; this.hooks.sfx('chop');
    const fx = Math.sin(B.ry), fz = Math.cos(B.ry);
    const hx = B.x + fx * 0.55, hz = B.z + fz * 0.55;
    this.dust.burst(hx, 0.05, hz, 16, 1.6, 0.6, 0.07, this.smokeC, -3);
    if (P.down <= 0 && Math.hypot(P.x - hx, P.z - hz) < 0.6) this.hurtPlayer(this.G.round === 1 ? 40 : 30, B.x, B.z);
    for (const k in this.bars) { const b = this.bars[k]; if (b.hp > 0 && Math.hypot(b.gate.x - hx, b.gate.z - hz) < 0.8) { b.hp = 0; this.hooks.toast(`屠夫劈开了${b.gate.name}`, true, 'skull'); this.hooks.sfx('break'); } }
    if (Math.hypot(this.world.door.x - hx, this.world.door.z - hz) < 0.8) { this.door.hp -= 45; if (this.door.hp <= 0) { this.door.hp = 0; this.hooks.doorBroken(); } }
  }
}

function lerpAngle(a, b, t) { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return a + d * t; }
