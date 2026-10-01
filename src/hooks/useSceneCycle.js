import { useEffect } from 'react';

export const MOOD_CYCLE = ['day', 'sunset', 'night'];
export const WEATHER_CYCLE = ['clear', 'rain', 'snow'];
export const MOOD_INTERVAL = 120_000;
export const WEATHER_INTERVAL = 180_000;

export function advanceCycle(value, sequence, steps = 1) {
  const current = Math.max(0, sequence.indexOf(value));
  return sequence[(current + steps) % sequence.length];
}

export function dueCycleSteps(now, nextAt, period) {
  return now < nextAt ? 0 : Math.floor((now - nextAt) / period) + 1;
}

// Use wall time so an inactive tab does not slow the atmosphere cycle.
export function useSceneCycle(enabled, sequence, period, onChange) {
  useEffect(() => {
    if (!enabled) return;
    let nextAt = Date.now() + period;
    const tick = () => {
      const steps = dueCycleSteps(Date.now(), nextAt, period);
      if (!steps) return;
      nextAt += steps * period;
      onChange((value) => advanceCycle(value, sequence, steps));
    };
    const timer = window.setInterval(tick, 1000);
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [enabled, sequence, period, onChange]);
}
