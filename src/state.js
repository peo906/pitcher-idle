// Game state, auto-save (localStorage), save codes, offline reward.

const KEY = 'pitcher-idle-save';
const VERSION = 1;
export const OFFLINE_CAP_SEC = 8 * 3600;
export const OFFLINE_RATE = 0.5;
const RATE_WINDOW_MS = 10 * 60 * 1000;   // offline uses the last 10 minutes

export const state = {
  v: VERSION,
  name: '',
  gold: 0,
  totalGold: 0,          // this run's total earned (for LP later)
  pitches: 0,
  strikes: 0,
  sound: true,
  lastSeen: Date.now(),
  avgRate: 0,            // gold/sec over the last 10 min, saved for offline
};

// rolling income history for gold/sec
const history = [];      // [timestamp, amount]
export function addGold(amount) {
  state.gold += amount;
  state.totalGold += amount;
  history.push([Date.now(), amount]);
  const cut = Date.now() - RATE_WINDOW_MS;
  while (history.length && history[0][0] < cut) history.shift();
}
export function ratePerSec(windowMs = 60000) {
  const now = Date.now(), cut = now - windowMs;
  let sum = 0, first = now;
  for (const [t, a] of history) if (t >= cut) { sum += a; first = Math.min(first, t); }
  const span = Math.max(5000, now - first);   // avoid huge spikes at start
  return sum / (span / 1000);
}

// ---------- persistence ----------
export function save() {
  state.lastSeen = Date.now();
  state.avgRate = ratePerSec(RATE_WINDOW_MS) || state.avgRate;
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* storage blocked */ }
}

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return false;
    apply(JSON.parse(raw));
    return true;
  } catch (e) { return false; }
}

function apply(obj) {
  if (!obj || typeof obj !== 'object' || typeof obj.gold !== 'number') throw new Error('bad save');
  Object.assign(state, obj, { v: VERSION });
}

// ---------- save codes ----------
function hash(str) {                       // FNV-1a, 8 hex chars
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, '0');
}
const toB64 = s => btoa(String.fromCharCode(...new TextEncoder().encode(s)));
const fromB64 = b => new TextDecoder().decode(Uint8Array.from(atob(b), c => c.charCodeAt(0)));

export function exportCode() {
  save();
  const body = toB64(JSON.stringify(state));
  return `PI1-${body}-${hash(body)}`;
}

export function importCode(code) {
  const m = code.trim().match(/^PI1-([A-Za-z0-9+/=]+)-([0-9a-f]{8})$/);
  if (!m) return '코드 형식이 맞지 않아요.';
  if (hash(m[1]) !== m[2]) return '코드가 손상됐어요. 다시 복사해 주세요.';
  try { apply(JSON.parse(fromB64(m[1]))); } catch (e) { return '코드를 읽을 수 없어요.'; }
  state.lastSeen = Date.now();             // no offline reward from an imported code
  save();
  return null;
}

// ---------- offline ----------
// Returns {sec, gold} when the player was away long enough, else null.
export function offlineReward(from = state.lastSeen) {
  const sec = Math.min(OFFLINE_CAP_SEC, Math.floor((Date.now() - from) / 1000));
  if (sec < 60 || !state.avgRate) return null;
  return { sec, gold: Math.floor(state.avgRate * OFFLINE_RATE * sec) };
}
