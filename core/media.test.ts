import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const { serveFile } = createRequire(import.meta.url)('./media.cjs');
const dir = mkdtempSync(join(tmpdir(), 'mbm-'));
const file = join(dir, 'v.mp4');
const data = Buffer.from(Array.from({ length: 1000 }, (_, i) => i % 251));
writeFileSync(file, data);
const req = (range?: string, method = 'GET') => new Request('mbvideo://local/latest.mp4', { method, headers: range ? { range } : {} });
const body = async (r: Response) => Buffer.from(await r.arrayBuffer());

describe('serveFile (video seeking support)', () => {
  it('serves the whole file', async () => {
    const r = await serveFile(file, req());
    expect(r.status).toBe(200);
    expect(r.headers.get('accept-ranges')).toBe('bytes');
    expect((await body(r)).equals(data)).toBe(true);
  });
  it.each([
    ['bytes=0-9', 0, 9], ['bytes=100-199', 100, 199], ['bytes=990-', 990, 999], ['bytes=-10', 990, 999], ['bytes=900-5000', 900, 999],
  ])('serves %s', async (range, a, b) => {
    const r = await serveFile(file, req(range));
    expect(r.status).toBe(206);
    expect(r.headers.get('content-range')).toBe(`bytes ${a}-${b}/1000`);
    expect((await body(r)).equals(data.subarray(a, b + 1))).toBe(true);
  });
  it.each(['bytes=1000-', 'bytes=5-2', 'bytes=-', 'garbage', 'bytes=0-1,5-6'])('rejects %s', async (range) => {
    expect((await serveFile(file, req(range))).status).toBe(416);
  });
  it('404 for a missing file; HEAD has no body', async () => {
    expect((await serveFile(join(dir, 'nope.mp4'), req())).status).toBe(404);
    const h = await serveFile(file, req(undefined, 'HEAD'));
    expect(h.headers.get('content-length')).toBe('1000');
    expect((await body(h)).length).toBe(0);
  });
});
