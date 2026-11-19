// Phases, inventory, knowledge (the real progression), UI.
import * as THREE from 'three';
import { Sim, WEAPONS } from './sim.js';
import { sfx, ambience, ticking } from './audio.js';
import { ic, SPOT_ICON, kE } from './icons.js';

const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const pad = (n) => String(Math.floor(n)).padStart(2, '0');
const fmtClock = (h) => `${pad(((h % 24) + 24) % 24)}:${pad((h % 1) * 60)}`;

export const ITEMS = {
  food: { n: '泡面' }, water: { n: '矿泉水' }, wood: { n: '木板' }, nails: { n: '钉子' },
  scrap: { n: '废铁' }, gas: { n: '汽油' }, liquor: { n: '白酒' }, medkit: { n: '急救包' },
  molotov: { n: '燃烧瓶' }, spike: { n: '钉刺陷阱' }, firetrap: { n: '汽油陷阱' },
};

const KNOW = {
  east: { cat: 'intel', t: '第一夜，尸群主要从东边路口来', d: '东侧门要先钉死。西边只有零星几只。' },
  gas: { cat: 'intel', t: '加油站后墙有三桶没人管的汽油', d: '末日第一天还在。摸金时直接去拿。' },
  manhole: { cat: 'intel', t: '公园井盖下藏着一只金色箱子', d: '在长椅东边、水管正上方。开箱会引来跑尸。' },
  moneyless: { cat: 'intel', t: '末日之后，钱就是废纸', d: '前世一整箱现金换不到一瓶水。这一次，先把能借的全借出来花掉。' },
  butcher_fire: { cat: 'boss', t: '屠夫怕火', d: '前世的最后一刻，加油站的火光让它退了三步。' },
  butcher_tumor: { cat: 'boss', t: '背后的肉瘤是弱点', d: '着火时肉瘤暴露，受到的伤害 ×2，并且停止再生。不着火时几乎砍不动。' },
  butcher_night: { cat: 'boss', t: '它在第二夜子时，从东边路口爬上来', d: '先把燃烧瓶做好，在东边铺汽油陷阱。' },
  butcher_charge: { cat: 'boss', t: '地上亮起红色长条，就是它要冲撞', d: '横向翻滚（空格）躲开。' },
};
const BLUEPRINTS = {
  spike: { n: '钉刺陷阱', need: { scrap: 1, nails: 2 }, d: '减速并持续伤害踩上的丧尸', always: true },
  molotov: { n: '燃烧瓶', need: { gas: 1, liquor: 1 }, d: '投掷后燃起 5 秒火海（Q）', bp: 'molotov' },
  firetrap: { n: '汽油陷阱', need: { gas: 2, scrap: 1 }, d: '被踩中时爆燃 6 秒（T）', bp: 'firetrap' },
};
const SHOPS = {
  mart: { t: '华联超市', items: [['food', 6], ['water', 3], ['liquor', 28], ['medkit', 60], ['knife', 35]] },
  pharm: { t: '大药房', items: [['medkit', 48], ['water', 3], ['liquor', 32]] },
  hw: { t: '五金建材', items: [['wood', 12], ['nails', 3], ['scrap', 8], ['bat', 120]] },
  gas: { t: '加油站', items: [['gas', 45]], limit: 6 },
};
const RUMORS = [
  { k: 'east', who: '楼下王大爷', s: '“东边菜场那头好多人发高烧，救护车一晚上没停。”' },
  { k: 'gas', who: '加油站小哥', s: '“后墙那三桶油老板说不要了，你要就搬走。”' },
  { k: 'manhole', who: '收音机', s: '“……请市民不要靠近幸福里公园的下水道井盖，重复……”' },
  { k: null, who: '保安老李', s: '“这几天别出门。我侄子在研究所上班，说那边封了。”' },
];

const META_KEY = 'moshi-lunhui-meta-v1';
function loadMeta() {
  try { const m = JSON.parse(localStorage.getItem(META_KEY)); if (m && m.round) return m; } catch { }
  return { round: 1, know: [], bps: [], fight: 0, deaths: 0, space: false, rumorIdx: 0, wins: 0 };
}
function saveMeta(m) { try { localStorage.setItem(META_KEY, JSON.stringify(m)); } catch { } }

export class Game {
  constructor(R, world, ui) {
    this.R = R; this.world = world; this.ui = ui;
    this.meta = loadMeta();
    this.sim = new Sim(R.scene, world, this.hooks());
    this.phase = 'title'; this.combat = false; this.timeScale = 1; this.hitstopT = 0;
    this.hour = 10; this.apoc = 0; this.clockLab = '';
    this.stats = { food: 100, water: 100, morale: 80 };
    this.trapPref = 'fire';
    this.killCount = 0; this.dayLoot = 0;
    this.camFocus = new THREE.Vector3();
    window.__game = this;
  }

  // ------------------------------------------------ knowledge & inventory
  knows(k) { return this.meta.know.includes(k); }
  learn(k, quiet) { if (this.knows(k)) return false; this.meta.know.push(k); saveMeta(this.meta); if (!quiet) this.toast(KNOW[k].t, false, 'book'); return true; }
  hasBp(k) { return BLUEPRINTS[k].always || this.meta.bps.includes(k); }
  get cap() { return this.meta.space ? 9999 : 40; }
  get bagCap() { return this.meta.space ? 9999 : 10; }
  count(o) { let n = 0; for (const k in o) n += o[k]; return n; }
  has(k, n = 1) { return (this.stash[k] || 0) >= n; }
  take(k, n = 1) { if (!this.has(k, n)) return false; this.stash[k] -= n; this.dirty = true; return true; }
  give(k, n = 1, toBag = false) {
    if (k === 'axe' || k === 'knife' || k === 'bat') { this.ownWeapon(k); return true; }
    const target = toBag && !this.meta.space ? this.bag : this.stash;
    const capLeft = (toBag && !this.meta.space ? this.bagCap - this.count(this.bag) : this.cap - this.count(this.stash));
    const m = Math.min(n, Math.max(0, capLeft));
    if (m <= 0) { this.toast(toBag ? '满了' : '放不下了', true, toBag ? 'bag' : 'house'); return false; }
    target[k] = (target[k] || 0) + m; this.dirty = true; return m === n;
  }
  ownWeapon(k) {
    const rank = { fist: 0, knife: 1, bat: 2, axe: 3 };
    this.weapons.add(k);
    if (rank[k] > rank[this.weapon]) { this.weapon = k; this.sim.pv.setWeapon(k); this.toast(WEAPONS[k].name, false, k); }
  }
  get dmgMult() { return (1 + this.meta.fight * 0.15) * (this.stats.morale < 30 ? 0.85 : 1); }
  get moveMult() { return this.stats.food < 25 || this.stats.water < 25 ? 0.82 : 1; }

  // ------------------------------------------------ hooks for the sim
  hooks() {
    return {
      sfx: (n) => sfx(n),
      toast: (t, bad, icon) => this.toast(t, bad, icon),
      float: (t, x, y, z, cls) => this.ui.float(t, x, y, z, cls),
      kill: () => { this.killCount++; if (Math.random() < 0.15) sfx('groan'); },
      pickup: (item, n, x, z) => { const ok = this.give(item, n, this.phase === 'day'); if (ok !== false) { this.ui.float(`+${n} ${ITEMS[item].n}`, x, 0.4, z, 'loot'); sfx('coin'); } },
      lootOpened: (s) => this.onLoot(s),
      hurt: (d) => { sfx('hurt'); this.ui.hurt(); },
      playerDown: () => this.onPlayerDown(),
      doorBroken: () => this.onDoorBroken(),
      bossDead: () => this.onBossDead(),
      bossBurn: () => { sfx('roar'); },
      buildBar: (b) => this.buildBar(b),
      hitstop: (t) => { this.hitstopT = Math.max(this.hitstopT, t); },
    };
  }
  buildBar(b) {
    if (b.hp >= b.max) { this.toast(`${b.gate.name} ✓`, false, 'barricade'); return; }
    if (!this.has('wood', 2) || !this.has('nails', 1)) { this.toast(`${ic('wood')}×2 ${ic('nails')}×1`, true, 'barricade'); return; }
    this.take('wood', 2); this.take('nails', 1);
    b.hp = b.max; sfx('place'); sfx('thud');
    this.toast(b.gate.name, false, 'barricade');
  }

  // ------------------------------------------------ flow
  boot() {
    this.ui.setHero(this.meta.round);
    this.startRound(true);
  }
  startRound(first = false) {
    const r = this.meta.round;
    if (!first) this.ui.wantReset = true;
    this.sim.reset();
    this.stash = {}; this.bag = {}; this.weapons = new Set(['fist']); this.weapon = 'fist'; this.sim.pv.setWeapon('fist');
    this.money = 800; this.hours = 48; this.done = new Set(); this.night = 0;
    this.stats = { food: 100, water: 100, morale: 80 };
    this.doorMax = 150; this.sim.door.hp = this.sim.door.max = 150;
    this.preBuilt = false; this.killCount = 0; this.dayLoot = 0;
    this.apoc = 0; this.hour = 10; this.phase = 'prep'; this.combat = false;
    this.gasBought = 0; this.leftSpawn = false; this.prepStarted = false; this.warned = false; this.spotCur = null; this.redraw = null;
    this.world.setDecay(0);
    this.sim.spawnCivilians(46);
    for (const [x, z, ry] of [[-2.68, 7.4, Math.PI / 2], [3.0, 3.7, 0], [-4.45, 0.28, 0.6]]) this.sim.agents.push(this.sim.makeAgent('civ', x, z, { still: true, ry }));
    this.sim.showCrates(false);
    this.ui.card(null); this.ui.hud(true); this.ui.bossBar(false);
    this.ui.setHero(r); this.ui.heroVisible(true);
    this.ui.setTint(0);
    this.R.controls.mouseButtons = { LEFT: null, MIDDLE: 1, RIGHT: 0 };
    ambience('day');
    this.setCTA('moon', () => this.confirmApocalypse());
    this.ui.dock('备战期', `第 ${r} 轮 · 末日前`);
    if (!first) this.ui.resetCam();
  }
  get canMove() { return this.phase === 'prep' && !this.ui.modalOpen; }

  // ------------------------------------------------ walk-in spots (prep)
  spotAt(x, z) { let best = null, bd = 1e9; for (const s of this.world.spots) { const d = Math.hypot(x - s.x, z - s.z); if (d < s.r && d < bd) { bd = d; best = s; } } return best; }
  updateSpots() {
    const P = this.sim.player;
    const s = this.phase === 'prep' && P.down <= 0 && !this.ui.modalOpen ? this.spotAt(P.x, P.z) : null;
    if (s && s.kind === 'home' && !this.leftSpawn) return;
    if (!s && this.phase === 'prep') this.leftSpawn = true;
    if (this.ui.modalOpen && this.phase === 'prep') return;
    if (s !== this.spotCur) { this.spotCur = s; this.redraw = null; if (s) this.enterSpot(s); else this.ui.card(null); }
  }
  spend(h) { this.hours = Math.max(0, this.hours - h); this.ui.spin(h); this.prepStarted = true; this.ui.heroVisible(false); }
  enterSpot(s) {
    sfx('click');
    if (s.kind === 'shop') this.redraw = () => this.drawShop(s.id);
    else if (s.kind === 'bank') {
      if (!this.done.has('bank')) { this.done.add('bank'); this.money += 600; sfx('gold'); this.ui.float('+¥600', s.x, 0.7, s.z, 'loot'); }
      this.redraw = () => this.drawBank();
    } else if (s.kind === 'gym') this.redraw = () => this.drawGym();
    else if (s.kind === 'home') this.redraw = () => this.drawHome();
    else if (s.kind === 'npc') this.redraw = () => this.talk(s);
    if (this.redraw) this.redraw();
  }
  drawShop(kind) {
    const T = SHOPS[kind];
    const lim = T.limit && !this.meta.space ? T.limit - this.gasBought : Infinity;
    const tiles = T.items.map(([k, p]) => {
      const isW = !!WEAPONS[k];
      const own = isW ? (this.weapons.has(k) ? '✓' : '') : (this.stash[k] || '');
      return { icon: k, cost: '¥' + p, badge: own, disabled: (isW && this.weapons.has(k)) || this.money < p || lim <= 0, act: (shift) => this.buy(kind, k, p, isW ? 1 : shift ? (this.meta.space ? 50 : 5) : 1) };
    });
    if (this.meta.space) tiles.push({ icon: 'sweep', cost: '搬空', hot: true, act: () => this.sweep(kind) });
    this.ui.card({ icon: SPOT_ICON[kind], title: T.t, sub: lim < Infinity ? `${lim}/${T.limit}` : '', tiles });
  }
  buy(kind, k, p, n) {
    const T = SHOPS[kind];
    if (T.limit && !this.meta.space) n = Math.min(n, T.limit - this.gasBought);
    n = Math.min(n, Math.floor(this.money / p));
    if (!WEAPONS[k]) n = Math.min(n, this.cap - this.count(this.stash));
    if (n <= 0) { this.toast(this.money < p ? '钱不够' : '放不下了', true, this.money < p ? 'money' : 'house'); return; }
    this.money -= p * n; if (k === 'gas') this.gasBought += n; this.give(k, n); sfx('coin');
    const P = this.sim.player; this.ui.float(`+${n}`, P.x, 0.55, P.z, 'loot');
    this.prepStarted = true;
    if (this.redraw) this.redraw();
  }
  sweep(kind) { // the reborn power fantasy: empty the shelves
    let spent = 0;
    for (const [k, p] of SHOPS[kind].items) {
      if (WEAPONS[k]) { if (!this.weapons.has(k) && this.money >= p) { this.money -= p; this.give(k, 1); } continue; }
      const n = Math.min(k === 'medkit' ? 6 : 60, Math.floor(this.money / p)); if (n > 0) { this.money -= n * p; this.give(k, n); spent += n; }
    }
    sfx('gold'); const P = this.sim.player; this.ui.float(`+${spent}`, P.x, 0.6, P.z, 'loot');
    if (this.redraw) this.redraw();
  }
  drawBank() {
    const tiles = [{ icon: 'money', cost: '+¥600', badge: '✓', disabled: true }];
    if (this.knows('moneyless')) tiles.push({ icon: 'loan', cost: '+¥4000', hot: true, disabled: this.done.has('loan'), badge: this.done.has('loan') ? '✓' : '', act: () => { this.done.add('loan'); this.money += 4000; sfx('gold'); this.spend(1); this.redraw(); } });
    this.ui.card({ icon: 'bank', title: '临江银行', tiles });
  }
  drawGym() {
    const max = this.meta.fight >= 3;
    this.ui.card({ icon: 'gym', title: '拳馆', sub: `Lv ${this.meta.fight}/3`, tiles: [{ icon: 'fist', cost: '6h', badge: '+15%', disabled: max || this.hours < 6, act: () => { this.meta.fight++; saveMeta(this.meta); this.spend(6); sfx('hit'); this.toast(`Lv ${this.meta.fight}`, false, 'fist'); this.redraw(); } }] });
  }
  drawHome() {
    const tiles = [
      { icon: 'shield', cost: '¥180 · 4h', badge: this.done.has('door') ? '✓' : '', disabled: this.done.has('door') || this.money < 180 || this.hours < 4, act: () => { this.done.add('door'); this.money -= 180; this.doorMax += 80; this.sim.door.max = this.sim.door.hp = this.doorMax; this.spend(4); sfx('place'); this.redraw(); } },
      { icon: 'barricade', cost: `${ic('wood')}4 ${ic('nails')}2`, badge: this.preBuilt ? '✓' : '', disabled: this.preBuilt || !this.has('wood', 4) || !this.has('nails', 2), act: () => { this.take('wood', 4); this.take('nails', 2); this.preBuilt = true; for (const k in this.sim.bars) this.sim.bars[k].hp = this.sim.bars[k].max; this.spend(2); sfx('thud'); this.redraw(); } },
      { icon: 'craft', cost: '制作', act: () => this.ui.craft(true, this) },
      { icon: 'moon', cost: '等末日', hot: true, act: () => this.confirmApocalypse() },
    ];
    this.ui.card({ icon: 'house', title: '幸福里 7 栋', sub: `${this.count(this.stash)}/${this.meta.space ? '∞' : this.cap}`, tiles });
  }
  talk(s) {
    const R = RUMORS[s.rumor];
    if (!this.done.has('talk_' + s.id)) { this.done.add('talk_' + s.id); this.spend(1); if (R.k) this.learn(R.k, true); }
    this.ui.card({ icon: s.id === 'radio' ? 'radio' : 'chat', title: R.who, quote: R.s, tiles: R.k ? [{ icon: 'book', cost: '记下了', disabled: true }] : [] });
  }
  confirmApocalypse() {
    if (this.phase !== 'prep') return;
    if (this.hours > 0) {
      this.ui.modal(`<div class="ask">${ic('moon', 'xl')}<h2>还剩 ${Math.ceil(this.hours)} 小时</h2></div><div class="row"><button class="btn ghost" data-close>${ic('run')} 再准备</button><button class="btn accent" id="goApoc">${ic('moon')} 等待末日</button></div>`, (el) => { el.querySelector('#goApoc').onclick = () => { this.ui.closeModal(); this.beginApocalypse(); }; }, true);
    } else this.beginApocalypse();
  }

  // ------------------------------------------------ the end of the world
  beginApocalypse() {
    if (this.phase !== 'prep') return;
    this.phase = 'cine'; this.combat = false;
    this.ui.card(null); this.spotCur = null; this.ui.craft(false); this.ui.closeModal(true); this.ui.heroVisible(false);
    this.ui.banner('第 0 天 · 18:00', '末日降临', '广播里的声音停了。', 3200);
    sfx('alarm'); sfx('bell');
    this.setCTA('', null);
    const t0 = performance.now();
    this.cine = (dt) => {
      const t = (performance.now() - t0) / 1000;
      this.apoc = clamp(t / 3, 0, 1); this.hour = 18.3 + t * 0.25; this.world.setDecay(this.apoc);
      this.ui.setTint(this.apoc * 0.35);
      if (t > 1.2 && !this._turned) { this._turned = true; this.sim.turnCivilians(); }
      if (t > 4.5) { this._turned = false; this.cine = null; this.startNight(1); }
    };
  }
  startNight(n) {
    if (n === 2 && this.phase !== 'summary') return;
    this.night = n; this.phase = n === 2 ? 'boss' : 'night'; this.combat = true;
    this.clockStart = 19; this.clockEnd = 29; this.dur = n === 2 ? 140 : 110; this.t = 0;
    this.hour = 19; this.apoc = 1;
    this.sim.showCrates(false);
    this.sim.door.hp = Math.min(this.sim.door.max, this.sim.door.hp + 40);
    if (n === 1 && this.preBuilt) for (const k in this.sim.bars) this.sim.bars[k].hp = this.sim.bars[k].max;
    Object.assign(this.sim.player, { x: this.world.home.x, z: this.world.home.z, down: 0, hp: this.sim.player.maxHp });
    this.R.controls.mouseButtons = { LEFT: null, MIDDLE: 1, RIGHT: 0 };
    this.ui.hud(true); ambience('night');
    const eastHeavy = n === 1;
    const total = n === 1 ? 22 : 22;
    this.schedule = [];
    for (let i = 0; i < total; i++) {
      const r = Math.random();
      const side = eastHeavy ? (r < 0.55 ? 'E' : r < 0.85 ? 'N' : 'W') : (r < 0.4 ? 'E' : r < 0.7 ? 'N' : 'W');
      this.schedule.push({ t: 4 + i * (n === 1 ? 3.6 : 4.2) + Math.random() * 1.5, side, kind: Math.random() < (n === 1 ? 0.08 : 0.2) ? 'runner' : 'walker' });
    }
    if (n === 2) this.schedule.push({ t: 14, boss: true });
    this.schedule.sort((a, b) => a.t - b.t);
    this.ui.banner(n === 1 ? '第一夜' : '第二夜', n === 1 ? '守住安全屋' : '它来了', n === 1 ? `${kE()}${ic('barricade')} · ${ic('wood')}2 ${ic('nails')}1` : (this.meta.round > 1 ? '它怕火。' : ''), 3200);
    this.clockLab = n === 1 ? '第一夜' : '第二夜';
    this.setCTA('', null);
    this.ui.dock(n === 1 ? '守家 · 第一夜' : '守家 · 第二夜', `第 ${this.meta.round} 轮`);
  }
  endNight() {
    this.combat = false; this.phase = 'summary';
    for (const a of this.sim.agents) if (!a.dead) { a.burn = 1; a.dead = 0.001; }
    this.sim.player.down = 0;
    const res = this.consume();
    this.stats.morale = clamp(this.stats.morale + 10, 0, 100);
    ambience('day');
    this.ui.modal(`<div class="eyebrow">第 ${this.night} 夜 · 05:00</div><h2>天亮了</h2>
      <div class="stat-grid"><div>${ic('skull')}<b>${this.killCount}</b></div><div>${ic('house')}<b>${Math.round(this.sim.door.hp)}</b></div><div>${ic('bag')}<b>${this.count(this.stash)}</b></div></div>
      ${res}
      <div class="row"><button class="btn ghost" id="mCraft">${ic('craft')} 制作</button><button class="btn accent" data-close id="goDay">${ic('run')} 出门摸金</button></div>`, (el) => {
      el.querySelector('#mCraft').onclick = () => { this.ui.closeModal(true); this.ui.craft(true, this); this.setCTA('run', () => { this.ui.craft(false); this.startDay(); }); };
    });
    this.ui.onModalClose = () => this.startDay();
    this.setCTA('run', () => { this.ui.closeModal(true); this.ui.craft(false); this.startDay(); });
  }
  consume() {
    const out = [];
    for (const k of ['food', 'water']) {
      if (this.take(k, 1)) { this.stats[k] = clamp(this.stats[k] + 35, 0, 100); out.push(`<span>${ic(k)}<b>−1</b></span>`); }
      else { this.stats[k] = clamp(this.stats[k] - 45, 0, 100); out.push(`<span class="bad">${ic(k)}<b>✕</b></span>`); this.stats.morale = clamp(this.stats.morale - 10, 0, 100); }
    }
    return `<div class="eat">${out.join('')}</div>`;
  }
  startDay() {
    if (this.phase !== 'summary') return;
    this.phase = 'day'; this.combat = true; this.t = 0; this.dur = 150; this.clockStart = 6; this.clockEnd = 17.5;
    this.bag = {}; this.leftHome = false; this.dayLoot = 0;
    this.sim.agents = this.sim.agents.filter(a => !a.dead || a.dead < 2.6);
    { // most of last night's roamers have drifted off: keep a dozen, the city is quieter by day
      const H0 = this.world.home; const left = this.sim.agents.filter(a => !a.dead && a.kind !== 'civ').sort(() => Math.random() - 0.5);
      const keep = new Set(left.filter(a => Math.hypot(a.x - H0.x, a.z - H0.z) > 6).slice(0, 12));
      this.sim.agents = this.sim.agents.filter(a => a.dead || a.kind === 'civ' || keep.has(a));
    }
    this.sim.showCrates(true);
    const H = this.world.home;
    Object.assign(this.sim.player, { x: H.x, z: H.z, down: 0, hp: this.sim.player.maxHp });
    // wanderers spread over the whole city, none right outside the gate
    for (const [x, z] of this.world.wander.filter(([x, z]) => Math.hypot(x - H.x, z - H.z) >= 4.5).sort(() => Math.random() - 0.5).slice(0, 26)) this.sim.agents.push(this.sim.makeAgent('walker', x, z));
    this.ui.banner('第 1 天 · 06:00', '出门摸金', `${kE()}${ic('bag')} · 天黑前${ic('house')}`, 2800);
    this.clockLab = '摸金';
    this.setCTA('', null);
    this.ui.dock('摸金 · 白天', `第 ${this.meta.round} 轮`);
    ambience('day');
  }
  // why: false = walked in the door · 'dusk' = the day ran out · 'down' = dragged home after falling outside
  extract(why = false, lost = null) {
    if (this.phase !== 'day') return;
    this.combat = false; this.phase = 'summary';
    const lines = [];
    for (const k in this.bag) { const n = this.bag[k]; if (n > 0) { this.stash[k] = (this.stash[k] || 0) + n; lines.push(`<span>${ic(k)}<b>${n}</b></span>`); } }
    this.bag = {};
    const lostLines = lost ? Object.entries(lost).filter(([, n]) => n > 0).map(([k, n]) => `<span class="bad">${ic(k)}<b>−${n}</b></span>`) : [];
    for (const a of this.sim.agents) if (!a.dead) { a.dead = 0.001; }
    this.sim.showCrates(false);
    const res = this.consume();
    const h = why === 'dusk' ? 17.5 : this.hour, hhmm = fmtClock(h);
    const eyebrow = why === 'down' ? '你倒在了外面' : why === 'dusk' ? '天黑前赶回来了' : '撤离成功';
    const head = why === 'down' ? (lostLines.length ? '背包丢了' : '被人拖了回来') : lines.length ? '带回' : (this.meta.space ? '都在随身空间里' : '空手而归');
    this.ui.modal(`<div class="eyebrow">${eyebrow} · ${hhmm}</div><h2>${head}</h2>
      ${lines.length ? `<div class="eat">${lines.join('')}</div>` : ''}${lostLines.length ? `<div class="eat">${lostLines.join('')}</div>` : ''}${res}
      <div class="row"><button class="btn ghost" id="mCraft">${ic('craft')} 制作</button><button class="btn accent" data-close>${ic('moon')} 第二夜</button></div>`, (el) => { el.querySelector('#mCraft').onclick = () => { this.ui.closeModal(true); this.ui.craft(true, this); this.setCTA('moon', () => { this.ui.craft(false); this.startNight(2); }); }; });
    this.ui.onModalClose = () => { this.ui.craft(false); this.startNight(2); };
    this.setCTA('moon', () => { this.ui.closeModal(true); this.ui.craft(false); this.startNight(2); });
  }
  onLoot(s) {
    sfx(s.kind === 'gold' ? 'gold' : 'loot');
    const got = [];
    for (const [k, a, b] of s.table) {
      const n = a + Math.floor(Math.random() * (b - a + 1));
      if (k === 'axe') { this.ownWeapon('axe'); got.push('消防斧·金'); continue; }
      const ok = this.give(k, n, true); if (ok !== false) got.push(`${ITEMS[k].n}×${n}`);
    }
    this.dayLoot++;
    this.ui.float(got.join(' '), s.x, 0.6, s.z, 'loot');
    if (s.kind === 'barrel') this.learn('gas');
    if (s.kind === 'gold') { this.learn('manhole'); this.stats.morale = clamp(this.stats.morale + 15, 0, 100); }
  }
  onPlayerDown() {
    const P = this.sim.player;
    if (this.phase === 'boss' && this.meta.round === 1) { this.rebirth(); return; }
    if (this.phase === 'day') {
      const lost = { ...this.bag }; this.bag = {};
      this.toast('你倒在了外面', true, 'skull');
      setTimeout(() => { if (this.phase === 'day') { this.leftHome = true; this.extract('down', lost); } }, 2200);
      return;
    }
    this.toast('4 秒后醒来', true, 'skull');
    setTimeout(() => { if (this.combat && P.down > 0) { Object.assign(P, { x: this.world.home.x, z: this.world.home.z - 0.1, down: 0, hp: P.maxHp * 0.6, inv: 2 }); } }, 4000);
  }
  onDoorBroken() {
    if (!this.combat || this.phase === 'rebirth') return;
    if (this.phase === 'boss' && this.meta.round === 1) { this.rebirth(); return; }
    this.combat = false; this.phase = 'fail';
    sfx('break');
    this.ui.modal(`<div class="ask">${ic('house', 'xl')}<div class="eyebrow">安全屋失守</div><h2>门被撞开了</h2></div>
      <div class="stat-grid"><div>${ic('skull')}<b>${this.killCount}</b></div><div>${ic('moon')}<b>${this.night}</b></div><div>${ic('book')}<b>${this.meta.know.length}</b></div></div>
      <p class="fine">本轮从头开始 · 记得的东西还在</p>
      <div class="row"><button class="btn accent" data-close>${ic('clock')} 重来本轮</button></div>`);
    this.ui.onModalClose = () => this.startRound();
  }
  onBossDead() {
    this.combat = false; this.phase = 'win';
    this.timeScale = 0.3; this.ui.bossBar(false); sfx('win');
    setTimeout(() => { this.timeScale = 1; }, 1600);
    this.meta.wins++; saveMeta(this.meta);
    setTimeout(() => {
      this.ui.modal(`<div class="ask">${ic('skull', 'xl')}<div class="eyebrow">第 ${this.meta.round} 轮 · 完成</div><h2>屠夫倒下了</h2></div>
        <div class="stat-grid"><div>${ic('skull')}<b>${this.killCount}</b></div><div>${ic('heart')}<b>${this.meta.deaths}</b></div><div>${ic('book')}<b>${this.meta.know.length}</b></div></div>
        <div class="eat"><span>${ic('key')}<b>LJ-BIO · 实验体 07</b></span></div>
        <p class="fine">后颈上的编号指向临江生物研究所 · 原型到此为止</p>
        <div class="row"><button class="btn ghost" id="wipe">${ic('sweep')} 清除记忆</button><button class="btn accent" data-close>${ic('run')} 再打一次</button></div>`, (el) => {
        el.querySelector('#wipe').onclick = () => { this.wipe(); };
      });
      this.ui.onModalClose = () => this.startRound();
    }, 2600);
  }
  wipe() { try { localStorage.removeItem(META_KEY); } catch { } location.reload(); }

  // ------------------------------------------------ the twist
  rebirth() {
    if (this.phase === 'rebirth') return;
    this.phase = 'rebirth'; this.combat = false;
    this.meta.deaths++;
    this.timeScale = 0.15;
    this.ui.bossBar(false); this.ui.craft(false);
    ticking(true, 1);
    const rb = this.ui.rebirthEls();
    const lines = ['屠夫的刀落下来的那一刻——', '你的手，按在了它背后那颗跳动的肉瘤上。', '有什么东西，顺着掌心钻进了你的身体。', '重　生', `第 ${this.meta.round + 1} 轮 · 末日前 48 小时`];
    const T0 = performance.now();
    let step = 0;
    this.cine = () => {
      const t = (performance.now() - T0) / 1000;
      this.R.post.uRed.value = clamp(t / 2, 0, 0.85) * (t < 11 ? 1 : Math.max(0, 1 - (t - 11)));
      this.R.post.uDesat.value = clamp(t / 3, 0, 0.6) * (t < 11 ? 1 : Math.max(0, 1 - (t - 11)));
      if (t > 1.2 && step === 0) { step = 1; this.ui.rebirthOn(true); }
      if (t > 1.8 && step === 1) { step = 2; rb.line(0, lines[0]); }
      if (t > 3.6 && step === 2) { step = 3; rb.line(1, lines[1]); }
      if (t > 5.4 && step === 3) { step = 4; rb.line(2, lines[2]); }
      if (t > 7.2 && step === 4) { step = 5; rb.watch(true); ticking(true, 6); this.timeScale = 0; sfx('bell'); }
      if (t > 7.2) { // time runs backwards
        const k = clamp((t - 7.2) / 4, 0, 1);
        this.R.post.uWarp.value = Math.sin(k * Math.PI) * 1.0;
        this.hour = 29 - k * 19; this.apoc = 1 - k; this.world.setDecay(1 - k); this.ui.setTint(0.35 * (1 - k));
      }
      if (t > 8.6 && step === 5) { step = 6; rb.line(3, lines[3]); }
      if (t > 10.0 && step === 6) { step = 7; rb.line(4, lines[4]); }
      if (t > 12.6 && step === 7) {
        step = 8; ticking(false); this.cine = null; this.timeScale = 1;
        this.R.post.uWarp.value = 0; this.R.post.uRed.value = 0; this.R.post.uDesat.value = 0;
        this.ui.rebirthOn(false); rb.clear();
        // the reward: what a death buys you
        this.meta.round++; this.meta.space = true;
        const fresh = [];
        for (const k of ['butcher_fire', 'butcher_tumor', 'butcher_night', 'moneyless', 'east']) if (this.learn(k, true)) fresh.push(k);
        for (const b of ['molotov', 'firetrap']) if (!this.meta.bps.includes(b)) this.meta.bps.push(b);
        saveMeta(this.meta);
        this.startRound();
        this.ui.modal(`<div class="ask">${ic('clock', 'xl')}<div class="eyebrow">前世的记忆</div><h2>回到 48 小时前</h2></div>
          <div class="gain"><span class="src">能力</span>${ic('bag')}<b>随身空间</b><i>无上限 · 死了不丢</i></div>
          <div class="gain"><span class="src">蓝图</span>${ic('molotov')}<b>燃烧瓶</b>${ic('firetrap')}<b>汽油陷阱</b><i>C</i></div>
          ${fresh.map(k => `<div class="gain"><span class="src">${KNOW[k].cat === 'boss' ? 'BOSS' : '情报'}</span>${ic(KNOW[k].cat === 'boss' ? 'skull' : 'book')}<b>${KNOW[k].t}</b></div>`).join('')}
          <div class="row"><button class="btn accent" data-close>${ic('run')} 这一次，我早就知道</button></div>`);
      }
    };
  }

  // ------------------------------------------------ per-frame
  update(dtReal, input) {
    if (this.hitstopT > 0) { this.hitstopT -= dtReal; dtReal *= 0.08; }
    const dt = dtReal * this.timeScale;
    if (this.cine) this.cine(dtReal);
    const G = this;
    // clock
    if ((this.phase === 'night' || this.phase === 'boss' || this.phase === 'day') && this.combat) {
      this.t += dt;
      let k = this.t / this.dur;
      if (this.phase === 'boss' && this.sim.boss && !this.sim.boss.dead) k = Math.min(k, 0.98);
      this.hour = this.clockStart + (this.clockEnd - this.clockStart) * clamp(k, 0, 1);
      while (this.schedule && this.schedule.length && this.schedule[0].t <= this.t && this.phase !== 'day') {
        const s = this.schedule.shift();
        if (s.boss) { this.sim.spawnBoss(this.meta.round > 1); this.ui.bossBar(true); this.ui.banner('子时', '屠　夫', this.meta.round > 1 ? '前世杀死你的东西。它怕火。' : '它比所有东西都大。', 3000); }
        else this.sim.spawnZombie(s.side, s.kind);
      }
      if (this.phase === 'day') {
        if (!this.world.inCompound(this.sim.player.x, this.sim.player.z)) this.leftHome = true;
        const P = this.sim.player, d = Math.hypot(P.x - this.world.door.x, P.z - (this.world.door.z + 0.2));
        if (this.leftHome && d < 0.65 && P.down <= 0) this.extract(false);
        if (k >= 1) {
          if (this.world.inCompound(P.x, P.z)) this.extract('dusk');
          else { const lost = { ...this.bag }; this.bag = {}; this.toast('尸潮涌上街道', true); this.extract('dusk', lost); }
        }
        if (this.t > 6 && Math.random() < dt * 0.3 && this.sim.activeZombies() < 40) { // shamblers crawl up near you, never on top of you
          const c = this.world.lamps.filter(l => { const d = Math.hypot(l[0] - P.x, l[2] - P.z); return d > 7 && d < 11; });
          if (c.length) { const l = c[Math.floor(Math.random() * c.length)]; const a = this.sim.makeAgent(Math.random() < 0.15 ? 'runner' : 'walker', l[0], l[2]); a.rise = 0; a.y = -0.45; this.sim.agents.push(a); }
        }
      } else if (k >= 1 && this.phase === 'night') this.endNight();
      else if (k >= 1 && this.phase === 'boss' && (!this.sim.boss || this.sim.boss.dead)) { /* won */ }
      if (this.phase === 'boss' && this.sim.boss && this.meta.round === 1 && this.t > 110 && !this.sim.boss.dead) this.sim.boss.enrage += dt * 4;
    }
    if (this.sim.boss && this.sim.boss.state === 'chargeprep' && this.sim.boss.st < 0.05) this.learn('butcher_charge');
    // prep: the clock only runs once you start moving; walking is what costs time now
    if (this.phase === 'prep') {
      if (!this.prepStarted && Math.hypot(input.mx, input.mz) > 0.1) { this.prepStarted = true; this.ui.heroVisible(false); }
      if (this.prepStarted && !this.ui.modalOpen) this.hours = Math.max(0, this.hours - dt * 0.2);
      if (this.hours <= 3 && !this.warned) { this.warned = true; this.toast('3h · 回家', true, 'clock'); sfx('alarm'); }
      this.hour = 10 + (48 - this.hours) / 48 * 8.3;
      if (this.hours <= 0) this.beginApocalypse();
    }
    this.updateSpots();
    // survival drift in the field
    const tod = this.R.setTimeOfDay(this.hour, this.apoc);
    this.world.glowMat.color.setScalar(0.25 + tod.night * 1.6);
    // the four real point lights jump to the street lamps nearest the camera focus
    const F = this.R.focus, lamps = this.world.lamps;
    if (!this._lampT || performance.now() - this._lampT > 250) { this._lampT = performance.now(); this._near = lamps.map((l, i) => [Math.hypot(l[0] - F.x, l[2] - F.z), i]).sort((a, b) => a[0] - b[0]).slice(0, 4).map(a => lamps[a[1]]); }
    this.R.pointLights.forEach((p, i) => { const L = this._near[i]; p.position.set(L[0], L[1], L[2]); p.intensity = tod.night * 3.2 * (this.apoc > 0.5 && i === 3 ? (0.6 + 0.4 * Math.sin(performance.now() * 0.02) ** 2) : 1); });
    { const P = this.sim.player, L = this.R.playerLight; L.position.set(P.x - 0.25, 1.5, P.z + 0.35); L.intensity = tod.night * (this.combat ? 3.4 : 2.2); }
    const fires = this.sim.fires;
    if (fires.length) { const f = fires[fires.length - 1]; this.R.fireLight.position.set(f.x, 0.5, f.z); this.R.fireLight.intensity = 6 * clamp(f.life, 0, 1); } else this.R.fireLight.intensity = 0;
    this.sim.update(dt, input, G);
    this.ui.frame(this, input);
  }

  setCTA(label, fn) { this.ui.cta(label, fn); }
  toast(t, bad, icon) { this.ui.toast(t, bad, icon); }

  // debug helpers
  debug() {
    return {
      hours: (h) => { this.hours = h; },
      skip: () => { if (this.phase === 'prep') this.beginApocalypse(); else if (this.phase === 'night' || this.phase === 'boss' || this.phase === 'day') this.t = this.dur; },
      kill: () => { this.sim.player.hp = 1; this.sim.hurtPlayer(99, this.sim.player.x + 0.1, this.sim.player.z); },
      give: (k, n = 10) => this.give(k, n),
      boss: () => { this.sim.spawnBoss(this.meta.round > 1); this.ui.bossBar(true); },
      bossHp: (v) => { if (this.sim.boss) this.sim.boss.hp = v; },
    };
  }
}
Game.KNOW = KNOW;
