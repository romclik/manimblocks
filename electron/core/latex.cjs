'use strict';
// Optional LaTeX support (needed only for MathTex). Installs a pinned TinyTeX into the Python-environment folder.
const fs = require('fs');
const path = require('path');
const os = require('os');
const { run } = require('./proc.cjs');
const { download } = require('./download.cjs');
const env = require('./env.cjs');

const TINYTEX = {
  file: 'TinyTeX-1-windows-v2026.11.exe',
  url: 'https://github.com/rstudio/tinytex-releases/releases/download/v2026.11/TinyTeX-1-windows-v2026.11.exe',
  sha256: '375e8adec0177cd9ec6a1f8c76efe0c22b1a0c260e76a00386bcea52d88e5354',
  need: 1.5e9,
};
// Packages Manim's LaTeX templates need (from the Manim documentation).
const PACKAGES = 'amsmath babel-english cbfonts-fd cm-super count1to ctex doublestroke dvisvgm everysel fontspec frcursive fundus-calligra gnu-freefont jknapltx latex-bin mathastext microtype multitoc physics preview prelim2e ragged2e relsize rsfs setspace standalone tipa wasy wasysym xcolor xetex xkeyval'.split(' ');

const latexDir = (loc) => path.join(loc.pythonEnv, 'latex');
const binDir = (loc) => path.join(latexDir(loc), 'TinyTeX', 'bin', 'windows');
const exe = process.platform === 'win32' ? 'latex.exe' : 'latex';

function findOnPath() {
  const dirs = (process.env.PATH || process.env.Path || '').split(path.delimiter);
  return dirs.find((d) => d && fs.existsSync(path.join(d, exe))) || null;
}
function status(loc) {
  const managed = !!loc && fs.existsSync(path.join(latexDir(loc), 'ready.json')) && fs.existsSync(path.join(binDir(loc), 'latex.exe'));
  const onPath = findOnPath();
  return { available: managed || !!onPath, source: managed ? 'managed' : onPath ? 'system' : 'none', path: managed ? binDir(loc) : onPath };
}

const tarCmd = () => (process.platform === 'win32' ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe') : 'bsdtar');

async function installLatex(loc, { onProgress = () => {}, onLog = () => {}, signal, downloadFn = download } = {}) {
  if (process.platform !== 'win32') throw new Error('Automatic LaTeX setup is available on Windows only. Install TeX Live with your package manager instead.');
  const st = env.envStatus(loc);
  if (!st.ready) throw new Error('Set up the rendering environment first, then install LaTeX.');
  const free = await env.freeBytes(loc.pythonEnv);
  if (free < TINYTEX.need) throw new Error(`Not enough free disk space on ${path.parse(loc.pythonEnv).root}: about ${(TINYTEX.need / 1e9).toFixed(1)} GB needed, ${(free / 1e9).toFixed(1)} GB free.`);
  const canceled = () => Object.assign(new Error('Canceled'), { canceled: true });
  const L = env.layout(loc), e = env.toolEnv(loc);
  const out = [];
  const exec = async (cmd, args, opts = {}) => {
    out.length = 0;
    const r = await run(cmd, args, { env: e, signal, ...opts, onLine: (l) => { const c = l.replace(env.ANSI, ''); out.push(c); onLog(c); } });
    if (r.canceled) throw canceled();
    return r;
  };
  fs.mkdirSync(loc.temp, { recursive: true });
  const archive = path.join(loc.temp, TINYTEX.file);
  fs.rmSync(latexDir(loc), { recursive: true, force: true });

  onProgress({ phase: 'download', percent: 2, message: 'Downloading TinyTeX (about 70 MB)...' });
  await downloadFn(TINYTEX.url, archive, { sha256: TINYTEX.sha256, signal, onProgress: (p) => p.total && onProgress({ phase: 'download', percent: 2 + Math.round((p.received / p.total) * 28), message: `Downloading TinyTeX... ${Math.round(p.received / 1e6)} of ${Math.round(p.total / 1e6)} MB` }) });

  onProgress({ phase: 'extract', percent: 32, message: 'Unpacking (about 300 MB)...' });
  fs.mkdirSync(latexDir(loc), { recursive: true });
  let r = await exec(tarCmd(), ['-xf', archive, '-C', latexDir(loc)]);
  fs.rmSync(archive, { force: true });
  if (r.code !== 0 || !fs.existsSync(path.join(binDir(loc), 'latex.exe'))) throw new Error(`Unpacking TinyTeX failed. ${out.slice(-2).join(' ')}`);

  onProgress({ phase: 'packages', percent: 50, message: 'Installing the LaTeX packages Manim needs...' });
  const tlmgr = path.join(binDir(loc), 'tlmgr.bat');
  r = await exec('cmd.exe', ['/d', '/s', '/c', `""${tlmgr}" install ${PACKAGES.join(' ')}"`], { verbatim: true });
  const outText = out.join('\n');
  if (r.code !== 0) onLog(`(tlmgr reported problems, continuing to the real test: exit ${r.code})`);
  const repoMismatch = /remote repository.*newer|older than the remote|cross-release/i.test(outText);

  onProgress({ phase: 'verify', percent: 85, message: 'Testing a formula render...' });
  const dir = fs.mkdtempSync(path.join(loc.temp, 'latex-check-'));
  const scene = path.join(dir, 'check.py');
  fs.writeFileSync(scene, 'from manim import *\n\nclass Check(Scene):\n    def construct(self):\n        self.add(MathTex("x^2 + y^2 = z^2"))\n');
  r = await exec(L.python, ['-m', 'manim', 'render', scene, 'Check', '-ql', '--media_dir', path.join(dir, 'media'), '--disable_caching', '-s'], { cwd: dir });
  fs.rmSync(dir, { recursive: true, force: true });
  if (r.code !== 0) {
    throw new Error(repoMismatch
      ? 'LaTeX was installed, but its package source has moved to a newer TeX Live release, so the extra packages could not be added. Install MiKTeX instead (https://miktex.org/download).'
      : `LaTeX was installed but the formula test failed: ${out.slice(-3).join(' | ')}`);
  }
  fs.writeFileSync(path.join(latexDir(loc), 'ready.json'), JSON.stringify({ tinytex: TINYTEX.file, installedAt: new Date().toISOString() }));
  onProgress({ phase: 'done', percent: 100, message: 'LaTeX is ready.' });
}

module.exports = { status, installLatex, binDir, latexDir, TINYTEX, PACKAGES };
