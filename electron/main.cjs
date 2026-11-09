// Electron main process (plain JavaScript on purpose: no extra build step to break).
const { app, BrowserWindow, ipcMain, dialog, shell, protocol } = require('electron');
const path = require('path');
const fs = require('fs');
const settings = require('./core/settings.cjs');
const env = require('./core/env.cjs');
const { render } = require('./core/render.cjs');
const { serveFile } = require('./core/media.cjs');
const proj = require('./core/project.cjs');
const { Prefs } = require('./core/prefs.cjs');
const latex = require('./core/latex.cjs');
const { createUpdater } = require('./core/updater.cjs');

// mbvideo://local/... serves the most recent render to the preview player (never a page-supplied path).
protocol.registerSchemesAsPrivileged([{ scheme: 'mbvideo', privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true } }]);

const DEV_URL = process.env.VITE_DEV_SERVER_URL;
const exe = process.platform === 'win32' ? 'uv.exe' : 'uv';
const uvPath = () => (app.isPackaged ? path.join(process.resourcesPath, 'uv', exe) : path.join(app.getAppPath(), '.tools', 'uv', exe));
// Only tiny files (a few hundred bytes) live in the Windows user profile: folder choices, preferences, recent list.
const userData = app.getPath('userData');
const settingsFile = path.join(userData, 'settings.json');
// Next to the install folder, not inside it, so uninstalling or updating the app never deletes the environment.
const defaultRoot = () => {
  if (!app.isPackaged) return path.join(app.getAppPath(), '.manimblocks-dev');
  const inst = path.dirname(process.execPath);
  return path.join(path.dirname(inst), path.basename(inst) + '-data');
};

let state = settings.load(settingsFile);
// Move Electron's own cache/session data to the chosen folder too (must happen before the app is ready).
if (state.configured) app.setPath('sessionData', path.join(state.locations.root, 'electron-session'));
const prefs = new Prefs(path.join(userData, 'prefs.json'));
const recent = new proj.Recent(path.join(userData, 'recent.json'));
const autosave = () => proj.autosaveStore(state.configured ? path.join(state.locations.root, 'autosave') : path.join(userData, 'autosave'));

const primary = app.requestSingleInstanceLock();
if (!primary) app.quit();

let win = null, updater = null;
let currentPath = null, candidate = null, pendingOpen = proj.pathFromArgv(process.argv.slice(1)), dirty = false, forceClose = false;
let job = null; // { name, abort } : only one long task at a time
let lastVideo = null, videoVersion = 0;
const trusted = (e) => win && e.sender === win.webContents;
const send = (ch, payload) => { if (win && !win.isDestroyed()) win.webContents.send(ch, payload); };
const busy = () => (job ? `Please wait: ${job.name} is running.` : null);

function createWindow() {
  const icon = path.join(__dirname, '..', 'build', 'icon.png');
  win = new BrowserWindow({
    width: 1440, height: 900, minWidth: 1000, minHeight: 640,
    backgroundColor: '#14111c', title: 'ManimBlocks', autoHideMenuBar: true, show: false, ...(fs.existsSync(icon) ? { icon } : {}),
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  win.once('ready-to-show', () => win.show());
  win.on('close', (e) => {
    if (dirty && !forceClose && !win.webContents.isCrashed()) { e.preventDefault(); send('app:close-requested'); }
  });
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https:\/\//.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => {
    if (!(url.startsWith('file://') || (DEV_URL && url.startsWith(DEV_URL)))) e.preventDefault();
  });
  if (DEV_URL) win.loadURL(DEV_URL); else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
}

const handle = (channel, fn) => ipcMain.handle(channel, async (e, ...args) => {
  if (!trusted(e)) return { ok: false, error: 'Untrusted caller' };
  try { return await fn(...args); } catch (err) { return { ok: false, error: String(err && err.message ? err.message : err) }; }
});
const startJob = (name) => { const ac = new AbortController(); job = { name, abort: () => ac.abort() }; return ac; };
const exportPath = (name) => { const d = prefs.get().exportDir; return d && fs.existsSync(d) ? path.join(d, name) : name; };

// ---- Files
handle('file:save-text', async (opts) => {
  if (!opts || typeof opts.content !== 'string' || typeof opts.defaultName !== 'string') return { ok: false, error: 'Invalid request' };
  const filters = Array.isArray(opts.filters) ? opts.filters.filter((f) => f && typeof f.name === 'string' && Array.isArray(f.extensions) && f.extensions.every((x) => typeof x === 'string')) : [];
  const r = await dialog.showSaveDialog(win, { defaultPath: exportPath(path.basename(opts.defaultName)), filters, properties: ['showOverwriteConfirmation'] });
  if (r.canceled || !r.filePath) return { ok: false, canceled: true };
  await fs.promises.writeFile(r.filePath, opts.content, 'utf8');
  return { ok: true, path: r.filePath };
});

// ---- Settings, preferences
handle('settings:get', async () => ({
  configured: state.configured, locations: state.locations, defaults: settings.derive(defaultRoot()),
  uvFound: fs.existsSync(uvPath()), envStatus: state.configured ? env.envStatus(state.locations) : { ready: false, reason: 'missing' },
  appVersion: app.getVersion(), prefs: prefs.get(), latex: latex.status(state.locations),
}));
handle('settings:set-locations', async (loc) => {
  if (job) return { ok: false, error: busy() };
  settings.save(settingsFile, loc);
  state = { configured: true, locations: loc };
  return { ok: true };
});
handle('prefs:set', async (patch) => ({ ok: true, prefs: prefs.set(patch) }));
handle('dialog:pick-folder', async (defaultPath) => {
  const r = await dialog.showOpenDialog(win, { properties: ['openDirectory', 'createDirectory'], defaultPath: typeof defaultPath === 'string' ? defaultPath : undefined });
  return r.canceled ? null : r.filePaths[0];
});
handle('disk:free', async (p) => (typeof p === 'string' && path.isAbsolute(p) ? { ok: true, bytes: await env.freeBytes(p) } : { ok: false, error: 'Invalid path' }));

// ---- Python/Manim environment, LaTeX
handle('env:install', async () => {
  if (!state.configured) return { ok: false, error: 'Choose the folders first.' };
  if (job) return { ok: false, error: busy() };
  const ac = startJob('the installation');
  try {
    await env.installEnv(state.locations, { uv: uvPath(), signal: ac.signal, onProgress: (p) => send('env:progress', p), onLog: (l) => send('env:log', l) });
    return { ok: true };
  } catch (err) {
    return err.canceled ? { ok: false, canceled: true } : { ok: false, error: String(err.message || err) };
  } finally { job = null; }
});
handle('env:cancel', async () => { if (job) job.abort(); return { ok: true }; });
handle('latex:install', async () => {
  if (!state.configured) return { ok: false, error: 'Set up the rendering environment first.' };
  if (job) return { ok: false, error: busy() };
  const ac = startJob('the LaTeX installation');
  try {
    await latex.installLatex(state.locations, { signal: ac.signal, onProgress: (p) => send('env:progress', p), onLog: (l) => send('env:log', l) });
    return { ok: true };
  } catch (err) {
    return err.canceled ? { ok: false, canceled: true } : { ok: false, error: String(err.message || err) };
  } finally { job = null; }
});

// ---- Rendering
handle('render:start', async (opts) => {
  if (!state.configured) return { ok: false, error: 'Set up the rendering environment first.' };
  if (job) return { ok: false, error: busy() };
  const ac = startJob('a render');
  try {
    const r = await render({ code: opts && opts.code, quality: opts && opts.quality, fps: prefs.get().fps, loc: state.locations, signal: ac.signal, onProgress: (p) => send('render:progress', p), onLog: (l) => send('render:log', l) });
    if (!r.ok) return r;
    lastVideo = r.videoPath;
    return { ...r, videoUrl: `mbvideo://local/latest.mp4?v=${++videoVersion}` };
  } finally { job = null; }
});
handle('render:cancel', async () => { if (job && job.name === 'a render') job.abort(); return { ok: true }; });

// These act only on the most recent render, never on a path supplied by the page.
handle('video:open', async () => { if (!lastVideo) return { ok: false, error: 'No video yet.' }; const err = await shell.openPath(lastVideo); return err ? { ok: false, error: err } : { ok: true }; });
handle('video:show', async () => { if (!lastVideo) return { ok: false, error: 'No video yet.' }; shell.showItemInFolder(lastVideo); return { ok: true }; });
handle('video:export', async () => {
  if (!lastVideo) return { ok: false, error: 'No video yet.' };
  const r = await dialog.showSaveDialog(win, { defaultPath: exportPath('animation.mp4'), filters: [{ name: 'MP4 video', extensions: ['mp4'] }], properties: ['showOverwriteConfirmation'] });
  if (r.canceled || !r.filePath) return { ok: false, canceled: true };
  await fs.promises.copyFile(lastVideo, r.filePath);
  return { ok: true, path: r.filePath };
});

// ---- Projects
const PROJECT_FILTER = [{ name: 'ManimBlocks project', extensions: ['manimblocks'] }];
const validContent = (c) => {
  if (typeof c !== 'string' || c.length > proj.MAX_BYTES) return false;
  try { return JSON.parse(c).format === 'manimblocks-project'; } catch { return false; }
};
async function saveTo(file, content) {
  await proj.atomicWrite(file, content);
  currentPath = file; recent.add(file); autosave().clear();
  return { ok: true, path: file, name: path.basename(file) };
}
async function saveAs(content, suggested) {
  const r = await dialog.showSaveDialog(win, { defaultPath: suggested || 'animation.manimblocks', filters: PROJECT_FILTER, properties: ['showOverwriteConfirmation'] });
  if (r.canceled || !r.filePath) return { ok: false, canceled: true };
  return saveTo(proj.withExt(r.filePath), content);
}
async function openFile(file) {
  try {
    const content = await proj.readProject(file);
    candidate = file;
    return { ok: true, path: file, name: path.basename(file), content };
  } catch (err) {
    if (err && err.code === 'ENOENT') recent.remove(file);
    return { ok: false, error: proj.friendlyError(err) };
  }
}
handle('project:save', async (content) => {
  if (!validContent(content)) return { ok: false, error: 'Invalid project data.' };
  try { return currentPath ? await saveTo(currentPath, content) : await saveAs(content); } catch (err) { return { ok: false, error: proj.friendlyError(err) }; }
});
handle('project:save-as', async (content) => {
  if (!validContent(content)) return { ok: false, error: 'Invalid project data.' };
  try { return await saveAs(content, currentPath || undefined); } catch (err) { return { ok: false, error: proj.friendlyError(err) }; }
});
handle('project:open', async () => {
  const r = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: PROJECT_FILTER });
  return r.canceled || !r.filePaths[0] ? { ok: false, canceled: true } : openFile(r.filePaths[0]);
});
handle('project:open-recent', async (index) => {
  const item = recent.list()[index];
  return item ? openFile(item.path) : { ok: false, error: 'That project is no longer in the list.' };
});
// A .manimblocks file double-clicked in Explorer (checked and remembered by main, not supplied by the page).
handle('project:open-pending', async () => {
  if (!pendingOpen) return { ok: false, canceled: true };
  const f = pendingOpen; pendingOpen = null;
  return openFile(f);
});
handle('project:commit-open', async () => { if (candidate) { currentPath = candidate; recent.add(candidate); candidate = null; autosave().clear(); } return { ok: true }; });
handle('project:new', async () => { currentPath = null; candidate = null; autosave().clear(); return { ok: true }; });
handle('project:recent', async () => ({ ok: true, items: recent.list() }));
handle('project:set-dirty', async (v) => { dirty = v === true; return { ok: true }; });
handle('autosave:write', async (content) => {
  if (!validContent(content)) return { ok: false, error: 'Invalid project data.' };
  await autosave().write({ path: currentPath, name: currentPath ? path.basename(currentPath) : 'Untitled', savedAt: new Date().toISOString(), content });
  return { ok: true };
});
handle('autosave:read', async () => { const a = autosave().read(); return a ? { ok: true, found: true, ...a } : { ok: true, found: false }; });
handle('autosave:adopt', async () => { const a = autosave().read(); currentPath = a && a.path; return { ok: true }; });
handle('autosave:clear', async () => { autosave().clear(); return { ok: true }; });
handle('app:close', async () => { forceClose = true; win.close(); return { ok: true }; });

// ---- Updates (GitHub Releases through electron-updater; nothing is downloaded or installed without a click)
handle('update:state', async () => (updater ? updater.state() : { status: 'unsupported', current: app.getVersion() }));
handle('update:check', async () => (updater ? updater.check({ manual: true }) : { status: 'unsupported', current: app.getVersion() }));
handle('update:download', async () => (updater ? updater.download() : { status: 'unsupported' }));
handle('update:remind', async () => (updater ? updater.remindLater() : { status: 'idle' }));
handle('update:install', async () => {
  if (!updater) return { ok: false, error: 'Updates are not available in a development copy.' };
  if (job) return { ok: false, error: busy() };
  forceClose = true; // the page already asked about unsaved changes
  if (!updater.install()) { forceClose = false; return { ok: false, error: 'No downloaded update to install.' }; }
  return { ok: true };
});
handle('update:open-notes', async () => {
  const u = updater && updater.state().url;
  if (!u || !/^https:\/\/github\.com\/romclik\/manimblocks\/releases\/tag\/v[\w.\-]+$/.test(u)) return { ok: false, error: 'No release page.' };
  await shell.openExternal(u);
  return { ok: true };
});

app.whenReady().then(() => {
  if (!primary) return;
  protocol.handle('mbvideo', (request) => (lastVideo ? serveFile(lastVideo, request) : new Response('No video yet', { status: 404 })));
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  if (app.isPackaged) {
    try {
      const { autoUpdater } = require('electron-updater');
      updater = createUpdater({ autoUpdater, getPrefs: () => prefs.get(), setPrefs: (p) => prefs.set(p), currentVersion: app.getVersion(), isPackaged: true, send });
      setTimeout(() => updater.check(), 15000);
      setInterval(() => updater.check(), 6 * 3600 * 1000);
    } catch (err) { console.error('Updater unavailable:', err); }
  }
});
app.on('second-instance', (_e, argv) => {
  if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
  const f = proj.pathFromArgv(argv.slice(1));
  if (f) { pendingOpen = f; send('app:open-requested'); }
});
app.on('before-quit', () => { if (job) job.abort(); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
