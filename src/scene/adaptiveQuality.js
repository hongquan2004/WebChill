export const QUALITY_PROFILES = Object.freeze({
  high: Object.freeze({ pixelRatio: 1.75, shadowSize: 2048, shadowInterval: 90, reflectionSize: 1024, reflectionInterval: 1 }),
  balanced: Object.freeze({ pixelRatio: 1.35, shadowSize: 1024, shadowInterval: 160, reflectionSize: 512, reflectionInterval: 2 }),
  light: Object.freeze({ pixelRatio: 1, shadowSize: 1024, shadowInterval: 280, reflectionSize: 256, reflectionInterval: 3 }),
});

const LEVELS = ['light', 'balanced', 'high'];

// Observe rendered frames, not skipped animation callbacks. Sustained slow windows
// reduce load quickly; recovery needs longer evidence to avoid quality oscillation.
export function createAdaptiveQuality({ initialLevel = 'high' } = {}) {
  let index = Math.max(0, LEVELS.indexOf(initialLevel));
  let elapsed = 0, frames = 0, slowWindows = 0, fastWindows = 0, cooldown = 5000, longFrames = 0;
  function reset(level) {
    if (LEVELS.includes(level)) index = LEVELS.indexOf(level);
    elapsed = 0; frames = 0; slowWindows = 0; fastWindows = 0; longFrames = 0;
    cooldown = Math.max(cooldown, 3000);
  }
  return {
    get level() { return LEVELS[index]; },
    reset,
    sample(frameMs) {
      // Hidden tabs, resize and debugger pauses must not look like a weak GPU.
      if (!Number.isFinite(frameMs) || frameMs <= 0) {
        reset(); return null;
      }
      const elapsedMs = frameMs;
      if (frameMs > 250) {
        longFrames++;
        if (longFrames < 3) {
          elapsed = 0; frames = 0; slowWindows = 0; fastWindows = 0;
          cooldown = Math.max(cooldown, 3000);
          return null;
        }
        // A single stall is ignored, but a persistently overloaded GPU must
        // still be able to recover by lowering detail.
        frameMs = 250;
      } else longFrames = 0;
      if (cooldown > 0) { cooldown -= elapsedMs; return null; }
      elapsed += frameMs; frames++;
      if (elapsed < 3000) return null;
      const average = elapsed / frames;
      elapsed = 0; frames = 0;
      slowWindows = average > 27 ? slowWindows + 1 : 0;
      fastWindows = average < 19.5 ? fastWindows + 1 : 0;
      const next = slowWindows >= 2 ? Math.max(0, index - 1)
        : fastWindows >= 6 ? Math.min(LEVELS.length - 1, index + 1) : index;
      if (next === index) return null;
      index = next;
      slowWindows = 0; fastWindows = 0; cooldown = 12000;
      return LEVELS[index];
    },
  };
}
