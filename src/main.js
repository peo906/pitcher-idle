import Phaser from 'phaser';
import './style.css';
import { W, H } from './config.js';
import Stadium from './scenes/Stadium.js';
import { state, load, save, ratePerSec, exportCode, importCode, offlineReward, addGold } from './state.js';
import { fmt } from './format.js';
import { setSound, unlock } from './sound.js';

const $ = id => document.getElementById(id);

async function boot() {
  await document.fonts.load('11px Galmuri11').catch(() => {});
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
  };
  setInterval(refresh, 100);

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
