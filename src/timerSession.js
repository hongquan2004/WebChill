export const DEFAULT_TIMER_SETTINGS = Object.freeze({
  fadeOut: false,
  fadeSeconds: 30,
  useBreak: false,
  breakMinutes: 5,
  repeat: false,
});

export function normalizeTimerSettings(value) {
  const input = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    fadeOut: typeof input.fadeOut === 'boolean' ? input.fadeOut : false,
    fadeSeconds: [15, 30, 60].includes(input.fadeSeconds) ? input.fadeSeconds : 30,
    useBreak: typeof input.useBreak === 'boolean' ? input.useBreak : false,
    breakMinutes: Number.isInteger(input.breakMinutes) && input.breakMinutes >= 1 && input.breakMinutes <= 30 ? input.breakMinutes : 5,
    repeat: typeof input.repeat === 'boolean' ? input.repeat : false,
  };
}

export function normalizeTimerMinutes(value) {
  return Number.isInteger(value) && value >= 1 && value <= 180 ? value : 25;
}

export function createTimerSession(minutes = 25, settings) {
  const focusMinutes = normalizeTimerMinutes(minutes);
  return {
    focusMinutes,
    settings: normalizeTimerSettings(settings),
    phase: 'focus',
    phaseDuration: focusMinutes * 60,
    remainingMs: focusMinutes * 60_000,
    deadline: null,
    running: false,
    complete: false,
    started: false,
  };
}

function startFocus(state, start, settings) {
  const next = createTimerSession(state.focusMinutes, settings);
  return { ...next, started: true, running: true, deadline: start + next.remainingMs };
}

/**
 * Catch up from an absolute deadline, including sleeping/background tabs.
 * Options are fixed for the active focus + break cycle. A repeated focus
 * adopts new options, then whole overdue cycles are skipped arithmetically.
 */
export function advanceTimerSession(state, now, nextSettings = state.settings) {
  if (!state.running || !Number.isFinite(now)) return { state, boundary: null };
  if (now < state.deadline) {
    const remainingMs = Math.max(0, state.deadline - now);
    return { state: remainingMs === state.remainingMs ? state : { ...state, remainingMs }, boundary: null };
  }

  let next = state;
  let transitions = 0;
  const firstPhase = state.phase;
  while (next.running && now >= next.deadline) {
    transitions += 1;
    const endedAt = next.deadline;
    if (next.phase === 'focus' && next.settings.useBreak) {
      const duration = next.settings.breakMinutes * 60;
      next = { ...next, phase: 'break', phaseDuration: duration, remainingMs: duration * 1000, deadline: endedAt + duration * 1000 };
    } else if (next.settings.repeat) {
      next = startFocus(next, endedAt, nextSettings);
      if (next.settings.repeat) {
        const phasesPerCycle = next.settings.useBreak ? 2 : 1;
        const cycleMs = (next.focusMinutes + (next.settings.useBreak ? next.settings.breakMinutes : 0)) * 60_000;
        const cycles = Math.floor((now - endedAt) / cycleMs);
        transitions += cycles * phasesPerCycle;
        next.deadline += cycles * cycleMs;
      }
    } else {
      next = { ...next, remainingMs: 0, deadline: null, running: false, complete: true };
    }
  }
  if (next.running) next = { ...next, remainingMs: Math.max(0, next.deadline - now) };
  return { state: next, boundary: { phase: firstPhase, currentPhase: next.phase, complete: next.complete, transitions } };
}

/** Keep fractional seconds on pause; repeated pauses cannot extend a session. */
export function toggleTimerSession(state, now, settings = state.settings) {
  if (!Number.isFinite(now)) return { state, boundary: null };
  if (state.running) {
    const result = advanceTimerSession(state, now, settings);
    if (result.state.running) result.state = { ...result.state, running: false, deadline: null };
    return result;
  }
  const next = state.complete || !state.started ? createTimerSession(state.focusMinutes, settings) : state;
  return { state: { ...next, started: true, running: true, complete: false, deadline: now + next.remainingMs }, boundary: null };
}

export function timerSessionGain(state) {
  if (!state.started || !state.settings.fadeOut) return 1;
  if (state.complete) return 0;
  if (state.phase === 'break') return 1;
  const fraction = Math.max(0, Math.min(1, state.remainingMs / (state.settings.fadeSeconds * 1000)));
  // Smoothstep is gentle at either end and continuous while a paused timer holds.
  return fraction * fraction * (3 - 2 * fraction);
}
