import { AUDIO_LAYERS, layerLevels } from './mix.js';
import { createFallbackBuffer, createSeamlessBuffer } from './loops.js';

export function easeParameter(parameter, value, context, duration = 0.25) {
  const now = context.currentTime;
  if (typeof parameter.cancelAndHoldAtTime === 'function') parameter.cancelAndHoldAtTime(now);
  else {
    const current = parameter.value;
    parameter.cancelScheduledValues(now);
    parameter.setValueAtTime(current, now);
  }
  parameter.setTargetAtTime(value, now, duration);
}

function createLoop(engine, buffer, destination) {
  const source = engine.context.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  source.connect(destination);
  engine.sources.add(source);
  source.onended = () => {
    source.disconnect();
    source.buffer = null;
    engine.sources.delete(source);
  };
  source.start();
  return source;
}

export function createAudioEngine(AudioContext) {
  const context = new AudioContext({ latencyHint: 'playback' });
  const engine = { context, sources: new Set(), tones: new Set(), nodes: [], layers: {}, disposed: false, loading: null, abort: new AbortController() };
  const track = node => { engine.nodes.push(node); return node; };
  try {
    engine.master = track(context.createGain());
    engine.master.gain.value = 0;
    engine.ambience = track(context.createGain());
    engine.ambience.connect(engine.master);
    const limiter = track(context.createDynamicsCompressor());
    limiter.threshold.value = -16;
    limiter.knee.value = 18;
    limiter.ratio.value = 4;
    limiter.attack.value = 0.02;
    limiter.release.value = 0.35;
    engine.master.connect(limiter);
    limiter.connect(context.destination);

    for (const key of AUDIO_LAYERS) {
      const gain = track(context.createGain());
      const synthetic = track(context.createGain());
      const recorded = track(context.createGain());
      const filter = track(context.createBiquadFilter());
      gain.gain.value = 0;
      recorded.gain.value = 0;
      filter.type = 'lowpass';
      filter.frequency.value = key === 'wind' ? 500 : key === 'birds' ? 7500 : key === 'rain' ? 4000 : 2400;
      filter.Q.value = 0.4;
      synthetic.connect(filter);
      filter.connect(gain);
      recorded.connect(gain);
      gain.connect(engine.ambience);
      const fallback = createLoop(engine, createFallbackBuffer(context, key), synthetic);
      engine.layers[key] = { gain, synthetic, recorded, fallback, status: 'loading' };
    }
    return engine;
  } catch (error) {
    disposeAudioEngine(engine);
    throw error;
  }
}

// Called only after the user's sound-on gesture, never at page mount.
export function loadRecordings(engine, { fetcher = globalThis.fetch, baseUrl = '/', onStatus = () => {} } = {}) {
  if (engine.loading) return engine.loading;
  const deadline = setTimeout(() => engine.abort.abort(), 20000);
  engine.loading = Promise.all(AUDIO_LAYERS.map(async key => {
    const layer = engine.layers[key];
    try {
      const response = await fetcher(`${baseUrl}audio/${key}.mp3`, { signal: engine.abort.signal });
      if (!response.ok) throw new Error(`Recording unavailable: ${response.status}`);
      const bytes = await response.arrayBuffer();
      if (engine.disposed) return;
      const decoded = await engine.context.decodeAudioData(bytes);
      if (engine.disposed) return;
      const buffer = createSeamlessBuffer(engine.context, decoded);
      createLoop(engine, buffer, layer.recorded);
      easeParameter(layer.recorded.gain, 1, engine.context, 0.3);
      easeParameter(layer.synthetic.gain, 0, engine.context, 0.3);
      layer.fallback.stop(engine.context.currentTime + 2);
      layer.fallback = null;
      layer.status = 'ready';
    } catch {
      if (!engine.disposed) layer.status = 'fallback';
    }
  })).then(() => {
    if (engine.disposed) return;
    const status = AUDIO_LAYERS.every(key => engine.layers[key].status === 'ready') ? 'ready' : 'fallback';
    onStatus(status);
    return status;
  }).finally(() => clearTimeout(deadline));
  return engine.loading;
}

export function applyAudioSettings(engine, { muted, volume, weather, mood, mix, sessionGain = 1 }) {
  if (!engine || engine.disposed || engine.context.state === 'closed') return;
  const level = Math.min(100, Math.max(0, Number(volume) || 0)) / 100;
  const session = Number.isFinite(sessionGain) ? Math.min(1, Math.max(0, sessionGain)) : 1;
  easeParameter(engine.master.gain, muted ? 0 : level ** 1.15 * 0.8, engine.context, 0.12);
  // Completion chimes bypass this bus, so the final fade cannot silence them.
  easeParameter(engine.ambience.gain, session, engine.context, 0.18);
  const levels = layerLevels(mix, weather, mood);
  for (const key of AUDIO_LAYERS) easeParameter(engine.layers[key].gain.gain, levels[key], engine.context, 0.5);
}

export function playChime(engine, { muted, volume }) {
  if (!engine || engine.disposed || engine.context.state !== 'running' || muted || Number(volume) <= 0) return;
  const now = engine.context.currentTime;
  [523.25, 659.25, 783.99].forEach((frequency, index) => {
    const oscillator = engine.context.createOscillator();
    const envelope = engine.context.createGain();
    const start = now + index * 0.23;
    oscillator.type = 'sine';
    oscillator.frequency.value = frequency;
    envelope.gain.setValueAtTime(0, now);
    envelope.gain.setValueAtTime(0, start);
    envelope.gain.linearRampToValueAtTime(0.12, start + 0.035);
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + 1.7);
    oscillator.connect(envelope);
    envelope.connect(engine.master);
    const tone = { oscillator, envelope };
    engine.tones.add(tone);
    oscillator.onended = () => {
      oscillator.disconnect();
      envelope.disconnect();
      engine.tones.delete(tone);
    };
    oscillator.start(start);
    oscillator.stop(start + 1.8);
  });
}

export function disposeAudioEngine(engine) {
  if (!engine || engine.disposed) return;
  engine.disposed = true;
  engine.abort.abort();
  for (const source of engine.sources) {
    source.onended = null;
    try { source.stop(); } catch { /* A source may already have ended. */ }
    source.disconnect();
    source.buffer = null;
  }
  engine.sources.clear();
  for (const tone of engine.tones) {
    tone.oscillator.onended = null;
    try { tone.oscillator.stop(); } catch { /* Already ended. */ }
    tone.oscillator.disconnect();
    tone.envelope.disconnect();
  }
  engine.tones.clear();
  engine.nodes.forEach(node => node.disconnect());
  engine.nodes.length = 0;
  engine.layers = {};
  if (engine.context.state !== 'closed') void engine.context.close().catch(() => {});
}
