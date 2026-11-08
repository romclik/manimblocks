import { useEffect, useRef, useState } from 'react';

const gb = (n: number) => (n / 1e9).toFixed(1) + ' GB';
const ROWS: { key: keyof Locations; label: string; hint: string }[] = [
  { key: 'root', label: 'Data folder', hint: 'Base folder. Changing it fills in the three below.' },
  { key: 'pythonEnv', label: 'Python environment', hint: 'Python, Manim and FFmpeg (about 1.5 GB).' },
  { key: 'cache', label: 'Download cache', hint: 'Package downloads (about 1 GB).' },
  { key: 'temp', label: 'Temporary render files', hint: 'Scratch space for rendering; finished videos stay here until you export them.' },
];
const sep = (p: string) => (p.includes('\\') ? '\\' : '/');
const derive = (root: string): Locations => { const s = sep(root); const j = (n: string) => root.replace(/[\\/]+$/, '') + s + n; return { root, pythonEnv: j('python'), cache: j('cache'), temp: j('temp') }; };

interface Props { onClose: () => void; onReady: () => void; firstRun: boolean }

export function SetupDialog({ onClose, onReady, firstRun }: Props) {
  const api = window.manimBlocks!;
  const [info, setInfo] = useState<SettingsInfo | null>(null);
  const [loc, setLoc] = useState<Locations | null>(null);
  const [free, setFree] = useState<Record<string, number | undefined>>({});
  const [busy, setBusy] = useState(false);
  const [prog, setProg] = useState<EnvProgress | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [error, setError] = useState('');
  const logRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    api.getSettings().then((s) => { setInfo(s); setLoc(s.locations ?? s.defaults); });
    const off1 = api.onEnvProgress(setProg);
    const off2 = api.onEnvLog((l) => setLog((x) => [...x.slice(-300), l]));
    return () => { off1(); off2(); };
  }, [api]);
  useEffect(() => { logRef.current?.scrollTo(0, 1e9); }, [log]);
  useEffect(() => {
    if (!loc) return;
    for (const k of ['pythonEnv', 'cache', 'temp'] as const)
      api.freeSpace(loc[k]).then((r) => setFree((f) => ({ ...f, [k]: r.ok ? r.bytes : undefined })));
  }, [api, loc]);

  if (!info || !loc) return <div className="modal"><div className="dialog">Loading...</div></div>;
  const installed = info.envStatus.ready;
  const locked = installed || busy;

  const browse = async (key: keyof Locations) => {
    const p = await api.pickFolder(loc[key]);
    if (p) setLoc(key === 'root' ? derive(p) : { ...loc, [key]: p });
  };
  const install = async () => {
    setError(''); setLog([]); setBusy(true); setProg({ phase: 'start', percent: 1, message: 'Starting...' });
    const s = await api.setLocations(loc);
    if (!s.ok) { setBusy(false); setError(s.error ?? 'Could not save the folders.'); return; }
    const r = await api.installEnv();
    setBusy(false);
    if (r.ok) { onReady(); onClose(); }
    else if (!r.canceled) setError(r.error ?? 'Installation failed.');
    else setError('Installation canceled. You can start again at any time.');
  };

  return (
    <div className="modal">
      <div className="dialog">
        <h2>{installed ? 'Rendering environment' : 'Set up rendering'}</h2>
        <p className="dim">
          {installed
            ? `Python ${info.envStatus.python} and Manim ${info.envStatus.manim} are installed.`
            : 'ManimBlocks installs its own private Python, Manim and FFmpeg. Nothing is installed system-wide, and you choose where the files go. Internet is needed once.'}
        </p>
        {!info.uvFound && <p className="err-text">The setup tool (uv) is missing. In a development copy run <code>npm install</code> again; for the installed app, reinstall ManimBlocks.</p>}
        {ROWS.map((r) => (
          <div className="row" key={r.key}>
            <label>{r.label}<span className="hint2">{r.hint}</span></label>
            <div className="pathbox">
              <input value={loc[r.key]} disabled={locked} onChange={(e) => setLoc(r.key === 'root' ? derive(e.target.value) : { ...loc, [r.key]: e.target.value })} />
              <button disabled={locked} onClick={() => browse(r.key)}>Browse</button>
            </div>
            {r.key !== 'root' && free[r.key] !== undefined && <span className="free">{gb(free[r.key]!)} free on this drive</span>}
          </div>
        ))}
        <p className="dim small">Only a tiny settings file (it remembers these folders) stays in your Windows user profile.</p>
        {busy && prog && (<>
          <div className="bar"><div style={{ width: `${prog.percent}%` }} /></div>
          <div className="small">{prog.message}</div>
          <pre className="log" ref={logRef}>{log.join('\n')}</pre>
        </>)}
        {error && <p className="err-text">{error}</p>}
        <div className="actions">
          {busy ? <button onClick={() => api.cancelEnv()}>Cancel</button> : (<>
            {(!firstRun || installed) && <button onClick={onClose}>Close</button>}
            {firstRun && !installed && <button onClick={onClose}>Later</button>}
            <button className="primary" disabled={!info.uvFound} onClick={install}>{installed ? 'Repair / reinstall' : 'Install'}</button>
          </>)}
        </div>
      </div>
    </div>
  );
}
