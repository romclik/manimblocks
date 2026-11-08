// Electron main process (plain JavaScript on purpose: no extra build step to break).
const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const settings = require('./core/settings.cjs');
const env = require('./core/env.cjs');
const { render } = require('./core/render.cjs');

const DEV_URL = process.env.VITE_DEV_SERVER_URL;
const exe = process.platform === 'win32' ? 'uv.exe' : 'uv';
const uvPath = () => (app.isPackaged ? path.join(process.resourcesPath, 'uv', exe) : path.join(app.getAppPath(), '.tools', 'uv', exe));
// Only this tiny file lives in the Windows user profile (it remembers where the big folders are).
const settingsFile = path.join(app.getPath('userData'), 'settings.json');
const defaultRoot = () => (app.isPackaged ? path.join(path.dirname(process.execPath), 'data') : path.join(app.getAppPath(), '.manimblocks-dev'));

let state = settings.load(settingsFile);
// Move Electron's own cache/session data to the chosen folder too (must happen before the app is ready).
if (state.configured) app.setPath('sessionData', path.join(state.locations.root, 'electron-session'));

let win = null;
let envJob = null, renderJob = null, lastVideo = null;
const trusted = (e) => win && e.sender === win.webContents;
const send = (ch, payload) => { if (win && !win.isDestroyed()) win.webContents.send(ch, payload); };

function createWindow() {
  win = new BrowserWindow({
    width: 1440, height: 900, minWidth: 1000, minHeight: 640,
    backgroundColor: '#14111c', title: 'ManimBlocks', autoHideMenuBar: true, show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  win.once('ready-to-show', () => win.show());
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

handle('file:save-text', async (opts) => {
  if (!opts || typeof opts.content !== 'string' || typeof opts.defaultName !== 'string') return { ok: false, error: 'Invalid request' };
  const filters = Array.isArray(opts.filters) ? opts.filters.filter((f) => f && typeof f.name === 'string' && Array.isArray(f.extensions) && f.extensions.every((x) => typeof x === 'string')) : [];
  const r = await dialog.showSaveDialog(win, { defaultPath: path.basename(opts.defaultName), filters, properties: ['showOverwriteConfirmation'] });
  if (r.canceled || !r.filePath) return { ok: false, canceled: true };
  await fs.promises.writeFile(r.filePath, opts.content, 'utf8');
  return { ok: true, path: r.filePath };
});

handle('settings:get', async () => ({
  configured: state.configured, locations: state.locations, defaults: settings.derive(defaultRoot()),
  uvFound: fs.existsSync(uvPath()), envStatus: state.configured ? env.envStatus(state.locations) : { ready: false, reason: 'missing' },
}));
handle('settings:set-locations', async (loc) => {
  if (envJob || renderJob) return { ok: false, error: 'Wait until the current task has finished.' };
  settings.save(settingsFile, loc);
  state = { configured: true, locations: loc };
  return { ok: true };
});
handle('dialog:pick-folder', async (defaultPath) => {
  const r = await dialog.showOpenDialog(win, { properties: ['openDirectory', 'createDirectory'], defaultPath: typeof defaultPath === 'string' ? defaultPath : undefined });
  return r.canceled ? null : r.filePaths[0];
});
handle('disk:free', async (p) => (typeof p === 'string' && path.isAbsolute(p) ? { ok: true, bytes: await env.freeBytes(p) } : { ok: false, error: 'Invalid path' }));

handle('env:install', async () => {
  if (!state.configured) return { ok: false, error: 'Choose the folders first.' };
  if (envJob || renderJob) return { ok: false, error: 'Another task is running.' };
  envJob = new AbortController();
  try {
    await env.installEnv(state.locations, { uv: uvPath(), signal: envJob.signal, onProgress: (p) => send('env:progress', p), onLog: (l) => send('env:log', l) });
    return { ok: true };
  } catch (err) {
    return err.canceled ? { ok: false, canceled: true } : { ok: false, error: String(err.message || err) };
  } finally { envJob = null; }
});
handle('env:cancel', async () => { if (envJob) envJob.abort(); return { ok: true }; });

handle('render:start', async (opts) => {
  if (!state.configured) return { ok: false, error: 'Set up the rendering environment first.' };
  if (envJob || renderJob) return { ok: false, error: 'Another task is running.' };
  renderJob = new AbortController();
  try {
    const r = await render({ code: opts && opts.code, quality: opts && opts.quality, loc: state.locations, signal: renderJob.signal, onProgress: (p) => send('render:progress', p), onLog: (l) => send('render:log', l) });
    if (r.ok) lastVideo = r.videoPath;
    return r;
  } finally { renderJob = null; }
});
handle('render:cancel', async () => { if (renderJob) renderJob.abort(); return { ok: true }; });

// These act only on the most recent render, never on a path supplied by the page.
handle('video:open', async () => { if (!lastVideo) return { ok: false, error: 'No video yet.' }; const err = await shell.openPath(lastVideo); return err ? { ok: false, error: err } : { ok: true }; });
handle('video:show', async () => { if (!lastVideo) return { ok: false, error: 'No video yet.' }; shell.showItemInFolder(lastVideo); return { ok: true }; });
handle('video:export', async () => {
  if (!lastVideo) return { ok: false, error: 'No video yet.' };
  const r = await dialog.showSaveDialog(win, { defaultPath: 'animation.mp4', filters: [{ name: 'MP4 video', extensions: ['mp4'] }], properties: ['showOverwriteConfirmation'] });
  if (r.canceled || !r.filePath) return { ok: false, canceled: true };
  await fs.promises.copyFile(lastVideo, r.filePath);
  return { ok: true, path: r.filePath };
});

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('before-quit', () => { if (envJob) envJob.abort(); if (renderJob) renderJob.abort(); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
