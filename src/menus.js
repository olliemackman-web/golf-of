// Modal menus: profile picker, upgrade shop, spin pad. Plain DOM.
import { UPGRADES, upgradeCost } from './profile.js';
import { COURSES } from './courseData.js';

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
      const best = bests.length ? 'best ' + bests.join(' · ') : 'no round yet';
      const ups = UPGRADES.map((u) => `<span class="pup" title="${esc(u.name)} ${p.upgrades[u.id] || 0}/${u.max}">${esc(u.name.split(' ')[0])} <b>${p.upgrades[u.id] || 0}</b></span>`).join('');
      return `<div class="pcard" data-name="${esc(p.name)}"><div class="pmain"><div class="pname">${esc(p.name)}</div><div class="pmeta">${best} · ${p.rounds} round${p.rounds === 1 ? '' : 's'} · <b class="coin">◎ ${p.coins}</b></div><div class="pups">${ups}</div></div><button class="btn small" data-play="${esc(p.name)}">PLAY</button><button class="pdel" title="Copy this player's code to move them to another phone or link" data-code="${esc(p.name)}">⧉</button><button class="pdel" title="Delete profile" data-del="${esc(p.name)}">✕</button></div>`;
    };
    const warn = store.storageOk === false ? '<div class="pempty" style="color:#ffb15a">This browser is not saving players (private mode or blocked storage). Copy a player\'s code (⧉) to keep them.</div>' : '';
    container.innerHTML = `<h1>RIVERBEND</h1><div class="sub">18 HOLES · PAR 72 · WHO'S PLAYING?</div>
      <div class="plist">${list.length ? list.map(card).join('') : '<div class="pempty">No players yet — create one below.</div>'}</div>${warn}
      <div class="pnew"><input id="pname" maxlength="200" placeholder="New player name, or paste a player code" autocomplete="off"><button class="btn" id="pcreate">CREATE</button></div>
      <div class="pempty" id="pnote">Players are saved in this browser for this link. ⧉ copies a player code you can paste here on another phone or link.</div>`;
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
      return `<div class="pcard course"><div class="pmain"><div class="pname">${esc(c.name)}</div><div class="pmeta">18 holes · par ${c.par} · ${c.yards.toLocaleString()} yds${yours}</div><div class="pmeta" style="margin-top:4px">${esc(c.blurb)}</div>${record}<div class="lb">${rows}</div></div><button class="btn small" data-course="${i}">PLAY</button></div>`;
    }).join('');
    container.innerHTML = `<h1>RIVERBEND</h1><div class="sub">${esc(profile.name.toUpperCase())} · PICK A COURSE</div><div class="plist">${cards}</div><div class="pempty">Records count every player saved in this browser.</div>`;
    for (const b of container.querySelectorAll('[data-course]')) b.onclick = () => onPick(parseInt(b.dataset.course, 10));
  }

  shop(store, profile, onChange, msg = '') {
    const rows = UPGRADES.map((u) => {
      const lvl = profile.upgrades[u.id] || 0, cost = upgradeCost(lvl);
      const pips = Array.from({ length: u.max }, (_, i) => `<i class="${i < lvl ? 'on' : ''}"></i>`).join('');
      const btn = cost == null ? '<span class="maxed">MAX</span>' : `<button class="btn small ${profile.coins < cost ? 'dim' : ''}" data-buy="${u.id}">◎ ${cost}</button>`;
      return `<div class="srow"><div><div class="sname">${esc(u.name)} <span class="pips">${pips}</span></div><div class="sdesc">${esc(u.desc)}</div></div>${btn}</div>`;
    }).join('');
    this.show('shop', `<div class="mhead"><div><div class="sub">PRO SHOP</div><div class="mtitle">Upgrades</div></div><div class="mcoins">◎ ${profile.coins}<small>coins</small></div></div>
      ${rows}
      <div class="srow coupon"><div class="pnew"><input id="coupon" placeholder="Coupon code" autocomplete="off" inputmode="numeric"><button class="btn small" id="redeem">REDEEM</button></div><div class="sdesc" id="couponMsg">${esc(msg || '')}</div></div>
      <div class="mfoot"><span class="sdesc">Birdie 10 · Par 5 · Bogey 3 · Double 2 · Eagle 25 · Ace 50</span><button class="btn" id="mclose">DONE</button></div>`);
    this.el.querySelector('#mclose').onclick = () => this.close();
    for (const b of this.el.querySelectorAll('[data-buy]')) b.onclick = () => { if (store.buy(profile, b.dataset.buy)) { onChange(); this.shop(store, profile, onChange); } };
    const input = this.el.querySelector('#coupon');
    const redeem = () => {
      const r = store.redeem(profile, input.value);
      if (r == null) { this.el.querySelector('#couponMsg').textContent = 'Unknown code.'; input.select(); return; }
      onChange(); this.shop(store, profile, onChange, r);
    };
    this.el.querySelector('#redeem').onclick = redeem;
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') redeem(); e.stopPropagation(); });
    input.addEventListener('keyup', (e) => e.stopPropagation());
  }

  /** Spin pad: drag inside the ball to set side (x) and back/top (y) spin, -1..1. */
  spinPad(spin, onChange) {
    this.show('spin', `<div class="mhead"><div><div class="sub">SHOT SHAPE</div><div class="mtitle">Ball spin</div></div><div class="sdesc" id="spinlabel"></div></div>
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
