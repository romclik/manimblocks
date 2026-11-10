'use strict';
const fs = require('fs');
const path = require('path');

const DEFAULTS = { theme: 'dark', previewQuality: 'l', renderQuality: 'm', fps: 0, exportDir: '', paletteAutoHide: false, autoUpdate: true, remindUntil: 0, remindVersion: '' };

function sanitize(o) {
  const p = { ...DEFAULTS };
  if (!o || typeof o !== 'object') return p;
  if (['dark', 'light'].includes(o.theme)) p.theme = o.theme;
  if (['l', 'm', 'h'].includes(o.previewQuality)) p.previewQuality = o.previewQuality;
  if (['l', 'm', 'h'].includes(o.renderQuality)) p.renderQuality = o.renderQuality;
  if (Number.isInteger(o.fps) && o.fps >= 0 && o.fps <= 120) p.fps = o.fps;
  if (typeof o.exportDir === 'string' && (o.exportDir === '' || path.isAbsolute(o.exportDir))) p.exportDir = o.exportDir;
  if (typeof o.paletteAutoHide === 'boolean') p.paletteAutoHide = o.paletteAutoHide;
  if (typeof o.autoUpdate === 'boolean') p.autoUpdate = o.autoUpdate;
  if (Number.isFinite(o.remindUntil) && o.remindUntil >= 0) p.remindUntil = o.remindUntil;
  if (typeof o.remindVersion === 'string' && o.remindVersion.length <= 40) p.remindVersion = o.remindVersion;
  return p;
}

class Prefs {
  constructor(file) { this.file = file; this.value = this.read(); }
  read() { try { return sanitize(JSON.parse(fs.readFileSync(this.file, 'utf8'))); } catch { return { ...DEFAULTS }; } }
  get() { return { ...this.value }; }
  set(patch) {
    this.value = sanitize({ ...this.value, ...(patch && typeof patch === 'object' ? patch : {}) });
    try { fs.mkdirSync(path.dirname(this.file), { recursive: true }); fs.writeFileSync(this.file, JSON.stringify(this.value, null, 2)); } catch { /* not critical */ }
    return this.get();
  }
}
module.exports = { Prefs, sanitize, DEFAULTS };
