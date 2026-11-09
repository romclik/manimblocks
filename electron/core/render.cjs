'use strict';
const fs = require('fs');
const path = require('path');
const { run } = require('./proc.cjs');
const env = require('./env.cjs');
const latex = require('./latex.cjs');
const { longPath } = latex;

const QUALITY = { l: { flag: '-ql', need: 0.5e9 }, m: { flag: '-qm', need: 1e9 }, h: { flag: '-qh', need: 3e9 } };
const ANIM_RE = /Animation\s+(\d+)\s*:\s*(.*?)\s*:\s+(\d+)%/;
const LATEX_MSG = 'This animation uses MathTex, which needs LaTeX, and LaTeX was not found. Open Settings > LaTeX and click Install, or install MiKTeX (https://miktex.org/download).';

// Manim prints tqdm bars on a terminal, but plain log lines ("Animation 3 : Partial movie file written") when piped, as here.
const DONE_RE = /Animation\s+(\d+)\s*:\s*Partial\b/;
const parseProgress = (line) => {
  const m = ANIM_RE.exec(line);
  if (m) return { animation: +m[1] + 1, percent: +m[3], label: m[2] };
  const d = DONE_RE.exec(line);
  return d ? { animation: +d[1] + 1, percent: 100, done: true } : null;
};

function summarizeError(lines) {
  const text = lines.join('\n');
  if (/latex/i.test(text) && /(not found|No such file|FileNotFound|cannot find)/i.test(text)) return LATEX_MSG;
  if (/ffmpeg/i.test(text) && /(not found|No such file|FileNotFound)/i.test(text)) return 'FFmpeg could not be found. Use Settings > Repair environment to reinstall it.';
  const err = [...lines].reverse().find((l) => /^\s*[\w.]*(Error|Exception)\b/.test(l));
  return err ? err.trim() : `Manim stopped unexpectedly. Last output: ${lines.slice(-3).join(' | ')}`;
}

function findVideo(dir) {
  if (!fs.existsSync(dir)) return null;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { const r = findVideo(p); if (r) return r; } else if (e.name === 'GeneratedScene.mp4') return p;
  }
  return null;
}

function pruneRenders(temp, keep) {
  try {
    const dirs = fs.readdirSync(temp).filter((n) => n.startsWith('render-')).map((n) => ({ n, t: fs.statSync(path.join(temp, n)).mtimeMs })).sort((a, b) => b.t - a.t);
    for (const d of dirs.slice(keep)) fs.rmSync(path.join(temp, d.n), { recursive: true, force: true });
  } catch { /* best effort */ }
}

async function validateScene(python, scene, e, signal) {
  const script = fs.readFileSync(path.join(__dirname, 'validate_scene.py'), 'utf8');
  const lines = [];
  const r = await run(python, ['-', scene], { env: e, signal, input: script, onLine: (l) => lines.push(l) });
  return { ok: r.code === 0 && !r.canceled, canceled: r.canceled, messages: lines };
}

async function render({ code, quality, fps = 0, loc, onProgress = () => {}, onLog = () => {}, signal }) {
  const fail = (error) => ({ ok: false, error });
  const q = QUALITY[quality];
  if (!q) return fail('Unknown render quality.');
  if (typeof code !== 'string' || code.length > 500000) return fail('Invalid animation code.');
  const st = env.envStatus(loc);
  if (!st.ready) return fail('The rendering environment is not installed yet.');
  fs.mkdirSync(loc.temp, { recursive: true });
  const free = await env.freeBytes(loc.temp);
  if (free < q.need) return fail(`Not enough free disk space for temporary render files: ${(q.need / 1e9).toFixed(1)} GB needed, ${(free / 1e9).toFixed(1)} GB free. Free up space or choose another temp folder.`);
  if (/\bMathTex\(/.test(code) && !latex.status(loc).available) return { ok: false, error: LATEX_MSG, needsLatex: true };
  if (!Number.isInteger(fps) || fps < 0 || fps > 120) return fail('Invalid frame rate.');

  pruneRenders(loc.temp, 3);
  const dir = longPath(fs.mkdtempSync(path.join(loc.temp, 'render-'))); // long path: TeX chokes on "~" in 8.3 short names
  const scene = path.join(dir, 'scene.py');
  fs.writeFileSync(scene, code, 'utf8');
  const L = env.layout(loc), e = env.toolEnv(loc);

  onProgress({ message: 'Checking the animation...' });
  const v = await validateScene(L.python, scene, e, signal);
  if (v.canceled) return { ok: false, canceled: true };
  if (!v.ok) return fail(`The animation was blocked by the safety check and was not run:\n${v.messages.join('\n')}`);

  const tail = [];
  let lastSent = 0;
  const r = await run(L.python, ['-m', 'manim', 'render', scene, 'GeneratedScene', q.flag, ...(fps > 0 ? ['--fps', String(fps)] : []), '--media_dir', path.join(dir, 'media'), '--disable_caching'], {
    env: { ...e, COLUMNS: '400' }, cwd: dir, signal,
    onLine: (raw) => {
      const line = raw.replace(env.ANSI, '');
      const p = parseProgress(line);
      if (p) {
        const now = Date.now();
        if (p.percent === 100 || now - lastSent > 120) { lastSent = now; onProgress(p); }
        if (p.percent === 100) onLog(`Animation ${p.animation} finished`);
        return;
      }
      tail.push(line); if (tail.length > 60) tail.shift();
      if (!/^\s*(movie file written|Caching disabled)/i.test(line) && !/^\s*(['\/]|[A-Za-z]:\\).*\.mp4'?\s*$/.test(line)) onLog(line);
    },
  });
  if (r.canceled) return { ok: false, canceled: true };
  if (r.code !== 0) { const msg = summarizeError(tail); return msg === LATEX_MSG ? { ok: false, error: msg, needsLatex: true } : fail(msg); }
  const video = findVideo(path.join(dir, 'media'));
  if (!video) return fail(/self\.(play|wait)\(/.test(code) ? 'Manim finished but no video file was found.' : 'Nothing to play yet: this animation has no animation or wait blocks. Add one, such as "fade in" or "write", under your objects.');
  return { ok: true, videoPath: video };
}

module.exports = { render, parseProgress, summarizeError, findVideo, QUALITY, LATEX_MSG };
