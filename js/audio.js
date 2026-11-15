/* OCHE — sons synthétisés (aucun fichier). */
(function () {
  const OCHE = (window.OCHE = window.OCHE || {});
  let ctx = null, noiseBuf = null, on = true;
  try { on = localStorage.getItem('oche.sound') !== '0'; } catch (e) {}

  function c() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  function tone(freq, t, dur, { type = 'sine', vol = 0.2, slide = 0 } = {}) {
    const a = c(); if (!a || !on) return;
    const o = a.createOscillator(), g = a.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, a.currentTime + t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), a.currentTime + t + dur);
    g.gain.setValueAtTime(0.0001, a.currentTime + t);
    g.gain.exponentialRampToValueAtTime(vol, a.currentTime + t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + t + dur);
    o.connect(g).connect(a.destination);
    o.start(a.currentTime + t);
    o.stop(a.currentTime + t + dur + 0.05);
  }
  function noise(t, dur, { freq = 1200, q = 1, vol = 0.3, type = 'lowpass' } = {}) {
    const a = c(); if (!a || !on) return;
    const s = a.createBufferSource(), fl = a.createBiquadFilter(), g = a.createGain();
    s.buffer = noiseBuf; fl.type = type; fl.frequency.value = freq; fl.Q.value = q;
    g.gain.setValueAtTime(vol, a.currentTime + t);
    g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + t + dur);
    s.connect(fl).connect(g).connect(a.destination);
    s.start(a.currentTime + t);
    s.stop(a.currentTime + t + dur + 0.05);
  }

  OCHE.audio = {
    get on() { return on; },
    toggle() { on = !on; try { localStorage.setItem('oche.sound', on ? '1' : '0'); } catch (e) {} return on; },
    unlock() { c(); },
    whoosh() { noise(0, 0.22, { freq: 1800, q: 0.7, vol: 0.12, type: 'bandpass' }); },
    thud() {
      noise(0, 0.09, { freq: 900, vol: 0.45 });
      tone(150, 0, 0.14, { vol: 0.35, slide: -70 });
      noise(0, 0.03, { freq: 4200, vol: 0.18, type: 'highpass' });
    },
    ding(level = 1) {
      const base = level === 2 ? 880 : 660;
      tone(base, 0, 0.5, { vol: 0.12, type: 'triangle' });
      tone(base * 1.5, 0, 0.4, { vol: 0.07 });
      if (level === 2) tone(base * 2, 0.07, 0.45, { vol: 0.08 });
    },
    bull() {
      tone(523, 0, 0.7, { vol: 0.13, type: 'triangle' });
      tone(784, 0.08, 0.7, { vol: 0.11, type: 'triangle' });
      tone(1046, 0.16, 0.8, { vol: 0.09 });
    },
    bust() {
      tone(180, 0, 0.35, { type: 'sawtooth', vol: 0.14, slide: -90 });
      tone(120, 0.12, 0.45, { type: 'sawtooth', vol: 0.14, slide: -60 });
    },
    swish() { noise(0, 0.18, { freq: 2600, q: 0.6, vol: 0.09, type: 'bandpass' }); },
    tick() { tone(1200, 0, 0.04, { vol: 0.05, type: 'square' }); },
    big() { [523, 659, 784, 1046].forEach((f, i) => tone(f, i * 0.07, 0.5, { type: 'triangle', vol: 0.12 })); },
    fanfare() {
      [392, 523, 659, 784, 1046].forEach((f, i) => tone(f, i * 0.11, 0.7, { type: 'triangle', vol: 0.14 }));
      tone(1318, 0.6, 1.2, { vol: 0.1 });
      tone(659, 0.6, 1.2, { type: 'triangle', vol: 0.1 });
    },
    close() { tone(740, 0, 0.18, { vol: 0.1, type: 'triangle' }); tone(988, 0.1, 0.3, { vol: 0.1, type: 'triangle' }); },
  };
})();
