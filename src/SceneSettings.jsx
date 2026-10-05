import { useEffect, useId, useRef } from 'react';
import { Mountain, Settings2, Waves } from 'lucide-react';
import './scene-settings.css';

export function SceneSettings({ view = 'valley', onViewChange, drift = true, onDriftChange, quality = 'auto', onQualityChange, showPerformance = false, onShowPerformanceChange, performanceStats }) {
  const details = useRef(null);
  const trigger = useRef(null);
  const labelId = useId();
  const qualityId = useId();

  useEffect(() => {
    const closeOutside = (event) => {
      const element = details.current;
      if (element?.open && !element.contains(event.target)) element.open = false;
    };
    document.addEventListener('pointerdown', closeOutside);
    return () => document.removeEventListener('pointerdown', closeOutside);
  }, []);

  const onKeyDown = (event) => {
    // Local controls must not activate the app's timer or scene shortcuts.
    event.stopPropagation();
    if (event.key === 'Escape' && details.current?.open) {
      event.preventDefault();
      details.current.open = false;
      trigger.current?.focus();
    }
  };

  const onBlur = (event) => {
    if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) details.current.open = false;
  };

  return <details className="scene-settings" ref={details} onKeyDown={onKeyDown} onBlur={onBlur}>
    <summary ref={trigger} className="icon-button scene-settings-trigger" aria-label="Tùy chỉnh khung cảnh" title="Tùy chỉnh khung cảnh">
      <Settings2 size={18} aria-hidden="true" />
    </summary>
    <div className="scene-settings-panel" role="group" aria-labelledby={labelId}>
      <h2 id={labelId}>Khung cảnh</h2>
      <fieldset className="scene-settings-views">
        <legend>Góc nhìn</legend>
        <div className="scene-settings-view-options">
          <button type="button" aria-pressed={view === 'valley'} onClick={() => onViewChange?.('valley')}>
            <Mountain size={20} aria-hidden="true" /><span>Toàn cảnh</span>
          </button>
          <button type="button" aria-pressed={view === 'stream'} onClick={() => onViewChange?.('stream')}>
            <Waves size={20} aria-hidden="true" /><span>Ven suối</span>
          </button>
        </div>
      </fieldset>
      <label className="scene-settings-drift">
        <span>Camera trôi nhẹ</span>
        <input type="checkbox" checked={drift} onChange={(event) => onDriftChange?.(event.target.checked)} />
        <span className="scene-settings-switch" aria-hidden="true" />
      </label>
      <div className="scene-settings-quality">
        <label htmlFor={qualityId}>Chất lượng đồ họa</label>
        <select id={qualityId} value={quality} onChange={(event) => onQualityChange?.(event.target.value)}>
          <option value="auto">Tự động</option>
          <option value="high">Cao</option>
          <option value="balanced">Cân bằng</option>
          <option value="light">Nhẹ</option>
        </select>
      </div>
      <label className="scene-settings-drift">
        <span>Hiển thị hiệu năng</span>
        <input type="checkbox" checked={showPerformance} onChange={(event) => onShowPerformanceChange?.(event.target.checked)} />
        <span className="scene-settings-switch" aria-hidden="true" />
      </label>
      {showPerformance && <div className="scene-performance" aria-label="Hiệu năng cảnh 3D">
        {performanceStats?.state === 'running' || performanceStats?.state === 'static' ? <>
          <dl>
            <div><dt>FPS</dt><dd>{performanceStats.state === 'static' ? 'Tĩnh' : Math.round(performanceStats.fps)}</dd></div>
            <div><dt>Mỗi khung hình</dt><dd>{performanceStats.frameMs == null ? '—' : performanceStats.frameMs.toFixed(1) + ' ms'}</dd></div>
            <div><dt>Lượt vẽ</dt><dd>{performanceStats.calls}</dd></div>
            <div><dt>Mức đang dùng</dt><dd>{{ high: 'Cao', balanced: 'Cân bằng', light: 'Nhẹ' }[performanceStats.quality]}</dd></div>
          </dl>
        </> : <p>{performanceStats?.state === 'unavailable' ? 'Đang dùng cảnh dự phòng.' : 'Đang đo khung hình…'}</p>}
      </div>}
    </div>
  </details>;
}
