import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as Blockly from 'blockly';
import { BlocklyEditor } from './components/BlocklyEditor';
import { CodePanel, type Tab } from './components/CodePanel';
import { SetupDialog } from './components/SetupDialog';
import { SettingsDialog } from './components/SettingsDialog';
import { VideoPreview } from './components/VideoPreview';
import { ConfirmDialog } from './components/ConfirmDialog';
import { useProject } from './lib/useProject';
import { generate, type WorkspaceState } from './codegen/generate';
import { copyText, saveTextFile } from './lib/files';

const QUALITY_LABEL: Record<Quality, string> = { l: 'Low (480p, 15 fps)', m: 'Medium (720p, 30 fps)', h: 'High (1080p, 60 fps)' };
const DEFAULT_PREFS: Prefs = { theme: 'dark', previewQuality: 'l', renderQuality: 'm', fps: 0, exportDir: '', paletteAutoHide: false, autoUpdate: true, remindUntil: 0, remindVersion: '' };

export default function App() {
  const api = window.manimBlocks;
  const wsRef = useRef<Blockly.WorkspaceSvg | null>(null);
  const [state, setState] = useState<WorkspaceState>({});
  const [status, setStatus] = useState('');
  const [tab, setTab] = useState<Tab>('code');
  const [setup, setSetup] = useState<'first' | 'manual' | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [info, setInfo] = useState<SettingsInfo | null>(null);
  const [prefs, setPrefsState] = useState<Prefs>(DEFAULT_PREFS);
  const [update, setUpdate] = useState<UpdateState>({ status: 'idle', current: '' });
  const [envReady, setEnvReady] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [info2, setInfo2] = useState('');
  const [log, setLog] = useState<string[]>([]);
  const [renderError, setRenderError] = useState('');
  const [hasVideo, setHasVideo] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [lastLabel, setLastLabel] = useState('');
  const [ready, setReady] = useState(false);
  const [showRecent, setShowRecent] = useState(false);
  const result = useMemo(() => generate(state), [state]);
  const blocked = result.errorCount > 0;

  const say = useCallback((msg: string) => { setStatus(msg); window.setTimeout(() => setStatus(''), 5000); }, []);
  const onReady = useCallback((ws: Blockly.WorkspaceSvg) => { wsRef.current = ws; setReady(true); }, []);
  const project = useProject({ getWs: () => wsRef.current, state, setState, ready, say });

  const refresh = useCallback(async () => {
    if (!api) return null;
    const s = await api.getSettings();
    setInfo(s); setEnvReady(s.envStatus.ready); setPrefsState(s.prefs);
    return s;
  }, [api]);
  useEffect(() => { document.documentElement.dataset.theme = prefs.theme; }, [prefs.theme]);
  useEffect(() => {
    if (!api) return;
    void refresh().then((s) => { if (s && !s.configured) setSetup('first'); });
    void api.getUpdateState().then(setUpdate);
    const offs = [
      api.onUpdateState(setUpdate),
      api.onRenderProgress((p) => setInfo2(p.animation ? `Animation ${p.animation}${p.percent !== undefined && p.percent < 100 ? ` - ${p.percent}%` : ' done'}` : (p.message ?? ''))),
      api.onRenderLog((l) => setLog((x) => [...x.slice(-500), l])),
    ];
    return () => offs.forEach((f) => f());
  }, [api, refresh]);

  const changePrefs = async (patch: Partial<Prefs>) => {
    setPrefsState((p) => ({ ...p, ...patch }));
    const r = await api?.setPrefs(patch);
    if (r?.ok) setPrefsState(r.prefs);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const k = e.key.toLowerCase();
      if (k === 's') { e.preventDefault(); void (e.shiftKey ? project.saveAs() : project.save()); }
      else if (k === 'o') { e.preventDefault(); void project.openProject(); }
      else if (k === 'n') { e.preventDefault(); void project.newProject(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [project]);

  const copy = async () => say((await copyText(result.code)) ? 'Python code copied.' : 'Could not copy.');
  const exportPy = async () => {
    const r = await saveTextFile('animation.py', result.code, [{ name: 'Python script', extensions: ['py'] }]);
    if (r.ok) say(`Saved ${r.path}`); else if (!r.canceled) say(`Could not save: ${r.error ?? 'unknown error'}`);
  };
  const selectBlock = (id: string) => { const ws = wsRef.current; const b = ws?.getBlockById(id); if (ws && b) { b.select(); ws.centerOnBlock(id); } };

  const render = async (kind: 'preview' | 'final') => {
    if (!api) { say('Rendering only works in the desktop app.'); return; }
    if (!envReady) { setSetup('manual'); return; }
    const quality = kind === 'preview' ? prefs.previewQuality : prefs.renderQuality;
    setRendering(true); setLog([]); setRenderError(''); setInfo2('Starting...'); setTab('log');
    const r = await api.startRender({ code: result.code, quality });
    setRendering(false); setInfo2('');
    if (r.ok) { setHasVideo(true); setVideoUrl(r.videoUrl); setLastLabel(`${kind === 'preview' ? 'Preview' : 'Render'}: ${QUALITY_LABEL[quality]}${prefs.fps ? `, ${prefs.fps} fps` : ''}`); say('Done.'); }
    else if (r.canceled) say('Render canceled.');
    else {
      setRenderError(r.error ?? 'Render failed.'); say('Render failed. See the Render log.');
      if (r.needsLatex && (await project.ask({ title: 'LaTeX is needed', message: 'MathTex formulas need LaTeX. You can install a small private copy from Settings (Windows), or install MiKTeX yourself.', buttons: [{ label: 'Open Settings', value: 'open', primary: true }, { label: 'Cancel', value: 'no' }] })) === 'open') { await refresh(); setSettingsOpen(true); }
    }
  };
  const video = async (kind: 'open' | 'show' | 'export') => {
    if (!api) return;
    const r = await (kind === 'open' ? api.openVideo() : kind === 'show' ? api.showVideo() : api.exportVideo());
    if (!r.ok && !('canceled' in r && r.canceled)) say(`Could not ${kind} the video: ${'error' in r ? r.error : ''}`);
    else if (kind === 'export' && r.ok && 'path' in r) say(`Saved ${r.path}`);
  };

  // ---- Updates (every step needs a click)
  const showNotes = async () => {
    const v = await project.ask({ title: `What's new in ${update.version}`, message: update.notes || 'No release notes were published.', buttons: [{ label: 'Open on GitHub', value: 'open' }, { label: 'Close', value: 'close', primary: true }] });
    if (v === 'open') await api?.openReleaseNotes();
  };
  const installUpdate = async () => {
    const v = await project.ask({ title: 'Install update?', message: `ManimBlocks ${update.version} will be installed now and the app will restart. Your projects and rendering environment are not touched.`, buttons: [{ label: 'Install and restart', value: 'yes', primary: true }, { label: 'Not now', value: 'no' }] });
    if (v !== 'yes' || !(await project.confirmDiscard())) return;
    const r = await api!.installUpdate();
    if (!r.ok) await project.ask({ title: 'Could not install', message: r.error ?? 'Unknown error.', buttons: [{ label: 'OK', value: 'ok', primary: true }] });
  };
  const showBar = ['available', 'downloading', 'downloaded'].includes(update.status);

  return (
    <div className={'app' + (showBar ? ' withbar' : '')}>
      <header className="toolbar">
        <div className="brand"><span className="logo">▦</span> ManimBlocks<span className="proj" title={project.path ?? ''}>{project.dirty ? '● ' : ''}{project.name}</span></div>
        <button onClick={project.newProject} title="New project (Ctrl+N)">New</button>
        <button onClick={project.openProject} title="Open project (Ctrl+O)">Open</button>
        <span className="menuwrap">
          <button onClick={() => setShowRecent((v) => !v)} title="Recent projects">Recent ▾</button>
          {showRecent && (<>
            <div className="overlay" onClick={() => setShowRecent(false)} />
            <ul className="menu">
              {project.recent.length === 0 && <li className="none">No recent projects</li>}
              {project.recent.map((r, i) => <li key={r.path} title={r.path} onClick={() => { setShowRecent(false); void project.openRecent(i); }}>{r.name}<span>{r.path}</span></li>)}
            </ul>
          </>)}
        </span>
        <button onClick={() => project.save()} title="Save (Ctrl+S)">Save</button>
        <button onClick={project.saveAs} title="Save as (Ctrl+Shift+S)">Save as</button>
        <span className="sep" />
        <button onClick={() => wsRef.current?.undo(false)}>Undo</button>
        <button onClick={() => wsRef.current?.undo(true)}>Redo</button>
        <span className="sep" />
        <button onClick={copy} disabled={blocked} title={blocked ? 'Fix the problems first' : ''}>Copy code</button>
        <button onClick={exportPy} disabled={blocked} title={blocked ? 'Fix the problems first' : ''}>Export .py</button>
        <span className="sep" />
        {rendering
          ? <button className="primary" onClick={() => api?.cancelRender()}>Cancel</button>
          : (<>
            <button onClick={() => render('preview')} disabled={blocked} title={blocked ? 'Fix the problems first' : `Quick preview: ${QUALITY_LABEL[prefs.previewQuality]}`}>Preview</button>
            <button className="primary" onClick={() => render('final')} disabled={blocked} title={blocked ? 'Fix the problems first' : `Final render: ${QUALITY_LABEL[prefs.renderQuality]}`}>Render</button>
          </>)}
        {rendering && <span className="spin">{info2}</span>}
        {hasVideo && !rendering && <button onClick={() => video('export')}>Export MP4</button>}
        <span className="grow" />
        <span className="status">{status}</span>
        {api && <button onClick={async () => { await refresh(); setSettingsOpen(true); }}>Settings</button>}
      </header>
      {showBar && (
        <div className="updatebar">
          {update.status === 'available' && (<><span>ManimBlocks <b>{update.version}</b> is available (you have {update.current}).</span>
            <button className="primary" onClick={() => api?.downloadUpdate()}>Download</button><button onClick={showNotes}>Release notes</button><button onClick={() => api?.remindLater()}>Remind me later</button></>)}
          {update.status === 'downloading' && (<><span>Downloading {update.version}...</span><div className="bar"><div style={{ width: `${update.percent ?? 0}%` }} /></div><span>{update.percent ?? 0}%</span></>)}
          {update.status === 'downloaded' && (<><span>Version <b>{update.version}</b> is downloaded and ready.</span>
            <button className="primary" onClick={installUpdate}>Install and restart</button><button onClick={showNotes}>Release notes</button></>)}
        </div>
      )}
      <main className="main">
        <BlocklyEditor theme={prefs.theme} autoHidePalette={prefs.paletteAutoHide} onReady={onReady} onChange={setState} />
        <aside className="preview">
          <h3>Preview</h3>
          <VideoPreview url={videoUrl} />
          {lastLabel && <p className="dim small">{lastLabel}. Not what you wanted? Change qualities in Settings.</p>}
          {hasVideo && <div className="vbtns"><button onClick={() => video('open')}>Open in video player</button><button onClick={() => video('show')}>Show in folder</button></div>}
          <p className="dim small">Tip: snap blocks under the <b>when animation starts</b> block. <b>Preview</b> is quick and low quality; <b>Render</b> makes the final video.</p>
        </aside>
      </main>
      <CodePanel result={result} onSelectBlock={selectBlock} tab={tab} onTab={setTab} log={log} renderError={renderError} />
      {project.dialog && <ConfirmDialog spec={project.dialog} onChoose={project.dialog.resolve} />}
      {settingsOpen && info && api && (
        <SettingsDialog info={info} prefs={prefs} update={update} onPrefs={changePrefs} onRefresh={refresh}
          onClose={() => setSettingsOpen(false)} onSetup={() => { setSettingsOpen(false); setSetup('manual'); }}
          onCheckUpdates={() => { void api.checkUpdates().then(setUpdate); }} />
      )}
      {setup && api && <SetupDialog firstRun={setup === 'first'} onClose={() => { setSetup(null); void refresh(); }} onReady={() => { setEnvReady(true); say('Rendering is ready.'); void refresh(); }} />}
    </div>
  );
}
