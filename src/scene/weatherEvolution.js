const unit = (value) => Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;

// Integrate precipitation and drying separately from the fast sky transition.
// dt is visible simulation time in seconds; callers must not replay hidden time.
export function createWeatherEvolution(initial = {}) {
  let snowCover = unit(initial.snowCover), wetness = unit(initial.wetness);
  let canopyWater = unit(initial.canopyWater), dripping = 0;
  const snapshot = () => ({ snowCover, wetness, dripping });
  const approach = (value, source, loss, dt) => {
    const rate = source + loss;
    if (!rate || !dt) return value;
    const target = source / rate;
    return unit(target + (value - target) * Math.exp(-rate * dt));
  };
  return {
    snapshot,
    reset(next = {}) {
      snowCover = unit(next.snowCover); wetness = unit(next.wetness);
      canopyWater = unit(next.canopyWater); dripping = 0;
      return snapshot();
    },
    update({ dt = 0, rain = 0, snow = 0, night = 0, reducedMotion = false } = {}) {
      rain = unit(rain); snow = unit(snow); night = unit(night);
      if (reducedMotion) {
        snowCover = snow; wetness = rain; canopyWater = rain; dripping = 0;
        return snapshot();
      }
      const step = Number.isFinite(dt) ? Math.max(0, Math.min(1, dt)) : 0;
      if (!step) return snapshot();
      const meltRate = (1 - snow) * (.0036 - night * .0027 + rain * .014);
      const previousSnow = snowCover;
      snowCover = approach(snowCover, snow * .022, meltRate, step);
      // Meltwater keeps the ground damp after a snow shower has ended.
      const meltWater = (previousSnow + snowCover) * .5 * meltRate * 8;
      wetness = approach(wetness, rain * .085 + meltWater,
        (1 - rain) * (1 - snow * .9) * (.0065 - night * .0038), step);
      canopyWater = approach(canopyWater, rain * .105,
        (1 - rain) * .039, step);
      // Most canopy drops appear after the main rainfall subsides.
      dripping = unit((canopyWater + meltWater * 3) * (1 - rain * .92) * (1 - snow));
      return snapshot();
    },
  };
}
