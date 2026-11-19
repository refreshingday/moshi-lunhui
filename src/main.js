import * as THREE from 'three';
import { createRenderer, isTouch } from './render.js';
import { buildWorld, CUT } from './world.js';
import { Game } from './game.js';
import { UI } from './ui.js';
import { initAudio, setVolume, toggleMute, sfx } from './audio.js';

const $ = (id) => document.getElementById(id);
if (isTouch) document.body.classList.add('touch');

const R = createRenderer($('stage'));
const world = buildWorld(R.scene);
const ui = new UI(R);
ui.initSpots(world);
const game = new Game(R, world, ui);
window.__game = game; window.__dbg = game.debug();

// ---------------------------------------------------------------- input
const keys = new Set();
const input = { mx: 0, mz: 0, aim: new THREE.Vector3(), attack: false, throw: false, trap: false, heal: false, dodge: false, use: false, usePressed: false, aimLock: false };
let mouseDown = false, pressed = new Set();
addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  initAudio();
  const k = e.key.toLowerCase();
  const k2 = e.code && e.code.startsWith('Digit') ? e.code.slice(5) : k;
  if (/^[1-9]$/.test(k2) && k2 !== k && !ui.modalOpen) ui.cardKey(+k2, true);
  if (!keys.has(k)) pressed.add(k);
  keys.add(k);
  if (k === ' ') e.preventDefault();
  if (k === 'c') ui.craft(undefined, game);
  if (k === 'm') ui.toggleMap();
  if (/^[1-9]$/.test(k) && !ui.modalOpen) ui.cardKey(+k, e.shiftKey);
  if (k === 'j') { if (ui.modalOpen && ui.dismissable) ui.closeModal(); else if (!ui.modalOpen) ui.journal(game); }
  if (k === 'escape') { ui.toggleMap(false); ui.craft(false); $('settings').classList.remove('on'); if (ui.dismissable) ui.closeModal(); }
  if (k === 'enter' && ui.modalOpen) { const b = $('modal').querySelector('.btn.accent'); if (b) b.click(); }
});
addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
addEventListener('blur', () => { keys.clear(); mouseDown = false; });
const cvs = R.renderer.domElement;
const ndc = new THREE.Vector2(), ray = new THREE.Raycaster(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.15);
cvs.addEventListener('pointermove', (e) => { if (e.pointerType === 'touch') return; ndc.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); });
cvs.addEventListener('pointerdown', (e) => { initAudio(); if (e.pointerType === 'touch') return; if (e.button === 0) mouseDown = true; });
addEventListener('pointerup', (e) => { if (e.button === 0) mouseDown = false; });
cvs.addEventListener('contextmenu', (e) => e.preventDefault());

// touch: joystick + buttons
const touch = { x: 0, z: 0, atk: false, use: false };
if (isTouch) {
  const joy = $('joy'), knob = $('joyK'); let id = null, cx = 0, cy = 0;
  joy.addEventListener('pointerdown', (e) => { initAudio(); id = e.pointerId; const r = joy.getBoundingClientRect(); cx = r.left + r.width / 2; cy = r.top + r.height / 2; joy.setPointerCapture(id); });
  joy.addEventListener('pointermove', (e) => { if (e.pointerId !== id) return; let dx = e.clientX - cx, dy = e.clientY - cy; const l = Math.hypot(dx, dy), m = 46; if (l > m) { dx *= m / l; dy *= m / l; } knob.style.transform = `translate(${dx}px,${dy}px)`; touch.x = dx / m; touch.z = dy / m; });
  const end = () => { id = null; knob.style.transform = ''; touch.x = touch.z = 0; };
  joy.addEventListener('pointerup', end); joy.addEventListener('pointercancel', end);
  // pointercancel fires when the OS steals the touch (notification shade, edge swipe): release or the button sticks
  const hold = (el, key) => {
    const up = () => { touch[key] = false; el.classList.remove('on'); };
    el.addEventListener('pointerdown', (e) => { e.preventDefault(); initAudio(); try { el.setPointerCapture(e.pointerId); } catch {} touch[key] = true; el.classList.add('on'); pressed.add('t_' + key); });
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up); el.addEventListener('lostpointercapture', up);
  };
  hold($('tAtk'), 'atk'); hold($('tUse'), 'use'); hold($('tThrow'), 'throw'); hold($('tTrap'), 'trap'); hold($('tHeal'), 'heal'); hold($('tDodge'), 'dodge');
  document.addEventListener('contextmenu', (e) => e.preventDefault());
  // iOS ignores user-scalable=no: block pinch-zoom on the page (the canvas handles its own pinch via OrbitControls)
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  let lastTap = 0; document.addEventListener('touchend', (e) => { const t = performance.now(); if (t - lastTap < 300 && e.target.closest('#touch')) e.preventDefault(); lastTap = t; }, { passive: false });
}

function readInput() {
  // camera-relative WASD
  const f = new THREE.Vector3(); R.camera.getWorldDirection(f); f.y = 0; f.normalize();
  const r = new THREE.Vector3(-f.z, 0, f.x);
  let ix = 0, iz = 0;
  if (keys.has('w') || keys.has('arrowup')) iz += 1; if (keys.has('s') || keys.has('arrowdown')) iz -= 1;
  if (keys.has('d') || keys.has('arrowright')) ix += 1; if (keys.has('a') || keys.has('arrowleft')) ix -= 1;
  if (isTouch) { ix += touch.x; iz -= touch.z; }
  input.mx = f.x * iz + r.x * ix; input.mz = f.z * iz + r.z * ix;
  // aim
  const P = game.sim.player;
  if (isTouch) { // auto-aim nearest threat
    let best = null, bd = 2.2;
    for (const a of game.sim.agents) { if (a.dead || a.kind === 'civ') continue; const d = Math.hypot(a.x - P.x, a.z - P.z); if (d < bd) { bd = d; best = a; } }
    const B = game.sim.boss; if (B && !B.dead && Math.hypot(B.x - P.x, B.z - P.z) < 3) best = B;
    if (best) input.aim.set(best.x, 0, best.z); else input.aim.set(P.x + Math.sin(P.ry) * 1.5, 0, P.z + Math.cos(P.ry) * 1.5);
    input.aimLock = !!best && bd < 1.2;
  } else {
    ray.setFromCamera(ndc, R.camera); ray.ray.intersectPlane(plane, input.aim);
    input.aimLock = false;
  }
  const busy = ui.modalOpen;
  input.attack = !busy && (mouseDown || touch.atk || keys.has('j') && false);
  input.throw = !busy && (pressed.has('q') || pressed.has('t_throw'));
  input.trap = !busy && (pressed.has('t') || pressed.has('t_trap'));
  input.heal = !busy && (pressed.has('h') || pressed.has('t_heal'));
  input.dodge = !busy && (pressed.has(' ') || pressed.has('shift') || pressed.has('t_dodge'));
  input.use = !busy && (keys.has('e') || touch.use);
  input.usePressed = !busy && (pressed.has('e') || pressed.has('t_use'));
  pressed.clear();
  return input;
}

// ---------------------------------------------------------------- dock & settings
$('dReset').onclick = () => { ui.wantReset = true; sfx('click'); };
$('dJournal').onclick = () => { initAudio(); ui.journal(game); };
$('dCraft').onclick = () => ui.craft(undefined, game);
$('dSound').onclick = () => { initAudio(); const m = toggleMute(); $('dSound').style.opacity = m ? 0.4 : 1; };
$('dTune').onclick = () => $('settings').classList.toggle('on');
$('dFull').onclick = () => { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.(); };
$('sTilt').oninput = (e) => R.post.uTilt.value = +e.target.value;
$('sQual').value = R.quality; $('sQual').oninput = (e) => { R.setQuality(+e.target.value); autoQ = false; };
$('sVol').oninput = (e) => setVolume(+e.target.value);
$('sTheme').onclick = () => { const d = document.documentElement; const cur = d.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'); d.dataset.theme = cur === 'dark' ? 'light' : 'dark'; };

let follow = true; $('sFollow').onchange = (e) => follow = e.target.checked;
if (matchMedia('(prefers-reduced-motion: reduce)').matches) R.post.uTilt.value = 0.3;

// item counts on the touch buttons (dimmed at 0)
const tcache = {};
function touchCounts() {
  const n = (k) => game.stash[k] || 0;
  for (const [id, k] of [['tHeal', 'medkit'], ['tThrow', 'molotov'], ['tTrap', null]]) {
    const v = k ? n(k) : n('spike') + n('firetrap');
    if (tcache[id] === v) continue; tcache[id] = v;
    $(id + 'N').textContent = v || ''; $(id).classList.toggle('none', !v);
  }
}

// march camera -> survivor (survivor is ~0.4 tall: waist, head, both shoulders; hidden feet alone don't count); any sample inside a building's footprint and under its roof = hidden
const occ = world.colliders.filter(c => c.h > 0);
function occluded(P, cam) {
  for (const [ox, oy] of [[0, 0.22], [0, 0.38], [-0.14, 0.26], [0.14, 0.26]]) {
    const rx = -(cam.z - P.z), rz = cam.x - P.x, rl = Math.hypot(rx, rz) || 1;
    const tx = P.x + rx / rl * ox, tz = P.z + rz / rl * ox;
    const dx = cam.x - tx, dy = cam.y - oy, dz = cam.z - tz, L = Math.hypot(dx, dy, dz), st = 0.08 / L;
    for (let t = st; t < 1; t += st) { // fixed 8cm steps from the survivor toward the camera (roof edges are thin)
      const x = tx + dx * t, y = oy + dy * t, z = tz + dz * t;
      if (y > 6) break;
      for (const c of occ) if (y < c.h && x > c.x0 && x < c.x1 && z > c.z0 && z < c.z1) return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------- loop
const clock = new THREE.Clock();
let fpsAcc = 0, fpsN = 0, fps = 60, autoQ = true, lowFrames = 0;
const camOff = new THREE.Vector3(), tgt = new THREE.Vector3(), introT = { t: 0 };
const startPos = new THREE.Vector3(30, 46, 42);
const OFF = new THREE.Vector3(8.5, 12.5, 11.5).normalize().multiplyScalar(17);
R.camera.position.copy(startPos);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

function tick(dt) {
  const inp = readInput();
  game.update(dt, inp);

  // camera: always rides the player (orbit/zoom stays free), intro swoops in from above the city
  const C = R.controls, P = game.sim.player;
  tgt.set(P.x, 0.1, P.z);
  if (introT.t < 1) {
    introT.t = Math.min(1, introT.t + dt / (reduced ? 0.01 : 2.8));
    const e = 1 - Math.pow(1 - introT.t, 3);
    C.target.copy(tgt); R.camera.position.lerpVectors(startPos, tgt.clone().add(OFF), e);
  } else if (ui.wantReset) {
    ui.wantReset = false;
    C.target.copy(tgt); R.camera.position.copy(tgt).add(OFF);
  } else {
    camOff.copy(R.camera.position).sub(C.target);
    if (follow) C.target.lerp(tgt, 1 - Math.exp(-dt * 6));
    R.camera.position.copy(C.target).add(camOff);
  }
  C.update();
  R.focus.copy(C.target);
  R.setShadowSpan(Math.min(34, Math.max(10, R.camera.position.distanceTo(C.target) * 0.9)));
  CUT.uP.value.set(P.x, 0.3, P.z); CUT.uC.value.copy(R.camera.position);
  // only open the see-through hole when a building really stands between camera and survivor
  CUT.uR.value += ((occluded(P, R.camera.position) ? 1 : 0) - CUT.uR.value) * (1 - Math.exp(-dt * 10));
  if (CUT.uR.value < 0.02) CUT.uR.value = 0;
  document.body.classList.toggle('fight', !!(game.combat || game.canMove));
  if (isTouch) touchCounts();
  const sh = game.sim.shake;
  if (sh > 0) { R.camera.position.x += (Math.random() - 0.5) * sh * 0.12; R.camera.position.y += (Math.random() - 0.5) * sh * 0.12; }
  R.post.uTime.value += dt;
  R.render();
}

function frame() {
  const dt = Math.min(0.05, clock.getDelta());
  tick(dt);
  // adaptive fps / pixel ratio
  fpsAcc += dt; fpsN++;
  if (fpsAcc > 0.5) {
    fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0;
    if (autoQ) { if (fps < 42) lowFrames++; else lowFrames = 0; if (lowFrames > 3 && R.quality > 0.8) { R.setQuality(Math.max(0.8, R.quality - 0.2)); lowFrames = 0; $('sQual').value = R.quality; } }
  }
  requestAnimationFrame(frame);
}

game.boot();
requestAnimationFrame(frame);
window.__step = (n = 1, inp = {}) => { introT.t = 1; for (let i = 0; i < n; i++) { Object.assign(input, { mx: 0, mz: 0, attack: false, throw: false, trap: false, heal: false, dodge: false, use: false, usePressed: false }, inp, { aim: input.aim }); if (inp.aim) input.aim.set(inp.aim.x, 0, inp.aim.z); game.update(1 / 30, input); const P = game.sim.player; R.controls.target.set(P.x, 0.1, P.z); } R.camera.position.copy(R.controls.target).add(OFF); R.controls.update(); R.focus.copy(R.controls.target); CUT.uP.value.set(game.sim.player.x, 0.3, game.sim.player.z); CUT.uC.value.copy(R.camera.position); R.render(); };
// test hooks: drive the real input → sim → camera → render path without rAF (hidden tabs freeze rAF)
window.__tick = (n = 1, dt = 1 / 30) => { for (let i = 0; i < n; i++) tick(dt); };
window.__keys = keys; window.__R = R;
setTimeout(() => $('intro').classList.add('gone'), 200);
