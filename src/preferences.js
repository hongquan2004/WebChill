import { normalizeMix } from './audio/mix.js';
import { normalizeTimerSettings } from './timerSession.js';

export function normalizePreferences(value = {}) {
  const saved = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    mood: ['day', 'sunset', 'night'].includes(saved.mood) ? saved.mood : 'day',
    weather: ['clear', 'rain', 'snow'].includes(saved.weather) ? saved.weather : 'clear',
    autoMood: saved.autoMood === true,
    autoWeather: saved.autoWeather === true,
    volume: Number.isFinite(saved.volume) ? Math.min(100, Math.max(0, saved.volume)) : 35,
    minutes: Number.isInteger(saved.minutes) && saved.minutes >= 1 && saved.minutes <= 180 ? saved.minutes : 25,
    view: ['valley', 'stream'].includes(saved.view) ? saved.view : 'valley',
    drift: typeof saved.drift === 'boolean' ? saved.drift : true,
    quality: ['auto', 'high', 'balanced', 'light'].includes(saved.quality) ? saved.quality : 'auto',
    showPerformance: saved.showPerformance === true,
    mix: normalizeMix(saved.mix),
    timerSettings: normalizeTimerSettings(saved.timerSettings),
  };
}
