import { useCallback, useEffect, useRef, useState } from 'react';
import { applyAudioSettings, createAudioEngine, disposeAudioEngine, loadRecordings, playChime } from '../audio/engine.js';

export function useAmbientAudio({ muted, volume, weather, mood, mix, sessionGain = 1, onMutedChange }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [recordingStatus, setRecordingStatus] = useState('idle');
  const engineRef = useRef(null);
  const mountedRef = useRef(false);
  const busyRef = useRef(false);
  const operationRef = useRef(0);
  const settingsRef = useRef({ muted, volume, weather, mood, mix, sessionGain, onMutedChange });
  settingsRef.current = { muted, volume, weather, mood, mix, sessionGain, onMutedChange };

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      operationRef.current += 1;
      busyRef.current = false;
      const engine = engineRef.current;
      engineRef.current = null;
      disposeAudioEngine(engine);
    };
  }, []);

  useEffect(() => {
    applyAudioSettings(engineRef.current, { muted, volume, weather, mood, mix, sessionGain });
  }, [muted, volume, weather, mood, mix, sessionGain]);

  const toggleAudio = useCallback(async () => {
    if (busyRef.current || !mountedRef.current) return;
    const nextMuted = !settingsRef.current.muted;

    if (nextMuted) {
      applyAudioSettings(engineRef.current, { ...settingsRef.current, muted: true });
      settingsRef.current.onMutedChange(true);
      setError('');
      return;
    }

    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) {
      setError('Trình duyệt này chưa hỗ trợ âm thanh thiên nhiên.');
      return;
    }

    const operation = ++operationRef.current;
    busyRef.current = true;
    setBusy(true);
    setError('');

    try {
      if (!engineRef.current || engineRef.current.context.state === 'closed') {
        disposeAudioEngine(engineRef.current);
        engineRef.current = createAudioEngine(AudioContext);
        setRecordingStatus('loading');
      }
      const engine = engineRef.current;
      await engine.context.resume();
      if (!mountedRef.current || operation !== operationRef.current || engine !== engineRef.current) return;
      applyAudioSettings(engine, { ...settingsRef.current, muted: false });
      settingsRef.current.onMutedChange(false);
      void loadRecordings(engine, {
        baseUrl: import.meta.env.BASE_URL,
        onStatus: (status) => {
          if (mountedRef.current && engine === engineRef.current) setRecordingStatus(status);
        },
      });
    } catch {
      if (!mountedRef.current || operation !== operationRef.current) return;
      disposeAudioEngine(engineRef.current);
      engineRef.current = null;
      settingsRef.current.onMutedChange(true);
      setRecordingStatus('idle');
      setError('Chưa thể bật âm thanh. Bạn thử bật lại nhé.');
    } finally {
      if (mountedRef.current && operation === operationRef.current) {
        busyRef.current = false;
        setBusy(false);
      }
    }
  }, []);

  const clearError = useCallback(() => setError(''), []);

  const chime = useCallback(() => {
    playChime(engineRef.current, settingsRef.current);
  }, []);

  return { toggleAudio, busy, error, clearError, chime, recordingStatus };
}
