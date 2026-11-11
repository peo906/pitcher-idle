import Phaser from 'phaser';
import './style.css';
import { W, H } from './config.js';
import Stadium from './scenes/Stadium.js';
import { state, load, save, ratePerSec, exportCode, importCode, offlineReward, addGold } from './state.js';
import { fmt } from './format.js';
import { setSound, unlock, sfx } from './sound.js';
import { UPGRADES } from './config.js';
import { stage, nextStage, quote, buy, atCap, effectText, canPromote, promote, buffActive } from './economy.js';

const $ = id => document.getElementById(id);

async function boot() {
  await Promise.all(['11px Galmuri11', '9px Galmuri9'].map(f => document.fonts.load(f))).catch(() => {});
  const hadSave = load();

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    width: W, height: H,
    pixelArt: true, roundPixels: true,
    backgroundColor: '#000000',
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    scene: [Stadium],
  });

  window.__game = game;            // handy for debugging from the console
  const scene = () => game.scene.getScene('Stadium');
  const startPitching = () => {
    const s = scene();
    if (s && s.sys.isActive()) s.startLoop();
    else game.events.once('step', startPitching);
  };

  // ---- HUD ----
  const refresh = () => {
    $('gold').textContent = fmt(state.gold);
    $('rate').textContent = `+${fmt(ratePerSec())}/초`;
    $('player').textContent = state.name ? `투수 ${state.name}` : '';
    $('btn-sound').textContent = state.sound ? '소리 ON' : '소리 OFF';
    refreshStage();
    refreshPanel();
  };

  // ---- promotion (top center) ----
  const refreshStage = () => {
    const s = stage(), nx = nextStage();
    $('stage').textContent = s.name;
    if (!nx) { $('promo').hidden = true; return; }
    const pct = Math.min(1, state.gold / s.cost);
    $('promo-fill').style.width = (pct * 100) + '%';
    $('promo-text').textContent = `${nx.name}까지 ${fmt(state.gold)} / ${fmt(s.cost)}`;
    $('btn-promote').disabled = !canPromote();
    if (buffActive()) {
      const left = Math.ceil((state.buffUntil - Date.now()) / 1000);
      $('buff').hidden = false;
      $('buff').textContent = `진급 버프 골드 ×1.5 · ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
    } else $('buff').hidden = true;
  };
  $('btn-promote').onclick = () => { if (promote()) refresh(); };

  // ---- upgrade panel (right) ----
  const rows = {};
  for (const key of Object.keys(UPGRADES)) {
    const el = document.createElement('div');
    el.className = 'up';
    el.innerHTML = `<div class="name"></div><button></button><div class="eff"></div>`;
    el.querySelector('button').onclick = () => {
      if (buy(key)) { sfx('buy'); el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); refresh(); }
    };
    $('upgrades').appendChild(el);
    rows[key] = el;
  }
  const refreshPanel = () => {
    for (const [key, el] of Object.entries(rows)) {
      const u = UPGRADES[key], lv = state.lv[key], btn = el.querySelector('button');
      el.querySelector('.name').innerHTML = `${u.name}<b>Lv ${lv}${u.cap !== null ? ' / ' + u.cap : ''}</b>`;
      const [now, next] = effectText(key);
      if (atCap(key)) {
        el.querySelector('.eff').textContent = now;
        btn.disabled = true; btn.innerHTML = 'MAX';
      } else {
        const q = quote(key);
        el.querySelector('.eff').innerHTML = `${now} <i>→ ${next}</i>`;
        btn.disabled = state.gold < q.cost;
        btn.innerHTML = `${fmt(q.cost)}<small>+${q.n}Lv</small>`;
      }
    }
    for (const b of $('bulk').children) b.classList.toggle('on', String(state.bulk) === b.dataset.n);
  };
  for (const b of $('bulk').children) b.onclick = () => {
    state.bulk = b.dataset.n === 'max' ? 'max' : Number(b.dataset.n); save(); refresh();
  };
  $('panel-toggle').onclick = () => {
    const closed = $('panel').classList.toggle('closed');
    $('panel-toggle').textContent = closed ? '◀' : '▶';
  };
  $('panel-toggle').textContent = '▶';
  setInterval(refresh, 100);
  window.addEventListener('gold-pop', () => {
    const g = $('gold'); g.classList.remove('bump'); void g.offsetWidth; g.classList.add('bump'); refresh();
  });

  const toggleSound = () => { setSound(!state.sound); save(); refresh(); syncSettings(); };
  $('btn-sound').onclick = toggleSound;

  // ---- first start: name ----
  const askName = () => {
    $('modal-name').hidden = false;
    $('name-input').focus();
  };
  $('name-ok').onclick = () => {
    const v = $('name-input').value.trim();
    if (!v) { $('name-input').focus(); return; }
    state.name = v; save(); unlock();
    $('modal-name').hidden = true;
    startPitching();
  };
  $('name-input').onkeydown = e => { if (e.key === 'Enter') $('name-ok').click(); };

  // ---- offline reward ----
  let pending = null;
  const showOffline = r => {
    pending = r;
    const min = Math.floor(r.sec / 60), h = Math.floor(min / 60);
    const away = h ? `${h}시간 ${min % 60}분` : `${min}분`;
    $('offline-text').textContent = `${away} 동안 ${state.name}은(는) 혼자 연습했어요.`;
    $('offline-gold').textContent = `+${fmt(r.gold)}`;
    $('modal-offline').hidden = false;
  };
  $('offline-ok').onclick = () => {
    if (pending) { addGold(pending.gold); pending = null; save(); }
    $('modal-offline').hidden = true; unlock();
  };

  // ---- settings ----
  const syncSettings = () => {
    $('set-sound').textContent = state.sound ? '켜짐' : '꺼짐';
    $('set-name').value = state.name;
  };
  $('btn-settings').onclick = () => {
    syncSettings(); $('code-out').value = exportCode(); $('code-msg').textContent = '';
    $('modal-settings').hidden = false;
  };
  $('settings-close').onclick = () => { $('modal-settings').hidden = true; };
  $('set-sound').onclick = toggleSound;
  $('set-name-ok').onclick = () => { const v = $('set-name').value.trim(); if (v) { state.name = v; save(); } };
  $('code-copy').onclick = async () => {
    try { await navigator.clipboard.writeText($('code-out').value); $('code-msg').textContent = '복사했어요.'; }
    catch { $('code-out').select(); $('code-msg').textContent = '선택된 코드를 직접 복사해 주세요.'; }
  };
  $('code-load').onclick = () => {
    const err = importCode($('code-in').value);
    $('code-msg').textContent = err || '불러왔어요!';
    if (!err) { $('code-in').value = ''; $('code-out').value = exportCode(); syncSettings(); }
  };

  // ---- autosave + tab hidden counts as away ----
  setInterval(save, 30000);
  window.addEventListener('beforeunload', save);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { save(); game.loop.sleep(); }
    else {
      const r = offlineReward(state.lastSeen);
      game.loop.wake();
      state.lastSeen = Date.now();
      if (r) showOffline(r);
    }
  });
  document.addEventListener('pointerdown', unlock, { once: true });

  // ---- start ----
  if (!hadSave || !state.name) askName();
  else {
    const r = offlineReward();
    state.lastSeen = Date.now();
    if (r) showOffline(r);
    startPitching();
  }
  refresh();
}

boot();
