import { useCallback, useMemo, useRef, useState } from 'react';
import * as Blockly from 'blockly';
import { BlocklyEditor } from './components/BlocklyEditor';
import { CodePanel } from './components/CodePanel';
import { generate, type WorkspaceState } from './codegen/generate';
import { copyText, saveTextFile } from './lib/files';

export default function App() {
  const wsRef = useRef<Blockly.WorkspaceSvg | null>(null);
  const [state, setState] = useState<WorkspaceState>({});
  const [status, setStatus] = useState('');
  const result = useMemo(() => generate(state), [state]);
  const blocked = result.errorCount > 0;

  const say = (msg: string) => { setStatus(msg); window.setTimeout(() => setStatus(''), 4000); };
  const onReady = useCallback((ws: Blockly.WorkspaceSvg) => { wsRef.current = ws; }, []);

  const newProject = () => {
    const ws = wsRef.current;
    if (!ws) return;
    if (ws.getAllBlocks(false).length && !window.confirm('Start a new animation? Your current blocks will be removed. (Saving projects is not available yet.)')) return;
    ws.clear();
  };
  const copy = async () => say((await copyText(result.code)) ? 'Python code copied.' : 'Could not copy.');
  const exportPy = async () => {
    const r = await saveTextFile('animation.py', result.code, [{ name: 'Python script', extensions: ['py'] }]);
    if (r.ok) say(`Saved ${r.path}`);
    else if (!r.canceled) say(`Could not save: ${r.error ?? 'unknown error'}`);
  };
  const selectBlock = (id: string) => {
    const ws = wsRef.current; const b = ws?.getBlockById(id);
    if (ws && b) { b.select(); ws.centerOnBlock(id); }
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
        <button disabled title="Rendering is not implemented yet (stage 4)">Render</button>
        <span className="grow" />
        <span className="status">{status}</span>
      </header>
      <main className="main">
        <BlocklyEditor onReady={onReady} onChange={setState} />
        <aside className="preview">
          <h3>Preview</h3>
          <p>Rendering and video preview are not built yet (stages 4 and 5). For now this app builds and checks your Manim code.</p>
          <p className="dim">Tip: drag a <b>when animation starts</b> block in, then add blocks under it.</p>
        </aside>
      </main>
      <CodePanel result={result} onSelectBlock={selectBlock} />
    </div>
  );
}
