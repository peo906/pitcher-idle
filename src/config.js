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
  flight: 0.25,
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
