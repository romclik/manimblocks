// Runs the REAL electron/main.cjs against a fake `electron` module, to test the project-saving glue
// (paths, dialogs, recents, autosave, close protection) without opening a window.
import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const req = createRequire(import.meta.url);
const root = mkdtempSync(join(tmpdir(), 'mbmain-'));
const handlers: Record<string, (e: unknown, ...a: unknown[]) => Promise<any>> = {};
const winEvents: Record<string, (e: unknown) => void> = {};
const sent: string[] = [];
let nextSave: string | null = null, nextOpen: string | null = null, closed = 0;
const webContents = { setWindowOpenHandler() {}, on() {}, loadURL() {}, loadFile() {}, isCrashed: () => false, send: (ch: string) => sent.push(ch) };
class FakeWindow {
  webContents = webContents;
  once() {} on(ev: string, fn: (e: unknown) => void) { winEvents[ev] = fn; } show() {} isDestroyed() { return false; } close() { closed++; }
  loadURL() {} loadFile() {}
}
const fake = {
  app: { getPath: () => root, getAppPath: () => root, getVersion: () => '0.1.0', isPackaged: false, setPath() {}, requestSingleInstanceLock: () => true, quit() {}, whenReady: () => Promise.resolve(), on() {} },
  BrowserWindow: Object.assign(FakeWindow, { getAllWindows: () => [1], fromWebContents: () => ({}) }),
  ipcMain: { handle: (ch: string, fn: never) => { handlers[ch] = fn; } },
  dialog: {
    showSaveDialog: async () => (nextSave ? { canceled: false, filePath: nextSave } : { canceled: true }),
    showOpenDialog: async () => (nextOpen ? { canceled: false, filePaths: [nextOpen] } : { canceled: true }),
  },
  shell: { openPath: async () => '', showItemInFolder() {}, openExternal() {} },
  protocol: { registerSchemesAsPrivileged() {}, handle() {} },
};
const p = req.resolve('electron');
req.cache[p] = { id: p, filename: p, loaded: true, exports: fake } as never;
req('./main.cjs');
const call = (ch: string, ...a: unknown[]) => handlers[ch]({ sender: webContents }, ...a);
const project = (extra = '') => JSON.stringify({ format: 'manimblocks-project', version: 1, workspace: {}, note: extra });

describe('main process: preferences, updates, pending file', () => {
  it('stores validated preferences and uses the export folder as the save default', async () => {
    await new Promise((r) => setTimeout(r, 10));
    expect((await call('settings:get')).prefs).toMatchObject({ theme: 'dark', autoUpdate: true });
    const r = await call('prefs:set', { theme: 'light', fps: 24, exportDir: 'not-absolute' });
    expect(r.prefs).toMatchObject({ theme: 'light', fps: 24, exportDir: '' });
  });
  it('updates are unavailable in a development copy and install is refused', async () => {
    expect((await call('update:check')).status).toBe('unsupported');
    expect((await call('update:install')).ok).toBe(false);
    expect((await call('update:open-notes')).ok).toBe(false);
  });
  it('no pending file by default', async () => {
    expect(await call('project:open-pending')).toMatchObject({ ok: false, canceled: true });
  });
  it('refuses to start a second long task and reports LaTeX/render prerequisites', async () => {
    expect((await call('render:start', { code: 'x', quality: 'l' })).ok).toBe(false);
    expect((await call('latex:install')).ok).toBe(false);
  });
});

describe('main process project handling', () => {
  it('only trusts its own window', async () => {
    const r = await handlers['project:new']({ sender: {} });
    expect(r.ok).toBe(false);
  });
  it('first Save asks where, adds the extension, then later saves reuse the path', async () => {
    await new Promise((r) => setTimeout(r, 10)); // let whenReady create the window
    nextSave = join(root, 'my-anim');
    const r1 = await call('project:save', project('v1'));
    expect(r1).toMatchObject({ ok: true, name: 'my-anim.manimblocks' });
    expect(readFileSync(join(root, 'my-anim.manimblocks'), 'utf8')).toContain('v1');
    nextSave = null; // a second dialog would now report "canceled"
    const r2 = await call('project:save', project('v2'));
    expect(r2.ok).toBe(true);
    expect(readFileSync(join(root, 'my-anim.manimblocks'), 'utf8')).toContain('v2');
    expect((await call('project:recent')).items[0].name).toBe('my-anim.manimblocks');
  });
  it('refuses to write data that is not a ManimBlocks project', async () => {
    expect((await call('project:save', '{"format":"other"}')).ok).toBe(false);
    expect((await call('project:save', 'not json')).ok).toBe(false);
    expect((await call('project:save', 42)).ok).toBe(false);
  });
  it('Save As writes elsewhere; cancel changes nothing', async () => {
    nextSave = null;
    expect(await call('project:save-as', project())).toMatchObject({ ok: false, canceled: true });
    nextSave = join(root, 'copy.manimblocks');
    expect((await call('project:save-as', project('copy'))).path).toBe(join(root, 'copy.manimblocks'));
  });
  it('Open returns content and only commits the path after the page accepts it', async () => {
    writeFileSync(join(root, 'other.manimblocks'), project('other'));
    nextOpen = join(root, 'other.manimblocks');
    const o = await call('project:open');
    expect(o).toMatchObject({ ok: true, name: 'other.manimblocks' });
    // page rejects it (corrupt): path must NOT change, so Save still goes to copy.manimblocks
    nextSave = null;
    await call('project:save', project('after-reject'));
    expect(readFileSync(join(root, 'copy.manimblocks'), 'utf8')).toContain('after-reject');
    await call('project:open'); await call('project:commit-open');
    await call('project:save', project('after-commit'));
    expect(readFileSync(join(root, 'other.manimblocks'), 'utf8')).toContain('after-commit');
  });
  it('reports missing files and drops them from recents', async () => {
    nextOpen = join(root, 'gone.manimblocks');
    const r = await call('project:open');
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/not found/);
  });
  it('New forgets the current path', async () => {
    await call('project:new');
    nextSave = join(root, 'fresh.manimblocks');
    expect((await call('project:save', project())).name).toBe('fresh.manimblocks');
  });
  it('autosave: write, read, adopt path, clear; a normal save clears it', async () => {
    await call('autosave:write', project('auto'));
    const a = await call('autosave:read');
    expect(a).toMatchObject({ found: true });
    expect(a.content).toContain('auto');
    await call('project:save', project('saved'));
    expect((await call('autosave:read')).found).toBe(false);
    await call('autosave:write', project('auto2'));
    await call('autosave:clear');
    expect((await call('autosave:read')).found).toBe(false);
    expect(existsSync(join(root, 'autosave', 'autosave.json'))).toBe(false);
  });
  it('closing with unsaved changes asks the page first; clean close just closes', async () => {
    const ev = () => { let prevented = false; return { e: { preventDefault: () => { prevented = true; } }, was: () => prevented }; };
    const clean = ev(); winEvents.close(clean.e);
    expect(clean.was()).toBe(false);
    await call('project:set-dirty', true);
    const d = ev(); winEvents.close(d.e);
    expect(d.was()).toBe(true);
    expect(sent).toContain('app:close-requested');
    await call('app:close');
    expect(closed).toBe(1);
    const forced = ev(); winEvents.close(forced.e);
    expect(forced.was()).toBe(false);
  });
});
