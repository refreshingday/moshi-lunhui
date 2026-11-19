// Tiny procedural WebAudio kit — no samples.
let ctx = null, master = null, noiseBuf = null, amb = null, tickTimer = null;
let vol = 0.6, muted = false;

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return; }
  master = ctx.createGain(); master.gain.value = muted ? 0 : vol; master.connect(ctx.destination);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 1.5, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
}
export function setVolume(v) { vol = v; if (master) master.gain.value = muted ? 0 : v; }
export function toggleMute() { muted = !muted; if (master) master.gain.value = muted ? 0 : vol; return muted; }

function env(g, t, a, peak, dec) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec); }
function noise(dur, freq, q, peak, type = 'bandpass', a = 0.005) {
  const t = ctx.currentTime, s = ctx.createBufferSource(); s.buffer = noiseBuf;
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = ctx.createGain(); env(g, t, a, peak, dur);
  s.connect(f).connect(g).connect(master); s.start(t, Math.random()); s.stop(t + dur + a + 0.05);
  return f;
}
function tone(freq, dur, peak, type = 'sine', slide = 0, a = 0.005) {
  const t = ctx.currentTime, o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
  const g = ctx.createGain(); env(g, t, a, peak, dur); o.connect(g).connect(master); o.start(t); o.stop(t + dur + a + 0.05);
}
const last = {};
export function sfx(name) {
  if (!ctx || muted) return;
  const now = performance.now(); if (last[name] && now - last[name] < 45) return; last[name] = now;
  switch (name) {
    case 'swing': noise(0.12, 1800, 0.8, 0.12, 'bandpass', 0.02); break;
    case 'hit': noise(0.08, 420, 1.2, 0.35); tone(110, 0.08, 0.25, 'triangle', 0.5); break;
    case 'thud': noise(0.12, 180, 1, 0.22); break;
    case 'break': noise(0.4, 600, 0.5, 0.35); tone(90, 0.3, 0.2, 'sawtooth', 0.4); break;
    case 'hurt': tone(220, 0.18, 0.2, 'square', 0.5); noise(0.1, 900, 1, 0.15); break;
    case 'whoosh': noise(0.25, 900, 0.6, 0.12, 'bandpass', 0.06); break;
    case 'glass': noise(0.18, 4200, 3, 0.25); tone(2400, 0.12, 0.08, 'triangle', 1.4); break;
    case 'fire': noise(0.7, 500, 0.4, 0.22, 'lowpass', 0.02); break;
    case 'ignite': noise(0.3, 1200, 0.5, 0.09, 'highpass', 0.03); break;
    case 'roar': { const f = noise(1.3, 160, 2, 0.5, 'bandpass', 0.1); f.frequency.exponentialRampToValueAtTime(70, ctx.currentTime + 1.2); tone(70, 1.2, 0.35, 'sawtooth', 0.6, 0.08); break; }
    case 'growl': tone(85, 0.5, 0.25, 'sawtooth', 0.7, 0.05); noise(0.4, 260, 3, 0.15); break;
    case 'chop': noise(0.3, 260, 0.8, 0.6); tone(60, 0.35, 0.5, 'sine', 0.5); break;
    case 'place': tone(520, 0.08, 0.1, 'triangle', 0.8); noise(0.06, 2000, 1, 0.08); break;
    case 'loot': tone(660, 0.1, 0.12, 'triangle'); setTimeout(() => tone(990, 0.14, 0.1, 'triangle'), 70); break;
    case 'gold': [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, 0.25, 0.12, 'triangle'), i * 80)); break;
    case 'coin': tone(1400, 0.06, 0.08, 'square', 1.2); break;
    case 'click': tone(900, 0.04, 0.06, 'triangle'); break;
    case 'heal': tone(440, 0.2, 0.12, 'sine', 1.5); break;
    case 'groan': { if (Math.random() < 0.5) tone(120 + Math.random() * 60, 0.7, 0.05, 'sawtooth', 0.7, 0.15); break; }
    case 'alarm': for (let i = 0; i < 3; i++) setTimeout(() => tone(780, 0.25, 0.1, 'square', 0.75), i * 380); break;
    case 'tick': tone(2200, 0.03, 0.12, 'square'); break;
    case 'bell': tone(330, 2.5, 0.25, 'sine', 1, 0.01); tone(495, 2.0, 0.1, 'sine', 1, 0.01); break;
    case 'win': [392, 494, 587, 784].forEach((f, i) => setTimeout(() => tone(f, 0.5, 0.12, 'triangle'), i * 140)); break;
  }
}
export function ambience(kind) {
  if (!ctx) return;
  if (amb) { const a = amb; a.g.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.6); setTimeout(() => { try { a.s.stop(); a.o && a.o.stop(); } catch { } }, 2500); amb = null; }
  if (kind === 'none') return;
  const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
  const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = kind === 'night' ? 220 : 700;
  const g = ctx.createGain(); g.gain.value = 0.0001; g.gain.setTargetAtTime(kind === 'night' ? 0.11 : 0.05, ctx.currentTime, 1.2);
  s.connect(f).connect(g).connect(master); s.start();
  let o = null;
  if (kind === 'night') { o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = 55; const og = ctx.createGain(); og.gain.value = 0.05; o.connect(og).connect(g); o.start(); }
  amb = { s, g, o };
}
export function ticking(on, rate = 1) {
  clearInterval(tickTimer); tickTimer = null;
  if (on) tickTimer = setInterval(() => sfx('tick'), 1000 / rate);
}
