// Optional sound, synthesised with WebAudio: no audio files, nothing fetched. Off by default;
// M toggles it. The AudioContext is created on the first toggle (a key press, so the browser
// allows it to start). Noise comes from the seeded RNG, like everything else.
import { createRng } from './rng.js';

export function createAudio() {
  let ac = null;
  let master = null;
  let noise = null;
  const audio = { on: false, toggle, play };

  function init() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ac = new AC();
    master = ac.createGain();
    master.gain.value = 0.35;
    master.connect(ac.destination);
    const rng = createRng(0xe3b3);
    noise = ac.createBuffer(1, ac.sampleRate * 0.5, ac.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i += 1) d[i] = rng.next() * 2 - 1;
    return true;
  }

  function toggle() {
    if (!ac && !init()) return audio.on;
    audio.on = !audio.on;
    if (audio.on) ac.resume();
    else ac.suspend();
    return audio.on;
  }

  /** A pitched blip: oscillator `type` sliding from f0 to f1 over `dur` seconds, at `t` offset. */
  function tone(type, f0, f1, dur, gain, t = 0) {
    const at = ac.currentTime + t;
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, at);
    o.frequency.exponentialRampToValueAtTime(f1, at + dur);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(gain, at + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g).connect(master);
    o.start(at);
    o.stop(at + dur + 0.02);
  }

  /** A burst of filtered noise: dust, crackle, rumble. */
  function hiss(freq, q, dur, gain, t = 0) {
    const at = ac.currentTime + t;
    const src = ac.createBufferSource();
    src.buffer = noise;
    const f = ac.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ac.createGain();
    g.gain.setValueAtTime(gain, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    src.connect(f).connect(g).connect(master);
    src.start(at);
    src.stop(at + dur + 0.02);
  }

  function play(name) {
    if (!audio.on || !ac) return;
    if (name === 'stroke') hiss(900, 0.8, 0.18, 0.5);
    else if (name === 'touch') { tone('sine', 140, 60, 0.18, 0.5); hiss(300, 1, 0.15, 0.3); }
    else if (name === 'breach') { tone('sawtooth', 110, 40, 0.45, 0.35); hiss(200, 0.7, 0.5, 0.6); }
    else if (name === 'held') { tone('triangle', 523, 523, 0.25, 0.3); tone('triangle', 784, 784, 0.4, 0.3, 0.12); }
    else if (name === 'won') [523, 659, 784, 1047].forEach((f, k) => tone('triangle', f, f, 0.5, 0.3, k * 0.13));
    else if (name === 'lost') { tone('triangle', 330, 165, 0.8, 0.3); hiss(250, 0.6, 0.8, 0.4); }
  }

  return audio;
}
