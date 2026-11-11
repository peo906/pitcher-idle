import Phaser from 'phaser';
import './style.css';
import { W, H } from './config.js';
import Stadium from './scenes/Stadium.js';
import { state, load, save, ratePerSec, exportCode, importCode, offlineReward, addGold } from './state.js';
import { fmt } from './format.js';
import { setSound, unlock, sfx } from './sound.js';
import { UPGRADES, STAGES } from './config.js';
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

  // ---- practice / game bar ----
  let info = { mode: 'practice', gauge: state.gauge, max: 30 };
  const refreshMatch = () => {
    const game = info.mode === 'game';
    $('mb-practice').hidden = game; $('mb-game').hidden = !game;
    if (!game) {
      const max = info.max || 1;
      $('gauge-fill').style.width = (Math.min(1, state.gauge / max) * 100) + '%';
      $('gauge-text').textContent = `${state.gauge} / ${max}`;
      $('btn-game').disabled = state.gauge < max;
      $('btn-auto').textContent = state.autoGame ? '자동 ON' : '자동 OFF';
      $('btn-auto').classList.toggle('on', state.autoGame);
    } else {
      const rec = state.record;
      $('bug-inn').textContent = info.inning;
      $('bug-of').textContent = '/' + info.innings;
      $('bug-us').textContent = info.score[0];
      $('bug-them').textContent = info.score[1];
      ['b1', 'b2', 'b3'].forEach((k, i) => $('bug-' + k).classList.toggle('on', !!info.bases[i]));
      const rows = document.querySelectorAll('.bug .count > div');
      [info.balls, info.strikes, info.outs].forEach((n, r) =>
        rows[r].querySelectorAll('i').forEach((dot, i) => dot.classList.toggle('on', i < n)));
      $('bug-tag').textContent = info.exam ? '진급 심사' : info.pro ? `시즌 ${state.seasonGame + 1}/30` : '경기';
      $('bug-rec').textContent = `${rec.w}승 ${rec.l}패 ${rec.d}무`;
      const mood = $('bug-mood');
      mood.className = info.shrink ? 'down' : info.confident ? 'up' : '';
      mood.textContent = info.shrink ? `위축 +${info.shrink}%p` : info.confident ? '자신감!' : '';
    }
  };
  window.addEventListener('match-update', e => { info = e.detail; refreshMatch(); });
  window.addEventListener('inning-change', () => {
    const bug = document.querySelector('.bug');
    bug.classList.remove('blink'); void bug.offsetWidth; bug.classList.add('blink');
  });
  $('btn-game').onclick = () => { const s = scene(); if (s) s.requestGame(); $('btn-game').disabled = true; };
  $('btn-auto').onclick = () => { state.autoGame = !state.autoGame; save(); refreshMatch(); };
  refreshMatch();

  let toastTimer = null;
  window.addEventListener('game-over', e => {
    const r = e.detail;
    const head = r.win ? '승리!' : r.draw ? '무승부' : '패배';
    const passed = r.win && !r.pulled;
    const exam = r.exam ? (passed ? '<br><small>진급 심사 통과! 남은 20% 면제</small>' : '<br><small>진급 심사 실패, 다음 경기에 다시</small>') : '';
    const pulled = r.pulled ? '<br><small>강판 · 남은 이닝은 불펜이 던졌어요 · 보너스 없음 · 다음 경기 위축</small>' : '';
    const bonus = r.label ? `<br>${r.label} 보너스 +${Math.round(r.bonus * 100)}% <b>+${fmt(r.bonusGold)}</b>` : '';
    $('toast').innerHTML = `<b>${head}</b> <small>${r.score[0]} : ${r.score[1]}</small>${pulled}${bonus}${exam}`;
    $('toast').hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('toast').hidden = true; }, 2600);
  });
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

  // ---- admin mode: address ends with ?admin (remembered on this browser) ----
  const params = new URLSearchParams(location.search);
  if (params.has('admin')) localStorage.setItem('pitcher-idle-admin', '1');
  if (params.has('noadmin')) localStorage.removeItem('pitcher-idle-admin');
  if (localStorage.getItem('pitcher-idle-admin')) {
    $('btn-admin').hidden = false;
    const grid = $('admin-stages');
    STAGES.forEach((st, i) => {
      const b = document.createElement('button');
      b.textContent = st.name; b.dataset.i = i;
      b.onclick = () => { scene().adminJump(i); markStage(); refresh(); };
      grid.appendChild(b);
    });
    const markStage = () => [...grid.children].forEach(b => b.classList.toggle('on', Number(b.dataset.i) === state.stage));
    $('btn-admin').onclick = () => { markStage(); $('modal-admin').hidden = false; };
    $('admin-close').onclick = () => { $('modal-admin').hidden = true; };
    document.querySelectorAll('#modal-admin .tools button').forEach(b => b.onclick = () => {
      const s = scene(), act = b.dataset.act;
      if (act === 'gold') addGold(STAGES[state.stage].cost || 1e6);
      if (act === 'gold10') addGold(state.gold * 9);
      if (act === 'gauge') { state.gauge = 999; s.practicePitchDone(); }
      if (act === 'game') s.adminStartGame();
      if (act === 'win') s.adminEndGame(true);
      if (act === 'lose') s.adminEndGame(false);
      if (act === 'maxlv') for (const k in state.lv) state.lv[k] = UPGRADES[k].cap === null ? state.lv[k] + 10 : Math.min(UPGRADES[k].cap, state.lv[k] + 10);
      if (act === 'resetlv') for (const k in state.lv) state.lv[k] = 0;
      save(); refresh(); window.dispatchEvent(new CustomEvent('gold-pop'));
    });
  }

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
