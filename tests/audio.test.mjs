import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { AUDIO_LAYERS, DEFAULT_MIX, layerLevels, normalizeMix } from '../src/audio/mix.js';
import { createSeamlessBuffer } from '../src/audio/loops.js';
import { applyAudioSettings, createAudioEngine, disposeAudioEngine, loadRecordings, playChime } from '../src/audio/engine.js';

function buffer(channels, length, sampleRate) {
  const data = Array.from({ length: channels }, () => new Float32Array(length));
  return { length, sampleRate, numberOfChannels: channels, getChannelData: channel => data[channel] };
}
class Parameter {
  value = 1;
  target = 1;
  cancelAndHoldAtTime() {}
  setValueAtTime(value) { this.value = value; }
  setTargetAtTime(value) { this.target = value; }
  linearRampToValueAtTime() {}
  exponentialRampToValueAtTime() {}
}
class AudioNode {
  connections = [];
  gain = new Parameter();
  frequency = new Parameter();
  Q = new Parameter();
  connect(node) { this.connections.push(node); }
  disconnect() { this.connections = []; this.disconnected = true; }
  start() { this.started = true; }
  stop(time) { this.stopped = true; this.stopTime = time; }
}
class Context {
  sampleRate = 1000;
  currentTime = 4;
  state = 'running';
  destination = new AudioNode();
  nodes = [];
  makeNode() { const node = new AudioNode(); this.nodes.push(node); return node; }
  createGain() { return this.makeNode(); }
  createBiquadFilter() { return this.makeNode(); }
  createBufferSource() { return this.makeNode(); }
  createOscillator() { return this.makeNode(); }
  createDynamicsCompressor() {
    const node = this.makeNode();
    for (const key of ['threshold', 'knee', 'ratio', 'attack', 'release']) node[key] = new Parameter();
    return node;
  }
  createBuffer = buffer;
  async decodeAudioData() {
    const result = buffer(2, 8000, this.sampleRate);
    for (let channel = 0; channel < 2; channel++) {
      for (let i = 0; i < result.length; i++) result.getChannelData(channel)[i] = Math.sin(i * 0.07) * 0.2;
    }
    return result;
  }
  async close() { this.state = 'closed'; }
}

test('mixer restores defaults safely without mutating stored or default values', () => {
  const mixed = normalizeMix({ followWeather: false, stream: { enabled: false, level: 350 }, wind: { level: NaN }, rain: { level: -1 }, birds: { level: '42' } });
  assert.deepEqual(mixed.stream, { enabled: false, level: 100 });
  assert.equal(mixed.rain.level, 0);
  assert.equal(mixed.wind.level, DEFAULT_MIX.wind.level);
  assert.equal(mixed.birds.level, DEFAULT_MIX.birds.level);
  assert.equal(mixed.followWeather, false);
  mixed.stream.level = 10;
  assert.equal(DEFAULT_MIX.stream.level, 75);
  assert.deepEqual(normalizeMix(null), DEFAULT_MIX);
});

test('weather sync respects individual mute, and manual mix permits rain in clear weather', () => {
  assert.equal(layerLevels(DEFAULT_MIX, 'clear', 'day').rain, 0);
  assert.equal(layerLevels(DEFAULT_MIX, 'rain', 'night').birds, 0);
  assert.ok(layerLevels(DEFAULT_MIX, 'rain', 'day').rain > 0);
  const manual = normalizeMix({ followWeather: false, birds: { enabled: false } });
  assert.ok(layerLevels(manual, 'clear', 'night').rain > 0);
  assert.equal(layerLevels(manual, 'clear', 'day').birds, 0);
});

test('baked loop joins adjacent samples without a silence gap and retains stereo/headroom', () => {
  const input = buffer(2, 16000, 1000);
  for (let channel = 0; channel < 2; channel++) {
    for (let i = 0; i < input.length; i++) input.getChannelData(channel)[i] = Math.sin(i * 0.02 + channel) * 0.95;
  }
  const output = createSeamlessBuffer(new Context(), input, 1);
  assert.equal(output.length, 15000);
  assert.equal(output.numberOfChannels, 2);
  for (let channel = 0; channel < 2; channel++) {
    const samples = output.getChannelData(channel);
    assert.ok(Math.abs(samples[0] - samples.at(-1)) < 0.01);
    assert.ok(samples.every(Number.isFinite));
    assert.ok(samples.every(value => Math.abs(value) <= 0.800001));
    assert.ok(Math.abs(samples.at(-1)) > 0.005);
  }
});

test('session fade silences ambience only; chime follows master volume and mute', () => {
  const engine = createAudioEngine(Context);
  applyAudioSettings(engine, { muted: false, volume: 60, mix: DEFAULT_MIX, weather: 'rain', sessionGain: 0 });
  assert.equal(engine.ambience.gain.target, 0);
  assert.ok(engine.master.gain.target > 0);
  playChime(engine, { muted: false, volume: 60 });
  assert.equal(engine.tones.size, 3);
  for (const tone of engine.tones) assert.deepEqual(tone.envelope.connections, [engine.master]);
  playChime(engine, { muted: true, volume: 60 });
  playChime(engine, { muted: false, volume: 0 });
  assert.equal(engine.tones.size, 3);
  applyAudioSettings(engine, { muted: true, volume: 60 });
  assert.equal(engine.master.gain.target, 0);
  disposeAudioEngine(engine);
});

test('recordings crossfade from fallback, load once, and release every node on dispose', async () => {
  const engine = createAudioEngine(Context);
  const calls = [];
  const fetcher = async (url, options) => {
    calls.push({ url, signal: options.signal });
    return { ok: true, arrayBuffer: async () => new ArrayBuffer(8) };
  };
  const loading = loadRecordings(engine, { fetcher, baseUrl: '/chill/' });
  assert.equal(loadRecordings(engine, { fetcher }), loading);
  assert.equal(await loading, 'ready');
  assert.equal(calls.length, 4);
  assert.ok(calls.every(call => call.url.startsWith('/chill/audio/')));
  for (const key of AUDIO_LAYERS) {
    assert.equal(engine.layers[key].recorded.gain.target, 1);
    assert.equal(engine.layers[key].synthetic.gain.target, 0);
    assert.equal(engine.layers[key].fallback, null);
  }
  const sources = [...engine.sources];
  const allNodes = [...engine.context.nodes];
  disposeAudioEngine(engine);
  disposeAudioEngine(engine);
  assert.ok(calls.every(call => call.signal.aborted));
  assert.equal(engine.context.state, 'closed');
  assert.ok(sources.every(source => source.stopped && source.buffer === null));
  assert.ok(allNodes.every(node => node.disconnected));
  assert.equal(engine.sources.size, 0);
});

test('failed recording stays audible on fallback without replacing successful layers', async () => {
  const engine = createAudioEngine(Context);
  const status = await loadRecordings(engine, { fetcher: async url => ({ ok: !url.includes('rain'), status: 404, arrayBuffer: async () => new ArrayBuffer(8) }) });
  assert.equal(status, 'fallback');
  assert.equal(engine.layers.rain.status, 'fallback');
  assert.equal(engine.layers.rain.synthetic.gain.value, 1);
  assert.equal(engine.layers.rain.recorded.gain.value, 0);
  assert.equal(engine.layers.birds.status, 'ready');
  disposeAudioEngine(engine);
});

test('disposing while fetching aborts loads and does not start late sources', async () => {
  const engine = createAudioEngine(Context);
  let statusCalls = 0;
  const pending = loadRecordings(engine, { fetcher: (_, { signal }) => new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
  }), onStatus: () => { statusCalls++; } });
  disposeAudioEngine(engine);
  await pending;
  assert.equal(statusCalls, 0);
  assert.equal(engine.sources.size, 0);
});

test('bundled audio matches the CC0 attribution manifest and contains MPEG data', async () => {
  const base = new URL('../public/audio/', import.meta.url);
  const manifest = JSON.parse(await readFile(new URL('manifest.json', base), 'utf8'));
  assert.deepEqual(manifest.recordings.map(item => item.id).sort(), [...AUDIO_LAYERS].sort());
  for (const item of manifest.recordings) {
    const bytes = await readFile(new URL(item.file, base));
    assert.equal(bytes.length, item.bytes);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), item.sha256);
    assert.equal(item.license, 'CC0-1.0');
    assert.match(item.source, /^https:\/\/freesound\.org\/people\//);
    assert.ok(bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0 || bytes.subarray(0, 3).toString() === 'ID3');
  }
});
