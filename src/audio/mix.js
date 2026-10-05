export const AUDIO_LAYERS = ['stream', 'wind', 'rain', 'birds'];

export const DEFAULT_MIX = Object.freeze({
  followWeather: true,
  stream: Object.freeze({ level: 75, enabled: true }),
  wind: Object.freeze({ level: 35, enabled: true }),
  rain: Object.freeze({ level: 65, enabled: true }),
  birds: Object.freeze({ level: 40, enabled: true }),
});

export function normalizeMix(input) {
  const value = input && typeof input === 'object' ? input : {};
  return Object.fromEntries([
    ['followWeather', typeof value.followWeather === 'boolean' ? value.followWeather : true],
    ...AUDIO_LAYERS.map(key => {
      const layer = value[key];
      const level = typeof layer?.level === 'number' && Number.isFinite(layer.level)
        ? Math.round(Math.min(100, Math.max(0, layer.level))) : DEFAULT_MIX[key].level;
      return [key, { level, enabled: typeof layer?.enabled === 'boolean' ? layer.enabled : true }];
    }),
  ]);
}

export function layerLevels(mix, weather = 'clear', mood = 'day') {
  const normalized = normalizeMix(mix);
  const levels = Object.fromEntries(AUDIO_LAYERS.map(key => [key,
    normalized[key].enabled ? (normalized[key].level / 100) ** 1.3 : 0,
  ]));
  if (normalized.followWeather) {
    levels.rain *= weather === 'rain' ? 1 : 0;
    levels.birds *= mood === 'night' ? 0 : weather === 'rain' ? 0.12 : weather === 'snow' ? 0.2 : mood === 'sunset' ? 0.55 : 1;
    levels.wind *= weather === 'clear' ? 0.7 : 1;
  }
  return levels;
}
