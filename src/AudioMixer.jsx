import { useEffect, useId, useRef } from 'react';
import { AudioLines, Bird, CloudRain, Volume2, VolumeX, Waves, Wind } from 'lucide-react';
import { AUDIO_LAYERS, normalizeMix } from './audio/mix.js';
import './audio-mixer.css';

const LAYERS = {
  stream: { name: 'Dòng suối', Icon: Waves },
  wind: { name: 'Gió qua cây', Icon: Wind },
  rain: { name: 'Mưa nhẹ', Icon: CloudRain },
  birds: { name: 'Chim rừng', Icon: Bird },
};

export function AudioMixer({ mix, onMixChange, masterMuted = true, recordingStatus = 'idle' }) {
  const details = useRef(null);
  const trigger = useRef(null);
  const id = useId();
  const value = normalizeMix(mix);
  useEffect(() => {
    const outside = event => {
      if (details.current?.open && !details.current.contains(event.target)) details.current.open = false;
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, []);
  const update = (key, patch) => onMixChange?.({ ...value, [key]: { ...value[key], ...patch } });
  const keyDown = event => {
    event.stopPropagation();
    if (event.key === 'Escape') {
      event.preventDefault();
      details.current.open = false;
      trigger.current?.focus();
    }
  };
  const status = masterMuted ? 'Âm thanh tổng đang tắt'
    : recordingStatus === 'loading' ? 'Đang tải bản thu thiên nhiên…'
      : recordingStatus === 'fallback' ? 'Một số lớp đang dùng âm tổng hợp dự phòng'
        : recordingStatus === 'ready' ? 'Đang phát bản thu thiên nhiên' : 'Bật âm thanh để nghe';

  return <details className="audio-mixer" ref={details} onKeyDown={keyDown} onBlur={event => {
    if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) details.current.open = false;
  }}>
    <summary ref={trigger} className="icon-button audio-mixer-trigger" aria-label="Trộn âm thiên nhiên" title="Trộn âm thiên nhiên">
      <AudioLines size={18} aria-hidden="true" />
    </summary>
    <div className="audio-mixer-panel" role="group" aria-labelledby={`${id}-heading`}>
      <div className="audio-mixer-heading"><h2 id={`${id}-heading`}>Âm thanh thiên nhiên</h2><span>4 lớp âm</span></div>
      {AUDIO_LAYERS.map(key => {
        const { name, Icon } = LAYERS[key];
        return <div className={`audio-mixer-layer${value[key].enabled ? '' : ' is-muted'}`} key={key}>
          <div className="audio-mixer-label"><Icon size={17} aria-hidden="true" /><label htmlFor={`${id}-${key}`}>{name}</label>
            <button type="button" aria-label={`${value[key].enabled ? 'Tắt' : 'Bật'} ${name.toLowerCase()}`} aria-pressed={value[key].enabled}
              onClick={() => update(key, { enabled: !value[key].enabled })}>
              {value[key].enabled ? <Volume2 size={15} aria-hidden="true" /> : <VolumeX size={15} aria-hidden="true" />}
            </button>
          </div>
          <div className="audio-mixer-level"><input id={`${id}-${key}`} type="range" min="0" max="100" value={value[key].level}
            aria-valuetext={`${value[key].level}%${value[key].enabled ? '' : ', đang tắt'}`}
            onChange={event => update(key, { level: Number(event.target.value) })} />
            <output htmlFor={`${id}-${key}`}>{value[key].level}%</output></div>
        </div>;
      })}
      <label className="audio-mixer-follow"><input type="checkbox" checked={value.followWeather}
        onChange={event => onMixChange?.({ ...value, followWeather: event.target.checked })} /><span>Âm thanh theo khung cảnh</span></label>
      <p className="audio-mixer-hint">Mưa theo thời tiết, chim dịu lúc hoàng hôn và ngừng khi đêm xuống.</p>
      <p className="audio-mixer-status" role="status">{status}</p>
      <a className="audio-mixer-credits" href={`${import.meta.env.BASE_URL}audio/ATTRIBUTION.md`} target="_blank" rel="noreferrer">Nguồn bản thu · CC0</a>
    </div>
  </details>;
}
