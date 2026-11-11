// Balance & layout data. Numbers come from the design doc; change them here, not in game code.

export const W = 480, H = 270;          // native pixel grid, scaled up to the window

export const STAGE = {
  name: '초등 1학년',
  baseGold: 1000,                       // gold per pitch before multipliers
};

export const STATS = {                  // 1st prototype: everything at Lv 0
  speedLv: 0,
  tempoLv: 0,
  controlLv: 0,
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
  scoreboard: { x0: 193, y0: 48, x1: 286, y1: 87 },
};
