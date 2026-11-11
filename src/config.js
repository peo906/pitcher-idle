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
export const interval = lv => Math.max(0.6, 1.5 * Math.pow(0.96, lv));
export const zoneChance = lv => Math.min(0.85, 0.5 + 0.01 * lv);
export const goldMult = lv => Math.pow(1.05, lv);

// fixed template anchors (native coords)
export const ANCHOR = {
  mound: { x: 240, feet: 172 },
  release: { x: 231, y: 124 },          // right-hander's hand, seen from the catcher
  zone: { x0: 214, y0: 178, x1: 266, y1: 238 },
  mittRest: { x: 240, y: 222 },
  scoreboard: { x0: 193, y0: 48, x1: 286, y1: 86 },   // inner screen, measured from bg_pro.png
};
