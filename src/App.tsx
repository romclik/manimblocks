import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as Blockly from 'blockly';
import { BlocklyEditor } from './components/BlocklyEditor';
import { CodePanel, type Tab } from './components/CodePanel';
import { SetupDialog } from './components/SetupDialog';
import { generate, type WorkspaceState } from './codegen/generate';
import { copyText, saveTextFile } from './lib/files';

export default function App() {
  const api = window.manimBlocks;
  const wsRef = useRef<Blockly.WorkspaceSvg | null>(null);
  const [state, setState] = useState<WorkspaceState>({});
  const [status, setStatus] = useState('');
  const [tab, setTab] = useState<Tab>('code');
  const [setup, setSetup] = useState<'first' | 'manual' | null>(null);
  const [envReady, setEnvReady] = useState(false);
  const [quality, setQuality] = useState<'l' | 'm' | 'h'>('m');
  const [rendering, setRendering] = useState(false);
  const [info, setInfo] = useState('');
  const [log, setLog] = useState<string[]>([]);
  const [renderError, setRenderError] = useState('');
  const [hasVideo, setHasVideo] = useState(false);
  const result = useMemo(() => generate(state), [state]);
  const blocked = result.errorCount > 0;

  const say = (msg: string) => { setStatus(msg); window.setTimeout(() => setStatus(''), 5000); };
  const onReady = useCallback((ws: Blockly.WorkspaceSvg) => { wsRef.current = ws; }, []);

  useEffect(() => {
    if (!api) return;
    api.getSettings().then((s) => { setEnvReady(s.envStatus.ready); if (!s.configured || !s.envStatus.ready) setSetup(s.configured ? null : 'first'); });
    const a = api.onRenderProgress((p) => setInfo(p.animation ? `Animation ${p.animation}${p.percent !== undefined && p.percent < 100 ? ` - ${p.percent}%` : ' done'}` : (p.message ?? '')));
    const b = api.onRenderLog((l) => setLog((x) => [...x.slice(-500), l]));
    return () => { a(); b(); };
  }, [api]);

  const newProject = () => {
    const ws = wsRef.current;
    if (!ws) return;
    if (ws.getAllBlocks(false).length && !window.confirm('Start a new animation? Your current blocks will be removed. (Saving projects is not available yet.)')) return;
    ws.clear();
  };
  const copy = async () => say((await copyText(result.code)) ? 'Python code copied.' : 'Could not copy.');
  const exportPy = async () => {
    const r = await saveTextFile('animation.py', result.code, [{ name: 'Python script', extensions: ['py'] }]);
    if (r.ok) say(`Saved ${r.path}`); else if (!r.canceled) say(`Could not save: ${r.error ?? 'unknown error'}`);
  };
  const selectBlock = (id: string) => { const ws = wsRef.current; const b = ws?.getBlockById(id); if (ws && b) { b.select(); ws.centerOnBlock(id); } };

  const render = async () => {
    if (!api) { say('Rendering only works in the desktop app.'); return; }
    if (!envReady) { setSetup('manual'); return; }
    setRendering(true); setLog([]); setRenderError(''); setInfo('Starting...'); setTab('log');
    const r = await api.startRender({ code: result.code, quality });
    setRendering(false); setInfo('');
    if (r.ok) { setHasVideo(true); say('Render finished. Use Open video or Export MP4.'); }
    else if (r.canceled) say('Render canceled.');
    else { setRenderError(r.error ?? 'Render failed.'); say('Render failed. See the Render log.'); }
  };
  const video = async (kind: 'open' | 'show' | 'export') => {
    if (!api) return;
    const r = await (kind === 'open' ? api.openVideo() : kind === 'show' ? api.showVideo() : api.exportVideo());
    if (!r.ok && !('canceled' in r && r.canceled)) say(`Could not ${kind} the video: ${'error' in r ? r.error : ''}`);
    else if (kind === 'export' && r.ok && 'path' in r) say(`Saved ${r.path}`);
  };

  return (
    <div className="app">
      <header className="toolbar">
        <div className="brand"><span className="logo">▦</span> ManimBlocks</div>
        <button onClick={newProject}>New</button>
        <button onClick={() => wsRef.current?.undo(false)}>Undo</button>
        <button onClick={() => wsRef.current?.undo(true)}>Redo</button>
        <span className="sep" />
        <button onClick={copy} disabled={blocked} title={blocked ? 'Fix the problems first' : ''}>Copy code</button>
        <button onClick={exportPy} disabled={blocked} title={blocked ? 'Fix the problems first' : ''}>Export .py</button>
        <span className="sep" />
        <select value={quality} onChange={(e) => setQuality(e.target.value as 'l' | 'm' | 'h')} disabled={rendering} title="Render quality">
          <option value="l">Low (480p, 15 fps)</option><option value="m">Medium (720p, 30 fps)</option><option value="h">High (1080p, 60 fps)</option>
        </select>
        {rendering
          ? <button className="primary" onClick={() => api?.cancelRender()}>Cancel render</button>
          : <button className="primary" onClick={render} disabled={blocked} title={blocked ? 'Fix the problems first' : ''}>Render</button>}
        {rendering && <span className="spin">{info}</span>}
        {hasVideo && !rendering && (<>
          <button onClick={() => video('open')}>Open video</button>
          <button onClick={() => video('show')}>Show in folder</button>
          <button onClick={() => video('export')}>Export MP4</button>
        </>)}
        <span className="grow" />
        <span className="status">{status}</span>
        {api && <button onClick={() => setSetup('manual')}>Settings</button>}
      </header>
      <main className="main">
        <BlocklyEditor onReady={onReady} onChange={setState} />
        <aside className="preview">
          <h3>Preview</h3>
          <p>The in-app video player is not built yet (stage 5). After a render, use <b>Open video</b> to watch it in your video player, or <b>Export MP4</b> to save it.</p>
          <p className="dim">Tip: drag a <b>when animation starts</b> block in, then add blocks under it.</p>
        </aside>
      </main>
      <CodePanel result={result} onSelectBlock={selectBlock} tab={tab} onTab={setTab} log={log} renderError={renderError} />
      {setup && api && <SetupDialog firstRun={setup === 'first'} onClose={() => setSetup(null)} onReady={() => { setEnvReady(true); say('Rendering is ready.'); }} />}
    </div>
  );
}
