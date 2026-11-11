// Pitch arsenal: unlocks, loadout, which pitch is thrown, and what it does.
import { PITCHES, PITCH_BY_ID, PITCH_UNLOCK_SHARE, PITCH_MIX, COMBOS, STAGES, slotsFor, speedKmh } from './config.js';
import { state, save } from './state.js';

export const slots = () => slotsFor(state.stage);
export const unlocked = id => id === 'fastball' || state.arsenal.unlocked.includes(id);
export const equipped = () => state.arsenal.equipped.filter(id => unlocked(id)).slice(0, slots());   // trims if slots shrink
export const unlockCost = id => Math.floor((STAGES[PITCH_BY_ID[id].stage].cost || STAGES[16].cost) * PITCH_UNLOCK_SHARE);
export const canUnlock = id => !unlocked(id) && state.stage >= PITCH_BY_ID[id].stage && state.gold >= unlockCost(id);

export function unlock(id) {
  if (!canUnlock(id)) return false;
  state.gold -= unlockCost(id); state.arsenal.unlocked.push(id);
  if (equipped().length < slots()) state.arsenal.equipped.push(id);          // auto-equip into a free slot
  save(); return true;
}
export function toggleEquip(id) {
  if (id === 'fastball' || !unlocked(id)) return false;
  const eq = equipped();
  if (eq.includes(id)) state.arsenal.equipped = eq.filter(x => x !== id);
  else if (eq.length < slots()) state.arsenal.equipped = [...eq, id];
  else return false;
  save(); return true;
}

export const activeCombos = () => { const eq = equipped(), s = slots(); return COMBOS.filter(c => c.test(eq, s)); };

// choose the next pitch: fastball 40%, rest shared by the loadout; with 2 strikes favour the put-away pitches
export function pickPitch(strikes = 0) {
  const eq = equipped();
  if (!eq.length || Math.random() < PITCH_MIX.fastball) return 'fastball';
  const w = eq.map(id => (strikes >= 2 && (PITCH_BY_ID[id].fx.whiff || 0) >= 9 ? PITCH_MIX.finisherBoost : 1));
  let r = Math.random() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < eq.length; i++) if ((r -= w[i]) < 0) return eq[i];
  return eq[eq.length - 1];
}

// the pitch's own effect + all active combos, as fractions for the match engine
export function mods(id) {
  const out = { id, zone: 0, whiff: 0, hit: 0, hr: 0 };
  const add = fx => { for (const k in fx) out[k] += fx[k] / 100; };
  add(PITCH_BY_ID[id].fx);
  for (const c of activeCombos()) add(c.fx);
  return out;
}

export const kmhFor = id => Math.round(speedKmh(state.lv.speed) * PITCH_BY_ID[id].speed);

const FX_NAME = { zone: '존', whiff: '헛스윙', hit: '안타', hr: '홈런' };
export const fxText = fx => Object.entries(fx).map(([k, v]) => `${FX_NAME[k]} ${v > 0 ? '+' : '−'}${Math.abs(v)}`).join(' · ') || '기본 구종';

// 투수 유형 칭호 (기획서): decided by the loadout and the speed gun
export function title() {
  const eq = equipped();
  if (!eq.length) return null;
  const sum = { zone: 0, whiff: 0, hit: 0, hr: 0 };
  for (const id of eq) for (const [k, v] of Object.entries(PITCH_BY_ID[id].fx)) sum[k] += v;
  if (speedKmh(state.lv.speed) >= 150 && activeCombos().some(c => c.id === 'power')) return '파이어볼러';
  const ground = -(sum.hit + sum.hr), whiff = sum.whiff, zone = sum.zone;
  const best = Math.max(ground, whiff, zone);
  if (best <= 0) return null;
  if (best === whiff) return '닥터 K';
  if (best === ground) return '땅볼 유도형';
  return '제구형';
}
