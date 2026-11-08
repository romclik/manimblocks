'use strict';
const { spawn } = require('child_process');

function killTree(child) {
  if (!child.pid) return;
  if (process.platform === 'win32') spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true });
  else { try { process.kill(-child.pid, 'SIGKILL'); } catch { /* already gone */ } }
}

/** Runs a program without a shell. Calls onLine for every output line (\r-updated progress bars included). */
function run(cmd, args, { env, cwd, onLine, signal, input } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { env, cwd, windowsHide: true, detached: process.platform !== 'win32', stdio: ['pipe', 'pipe', 'pipe'] });
    let canceled = false;
    const onAbort = () => { canceled = true; killTree(child); };
    if (signal) { if (signal.aborted) onAbort(); else signal.addEventListener('abort', onAbort, { once: true }); }
    const feed = (stream) => {
      let buf = '';
      stream.setEncoding('utf8');
      stream.on('data', (d) => {
        buf += d;
        const parts = buf.split(/\r\n|\r|\n/);
        buf = parts.pop();
        for (const l of parts) if (l.trim() && onLine) onLine(l);
      });
      stream.on('end', () => { if (buf.trim() && onLine) onLine(buf); });
    };
    feed(child.stdout); feed(child.stderr);
    child.on('error', reject);
    child.on('close', (code) => { if (signal) signal.removeEventListener('abort', onAbort); resolve({ code, canceled }); });
    child.stdin.on('error', () => {});
    child.stdin.end(input === undefined ? undefined : input);
  });
}
module.exports = { run, killTree };
