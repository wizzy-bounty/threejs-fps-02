// audio.js — all sound is synthesised with WebAudio: no audio files, nothing to load.
// The context is created on the first user gesture (the Play click); every call is a
// no-op before that, so headless screenshot runs stay silent and safe.

let ctx = null;
let master = null;
let noiseBuf = null;

export function initAudio() {
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume();
    return;
  }
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0.32;
    master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  } catch {
    ctx = null;
  }
}

// A short pitched blip with an exponential decay.
function blip(f0, f1, seconds, type, gain) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(f0, t);
  osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + seconds);
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + seconds);
  osc.connect(g).connect(master);
  osc.start(t);
  osc.stop(t + seconds);
}

// A burst of filtered noise: gunshots, explosions, impacts.
function burst(seconds, freq, gain, type = 'lowpass', sweepTo = null) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.frequency.setValueAtTime(freq, t);
  if (sweepTo) filter.frequency.exponentialRampToValueAtTime(sweepTo, t + seconds);
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + seconds);
  src.connect(filter).connect(g).connect(master);
  src.start(t);
  src.stop(t + seconds);
}

export const sfx = {
  shot(kind) {
    if (kind === 'sniper') { burst(0.32, 3000, 0.85, 'lowpass', 300); blip(160, 40, 0.22, 'triangle', 0.5); }
    else if (kind === 'pistol') { burst(0.11, 3800, 0.5, 'bandpass'); blip(220, 60, 0.08, 'square', 0.16); }
    else if (kind === 'smg') { burst(0.08, 3400, 0.42, 'bandpass'); }
    else { burst(0.14, 3000, 0.55, 'lowpass', 700); blip(180, 50, 0.1, 'square', 0.14); }
  },
  dry() { blip(1400, 900, 0.04, 'square', 0.12); },
  reload() { blip(500, 300, 0.07, 'square', 0.14); setTimeout(() => blip(700, 420, 0.07, 'square', 0.14), 160); },
  hit() { blip(1900, 1400, 0.05, 'sine', 0.2); },
  kill() { blip(880, 660, 0.09, 'sine', 0.22); setTimeout(() => blip(1320, 990, 0.08, 'sine', 0.18), 70); },
  hurt() { burst(0.12, 500, 0.4); },
  throwIt() { burst(0.16, 1200, 0.16, 'bandpass', 300); },
  flashPop() { burst(0.2, 6000, 0.5, 'highpass'); blip(2400, 2400, 0.3, 'sine', 0.1); },
  explosion() { burst(0.9, 900, 1.0, 'lowpass', 60); blip(90, 28, 0.7, 'sine', 0.7); },
  plantBeep(final) { blip(final ? 1560 : 1040, final ? 1560 : 1040, final ? 0.3 : 0.07, 'square', 0.16); },
  plantDone() { blip(780, 780, 0.09, 'square', 0.18); setTimeout(() => blip(1170, 1170, 0.12, 'square', 0.18), 110); },
  uiClick() { blip(660, 660, 0.05, 'square', 0.12); },
  buy() { blip(990, 990, 0.06, 'sine', 0.18); setTimeout(() => blip(1480, 1480, 0.07, 'sine', 0.16), 60); },
  denied() { blip(220, 180, 0.12, 'square', 0.16); },
  roundWin() { blip(660, 660, 0.12, 'triangle', 0.2); setTimeout(() => blip(880, 880, 0.16, 'triangle', 0.2), 120); },
  roundLose() { blip(440, 440, 0.12, 'triangle', 0.2); setTimeout(() => blip(330, 330, 0.18, 'triangle', 0.2), 120); },
};
