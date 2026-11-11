// One game: count, outs, innings, bases, runs, mood. Pure rules — the scene only draws what this returns.
import { TIERS, JUDGE, RESULT_MULT, MOOD, GAME_BONUS, TEAM_RUN, BULLPEN_RUN, MISS, PULL, zoneChance, missChance } from './config.js';

export class Match {
  constructor({ innings, tier, bullpen = false, exam = false, shrink = 0 }) {
    Object.assign(this, { innings, tier: TIERS[tier], bullpen, exam });
    this.inningRuns = 0; this.pulled = false; this.pullLimit = PULL.byInnings[innings] || 5;
    this.bigInning = innings <= 3 ? PULL.inningRuns.short : PULL.inningRuns.long;
    this.inning = 1; this.outs = 0; this.balls = 0; this.strikes = 0; this.pitchesInPA = 0;
    this.bases = [0, 0, 0]; this.runs = 0; this.teamRuns = 0;
    this.hits = 0; this.walks = 0; this.ks = 0; this.batters = 0;
    this.shrink = shrink;   // 위축 %p added to hit chance (can carry over after 강판)
    this.outStreak = 0;     // consecutive outs -> 자신감
    this.gold = 0;          // gold earned during this game (bonus is a % of it)
    this.over = false;
    this.lefty = Math.random() < 0.3;
  }

  get confident() { return this.outStreak >= MOOD.confStreak; }

  // Decide one pitch. lv = pitcher levels. Returns everything the scene needs to draw it.
  // Decide one pitch. lv = pitcher levels. force = admin test override (see FORCE below).
  pitch(lv, force = null, pt = null) {
    const J = JUDGE, T = this.tier;
    const P = pt || { zone: 0, whiff: 0, hit: 0, hr: 0 };   // effect of the pitch type being thrown
    const F = force ? applyForce(this, force) : {};
    const R = (key, p) => (key in F ? F[key] : Math.random() < p);   // a roll, unless the admin pinned it

    // 실투 first: 'wide' slips out of the zone, 'middle' hangs right over the plate
    const miss = R('miss', missChance(lv.control, this.shrink)) ? (R('wide', MISS.wideShare) ? 'wide' : 'middle') : null;
    const zone = Math.max(0.15, Math.min(J.maxZone, zoneChance(lv.control) + P.zone + (this.confident ? MOOD.confZone : 0)));
    const inZone = miss === 'middle' ? true : miss === 'wide' ? false : R('inZone', zone);
    const swing = R('swing', miss === 'middle' ? MISS.middle.swing : inZone ? J.swingIn : J.swingOut);
    const out = { inZone, swing, miss, pitch: P.id || 'fastball', call: null, end: null, mult: 1 };
    this.pitchesInPA++;

    // a wide miss with runners on can get past the catcher: every runner moves up
    if (miss === 'wide' && !swing && this.bases.some(Boolean) && R('wild', MISS.wildPitch)) {
      out.wild = true; const before = this.runs;
      this.advanceRunnersOnly(1);
      this.inningRuns += this.runs - before;
      if (this.checkPull(out)) { out.call = 'ball'; out.count = { b: this.balls, s: this.strikes, o: this.outs }; return out; }
    }

    // 데드볼: a wide miss that runs into the batter. Batter takes first, forced runners move up.
    if (miss === 'wide' && !swing && !out.wild && R('hbp', MISS.hbp)) {
      this.hbps = (this.hbps || 0) + 1;
      out.call = 'hbp'; out.end = 'hbp';
      out.benchClear = R('bench', this.hbps >= 2 ? MISS.benchClearRepeat : MISS.benchClear);
      this.finishPA(out);
      out.count = { b: this.balls, s: this.strikes, o: this.outs };
      return out;
    }

    if (!swing) {
      if (inZone) { this.strikes++; out.call = 'strike'; out.mult = 1.1; }
      else { this.balls++; out.call = 'ball'; }
    } else {
      const contact = miss === 'middle' ? Math.min(0.97, T.contact + MISS.middle.contactBonus)
        : Math.max(J.minContact, T.contact - J.endPerLv * lv.end - P.whiff);
      if (!R('contact', contact)) { this.strikes++; out.call = 'swingMiss'; out.mult = 1.1; }
      else if (R('foul', J.foul)) {
        out.call = 'foul'; out.mult = 1.1;
        if (this.strikes < 2) this.strikes++;
      } else {
        let hitP = Math.max(J.minHit, T.hit - J.stuffHitPerLv * lv.stuff + P.hit + this.shrink / 100 - (this.confident ? MOOD.confHit : 0));
        if (miss === 'middle') hitP = Math.min(0.75, hitP * MISS.middle.hitMult);
        out.call = 'inplay';
        if (R('hit', hitP)) {
          let hrP = Math.max(J.minHr, T.hr - J.stuffHrPerLv * lv.stuff + P.hr);
          if (miss === 'middle') hrP = Math.min(0.6, hrP * MISS.middle.hrMult);
          const r = Math.random();
          out.end = F.type || (r < hrP ? 'hr' : (r < hrP + (1 - hrP) * J.single ? 'single'
                  : r < hrP + (1 - hrP) * (J.single + J.double) ? 'double' : 'triple'));
        } else {
          out.end = F.outType || (Math.random() < 0.5 ? 'fly' : 'ground');
        }
      }
    }
    if (!out.end && this.strikes >= 3) out.end = this.pitchesInPA === 3 ? 'k3' : 'k';
    if (!out.end && this.balls >= 4) out.end = 'walk';

    if (out.end) {
      out.mult *= RESULT_MULT[out.end === 'fly' || out.end === 'ground' ? 'out' : out.end] || 1;
      this.finishPA(out);
    }
    out.count = { b: this.balls, s: this.strikes, o: this.outs };
    return out;
  }

  finishPA(out) {
    const e = out.end, isOut = ['k3', 'k', 'fly', 'ground'].includes(e);
    this.batters++;
    if (isOut) {
      this.outs++; if (e === 'k' || e === 'k3') this.ks++;
      this.outStreak++; this.shrink = Math.max(0, this.shrink - MOOD.outHeal);
    } else {
      this.outStreak = 0;
      if (e === 'walk' || e === 'hbp') { this.walks++; this.walkAdvance(); }
      else {
        this.hits++;
        this.shrink = Math.min(MOOD.cap, this.shrink + (e === 'hr' ? MOOD.hr : MOOD.hit));
        const n = { single: 1, double: 2, triple: 3, hr: 4 }[e];
        this.advance(n);
      }
    }
    this.balls = 0; this.strikes = 0; this.pitchesInPA = 0;
    out.runsNow = this.runs;
    if (this.checkPull(out)) return;
    if (this.outs >= 3) this.endInning(out);
    this.lefty = Math.random() < 0.3;
  }

  // 강판: too many runs in the game or in one inning. Bullpen finishes the game off-screen.
  checkPull(out) {
    if (this.pulled || this.over) return false;
    if (this.runs < this.pullLimit && this.inningRuns < this.bigInning) return false;
    this.pulled = true; out.pulled = { runs: this.runs, inningRuns: this.inningRuns, inning: this.inning };
    const roll = c => { let r = 0; for (let i = 0; i < c.chances; i++) if (Math.random() < c.p) r++; return r; };
    if (this.outs < 3) this.runs += Math.random() < (3 - this.outs) / 3 ? roll(BULLPEN_RUN) : 0;   // rest of this inning
    for (let i = this.inning; i <= this.innings; i++) {
      this.teamRuns += roll(TEAM_RUN);
      if (i > this.inning) this.runs += roll(BULLPEN_RUN);
    }
    this.inning = this.innings; this.outs = 0; this.bases = [0, 0, 0];
    this.over = true; out.gameOver = this.result();
    return true;
  }

  advanceRunnersOnly(n) {                         // wild pitch: runners move, batter stays
    const b = this.bases;
    for (let i = 2; i >= 0; i--) if (b[i]) { if (i + n >= 3) this.runs++; else b[i + n] = 1; b[i] = 0; }
  }

  advance(n) {                                    // hits: everyone moves n bases, batter included
    const b = this.bases; let scored = 0;
    for (let i = 2; i >= 0; i--) if (b[i]) { if (i + n >= 3) scored++; else b[i + n] = 1; b[i] = 0; }
    if (n >= 4) scored++; else b[n - 1] = 1;
    this.runs += scored; this.inningRuns += scored;
  }
  walkAdvance() {                                 // walks only push forced runners
    const b = this.bases;
    if (b[0]) { if (b[1]) { if (b[2]) { this.runs++; this.inningRuns++; } b[2] = 1; } b[1] = 1; }
    b[0] = 1;
  }

  endInning(out) {
    let scored = 0;
    for (let i = 0; i < TEAM_RUN.chances; i++) if (Math.random() < TEAM_RUN.p) scored++;
    this.teamRuns += scored; out.teamScored = scored;
    this.outs = 0; this.bases = [0, 0, 0]; this.shrink = Math.floor(this.shrink / 2); this.inningRuns = 0;
    out.inningOver = this.inning;
    if (this.inning >= this.innings) { this.over = true; out.gameOver = this.result(); }
    else this.inning++;
  }

  // final result + bonus (only the biggest one applies)
  result() {
    const win = this.teamRuns > this.runs, draw = this.teamRuns === this.runs;
    let bonus = 0, label = null;
    if (this.pulled) return { win, draw, bonus: 0, label: null, bonusGold: 0, score: [this.teamRuns, this.runs], pulled: true };
    if (this.bullpen) { if (this.runs === 0) { bonus = GAME_BONUS.bullpen; label = '무실점 투구'; } }
    else if (this.hits + this.walks === 0) { bonus = GAME_BONUS.perfect; label = '퍼펙트게임'; }
    else if (this.hits === 0) { bonus = GAME_BONUS.noHit; label = '노히트노런'; }
    else if (this.runs === 0) { bonus = GAME_BONUS.shutout; label = '완봉'; }
    else if (win) { bonus = GAME_BONUS.cgWin; label = '완투승'; }
    return { win, draw, bonus, label, bonusGold: Math.floor(this.gold * bonus), score: [this.teamRuns, this.runs] };
  }
}

// ---------------- admin: force the next pitch ----------------
// Each preset sets up the count/bases if needed and pins the rolls that lead to the result.
const CLEAN = { miss: false };
const INPLAY = { ...CLEAN, inZone: true, swing: true, contact: true, foul: false };
export const FORCE = {
  k3:     { label: '3구 삼진',   setup: m => { m.balls = 0; m.strikes = 2; m.pitchesInPA = 2; }, F: { ...CLEAN, inZone: true, swing: false } },
  k:      { label: '삼진',       setup: m => { m.strikes = 2; m.pitchesInPA = Math.max(3, m.pitchesInPA); }, F: { ...CLEAN, inZone: true, swing: false } },
  walk:   { label: '볼넷',       setup: m => { m.balls = 3; }, F: { ...CLEAN, inZone: false, swing: false } },
  foul:   { label: '파울',       F: { ...INPLAY, foul: true } },
  fly:    { label: '뜬공 아웃',  F: { ...INPLAY, hit: false, outType: 'fly' } },
  ground: { label: '땅볼 아웃',  F: { ...INPLAY, hit: false, outType: 'ground' } },
  single: { label: '안타',       F: { ...INPLAY, hit: true, type: 'single' } },
  double: { label: '2루타',      F: { ...INPLAY, hit: true, type: 'double' } },
  triple: { label: '3루타',      F: { ...INPLAY, hit: true, type: 'triple' } },
  hr:     { label: '홈런',       F: { ...INPLAY, hit: true, type: 'hr' } },
  wide:   { label: '실투: 빠지는 공', F: { miss: true, wide: true, swing: false, wild: false, hbp: false } },
  middle: { label: '실투: 몰린 공',   F: { miss: true, wide: false } },
  wild:   { label: '폭투',       setup: m => { if (!m.bases.some(Boolean)) m.bases[0] = 1; }, F: { miss: true, wide: true, swing: false, wild: true } },
  hbp:    { label: '데드볼',     F: { miss: true, wide: true, swing: false, wild: false, hbp: true, bench: false } },
  bench:  { label: '벤치클리어링', F: { miss: true, wide: true, swing: false, wild: false, hbp: true, bench: true } },
  pull:   { label: '강판',       setup: m => { m.runs = Math.max(m.runs, m.pullLimit - 1); }, F: { ...INPLAY, hit: true, type: 'hr' } },
  inning: { label: '이닝 종료',  setup: m => { m.outs = 2; }, F: { ...INPLAY, hit: false, outType: 'fly' } },
};
function applyForce(m, key) {
  const f = FORCE[key]; if (!f) return {};
  if (f.setup) f.setup(m);
  return f.F;
}
