// Downloads the pinned `uv` tool (used to install Python + Manim) into .tools/uv.
// Runs automatically after `npm install`. The download is verified against a pinned SHA-256.
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const VERSION = '0.13.7';
const ASSETS = {
  'win32-x64': { file: 'uv-x86_64-pc-windows-msvc.zip', sha256: '0cdc5b38fe5a8168ed6a25814f5ba43c21d313dd3187314fccb37b7cec46e021', bin: 'uv.exe' },
  'linux-x64': { file: 'uv-x86_64-unknown-linux-gnu.tar.gz', sha256: 'c5221ff41b7892bfc223543883600125f6a47fe845093e0f5bdff4f359196d83', bin: 'uv' },
};
const strict = process.argv.includes('--strict');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, '.tools', 'uv');

function fail(msg) {
  console.warn(`[get-uv] ${msg}`);
  process.exit(strict ? 1 : 0);
}
function find(dir, name) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { const r = find(p, name); if (r) return r; } else if (e.name === name) return p;
  }
  return null;
}

const asset = ASSETS[`${process.platform}-${process.arch}`];
if (!asset) fail(`No pinned uv build for ${process.platform}-${process.arch}. Rendering setup will not work on this system.`);
const target = path.join(outDir, asset.bin);
const stamp = path.join(outDir, 'VERSION');
if (fs.existsSync(target) && fs.existsSync(stamp) && fs.readFileSync(stamp, 'utf8').trim() === VERSION) process.exit(0);

try {
  const url = `https://github.com/astral-sh/uv/releases/download/${VERSION}/${asset.file}`;
  console.log(`[get-uv] downloading ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const hash = createHash('sha256').update(buf).digest('hex');
  if (hash !== asset.sha256) throw new Error(`checksum mismatch (got ${hash}); refusing to use this file`);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'get-uv-'));
  const archive = path.join(tmp, asset.file);
  fs.writeFileSync(archive, buf);
  const tar = process.platform === 'win32' ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe') : 'tar';
  const x = spawnSync(tar, ['-xf', archive, '-C', tmp], { stdio: 'inherit' });
  if (x.status !== 0) throw new Error('could not extract the archive');
  const found = find(tmp, asset.bin);
  if (!found) throw new Error(`${asset.bin} not found in archive`);
  fs.mkdirSync(outDir, { recursive: true });
  fs.copyFileSync(found, target);
  if (process.platform !== 'win32') fs.chmodSync(target, 0o755);
  fs.writeFileSync(stamp, VERSION);
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log('[get-uv] ready');
} catch (err) {
  fail(`${err.message}. Re-run "node scripts/get-uv.mjs" with an internet connection.`);
}
