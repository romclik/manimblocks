// Electron main process (plain JavaScript on purpose: no extra build step to break).
const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs/promises');

const DEV_URL = process.env.VITE_DEV_SERVER_URL;

function createWindow() {
  const win = new BrowserWindow({
    width: 1440, height: 900, minWidth: 1000, minHeight: 640,
    backgroundColor: '#14111c', title: 'ManimBlocks', autoHideMenuBar: true, show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true, nodeIntegration: false, sandbox: true,
    },
  });
  win.once('ready-to-show', () => win.show());
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    const ok = url.startsWith('file://') || (DEV_URL && url.startsWith(DEV_URL));
    if (!ok) e.preventDefault();
  });
  if (DEV_URL) win.loadURL(DEV_URL);
  else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
}

// Save a text file chosen through the native dialog (Windows asks before overwriting).
ipcMain.handle('file:save-text', async (event, opts) => {
  try {
    if (!opts || typeof opts.content !== 'string' || typeof opts.defaultName !== 'string') {
      return { ok: false, error: 'Invalid request' };
    }
    const win = BrowserWindow.fromWebContents(event.sender);
    const filters = Array.isArray(opts.filters) ? opts.filters.filter(
      (f) => f && typeof f.name === 'string' && Array.isArray(f.extensions) && f.extensions.every((x) => typeof x === 'string'),
    ) : [];
    const result = await dialog.showSaveDialog(win, {
      defaultPath: path.basename(opts.defaultName), filters, properties: ['showOverwriteConfirmation'],
    });
    if (result.canceled || !result.filePath) return { ok: false, canceled: true };
    await fs.writeFile(result.filePath, opts.content, 'utf8');
    return { ok: true, path: result.filePath };
  } catch (err) {
    return { ok: false, error: String(err && err.message ? err.message : err) };
  }
});

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
