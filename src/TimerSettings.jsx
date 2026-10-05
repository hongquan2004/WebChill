import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Settings2, X } from 'lucide-react';
import { normalizeTimerSettings } from './timerSession.js';
import './timer-settings.css';

export function TimerSettings({ settings, onChange }) {
  const value = normalizeTimerSettings(settings);
  const details = useRef(null);
  const trigger = useRef(null);
  const panel = useRef(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ left: 12, top: 12 });
  const titleId = useId();
  const fadeId = useId();
  const breakId = useId();
  const update = (key, next) => onChange?.({ ...value, [key]: next });
  const close = (focus = false) => {
    if (details.current) details.current.open = false;
    setOpen(false);
    if (focus) trigger.current?.focus();
  };

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const anchor = trigger.current?.getBoundingClientRect();
      const card = trigger.current?.closest('.timer-card')?.getBoundingClientRect();
      const rect = panel.current?.getBoundingClientRect();
      if (!anchor || !rect) return;
      const right = (card?.right ?? anchor.right) + 12;
      const beside = right + rect.width <= window.innerWidth - 12;
      setPosition({
        left: Math.max(12, Math.min(window.innerWidth - rect.width - 12, beside ? right : (card?.left ?? anchor.left))),
        top: Math.max(12, Math.min(window.innerHeight - rect.height - 12, beside ? anchor.top - 12 : anchor.top - rect.height - 12)),
      });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event) => {
      if (!details.current?.contains(event.target) && !panel.current?.contains(event.target)) close();
    };
    const closeOnFocus = (event) => {
      if (!details.current?.contains(event.target) && !panel.current?.contains(event.target)) close();
    };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('focusin', closeOnFocus);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('focusin', closeOnFocus);
    };
  }, [open]);

  const onKeyDown = (event) => {
    event.stopPropagation();
    if (event.key === 'Escape') { event.preventDefault(); close(true); }
    // The panel is portalled to avoid clipping by the glass timer card.
    // Preserve a natural keyboard route from the summary into its first field.
    if (event.key === 'Tab' && open && !event.shiftKey && event.target === trigger.current) {
      event.preventDefault();
      panel.current?.querySelector('button, input, select')?.focus();
    }
    if (event.key === 'Tab' && event.shiftKey && event.target === panel.current?.querySelector('button, input, select')) {
      event.preventDefault(); trigger.current?.focus();
    }
  };

  return <details ref={details} className="timer-settings" onToggle={(event) => setOpen(event.currentTarget.open)} onKeyDown={onKeyDown}>
    <summary ref={trigger} className="icon-button timer-settings-trigger" title="Tùy chỉnh phiên thư giãn" aria-label="Tùy chỉnh phiên thư giãn" aria-controls={titleId + '-panel'}>
      <Settings2 size={15} aria-hidden="true" />
    </summary>
    {open && createPortal(<div ref={panel} id={titleId + '-panel'} className="timer-settings-panel" role="group" aria-labelledby={titleId} style={position} onKeyDown={onKeyDown}>
      <div className="timer-settings-title"><h2 id={titleId}>Phiên thư giãn</h2><button type="button" className="icon-button" aria-label="Đóng tùy chỉnh phiên" onClick={() => close(true)}><X size={16} aria-hidden="true" /></button></div>
      <label className="timer-settings-toggle"><span>Âm thanh nhỏ dần khi hết giờ</span><input type="checkbox" checked={value.fadeOut} onChange={(event) => update('fadeOut', event.target.checked)} /></label>
      <div className="timer-settings-field"><label htmlFor={fadeId}>Trong thời gian cuối</label><select id={fadeId} value={value.fadeSeconds} disabled={!value.fadeOut} onChange={(event) => update('fadeSeconds', Number(event.target.value))}>{[15, 30, 60].map((seconds) => <option key={seconds} value={seconds}>{seconds} giây</option>)}</select></div>
      <label className="timer-settings-toggle"><span>Nghỉ ngắn sau mỗi phiên</span><input type="checkbox" checked={value.useBreak} onChange={(event) => update('useBreak', event.target.checked)} /></label>
      <div className="timer-settings-field"><label htmlFor={breakId}>Thời gian nghỉ</label><select id={breakId} value={value.breakMinutes} disabled={!value.useBreak} onChange={(event) => update('breakMinutes', Number(event.target.value))}>{Array.from({ length: 30 }, (_, index) => index + 1).map((minutes) => <option key={minutes} value={minutes}>{minutes} phút</option>)}</select></div>
      <label className="timer-settings-toggle"><span>Lặp lại phiên thư giãn</span><input type="checkbox" checked={value.repeat} onChange={(event) => update('repeat', event.target.checked)} /></label>
      <p>Tùy chọn mới áp dụng từ phiên tiếp theo. Âm thanh trở lại khi bắt đầu nghỉ.</p>
    </div>, document.body)}
  </details>;
}
