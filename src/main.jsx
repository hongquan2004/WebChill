import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Play, Pause, RotateCcw, Check, X, Sun, Sunset, Moon, Volume2, VolumeX, CloudRain, Snowflake, Repeat2, Eye, EyeOff, Maximize, Minimize, Timer, SlidersHorizontal, ChevronDown, ChevronUp } from 'lucide-react';
import { NatureScene } from './NatureScene';
import { SceneSettings } from './SceneSettings';
import { AudioMixer } from './AudioMixer';
import { TimerSettings } from './TimerSettings';
import { normalizePreferences } from './preferences';
import { useAmbientAudio } from './hooks/useAmbientAudio';
import { useRelaxTimer } from './hooks/useRelaxTimer';
import { useSceneCycle, MOOD_CYCLE, WEATHER_CYCLE, MOOD_INTERVAL, WEATHER_INTERVAL } from './hooks/useSceneCycle';
import './style.css';

const STORAGE_KEY = 'webchill:preferences:v1';
function readPreferences() {
  try {
    return normalizePreferences(JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'));
  } catch { return normalizePreferences(); }
}
const preferences = readPreferences();
const MOODS = [{ id: 'day', label: 'Ban ngày', icon: Sun }, { id: 'sunset', label: 'Hoàng hôn', icon: Sunset }, { id: 'night', label: 'Ban đêm', icon: Moon }];
const CIRCUMFERENCE = 2 * Math.PI * 84;

function IconButton({ label, children, active, className = '', ...props }) {
  return <button type="button" className={'icon-button ' + (active ? 'active ' : '') + className} aria-label={label} title={label} {...(active !== undefined ? { 'aria-pressed': active } : {})} {...props}>{children}</button>;
}

function App() {
  const [minutes, setMinutes] = useState(preferences.minutes);
  const [mood, setMood] = useState(preferences.mood);
  const [weather, setWeather] = useState(preferences.weather);
  const [view, setView] = useState(preferences.view);
  const [drift, setDrift] = useState(preferences.drift);
  const [quality, setQuality] = useState(preferences.quality);
  const [showPerformance, setShowPerformance] = useState(preferences.showPerformance);
  const [performanceStats, setPerformanceStats] = useState(null);
  const [mix, setMix] = useState(preferences.mix);
  const [timerSettings, setTimerSettings] = useState(preferences.timerSettings);
  const [autoMood, setAutoMood] = useState(preferences.autoMood);
  const [autoWeather, setAutoWeather] = useState(preferences.autoWeather);
  useSceneCycle(autoMood, MOOD_CYCLE, MOOD_INTERVAL, setMood);
  useSceneCycle(autoWeather, WEATHER_CYCLE, WEATHER_INTERVAL, setWeather);
  const [muted, setMuted] = useState(true);
  const [volume, setVolume] = useState(preferences.volume);
  const [immersed, setImmersed] = useState(false);
  const [timerCollapsed, setTimerCollapsed] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [custom, setCustom] = useState(false);
  const [customMinutes, setCustomMinutes] = useState(String(preferences.minutes));
  const [notice, setNotice] = useState('');
  const dialog = useRef(null);
  const chimeRef = useRef(() => {});
  const onBoundary = useCallback(() => chimeRef.current(), []);
  const session = useRelaxTimer({ minutes, settings: timerSettings, onBoundary });
  const { remaining, running, complete, phase, phaseDuration, toggle: toggleTimer, reset: resetTimer } = session;
  const sound = useAmbientAudio({ muted, volume, weather, mood, mix, sessionGain: session.sessionGain, onMutedChange: setMuted });
  chimeRef.current = sound.chime;

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ mood, weather, autoMood, autoWeather, volume, minutes, view, drift, quality, showPerformance, mix, timerSettings })); } catch { /* Preferences are optional when storage is disabled. */ }
  }, [mood, weather, autoMood, autoWeather, volume, minutes, view, drift, quality, showPerformance, mix, timerSettings]);

  const choose = useCallback((value) => {
    setMinutes(value); resetTimer(value);
  }, [resetTimer]);

  const toggleFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
      else setNotice('Trình duyệt này chưa hỗ trợ toàn màn hình. Bạn có thể dùng chế độ ẩn giao diện.');
    } catch { setNotice('Chưa thể mở toàn màn hình. Bạn có thể dùng chế độ ẩn giao diện.'); }
  }, []);

  useEffect(() => {
    const sync = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);

  useEffect(() => {
    if (custom && dialog.current && !dialog.current.open) dialog.current.showModal();
    else if (!custom) dialog.current?.close();
  }, [custom]);

  useEffect(() => {
    const onKey = (event) => {
      if (event.repeat || event.ctrlKey || event.metaKey || event.altKey || custom || event.target.closest?.('input, select, textarea, [contenteditable="true"]')) return;
      if (event.code === 'Space' && !event.target.closest?.('button, a')) { event.preventDefault(); toggleTimer(); }
      if (event.key.toLowerCase() === 'm') sound.toggleAudio();
      if (event.key.toLowerCase() === 'h') setImmersed((value) => !value);
      if (event.key.toLowerCase() === 'f') toggleFullscreen();
      if (event.key === 'Escape') setImmersed(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [custom, toggleTimer, sound.toggleAudio, toggleFullscreen]);

  const digits = String(Math.floor(remaining / 60)).padStart(2, '0') + ':' + String(remaining % 60).padStart(2, '0');
  const progress = Math.max(0, Math.min(1, remaining / phaseDuration));
  useEffect(() => {
    document.title = running ? digits + ' · Lặng' : complete ? 'Hết giờ · Lặng' : 'Lặng — Một chút bình yên';
  }, [digits, running, complete]);

  return <main className={'app ' + mood + (immersed ? ' is-immersed' : '') + (weather === 'rain' ? ' is-raining' : weather === 'snow' ? ' is-snowing' : '')}>
    <NatureScene mood={mood} weather={weather} view={view} drift={drift} quality={quality} showPerformance={showPerformance} onPerformance={setPerformanceStats} />
    <div className="scene-shade" />
    <div className="screen-actions" role="group" aria-label="Hiển thị">
      <SceneSettings view={view} onViewChange={setView} drift={drift} onDriftChange={setDrift} quality={quality} onQualityChange={setQuality} showPerformance={showPerformance} onShowPerformanceChange={setShowPerformance} performanceStats={performanceStats} />
      <IconButton label={immersed ? 'Hiện giao diện (H)' : 'Ẩn giao diện (H)'} active={immersed} onClick={() => setImmersed(!immersed)}>{immersed ? <Eye size={18} /> : <EyeOff size={18} />}</IconButton>
      <IconButton label={fullscreen ? 'Thoát toàn màn hình (F)' : 'Toàn màn hình (F)'} onClick={toggleFullscreen}>{fullscreen ? <Minimize size={18} /> : <Maximize size={18} />}</IconButton>
    </div>

    <section className="content" inert={immersed} aria-label="Hẹn giờ">
      <div className={'timer-card' + (running ? ' is-running' : '') + (complete ? ' is-complete' : '') + (timerCollapsed ? ' is-collapsed' : '')}>
        <div className="timer-heading"><span><Timer size={14} /> {phase === 'break' ? 'NGHỈ NGẮN' : 'ĐẾM NGƯỢC'}</span><div className="timer-heading-controls"><span className={'status-dot' + (running ? ' pulse' : '')} /><TimerSettings settings={timerSettings} onChange={setTimerSettings} /><IconButton className="timer-collapse" label={timerCollapsed ? 'Mở rộng bảng đếm ngược' : 'Thu gọn bảng đếm ngược'} aria-expanded={!timerCollapsed} onClick={() => setTimerCollapsed((value) => !value)}>{timerCollapsed ? <ChevronUp size={17}/> : <ChevronDown size={17}/>}</IconButton></div></div>
        <div className="timer-dial">
          <svg className="dial-ring" viewBox="0 0 200 200" aria-hidden="true">
            <defs><linearGradient id="timer-gradient" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#f4dfae"/><stop offset="1" stopColor="#a5cdb3"/></linearGradient></defs>
            {Array.from({ length: 60 }, (_, i) => <line key={i} x1="100" y1="6" x2="100" y2={i % 5 === 0 ? '11' : '8'} transform={'rotate(' + i * 6 + ' 100 100)'} className={i % 5 === 0 ? 'dial-tick major' : 'dial-tick'} />)}
            <circle cx="100" cy="100" r="84" className="dial-track" />
            <circle cx="100" cy="100" r="84" className="dial-progress" strokeDasharray={CIRCUMFERENCE} strokeDashoffset={CIRCUMFERENCE * (1 - progress)} />
          </svg>
          <div className="dial-content"><div className="timer" role="timer" aria-label={'Còn ' + Math.floor(remaining / 60) + ' phút ' + remaining % 60 + ' giây'}>{digits}</div><p className="timer-note" aria-live="polite">{complete ? 'Hoàn thành' : running ? phase === 'break' ? 'Đang nghỉ ngắn' : 'Đang thư giãn' : remaining < phaseDuration ? 'Đã tạm dừng' : 'Sẵn sàng'}</p></div>
        </div>
        <div className="presets" aria-label="Thời gian đặt sẵn">
          {[5, 15, 25, 45].map((value) => <button key={value} type="button" className={minutes === value ? 'selected' : ''} aria-pressed={minutes === value} onClick={() => choose(value)}>{value}<span> phút</span></button>)}
          <button type="button" className={![5, 15, 25, 45].includes(minutes) ? 'selected custom-preset' : 'custom-preset'} aria-label="Tùy chỉnh thời gian" title="Tùy chỉnh thời gian" onClick={() => { setCustomMinutes(String(minutes)); setCustom(true); }}><SlidersHorizontal size={14}/></button>
        </div>
        <div className="timer-actions"><button className="start" aria-label={running ? 'Tạm dừng' : remaining < phaseDuration && remaining > 0 ? 'Tiếp tục' : complete ? 'Bắt đầu lại' : 'Bắt đầu'} onClick={toggleTimer}>{running ? <Pause size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" />}<span>{running ? 'Tạm dừng' : remaining < phaseDuration && remaining > 0 ? 'Tiếp tục' : complete ? 'Bắt đầu lại' : 'Bắt đầu'}</span></button><IconButton label="Đặt lại bộ đếm" className="reset" onClick={() => choose(minutes)}><RotateCcw size={17}/></IconButton></div>
      </div>
    </section>

    <div className="scene-controls" role="group" aria-label="Điều khiển phong cảnh" inert={immersed}>
      <AudioMixer mix={mix} onMixChange={setMix} masterMuted={muted} recordingStatus={sound.recordingStatus} />
      <div className="audio-group"><IconButton label={muted ? 'Bật âm thanh (M)' : 'Tắt âm thanh (M)'} active={!muted} disabled={sound.busy} onClick={sound.toggleAudio}>{muted || volume === 0 ? <VolumeX size={18}/> : <Volume2 size={18}/>}</IconButton><input className="volume-slider" type="range" min="0" max="100" step="1" value={volume} onChange={(e) => setVolume(Number(e.target.value))} aria-label="Âm lượng" aria-valuetext={volume + '%'} title={'Âm lượng: ' + volume + '%'} style={{ '--volume': volume + '%' }}/><output className="volume-value" aria-hidden="true">{volume}<span>%</span></output></div>
      <span className="control-divider" />
      <div className="mood-group" role="group" aria-label="Ánh sáng">{MOODS.map(({ id, label, icon: Icon }) => <IconButton key={id} label={label} active={mood === id} onClick={() => { setAutoMood(false); setMood(id); }}><Icon size={18}/></IconButton>)}<IconButton className="auto-button" label={autoMood ? 'Tắt tự chuyển buổi (mỗi 2 phút)' : 'Tự chuyển buổi (mỗi 2 phút)'} active={autoMood} onClick={() => setAutoMood(!autoMood)}><Repeat2 size={17}/></IconButton></div>
      <span className="control-divider weather-divider" />
      <div className="weather-group" role="group" aria-label="Thời tiết">
        <IconButton label={weather === 'rain' ? 'Tắt mưa' : 'Bật mưa nhẹ'} active={weather === 'rain'} onClick={() => { setAutoWeather(false); setWeather(weather === 'rain' ? 'clear' : 'rain'); }}><CloudRain size={18}/></IconButton>
        <IconButton label={weather === 'snow' ? 'Tắt tuyết' : 'Bật tuyết rơi'} active={weather === 'snow'} onClick={() => { setAutoWeather(false); setWeather(weather === 'snow' ? 'clear' : 'snow'); }}><Snowflake size={18}/></IconButton>
        <IconButton className="auto-button" label={autoWeather ? 'Tắt tự chuyển thời tiết (mỗi 3 phút)' : 'Tự chuyển thời tiết (mỗi 3 phút)'} active={autoWeather} onClick={() => setAutoWeather(!autoWeather)}><Repeat2 size={17}/></IconButton>
      </div>
    </div>

    {(notice || sound.error) && <div className="toast" role="status">{notice || sound.error}<IconButton label="Đóng thông báo" onClick={() => { setNotice(''); sound.clearError(); }}><X size={16}/></IconButton></div>}
    <dialog className="modal" ref={dialog} aria-labelledby="custom-title" onCancel={() => setCustom(false)} onClose={() => setCustom(false)} onClick={(e) => { if (e.target === dialog.current) { const rect = e.currentTarget.getBoundingClientRect(); if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) setCustom(false); } }}>
      <form onSubmit={(e) => { e.preventDefault(); const n = Number(customMinutes); if (Number.isInteger(n) && n >= 1 && n <= 180) { choose(n); setCustom(false); } }}>
        <IconButton label="Đóng" className="modal-close" onClick={() => setCustom(false)}><X size={18}/></IconButton><div className="modal-icon"><Timer size={24}/></div><h2 id="custom-title">Thời gian của bạn</h2><label htmlFor="minutes">Số phút (1–180)</label><div className="duration-input"><input autoFocus id="minutes" type="number" min="1" max="180" step="1" required value={customMinutes} onChange={(e) => setCustomMinutes(e.target.value)}/><span>phút</span></div><button className="start" type="submit"><Check size={16}/> Đặt thời gian</button>
      </form>
    </dialog>
  </main>;
}

createRoot(document.getElementById('root')).render(<React.StrictMode><App/></React.StrictMode>);
