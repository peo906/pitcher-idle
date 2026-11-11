// Synthesized SFX (no audio files needed yet). Replace with real samples later.
import { state } from './state.js';

let ctx = null, crowdGain = null;

function ac() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    startCrowd();
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}
export function unlock() { if (state.sound) ac(); }

function noiseBuffer(sec) {
  const c = ac(), buf = c.createBuffer(1, c.sampleRate * sec, c.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

function burst({ freq = 900, q = 1, dur = 0.08, vol = 0.5, type = 'lowpass' }) {
  const c = ac(), src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
  src.buffer = noiseBuffer(dur); f.type = type; f.frequency.value = freq; f.Q.value = q;
  g.gain.setValueAtTime(vol, c.currentTime); g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
  src.connect(f).connect(g).connect(c.destination); src.start();
}
function thump(freq, dur, vol) {
  const c = ac(), o = c.createOscillator(), g = c.createGain();
  o.frequency.setValueAtTime(freq, c.currentTime); o.frequency.exponentialRampToValueAtTime(freq * 0.5, c.currentTime + dur);
  g.gain.setValueAtTime(vol, c.currentTime); g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
  o.connect(g).connect(c.destination); o.start(); o.stop(c.currentTime + dur);
}

export function sfx(name, power = 1) {
  if (!state.sound) return;
  if (name === 'whoosh') burst({ freq: 2400, q: 0.7, dur: 0.18, vol: 0.12, type: 'bandpass' });
  if (name === 'mitt') {                 // the "pop" — heavier with speed
    burst({ freq: 1800, q: 0.8, dur: 0.06, vol: 0.55 * power });
    thump(150, 0.12, 0.55 * power);
  }
  if (name === 'strike') thump(420, 0.18, 0.12);
  if (name === 'ball') thump(260, 0.12, 0.07);
  if (name === 'oops') { thump(330, 0.09, 0.08); setTimeout(() => thump(220, 0.12, 0.08), 90); }
}

function startCrowd() {                  // quiet stadium murmur
  const c = ctx, src = c.createBufferSource(), f = c.createBiquadFilter();
  crowdGain = c.createGain();
  src.buffer = noiseBuffer(3); src.loop = true;
  f.type = 'bandpass'; f.frequency.value = 500; f.Q.value = 0.4;
  crowdGain.gain.value = state.sound ? 0.035 : 0;
  src.connect(f).connect(crowdGain).connect(c.destination); src.start();
}

export function setSound(on) {
  state.sound = on;
  if (on) ac();
  if (crowdGain) crowdGain.gain.value = on ? 0.035 : 0;
}
