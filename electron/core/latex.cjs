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

// Fallback test document (Manim 0.22's default template). The real template is read from Manim itself when possible.
const MANIM_LIKE_DOC = ['\\documentclass[preview]{standalone}', '\\usepackage[english]{babel}', '\\usepackage{amsmath}', '\\usepackage{amssymb}', '\\begin{document}', '\\begin{align*}', 'x^2 + y^2 = z^2', '\\end{align*}', '\\end{document}', ''].join('\n');
// LaTeX file name -> TeX Live package that provides it (when they differ).
const FILE_TO_PACKAGE = { dsfont: 'doublestroke', calligra: 'fundus-calligra', mathrsfs: 'jknapltx', amssymb: 'amsfonts', amsmath: 'amsmath', pifont: 'psnfss', babel: 'babel', english: 'babel-english', standalone: 'standalone' };

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

/** Environment with the private LaTeX tools first on PATH (needed while installing, before the "ready" marker exists). */
function latexEnv(loc, base) {
  const e = { ...base };
  const pk = Object.keys(e).find((k) => k.toLowerCase() === 'path') || 'PATH';
  e[pk] = binDir(loc) + path.delimiter + (e[pk] || '');
  return e;
}

/** Windows can hand out 8.3 short paths like C:\\Users\\RUNNER~1; TeX treats "~" as a command, so always use long paths. */
const longPath = (p) => { try { return fs.realpathSync.native(p); } catch { return p; } };

const tarCmd = () => (process.platform === 'win32' ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe') : 'bsdtar');

async function installLatex(loc, { onProgress = () => {}, onLog = () => {}, signal, downloadFn = download, runFn = run, platform = process.platform } = {}) {
  if (platform !== 'win32') throw new Error('Automatic LaTeX setup is available on Windows only. Install TeX Live with your package manager instead.');
  const st = env.envStatus(loc);
  if (!st.ready) throw new Error('Set up the rendering environment first, then install LaTeX.');
  const free = await env.freeBytes(loc.pythonEnv);
  if (free < TINYTEX.need) throw new Error(`Not enough free disk space on ${path.parse(loc.pythonEnv).root}: about ${(TINYTEX.need / 1e9).toFixed(1)} GB needed, ${(free / 1e9).toFixed(1)} GB free.`);
  const canceled = () => Object.assign(new Error('Canceled'), { canceled: true });
  const L = env.layout(loc), e = latexEnv(loc, env.toolEnv(loc));
  const out = [];
  const exec = async (cmd, args, opts = {}) => {
    out.length = 0;
    const r = await runFn(cmd, args, { env: e, signal, ...opts, onLine: (l) => { const c = l.replace(env.ANSI, ''); out.push(c); onLog(c); } });
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
  const tl = (args, opts) => exec('cmd.exe', ['/d', '/s', '/c', `""${tlmgr}" ${args}"`], { verbatim: true, ...opts });
  const haveDvisvgm = () => fs.existsSync(path.join(binDir(loc), 'dvisvgm.exe'));
  const tails = [];
  const attempt = async (label) => {
    const r = await tl(`install ${PACKAGES.join(' ')}`);
    if (r.code !== 0) onLog(`(tlmgr install reported problems: exit ${r.code})`);
    tails.push(`${label}: ${out.slice(-5).join(' | ')}`);
  };
  await attempt('first try');
  // tlmgr refuses to install anything until it has updated itself ("tlmgr itself needs to be updated").
  // Try the documented remedies in turn, retrying the install after each one.
  const remedies = [
    ['updating the LaTeX package manager', async () => { await tl('update --self'); }],
    ['running the official TeX Live updater', async () => {
      const upd = path.join(loc.temp, 'update-tlmgr-latest.exe');
      await downloadFn('https://mirror.ctan.org/systems/texlive/tlnet/update-tlmgr-latest.exe', upd, { signal });
      try { await exec(upd, [], { signal: AbortSignal.any([signal, AbortSignal.timeout(300000)].filter(Boolean)) }); } finally { fs.rmSync(upd, { force: true }); }
    }],
    ['switching to the main TeX Live repository', async () => { await tl('option repository https://mirror.ctan.org/systems/texlive/tlnet'); }],
  ];
  for (const [name, fix] of remedies) {
    if (haveDvisvgm()) break;
    onProgress({ phase: 'packages', percent: 60, message: `LaTeX package source needs a fix: ${name}...` });
    try { await fix(); } catch (err) { if (signal && signal.aborted) throw canceled(); onLog(`(${name} did not finish: ${err.message})`); }
    await attempt(name);
  }
  const tlmgrTail = tails.join(' || ').slice(-900);
  for (const tool of ['latex', 'dvisvgm']) {
    const exePath = path.join(binDir(loc), `${tool}.exe`);
    if (!fs.existsSync(exePath)) throw new Error(`The LaTeX tool "${tool}" is missing after setup. Package installer said: ${tlmgrTail || '(no output)'}`);
    const t = await exec(exePath, ['--version']);
    if (t.code !== 0) throw new Error(`The LaTeX tool "${tool}" does not start (exit code ${t.code}). ${out.slice(-2).join(' ')}`);
  }
  const repoMismatch = /remote repository.*newer|older than the remote|cross-release/i.test(tails.join(' '));

  onProgress({ phase: 'verify', percent: 80, message: 'Testing LaTeX directly...' });
  const diag = longPath(fs.mkdtempSync(path.join(loc.temp, 'latex-diag-')));
  const tex = path.join(diag, 'check.tex');
  let doc = MANIM_LIKE_DOC;
  // Use the exact template this Manim version compiles formulas with.
  await exec(L.python, ['-c', 'from manim import config; print(config.tex_template.get_texcode_for_expression_in_env("x^2 + y^2 = z^2", "align*"))']);
  const lines = out.map((l) => l.trimEnd());
  const from = lines.findIndex((l) => l.startsWith('\\documentclass')), to = lines.lastIndexOf('\\end{document}');
  if (from >= 0 && to > from) doc = lines.slice(from, to + 1).join('\n') + '\n';
  fs.writeFileSync(tex, doc);
  const tryLatex = async () => {
    for (const f of ['check.log', 'check.dvi']) fs.rmSync(path.join(diag, f), { force: true });
    await exec(path.join(binDir(loc), 'latex.exe'), ['-interaction=nonstopmode', '-halt-on-error', 'check.tex'], { cwd: diag }); // relative name: no path ever reaches TeX
    const logFile = path.join(diag, 'check.log');
    const log = fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf8') : '';
    return { ok: fs.existsSync(path.join(diag, 'check.dvi')), text: `${out.join('\n')}\n${log}`, hasLog: !!log };
  };
  let res = await tryLatex(), rebuilt = false;
  const fixed = new Set();
  for (let i = 0; i < 6 && !res.ok; i++) {
    const missing = /File [`']([^'`]+?)(?:\.(?:sty|cls|def|fd))?' not found/.exec(res.text);
    if (!rebuilt && (!res.hasLog || /format file|\.fmt/i.test(res.text))) {
      rebuilt = true;
      onProgress({ phase: 'verify', percent: 82, message: 'Building LaTeX format files...' });
      const fm = fs.existsSync(path.join(binDir(loc), 'fmtutil-sys.exe')) ? path.join(binDir(loc), 'fmtutil-sys.exe') : path.join(binDir(loc), 'fmtutil.exe');
      await exec(fm, fs.existsSync(path.join(binDir(loc), 'fmtutil-sys.exe')) ? ['--all'] : ['--sys', '--all']);
      tails.push(`formats: ${out.slice(-3).join(' | ')}`);
    } else if (missing && !fixed.has(missing[1])) {
      const pkg = FILE_TO_PACKAGE[missing[1]] || missing[1];
      fixed.add(missing[1]);
      onProgress({ phase: 'verify', percent: 83, message: `Installing the LaTeX package "${pkg}"...` });
      await tl(`install ${pkg}`);
      tails.push(`install ${pkg}: ${out.slice(-2).join(' | ')}`);
    } else break;
    res = await tryLatex();
  }
  if (!res.ok) {
    const lines = res.text.split('\n').filter((l) => l.trim());
    throw new Error(`LaTeX was installed but cannot compile a formula yet. ${lines.slice(-8).join(' | ')} (setup notes: ${tails.join(' || ').slice(-500)})`);
  }
  fs.rmSync(diag, { recursive: true, force: true });

  onProgress({ phase: 'verify', percent: 90, message: 'Testing a formula render with Manim...' });
  const dir = longPath(fs.mkdtempSync(path.join(loc.temp, 'latex-check-')));
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

module.exports = { longPath, MANIM_LIKE_DOC, latexEnv, status, installLatex, binDir, latexDir, TINYTEX, PACKAGES };
