import { useCallback, useEffect, useRef, useState } from 'react';
import { advanceTimerSession, createTimerSession, timerSessionGain, toggleTimerSession } from '../timerSession.js';

export function useRelaxTimer({ minutes = 25, settings, onBoundary }) {
  const [session, setSession] = useState(() => createTimerSession(minutes, settings));
  const sessionRef = useRef(session);
  const inputRef = useRef({ minutes, settings, onBoundary });
  inputRef.current = { minutes, settings, onBoundary };

  const commit = useCallback((result) => {
    // Advance the ref before invoking callbacks, avoiding duplicate boundaries
    // from visibilitychange and interval ticks at the same deadline.
    if (result.state !== sessionRef.current) {
      sessionRef.current = result.state;
      setSession(result.state);
    }
    if (result.boundary) inputRef.current.onBoundary?.(result.boundary);
  }, []);

  useEffect(() => {
    if (!session.running) return;
    const tick = () => commit(advanceTimerSession(sessionRef.current, Date.now(), inputRef.current.settings));
    const onVisibility = () => { if (!document.hidden) tick(); };
    tick();
    const interval = setInterval(tick, 100);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pageshow', tick);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pageshow', tick);
    };
  }, [session.running, commit]);

  const toggle = useCallback(() => {
    commit(toggleTimerSession(sessionRef.current, Date.now(), inputRef.current.settings));
  }, [commit]);

  const reset = useCallback((value = inputRef.current.minutes) => {
    commit({ state: createTimerSession(value, inputRef.current.settings), boundary: null });
  }, [commit]);

  return {
    remaining: Math.ceil(session.remainingMs / 1000),
    running: session.running,
    complete: session.complete,
    phase: session.phase,
    phaseDuration: session.phaseDuration,
    sessionGain: timerSessionGain(session),
    toggle,
    reset,
  };
}
