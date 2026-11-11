// Balance & layout data. Numbers come from the design doc; change them here, not in game code.

export const W = 480, H = 270;          // native pixel grid, scaled up to the window

// 진급 단계표 (기획서 '진급 단계표'). cost = gold to move to the NEXT stage.
// sprite: which pitcher art to show until stage-specific art exists.
export const STAGES = [
  { name: '초등 1학년', cost: 240e4,   base: 1000,  sprite: 'elementary' },
  { name: '초등 2학년', cost: 480e4,   base: 1300,  sprite: 'elementary' },
  { name: '초등 3학년', cost: 960e4,   base: 1700,  sprite: 'elementary' },
  { name: '초등 4학년', cost: 1900e4,  base: 2200,  sprite: 'elementary' },
  { name: '초등 5학년', cost: 3600e4,  base: 2900,  sprite: 'elementary' },
  { name: '초등 6학년', cost: 7300e4,  base: 3800,  sprite: 'elementary' },
  { name: '중학 1학년', cost: 1.7e8,   base: 5500,  sprite: 'elementary' },
  { name: '중학 2학년', cost: 3.7e8,   base: 8000,  sprite: 'elementary' },
  { name: '중학 3학년', cost: 7.8e8,   base: 1.2e4, sprite: 'elementary' },
  { name: '고교 1학년', cost: 19e8,    base: 1.8e4, sprite: 'elementary' },
  { name: '고교 2학년', cost: 41e8,    base: 2.7e4, sprite: 'elementary' },
  { name: '고교 3학년', cost: 86e8,    base: 4e4,   sprite: 'elementary' },
  { name: '프로 2군',   cost: 240e8,   base: 7e4,   sprite: 'pro' },
  { name: '1군 불펜',   cost: 630e8,   base: 12e4,  sprite: 'pro' },
  { name: '1군 선발',   cost: 1600e8,  base: 20e4,  sprite: 'pro' },
  { name: '팀 에이스',  cost: 4100e8,  base: 35e4,  sprite: 'pro' },
  { name: '국가대표',   cost: 1.1e12,  base: 60e4,  sprite: 'pro' },
  { name: '메이저리그', cost: null,    base: 100e4, sprite: 'pro' },
];
// 경기 설정 (기획서 '연습과 경기', '타자 수준표', '경기 보너스')
// tier per stage index, innings per stage, practice gauge per stage (0 = pro, no practice)
export const TIERS = {
  vw: { name: '매우 약함', contact: 0.65, hit: 0.22, hr: 0.05 },
  w:  { name: '약함',     contact: 0.70, hit: 0.25, hr: 0.08 },
  n:  { name: '보통',     contact: 0.75, hit: 0.28, hr: 0.10 },
  s:  { name: '강함',     contact: 0.78, hit: 0.30, hr: 0.12 },
  vs: { name: '매우 강함', contact: 0.80, hit: 0.32, hr: 0.15 },
  p:  { name: '프로',     contact: 0.82, hit: 0.33, hr: 0.18 },
  i:  { name: '국제·메이저', contact: 0.85, hit: 0.35, hr: 0.22 },
};
export const STAGE_TIER   = ['vw','vw','w','w','w','n','n','n','s','s','s','vs','p','p','p','p','i','i'];
export const STAGE_INNING = [3,3,3,3,3,3,5,5,5,7,7,7,6,2,9,9,9,9];
export const STAGE_GAUGE  = [30,30,30,30,30,30,40,40,40,50,50,50,0,0,0,0,0,0];
export const BULLPEN_STAGE = 13;
export const SEASON_GAMES = 30;

export const JUDGE = {
  swingIn: 0.80, swingOut: 0.35,     // chance the batter swings at a pitch in / out of the zone
  foul: 0.30,                        // share of contact that goes foul
  endPerLv: 0.006, stuffHitPerLv: 0.004, stuffHrPerLv: 0.003,
  minContact: 0.40, minHit: 0.15, minHr: 0.02, maxZone: 0.85,
  single: 0.70, double: 0.25,        // rest = triple
};
export const RESULT_MULT = { k3: 2.0, k: 1.5, out: 1.3 };   // on the pitch that ends the at-bat
export const MOOD = { hit: 3, hr: 5, cap: 15, outHeal: 3, confZone: 0.03, confHit: 0.02, confStreak: 3 };
export const GAME_BONUS = { perfect: 2.0, noHit: 1.0, shutout: 0.5, cgWin: 0.2, bullpen: 0.2 };
export const TEAM_RUN = { chances: 2, p: 0.22 };
export const BULLPEN_RUN = { chances: 2, p: 0.22 };       // opponent offense vs our bullpen after 강판

// 실투 (기획: 빠지는 공 75% / 몰린 공 25%)
export const MISS = {
  base: 0.20, perLv: 0.0053, min: 0.04,       // 제구 Lv0 20% -> Lv30 ~4%
  moodPer: 0.5,                               // 위축 1%p당 실투 +0.5%p
  wideShare: 0.75,                            // the rest is a "몰린 공"
  wildPitch: 0.12,                            // a wide miss with runners on gets past the catcher
  hbp: 0.05,                                  // a wide miss the batter doesn't swing at hits him (데드볼)
  benchClear: 0.06, benchClearRepeat: 0.30,   // 이스터에그: chance per 데드볼 (2nd 데드볼 in a game: much higher)
  middle: { swing: 0.95, contactBonus: 0.10, hitMult: 1.6, hrMult: 2.0 },
};
export const missChance = (controlLv, shrink = 0) =>
  Math.max(MISS.min, MISS.base - MISS.perLv * controlLv) + (shrink * MISS.moodPer) / 100;

// 강판: game runs by innings, or a big inning
export const PULL = { byInnings: { 2: 2, 3: 3, 5: 4, 6: 4, 7: 4, 9: 5 }, inningRuns: { short: 3, long: 4 } };   // big inning: 3 runs in games of 3 innings or less, else 4            // our offense per inning
export const EXAM = { at: 0.8 };                            // 진급 심사: 80% saved -> win waives 20%

export const PROMO_BUFF = { mult: 1.5, ms: 10 * 60 * 1000 };   // 진급 직후 10분 골드 ×1.5

// 능력치 (기획서 '능력치 업그레이드'). cost(lv) = base × ratio^lv
export const UPGRADES = {
  speed:   { name: '구속', base: 2000,  ratio: 1.17, cap: null },
  tempo:   { name: '템포', base: 2e4,   ratio: 1.30, cap: 23 },
  control: { name: '제구', base: 8000,  ratio: 1.25, cap: 30 },
  stuff:   { name: '구위', base: 3e4,   ratio: 1.25, cap: 35 },
  end:     { name: '볼끝', base: 3e4,   ratio: 1.25, cap: 35 },
};

export const MULT = { strike: 1.1, ball: 1.0 };

// pitch timing (seconds). flight is fixed so the "pop" always lands the same way.
export const PITCH = {
  flight: 0.32,                         // base (fastball) flight; off-speed pitches take longer
  react: 0.2,
  minWindup: 0.15,
};

export const speedKmh = lv => Math.round(85 + 80 * (1 - Math.pow(0.977, lv)));
// 템포: start 2.25s (27/min), floor 0.9s (67/min) at Lv 23 — 2/3 of the original pace
export const interval = lv => Math.max(0.9, 2.25 * Math.pow(0.96, lv));
// fewer pitches -> each pitch pays 1.5x, so the 10-hour first run stays the same
export const PACE_COMP = 1.5;
export const zoneChance = lv => Math.min(0.85, 0.5 + 0.01 * lv);
export const goldMult = lv => Math.pow(1.05, lv) * PACE_COMP;

// fixed template anchors (native coords)
export const ANCHOR = {
  mound: { x: 240, feet: 172 },
  release: { x: 231, y: 124 },          // right-hander's hand, seen from the catcher
  zone: { x0: 214, y0: 178, x1: 266, y1: 238 },
  mittRest: { x: 240, y: 222 },
  scoreboard: { x0: 193, y0: 48, x1: 286, y1: 86 },   // inner screen, measured from bg_pro.png
};

// ---------------- 구종 (기획서 '구종과 장착') ----------------
// Effects apply only to the pitch that is thrown (%p): zone = more strikes, whiff = batter misses more,
// hit / hr = fewer hits / home runs (negative). speed = share of fastball velocity shown on the gun.
export const PITCHES = [
  { id: 'fastball', abbr: 'FB',     name: '직구',          stage: 0,  speed: 1.00, fx: {} },
  { id: 'curve', abbr: 'CB',        name: '커브',          stage: 2,  speed: 0.75, fx: { whiff: 9, zone: -6 } },
  { id: 'changeup', abbr: 'CH',     name: '체인지업',      stage: 4,  speed: 0.82, fx: { hit: -5, whiff: 2 } },
  { id: 'slider', abbr: 'SL',       name: '슬라이더',      stage: 5,  speed: 0.88, fx: { whiff: 6, hit: -3, zone: -3 } },
  { id: 'twoseam', abbr: '2S',      name: '투심',          stage: 6,  speed: 0.97, fx: { hit: -2, hr: -5 } },
  { id: 'cutter', abbr: 'CT',       name: '커터',          stage: 7,  speed: 0.93, fx: { hr: -5, zone: 2 } },
  { id: 'sinker', abbr: 'SK',       name: '싱커',          stage: 8,  speed: 0.95, fx: { hit: -5, whiff: -4 } },
  { id: 'splitter', abbr: 'SP',     name: '스플리터',      stage: 9,  speed: 0.88, fx: { whiff: 9, zone: -6 } },
  { id: 'knucklecurve', abbr: 'KC', name: '너클 커브',     stage: 10, speed: 0.78, fx: { whiff: 12, zone: -9 } },
  { id: 'fork', abbr: 'FK',         name: '포크',          stage: 11, speed: 0.85, fx: { whiff: 15, hit: -3, zone: -9 } },
  { id: 'sweeper', abbr: 'SW',      name: '스위퍼',        stage: 12, speed: 0.86, fx: { whiff: 12, hit: -3 } },
  { id: 'circlechange', abbr: 'CC', name: '서클 체인지업', stage: 13, speed: 0.82, fx: { hit: -8, zone: -3 } },
  { id: 'knuckleball', abbr: 'KN',  name: '너클볼',        stage: 15, speed: 0.70, fx: { whiff: 18, zone: -18 } },
  { id: 'gyro', abbr: 'GY',         name: '자이로볼',      stage: 16, speed: 1.00, fx: { whiff: 9, hr: -3 } },
];
export const PITCH_BY_ID = Object.fromEntries(PITCHES.map(p => [p.id, p]));
export const PITCH_UNLOCK_SHARE = 0.3;                      // unlock cost = 30% of that stage's promotion cost
export const PITCH_MIX = { fastball: 0.4, finisherBoost: 2 }; // 2 strikes: pitches with whiff >= 9 are twice as likely
export const slotsFor = stage => (stage < 2 ? 0 : stage < 6 ? 2 : stage < 9 ? 3 : 4);

// 조합 보너스: always on while the set is equipped
export const COMBOS = [
  { id: 'drop',   name: '낙차 3종',  desc: '커브·너클 커브·스플리터·포크 중 3개', fx: { whiff: 2 },
    test: eq => ['curve', 'knucklecurve', 'splitter', 'fork'].filter(x => eq.includes(x)).length >= 3 },
  { id: 'ground', name: '땅볼 머신', desc: '투심·싱커·커터', fx: { hit: -1 },
    test: eq => ['twoseam', 'sinker', 'cutter'].every(x => eq.includes(x)) },
  { id: 'tempo',  name: '완급 조절', desc: '체인지업류 + 커터·슬라이더·스위퍼 중 1개', fx: { hit: -1, whiff: 1 },
    test: eq => eq.some(x => x === 'changeup' || x === 'circlechange') && eq.some(x => ['cutter', 'slider', 'sweeper'].includes(x)) },
  { id: 'power',  name: '정통파',    desc: '슬롯 3칸 이상에서 변화구 2개 이하', fx: { zone: 3, hr: -1 },
    test: (eq, slots) => slots >= 3 && eq.length <= 2 },
];

// ---------------- 구종별 궤적 (catcher's view, right-handed pitcher) ----------------
// The ball always lands on the target; during flight it is pushed off the straight line by
// dx/dy (px) times a bell f(t) = sin(pi * t^k). Bigger k = the break shows up later and sharper.
// dx > 0: ball sits to the catcher's right and breaks back left (slider/sweeper/cutter, glove side)
// dx < 0: arm-side run (changeup, two-seam, sinker).  dy < 0: ball rides high, then drops in.
export const BREAK = {
  fastball:     { dx: 0,   dy: -7,  k: 1.2 },            // a little carry
  curve:        { dx: 8,   dy: -64, k: 1.4 },             // pops up out of the hand, then rolls down
  changeup:     { dx: -16, dy: -34, k: 3.0 },
  slider:       { dx: 34,  dy: -10, k: 3.0 },
  twoseam:      { dx: -18, dy: -10, k: 3.2 },
  cutter:       { dx: 14,  dy: -5,  k: 4.0 },
  sinker:       { dx: -14, dy: -38, k: 3.2 },
  splitter:     { dx: 0,   dy: -54, k: 3.6 },            // comes in level like a fastball, then dives
  knucklecurve: { dx: 10,  dy: -78, k: 1.8 },
  fork:         { dx: 0,   dy: -68, k: 4.0 },
  sweeper:      { dx: 56,  dy: -8,  k: 2.4 },
  circlechange: { dx: -20, dy: -38, k: 3.0 },
  knuckleball:  { dx: 0,   dy: -10, k: 1.0, wobble: 12 },
  gyro:         { dx: 0,   dy: -4,  k: 1.2 },
};
export const flightFor = id => PITCH.flight / Math.max(0.7, PITCH_BY_ID[id].speed) * (id === 'gyro' ? 0.85 : 1);
