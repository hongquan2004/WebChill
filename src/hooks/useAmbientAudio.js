import { useCallback, useEffect, useRef, useState } from 'react';

// All ambience is synthesized locally. The stereo loops crossfade at their
// boundaries, so even a long focus session has no repeating clicks.
function createNoiseBuffer(context, color) {
  const length = Math.floor(context.sampleRate * 10);
  const overlap = Math.floor(context.sampleRate * 0.65);
  const buffer = context.createBuffer(2, length, context.sampleRate);

  for (let channel = 0; channel < 2; channel += 1) {
    const samples = new Float32Array(length + overlap);
    let brown = 0;
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;

    for (let i = 0; i < samples.length; i += 1) {
      const white = Math.random() * 2 - 1;
      if (color === 'brown') {
        brown = (brown + white * 0.02) / 1.02;
        samples[i] = brown * 3.5;
      } else {
        b0 = 0.99765 * b0 + white * 0.099046;
        b1 = 0.963 * b1 + white * 0.2965164;
        b2 = 0.57 * b2 + white * 1.0526913;
        samples[i] = (b0 + b1 + b2 + white * 0.1848) * 0.11;
      }
    }

    const output = buffer.getChannelData(channel);
    for (let i = 0; i < length; i += 1) {
      const tail = i - (length - overlap);
      if (tail >= 0) {
        const blend = tail / (overlap - 1);
        output[i] = samples[i + overlap] * (1 - blend) + samples[tail] * blend;
      } else {
        output[i] = samples[i + overlap];
      }
    }
  }

  return buffer;
}

function disposeEngine(engine) {
  if (!engine || engine.disposed) return;
  engine.disposed = true;
  for (const source of engine.sources) {
    try { source.stop(); } catch { /* A source may already have ended. */ }
  }
  for (const tone of engine.tones) {
    tone.oscillator.onended = null;
    try { tone.oscillator.stop(); } catch { /* Already stopped. */ }
    tone.oscillator.disconnect();
    tone.envelope.disconnect();
  }
  engine.tones.clear();
  engine.nodes.forEach(node => node.disconnect());
  if (engine.context.state !== 'closed') {
    void engine.context.close().catch(() => {});
  }
}

function createEngine(AudioContext) {
  const context = new AudioContext({ latencyHint: 'playback' });
  const engine = { context, sources: [], nodes: [], tones: new Set(), disposed: false };
  const track = node => {
    engine.nodes.push(node);
    return node;
  };
  const filter = (type, frequency) => {
    const node = track(context.createBiquadFilter());
    node.type = type;
    node.frequency.value = frequency;
    node.Q.value = 0.5;
    return node;
  };
  const loop = (buffer, offset = 0) => {
    const source = track(context.createBufferSource());
    source.buffer = buffer;
    source.loop = true;
    engine.sources.push(source);
    source.start(0, offset);
    return source;
  };

  try {
    const master = track(context.createGain());
    master.gain.value = 0;
    engine.master = master;

    const limiter = track(context.createDynamicsCompressor());
    limiter.threshold.value = -18;
    limiter.knee.value = 24;
    limiter.ratio.value = 3;
    limiter.attack.value = 0.08;
    limiter.release.value = 0.45;
    master.connect(limiter);
    limiter.connect(context.destination);

    const brown = createNoiseBuffer(context, 'brown');
    const pink = createNoiseBuffer(context, 'pink');

    const streamLowpass = filter('lowpass', 1500);
    const streamHighpass = filter('highpass', 90);
    const streamGain = track(context.createGain());
    streamGain.gain.value = 0.8;
    loop(pink).connect(streamHighpass);
    streamHighpass.connect(streamLowpass);
    streamLowpass.connect(streamGain);
    streamGain.connect(master);

    const windHighpass = filter('highpass', 45);
    const windLowpass = filter('lowpass', 420);
    const windGain = track(context.createGain());
    windGain.gain.value = 0.24;
    loop(brown, 2.4).connect(windHighpass);
    windHighpass.connect(windLowpass);
    windLowpass.connect(windGain);
    windGain.connect(master);

    const rainHighpass = filter('highpass', 450);
    const rainLowpass = filter('lowpass', 2800);
    const rainGain = track(context.createGain());
    rainGain.gain.value = 0;
    engine.rainGain = rainGain;
    loop(pink, 4.7).connect(rainHighpass);
    rainHighpass.connect(rainLowpass);
    rainLowpass.connect(rainGain);
    rainGain.connect(master);

    // Slow, shallow modulation gives the water and breeze some movement.
    const modulate = (frequency, depth, parameter) => {
      const oscillator = track(context.createOscillator());
      const amount = track(context.createGain());
      oscillator.frequency.value = frequency;
      amount.gain.value = depth;
      oscillator.connect(amount);
      amount.connect(parameter);
      engine.sources.push(oscillator);
      oscillator.start();
    };
    modulate(0.085, 260, streamLowpass.frequency);
    modulate(0.12, 0.06, streamGain.gain);
    modulate(0.055, 0.065, windGain.gain);

    return engine;
  } catch (error) {
    disposeEngine(engine);
    throw error;
  }
}

function easeParameter(parameter, value, context, duration) {
  const now = context.currentTime;
  if (typeof parameter.cancelAndHoldAtTime === 'function') {
    parameter.cancelAndHoldAtTime(now);
  } else {
    const current = parameter.value;
    parameter.cancelScheduledValues(now);
    parameter.setValueAtTime(current, now);
  }
  parameter.setTargetAtTime(value, now, duration);
}

function applyMix(engine, { muted, volume, weather }) {
  if (!engine || engine.disposed || engine.context.state === 'closed') return;
  const level = Math.min(100, Math.max(0, Number(volume) || 0)) / 100;
  easeParameter(engine.master.gain, muted ? 0 : Math.pow(level, 1.15) * 0.8, engine.context, 0.18);
  easeParameter(engine.rainGain.gain, weather === 'rain' ? 0.5 : 0, engine.context, 0.65);
}

export function useAmbientAudio({ muted, volume, weather, onMutedChange }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const engineRef = useRef(null);
  const mountedRef = useRef(false);
  const busyRef = useRef(false);
  const operationRef = useRef(0);
  const settingsRef = useRef({ muted, volume, weather, onMutedChange });
  settingsRef.current = { muted, volume, weather, onMutedChange };

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      operationRef.current += 1;
      busyRef.current = false;
      const engine = engineRef.current;
      engineRef.current = null;
      disposeEngine(engine);
    };
  }, []);

  useEffect(() => {
    applyMix(engineRef.current, { muted, volume, weather });
  }, [muted, volume, weather]);

  const toggleAudio = useCallback(async () => {
    if (busyRef.current || !mountedRef.current) return;
    const nextMuted = !settingsRef.current.muted;

    if (nextMuted) {
      applyMix(engineRef.current, { ...settingsRef.current, muted: true });
      settingsRef.current.onMutedChange(true);
      setError('');
      return;
    }

    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) {
      setError('Trình duyệt này chưa hỗ trợ âm thanh thiên nhiên.');
      return;
    }

    const operation = ++operationRef.current;
    busyRef.current = true;
    setBusy(true);
    setError('');

    try {
      if (!engineRef.current || engineRef.current.context.state === 'closed') {
        disposeEngine(engineRef.current);
        engineRef.current = createEngine(AudioContext);
      }
      const engine = engineRef.current;
      await engine.context.resume();
      if (!mountedRef.current || operation !== operationRef.current || engine !== engineRef.current) return;
      applyMix(engine, { ...settingsRef.current, muted: false });
      settingsRef.current.onMutedChange(false);
    } catch {
      if (!mountedRef.current || operation !== operationRef.current) return;
      disposeEngine(engineRef.current);
      engineRef.current = null;
      settingsRef.current.onMutedChange(true);
      setError('Chưa thể bật âm thanh. Bạn thử bật lại nhé.');
    } finally {
      if (mountedRef.current && operation === operationRef.current) {
        busyRef.current = false;
        setBusy(false);
      }
    }
  }, []);

  const clearError = useCallback(() => setError(''), []);

  const chime = useCallback(() => {
    const engine = engineRef.current;
    if (!engine || engine.disposed || engine.context.state !== 'running' || settingsRef.current.muted || Number(settingsRef.current.volume) <= 0) return;
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
  }, []);

  return { toggleAudio, busy, error, clearError, chime };
}
