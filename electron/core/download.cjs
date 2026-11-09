'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Readable } = require('stream');
const { once } = require('events');

/** Downloads a file, verifying its SHA-256 before it is moved into place. Reports progress; can be canceled. */
async function download(url, dest, { sha256, onProgress = () => {}, signal } = {}) {
  const canceled = () => Object.assign(new Error('Canceled'), { canceled: true });
  let res;
  try { res = await fetch(url, { signal }); } catch (err) { if (signal && signal.aborted) throw canceled(); throw new Error(`Could not download ${path.basename(dest)}: ${err.message}. Check your internet connection.`); }
  if (!res.ok || !res.body) throw new Error(`Download failed (HTTP ${res.status}).`);
  const total = Number(res.headers.get('content-length')) || 0;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const tmp = dest + '.part';
  const out = fs.createWriteStream(tmp);
  const hash = crypto.createHash('sha256');
  let got = 0;
  try {
    for await (const chunk of Readable.fromWeb(res.body)) {
      hash.update(chunk); got += chunk.length;
      if (!out.write(chunk)) await once(out, 'drain');
      onProgress({ received: got, total });
    }
    await new Promise((resolve, reject) => out.end((e) => (e ? reject(e) : resolve())));
  } catch (err) {
    out.destroy(); fs.rmSync(tmp, { force: true });
    if (signal && signal.aborted) throw canceled();
    throw err;
  }
  const hex = hash.digest('hex');
  if (sha256 && hex !== sha256) { fs.rmSync(tmp, { force: true }); throw new Error('The downloaded file failed its integrity check (checksum mismatch) and was discarded.'); }
  fs.renameSync(tmp, dest);
  return dest;
}
module.exports = { download };
