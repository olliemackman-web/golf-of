// Player profiles, coins and upgrades, stored in localStorage.
const KEY = 'riverbend-profiles-v1';

export const UPGRADES = [
  { id: 'power', name: 'Driver & woods', desc: '+10% clubhead speed per level — longer drives', max: 5 },
  { id: 'irons', name: 'Irons & wedges', desc: '+10% clubhead speed per level', max: 5 },
  { id: 'forgive', name: 'Forgiveness', desc: 'Wider accuracy window and tamer hooks & slices', max: 5 },
  { id: 'putting', name: 'Putting', desc: 'The cup catches faster putts, steadier stroke', max: 5 },
  { id: 'spin', name: 'Spin control', desc: 'Stronger draw, fade, backspin and topspin', max: 5 },
];
export const COSTS = [10, 20, 35, 55, 80];
export function upgradeCost(level) { return level >= COSTS.length ? null : COSTS[level]; }

/** Coins for a hole: strokes relative to par. */
export function coinsFor(strokes, par) {
  if (strokes === 1) return 50;
  const d = strokes - par;
  if (d <= -3) return 40; if (d === -2) return 25; if (d === -1) return 10; if (d === 0) return 5; if (d === 1) return 3; if (d === 2) return 2; return 1;
}

function blankUpgrades() { const u = {}; for (const g of UPGRADES) u[g.id] = 0; return u; }

/** Coupon codes for the pro shop: code -> apply(profile) returning the message shown. */
const COUPONS = {
  1210: (p) => { for (const g of UPGRADES) p.upgrades[g.id] = g.max; return 'Coupon accepted: every upgrade maxed out.'; },
};

export class ProfileStore {
  constructor() { this.data = this.load(); }
  load() {
    try { const raw = localStorage.getItem(KEY); if (raw) { const d = JSON.parse(raw); if (d && d.profiles) return d; } } catch (e) { /* private mode etc. */ }
    return { current: null, profiles: {} };
  }
  save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.data));
      this.storageOk = localStorage.getItem(KEY) != null;
      // ask the browser to keep this site's storage rather than evicting it under pressure
      if (!this.persistAsked && typeof navigator !== 'undefined' && navigator.storage && navigator.storage.persist) { this.persistAsked = true; navigator.storage.persist().catch(() => {}); }
    } catch (e) { this.storageOk = false; }
  }

  /**
   * A player as a short code that can be pasted into the game on another phone or link:
   * name, coins, upgrades, bests, rounds. Players are otherwise saved per browser and per site
   * address, so a different link or a cleared browser starts empty.
   */
  exportCode(p) {
    const u = UPGRADES.map((g) => p.upgrades[g.id] || 0);
    const payload = { n: p.name, c: p.coins, u, b: p.best || {}, r: p.rounds || 0, h: p.holes || 0, t: p.totalCoins || 0, k: Object.keys(p.coupons || {}) };
    const json = JSON.stringify(payload);
    const b64 = btoa(unescape(encodeURIComponent(json)));
    return 'RB1.' + b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  static isCode(s) { return /^RB1\.[A-Za-z0-9_-]+$/.test(String(s || '').trim()); }
  /** Restore a player from a code; merges into an existing player of the same name, keeping the better of each. */
  importCode(s) {
    try {
      let b64 = String(s).trim().slice(4).replace(/-/g, '+').replace(/_/g, '/');
      while (b64.length % 4) b64 += '=';
      const json = decodeURIComponent(escape(atob(b64)));
      const d = JSON.parse(json);
      const name = String(d.n || '').trim().slice(0, 18); if (!name) return null;
      const p = this.data.profiles[name] || this.create(name);
      p.coins = Math.max(p.coins || 0, d.c | 0);
      UPGRADES.forEach((g, i) => { p.upgrades[g.id] = Math.min(g.max, Math.max(p.upgrades[g.id] || 0, (d.u && d.u[i]) | 0)); });
      for (const [cid, b] of Object.entries(d.b || {})) { p.best = p.best || {}; if (!p.best[cid] || b.strokes < p.best[cid].strokes) p.best[cid] = { strokes: b.strokes | 0, toPar: b.toPar | 0 }; }
      p.rounds = Math.max(p.rounds || 0, d.r | 0); p.holes = Math.max(p.holes || 0, d.h | 0); p.totalCoins = Math.max(p.totalCoins || 0, d.t | 0);
      for (const k of d.k || []) { p.coupons = p.coupons || {}; p.coupons[k] = p.coupons[k] || Date.now(); }
      p.lastPlayed = Date.now(); this.save();
      return p;
    } catch (e) { return null; }
  }
  list() { return Object.values(this.data.profiles).sort((a, b) => (b.lastPlayed || 0) - (a.lastPlayed || 0)); }
  get(name) { return this.data.profiles[name] || null; }
  create(name) {
    name = String(name || '').trim().slice(0, 18);
    if (!name) return null;
    if (this.data.profiles[name]) return this.data.profiles[name];
    const p = { name, coins: 0, upgrades: blankUpgrades(), bestRound: null, bestToPar: null, rounds: 0, holes: 0, totalCoins: 0, created: Date.now(), lastPlayed: Date.now() };
    this.data.profiles[name] = p; this.save();
    return p;
  }
  select(name) { const p = this.get(name); if (p) { this.data.current = name; p.lastPlayed = Date.now(); for (const g of UPGRADES) if (p.upgrades[g.id] == null) p.upgrades[g.id] = 0; this.save(); } return p; }
  remove(name) { delete this.data.profiles[name]; if (this.data.current === name) this.data.current = null; this.save(); }
  current() { return this.data.current ? this.get(this.data.current) : null; }
  addCoins(p, n) { p.coins += n; p.totalCoins += n; p.holes += 1; p.lastPlayed = Date.now(); this.save(); }
  buy(p, id) {
    const lvl = p.upgrades[id] || 0, cost = upgradeCost(lvl);
    if (cost == null || p.coins < cost) return false;
    p.coins -= cost; p.upgrades[id] = lvl + 1; this.save(); return true;
  }
  /** Pro-shop coupon. Returns a message for the player; null if the code is unknown. */
  redeem(p, code) {
    code = String(code || '').trim();
    const c = COUPONS[code];
    if (!c) return null;
    p.coupons = p.coupons || {};
    if (p.coupons[code]) return 'That code has already been used on this player.';
    const msg = c(p);
    p.coupons[code] = Date.now(); this.save();
    return msg;
  }
  finishRound(p, courseId, strokes, toPar) {
    p.rounds += 1;
    p.best = p.best || {};
    const b = p.best[courseId];
    if (!b || strokes < b.strokes) p.best[courseId] = { strokes, toPar };
    if (courseId === 'riverbend' && (p.bestRound == null || strokes < p.bestRound)) { p.bestRound = strokes; p.bestToPar = toPar; }
    this.save();
  }
  bestFor(p, courseId) { if (p.best && p.best[courseId]) return p.best[courseId]; if (courseId === 'riverbend' && p.bestRound != null) return { strokes: p.bestRound, toPar: p.bestToPar }; return null; }
}
