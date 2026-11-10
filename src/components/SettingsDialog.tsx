import { useEffect, useRef, useState } from 'react';

interface Props {
  info: SettingsInfo; prefs: Prefs; update: UpdateState; onPrefs: (patch: Partial<Prefs>) => void;
  onClose: () => void; onSetup: () => void; onRefresh: () => void; onCheckUpdates: () => void;
}
const QUALITY: [Quality, string][] = [['l', 'Low (480p, 15 fps)'], ['m', 'Medium (720p, 30 fps)'], ['h', 'High (1080p, 60 fps)']];

export function SettingsDialog({ info, prefs, update, onPrefs, onClose, onSetup, onRefresh, onCheckUpdates }: Props) {
  const api = window.manimBlocks!;
  const [busy, setBusy] = useState(false);
  const [prog, setProg] = useState<EnvProgress | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [error, setError] = useState('');
  const logRef = useRef<HTMLPreElement>(null);
  useEffect(() => {
    const a = api.onEnvProgress(setProg), b = api.onEnvLog((l) => setLog((x) => [...x.slice(-200), l]));
    return () => { a(); b(); };
  }, [api]);
  useEffect(() => { logRef.current?.scrollTo(0, 1e9); }, [log]);

  const pickExport = async () => { const p = await api.pickFolder(prefs.exportDir || undefined); if (p) onPrefs({ exportDir: p }); };
  const installLatex = async () => {
    setError(''); setLog([]); setBusy(true); setProg({ phase: 'start', percent: 1, message: 'Starting...' });
    const r = await api.installLatex();
    setBusy(false); onRefresh();
    if (!r.ok && !r.canceled) setError(r.error ?? 'Installation failed.');
  };
  const loc = info.locations;
  const updText = {
    idle: '', checking: 'Checking GitHub...', none: 'You have the latest version.', unsupported: update.error ?? '', error: update.error ?? '',
    available: `Version ${update.version} is available.`, downloading: `Downloading version ${update.version}... ${update.percent ?? 0}%`, downloaded: `Version ${update.version} is ready to install.`,
  }[update.status];

  return (
    <div className="modal">
      <div className="dialog wide" role="dialog" aria-modal="true">
        <h2>Settings</h2>

        <h3>Appearance</h3>
        <div className="form"><label>Theme</label>
          <select value={prefs.theme} onChange={(e) => onPrefs({ theme: e.target.value as Prefs['theme'] })}><option value="dark">Dark</option><option value="light">Light</option></select></div>
        <div className="form"><label>Hide block palette</label>
          <input type="checkbox" checked={prefs.paletteAutoHide} onChange={(e) => onPrefs({ paletteAutoHide: e.target.checked })} />
          <span className="hint2">Off: the palette is always visible. On: it only appears while the mouse is over the category list, and hides when the mouse leaves.</span></div>

        <h3>Rendering</h3>
        <div className="form"><label>Preview quality</label>
          <select value={prefs.previewQuality} onChange={(e) => onPrefs({ previewQuality: e.target.value as Quality })}>{QUALITY.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
        <div className="form"><label>Render quality</label>
          <select value={prefs.renderQuality} onChange={(e) => onPrefs({ renderQuality: e.target.value as Quality })}>{QUALITY.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
        <div className="form"><label>Frame rate</label>
          <select value={prefs.fps} onChange={(e) => onPrefs({ fps: Number(e.target.value) })}>
            <option value={0}>Automatic (from quality)</option>{[12, 24, 30, 48, 60, 120].map((n) => <option key={n} value={n}>{n} fps</option>)}</select>
          <span className="hint2">A "set frame rate" block in your animation overrides this.</span></div>

        <h3>Export</h3>
        <div className="form"><label>Default export folder</label>
          <div className="pathbox"><input readOnly value={prefs.exportDir || 'Not set (the save dialog decides)'} /><button onClick={pickExport}>Browse</button><button disabled={!prefs.exportDir} onClick={() => onPrefs({ exportDir: '' })}>Clear</button></div></div>

        <h3>Rendering environment</h3>
        {loc ? (<div className="kv">
          <span>Python environment</span><code>{loc.pythonEnv}</code><span>Download cache</span><code>{loc.cache}</code><span>Temporary files</span><code>{loc.temp}</code>
          <span>Python / Manim</span><code>{info.envStatus.ready ? `${info.envStatus.python} / ${info.envStatus.manim}` : 'not installed'}</code>
        </div>) : <p className="dim">Not set up yet.</p>}
        <div className="actions left"><button onClick={onSetup}>{info.envStatus.ready ? 'Repair / reinstall...' : 'Set up...'}</button></div>

        <h3>LaTeX (needed only for MathTex)</h3>
        <p className="dim small">{info.latex.available ? (info.latex.source === 'managed' ? 'ManimBlocks LaTeX (TinyTeX) is installed.' : `LaTeX found on this computer (${info.latex.path}).`) : 'LaTeX is not installed. Windows only: ManimBlocks can install a small private copy (about 70 MB download, 300 MB on disk) into the Python environment folder.'}</p>
        {busy && prog && (<><div className="bar"><div style={{ width: `${prog.percent}%` }} /></div><div className="small">{prog.message}</div><pre className="log" ref={logRef}>{log.join('\n')}</pre></>)}
        {error && <p className="err-text">{error}</p>}
        <div className="actions left">
          {busy ? <button onClick={() => api.cancelEnv()}>Cancel</button>
            : <button disabled={!info.envStatus.ready || info.latex.source === 'managed'} onClick={installLatex} title={info.envStatus.ready ? '' : 'Set up the rendering environment first'}>{info.latex.source === 'managed' ? 'Installed' : 'Install LaTeX'}</button>}
        </div>

        <h3>Updates</h3>
        <div className="form"><label>Check automatically</label>
          <input type="checkbox" checked={prefs.autoUpdate} onChange={(e) => onPrefs({ autoUpdate: e.target.checked })} />
          <span className="hint2">Looks at GitHub Releases now and then. Nothing is ever downloaded or installed without your permission.</span></div>
        <div className="actions left"><button onClick={onCheckUpdates} disabled={update.status === 'checking' || update.status === 'downloading'}>Check for updates</button><span className="small dim">{updText}</span></div>

        <h3>About</h3>
        <p className="dim small">ManimBlocks {info.appVersion}. Manim {info.envStatus.manim ?? 'not installed'}. MIT licensed.</p>

        <div className="actions"><button className="primary" onClick={onClose}>Done</button></div>
      </div>
    </div>
  );
}
