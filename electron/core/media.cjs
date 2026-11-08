'use strict';
// Serves one local video file with HTTP Range support, so the <video> element can seek.
const fs = require('fs');
const { Readable } = require('stream');

async function serveFile(filePath, request) {
  let stat;
  try { stat = await fs.promises.stat(filePath); } catch { return new Response('Not found', { status: 404 }); }
  const size = stat.size;
  const head = request.method === 'HEAD';
  const headers = { 'Content-Type': 'video/mp4', 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store' };
  const range = request.headers.get('range');
  if (!range) {
    headers['Content-Length'] = String(size);
    return new Response(head ? null : Readable.toWeb(fs.createReadStream(filePath)), { status: 200, headers });
  }
  const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
  let start = 0, end = size - 1, ok = !!m && !(m[1] === '' && m[2] === '');
  if (ok) {
    if (m[1] === '') { start = Math.max(0, size - Number(m[2])); }
    else { start = Number(m[1]); if (m[2] !== '') end = Math.min(Number(m[2]), size - 1); }
    ok = size > 0 && start < size && start <= end;
  }
  if (!ok) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
  headers['Content-Range'] = `bytes ${start}-${end}/${size}`;
  headers['Content-Length'] = String(end - start + 1);
  return new Response(head ? null : Readable.toWeb(fs.createReadStream(filePath, { start, end })), { status: 206, headers });
}
module.exports = { serveFile };
