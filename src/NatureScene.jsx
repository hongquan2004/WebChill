import { memo, useEffect, useRef, useState } from 'react';
import { Landscape } from './Landscape';

export const NatureScene = memo(function NatureScene({ mood = 'day', weather = 'clear', view = 'valley', drift = true, quality = 'auto', showPerformance = false, onPerformance }) {
  const container = useRef(null);
  const scene = useRef(null);
  const settings = useRef({ mood, weather, view, drift, quality, showPerformance, onPerformance });
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  settings.current = { mood, weather, view, drift, quality, showPerformance, onPerformance };

  useEffect(() => {
    let cancelled = false;
    const fail = () => {
      if (cancelled) return;
      setFailed(true); setReady(false);
      scene.current?.dispose(); scene.current = null;
      settings.current.onPerformance?.({ state: 'unavailable' });
    };
    import('./scene/createScene').then(({ createScene }) => {
      if (cancelled) return;
      try {
        const next = createScene(container.current, settings.current.mood === 'night', fail, () => {
          if (!cancelled) { setReady(true); setFailed(false); }
        }, (value) => { if (!cancelled) settings.current.onPerformance?.(value); });
        scene.current = next;
        next.setMood(settings.current.mood);
        next.setWeather(settings.current.weather);
        next.setView(settings.current.view);
        next.setDrift(settings.current.drift);
        next.setQuality(settings.current.quality);
        next.setDiagnostics(settings.current.showPerformance);
      } catch (error) {
        console.warn('3D landscape unavailable; displaying the illustrated landscape.', error);
        fail(); container.current?.replaceChildren();
      }
    }).catch(() => { if (!cancelled) fail(); });
    return () => { cancelled = true; scene.current?.dispose(); scene.current = null; };
  }, []);

  useEffect(() => { scene.current?.setMood(mood); }, [mood]);
  useEffect(() => { scene.current?.setWeather(weather); }, [weather]);
  useEffect(() => { scene.current?.setView(view); }, [view]);
  useEffect(() => { scene.current?.setDrift(drift); }, [drift]);
  useEffect(() => { scene.current?.setQuality(quality); }, [quality]);
  useEffect(() => { scene.current?.setDiagnostics(showPerformance); }, [showPerformance]);

  return <div className={`nature-scene${ready ? ' is-ready' : ''}${failed ? ' is-fallback' : ''}`} aria-hidden="true">
    <div className="scene-fallback"><Landscape /></div>
    <div className="three-canvas" ref={container} />
    {!ready && weather === 'snow' && <div className="fallback-snow">{Array.from({ length: 36 }, (_, i) => <span key={i} style={{ left: ((i * 37) % 100) + '%', animationDuration: (9 + i % 7) + 's', animationDelay: -(i % 13) + 's', opacity: .35 + (i % 5) * .12, scale: .45 + (i % 4) * .25 }} />)}</div> }
  </div>;
});
