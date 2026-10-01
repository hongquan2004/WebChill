import { useEffect, useRef, useState } from 'react';
import { Landscape } from './Landscape';

export function NatureScene({ mood = 'day', weather = 'clear' }) {
  const container = useRef(null);
  const scene = useRef(null);
  const settings = useRef({ mood, weather });
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  settings.current = { mood, weather };

  useEffect(() => {
    let cancelled = false;
    const fail = () => {
      if (cancelled) return;
      setFailed(true); setReady(false);
      scene.current?.dispose(); scene.current = null;
    };
    import('./scene/createScene').then(({ createScene }) => {
      if (cancelled) return;
      try {
        const next = createScene(container.current, settings.current.mood === 'night', fail);
        next.setMood(settings.current.mood);
        next.setWeather(settings.current.weather);
        scene.current = next;
        setReady(true);
      } catch (error) {
        console.warn('3D landscape unavailable; displaying the illustrated landscape.', error);
        container.current?.replaceChildren(); setFailed(true);
      }
    }).catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; scene.current?.dispose(); scene.current = null; };
  }, []);

  useEffect(() => { scene.current?.setMood(mood); }, [mood]);
  useEffect(() => { scene.current?.setWeather(weather); }, [weather]);

  return <div className={`nature-scene${ready ? ' is-ready' : ''}${failed ? ' is-fallback' : ''}`} aria-hidden="true">
    {!ready && <Landscape />}
    <div className="three-canvas" ref={container} />
  </div>;
}
