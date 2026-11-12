import Phaser from 'phaser';
import { W, H, MULT, PITCH, ANCHOR, MISS, speedKmh, interval, zoneChance, goldMult, missChance,
  STAGE_TIER, STAGE_INNING, STAGE_GAUGE, BULLPEN_STAGE, SEASON_GAMES } from '../config.js';
import { stage, buffMult, examReady, passExam } from '../economy.js';
import { Match } from '../match.js';
import { pickPitch, mods as pitchMods, kmhFor } from '../arsenal.js';
import { PITCH_BY_ID, BREAK, flightFor, breakEase, PITCH_FAMILY, FAMILY_COLOR, THROW, REACT, REACT_DEFS } from '../config.js';
import { drawPixelText, textWidth } from '../pixelfont.js';
import { save } from '../state.js';
import { state, addGold } from '../state.js';
import { sfx } from '../sound.js';
import { fmt } from '../format.js';

const SKIN = [0xecbe96, 0xd6a078, 0xf5cdaa, 0xbe8c69];
const HAIR = [0x28201e, 0x463223, 0x1e1e28];
const SHIRT = [0xeb4646, 0xfafafa, 0x2846a0, 0xf5c846, 0x3c3c3c, 0x78b4e6, 0xe682aa, 0x5aaa5a];

export default class Stadium extends Phaser.Scene {
  constructor() { super('Stadium'); }

  preload() {
    const a = 'assets/';
    this.load.image('bg', a + 'bg_pro.png');
    this.load.image('bgFront', a + 'bg_pro_front.png');
    this.load.image('clouds', a + 'clouds.png');
    for (const k of ['pro', 'elementary'])
      this.load.spritesheet('pitcher_' + k, a + `pitcher_${k}_idle.png`, { frameWidth: 64, frameHeight: 64 });
    for (const t of [...Object.values(THROW), ...REACT_DEFS]) this.load.spritesheet(t.key, a + t.file, { frameWidth: t.w, frameHeight: t.h });
    this.load.spritesheet('mitt', a + 'mitt.png', { frameWidth: 40, frameHeight: 32 });
    this.load.image('emoteMiss', a + 'emote_miss.png');
    this.load.json('crowd', a + 'crowd.json');
    this.load.json('sprites', a + 'sprites.json');
  }

  create() {
    this.cheer = { left: 0, right: 0 };   // crowd cheers until these times
    this.banner = null;                  // scoreboard banner in progress
    // ---- layers: sky -> clouds -> stadium (sky cut out) -> crowd -> pitcher -> ball -> mitt -> fx ----
    this.add.image(0, 0, 'bg').setOrigin(0);
    this.clouds = this.add.tileSprite(0, 4, W, 60, 'clouds').setOrigin(0);
    this.add.image(0, 0, 'bgFront').setOrigin(0);

    this.people = this.cache.json.get('crowd');
    this.crowd = this.add.graphics();
    this.crowdTick = 0;
    this.time.addEvent({ delay: 100, loop: true, callback: () => this.drawCrowd() });
    this.drawCrowd();

    for (const k of ['pro', 'elementary'])
      this.anims.create({ key: 'breathe_' + k, frames: this.anims.generateFrameNumbers('pitcher_' + k, { start: 0, end: 1 }), frameRate: 1.2, repeat: -1 });
    this.pitcher = this.add.sprite(0, 0, 'pitcher_pro', 0);
    this.thrower = this.add.sprite(ANCHOR.mound.x, ANCHOR.mound.feet, '__DEFAULT').setVisible(false);   // pitching motion, swapped in for the idle sprite
    this.applyPitcherArt();
    window.addEventListener('stage-change', () => this.onPromoted());

    // faint strike zone guide
    const z = ANCHOR.zone;
    this.zoneGfx = this.add.graphics().lineStyle(1, 0xffffff, 0.22).strokeRect(z.x0 + 0.5, z.y0 + 0.5, z.x1 - z.x0, z.y1 - z.y0);

    this.trail = this.add.graphics();                       // short afterimage so the break is readable
    this.ball = this.add.image(0, 0, this.makeBallTexture()).setVisible(false);
    this.mitt = this.add.sprite(ANCHOR.mittRest.x, ANCHOR.mittRest.y, 'mitt', 0);

    // scoreboard: speed gun
    const sb = ANCHOR.scoreboard, cx = (sb.x0 + sb.x1) / 2;
    const small = { fontFamily: 'Galmuri9', fontSize: '9px' };
    this.add.text(cx, sb.y0 + 2, '구속', { ...small, color: '#9fc4ff' }).setOrigin(0.5, 0);
    // big number + small unit, bottom-aligned with a margin above the screen's lower edge
    this.speedNum = this.add.text(0, 0, '-', { ...small, color: '#ffffff' }).setOrigin(0, 1).setScale(2);
    this.speedUnit = this.add.text(0, 0, 'km/h', { ...small, color: '#cfd8ea' }).setOrigin(0, 1);
    this.layoutSpeed();

    this.board = this.add.graphics();
    this.boardTop = this.add.text(cx, sb.y0 + 2, '', { ...small, color: '#ffe14a' }).setOrigin(0.5, 0).setVisible(false);
    this.boardSpeed = this.add.text(sb.x1 - 5, sb.y1 - 3, '', { ...small, color: '#cfd8ea' }).setOrigin(1, 1).setVisible(false);
    this.speedLabel = this.children.list.find(o => o.text === '구속');

    this.bannerG = this.add.graphics();

    this.batter = this.makeBatter();
    this.batter.setVisible(false);

    this.makeParticles();
    this.emote = this.add.image(0, 0, 'emoteMiss').setVisible(false);
    this.dim = this.add.rectangle(0, 0, W, H, 0x000814, 1).setOrigin(0).setAlpha(0);
    this.children.moveBelow(this.dim, this.ball);           // dim the stadium, keep ball and mitt bright
    this.flashRect = this.add.rectangle(0, 0, W, H, 0xffffff, 1).setOrigin(0).setAlpha(0);
    this.running = false;
  }

  // center "142 km/h" in the scoreboard screen; shrink the number if it would not fit
  layoutSpeed() {
    const sb = ANCHOR.scoreboard, pad = 6, gap = 2;
    const room = sb.x1 - sb.x0 - pad * 2;
    this.speedNum.setScale(2);
    if (this.speedNum.displayWidth + gap + this.speedUnit.displayWidth > room) this.speedNum.setScale(1);
    const total = this.speedNum.displayWidth + gap + this.speedUnit.displayWidth;
    const x = Math.round((sb.x0 + sb.x1) / 2 - total / 2);
    const bottom = sb.y1 - 5;                       // keep a clear margin at the bottom
    this.speedNum.setPosition(x, bottom);
    this.speedUnit.setPosition(x + this.speedNum.displayWidth + gap, bottom - 2);
  }

  makeBallTexture() {
    const g = this.make.graphics({ x: 0, y: 0, add: false });
    g.fillStyle(0x000000).fillCircle(6, 6, 6);
    g.fillStyle(0xfafafa).fillCircle(6, 6, 5);
    g.fillStyle(0xd8d8d8).fillRect(3, 8, 6, 1);
    g.fillStyle(0xd23c3c).fillRect(3, 3, 1, 1).fillRect(4, 4, 1, 1).fillRect(8, 3, 1, 1).fillRect(7, 4, 1, 1);
    g.generateTexture('ball', 12, 12); g.destroy();
    return 'ball';
  }

  // left stands = our fans, right stands = visitors
  drawCrowd() {
    const g = this.crowd; g.clear();
    const f = this.crowdTick++, now = this.time.now;
    const cheerL = now < this.cheer.left, cheerR = now < this.cheer.right;
    for (const [x, y, s, h, sh, phase, speed] of this.people) {
      const cheering = x < W / 2 ? cheerL : cheerR;
      const bounce = (f + phase) % 4 < 2;
      const up = cheering ? 2 + (bounce ? 1 : 0) : (((f * speed + phase) % 12) < 3 ? 1 : 0);
      const yy = y - up;
      g.fillStyle(HAIR[h]).fillRect(x, yy, 2, 1);
      g.fillStyle(SKIN[s]).fillRect(x, yy + 1, 2, 1);
      g.fillStyle(SHIRT[sh]).fillRect(x, yy + 2, 2, cheering ? 3 : 2);
      if (cheering && bounce) g.fillStyle(SKIN[s]).fillRect(x - 1, yy - 1, 1, 1).fillRect(x + 2, yy - 1, 1, 1);  // arms up
    }
    if (this.banner) this.drawBanner();
  }

  cheerFor(side, ms) {
    const until = this.time.now + ms;
    if (side === 'left' || side === 'both') this.cheer.left = until;
    if (side === 'right' || side === 'both') this.cheer.right = until;
  }

  // ---------------- scoreboard banners ----------------
  showBanner(lines, colors, ms) {
    this.banner = { lines, colors, until: this.time.now + ms, t0: this.time.now };
    this.drawBoard(); this.drawBanner();
    this.time.delayedCall(ms + 20, () => this.drawBanner());   // drawBanner clears itself once expired
  }

  drawBanner() {
    const b = this.banner, g = this.bannerG, sb = ANCHOR.scoreboard;
    g.clear();
    if (!b) return;
    if (this.time.now >= b.until) { this.banner = null; this.drawBoard(); return; }   // expired: back to the score
    const phase = Math.floor((this.time.now - b.t0) / 120);
    g.fillStyle(phase % 2 ? 0x1e2a50 : 0x12193a, 1).fillRect(sb.x0, sb.y0, sb.x1 - sb.x0, sb.y1 - sb.y0);
    const color = b.colors[phase % b.colors.length];
    const scale = 2, lineH = 7 * scale, gap = 4;
    const total = b.lines.length * lineH + (b.lines.length - 1) * gap;
    let y = Math.round(sb.y0 + (sb.y1 - sb.y0 - total) / 2);
    for (const line of b.lines) {
      const x = Math.round((sb.x0 + sb.x1) / 2 - textWidth(line, scale) / 2);
      drawPixelText(g, line, x, y, color, scale);
      y += lineH + gap;
    }
  }

  // ---------------- 실투 / 폭투 / 강판 ----------------
  missReaction() {                      // red "!" beside the face, head shake
    const p = this.pitcher;
    const hx = p.x + 14, hy = p.y - 54;
    this.emote.setPosition(hx, hy).setVisible(true).setScale(0.3).setAlpha(1);
    this.tweens.add({ targets: this.emote, scale: 1, duration: 140, ease: 'Back.easeOut' });
    this.tweens.add({ targets: this.emote, y: hy - 2, duration: 110, yoyo: true, repeat: 2, delay: 140 });
    this.tweens.add({ targets: this.emote, alpha: 0, delay: 800, duration: 200, onComplete: () => this.emote.setVisible(false) });
    const x0 = this.pitcher.x;
    this.tweens.add({ targets: [p, this.thrower], x: { from: x0 - 1, to: x0 + 1 }, duration: 60, yoyo: true, repeat: 3,
      onComplete: () => { p.x = x0; this.thrower.x = x0; } });
    sfx('oops');
  }

  wildPitch(target, out) {              // ball skips past the glove and rolls to the backstop
    const b = this.ball, p = { t: 0 }, sx = target.x, sy = target.y;
    const ex = sx + (sx < 240 ? -70 : 70), ey = H + 30;
    this.tweens.add({ targets: p, t: 1, duration: 420, ease: 'Quad.easeIn',
      onUpdate: () => { b.x = sx + (ex - sx) * p.t; b.y = sy + (ey - sy) * p.t; b.setScale(1.4 + 0.8 * p.t); },
      onComplete: () => b.setVisible(false) });
    this.dust.explode(10, target.x, target.y + 10);
    this.payPitch(out.mult);
    state.pitches++;
    this.popText('WILD PITCH', '#ff8a7a', 150, 196, 2);
    this.showBanner(['WILD', 'PITCH!'], [0xff8a7a, 0xffffff], 1300);
    this.cheerFor('right', 1000);
    sfx('cheer', 0.4);
    this.time.delayedCall(300, () => { this.mitt.setFrame(0); this.tweens.add({ targets: this.mitt, x: ANCHOR.mittRest.x, y: ANCHOR.mittRest.y, duration: 200 }); });
    this.drawBoard(); this.emit();
    this.afterPA(out);                     // walk, or 강판 from a run that scored on the wild pitch
    this.time.delayedCall(260, () => this.pitcher.play(this.breatheKey));
  }

  batterBody(lefty) {                   // where a pitch hits the batter (his side facing the plate)
    return { x: lefty ? 300 : 180, y: Phaser.Math.Between(176, 200) };
  }

  hitByPitch(target, out) {             // 데드볼: ball thumps the batter and drops
    const b = this.ball, bt = this.batter, p = { t: 0 }, sx = target.x, sy = target.y;
    const dir = sx < 240 ? 1 : -1;
    this.tweens.add({ targets: p, t: 1, duration: 380, ease: 'Quad.easeOut',
      onUpdate: () => { b.x = sx + dir * 30 * p.t; b.y = sy - 18 * Math.sin(Math.PI * p.t) + 50 * p.t * p.t; b.setScale(1.3 - 0.4 * p.t); },
      onComplete: () => b.setVisible(false) });
    this.cameras.main.shake(140, 0.007);
    this.starBurst(target.x, target.y, 0.8);
    sfx('thud');
    // batter flinches, hops, then jogs toward first
    const x0 = bt.x;
    this.tweens.add({ targets: bt, angle: { from: 0, to: -dir * 10 }, x: x0 - dir * 6, duration: 90, yoyo: true, hold: 260 });
    this.tweens.add({ targets: bt, y: bt.y - 6, duration: 120, yoyo: true, repeat: 1, delay: 120 });
    this.payPitch(out.mult); state.pitches++;
    this.popText('HIT BY PITCH', '#ff8a7a', 150, 196, 2);
    this.showBanner(['HIT BY', 'PITCH'], [0xff8a7a, 0xffffff], 1400);
    this.cheerFor('right', 900);
    // pitcher tips his cap: a small bow
    this.time.delayedCall(450, () => this.tweens.add({ targets: this.pitcher, y: this.pitcherY + 2, duration: 140, yoyo: true, repeat: 1 }));
    this.time.delayedCall(300, () => { this.mitt.setFrame(0); this.tweens.add({ targets: this.mitt, x: ANCHOR.mittRest.x, y: ANCHOR.mittRest.y, duration: 200 }); });
    this.drawBoard(); this.emit();
    if (out.benchClear) this.time.delayedCall(700, () => this.benchClearing(out));
    else this.afterPA(out);
  }

  // 이스터에그: both dugouts empty onto the field
  benchClearing(out) {
    state.benchClears = (state.benchClears || 0) + 1;
    this.showBanner(['BENCH', 'CLEAR!'], [0xff5a4a, 0xffe14a, 0xffffff], 4600);
    this.cheerFor('both', 4600);
    sfx('cheer', 1); sfx('boom', 0.6);
    this.cameras.main.shake(400, 0.006);
    this.batter.setVisible(false);
    const players = [], spot = () => ({ x: Phaser.Math.Between(196, 284), y: Phaser.Math.Between(150, 176) });
    const make = (team, i) => {
      const ours = team === 'ours';
      const g = this.add.graphics();
      g.fillStyle(0x0b0f1c).fillRect(-3, -15, 7, 16);
      g.fillStyle(ours ? 0xf2f2f2 : 0x9c2b36).fillRect(-2, -14, 5, 9);        // jersey
      g.fillStyle(ours ? 0x1f2d5c : 0x3a3a3a).fillRect(-2, -5, 5, 5);         // pants
      g.fillStyle(0xecbe96).fillRect(-1, -18, 3, 3);                          // face
      g.fillStyle(ours ? 0x1f2d5c : 0x9c2b36).fillRect(-2, -20, 5, 2);        // cap
      const startX = ours ? -10 - i * 6 : W + 10 + i * 6, startY = 150 + (i % 4) * 6;
      g.setPosition(startX, startY);
      const to = spot();
      this.tweens.add({ targets: g, x: to.x, y: to.y, duration: 700 + i * 60, ease: 'Quad.easeOut' });
      // scuffle: jitter in place
      this.tweens.add({ targets: g, x: `+=${Phaser.Math.Between(-3, 3)}`, y: `-=2`, duration: 90, yoyo: true, repeat: 16, delay: 900 + i * 60 });
      // walk back
      this.tweens.add({ targets: g, x: startX, y: startY, duration: 900, delay: 3600 + i * 30, ease: 'Quad.easeIn', onComplete: () => g.destroy() });
      players.push(g);
    };
    for (let i = 0; i < 10; i++) { make('ours', i); make('theirs', i); }
    // dust cloud over the pile-up
    this.time.addEvent({ delay: 120, repeat: 20, startAt: 0, callback: () => this.dust.explode(6, Phaser.Math.Between(205, 275), Phaser.Math.Between(150, 172)) });
    this.time.delayedCall(1000, () => this.popText('벤치클리어링!', '#ffe14a', W / 2, 118, 2));
    window.dispatchEvent(new CustomEvent('easter-egg', { detail: { name: '벤치클리어링', count: state.benchClears } }));
    save();
    this.time.delayedCall(4700, () => this.afterPA(out));
  }

  pullSequence(out) {                   // 강판: the pitcher hangs his head and walks off
    const p = this.pitcher;
    this.batter.setVisible(false);
    this.tweens.add({ targets: this.dim, alpha: 0.35, duration: 300 });
    this.showBanner(['PITCHER', 'CHANGE'], [0xff5a4a, 0xffffff], 2600);
    this.popText('강판...', '#ff8a7a', W / 2, 140, 2);
    this.cheerFor('right', 2000);
    sfx('oops');
    this.stopReaction();
    p.stop();
    this.tweens.add({ targets: p, y: this.pitcherY + 3, duration: 300 });                       // head down
    this.tweens.add({ targets: p, x: W + 50, delay: 800, duration: 1400, ease: 'Sine.easeIn' });  // walks off
    this.time.delayedCall(2700, () => {
      this.tweens.add({ targets: this.dim, alpha: 0, duration: 300 });
      this.endGame(out.gameOver);
    });
  }

  // ---------------- result effects ----------------
  fxStrikeout(k3, target) {
    this.showBanner(['STRIKE', 'OUT!'], [0xffe14a, 0xffffff], k3 ? 1800 : 1400);
    this.cheerFor('left', k3 ? 2000 : 1500);
    sfx('cheer', k3 ? 1 : 0.7);
    // big K over the zone (placeholder until catcher / batter art exists)
    const z = ANCHOR.zone, k = this.add.graphics();
    k.lineStyle(2, 0xffe14a, 1).strokeRect(z.x0, z.y0, z.x1 - z.x0, z.y1 - z.y0);
    drawPixelText(k, 'K', (z.x0 + z.x1) / 2 - 9, (z.y0 + z.y1) / 2 - 14, 0xffe14a, 4);
    this.tweens.add({ targets: k, alpha: { from: 1, to: 0 }, delay: 600, duration: 300, onComplete: () => k.destroy() });
    // pitcher: fist-pump celebration if we have the art, else a happy hop
    if (!this.react('k')) {
      const y0 = this.pitcherY;
      this.tweens.add({ targets: this.pitcher, y: y0 - (k3 ? 7 : 5), duration: 120, yoyo: true, repeat: k3 ? 2 : 1, ease: 'Quad.easeOut',
        onComplete: () => { this.pitcher.y = y0; } });
    }
  }

  fxOut(kind) {
    this.showBanner([kind === 'fly' ? 'FLY' : 'GROUND', 'OUT!'], [0xffe14a, 0xffffff], 1100);
    this.cheerFor('left', 900);
    sfx('cheer', 0.4);
  }

  fxHit(kind) {
    this.react('hit');
    const word = { single: ['HIT!'], double: ['DOUBLE!'], triple: ['TRIPLE!'] }[kind];
    this.showBanner(word, [0xffffff, 0x78c8ff], 1300);
    this.cheerFor('right', kind === 'single' ? 1000 : 1500);
    sfx('cheer', 0.5);
  }

  fxHomeRun() {
    this.showBanner(['HOME', 'RUN!'], [0xff5a4a, 0xffffff], 2000);
    this.cheerFor('right', 2200);
    this.cameras.main.shake(320, 0.008);
    this.flashRect.setAlpha(0.35);
    this.tweens.add({ targets: this.flashRect, alpha: 0, duration: 250 });
    sfx('cheer', 1);
  }

  // ---------------- the pitch loop ----------------
  startLoop() {
    if (this.running) return;
    this.running = true;
    if (STAGE_GAUGE[state.stage] === 0) this.startGame();   // pro: always in a game
    this.pitch();
  }

  emit() { window.dispatchEvent(new CustomEvent('match-update', { detail: this.matchInfo() })); }
  matchInfo() {
    const m = this.match;
    return m ? { mode: 'game', inning: m.inning, innings: m.innings, score: [m.teamRuns, m.runs],
                 balls: m.balls, strikes: m.strikes, outs: this.inBreak ? 3 : m.outs, bases: [...m.bases],
                 exam: m.exam, shrink: m.shrink, confident: m.confident, pro: STAGE_GAUGE[state.stage] === 0 }
             : { mode: 'practice', gauge: state.gauge, max: STAGE_GAUGE[state.stage] };
  }

  startGame() {
    const st = state.stage;
    this.match = new Match({ innings: STAGE_INNING[st], tier: STAGE_TIER[st], bullpen: st === BULLPEN_STAGE, exam: examReady(),
      shrink: state.carryShrink || 0 });
    state.carryShrink = 0;
    this.popText(this.match.exam ? '진급 심사 경기!' : 'PLAY BALL!', '#ffffff', W / 2, 140, 2);
    this.showBatter(true);
    this.drawBoard();
    this.emit();
  }

  // practice gauge, filled by practice pitches
  practicePitchDone() {
    const max = STAGE_GAUGE[state.stage];
    if (!max) return;
    state.gauge = Math.min(max, state.gauge + 1);
    if (state.gauge >= max && state.autoGame) this.pendingGame = true;
    this.emit();
  }
  requestGame() {                       // the HUD's "경기 출전" button
    if (!this.match && state.gauge >= STAGE_GAUGE[state.stage]) this.pendingGame = true;
  }

  pitch() {
    if (!this.running) return;
    if (!this.match && STAGE_GAUGE[state.stage] === 0) this.startGame();               // reached pro: games only
    if (!this.match && this.pendingGame) { this.pendingGame = false; state.gauge = 0; this.startGame(); }
    const T = interval(state.lv.tempo);

    let isStrike, out = null, miss = null;
    const lefty = this.match && this.match.lefty;          // the batter at the plate now (pitch() may roll the next one)
    // pitch type for this throw: its own effect only applies to this pitch
    const ptId = this.forcePitch || pickPitch(this.match ? this.match.strikes : 0); this.forcePitch = null;
    const pt = pitchMods(ptId);
    this.curPitch = ptId; this.curKmh = kmhFor(ptId) + Phaser.Math.Between(-2, 2);
    const flight = flightFor(ptId); this.curFlight = flight;
    const windup = Math.max(PITCH.minWindup, T - flight - PITCH.react);
    if (this.match) { out = this.match.pitch(state.lv, this.forceNext, pt); this.forceNext = null; isStrike = out.inZone; miss = out.miss; }
    else {
      miss = Math.random() < missChance(state.lv.control) ? (Math.random() < MISS.wideShare ? 'wide' : 'middle') : null;
      isStrike = miss === 'middle' ? true : miss === 'wide' ? false : Math.random() < Math.max(0.15, Math.min(0.85, zoneChance(state.lv.control) + pt.zone));
    }
    // target = where the ball really goes, call = where the catcher asked for it
    const target = out && out.end === 'hbp' ? this.batterBody(lefty)
      : miss === 'middle' ? this.pickMiddle() : this.pickTarget(isStrike);
    const call = miss ? this.pickCall(target) : target;

    this.mitt.setFrame(0);
    this.tweens.add({ targets: this.mitt, x: call.x, y: call.y, duration: Math.min(220, windup * 800), ease: 'Sine.easeOut' });
    this.windupMotion(windup, () => this.release(target, isStrike, out, miss));

    // after a ball in play / end of game, give the play time to finish
    let wait = T;
    if (out && (out.call === 'inplay' || out.call === 'foul')) wait += out.call === 'foul' ? 0.5 : 1.3;
    if (out && out.end) wait += 0.5;
    if (out && out.end === 'hr' && REACT[stage().sprite]) wait += 1.2;          // let the despair play out
    else if (out && ['single', 'double', 'triple'].includes(out.end) && REACT[stage().sprite]) wait += 0.4;
    if (out && out.wild) wait += 0.8;
    if (out && out.end === 'hbp') wait += out.benchClear ? 6.5 : 1.2;
    if (out && out.gameOver && out.gameOver.pulled) wait += 4.2;
    if (out && out.gameOver) wait += 2.6;
    else if (out && out.inningOver) wait += 2.2;           // inning break
    this.playing = true;
    this.nextPitch = this.time.delayedCall(wait * 1000, () => this.pitch());
  }

  pickMiddle() {                        // 몰린 공: right over the heart of the plate
    const z = ANCHOR.zone, cx = (z.x0 + z.x1) / 2, cy = (z.y0 + z.y1) / 2, r = Phaser.Math.Between;
    return { x: cx + r(-4, 4), y: cy + r(-4, 4) };
  }
  pickCall(target) {                    // the catcher wanted the opposite corner
    const z = ANCHOR.zone, r = Phaser.Math.Between, cx = (z.x0 + z.x1) / 2, cy = (z.y0 + z.y1) / 2;
    const left = target.x < cx || (Math.abs(target.x - cx) < 6 && Math.random() < 0.5);
    const up = target.y < cy || (Math.abs(target.y - cy) < 6 && Math.random() < 0.5);
    return { x: left ? r(z.x1 - 12, z.x1 - 5) : r(z.x0 + 5, z.x0 + 12), y: up ? r(z.y1 - 12, z.y1 - 5) : r(z.y0 + 5, z.y0 + 12) };
  }

  pickTarget(isStrike) {
    const z = ANCHOR.zone, r = Phaser.Math.Between;
    if (isStrike) return { x: r(z.x0 + 5, z.x1 - 5), y: r(z.y0 + 5, z.y1 - 5) };
    const side = r(0, 3);   // miss left / right / high / low
    if (side === 0) return { x: r(z.x0 - 22, z.x0 - 7), y: r(z.y0, z.y1) };
    if (side === 1) return { x: r(z.x1 + 7, z.x1 + 22), y: r(z.y0, z.y1) };
    if (side === 2) return { x: r(z.x0, z.x1), y: r(z.y0 - 16, z.y0 - 6) };
    return { x: r(z.x0, z.x1), y: r(z.y1 + 6, z.y1 + 16) };
  }

  release(target, isStrike, out, miss = null) {
    sfx('whoosh');
    const flightMs = (this.curFlight || PITCH.flight) * 1000;
    if (miss) {
      this.time.delayedCall(40, () => this.missReaction());
      // catcher lunges late; on a wild pitch he gets there a beat too slow
      const reach = out && out.end === 'hbp' ? { x: (target.x + 240) / 2, y: target.y + 10 }
        : out && out.wild ? { x: target.x + (target.x < 240 ? 14 : -14), y: target.y - 6 } : target;
      this.tweens.add({ targets: this.mitt, x: reach.x, y: reach.y, delay: flightMs * 0.45,
        duration: flightMs * 0.55, ease: 'Quad.easeOut' });
    }
    if (out && out.swing) this.time.delayedCall(flightMs * 0.6, () => this.swing());
    const from = this.releasePoint();
    const b = this.ball.setVisible(true).setPosition(from.x, from.y).setScale(0.32);
    const p = { t: 0 };
    const br = BREAK[this.curPitch] || BREAK.fastball, trail = [];
    const fam = PITCH_FAMILY[this.curPitch] || 'fast', col = FAMILY_COLOR[fam], offspeed = fam !== 'fast';
    if (offspeed) this.pitchLabel(PITCH_BY_ID[this.curPitch].name, col, flightMs);
    // strike three: the last stretch plays in slow motion, the screen dims, then everything hits at once
    const isK = out && (out.end === 'k' || out.end === 'k3');
    const slowEase = t => (t < 0.35 ? Math.pow(t / 0.35, 2) * 0.62 : 0.62 + 0.38 * Math.pow((t - 0.35) / 0.65, 1.4));
    // speed: a fastball flies at an even pace; the bigger the break, the more it eases mid-flight
    // (tuned so the fastest moment is never more than ~2.5x the slowest)
    const ea = breakEase(br);
    const outIn = t => t + ea * Math.sin(2 * Math.PI * t) / (2 * Math.PI);
    if (isK) {
      this.time.delayedCall(flightMs * 0.5, () => {
        this.dim.setAlpha(0);
        this.tweens.add({ targets: this.dim, alpha: out.end === 'k3' ? 0.45 : 0.35, duration: 180 });
      });
    }
    this.tweens.add({
      targets: p, t: 1, duration: flightMs * (isK ? 2.2 : 1.1), ease: isK ? slowEase : outIn,
      onUpdate: () => {
        const t = p.t, f = Math.sin(Math.PI * Math.pow(t, br.k));
        let ox = br.dx * f, oy = br.dy * f;
        if (br.wobble) { const w = Math.sin(Math.PI * t); ox += br.wobble * Math.sin(t * 31) * w; oy += br.wobble * 0.7 * Math.sin(t * 23 + 1) * w; }
        b.x = from.x + (target.x - from.x) * t + ox;
        b.y = from.y + (target.y - from.y) * t + oy;
        b.setScale(0.32 + 1.08 * t);
        b.setAngle(t * (this.curPitch === 'gyro' ? 1440 : 540));
        trail.push([b.x, b.y, b.scale]); if (trail.length > 9) trail.shift();
        this.trail.clear();
        // dark rim that never shrinks below ~2.5px, so the white ball stays visible over the white jersey
        this.trail.fillStyle(0x0b1020, 0.85).fillCircle(b.x, b.y, Math.max(2.6, 6 * b.scale + 1));
        // trail: faint white for fastballs, coloured and stronger for off-speed pitches
        trail.forEach(([x, y, sc], i) => this.trail.fillStyle(col, offspeed ? 0.1 + 0.07 * i : 0.04 + 0.03 * i)
          .fillCircle(x, y, 4 * sc * (0.5 + i / 18)));
        // drop pitches: downward streaks over the last stretch and a small pop as it dives
        if (fam === 'drop' && t > 0.68) {
          const a = Math.min(1, (t - 0.68) / 0.2), r = 5 * b.scale;
          for (const ox of [-r * 0.9, 0, r * 0.9]) this.trail.lineStyle(1.5, col, 0.85 * a).lineBetween(b.x + ox, b.y - r - 3 - 10 * a, b.x + ox, b.y - r - 2);
          if (t > 0.82) b.setScale(b.scale * (1 + 0.14 * Math.sin(Math.PI * (t - 0.82) / 0.18)));
        }
      },
      onComplete: () => {
        b.setAngle(0); this.trail.clear(); this.endThrow();
        if (out && out.wild) this.wildPitch(target, out);
        else if (out && out.end === 'hbp') this.hitByPitch(target, out);
        else if (out && (out.call === 'foul' || out.call === 'inplay')) this.contact(target, out);
        else this.caught(target, isStrike, out);
      },
    });
  }

  caught(target, isStrike, out = null) {
    this.time.delayedCall(450, () => { if (!(out && out.end)) this.playing = false; });
    this.ball.setVisible(false);
    this.mitt.setFrame(1);
    const kmh = this.curKmh;
    const power = Phaser.Math.Clamp((kmh - 80) / 80, 0.6, 1.2);

    // ---- the "pop": everything lands on the same frame ----
    const isK = out && (out.end === 'k' || out.end === 'k3'), k3 = out && out.end === 'k3';
    const juice = isK ? (k3 ? 2.2 : 1.8) : isStrike ? 1 : 0.6;   // strikeouts hit hardest, balls softest
    this.dim.setAlpha(0);
    this.hitStop(isK ? (k3 ? 200 : 160) : isStrike ? 70 : 45);
    this.cameras.main.shake(isK ? 260 : 90, isK ? 0.012 * juice : 0.006 * power * juice);
    this.zoomPunch(isK ? 0.09 : 0.03 * juice);
    this.flashRect.setAlpha(isK ? 0.5 : 0.22 * juice);
    this.tweens.add({ targets: this.flashRect, alpha: 0, duration: isK ? 220 : 110 });
    this.mittRecoil(target, juice);
    this.impactRing(target.x, target.y, isStrike ? 0xffe14a : 0xffffff, juice);
    if (isK) this.time.delayedCall(90, () => this.impactRing(target.x, target.y, 0xffffff, juice * 1.3));
    this.starBurst(target.x, target.y, juice);
    if (isK) this.speedLines(target.x, target.y, juice);
    this.sparks.explode(isK ? 34 : isStrike ? 16 : 8, target.x, target.y);
    this.dust.explode(isK ? 16 : 6, target.x, target.y + 2);
    sfx('mitt', isK ? 1.5 : power * (0.85 + 0.15 * juice));
    if (isK) sfx('boom', k3 ? 1 : 0.8);
    sfx(isStrike ? 'strike' : 'ball');

    // gold
    const mult = out ? out.mult : (isStrike ? MULT.strike : MULT.ball);
    const gold = this.payPitch(mult);
    state.pitches++; if (isStrike) state.strikes++;
    this.lastKmh = kmh;

    if (out) {
      const label = { k3: 'STRIKE OUT!', k: 'STRIKE OUT!', walk: 'BALL FOUR' }[out.end]
        || (out.call === 'ball' ? 'BALL' : 'STRIKE!');
      const color = out.end === 'walk' || out.call === 'ball' ? '#d8dde8' : '#ffe14a';
      this.popText(label, color, 150, 196, out.end ? 2.4 : 2);
      if (out.end === 'k3') this.popText('3구 삼진 x2', '#ffb347', 150, 214, 1);
      if (out.end === 'k' || out.end === 'k3') this.fxStrikeout(out.end === 'k3', target);
      if (out.end === 'walk') this.showBanner(['BALL', 'FOUR'], [0xd8dde8, 0x9fc4ff], 1100);
      this.afterPA(out);
    } else {
      this.popText(isStrike ? 'STRIKE!' : 'BALL', isStrike ? '#ffe14a' : '#d8dde8', 150, 196, 2);
      this.practicePitchDone();
    }
    this.lastPitch = this.curPitch;
    if (this.speedLabel) this.speedLabel.setText(PITCH_BY_ID[this.curPitch].name);
    this.speedNum.setText(String(kmh));
    this.layoutSpeed();
    this.drawBoard(); this.emit();
    this.goldPop(`+${fmt(gold)}`, target.x, target.y - 16);

    // glove settles back
    this.time.delayedCall(260, () => {
      this.mitt.setFrame(0);
      this.tweens.add({ targets: this.mitt, x: ANCHOR.mittRest.x, y: ANCHOR.mittRest.y, duration: 200 });
      this.pitcher.play(this.breatheKey);
    });
  }

  payPitch(mult) {
    const gold = Math.floor(stage().base * goldMult(state.lv.speed) * mult * buffMult());
    addGold(gold);
    if (this.match) this.match.gold += gold;
    window.dispatchEvent(new CustomEvent('gold-pop'));
    return gold;
  }

  // a batted ball: foul back over the catcher, or into the field
  contact(target, out) {
    this.ball.setVisible(true);
    const kmh = this.curKmh;
    this.lastKmh = kmh; this.lastPitch = this.curPitch; this.speedNum.setText(String(kmh)); this.layoutSpeed();
    if (this.speedLabel) this.speedLabel.setText(PITCH_BY_ID[this.curPitch].name);
    this.cameras.main.shake(60, 0.004);
    sfx('bat');
    const gold = this.payPitch(out.mult);
    state.pitches++;
    this.goldPop(`+${fmt(gold)}`, target.x, target.y - 16);

    const r = Phaser.Math.Between;
    const PATHS = {             // end point, arc height, duration ms, end scale
      foul:   [target.x + (Math.random() < .5 ? -1 : 1) * r(60, 120), -30, 30, 380, 1.8],
      fly:    [r(150, 330), r(126, 140), 70, 950, 0.25],
      ground: [r(170, 310), r(166, 176), 4, 520, 0.4],
      single: [r(130, 350), r(140, 150), 18, 650, 0.3],
      double: [Math.random() < .5 ? r(70, 120) : r(360, 410), r(124, 132), 34, 800, 0.25],
      triple: [Math.random() < .5 ? r(20, 60) : r(420, 460), r(118, 126), 40, 900, 0.22],
      hr:     [r(60, 420), r(88, 100), 125, 1150, 0.18],
    };
    const key = out.call === 'foul' ? 'foul' : out.end;
    const [ex, ey, h, dur, endScale] = PATHS[key];
    const b = this.ball, sx = target.x, sy = target.y, p = { t: 0 };
    this.tweens.add({ targets: p, t: 1, duration: dur, ease: key === 'foul' ? 'Quad.easeIn' : 'Sine.easeOut',
      onUpdate: () => {
        const t = p.t;
        b.x = sx + (ex - sx) * t; b.y = sy + (ey - sy) * t - h * 4 * t * (1 - t);
        b.setScale(1.4 + (endScale - 1.4) * t);
      },
      onComplete: () => b.setVisible(false),
    });

    const LABEL = { fly: ['FLY OUT', '#ffe14a'], ground: ['GROUND OUT', '#ffe14a'], single: ['HIT', '#ff8a7a'],
      double: ['TWO-BASE HIT', '#ff8a7a'], triple: ['THREE-BASE HIT', '#ff8a7a'], hr: ['HOME RUN', '#ff5a4a'] };
    if (key === 'foul') this.popText('FOUL', '#d8dde8', 150, 196, 2);
    else this.time.delayedCall(dur * 0.6, () => this.popText(LABEL[key][0], LABEL[key][1], 150, 196, 2.4));
    if (key === 'hr') this.time.delayedCall(350, () => this.react('hr'));
    if (key === 'hr') { this.flashRect.setAlpha(0.25); this.tweens.add({ targets: this.flashRect, alpha: 0, duration: 150 }); }
    const landing = key === 'hr' ? dur * 0.95 : dur * 0.6;
    if (key === 'fly' || key === 'ground') this.time.delayedCall(landing, () => this.fxOut(key));
    if (key === 'single' || key === 'double' || key === 'triple') this.time.delayedCall(landing, () => this.fxHit(key));
    if (key === 'hr') this.time.delayedCall(landing, () => this.fxHomeRun());
    // a 강판 waits until the hit's own effect has played, so the order reads hit -> PITCHER CHANGE
    const pulled = out.gameOver && out.gameOver.pulled;
    if (out.end) this.time.delayedCall(pulled ? landing + 1500 : dur * 0.6, () => this.afterPA(out));
    this.drawBoard(); this.emit();
    this.time.delayedCall(260, () => this.pitcher.play(this.breatheKey));
  }

  // end of an at-bat: new batter, inning / game over
  afterPA(out) {
    if (!out.end && !out.gameOver) return;
    this.emit();
    if (out.gameOver && out.gameOver.pulled) { this.pullSequence(out); return; }
    if (out.gameOver) { this.time.delayedCall(500, () => this.endGame(out.gameOver)); return; }
    if (out.inningOver) { this.inningBreak(out); return; }
    this.time.delayedCall(350, () => this.showBatter(false));
  }

  // 3 outs: stop for a beat so the change is obvious
  inningBreak(out) {
    const done = out.inningOver, next = done + 1;
    this.inBreak = true;
    this.emit();
    window.dispatchEvent(new CustomEvent('inning-change', { detail: { done, next, scored: out.teamScored } }));

    // batter walks off
    this.tweens.add({ targets: this.batter, x: this.batter.scaleX < 0 ? W + 40 : -40, duration: 300, ease: 'Quad.easeIn' });

    // banner band across the field
    const band = this.add.rectangle(W / 2, 150, W, 34, 0x0b1020, 0.85).setScale(1, 0);
    const line1 = this.add.rectangle(W / 2, 133, W, 2, 0xffe14a).setScale(0, 1);
    const line2 = this.add.rectangle(W / 2, 167, W, 2, 0xffe14a).setScale(0, 1);
    const t = this.add.text(W / 2, 150, `${done}회 종료`, { fontFamily: 'Galmuri11', fontSize: '11px', color: '#ffffff', stroke: '#000', strokeThickness: 2 })
      .setOrigin(0.5).setScale(2).setAlpha(0);
    this.tweens.add({ targets: band, scaleY: 1, duration: 180, ease: 'Quad.easeOut' });
    this.tweens.add({ targets: [line1, line2], scaleX: 1, duration: 260, ease: 'Quad.easeOut' });
    this.tweens.add({ targets: t, alpha: 1, duration: 150, delay: 120 });
    this.time.delayedCall(800, () => {
      t.setText(out.teamScored ? `우리 팀 ${out.teamScored}득점!` : `${next}회 시작`).setColor(out.teamScored ? '#ffe14a' : '#9fc4ff');
      if (out.teamScored) { this.cameras.main.flash(120, 255, 240, 160); sfx('promote'); }
    });
    if (out.teamScored) this.time.delayedCall(1400, () => t.setText(`${next}회 시작`).setColor('#9fc4ff'));
    this.time.delayedCall(1900, () => {
      this.tweens.add({ targets: [band, line1, line2, t], alpha: 0, duration: 200, onComplete: () => [band, line1, line2, t].forEach(o => o.destroy()) });
    });

    // scoreboard blinks
    const sb = ANCHOR.scoreboard;
    const glow = this.add.rectangle(sb.x0, sb.y0, sb.x1 - sb.x0, sb.y1 - sb.y0, 0xffffff, 0).setOrigin(0);
    this.tweens.add({ targets: glow, alpha: { from: 0.55, to: 0 }, duration: 220, repeat: 3, onComplete: () => glow.destroy() });
    sfx('inning');
    this.showBanner(['CHANGE'], [0x9fc4ff, 0xffffff], 1900);

    this.time.delayedCall(2100, () => { this.inBreak = false; this.drawBoard(); this.emit(); this.showBatter(false); });
  }

  endGame(res) {
    const m = this.match;
    if (res.bonusGold) { addGold(res.bonusGold); window.dispatchEvent(new CustomEvent('gold-pop')); }
    state.record[res.win ? 'w' : res.draw ? 'd' : 'l']++;
    window.dispatchEvent(new CustomEvent('game-over', { detail: { ...res, exam: m.exam } }));
    this.popText(res.win ? 'WIN!' : res.draw ? 'DRAW' : 'LOSE', res.win ? '#ffe14a' : '#d8dde8', W / 2, 130, 3);
    this.showBanner([res.win ? 'WIN!' : res.draw ? 'DRAW' : 'LOSE'], res.win ? [0xffe14a, 0xffffff] : [0xd8dde8, 0x7a86a6], 2200);
    this.cheerFor(res.win ? 'left' : res.draw ? 'both' : 'right', 2200);
    if (res.win) sfx('cheer', 1);
    this.match = null;
    this.batter.setVisible(false);
    const pro = STAGE_GAUGE[state.stage] === 0;
    if (pro) state.seasonGame = (state.seasonGame + 1) % SEASON_GAMES;
    if (m.exam && res.win && !res.pulled) this.time.delayedCall(900, () => passExam());
    if (res.pulled) state.carryShrink = Math.min(15, Math.floor(m.shrink / 2) + 3);   // shaken going into the next game
    save();
    this.time.delayedCall(2200, () => {
      this.pitcher.setAlpha(1); this.applyPitcherArt();       // back on the mound after a 강판
      if (STAGE_GAUGE[state.stage] === 0) this.startGame();   // pro: next game right away
      this.drawBoard(); this.emit();
    });
  }

  // ---------------- scoreboard ----------------
  drawBoard() {
    const g = this.board, sb = ANCHOR.scoreboard, m = this.match;
    g.clear();
    const inGame = !!m && !this.banner;
    if (this.banner) { this.boardTop.setVisible(false); this.boardSpeed.setVisible(false); this.speedNum.setVisible(false);
      this.speedUnit.setVisible(false); if (this.speedLabel) this.speedLabel.setVisible(false); this.hideBoardLabels(); return; }
    this.boardTop.setVisible(inGame); this.boardSpeed.setVisible(inGame);
    this.speedNum.setVisible(!inGame); this.speedUnit.setVisible(!inGame);
    if (this.speedLabel) this.speedLabel.setVisible(!inGame);
    if (!inGame) { this.hideBoardLabels(); return; }
    this.boardTop.setText(`${m.inning}회   ${m.teamRuns} : ${m.runs}`);
    this.boardSpeed.setText(this.lastKmh ? `${PITCH_BY_ID[this.lastPitch || 'fastball'].abbr} ${this.lastKmh}km/h` : '');
    const row = (y, n, lit, color, label) => {
      this.boardLabels = this.boardLabels || {};
      const x0 = sb.x0 + 8;
      if (!this.boardLabels[label]) this.boardLabels[label] = this.add.text(x0, y - 1, label, { fontFamily: 'Galmuri9', fontSize: '9px', color: '#cfd8ea' }).setOrigin(0, 0);
      this.boardLabels[label].setVisible(true);
      for (let i = 0; i < n; i++) {
        g.fillStyle(i < lit ? color : 0x2d3a5e).fillCircle(x0 + 14 + i * 9, y + 4, 3);
      }
    };
    const top = sb.y0 + 14;
    row(top, 3, m.balls, 0x5ad25a, 'B');
    row(top + 8, 2, m.strikes, 0xffd23c, 'S');
    row(top + 16, 2, m.outs, 0xeb4646, 'O');
    // bases diamond, right side
    const bx = sb.x1 - 22, by = sb.y0 + 22;
    const base = (x, y, on) => { g.fillStyle(on ? 0xffe14a : 0x2d3a5e).fillRect(x - 2, y - 2, 5, 5); };
    base(bx + 7, by, m.bases[0]); base(bx, by - 7, m.bases[1]); base(bx - 7, by, m.bases[2]);
  }
  hideBoardLabels() { if (this.boardLabels) Object.values(this.boardLabels).forEach(t => t.setVisible(false)); }

  // ---------------- batter (placeholder silhouette until real sprites) ----------------
  makeBatter() {
    const c = this.add.container(0, 0);
    const body = this.add.graphics();
    const fill = 0x27304d, rim = 0x0b0f1c, helmet = 0x1b2138;
    body.fillStyle(rim).fillRoundedRect(-20, -62, 18, 64, 4).fillRoundedRect(4, -62, 18, 64, 4);
    body.fillStyle(fill).fillRoundedRect(-18, -60, 14, 60, 3).fillRoundedRect(6, -60, 14, 60, 3);
    body.fillStyle(rim).fillRoundedRect(-24, -116, 50, 60, 10);
    body.fillStyle(fill).fillRoundedRect(-22, -114, 46, 56, 9);
    body.fillStyle(0x323c60).fillRect(-14, -104, 4, 40);                    // back highlight
    body.fillStyle(rim).fillCircle(2, -126, 16);
    body.fillStyle(helmet).fillCircle(2, -126, 14);
    body.fillStyle(0x3a4670).fillCircle(-4, -132, 4);                        // helmet shine
    body.fillStyle(rim).fillRect(2, -126, 18, 5);                            // brim
    const bat = this.add.graphics();
    bat.fillStyle(rim).fillRoundedRect(-3, -66, 7, 68, 3);
    bat.fillStyle(0xc89a5a).fillRoundedRect(-2, -64, 5, 64, 2);
    bat.fillStyle(0x8a6436).fillRect(-2, -8, 5, 8);                          // grip
    const batC = this.add.container(16, -100, [bat]).setAngle(-35);
    const arms = this.add.graphics().fillStyle(rim).fillRoundedRect(4, -110, 16, 12, 5).fillStyle(fill).fillRoundedRect(5, -109, 14, 10, 4);
    c.add([body, batC, arms]);
    c.bat = batC;
    c.setAlpha(0.96);
    return c;
  }

  showBatter(first) {
    const m = this.match; if (!m) return;
    const lefty = m.lefty, b = this.batter;
    const x = lefty ? 322 : 158, from = lefty ? W + 40 : -40;
    b.setVisible(true).setScale(lefty ? -1 : 1, 1).setPosition(first ? x : from, 276);
    b.bat.setAngle(-35);
    if (!first) this.tweens.add({ targets: b, x, duration: 320, ease: 'Quad.easeOut' });
    this.drawBoard();
  }

  swing() {
    const b = this.batter; if (!b.visible) return;
    sfx('swing');
    this.tweens.add({ targets: b.bat, angle: { from: -35, to: 200 }, duration: 110, ease: 'Quad.easeIn',
      onComplete: () => this.tweens.add({ targets: b.bat, angle: -35, delay: 280, duration: 200 }) });
    this.tweens.add({ targets: b, angle: { from: 0, to: -4 }, duration: 110, yoyo: true, hold: 200 });
  }

  // ---------------- pitcher art & promotion ----------------
  // ---------------- admin tools ----------------
  // jump straight to a stage: drop any game in progress, reset the gauge, swap the pitcher art
  adminJump(i) {
    this.match = null; this.inBreak = false; this.pendingGame = false;
    this.batter.setVisible(false);
    state.stage = i; state.gauge = 0; save();
    this.applyPitcherArt();
    if (STAGE_GAUGE[i] === 0) this.startGame();
    this.drawBoard(); this.emit();
    window.dispatchEvent(new CustomEvent('gold-pop'));
    this.popText(`${stage().name} (관리자 이동)`, '#9fc4ff', W / 2, 140, 1.5);
  }
  adminForce(key) {                     // the next pitch will be this result (starts a game if needed)
    if (!this.match) { state.gauge = 0; this.startGame(); }
    this.forceNext = key;
    // if the current pitch is already caught and we're only waiting, throw the forced one right away
    const t = this.nextPitch;
    if (t && !this.inBreak && !this.playing && t.getRemaining() > 400) { t.remove(false); this.nextPitch = this.time.delayedCall(300, () => this.pitch()); }
  }
  adminPitch(id) { this.forcePitch = id; }
  // ---------------- pitching motion ----------------
  releasePoint() {                      // where the ball leaves the hand
    const t = this.throwDef;
    if (!t) return ANCHOR.release;
    return { x: ANCHOR.mound.x + (t.ball.x - t.cx), y: ANCHOR.mound.feet - (t.feet - t.ball.y) };
  }

  windupMotion(windup, onRelease) {
    const t = this.throwDef, ms = windup * 1000;
    this.pitcher.stop();
    if (!t) {
      // no motion art yet: crouch, then spring up and lean in as the ball goes
      const p = this.pitcher;
      this.tweens.add({ targets: p, y: this.pitcherY + 2, scaleY: 0.94, scaleX: 1.03, duration: ms * 0.8, ease: 'Sine.easeInOut',
        onComplete: () => {
          p.y = this.pitcherY; p.setScale(0.93, 1.08);
          this.tweens.add({ targets: p, scaleX: 1, scaleY: 1, duration: 200, ease: 'Back.easeOut' });
          onRelease();
        } });
      return;
    }
    const th = this.thrower;
    this.stopReaction(false);
    this.pitcher.setVisible(false);
    th.setTexture(t.key, 0).setOrigin(t.cx / t.w, t.feet / t.h)
      .setVisible(true).setScale(1).setPosition(ANCHOR.mound.x, ANCHOR.mound.feet);
    const prog = { f: 0 }, last = t.release;
    this.tweens.add({ targets: prog, f: last + 0.999, duration: ms, ease: 'Linear',
      onUpdate: () => {
        const f = Math.floor(prog.f); th.setFrame(f);
        // stretch a little while the leg is up, coil just before release
        const [a, b] = t.legLift;
        const lift = f >= a && f <= b ? Math.sin(Math.PI * (f - a + 1) / (b - a + 2)) : 0;
        const coil = f >= last - 1 ? 1 : 0;
        th.setScale(1 - 0.03 * lift + 0.05 * coil, 1 + 0.06 * lift - 0.06 * coil);
      },
      onComplete: () => {
        // release: snap forward, then spring back while the follow-through plays during the flight
        th.setScale(1.1, 0.9).setY(ANCHOR.mound.feet + 2);
        this.tweens.add({ targets: th, scaleX: 1, scaleY: 1, y: ANCHOR.mound.feet, duration: 220, ease: 'Back.easeOut' });
        const follow = { i: 0 }, flightMs = (this.curFlight || 0.32) * 1000;
        th.setFrame(t.follow[0]);
        this.tweens.add({ targets: follow, i: t.follow.length - 0.001, duration: flightMs * 1.1,
          onUpdate: () => { if (th.visible) th.setFrame(t.follow[Math.floor(follow.i)]); } });
        onRelease();
      } });
  }

  endThrow() {                          // back to the idle sprite once the ball arrives
    if (!this.thrower.visible) return;
    this.time.delayedCall(120, () => {
      if (this.celebrating) return;     // the strikeout celebration owns the sprite now
      this.thrower.setVisible(false).setScale(1);
      this.pitcher.setVisible(true).setScale(1).setPosition(ANCHOR.mound.x, this.pitcherY);
    });
  }

  // pitcher reaction (k / hit / hr): plays that strip if this pitcher has one, else returns false
  react(kind) {
    const c = (REACT[stage().sprite] || {})[kind];
    if (!c) return false;
    this.stopReaction(false);
    const th = this.thrower;
    this.celebrating = true;
    this.pitcher.setVisible(false);
    th.setTexture(c.key, 0).setOrigin(c.cx / c.w, c.feet / c.h).setScale(1).setVisible(true)
      .setPosition(ANCHOR.mound.x, ANCHOR.mound.feet);
    const prog = { f: 0 };
    this.celebrateTween = this.tweens.add({ targets: prog, f: c.frames - 0.001, duration: c.ms,
      onUpdate: () => { if (this.celebrating) th.setFrame(Math.floor(prog.f)); },
      onComplete: () => { this.celebrateTween = null; this.stopReaction(); } });
    return true;
  }

  stopReaction(showIdle = true) {       // cut a reaction short (next windup, 강판, stage change)
    if (this.celebrateTween) { this.celebrateTween.stop(); this.celebrateTween = null; }
    if (!this.celebrating) return;
    this.celebrating = false;
    if (showIdle) { this.thrower.setVisible(false); this.pitcher.setVisible(true).setScale(1).setPosition(ANCHOR.mound.x, this.pitcherY); }
  }

  pitchLabel(name, col, flightMs) {     // the pitch name pops out by the pitcher's hand as it is released
    const r = this.releasePoint();
    const t = this.add.text(r.x + 16, r.y - 12, name, { fontFamily: 'Galmuri11', fontSize: '11px',
      color: '#' + col.toString(16).padStart(6, '0'), stroke: '#000', strokeThickness: 2,
      backgroundColor: 'rgba(8,12,24,0.72)', padding: { x: 3, y: 1 } }).setOrigin(0, 0.5).setScale(0.6);
    this.tweens.add({ targets: t, scale: 1, duration: 120, ease: 'Back.easeOut' });
    this.tweens.add({ targets: t, alpha: 0, y: t.y - 6, delay: flightMs * 0.9, duration: 260, onComplete: () => t.destroy() });
  }

  previewPitch(id, target = { x: 240, y: 208 }) {   // throw one pitch of this type at a fixed spot (trajectory check)
    this.curPitch = id; this.curFlight = flightFor(id); this.release(target, true, null, null);
  }
  adminMood(kind) {
    const m = this.match; if (!m) return;
    if (kind === 'shrink') { m.shrink = 15; m.outStreak = 0; } else { m.shrink = 0; m.outStreak = 3; }
    this.emit();
  }
  adminStartGame() { if (!this.match) { state.gauge = 0; this.startGame(); } }
  adminEndGame(win) {
    const m = this.match; if (!m) return;
    if (win) m.teamRuns = m.runs + 1; else m.runs = m.teamRuns + 1;
    m.over = true; this.endGame(m.result());
  }

  applyPitcherArt() {
    const key = stage().sprite, meta = this.cache.json.get('sprites')['pitcher_' + key];
    this.throwDef = THROW[key] || null;
    this.stopReaction(false);
    this.thrower.setVisible(false);
    this.pitcher.setVisible(true);
    if (this.throwDef) this.thrower.setTexture(this.throwDef.key, 0)
      .setOrigin(this.throwDef.cx / this.throwDef.w, this.throwDef.feet / this.throwDef.h).setPosition(ANCHOR.mound.x, ANCHOR.mound.feet);
    this.breatheKey = 'breathe_' + key;
    this.pitcher.setTexture('pitcher_' + key, 0).setOrigin(meta.originX, 1)
      .setPosition(ANCHOR.mound.x, ANCHOR.mound.feet + (63 - meta.feet));
    this.pitcherY = this.pitcher.y;
    this.pitcher.play(this.breatheKey);
  }

  onPromoted() {
    this.applyPitcherArt();
    this.flashRect.setAlpha(0.6);
    this.tweens.add({ targets: this.flashRect, alpha: 0, duration: 400 });
    this.cameras.main.shake(160, 0.006);
    this.confetti.explode(60, W / 2, 40);
    const t = this.add.text(W / 2, 120, `${stage().name} 진급!`, { fontFamily: 'Galmuri11', fontSize: '11px', color: '#ffe14a', stroke: '#000', strokeThickness: 3 })
      .setOrigin(0.5).setScale(0.5);
    this.tweens.add({ targets: t, scale: 2.4, duration: 280, ease: 'Back.easeOut' });
    this.tweens.add({ targets: t, alpha: 0, y: 104, delay: 1600, duration: 500, onComplete: () => t.destroy() });
    this.tweens.add({ targets: this.pitcher, y: this.pitcherY - 8, duration: 160, yoyo: true, repeat: 1, ease: 'Quad.easeOut' });
    sfx('promote');
  }

  // ---------------- juice helpers ----------------
  hitStop(ms) {                         // freeze motion for a beat
    this.tweens.timeScale = 0;
    this.anims.pauseAll();
    setTimeout(() => { this.tweens.timeScale = 1; this.anims.resumeAll(); }, ms);
  }

  zoomPunch(amount) {                   // quick push-in toward the mitt
    const cam = this.cameras.main;
    cam.setZoom(1 + amount);
    this.tweens.add({ targets: cam, zoom: 1, duration: 140, ease: 'Quad.easeOut' });
  }

  mittRecoil(target, juice) {           // glove gets shoved back, squashes, springs back
    const m = this.mitt;
    const sq = Math.min(0.32, 0.14 * juice);
    m.setPosition(target.x, target.y + 3 * juice).setScale(1 + sq * 1.3, 1 - sq);
    this.tweens.add({ targets: m, y: target.y, scaleX: 1, scaleY: 1, duration: 160 + 60 * Math.max(0, juice - 1), ease: 'Back.easeOut' });
  }

  speedLines(x, y, juice) {             // white streaks rushing into the mitt
    const g = this.add.graphics();
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2 + Math.random() * 0.2, r0 = 40 + Math.random() * 30, r1 = 16 + Math.random() * 6;
      g.lineStyle(i % 2 ? 1 : 2, 0xffffff, 0.9)
        .lineBetween(x + Math.cos(a) * r0 * 1.6, y + Math.sin(a) * r0, x + Math.cos(a) * r1 * 1.6, y + Math.sin(a) * r1);
    }
    this.tweens.add({ targets: g, alpha: 0, duration: 260 * juice / 1.8, onComplete: () => g.destroy() });
  }

  starBurst(x, y, juice) {              // 2-frame white cross flash right on the ball
    const g = this.add.graphics({ x, y }).fillStyle(0xffffff, 1);
    const L = Math.round(8 + 8 * juice);
    g.fillRect(-L, -1, L * 2, 2).fillRect(-1, -L, 2, L * 2);
    g.fillRect(-L / 2, -L / 2, 2, 2).fillRect(L / 2 - 2, -L / 2, 2, 2).fillRect(-L / 2, L / 2 - 2, 2, 2).fillRect(L / 2 - 2, L / 2 - 2, 2, 2);
    this.time.delayedCall(70, () => g.destroy());
  }

  impactRing(x, y, color, juice) {
    const ring = this.add.circle(x, y, 6, color, 0).setStrokeStyle(3, color, 1);
    this.tweens.add({ targets: ring, radius: 8 + 18 * juice, alpha: 0, duration: 260, ease: 'Quad.easeOut',
      onUpdate: () => ring.setStrokeStyle(Math.max(1, 2 * ring.alpha), color, ring.alpha),
      onComplete: () => ring.destroy() });
  }

  makeParticles() {
    const g = this.make.graphics({ add: false });
    g.fillStyle(0xffffff).fillRect(0, 0, 2, 2); g.generateTexture('px2', 2, 2);
    g.clear().fillStyle(0xffffff).fillRect(0, 0, 1, 1); g.generateTexture('px1', 1, 1); g.destroy();
    this.sparks = this.add.particles(0, 0, 'px2', {
      speed: { min: 40, max: 110 }, angle: { min: 0, max: 360 }, lifespan: { min: 160, max: 280 },
      scale: { start: 1.5, end: 0 }, tint: [0xffffff, 0xffe14a, 0xffb347], gravityY: 120, emitting: false,
    });
    this.confetti = this.add.particles(0, 0, 'px2', {
      speed: { min: 60, max: 180 }, angle: { min: 20, max: 160 }, lifespan: 1800, gravityY: 90,
      rotate: { min: 0, max: 360 }, tint: [0xffe14a, 0xeb4646, 0x5aa0ff, 0x5aaa5a, 0xffffff], emitting: false,
    });
    this.dust = this.add.particles(0, 0, 'px1', {
      speed: { min: 10, max: 35 }, angle: { min: 200, max: 340 }, lifespan: 380,
      alpha: { start: 0.9, end: 0 }, tint: [0xd9b48a, 0xbf9466], emitting: false,
    });
  }

  goldPop(str, x, y) {                  // number pops big, settles, floats away
    const t = this.add.text(x, y, str, { fontFamily: 'Galmuri11', fontSize: '11px', color: '#ffd84a', stroke: '#000', strokeThickness: 2 })
      .setOrigin(0.5).setScale(2);
    this.tweens.add({ targets: t, scale: 1, duration: 140, ease: 'Back.easeOut' });
    this.tweens.add({ targets: t, y: y - 14, alpha: { from: 1, to: 0 }, delay: 260, duration: 520, ease: 'Quad.easeIn',
      onComplete: () => t.destroy() });
  }

  popText(str, color, x, y, scale) {
    const t = this.add.text(x, y, str, { fontFamily: 'Galmuri11', fontSize: '11px', color, stroke: '#000', strokeThickness: 2 })
      .setOrigin(0.5).setScale(scale);
    this.tweens.add({ targets: t, y: y - 12, alpha: { from: 1, to: 0 }, duration: 700, ease: 'Quad.easeOut', onComplete: () => t.destroy() });
  }

  update(_, dt) {
    this.clouds.tilePositionX -= dt * 0.004;   // slow drift
  }
}
