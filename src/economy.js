// Spending gold: upgrades and promotion. Pure rules, no rendering.
import { STAGES, UPGRADES, PROMO_BUFF, speedKmh, interval, zoneChance } from './config.js';
import { state, save } from './state.js';

export const stage = () => STAGES[state.stage];
export const nextStage = () => STAGES[state.stage + 1] || null;
export const buffActive = () => Date.now() < state.buffUntil;
export const buffMult = () => (buffActive() ? PROMO_BUFF.mult : 1);

export const atCap = key => UPGRADES[key].cap !== null && state.lv[key] >= UPGRADES[key].cap;
const unitCost = (key, lv) => UPGRADES[key].base * Math.pow(UPGRADES[key].ratio, lv);

// how many levels the current bulk setting buys, and what it costs
export function quote(key) {
  const u = UPGRADES[key], lv = state.lv[key];
  const room = u.cap === null ? Infinity : u.cap - lv;
  if (room <= 0) return { n: 0, cost: 0 };
  if (state.bulk === 'max') {
    let n = 0, cost = 0;
    while (n < room && cost + unitCost(key, lv + n) <= state.gold) { cost += unitCost(key, lv + n); n++; }
    return n ? { n, cost } : { n: 1, cost: unitCost(key, lv) };   // show the next single level when broke
  }
  const n = Math.min(state.bulk, room);
  let cost = 0; for (let i = 0; i < n; i++) cost += unitCost(key, lv + i);
  return { n, cost };
}

export function buy(key) {
  const q = quote(key);
  if (!q.n || state.gold < q.cost) return false;
  state.gold -= q.cost; state.lv[key] += q.n; save();
  return true;
}

export function canPromote() { const s = stage(); return s.cost !== null && state.gold >= s.cost; }
export function promote() {
  if (!canPromote()) return false;
  state.gold -= stage().cost; state.stage++; state.buffUntil = Date.now() + PROMO_BUFF.ms; save();
  window.dispatchEvent(new CustomEvent('stage-change'));
  return true;
}

// what one level does, for the panel: [now, next]
export function effectText(key) {
  const lv = state.lv[key], n = lv + 1;
  const pct = v => Math.round(v * 100) + '%';
  switch (key) {
    case 'speed':   return [`${speedKmh(lv)}km/h · 골드 +${Math.round((Math.pow(1.05, lv) - 1) * 100)}%`, `+${Math.round((Math.pow(1.05, n) - 1) * 100)}%`];
    case 'tempo':   return [`분당 ${Math.round(60 / interval(lv))}구`, `분당 ${Math.round(60 / interval(n))}구`];
    case 'control': return [`스트라이크 ${pct(zoneChance(lv))}`, pct(zoneChance(n))];
    case 'stuff':   return [lv ? `피안타 −${(lv * 0.4).toFixed(1)}%p (경기)` : '피안타 감소 (경기)', `−${(n * 0.4).toFixed(1)}%p`];
    case 'end':     return [lv ? `헛스윙 +${(lv * 0.6).toFixed(1)}%p (경기)` : '헛스윙 증가 (경기)', `+${(n * 0.6).toFixed(1)}%p`];
  }
}
