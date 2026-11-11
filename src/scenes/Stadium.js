import Phaser from 'phaser';
import { W, H, STAGE, STATS, MULT, PITCH, ANCHOR, MISS, speedKmh, interval, zoneChance, goldMult, missChance } from '../config.js';
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
    this.load.spritesheet('pitcher', a + 'pitcher_pro_idle.png', { frameWidth: 64, frameHeight: 64 });
    this.load.spritesheet('mitt', a + 'mitt.png', { frameWidth: 40, frameHeight: 32 });
    this.load.image('emoteMiss', a + 'emote_miss.png');
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

    const meta = this.cache.json.get('sprites').pitcher_pro;
    this.pitcher = this.add.sprite(ANCHOR.mound.x, ANCHOR.mound.feet + (63 - meta.feet), 'pitcher', 0)
      .setOrigin(meta.originX, 1);
    this.anims.create({ key: 'breathe', frames: this.anims.generateFrameNumbers('pitcher', { start: 0, end: 1 }), frameRate: 1.2, repeat: -1 });
    this.pitcher.play('breathe');

    // faint strike zone guide
    const z = ANCHOR.zone;
    this.zoneGfx = this.add.graphics().lineStyle(1, 0xffffff, 0.22).strokeRect(z.x0 + 0.5, z.y0 + 0.5, z.x1 - z.x0, z.y1 - z.y0);

    this.ball = this.add.image(0, 0, this.makeBallTexture()).setVisible(false);
    this.mitt = this.add.sprite(ANCHOR.mittRest.x, ANCHOR.mittRest.y, 'mitt', 0);

    // scoreboard: speed gun
    const sb = ANCHOR.scoreboard, cx = (sb.x0 + sb.x1) / 2;
    this.add.text(cx, sb.y0 + 6, '구속', { fontFamily: 'Galmuri11', fontSize: '11px', color: '#9fc4ff' }).setOrigin(0.5, 0);
    this.speedText = this.add.text(cx, sb.y0 + 20, '-', { fontFamily: 'Galmuri11', fontSize: '11px', color: '#ffffff' })
      .setOrigin(0.5, 0).setScale(2);

    this.emote = this.add.image(0, 0, 'emoteMiss').setVisible(false);
    this.flashRect = this.add.rectangle(0, 0, W, H, 0xffffff, 0).setOrigin(0);
    this.running = false;
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
    const T = interval(STATS.tempoLv);
    const windup = Math.max(PITCH.minWindup, T - PITCH.flight - PITCH.react);
    // 실투 or not. Overall strike rate still matches zoneChance(제구).
    const z = zoneChance(STATS.controlLv), m = missChance(STATS.controlLv);
    const isMiss = Math.random() < m;
    const isStrike = isMiss
      ? Math.random() > MISS.ballShare
      : Math.random() < Math.min(1, (z - m * (1 - MISS.ballShare)) / (1 - m));
    const target = this.pickTarget(isStrike);                       // where the ball really goes
    const call = isMiss ? this.pickCall(target) : target;           // where the catcher asked for it

    // catcher sets the target
    this.mitt.setFrame(0);
    this.tweens.add({ targets: this.mitt, x: call.x, y: call.y, duration: Math.min(220, windup * 800), ease: 'Sine.easeOut' });

    // windup: pitcher sinks a little, then releases
    this.pitcher.stop();
    this.tweens.add({
      targets: this.pitcher, y: this.pitcher.y + 2, duration: windup * 1000 * 0.8, yoyo: false,
      onComplete: () => { this.pitcher.y -= 2; this.release(target, isStrike, isMiss); },
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

  pickCall(target) {
    const z = ANCHOR.zone, r = Phaser.Math.Between;
    const cx = (z.x0 + z.x1) / 2, cy = (z.y0 + z.y1) / 2;
    // the catcher wanted the opposite corner of where it ended up
    return {
      x: target.x < cx ? r(cx + 4, z.x1 - 6) : r(z.x0 + 6, cx - 4),
      y: target.y < cy ? r(cy + 4, z.y1 - 6) : r(z.y0 + 6, cy - 4),
    };
  }

  release(target, isStrike, isMiss) {
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
      onComplete: () => this.caught(target, isStrike, isMiss),
    });
    if (isMiss) {
      // pitcher knows it slipped right away; catcher lunges late
      this.time.delayedCall(40, () => this.missReaction());
      this.tweens.add({ targets: this.mitt, x: target.x, y: target.y, delay: PITCH.flight * 1000 * 0.45,
        duration: PITCH.flight * 1000 * 0.55, ease: 'Quad.easeOut' });
    }
  }

  missReaction() {
    const p = this.pitcher;
    const headX = p.x + 14, headY = p.y - 54;          // beside the face
    this.emote.setPosition(headX, headY).setVisible(true).setScale(0.3).setAlpha(1);
    this.tweens.add({ targets: this.emote, scale: 1, duration: 140, ease: 'Back.easeOut' });
    this.tweens.add({ targets: this.emote, y: headY - 2, duration: 110, yoyo: true, repeat: 2, delay: 140 });
    this.tweens.add({ targets: this.emote, alpha: 0, delay: 800, duration: 200, onComplete: () => this.emote.setVisible(false) });
    // head shake: "아차"
    const x0 = p.x;
    this.tweens.add({ targets: p, x: { from: x0 - 1, to: x0 + 1 }, duration: 60, yoyo: true, repeat: 3,
      onComplete: () => { p.x = x0; } });
    sfx('oops');
  }

  caught(target, isStrike, isMiss) {
    this.ball.setVisible(false);
    this.mitt.setFrame(1);
    const kmh = speedKmh(STATS.speedLv) + Phaser.Math.Between(-2, 2);
    const power = Phaser.Math.Clamp((kmh - 80) / 80, 0.6, 1.2);

    // hit-stop + shake + flash = the "pop"
    this.tweens.timeScale = 0;
    setTimeout(() => { this.tweens.timeScale = 1; }, 50);
    this.cameras.main.shake(70, 0.004 * power);
    this.flashRect.setAlpha(0.18);
    this.tweens.add({ targets: this.flashRect, alpha: 0, duration: 90 });
    this.tweens.add({ targets: this.mitt, scale: { from: 1.12, to: 1 }, duration: 120 });
    sfx('mitt', power);
    sfx(isStrike ? 'strike' : 'ball');

    // gold
    const gold = Math.floor(STAGE.baseGold * goldMult(STATS.speedLv) * (isStrike ? MULT.strike : MULT.ball));
    addGold(gold);
    state.pitches++; if (isStrike) state.strikes++; if (isMiss) state.misses = (state.misses || 0) + 1;

    this.speedText.setText(`${kmh}km/h`);
    this.popText(isStrike ? 'STRIKE!' : 'BALL', isStrike ? '#ffe14a' : '#d8dde8', 150, 196, 2);
    this.popText(`+${fmt(gold)}`, '#ffd84a', target.x, target.y - 14, 1);

    // glove settles back
    this.time.delayedCall(260, () => {
      this.mitt.setFrame(0);
      this.tweens.add({ targets: this.mitt, x: ANCHOR.mittRest.x, y: ANCHOR.mittRest.y, duration: 200 });
      this.pitcher.play('breathe');
    });
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
