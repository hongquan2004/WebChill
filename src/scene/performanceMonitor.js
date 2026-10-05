// Wall-clock frame cadence and renderer counters; this does not estimate GPU time.
export function createPerformanceMonitor() {
  let started = null, previous = null, frames = 0, cpuTotal = 0;
  function reset() { started = null; previous = null; frames = 0; cpuTotal = 0; }
  return {
    reset,
    sample({ now, renderMs = 0, calls = 0, triangles = 0, quality = 'high', mode = 'auto' }) {
      if (!Number.isFinite(now)) { reset(); return null; }
      if (previous !== null && (now <= previous || now - previous > 1000)) reset();
      if (started === null) { started = now; previous = now; return null; }
      previous = now; frames++; cpuTotal += Math.max(0, Number.isFinite(renderMs) ? renderMs : 0);
      const duration = now - started;
      if (duration < 1000) return null;
      const result = {
        state: 'running', fps: frames * 1000 / duration, frameMs: duration / frames,
        renderMs: cpuTotal / frames, calls, triangles, quality, mode,
      };
      started = now; frames = 0; cpuTotal = 0;
      return result;
    },
  };
}
