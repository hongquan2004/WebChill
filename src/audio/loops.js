// Bake the overlap into one buffer. AudioBufferSource.loop then remains seamless
// even in a background tab where JavaScript timers are throttled.
export function createSeamlessBuffer(context, input, overlapSeconds = 1.5) {
  const overlap = Math.min(Math.floor(input.length / 4), Math.max(2, Math.floor(input.sampleRate * overlapSeconds)));
  const length = input.length - overlap;
  if (length < 8) throw new Error('Audio recording is too short');
  const buffer = context.createBuffer(input.numberOfChannels, length, input.sampleRate);
  let peak = 0;
  let sum = 0;
  for (let channel = 0; channel < input.numberOfChannels; channel += 1) {
    const source = input.getChannelData(channel);
    const output = buffer.getChannelData(channel);
    for (let index = 0; index < length; index += 1) {
      const tail = index - (length - overlap);
      const blend = tail / (overlap - 1);
      const value = tail < 0 ? source[index + overlap]
        : source[index + overlap] * Math.cos(blend * Math.PI / 2) + source[tail] * Math.sin(blend * Math.PI / 2);
      output[index] = Number.isFinite(value) ? value : 0;
      peak = Math.max(peak, Math.abs(output[index]));
      sum += output[index] ** 2;
    }
  }
  // Match ambient layers gently, leaving headroom for the master limiter.
  const rms = Math.sqrt(sum / (length * input.numberOfChannels));
  const gain = Math.min(3, 0.16 / Math.max(rms, 0.001), 0.8 / Math.max(peak, 0.001));
  for (let channel = 0; channel < input.numberOfChannels; channel += 1) {
    const output = buffer.getChannelData(channel);
    for (let index = 0; index < length; index += 1) output[index] *= gain;
  }
  return buffer;
}

export function createFallbackBuffer(context, layer, random = Math.random) {
  const length = Math.floor(context.sampleRate * 9);
  const buffer = context.createBuffer(2, length, context.sampleRate);
  for (let channel = 0; channel < 2; channel += 1) {
    const output = buffer.getChannelData(channel);
    let brown = 0;
    let b0 = 0;
    let b1 = 0;
    let phase = 0;
    for (let index = 0; index < length; index += 1) {
      const white = random() * 2 - 1;
      brown = (brown + white * 0.02) / 1.02;
      b0 = 0.99765 * b0 + white * 0.099046;
      b1 = 0.963 * b1 + white * 0.2965164;
      if (layer === 'birds') {
        const time = index / context.sampleRate;
        const pulse = (time + channel * 0.17) % 2.7;
        const envelope = pulse < 0.14 ? Math.sin(pulse / 0.14 * Math.PI) ** 2 : 0;
        phase += (2600 + 750 * Math.sin(pulse * 24)) / context.sampleRate * Math.PI * 2;
        output[index] = Math.sin(phase) * envelope * 0.08;
      } else output[index] = layer === 'wind' ? brown * 1.4 : (b0 + b1 + white * 0.12) * 0.075;
    }
  }
  return createSeamlessBuffer(context, buffer, 0.65);
}
