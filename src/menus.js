// Modal menus: profile picker, upgrade shop, spin pad. Plain DOM.
import { UPGRADES, upgradeCost } from './profile.js';
import { COURSES } from './courseData.js';
import { CONDITIONS } from './terrain.js';
import { coinHtml } from './hud.js';

const svg = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const ICON = {
  copy: svg('<rect x="8.5" y="8.5" width="11" height="11" rx="2"/><path d="M15.5 8.5V6.5a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2"/>'),
  del: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
};
export const CREST = '<svg class="crest" viewBox="0 0 48 48" fill="none" aria-hidden="true"><circle cx="24" cy="24" r="22.5" stroke="currentColor" stroke-opacity=".35" stroke-width="1.5"/><path d="M20 10v25" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><path d="M21 11l14 5.5L21 22z" fill="currentColor"/><path d="M10 35c5-3.5 9-3.5 14 0s9 3.5 14 0" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>';
const brand = (sub) => `<div class="brand">${CREST}<h1>Riverbend</h1><div class="sub">${sub}</div></div>`;
/** A stable hue per player name, for the monogram badge. */
const hueOf = (name) => { let h = 7; for (const ch of String(name)) h = (h * 31 + ch.codePointAt(0)) % 360; return h; };
const avatar = (name) => `<div class="avatar" style="--h:${hueOf(name)}">${esc([...String(name).trim()][0] || '?').toUpperCase()}</div>`;
const pips = (lvl, max) => `<span class="pips">${Array.from({ length: max }, (_, i) => `<i class="${i < lvl ? 'on' : ''}"></i>`).join('')}</span>`;
/** Little painted scene for each course card. */
const COURSE_ART = {
  riverbend: '<svg viewBox="0 0 92 120" preserveAspectRatio="xMidYMid slice"><rect width="92" height="120" fill="#7fb6e6"/><rect width="92" height="60" fill="#a9d3f2" opacity=".6"/><path d="M0 62c18-12 34-10 50-4s30 4 42-4v66H0z" fill="#3f7d3a"/><path d="M0 78c20-10 44-8 92 2v40H0z" fill="#5fa846"/><path d="M38 120c2-18 10-30 26-40l6 2c-10 12-12 24-10 38z" fill="#8fd060"/><ellipse cx="24" cy="98" rx="13" ry="5" fill="#4d9bd6"/><path d="M66 80V52" stroke="#fff" stroke-width="1.6"/><path d="M66.800 52.500l11 4-11 4z" fill="#ff5a43"/><circle cx="14" cy="60" r="9" fill="#2f6a2e"/><circle cx="82" cy="56" r="11" fill="#2f6a2e"/></svg>',
  gosfield: '<svg viewBox="0 0 92 120" preserveAspectRatio="xMidYMid slice"><rect width="92" height="120" fill="#f0c98a"/><rect width="92" height="46" fill="#f7dfae"/><circle cx="66" cy="34" r="12" fill="#fff3d0"/><path d="M0 58c14-8 30-8 46-3s32 3 46-3v68H0z" fill="#4a7a3e"/><path d="M0 74h92v46H0z" fill="#3d86c0"/><path d="M0 82h34M46 90h46M10 100h40M58 108h30" stroke="#bfe0f4" stroke-width="1.6" stroke-linecap="round" opacity=".7"/><path d="M0 74c16 6 30 6 44 0s30-6 48 0v-6H0z" fill="#6aa84c"/><path d="M26 70V44" stroke="#fff" stroke-width="1.6"/><path d="M26.800 44.500l11 4-11 4z" fill="#ff5a43"/></svg>',
  starfall: '<svg viewBox="0 0 92 120" preserveAspectRatio="xMidYMid slice"><rect width="92" height="120" fill="#0a0d24"/><circle cx="68" cy="30" r="15" fill="#3a66c8"/><path d="M68 15a15 15 0 0 1 0 30a22 15 0 0 0 0-30z" fill="#0a0d24" opacity=".45"/><ellipse cx="68" cy="30" rx="25" ry="5" fill="none" stroke="#9fb6ff" stroke-width="1.4" transform="rotate(-18 68 30)"/><g fill="#fff"><circle cx="12" cy="14" r="1"/><circle cx="30" cy="34" r=".8"/><circle cx="20" cy="56" r="1.1"/><circle cx="84" cy="62" r=".9"/><circle cx="46" cy="10" r=".7"/><circle cx="8" cy="88" r=".8"/><circle cx="80" cy="104" r="1"/></g><path d="M14 84h50l-8 20c-10 6-26 6-34 0z" fill="#4a3f38"/><ellipse cx="39" cy="84" rx="25" ry="7" fill="#5cc49a"/><path d="M46 84V60" stroke="#fff" stroke-width="1.6"/><path d="M46.800 60.500l11 4-11 4z" fill="#ff5a43"/></svg>',
};

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const courseName = (id) => { const c = COURSES.find((k) => k.id === id); return c ? c.name : id; };

export class Menus {
  constructor(game) { this.game = game; this.el = document.getElementById('modal'); this.open = null; this.el.addEventListener('pointerdown', (e) => e.stopPropagation()); }
  show(kind, html) { this.open = kind; this.el.innerHTML = `<div class="mpanel">${html}</div>`; this.el.classList.add('show'); }
  close() { this.open = null; this.el.classList.remove('show'); this.el.innerHTML = ''; }

  /** Profile picker. Renders into the given container (the title panel). */
  profilePicker(container, store, onPick) {
    const list = store.list();
    const card = (p) => {
      const bests = Object.entries(p.best || {}).map(([k, b]) => `${courseName(k)} ${b.strokes} (${fmtPar(b.toPar)})`);
      if (!bests.length && p.bestRound != null) bests.push(`Riverbend ${p.bestRound} (${fmtPar(p.bestToPar)})`);
      const best = bests.length ? 'Best ' + bests.join(' · ') : 'No round yet';
      const ups = UPGRADES.filter((u) => p.upgrades[u.id] > 0).map((u) => `<span class="pup" title="${esc(u.name)} ${p.upgrades[u.id]}/${u.max}">${esc(u.name.split(' ')[0])} ${pips(p.upgrades[u.id], u.max)}</span>`).join('');
      return `<div class="pcard" data-name="${esc(p.name)}">${avatar(p.name)}<div class="pmain"><div class="pname">${esc(p.name)}</div><div class="pmeta">${best} · ${p.rounds} round${p.rounds === 1 ? '' : 's'} · <b class="coin">${coinHtml(p.coins)}</b></div><div class="pups">${ups}</div></div><div class="pacts"><button class="btn small" data-play="${esc(p.name)}">PLAY</button><button class="pdel" title="Copy this player's code to move them to another phone or link" aria-label="Copy player code" data-code="${esc(p.name)}">${ICON.copy}</button><button class="pdel" title="Delete profile" aria-label="Delete player" data-del="${esc(p.name)}">${ICON.del}</button></div></div>`;
    };
    const warn = store.storageOk === false ? '<div class="pempty" style="color:#ffb15a;padding:0 6px 12px">This browser is not saving players (private mode or blocked storage). Use a player\'s copy button to keep their code.</div>' : '';
    container.innerHTML = `${brand('FIRST-PERSON GOLF · 54 HOLES')}<div class="phead">WHO'S PLAYING?</div>
      <div class="plist">${list.length ? list.map(card).join('') : '<div class="pempty" style="padding:6px">No players yet. Create one below.</div>'}</div>${warn}
      <div class="pnew"><input id="pname" maxlength="200" placeholder="New player name, or paste a player code" autocomplete="off"><button class="btn" id="pcreate">CREATE</button></div>
      <div class="pempty" id="pnote">Players are saved in this browser for this link. The copy button gives a player code you can paste here on another phone or link.</div>`;
    const input = container.querySelector('#pname');
    const create = () => {
      const v = input.value;
      const p = store.constructor.isCode(v) ? store.importCode(v) : store.create(v.slice(0, 18));
      if (!p) { input.focus(); container.querySelector('#pnote').textContent = store.constructor.isCode(v) ? 'That player code could not be read.' : 'Type a name first.'; return; }
      onPick(p);
    };
    container.querySelector('#pcreate').onclick = create;
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') create(); e.stopPropagation(); });
    input.addEventListener('keyup', (e) => e.stopPropagation());
    for (const b of container.querySelectorAll('[data-play]')) b.onclick = () => onPick(store.get(b.dataset.play));
    for (const b of container.querySelectorAll('[data-code]')) b.onclick = async () => {
      const code = store.exportCode(store.get(b.dataset.code)); const note = container.querySelector('#pnote');
      try { await navigator.clipboard.writeText(code); note.textContent = `Code for ${b.dataset.code} copied. Paste it into the name box on the other phone or link.`; }
      catch (e) { window.prompt(`Copy this player code for ${b.dataset.code}:`, code); }
    };
    for (const b of container.querySelectorAll('[data-del]')) b.onclick = () => { if (confirm(`Delete ${b.dataset.del}? Coins and upgrades will be lost.`)) { store.remove(b.dataset.del); this.profilePicker(container, store, onPick); } };
    if (!list.length) setTimeout(() => input.focus(), 50);
  }

  /**
   * Course chooser, rendered into the title panel after the player is picked. Each card carries the
   * course record and a top-three leaderboard across every player saved in this browser.
   */
  coursePicker(container, courses, profile, onPick, store = null) {
    const players = store ? store.list() : [profile];
    const cards = courses.map((c, i) => {
      const b = store_best(profile, c.id);
      const board = players.map((p) => ({ name: p.name, best: store ? store.bestFor(p, c.id) : store_best(p, c.id) })).filter((e) => e.best)
        .sort((x, y) => x.best.strokes - y.best.strokes || x.best.toPar - y.best.toPar || x.name.localeCompare(y.name));
      const rows = board.slice(0, 3).map((e, k) => `<span class="lbrow${e.name === profile.name ? ' me' : ''}"><i>${k + 1}</i>${esc(e.name)} <b>${e.best.strokes}</b> <small>${fmtPar(e.best.toPar)}</small></span>`).join('');
      const record = board.length ? `<div class="lbrec">RECORD <b>${esc(board[0].name)}</b> · ${board[0].best.strokes} (${fmtPar(board[0].best.toPar)})${board[0].name === profile.name ? ' · yours' : ''}</div>` : '<div class="lbrec dim">NO ROUNDS YET · SET THE RECORD</div>';
      const yours = b && board[0] && board[0].name !== profile.name ? ` · <b class="coin">your best ${b.strokes} (${fmtPar(b.toPar)})</b>` : '';
      return `<div class="pcard course"><div class="cart">${COURSE_ART[c.id] || ''}</div><div class="pmain"><div class="pname">${esc(c.name)}</div><div class="pmeta">18 holes · par ${c.par} · ${c.yards.toLocaleString()} yds${yours}</div><div class="pmeta">${esc(c.blurb)}</div>${record}<div class="lb">${rows}</div></div><button class="btn small" data-course="${i}">PLAY</button></div>`;
    }).join('');
    container.innerHTML = `${brand(`${esc(profile.name.toUpperCase())} · PICK A COURSE`)}<div class="conds" id="conds">${Object.entries(CONDITIONS).map(([k, c]) => `<button class="cond${k === this.game.conditions ? ' on' : ''}" data-cond="${k}" title="${esc(c.blurb)}"><i class="cdot ${k}"></i>${esc(c.name)}</button>`).join('')}</div><div class="plist">${cards}</div><div class="pempty" style="padding-top:0">Records count every player saved in this browser. Weather changes the look, not how the ball plays.</div><button class="link" id="pback">← CHANGE PLAYER</button>`;
    container.querySelector('#pback').onclick = () => this.game.showTitle();
    for (const b of container.querySelectorAll('[data-cond]')) b.onclick = () => { this.game.setConditions(b.dataset.cond); for (const o of container.querySelectorAll('[data-cond]')) o.classList.toggle('on', o === b); };
    for (const b of container.querySelectorAll('[data-course]')) b.onclick = () => onPick(parseInt(b.dataset.course, 10));
  }

  shop(store, profile, onChange, msg = '') {
    const rows = UPGRADES.map((u) => {
      const lvl = profile.upgrades[u.id] || 0, cost = upgradeCost(lvl);
      const btn = cost == null ? '<span class="maxed">MAXED</span>' : `<button class="btn small buy ${profile.coins < cost ? 'dim' : ''}" data-buy="${u.id}">${coinHtml(cost)}</button>`;
      return `<div class="srow"><div><div class="sname">${esc(u.name)} ${pips(lvl, u.max)}</div><div class="sdesc">${esc(u.desc)}</div></div>${btn}</div>`;
    }).join('');
    this.show('shop', `<div class="mhead"><div><div class="sub">PRO SHOP</div><div class="mtitle">Upgrades</div></div><div class="mcoins"><span>${coinHtml(profile.coins)}</span><small>coins</small></div></div>
      ${rows}
      <div class="srow coupon"><div class="pnew"><input id="coupon" placeholder="Coupon code" autocomplete="off" inputmode="numeric"><button class="btn small" id="redeem">REDEEM</button></div><div class="sdesc" id="couponMsg">${esc(msg || '')}</div></div>
      <div class="mfoot"><span class="sdesc">Coins per hole: ace 50 · eagle 25 · birdie 10 · par 5 · bogey 3 · double 2</span><button class="btn" id="mclose">DONE</button></div>`);
    this.el.querySelector('#mclose').onclick = () => this.close();
    for (const b of this.el.querySelectorAll('[data-buy]')) b.onclick = () => { if (store.buy(profile, b.dataset.buy)) { onChange(); this.shop(store, profile, onChange); } };
    const input = this.el.querySelector('#coupon');
    const redeem = () => {
      const r = store.redeem(profile, input.value);
      if (r == null) {
        const gr = this.game.redeemCode ? this.game.redeemCode(input.value) : null; // game-level codes (e.g. redo the hole)
        if (!gr) { this.el.querySelector('#couponMsg').textContent = 'Unknown code.'; input.select(); return; }
        if (gr.close) { this.close(); return; }
        this.el.querySelector('#couponMsg').textContent = gr.msg; return;
      }
      onChange(); this.shop(store, profile, onChange, r);
    };
    this.el.querySelector('#redeem').onclick = redeem;
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') redeem(); e.stopPropagation(); });
    input.addEventListener('keyup', (e) => e.stopPropagation());
  }

  /** Spin pad: drag inside the ball to set side (x) and back/top (y) spin, -1..1. */
  spinPad(spin, onChange) {
    this.show('spin', `<div class="mhead"><div><div class="sub">SHOT SHAPE</div><div class="mtitle">Ball spin</div></div><div id="spinlabel"></div></div>
      <div class="spad" id="spad"><div class="sball"><div class="sdot" id="sdot"></div></div><span class="stag t">BACK</span><span class="stag b">TOP</span><span class="stag l">DRAW</span><span class="stag r">FADE</span></div>
      <div class="spre"><button data-spin="0,0.9">BACKSPIN</button><button data-spin="0,-0.9">TOPSPIN</button><button data-spin="-0.9,0">DRAW</button><button data-spin="0.9,0">FADE</button><button data-spin="0,0">NONE</button></div>
      <div class="mfoot"><span class="sdesc">Backspin sits where it lands, topspin runs on. Shown on the aim line; resets after each shot.</span><button class="btn" id="mclose">DONE</button></div>`);
    const pad = this.el.querySelector('#spad'), dot = this.el.querySelector('#sdot'), label = this.el.querySelector('#spinlabel');
    const R = 70;
    const paint = () => { dot.style.left = `${50 + spin.x * 40}%`; dot.style.top = `${50 - spin.y * 40}%`; label.textContent = describeSpin(spin); onChange(); };
    const set = (e) => { const r = pad.getBoundingClientRect(); let x = ((e.clientX - r.left) / r.width - 0.5) * 2.5, y = -((e.clientY - r.top) / r.height - 0.5) * 2.5; const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; } if (l < 0.12) { x = 0; y = 0; } spin.x = Math.round(x * 20) / 20; spin.y = Math.round(y * 20) / 20; paint(); };
    let down = false;
    pad.addEventListener('pointerdown', (e) => { down = true; pad.setPointerCapture(e.pointerId); set(e); });
    pad.addEventListener('pointermove', (e) => { if (down) set(e); });
    pad.addEventListener('pointerup', () => { down = false; });
    for (const b of this.el.querySelectorAll('[data-spin]')) b.onclick = () => { const [x, y] = b.dataset.spin.split(',').map(Number); spin.x = x; spin.y = y; paint(); };
    this.el.querySelector('#mclose').onclick = () => this.close();
    paint();
  }
}

function store_best(p, courseId) { if (p.best && p.best[courseId]) return p.best[courseId]; if (courseId === 'riverbend' && p.bestRound != null) return { strokes: p.bestRound, toPar: p.bestToPar }; return null; }
export function fmtPar(t) { return t === 0 ? 'E' : t > 0 ? '+' + t : String(t); }

export function describeSpin(s) {
  const parts = [];
  if (Math.abs(s.y) >= 0.15) parts.push(`${Math.round(Math.abs(s.y) * 100)}% ${s.y > 0 ? 'backspin' : 'topspin'}`);
  if (Math.abs(s.x) >= 0.15) parts.push(`${Math.round(Math.abs(s.x) * 100)}% ${s.x > 0 ? 'fade' : 'draw'}`);
  return parts.length ? parts.join(' · ') : 'no spin';
}
export function shortSpin(s) {
  const a = [];
  if (s.y >= 0.15) a.push('BACK'); else if (s.y <= -0.15) a.push('TOP');
  if (s.x >= 0.15) a.push('FADE'); else if (s.x <= -0.15) a.push('DRAW');
  return a.length ? a.join('+') : 'SPIN';
}
