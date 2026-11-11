// One game: count, outs, innings, bases, runs, mood. Pure rules — the scene only draws what this returns.
import { TIERS, JUDGE, RESULT_MULT, MOOD, GAME_BONUS, TEAM_RUN, zoneChance } from './config.js';

export class Match {
  constructor({ innings, tier, bullpen = false, exam = false }) {
    Object.assign(this, { innings, tier: TIERS[tier], bullpen, exam });
    this.inning = 1; this.outs = 0; this.balls = 0; this.strikes = 0; this.pitchesInPA = 0;
    this.bases = [0, 0, 0]; this.runs = 0; this.teamRuns = 0;
    this.hits = 0; this.walks = 0; this.ks = 0; this.batters = 0;
    this.shrink = 0;        // 위축 %p added to hit chance
    this.outStreak = 0;     // consecutive outs -> 자신감
    this.gold = 0;          // gold earned during this game (bonus is a % of it)
    this.over = false;
    this.lefty = Math.random() < 0.3;
  }

  get confident() { return this.outStreak >= MOOD.confStreak; }

  // Decide one pitch. lv = pitcher levels. Returns everything the scene needs to draw it.
  pitch(lv) {
    const J = JUDGE, T = this.tier;
    const zone = Math.min(J.maxZone, zoneChance(lv.control) + (this.confident ? MOOD.confZone : 0));
    const inZone = Math.random() < zone;
    const swing = Math.random() < (inZone ? J.swingIn : J.swingOut);
    const out = { inZone, swing, call: null, end: null, mult: 1 };
    this.pitchesInPA++;

    if (!swing) {
      if (inZone) { this.strikes++; out.call = 'strike'; out.mult = 1.1; }
      else { this.balls++; out.call = 'ball'; }
    } else {
      const contact = Math.max(J.minContact, T.contact - J.endPerLv * lv.end);
      if (Math.random() >= contact) { this.strikes++; out.call = 'swingMiss'; out.mult = 1.1; }
      else if (Math.random() < J.foul) {
        out.call = 'foul'; out.mult = 1.1;
        if (this.strikes < 2) this.strikes++;
      } else {
        const hitP = Math.max(J.minHit, T.hit - J.stuffHitPerLv * lv.stuff + this.shrink / 100 - (this.confident ? MOOD.confHit : 0));
        if (Math.random() < hitP) {
          const hrP = Math.max(J.minHr, T.hr - J.stuffHrPerLv * lv.stuff);
          const r = Math.random();
          out.call = 'inplay';
          out.end = r < hrP ? 'hr' : (r < hrP + (1 - hrP) * J.single ? 'single'
                  : r < hrP + (1 - hrP) * (J.single + J.double) ? 'double' : 'triple');
        } else {
          out.call = 'inplay';
          out.end = Math.random() < 0.5 ? 'fly' : 'ground';
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
      if (e === 'walk') { this.walks++; this.walkAdvance(); }
      else {
        this.hits++;
        this.shrink = Math.min(MOOD.cap, this.shrink + (e === 'hr' ? MOOD.hr : MOOD.hit));
        const n = { single: 1, double: 2, triple: 3, hr: 4 }[e];
        this.advance(n);
      }
    }
    this.balls = 0; this.strikes = 0; this.pitchesInPA = 0;
    out.runsNow = this.runs;
    if (this.outs >= 3) this.endInning(out);
    this.lefty = Math.random() < 0.3;
  }

  advance(n) {                                    // hits: everyone moves n bases, batter included
    const b = this.bases; let scored = 0;
    for (let i = 2; i >= 0; i--) if (b[i]) { if (i + n >= 3) scored++; else b[i + n] = 1; b[i] = 0; }
    if (n >= 4) scored++; else b[n - 1] = 1;
    this.runs += scored;
  }
  walkAdvance() {                                 // walks only push forced runners
    const b = this.bases;
    if (b[0]) { if (b[1]) { if (b[2]) this.runs++; b[2] = 1; } b[1] = 1; }
    b[0] = 1;
  }

  endInning(out) {
    let scored = 0;
    for (let i = 0; i < TEAM_RUN.chances; i++) if (Math.random() < TEAM_RUN.p) scored++;
    this.teamRuns += scored; out.teamScored = scored;
    this.outs = 0; this.bases = [0, 0, 0]; this.shrink = Math.floor(this.shrink / 2);
    out.inningOver = this.inning;
    if (this.inning >= this.innings) { this.over = true; out.gameOver = this.result(); }
    else this.inning++;
  }

  // final result + bonus (only the biggest one applies)
  result() {
    const win = this.teamRuns > this.runs, draw = this.teamRuns === this.runs;
    let bonus = 0, label = null;
    if (this.bullpen) { if (this.runs === 0) { bonus = GAME_BONUS.bullpen; label = '무실점 투구'; } }
    else if (this.hits + this.walks === 0) { bonus = GAME_BONUS.perfect; label = '퍼펙트게임'; }
    else if (this.hits === 0) { bonus = GAME_BONUS.noHit; label = '노히트노런'; }
    else if (this.runs === 0) { bonus = GAME_BONUS.shutout; label = '완봉'; }
    else if (win) { bonus = GAME_BONUS.cgWin; label = '완투승'; }
    return { win, draw, bonus, label, bonusGold: Math.floor(this.gold * bonus), score: [this.teamRuns, this.runs] };
  }
}
