'use strict';
const fs = require('fs');
const path = require('path');

const MAX_BYTES = 20 * 1024 * 1024;
const EXT = '.manimblocks';

/** Writes to a temp file next to the target, then renames: a crash can never leave a half-written project. */
async function atomicWrite(file, content) {
  const tmp = `${file}.${process.pid}.tmp`;
  try {
    await fs.promises.writeFile(tmp, content, 'utf8');
    await fs.promises.rename(tmp, file);
  } catch (err) {
    await fs.promises.rm(tmp, { force: true });
    throw err;
  }
}

function friendlyError(err) {
  if (err && err.code === 'ENOENT') return 'The file was not found. It may have been moved or deleted.';
  if (err && (err.code === 'EACCES' || err.code === 'EPERM')) return 'ManimBlocks does not have permission to use that file or folder.';
  if (err && err.code === 'ENOSPC') return 'The disk is full.';
  return String((err && err.message) || err);
}

async function readProject(file) {
  const st = await fs.promises.stat(file);
  if (!st.isFile()) throw new Error('That is not a file.');
  if (st.size > MAX_BYTES) throw new Error('This file is too large to be a ManimBlocks project.');
  return fs.promises.readFile(file, 'utf8');
}

const withExt = (p) => (p.toLowerCase().endsWith(EXT) ? p : p + EXT);
const same = (a, b) => (process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b);

class Recent {
  constructor(file, max = 10) { this.file = file; this.max = max; this.items = this.load(); }
  load() {
    try {
      const a = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      return Array.isArray(a) ? a.filter((p) => typeof p === 'string' && path.isAbsolute(p)).slice(0, this.max) : [];
    } catch { return []; }
  }
  save() { try { fs.mkdirSync(path.dirname(this.file), { recursive: true }); fs.writeFileSync(this.file, JSON.stringify(this.items)); } catch { /* not critical */ } }
  add(p) { this.items = [p, ...this.items.filter((x) => !same(x, p))].slice(0, this.max); this.save(); }
  remove(p) { this.items = this.items.filter((x) => !same(x, p)); this.save(); }
  list() { return this.items.map((p) => ({ path: p, name: path.basename(p) })); }
}

/** One autosave slot, kept in the user's chosen data folder. It survives crashes and is removed after a normal save/exit. */
function autosaveStore(dir) {
  const file = path.join(dir, 'autosave.json');
  return {
    async write(obj) { fs.mkdirSync(dir, { recursive: true }); await atomicWrite(file, JSON.stringify(obj)); },
    read() {
      try {
        const o = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (!o || typeof o.content !== 'string') return null;
        const p = typeof o.path === 'string' && path.isAbsolute(o.path) && o.path.toLowerCase().endsWith(EXT) ? o.path : null;
        return { path: p, name: typeof o.name === 'string' ? o.name : 'Untitled', savedAt: typeof o.savedAt === 'string' ? o.savedAt : '', content: o.content };
      } catch { return null; }
    },
    clear() { try { fs.rmSync(file, { force: true }); } catch { /* ignore */ } },
  };
}

/** A .manimblocks file passed on the command line (double-click in Explorer). */
function pathFromArgv(args) {
  for (const a of args || []) {
    if (typeof a !== 'string' || !path.isAbsolute(a) || !a.toLowerCase().endsWith(EXT)) continue;
    try { if (fs.statSync(a).isFile()) return a; } catch { /* not there */ }
  }
  return null;
}

module.exports = { pathFromArgv, atomicWrite, readProject, friendlyError, withExt, Recent, autosaveStore, MAX_BYTES, EXT };
