// Modal menus: profile picker, upgrade shop, spin pad. Plain DOM.
import { UPGRADES, upgradeCost } from './profile.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export class Menus {
  constructor(game) { this.game = game; this.el = document.getElementById('modal'); this.open = null; this.el.addEventListener('pointerdown', (e) => e.stopPropagation()); }
  show(kind, html) { this.open = kind; this.el.innerHTML = `<div class="mpanel">${html}</div>`; this.el.classList.add('show'); }
  close() { this.open = null; this.el.classList.remove('show'); this.el.innerHTML = ''; }

  /** Profile picker. Renders into the given container (the title panel). */
  profilePicker(container, store, onPick) {
    const list = store.list();
    const card = (p) => {
      const best = p.bestRound == null ? 'no round yet' : `best ${p.bestRound} (${p.bestToPar === 0 ? 'E' : p.bestToPar > 0 ? '+' + p.bestToPar : p.bestToPar})`;
      const ups = UPGRADES.map((u) => `<span class="pup" title="${esc(u.name)} ${p.upgrades[u.id] || 0}/${u.max}">${esc(u.name.split(' ')[0])} <b>${p.upgrades[u.id] || 0}</b></span>`).join('');
      return `<div class="pcard" data-name="${esc(p.name)}"><div class="pmain"><div class="pname">${esc(p.name)}</div><div class="pmeta">${best} · ${p.rounds} round${p.rounds === 1 ? '' : 's'} · <b class="coin">◎ ${p.coins}</b></div><div class="pups">${ups}</div></div><button class="btn small" data-play="${esc(p.name)}">PLAY</button><button class="pdel" title="Delete profile" data-del="${esc(p.name)}">✕</button></div>`;
    };
    container.innerHTML = `<h1>RIVERBEND</h1><div class="sub">18 HOLES · PAR 72 · WHO'S PLAYING?</div>
      <div class="plist">${list.length ? list.map(card).join('') : '<div class="pempty">No players yet — create one below.</div>'}</div>
      <div class="pnew"><input id="pname" maxlength="18" placeholder="New player name" autocomplete="off"><button class="btn" id="pcreate">CREATE</button></div>`;
    const input = container.querySelector('#pname');
    const create = () => { const p = store.create(input.value); if (!p) { input.focus(); return; } onPick(p); };
    container.querySelector('#pcreate').onclick = create;
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') create(); e.stopPropagation(); });
    input.addEventListener('keyup', (e) => e.stopPropagation());
    for (const b of container.querySelectorAll('[data-play]')) b.onclick = () => onPick(store.get(b.dataset.play));
    for (const b of container.querySelectorAll('[data-del]')) b.onclick = () => { if (confirm(`Delete ${b.dataset.del}? Coins and upgrades will be lost.`)) { store.remove(b.dataset.del); this.profilePicker(container, store, onPick); } };
    if (!list.length) setTimeout(() => input.focus(), 50);
  }

  shop(store, profile, onChange) {
    const rows = UPGRADES.map((u) => {
      const lvl = profile.upgrades[u.id] || 0, cost = upgradeCost(lvl);
      const pips = Array.from({ length: u.max }, (_, i) => `<i class="${i < lvl ? 'on' : ''}"></i>`).join('');
      const btn = cost == null ? '<span class="maxed">MAX</span>' : `<button class="btn small ${profile.coins < cost ? 'dim' : ''}" data-buy="${u.id}">◎ ${cost}</button>`;
      return `<div class="srow"><div><div class="sname">${esc(u.name)} <span class="pips">${pips}</span></div><div class="sdesc">${esc(u.desc)}</div></div>${btn}</div>`;
    }).join('');
    this.show('shop', `<div class="mhead"><div><div class="sub">PRO SHOP</div><div class="mtitle">Upgrades</div></div><div class="mcoins">◎ ${profile.coins}<small>coins</small></div></div>
      ${rows}<div class="mfoot"><span class="sdesc">Birdie 10 · Par 5 · Bogey 3 · Double 2 · Eagle 25 · Ace 50</span><button class="btn" id="mclose">DONE</button></div>`);
    this.el.querySelector('#mclose').onclick = () => this.close();
    for (const b of this.el.querySelectorAll('[data-buy]')) b.onclick = () => { if (store.buy(profile, b.dataset.buy)) { onChange(); this.shop(store, profile, onChange); } };
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
