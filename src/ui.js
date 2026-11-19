// DOM layer: icon HUD, walk-in cards, map pins, minimap, modals, floaters, labels, banners.
import * as THREE from 'three';
import { ITEMS } from './game.js';
import { WEAPONS } from './sim.js';
import { ic, ICON_COLORS, SPOT_ICON, TOUCH, kE as KE } from './icons.js';

const $ = (id) => document.getElementById(id);
const pad = (n) => String(Math.floor(n)).padStart(2, '0');
const fmt = (h) => `${pad(((h % 24) + 24) % 24)}:${pad((((h % 1) + 1) % 1) * 60)}`;
const ORDER = ['food', 'water', 'wood', 'nails', 'scrap', 'gas', 'liquor', 'medkit', 'molotov', 'spike', 'firetrap'];
const NUMS = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
const MAPC = { res: '#d9c3a3', office: '#a9b8b6', bld: '#d4b79a', apt: '#e8d4b4', home: '#7cf0a8', mart: '#e0533a', bank: '#4a6aa0', gas: '#2f8a5f', yard: '#cdbf9f', yardc: '#b49a74', park: '#8fb069', lot: '#77777d', kiosk: '#d4b79a' };
const spotColor = (s) => ICON_COLORS[s.id] || ICON_COLORS[s.kind] || '#f0c04a';

export class UI {
  constructor(R) {
    this.R = R; this.onModalClose = null; this.modalOpen = false;
    this.floaters = $('floaters');
    this.v = new THREE.Vector3();
    this.lastFrame = 0;
    this.labels = {};
    this.cardSpec = null;
    this.bigMap = false;
    $('modalWrap').addEventListener('click', (e) => { if (e.target.id === 'modalWrap' && this.dismissable) this.closeModal(); });
    $('mini').addEventListener('click', () => this.toggleMap());
    document.querySelectorAll('[data-ic]').forEach(e => { e.outerHTML = ic(e.dataset.ic, e.closest('#tbtns') ? 'lg' : ''); });
  }
  project(x, y, z) {
    this.v.set(x, y, z).project(this.R.camera);
    return { x: (this.v.x * 0.5 + 0.5) * innerWidth, y: (-this.v.y * 0.5 + 0.5) * innerHeight, vis: this.v.z < 1 };
  }
  float(text, x, y, z, cls = '') {
    if (this.floaters.childElementCount > 60) return;
    const p = this.project(x, y, z);
    const el = document.createElement('div'); el.className = 'fl ' + cls; el.textContent = text;
    el.style.left = p.x + 'px'; el.style.top = p.y + 'px';
    this.floaters.appendChild(el);
    const dx = (Math.random() - 0.5) * 30;
    el.animate([{ transform: 'translate(-50%,-50%) scale(1.2)', opacity: 1 }, { transform: `translate(calc(-50% + ${dx}px), calc(-50% - 38px)) scale(1)`, opacity: 0 }], { duration: cls === 'loot' ? 1600 : 800, easing: 'cubic-bezier(.2,.8,.2,1)' }).onfinish = () => el.remove();
  }
  hurt() { this.hurtV = 1; }
  toast(t, bad, icon) {
    const el = document.createElement('div'); el.className = 'toast glass' + (bad ? ' bad' : ''); el.innerHTML = (icon ? ic(icon) : bad ? ic('warn') : '') + `<span>${t}</span>`;
    $('toasts').appendChild(el);
    while ($('toasts').childElementCount > 3) $('toasts').firstChild.remove();
    setTimeout(() => { el.style.transition = 'opacity .4s'; el.style.opacity = 0; setTimeout(() => el.remove(), 400); }, 2400);
  }
  setHero(round) {
    if (round <= 1) {
      $('eyebrow').textContent = '末日前';
      $('headline').innerHTML = '你还有<em>四十八</em>小时。';
    } else {
      $('eyebrow').textContent = `第 ${NUMS[round] || round} 轮`;
      $('headline').innerHTML = '末日，不是<em>第一次</em>了。';
    }
  }
  heroVisible(on) { $('hero').classList.toggle('hide', !on); }
  hud(on) { $('hud').classList.toggle('on', on); }
  bossBar(on) { $('bossbar').classList.toggle('on', on); }
  setTint(v) { $('tint').style.opacity = v; }
  dock(a, b) { $('dPhase').textContent = a; this.dockSub = b; }
  cta(icon, fn) {
    const b = $('cta'); b.innerHTML = icon ? ic(icon, 'lg') : ''; b.disabled = !fn; b.onclick = fn ? () => fn() : null;
    b.style.display = icon ? '' : 'none';
  }
  resetCam() { this.wantReset = true; }

  // ---------------- walk-in card (non-modal, bottom centre)
  card(spec) {
    this.cardSpec = spec;
    const el = $('card');
    if (!spec) { el.classList.remove('on'); return; }
    el.innerHTML = `<div class="cardHd">${ic(spec.icon, 'lg')}<b>${spec.title}</b>${spec.sub ? `<span>${spec.sub}</span>` : ''}</div>`
      + (spec.quote ? `<div class="quote">${spec.quote}</div>` : '')
      + (spec.tiles.length ? `<div class="tiles">${spec.tiles.map((t, i) => `<button class="tile${t.hot ? ' hot' : ''}" data-i="${i}" ${t.disabled ? 'disabled' : ''}>${ic(t.icon, 'xl')}<span class="cost">${t.cost || ''}</span>${t.badge ? `<i class="badge">${t.badge}</i>` : ''}<kbd>${i + 1}</kbd></button>`).join('')}</div>` : '');
    el.querySelectorAll('.tile').forEach(b => b.onclick = (e) => this.cardKey(+b.dataset.i + 1, e.shiftKey));
    el.classList.add('on');
  }
  cardKey(n, shift) {
    const t = this.cardSpec && this.cardSpec.tiles[n - 1];
    if (!t || t.disabled || !t.act) return;
    const b = $('card').querySelector(`.tile[data-i="${n - 1}"]`);
    if (b) b.animate([{ transform: 'scale(.9)' }, { transform: 'scale(1)' }], { duration: 160 });
    t.act(shift);
  }
  spin(h) { // time spent: the clock chip jolts and drops a "-Nh"
    const c = $('clock');
    c.animate([{ rotate: '-4deg', scale: '1.08' }, { rotate: '0deg', scale: '1' }], { duration: 420, easing: 'cubic-bezier(.2,.8,.2,1)' }); // individual props: works whether the chip is centred (desktop) or pinned right (phone)
    const f = document.createElement('div'); f.className = 'hdrop'; f.textContent = `−${h}h`; c.appendChild(f);
    f.animate([{ opacity: 1, transform: 'translate(-50%,0)' }, { opacity: 0, transform: 'translate(-50%,26px)' }], { duration: 1100, easing: 'ease-out' }).onfinish = () => f.remove();
  }

  // ---------------- spots: ground rings + floating pins + minimap
  initSpots(world) {
    this.world = world;
    this.rings = world.spots.map(s => {
      const m = new THREE.Mesh(new THREE.RingGeometry(s.r * 0.78, s.r, 48), new THREE.MeshBasicMaterial({ color: spotColor(s), transparent: true, opacity: 0.6, depthWrite: false, toneMapped: false }));
      m.rotation.x = -Math.PI / 2; m.position.set(s.x, 0.035, s.z); m.renderOrder = 2;
      const d = new THREE.Mesh(new THREE.CircleGeometry(s.r * 0.78, 40), new THREE.MeshBasicMaterial({ color: spotColor(s), transparent: true, opacity: 0.12, depthWrite: false, toneMapped: false }));
      d.rotation.x = -Math.PI / 2; d.position.set(s.x, 0.03, s.z);
      this.R.scene.add(m, d); return [m, d];
    });
    this.pins = world.spots.map(s => {
      const el = document.createElement('div'); el.className = 'pin'; el.style.setProperty('--c', spotColor(s));
      el.innerHTML = ic(SPOT_ICON[s.id] || 'warn', 'lg'); $('pins').appendChild(el); return el;
    });
    // minimap static layer
    const M = world.map, H = M.half;
    const roads = M.roads.map(r => r.ax === 'x' ? `<rect x="${-H}" y="${r.c - r.hw}" width="${2 * H}" height="${2 * r.hw}"/>` : `<rect x="${r.c - r.hw}" y="${-H}" width="${2 * r.hw}" height="${2 * H}"/>`).join('');
    const blds = M.blds.map(b => `<rect x="${b.x0.toFixed(2)}" y="${b.z0.toFixed(2)}" width="${(b.x1 - b.x0).toFixed(2)}" height="${(b.z1 - b.z0).toFixed(2)}" fill="${MAPC[b.k] || '#cbb89c'}"/>`).join('');
    const spots = world.spots.map((s, i) => `<g class="ms" data-i="${i}" transform="translate(${s.x} ${s.z})"><g class="up"><circle r="1.7" fill="${spotColor(s)}"/>${ic(SPOT_ICON[s.id] || 'warn').replace('<svg class="ic ', '<svg x="-1.3" y="-1.3" width="2.6" height="2.6" class="mi ')}</g></g>`).join('');
    $('mini').innerHTML = `<svg viewBox="-26 -26 52 52"><defs><clipPath id="mclip"><circle r="25.6"/></clipPath></defs><g clip-path="url(#mclip)"><circle r="26" fill="#6f7a64"/><g id="mrot"><rect x="${-H}" y="${-H}" width="${2 * H}" height="${2 * H}" fill="#8a9a74"/><g fill="#55575c">${roads}</g><g>${blds}</g><path id="mc" fill="#ffd36a" stroke="#3a2a14" stroke-width=".3"/><path id="mz" fill="#d23a2a"/><g id="mspots">${spots}</g><g id="mpl"><circle r="2.2" fill="#fff" opacity=".35"/><path d="M0 1.9 L1.3 -1.1 L0 -0.4 L-1.3 -1.1Z" fill="#fff" stroke="#2a2420" stroke-width=".35"/></g></g></g><circle r="25.6" fill="none" stroke="rgba(255,255,255,.7)" stroke-width=".8"/><path d="M0 -24.4 l1.4 2.6 h-2.8z" fill="#fff"/></svg>`;
    this.mRot = $('mrot'); this.mPl = $('mpl'); this.mZ = $('mz'); this.mC = $('mc'); this.mSpots = [...$('mspots').children];
  }
  toggleMap(on) { this.bigMap = on === undefined ? !this.bigMap : on; $('mini').classList.toggle('big', this.bigMap); }
  updateSpots(g, now) {
    if (!this.rings) return;
    const prep = g.phase === 'prep';
    const t = now * 0.004;
    this.world.spots.forEach((s, i) => {
      const [m, d] = this.rings[i];
      const cur = g.spotCur === s, done = this.spotDone(g, s);
      m.visible = d.visible = prep;
      m.material.opacity = cur ? 0.95 : (done ? 0.25 : 0.45 + 0.25 * Math.sin(t + i));
      d.material.opacity = cur ? 0.3 : 0.1;
      const sc = cur ? 1.12 : 1 + 0.04 * Math.sin(t * 1.3 + i); m.scale.setScalar(sc);
      // pins: projected icon, clamped to the screen edge when off-view
      const el = this.pins[i];
      if (!prep || cur) { el.style.display = 'none'; return; }
      el.style.display = '';
      const p = this.project(s.x, 1.3, s.z);
      const m0 = 34; let x = p.x, y = p.y, edge = false;
      if (!p.vis) { x = innerWidth - x; y = innerHeight - y; }
      if (!p.vis || x < m0 || y < m0 || x > innerWidth - m0 || y > innerHeight - m0) {
        edge = true; const cx = innerWidth / 2, cy = innerHeight / 2; let dx = x - cx, dy = y - cy;
        const k = Math.min((cx - m0) / Math.max(1e-3, Math.abs(dx)), (cy - m0) / Math.max(1e-3, Math.abs(dy)));
        x = cx + dx * k; y = cy + dy * k;
      }
      el.classList.toggle('edge', edge); el.classList.toggle('done', done);
      // nearer spots read bigger; far ones shrink so the screen doesn't drown in pins
      const P = g.sim.player, dist = Math.hypot(s.x - P.x, s.z - P.z), k = edge ? 1 : Math.max(0.62, Math.min(1.08, 1.16 - dist / 22));
      el.style.transform = `translate(${x}px,${y}px) translate(-50%,-100%) scale(${k.toFixed(2)})`;
    });
  }
  spotDone(g, s) {
    if (s.kind === 'npc') return g.done.has('talk_' + s.id);
    if (s.kind === 'bank') return g.done.has('bank') && (!g.knows('moneyless') || g.done.has('loan'));
    return false;
  }
  updateMini(g) {
    if (!this.mRot) return;
    const P = g.sim.player, cam = this.R.camera;
    cam.getWorldDirection(this.v);
    const a = -90 - Math.atan2(this.v.z, this.v.x) * 180 / Math.PI; // camera forward = up
    const big = this.bigMap, cx = big ? 0 : -P.x, cz = big ? 0 : -P.z, sc = big ? 1 : 1.55;
    this.mRot.setAttribute('transform', `rotate(${a.toFixed(1)}) scale(${sc}) translate(${cx.toFixed(2)} ${cz.toFixed(2)})`);
    this.mPl.setAttribute('transform', `translate(${P.x.toFixed(2)} ${P.z.toFixed(2)}) rotate(${(-P.ry * 180 / Math.PI).toFixed(1)}) scale(${big ? 1 : 0.7})`);
    const inv = (-a).toFixed(1), prep = g.phase === 'prep';
    this.mSpots.forEach((e, i) => { e.style.display = prep || this.world.spots[i].kind === 'home' ? '' : 'none'; e.firstChild.setAttribute('transform', `rotate(${inv}) scale(${big ? 1 : 0.65})`); });
    let d = '';
    if (g.combat) for (const z of g.sim.agents) if (!z.dead && z.kind !== 'civ') d += `M${z.x.toFixed(1)} ${z.z.toFixed(1)}h.7v.7h-.7z`;
    const B = g.sim.boss; if (B && !B.dead) d += `M${(B.x - 0.8).toFixed(1)} ${(B.z - 0.8).toFixed(1)}h1.6v1.6h-1.6z`;
    this.mZ.setAttribute('d', d);
    // daytime: unopened crates as gold diamonds (the hidden gold crate only once you know where it is)
    const cr = g.phase === 'day' ? g.sim.crates.filter(c => !c.opened && (c.s.kind !== 'gold' || g.knows('manhole'))) : [];
    const ck = cr.length + ':' + (big ? 1 : 0);
    if (ck !== this._ck) { this._ck = ck; const r = big ? 0.75 : 0.6; this.mC.setAttribute('d', cr.map(c => `M${c.s.x.toFixed(1)} ${(c.s.z - r).toFixed(2)}l${r} ${r}l${-r} ${r}l${-r} ${-r}z`).join('')); }
  }

  // ---------------- modals / banners
  modal(html, bind, dismissable = false) {
    const m = $('modal'); m.innerHTML = html;
    this.dismissable = dismissable;
    this.onModalClose = null;
    m.querySelectorAll('[data-close]').forEach(b => b.onclick = () => this.closeModal());
    if (bind) bind(m);
    $('modalWrap').classList.add('on'); this.modalOpen = true;
  }
  closeModal(silent) {
    if (!this.modalOpen) return;
    $('modalWrap').classList.remove('on'); this.modalOpen = false;
    const f = this.onModalClose; this.onModalClose = null;
    if (!silent && f) f();
  }
  banner(a, b, c, ms = 2500) {
    $('banA').textContent = a; $('banB').textContent = b; $('banC').innerHTML = c;
    const el = $('banner'); el.classList.add('on');
    clearTimeout(this._bt); this._bt = setTimeout(() => el.classList.remove('on'), ms);
  }
  craft(on, game) {
    const el = $('craft');
    if (on === undefined) on = !el.classList.contains('on');
    el.classList.toggle('on', on);
    if (on && game) { this.craftGame = game; this.drawCraft(); }
  }
  drawCraft() {
    const g = this.craftGame; if (!g) return;
    const R = { spike: { need: { scrap: 1, nails: 2 } }, molotov: { need: { gas: 1, liquor: 1 }, bp: 1 }, firetrap: { need: { gas: 2, scrap: 1 }, bp: 1 } };
    const list = $('craftList'); list.innerHTML = '';
    for (const k in R) {
      const r = R[k]; const known = !r.bp || g.hasBp(k);
      const can = known && Object.entries(r.need).every(([i, n]) => g.has(i, n));
      const need = Object.entries(r.need).map(([i, n]) => `<span class="need ${g.has(i, n) ? '' : 'miss'}">${ic(i)}<b>${n}</b></span>`).join('');
      const row = document.createElement('div'); row.className = 'crow' + (known ? '' : ' lock');
      row.innerHTML = known
        ? `${ic(k, 'xl')}<div class="eq">${need}</div><b class="own">${g.stash[k] || 0}</b><button class="rb" ${can ? '' : 'disabled'}>${ic('plus')}</button><button class="rb alt" ${can ? '' : 'disabled'}>×∞</button>`
        : `${ic('warn', 'xl')}<div class="eq"><span class="need miss">？？？</span></div>`;
      row.title = ITEMS[k].n;
      if (known) {
        const [b1, b2] = row.querySelectorAll('button');
        const make = (all) => { let n = 0; do { if (!Object.entries(r.need).every(([i, m]) => g.has(i, m))) break; for (const [i, m] of Object.entries(r.need)) g.take(i, m); g.stash[k] = (g.stash[k] || 0) + 1; n++; } while (all && n < 99); if (n) g.toast(`×${n}`, false, k); this.drawCraft(); };
        b1.onclick = () => make(false); b2.onclick = () => make(true);
      }
      list.appendChild(row);
    }
  }
  journal(game) {
    const KN = game.constructor.KNOW;
    const tab = (cat) => {
      const ent = Object.entries(KN).filter(([, v]) => v.cat === cat);
      return ent.map(([k, v]) => game.knows(k) ? `<div class="entry"><b>${v.t}</b><span>${v.d}</span></div>` : `<div class="entry lock"><b>？？？</b></div>`).join('');
    };
    const html = (t) => `<div class="ask">${ic('book', 'xl')}<h2>前世档案</h2></div>
      <div class="tabs"><button data-t="intel" class="${t === 'intel' ? 'on' : ''}">${ic('map')}</button><button data-t="boss" class="${t === 'boss' ? 'on' : ''}">${ic('skull')}</button><button data-t="skill" class="${t === 'skill' ? 'on' : ''}">${ic('fist')}</button></div>
      <div>${t === 'skill' ? `<div class="entry"><b>${ic('fist')} Lv${game.meta.fight}</b><span>+${game.meta.fight * 15}%</span></div><div class="entry ${game.meta.space ? '' : 'lock'}"><b>${ic('bag')} ${game.meta.space ? '随身空间' : '？？？'}</b></div><div class="entry ${game.hasBp('molotov') ? '' : 'lock'}"><b>${ic('molotov')} ${game.hasBp('molotov') ? '燃烧瓶 / 汽油陷阱' : '？？？'}</b></div>` : tab(t)}</div>
      <div class="row"><button class="btn ghost" id="wipeMem">${ic('sweep')}</button><button class="btn" data-close>✕</button></div>`;
    const keepClose = this.onModalClose;
    const draw = (t) => this.modal(html(t), (m) => {
      m.querySelectorAll('[data-t]').forEach(b => b.onclick = () => draw(b.dataset.t));
      m.querySelector('#wipeMem').onclick = () => { if (confirm('清除所有前世记忆，从第 1 轮重新开始？')) game.wipe(); };
      this.onModalClose = keepClose;
    }, true);
    draw('intel');
  }
  rebirthEls() {
    return {
      line: (i, t) => { const e = $('rb' + i); e.textContent = t; e.classList.add('on'); },
      watch: (on) => { $('watch').classList.toggle('on', on); $('watch').classList.toggle('spin', on); },
      clear: () => { for (let i = 0; i < 5; i++) { $('rb' + i).classList.remove('on'); } $('watch').classList.remove('on', 'spin'); },
    };
  }
  rebirthOn(on) { $('rebirth').classList.toggle('on', on); }

  // ---------------- per-frame HUD
  frame(g, input) {
    const now = performance.now();
    this.hurtV = Math.max(0, (this.hurtV || 0) - 0.04);
    const P = g.sim.player;
    this.R.post.uHurt.value = Math.max(this.hurtV * 0.6, g.combat && P.hp < 35 ? 0.25 + 0.1 * Math.sin(now * 0.006) : 0);
    this.updateLabels(g);
    this.updateSpots(g, now);
    if (now - this.lastFrame < 100) return;
    this.lastFrame = now;
    const prep = g.phase === 'prep';
    document.body.classList.toggle('prep', prep);
    document.body.classList.toggle('fresh', prep && !g.prepStarted);
    this.updateMini(g);
    // clock
    $('clkT').textContent = fmt(g.hour);
    $('clkLab').textContent = g.clockLab || '';
    $('clkSub').innerHTML = prep ? `${ic('skull')}<b>${Math.ceil(g.hours)}h</b>`
      : g.phase === 'day' ? `${ic('clock')}<b>${Math.max(0, Math.ceil(g.dur - g.t))}</b>${g.meta.space ? '' : `${ic('bag')}<b>${g.count(g.bag)}/${g.bagCap}</b>`}`
      : g.combat ? `${ic('skull')}<b>${g.sim.activeZombies()}</b>${ic('knife')}<b>${g.killCount}</b>` : '';
    $('clock').classList.toggle('warn', prep && g.hours <= 6);
    $('dSub').textContent = `${this.dockSub || ''} · ${fmt(g.hour)}`;
    // chips (prep)
    $('chMoney').innerHTML = `${ic('money')}<b>¥${g.money.toLocaleString()}</b>`;
    $('chStore').innerHTML = `${ic('house')}<b>${g.count(g.stash)}/${g.meta.space ? '∞' : g.cap}</b>`;
    const bar = (id, v, max = 100) => { $('v' + id).textContent = Math.round(v); $('f' + id).style.width = Math.max(0, Math.min(100, v / max * 100)) + '%'; $('f' + id).parentNode.parentNode.classList.toggle('low', v / max < 0.3); };
    bar('Hp', P.hp, P.maxHp); bar('Base', g.sim.door.hp, g.sim.door.max);
    bar('Food', g.stats.food); bar('Water', g.stats.water); bar('Morale', g.stats.morale);
    // inventory: only what you have
    const sig = JSON.stringify(g.stash) + JSON.stringify(g.bag) + g.meta.space + g.phase + g.weapon;
    if (sig !== this._invSig) {
      this._invSig = sig;
      const grid = (o) => ORDER.filter(k => o[k]).map(k => `<div class="cell" title="${ITEMS[k].n}">${ic(k, 'lg')}<b>${o[k]}</b></div>`).join('');
      $('invList').innerHTML = grid(g.stash) || `<div class="cell z">${ic('bag', 'lg')}<b>0</b></div>`;
      const showBag = g.phase === 'day' && !g.meta.space;
      $('bagWrap').style.display = showBag ? '' : 'none';
      $('bagList').innerHTML = grid(g.bag) || `<div class="cell z">${ic('bag', 'lg')}<b>0</b></div>`;
      $('bagCap').textContent = `${g.count(g.bag)}/${g.bagCap}`;
      if ($('craft').classList.contains('on')) this.drawCraft();
      // hotbar
      const s = g.stash;
      const slots = [['L', WEAPONS[g.weapon] ? g.weapon : 'fist', ''], ['Q', 'molotov', s.molotov || 0], ['T', (s.firetrap ? 'firetrap' : 'spike'), (s.spike || 0) + (s.firetrap || 0)], ['H', 'medkit', s.medkit || 0], ['␣', 'run', '']];
      $('hotbar').innerHTML = slots.map(([k, n, c]) => `<div class="slot glass ${c === 0 ? 'dim' : ''}"><span class="k">${k}</span>${ic(n, 'lg')}${c === '' ? '' : `<b>${c}</b>`}</div>`).join('');
    }
    // boss
    const B = g.sim.boss;
    if (B) { $('bossFill').style.width = (B.hp / B.max * 100) + '%'; $('bossSt').innerHTML = B.dead ? '' : B.burning > 0 ? `${ic('molotov')} ×2` : g.knows('butcher_fire') ? `${ic('molotov')}?` : ''; }
    // hint: icons, not sentences
    let hint = '';
    if (g.combat && P.down <= 0) {
      if (g.sim.nearCrate) { const c = g.sim.nearCrate; hint = `${KE()}${ic('bag')}<span class="pg"><i style="width:${Math.round(c.prog * 100)}%"></i></span>`; }
      else if (g.sim.nearBar) { const b = g.sim.nearBar; hint = b.hp >= b.max ? `${ic('barricade')}✓` : `${KE()}${ic('barricade')}<span class="need ${(s0(g, 'wood') >= 2) ? '' : 'miss'}">${ic('wood')}<b>2</b></span><span class="need ${(s0(g, 'nails') >= 1) ? '' : 'miss'}">${ic('nails')}<b>1</b></span>`; }
      else if (g.phase === 'day' && g.leftHome) hint = `${ic('arrow')}${ic('house')}`;
    } else if (prep && !g.prepStarted && !this.modalOpen) hint = `${TOUCH ? ic('run') : '<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd>'}${ic('arrow')}${ic('cart')}${ic('bank')}${ic('chat')}`;
    else if (prep && g.sim.nearBar) { const b = g.sim.nearBar; if (b.hp < b.max) hint = `${KE()}${ic('barricade')}<span class="need ${(s0(g, 'wood') >= 2) ? '' : 'miss'}">${ic('wood')}<b>2</b></span><span class="need ${(s0(g, 'nails') >= 1) ? '' : 'miss'}">${ic('nails')}<b>1</b></span>`; }
    document.body.classList.toggle('nearbar', !!(prep && g.sim.nearBar && g.sim.nearBar.hp < g.sim.nearBar.max));
    const h = $('hint'); if (h._v !== hint) { h._v = hint; h.innerHTML = hint; } h.classList.toggle('on', !!hint);
  }
  updateLabels(g) {
    const show = g.combat && g.phase !== 'day';
    this.label('door', show, g.world.door.x, 0.75, g.world.door.z, '', g.sim.door.hp / g.sim.door.max);
    for (const k in g.sim.bars) { const b = g.sim.bars[k]; this.label('bar_' + k, g.combat && b.hp > 0 && b.hp < b.max, b.gate.x, 0.6, b.gate.z, '', b.hp / b.max); }
  }
  label(id, on, x, y, z, text, frac) {
    let el = this.labels[id];
    if (!el) { el = document.createElement('div'); el.className = 'lbl'; el.innerHTML = `${ic(id === 'door' ? 'house' : 'barricade')}<span class="mini"><i></i></span>`; this.floaters.appendChild(el); this.labels[id] = el; }
    el.style.display = on ? '' : 'none';
    if (!on) return;
    const p = this.project(x, y, z);
    el.style.left = p.x + 'px'; el.style.top = p.y + 'px';
    el.querySelector('i').style.width = Math.max(0, frac * 100) + '%';
  }
}
const s0 = (g, k) => g.stash[k] || 0;
