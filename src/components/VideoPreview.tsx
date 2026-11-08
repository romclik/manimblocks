import { useEffect, useRef, useState } from 'react';

const fmt = (s: number) => {
  if (!Number.isFinite(s)) return '0:00.0';
  const m = Math.floor(s / 60);
  return `${m}:${(s - m * 60).toFixed(1).padStart(4, '0')}`;
};

export function VideoPreview({ url }: { url: string | null }) {
  const box = useRef<HTMLDivElement>(null);
  const vid = useRef<HTMLVideoElement>(null);
  const [time, setTime] = useState(0);
  const [dur, setDur] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [full, setFull] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { setTime(0); setDur(0); setPlaying(false); setError(''); }, [url]);
  useEffect(() => {
    if (!playing) return;
    let id = 0;
    const tick = () => { if (vid.current) setTime(vid.current.currentTime); id = requestAnimationFrame(tick); };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [playing]);
  useEffect(() => {
    const on = () => setFull(document.fullscreenElement === box.current);
    document.addEventListener('fullscreenchange', on);
    return () => document.removeEventListener('fullscreenchange', on);
  }, []);

  if (!url) return <div className="player empty">Render your animation to preview it here.</div>;

  const toggle = () => {
    const v = vid.current; if (!v) return;
    if (v.ended) v.currentTime = 0;
    if (v.paused || v.ended) void v.play(); else v.pause();
  };
  const restart = () => { const v = vid.current; if (v) { v.currentTime = 0; setTime(0); void v.play(); } };
  const seek = (t: number) => { const v = vid.current; if (v) { v.currentTime = t; setTime(t); } };
  const fullscreen = () => { if (document.fullscreenElement) void document.exitFullscreen(); else void box.current?.requestFullscreen(); };

  return (
    <div className="player" ref={box} tabIndex={0} onKeyDown={(e) => { if (e.key === ' ') { e.preventDefault(); toggle(); } }}>
      <video
        key={url} ref={vid} src={url} autoPlay muted playsInline onClick={toggle}
        onLoadedMetadata={(e) => setDur(e.currentTarget.duration)}
        onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => { setPlaying(false); setTime(vid.current?.duration ?? 0); }}
        onSeeked={(e) => setTime(e.currentTarget.currentTime)}
        onError={() => setError('The video could not be loaded.')}
      />
      {error && <div className="player-err">{error}</div>}
      <div className="controls">
        <button onClick={toggle} title="Play / pause (Space)">{playing ? '❚❚' : '▶'}</button>
        <button onClick={restart} title="Restart">⟲</button>
        <input type="range" min={0} max={dur || 0} step={0.01} value={Math.min(time, dur || 0)} onChange={(e) => seek(Number(e.target.value))} aria-label="Seek" />
        <span className="time">{fmt(time)} / {fmt(dur)}</span>
        <button onClick={fullscreen} title="Fullscreen">{full ? '🗗' : '⛶'}</button>
      </div>
    </div>
  );
}
