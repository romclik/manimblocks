import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { EventEmitter } from 'node:events';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { mkdtempSync, writeFileSync, existsSync, readdirSync, readFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const req = createRequire(import.meta.url);
const { Prefs, sanitize, DEFAULTS } = req('./prefs.cjs');
const { download } = req('./download.cjs');
const { createUpdater, isNewer, notesToText } = req('./updater.cjs');
const latex = req('./latex.cjs');
const env = req('./env.cjs');
const { pathFromArgv } = req('./project.cjs');
const tmp = () => mkdtempSync(join(tmpdir(), 'mbx-'));
const abs = (n: string) => (process.platform === 'win32' ? `C:\\x\\${n}` : `/x/${n}`);

describe('preferences', () => {
  it('has safe defaults and rejects bad values', () => {
    expect(sanitize(undefined)).toEqual(DEFAULTS);
    const s = sanitize({ theme: 'neon', previewQuality: 'x', renderQuality: 'h', fps: 500, exportDir: 'relative', autoUpdate: 'yes', remindUntil: -5, remindVersion: 'x'.repeat(99) });
    expect(s).toEqual({ ...DEFAULTS, renderQuality: 'h' });
  });
  it('persists valid changes and survives a corrupt file', () => {
    const f = join(tmp(), 'prefs.json');
    const p = new Prefs(f);
    p.set({ theme: 'light', fps: 24, exportDir: abs('exports'), autoUpdate: false });
    expect(new Prefs(f).get()).toMatchObject({ theme: 'light', fps: 24, exportDir: abs('exports'), autoUpdate: false });
    writeFileSync(f, '{{{ nope');
    expect(new Prefs(f).get()).toEqual(DEFAULTS);
    expect(p.set('garbage' as never)).toMatchObject({ theme: 'light' });
  });
});

describe('download', () => {
  const data = Buffer.alloc(300_000, 7);
  const sha = createHash('sha256').update(data).digest('hex');
  const serve = async (fn?: () => void) => {
    const srv = createServer((_q, res) => { fn?.(); res.writeHead(200, { 'content-length': data.length }); res.write(data.subarray(0, 100_000)); setTimeout(() => res.end(data.subarray(100_000)), 50); });
    await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
    return { url: `http://127.0.0.1:${(srv.address() as { port: number }).port}/f.bin`, close: () => srv.close() };
  };
  it('downloads, reports progress and verifies the checksum', async () => {
    const s = await serve(); const d = join(tmp(), 'f.bin'); const seen: number[] = [];
    await download(s.url, d, { sha256: sha, onProgress: (p: { received: number }) => seen.push(p.received) });
    expect(readFileSync(d).equals(data)).toBe(true);
    expect(seen.at(-1)).toBe(data.length);
    s.close();
  });
  it('discards a file with the wrong checksum', async () => {
    const s = await serve(); const dir = tmp(); const d = join(dir, 'f.bin');
    await expect(download(s.url, d, { sha256: 'a'.repeat(64) })).rejects.toThrow(/integrity check/);
    expect(readdirSync(dir)).toEqual([]);
    s.close();
  });
  it('can be canceled and reports unreachable servers', async () => {
    const s = await serve(); const dir = tmp(); const ac = new AbortController();
    const p = download(s.url, join(dir, 'f.bin'), { signal: ac.signal });
    setTimeout(() => ac.abort(), 10);
    await expect(p).rejects.toMatchObject({ canceled: true });
    expect(readdirSync(dir)).toEqual([]);
    s.close();
    await expect(download('http://127.0.0.1:1/x', join(dir, 'g'))).rejects.toThrow(/internet connection/);
  });
});

describe('updater safety rules', () => {
  const make = (over: Record<string, unknown> = {}) => {
    const au: any = new EventEmitter();
    const calls: string[] = [];
    au.checkForUpdates = async () => { calls.push('check'); au.emit('update-available', { version: '0.2.0', releaseNotes: '<h2>New</h2><ul><li>Fast &amp; <b>nice</b></li></ul><script>x()</script>' }); };
    au.downloadUpdate = async () => { calls.push('download'); au.emit('download-progress', { percent: 50 }); au.emit('update-downloaded', {}); };
    au.quitAndInstall = () => calls.push('install');
    let prefs: any = { autoUpdate: true, remindUntil: 0, remindVersion: '' };
    const sent: any[] = [];
    let t = 1_000_000;
    const u = createUpdater({ autoUpdater: au, getPrefs: () => prefs, setPrefs: (p: any) => { prefs = { ...prefs, ...p }; }, currentVersion: '0.1.0', isPackaged: true, send: (_c: string, s: any) => sent.push(s), now: () => t, ...over });
    return { au, u, calls, sent, prefs: () => prefs, tick: (ms: number) => { t += ms; } };
  };
  it('never downloads or installs on its own', async () => {
    const m = make();
    expect(m.au.autoDownload).toBe(false);
    expect(m.au.autoInstallOnAppQuit).toBe(false);
    await m.u.check();
    expect(m.u.state()).toMatchObject({ status: 'available', version: '0.2.0' });
    expect(m.calls).toEqual(['check']);
    expect(m.u.install()).toBe(false);
    expect(m.calls).toEqual(['check']);
  });
  it('download then install only through explicit calls, in order', async () => {
    const m = make();
    await m.u.download(); // nothing available yet: ignored
    expect(m.calls).toEqual([]);
    await m.u.check();
    await m.u.download();
    expect(m.u.state().status).toBe('downloaded');
    expect(m.u.install()).toBe(true);
    expect(m.calls).toEqual(['check', 'download', 'install']);
  });
  it('release notes are reduced to plain text', async () => {
    const m = make(); await m.u.check();
    expect(m.u.state().notes).toBe('New\n- Fast & nice');
    expect(notesToText([{ note: '<p>a</p>' }, { note: 'b' }])).toContain('a');
    expect(m.u.state().url).toBe('https://github.com/romclik/manimblocks/releases/tag/v0.2.0');
  });
  it('ignores versions that are not newer', async () => {
    const m = make();
    m.au.checkForUpdates = async () => m.au.emit('update-available', { version: '0.1.0' });
    await m.u.check();
    expect(m.u.state().status).toBe('none');
    expect(isNewer('0.10.0', '0.9.9')).toBe(true); expect(isNewer('1.0.0', '1.0.0')).toBe(false); expect(isNewer('v0.1.1', '0.1.0')).toBe(true); expect(isNewer('0.1.0', '0.2.0')).toBe(false);
  });
  it('Remind me later silences automatic checks for a day but not manual ones', async () => {
    const m = make(); await m.u.check();
    m.u.remindLater();
    expect(m.u.state().status).toBe('idle');
    m.calls.length = 0;
    await m.u.check(); expect(m.calls).toEqual([]);
    m.tick(23 * 3600e3); await m.u.check(); expect(m.calls).toEqual([]);
    await m.u.check({ manual: true }); expect(m.calls).toEqual(['check']);
    m.tick(2 * 3600e3);
    m.calls.length = 0;
    await m.u.check();
    expect(m.calls).toEqual(['check']);
  });
  it('respects the automatic-check setting; dev copies never update', async () => {
    const off = make(); off.prefs().autoUpdate = false; await off.u.check(); expect(off.calls).toEqual([]);
    const dev = make({ isPackaged: false }); await dev.u.check({ manual: true }); expect(dev.calls).toEqual([]); expect(dev.u.state().status).toBe('unsupported');
  });
  it('turns network failures into plain messages', async () => {
    const m = make(); m.au.checkForUpdates = async () => { throw new Error('getaddrinfo ENOTFOUND github.com'); };
    await m.u.check({ manual: true });
    expect(m.u.state()).toMatchObject({ status: 'error', error: expect.stringMatching(/Could not reach GitHub/) });
  });
});

describe('latex and file association helpers', () => {
  it('LaTeX status never crashes without an install, and the pinned download is well formed', () => {
    const loc = { root: tmp(), pythonEnv: join(tmp(), 'py'), cache: '', temp: '' };
    expect(['managed', 'system', 'none']).toContain(latex.status(loc).source);
    expect(latex.TINYTEX.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(latex.TINYTEX.url.startsWith('https://github.com/rstudio/tinytex-releases/releases/download/')).toBe(true);
    expect(latex.PACKAGES).toContain('dvisvgm');
  });
  it('LaTeX tools are put first on PATH while installing, even before the ready marker exists', () => {
    const loc = { root: tmp(), pythonEnv: join(tmp(), 'py'), cache: '', temp: '' };
    const e = latex.latexEnv(loc, { Path: 'C:\\Windows', OTHER: '1' });
    expect(e.Path.startsWith(latex.binDir(loc))).toBe(true);
    expect(e.Path).toContain('C:\\Windows');
    expect(e.PATH).toBeUndefined();
    expect(env.toolEnv(loc)[Object.keys(env.toolEnv(loc)).find((k) => k.toLowerCase() === 'path')!]).not.toContain('TinyTeX');
  });
  it.skipIf(process.platform === 'win32')('LaTeX install explains itself off Windows', async () => {
    await expect(latex.installLatex({ pythonEnv: tmp(), temp: tmp() })).rejects.toThrow(/Windows only/);
  });
  it('only accepts real .manimblocks files from the command line', () => {
    const d = tmp(); const ok = join(d, 'a.manimblocks'); writeFileSync(ok, '{}'); const txt = join(d, 'a.txt'); writeFileSync(txt, '');
    mkdirSync(join(d, 'dir.manimblocks'));
    expect(pathFromArgv(['--flag', '.', 'rel.manimblocks', txt, join(d, 'dir.manimblocks'), join(d, 'missing.manimblocks'), ok])).toBe(ok);
    expect(pathFromArgv([])).toBeNull();
    expect(pathFromArgv(undefined)).toBeNull();
    expect(existsSync(ok)).toBe(true);
  });
});

describe('LaTeX install: tlmgr remedies (simulated Windows run)', () => {
  const win = process.platform === 'win32';
  const setup = () => {
    const root = tmp();
    const loc = { root, pythonEnv: join(root, 'py'), cache: join(root, 'c'), temp: join(root, 't') };
    const L = env.layout(loc);
    mkdirSync(L.bin, { recursive: true }); mkdirSync(join(L.venv, win ? 'Scripts' : 'bin'), { recursive: true });
    writeFileSync(L.python, ''); writeFileSync(L.ffmpeg, '');
    writeFileSync(L.marker, JSON.stringify({ manim: req('./config.cjs').MANIM_VERSION, python: '3.12' }));
    return { loc, bin: latex.binDir(loc) };
  };
  // Fake "machine": tar unpacks TinyTeX, tlmgr behaves according to the scenario.
  const machine = (bin: string, scenario: 'ok' | 'needs-self-update' | 'needs-exe' | 'never') => {
    const calls: string[] = [];
    const tools = () => { for (const t of ['dvisvgm.exe']) writeFileSync(join(bin, t), ''); };
    const runFn = async (cmd: string, args: string[], o: { onLine?: (l: string) => void } = {}) => {
      const line = `${cmd} ${args.join(' ')}`; calls.push(line);
      const say = (t: string) => o.onLine?.(t);
      if (/tar/i.test(cmd)) { mkdirSync(bin, { recursive: true }); for (const t of ['latex.exe', 'tlmgr.bat']) writeFileSync(join(bin, t), ''); return { code: 0 }; }
      if (/install /.test(line)) {
        const selfUpdated = calls.some((c) => /update --self/.test(c)), exeRan = calls.some((c) => /update-tlmgr-latest/.test(c));
        const fixed = scenario === 'ok' || (scenario === 'needs-self-update' && selfUpdated) || (scenario === 'needs-exe' && exeRan);
        if (fixed) { tools(); return { code: 0 }; }
        say('tlmgr itself needs to be updated. update-tlmgr-latest.exe'); say('tlmgr.pl: Terminating; please see warning above!'); return { code: 1 };
      }
      if (/dvisvgm\.exe|latex\.exe/.test(cmd) && args[0] === '--version') return { code: 0 };
      return { code: 0 };
    };
    return { runFn, calls };
  };
  const dl = async (_u: string, d: string) => { writeFileSync(d, ''); return d; };
  const go = (loc: any, runFn: any, extra = {}) => latex.installLatex(loc, { platform: 'win32', runFn, downloadFn: dl, ...extra });

  it('works first time when tlmgr is fine', async () => {
    const { loc, bin } = setup(); const m = machine(bin, 'ok');
    await go(loc, m.runFn);
    expect(m.calls.some((c) => /update --self/.test(c))).toBe(false);
    expect(readFileSync(join(latex.latexDir(loc), 'ready.json'), 'utf8')).toContain('tinytex');
  });
  it('recovers with "tlmgr update --self"', async () => {
    const { loc, bin } = setup(); const m = machine(bin, 'needs-self-update');
    await go(loc, m.runFn);
    expect(m.calls.filter((c) => /install /.test(c))).toHaveLength(2);
    expect(m.calls.some((c) => /update-tlmgr-latest/.test(c))).toBe(false);
  });
  it('falls back to the official updater when --self is not enough', async () => {
    const { loc, bin } = setup(); const m = machine(bin, 'needs-exe');
    await go(loc, m.runFn);
    expect(m.calls.some((c) => /update-tlmgr-latest/.test(c))).toBe(true);
    expect(existsSync(join(latex.latexDir(loc), 'ready.json'))).toBe(true);
  });
  it('gives up with the package manager output in the message', async () => {
    const { loc, bin } = setup(); const m = machine(bin, 'never');
    await expect(go(loc, m.runFn)).rejects.toThrow(/"dvisvgm" is missing.*tlmgr itself needs to be updated/s);
    expect(existsSync(join(latex.latexDir(loc), 'ready.json'))).toBe(false);
    expect(m.calls.filter((c) => /install /.test(c))).toHaveLength(4);
  });
});
