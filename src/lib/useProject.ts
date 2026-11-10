import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as Blockly from 'blockly';
import { BLOCK_DEFINITIONS } from '../blocks/definitions';
import { afterWorkspaceReplaced } from '../blocks/sync';
import { parseProject, serializeProject } from './project';
import type { DialogSpec } from '../components/ConfirmDialog';
import type { WorkspaceState } from '../codegen/generate';

const KNOWN = new Set(BLOCK_DEFINITIONS.map((b) => b.type));
const OK = [{ label: 'OK', value: 'ok', primary: true }];

interface Args { getWs: () => Blockly.WorkspaceSvg | null; state: WorkspaceState; setState: (s: WorkspaceState) => void; ready: boolean; say: (m: string) => void }

export function useProject({ getWs, state, setState, ready, say }: Args) {
  const api = window.manimBlocks;
  const [name, setName] = useState('Untitled');
  const [path, setPath] = useState<string | null>(null);
  const [baseline, setBaseline] = useState<string | null>(null);
  const [recent, setRecent] = useState<{ name: string; path: string }[]>([]);
  const [dialog, setDialog] = useState<(DialogSpec & { resolve: (v: string) => void }) | null>(null);
  const snap = useMemo(() => JSON.stringify(state), [state]);
  const dirty = baseline !== null && snap !== baseline;

  const ask = useCallback((spec: DialogSpec) => new Promise<string>((resolve) => setDialog({ ...spec, resolve: (v) => { setDialog(null); resolve(v); } })), []);
  const refreshRecent = useCallback(async () => { if (api) { const r = await api.recentProjects(); if (r.ok) setRecent(r.items ?? []); } }, [api]);

  useEffect(() => { if (ready && baseline === null) setBaseline(snap); }, [ready, baseline, snap]);
  useEffect(() => { document.title = `${dirty ? '● ' : ''}${name} - ManimBlocks`; }, [dirty, name]);
  useEffect(() => { void api?.setDirty(dirty); }, [api, dirty]);
  useEffect(() => { void refreshRecent(); }, [refreshRecent]);

  // Autosave every 15 s while there are unsaved changes; clear it once the project is clean again.
  const latest = useRef({ state, dirty });
  latest.current = { state, dirty };
  const wasDirty = useRef(false);
  useEffect(() => {
    if (!api) return;
    const id = window.setInterval(() => { if (latest.current.dirty) void api.autosaveWrite(serializeProject(latest.current.state)); }, 15000);
    return () => window.clearInterval(id);
  }, [api]);
  useEffect(() => { if (wasDirty.current && !dirty) void api?.autosaveClear(); wasDirty.current = dirty; }, [api, dirty]);

  const snapshot = () => { const ws = getWs()!; return Blockly.serialization.workspaces.save(ws) as WorkspaceState; };
  const needDesktop = () => { if (!api) { say('Projects need the desktop app.'); return true; } return false; };

  const save = useCallback(async (asNew = false): Promise<boolean> => {
    if (!api || !getWs()) { say('Projects need the desktop app.'); return false; }
    const ws = snapshot();
    const r = await (asNew ? api.saveProjectAs(serializeProject(ws)) : api.saveProject(serializeProject(ws)));
    if (r.ok) { setPath(r.path); setName(r.name); setBaseline(JSON.stringify(ws)); void refreshRecent(); say(`Saved ${r.name}`); return true; }
    if (!r.canceled) await ask({ title: 'Could not save', message: r.error ?? 'Unknown error.', buttons: OK });
    return false;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, ask, refreshRecent, say]);

  const confirmDiscard = useCallback(async (): Promise<boolean> => {
    if (!latest.current.dirty) return true;
    const v = await ask({ title: 'Save your changes?', message: 'This animation has unsaved changes.', buttons: [{ label: 'Save', value: 'save', primary: true }, { label: "Don't save", value: 'discard' }, { label: 'Cancel', value: 'cancel' }] });
    if (v === 'save') return save();
    if (v === 'discard') { void api?.autosaveClear(); return true; }
    return false;
  }, [api, ask, save]);

  const load = (workspace: object) => {
    const ws = getWs()!;
    Blockly.Events.disable();
    try { ws.clear(); Blockly.serialization.workspaces.load(workspace as never, ws); afterWorkspaceReplaced(ws); } finally { Blockly.Events.enable(); }
    ws.clearUndo();
    const s = snapshot();
    setState(s);
    return JSON.stringify(s);
  };

  const newProject = useCallback(async () => {
    if (needDesktop() || !(await confirmDiscard())) return;
    const ws = getWs()!;
    Blockly.Events.disable(); try { ws.clear(); afterWorkspaceReplaced(ws); } finally { Blockly.Events.enable(); }
    ws.clearUndo();
    await api!.newProject();
    const s = snapshot(); setState(s); setBaseline(JSON.stringify(s)); setName('Untitled'); setPath(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, confirmDiscard]);

  const openResult = async (r: OpenProjectResult) => {
    if (!r.ok) { if (!r.canceled) await ask({ title: 'Could not open the project', message: r.error ?? 'Unknown error.', buttons: OK }); void refreshRecent(); return; }
    const p = parseProject(r.content, KNOWN);
    if (!p.ok) { await ask({ title: `Could not open ${r.name}`, message: p.error, buttons: OK }); return; }
    let base: string;
    try { base = load(p.workspace); } catch (e) {
      await ask({ title: `Could not open ${r.name}`, message: `Some blocks could not be loaded (${e instanceof Error ? e.message : 'unknown error'}). Your current work was not changed.`, buttons: OK });
      return;
    }
    await api!.commitOpen();
    setPath(r.path); setName(r.name); setBaseline(base); void refreshRecent();
  };
  const openProject = useCallback(async () => { if (needDesktop() || !(await confirmDiscard())) return; await openResult(await api!.openProject()); },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [api, confirmDiscard]);
  const openRecent = useCallback(async (i: number) => { if (needDesktop() || !(await confirmDiscard())) return; await openResult(await api!.openRecent(i)); },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [api, confirmDiscard]);

  // Recovery after a crash or power loss: offered once, as soon as the editor is ready.
  const recovered = useRef(false);
  useEffect(() => {
    if (!api || !ready || recovered.current) return;
    recovered.current = true;
    const recover = async () => {
      const a = await api.autosaveRead();
      if (!a.found || !a.content) return;
      const when = a.savedAt ? new Date(a.savedAt).toLocaleString() : 'earlier';
      const v = await ask({ title: 'Recover unsaved work?', message: `ManimBlocks did not close normally last time. An automatic backup of "${a.name}" from ${when} is available.`, buttons: [{ label: 'Recover', value: 'recover', primary: true }, { label: 'Discard', value: 'discard' }] });
      if (v !== 'recover') { await api.autosaveClear(); return; }
      const p = parseProject(a.content, KNOWN);
      if (!p.ok) { await ask({ title: 'The backup is damaged', message: p.error, buttons: OK }); await api.autosaveClear(); return; }
      try { load(p.workspace); } catch { await ask({ title: 'The backup could not be loaded', message: 'Some blocks in the backup could not be loaded.', buttons: OK }); await api.autosaveClear(); return; }
      await api.autosaveAdopt();
      setName(a.name ?? 'Untitled'); setPath(a.path ?? null); // baseline stays as the empty project, so this counts as unsaved
    };
    void (async () => {
      await recover();
      const pr = await api.openPending(); // a .manimblocks file double-clicked in Explorer
      if (pr.ok || !pr.canceled) await openResult(pr);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, ready]);

  // A project opened from Explorer while the app is already running
  useEffect(() => api?.onOpenRequested(async () => { if (await confirmDiscard()) { const pr = await api.openPending(); if (pr.ok || !pr.canceled) await openResult(pr); } }),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [api, confirmDiscard]);

  // Closing the window with unsaved changes
  useEffect(() => api?.onCloseRequested(async () => { if (await confirmDiscard()) void api.closeApp(); }), [api, confirmDiscard]);

  return { name, path, dirty, recent, dialog, ask, confirmDiscard, save, saveAs: () => save(true), newProject, openProject, openRecent };
}
