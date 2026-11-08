'use strict';
// Manages the private Python + Manim + FFmpeg environment using `uv` (no system Python needed).
const fs = require('fs');
const path = require('path');
const { run } = require('./proc.cjs');
const { MANIM_VERSION, PYTHON_VERSION, ENV_NEED, CACHE_NEED } = require('./config.cjs');

const win = process.platform === 'win32';
const ANSI = /\x1b\[[0-9;?]*[A-Za-z]/g;
const gb = (n) => (n / 1e9).toFixed(1) + ' GB';

function layout(loc) {
  const venv = path.join(loc.pythonEnv, 'venv');
  const bin = path.join(loc.pythonEnv, 'bin');
  return {
    venv, bin,
    python: win ? path.join(venv, 'Scripts', 'python.exe') : path.join(venv, 'bin', 'python'),
    ffmpeg: path.join(bin, win ? 'ffmpeg.exe' : 'ffmpeg'),
    marker: path.join(loc.pythonEnv, 'env.json'),
  };
}

/** Environment for child processes: everything big (caches, temp) is redirected to the user's chosen folders. */
function toolEnv(loc) {
  const e = { ...process.env };
  for (const k of ['PYTHONPATH', 'PYTHONHOME', 'VIRTUAL_ENV', 'CONDA_PREFIX']) delete e[k];
  const pk = Object.keys(e).find((k) => k.toLowerCase() === 'path') || 'PATH';
  Object.assign(e, {
    UV_CACHE_DIR: loc.cache, UV_PYTHON_INSTALL_DIR: path.join(loc.pythonEnv, 'python'), UV_LINK_MODE: 'copy',
    UV_NO_CONFIG: '1', UV_PYTHON_PREFERENCE: 'only-managed', UV_NO_PROGRESS: '1',
    TEMP: loc.temp, TMP: loc.temp, TMPDIR: loc.temp,
    PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8', PYTHONDONTWRITEBYTECODE: '1', NO_COLOR: '1',
  });
  e[pk] = layout(loc).bin + path.delimiter + (e[pk] || '');
  return e;
}

async function freeBytes(p) {
  let d = path.resolve(p);
  while (!fs.existsSync(d)) { const up = path.dirname(d); if (up === d) break; d = up; }
  const s = await fs.promises.statfs(d);
  return Number(s.bavail) * Number(s.bsize);
}
const driveOf = (p) => path.parse(path.resolve(p)).root.toLowerCase();

async function checkSpace(loc) {
  const same = driveOf(loc.pythonEnv) === driveOf(loc.cache);
  const checks = same
    ? [[loc.pythonEnv, ENV_NEED + CACHE_NEED]]
    : [[loc.pythonEnv, ENV_NEED], [loc.cache, CACHE_NEED]];
  for (const [p, need] of checks) {
    const free = await freeBytes(p);
    if (free < need) throw new Error(`Not enough free disk space on ${driveOf(p)}: about ${gb(need)} needed, ${gb(free)} free. Choose a folder on a drive with more space.`);
  }
}

function envStatus(loc) {
  const L = layout(loc);
  try {
    const m = JSON.parse(fs.readFileSync(L.marker, 'utf8'));
    if (!fs.existsSync(L.python) || !fs.existsSync(L.ffmpeg)) return { ready: false, reason: 'damaged' };
    if (m.manim !== MANIM_VERSION) return { ready: false, reason: 'outdated' };
    return { ready: true, manim: m.manim, python: m.python };
  } catch { return { ready: false, reason: 'missing' }; }
}

async function installEnv(loc, { uv, onProgress = () => {}, onLog = () => {}, signal }) {
  if (!fs.existsSync(uv)) throw new Error('The bundled setup tool (uv) is missing. Reinstall ManimBlocks, or run "npm install" in the project folder if you are developing.');
  for (const d of [loc.pythonEnv, loc.cache, loc.temp]) fs.mkdirSync(d, { recursive: true });
  await checkSpace(loc);
  const L = layout(loc), env = toolEnv(loc);
  fs.rmSync(L.marker, { force: true });
  const out = [];
  const step = async (phase, percent, message, cmd, args) => {
    onProgress({ phase, percent, message });
    out.length = 0;
    const r = await run(cmd, args, { env, signal, onLine: (l) => { const c = l.replace(ANSI, ''); out.push(c); onLog(c); } });
    if (r.canceled) throw Object.assign(new Error('Canceled'), { canceled: true });
    if (r.code !== 0) throw new Error(`${message.replace(/\.\.\.$/, '')} failed (exit code ${r.code}). Last message: ${out.slice(-3).join(' | ')}`);
  };
  await step('python', 5, `Downloading Python ${PYTHON_VERSION}...`, uv, ['python', 'install', PYTHON_VERSION]);
  await step('venv', 25, 'Creating the Python environment...', uv, ['venv', '--clear', '--python', PYTHON_VERSION, L.venv]);
  await step('packages', 35, `Installing Manim ${MANIM_VERSION} (the slow part)...`, uv, ['pip', 'install', '--python', L.python, `manim==${MANIM_VERSION}`, 'imageio-ffmpeg']);
  fs.mkdirSync(L.bin, { recursive: true });
  await step('ffmpeg', 88, 'Setting up FFmpeg...', L.python, ['-c', 'import imageio_ffmpeg,shutil,sys;shutil.copyfile(imageio_ffmpeg.get_ffmpeg_exe(),sys.argv[1])', L.ffmpeg]);
  if (!win) fs.chmodSync(L.ffmpeg, 0o755);
  await step('verify', 94, 'Checking the installation...', L.ffmpeg, ['-version']);
  await step('verify', 97, 'Checking the installation...', L.python, ['-c', 'import manim;print("manim",manim.__version__)']);
  if (!out.join(' ').includes(`manim ${MANIM_VERSION}`)) throw new Error(`Manim check returned an unexpected result: ${out.join(' ')}`);
  fs.writeFileSync(L.marker, JSON.stringify({ manim: MANIM_VERSION, python: PYTHON_VERSION, installedAt: new Date().toISOString() }));
  onProgress({ phase: 'done', percent: 100, message: 'Everything is installed.' });
}

module.exports = { layout, toolEnv, freeBytes, checkSpace, envStatus, installEnv, ANSI };
