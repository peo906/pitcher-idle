import Phaser from 'phaser';
import { W, H, MULT, PITCH, ANCHOR, speedKmh, interval, zoneChance, goldMult } from '../config.js';
import { stage, buffMult } from '../economy.js';
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
    this.load.spritesheet('mitt', a + 'mitt.png', { frameWidth: 40, frameHeight: 32 });
    this.load.json('crowd', a + 'crowd.json');
    this.load.json('sprites', a + 'sprites.json');
  }

  create() {
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
    this.applyPitcherArt();
    window.addEventListener('stage-change', () => this.onPromoted());

    // faint strike zone guide
    const z = ANCHOR.zone;
    this.zoneGfx = this.add.graphics().lineStyle(1, 0xffffff, 0.22).strokeRect(z.x0 + 0.5, z.y0 + 0.5, z.x1 - z.x0, z.y1 - z.y0);

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

    this.makeParticles();
    this.flashRect = this.add.rectangle(0, 0, W, H, 0xffffff, 0).setOrigin(0);
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

  drawCrowd() {
    const g = this.crowd; g.clear();
    const f = this.crowdTick++;
    for (const [x, y, s, h, sh, phase, speed] of this.people) {
      const up = ((f * speed + phase) % 12) < 3 ? 1 : 0;
      const yy = y - up;
      g.fillStyle(HAIR[h]).fillRect(x, yy, 2, 1);
      g.fillStyle(SKIN[s]).fillRect(x, yy + 1, 2, 1);
      g.fillStyle(SHIRT[sh]).fillRect(x, yy + 2, 2, 2);
    }
  }

  // ---------------- the pitch loop ----------------
  startLoop() {
    if (this.running) return;
    this.running = true;
    this.pitch();
  }

  pitch() {
    if (!this.running) return;
    const T = interval(state.lv.tempo);
    const windup = Math.max(PITCH.minWindup, T - PITCH.flight - PITCH.react);
    const isStrike = Math.random() < zoneChance(state.lv.control);
    const target = this.pickTarget(isStrike);

    // catcher sets the target
    this.mitt.setFrame(0);
    this.tweens.add({ targets: this.mitt, x: target.x, y: target.y, duration: Math.min(220, windup * 800), ease: 'Sine.easeOut' });

    // windup: pitcher sinks a little, then releases
    this.pitcher.stop();
    this.tweens.add({
      targets: this.pitcher, y: this.pitcherY + 2, duration: windup * 1000 * 0.8, yoyo: false,
      onComplete: () => { this.pitcher.y = this.pitcherY; this.release(target, isStrike); },
    });
    this.time.delayedCall(T * 1000, () => this.pitch());
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

  release(target, isStrike) {
    sfx('whoosh');
    const from = ANCHOR.release;
    const b = this.ball.setVisible(true).setPosition(from.x, from.y).setScale(0.25);
    const p = { t: 0 };
    this.tweens.add({
      targets: p, t: 1, duration: PITCH.flight * 1000, ease: 'Quad.easeIn',
      onUpdate: () => {
        const t = p.t;
        b.x = from.x + (target.x - from.x) * t;
        b.y = from.y + (target.y - from.y) * t - 10 * Math.sin(Math.PI * t) * 0.4;   // slight carry
        b.setScale(0.25 + 1.15 * t);
      },
      onComplete: () => this.caught(target, isStrike),
    });
  }

  caught(target, isStrike) {
    this.ball.setVisible(false);
    this.mitt.setFrame(1);
    const kmh = speedKmh(state.lv.speed) + Phaser.Math.Between(-2, 2);
    const power = Phaser.Math.Clamp((kmh - 80) / 80, 0.6, 1.2);

    // ---- the "pop": everything lands on the same frame ----
    const juice = isStrike ? 1 : 0.6;                   // strikes hit harder than balls
    this.hitStop(isStrike ? 70 : 45);
    this.cameras.main.shake(90, 0.006 * power * juice);
    this.zoomPunch(0.03 * juice);
    this.flashRect.setAlpha(0.22 * juice);
    this.tweens.add({ targets: this.flashRect, alpha: 0, duration: 110 });
    this.mittRecoil(target, juice);
    this.impactRing(target.x, target.y, isStrike ? 0xffe14a : 0xffffff, juice);
    this.starBurst(target.x, target.y, juice);
    this.sparks.explode(isStrike ? 16 : 8, target.x, target.y);
    this.dust.explode(6, target.x, target.y + 2);
    sfx('mitt', power * (0.85 + 0.15 * juice));
    sfx(isStrike ? 'strike' : 'ball');

    // gold
    const gold = Math.floor(stage().base * goldMult(state.lv.speed) * (isStrike ? MULT.strike : MULT.ball) * buffMult());
    addGold(gold);
    state.pitches++; if (isStrike) state.strikes++;

    this.speedNum.setText(String(kmh));
    this.layoutSpeed();
    this.popText(isStrike ? 'STRIKE!' : 'BALL', isStrike ? '#ffe14a' : '#d8dde8', 150, 196, 2);
    this.goldPop(`+${fmt(gold)}`, target.x, target.y - 16);
    window.dispatchEvent(new CustomEvent('gold-pop'));   // HUD bumps its counter

    // glove settles back
    this.time.delayedCall(260, () => {
      this.mitt.setFrame(0);
      this.tweens.add({ targets: this.mitt, x: ANCHOR.mittRest.x, y: ANCHOR.mittRest.y, duration: 200 });
      this.pitcher.play(this.breatheKey);
    });
  }

  // ---------------- pitcher art & promotion ----------------
  applyPitcherArt() {
    const key = stage().sprite, meta = this.cache.json.get('sprites')['pitcher_' + key];
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
    m.setPosition(target.x, target.y + 3 * juice).setScale(1 + 0.18 * juice, 1 - 0.14 * juice);
    this.tweens.add({ targets: m, y: target.y, scaleX: 1, scaleY: 1, duration: 160, ease: 'Back.easeOut' });
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
