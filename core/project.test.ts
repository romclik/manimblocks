import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const { atomicWrite, readProject, friendlyError, withExt, Recent, autosaveStore, MAX_BYTES } = createRequire(import.meta.url)('./project.cjs');
const tmp = () => mkdtempSync(join(tmpdir(), 'mbp-'));
const abs = (n: string) => (process.platform === 'win32' ? `C:\\x\\${n}` : `/x/${n}`);

describe('project files on disk', () => {
  it('atomicWrite replaces content and leaves no temp files', async () => {
    const d = tmp(), f = join(d, 'a.manimblocks');
    await atomicWrite(f, 'one'); await atomicWrite(f, 'two');
    expect(readFileSync(f, 'utf8')).toBe('two');
    expect(readdirSync(d)).toEqual(['a.manimblocks']);
  });
  it('a failed write keeps the old file intact and cleans up', async () => {
    const d = tmp(), f = join(d, 'a.manimblocks');
    await atomicWrite(f, 'precious');
    await expect(atomicWrite(join(d, 'missing-folder', 'b.manimblocks'), 'x')).rejects.toThrow();
    expect(readFileSync(f, 'utf8')).toBe('precious');
    expect(readdirSync(d)).toEqual(['a.manimblocks']);
  });
  it('readProject enforces limits and friendly errors', async () => {
    const d = tmp();
    await expect(readProject(join(d, 'nope'))).rejects.toMatchObject({ code: 'ENOENT' });
    expect(friendlyError({ code: 'ENOENT' })).toMatch(/not found/);
    expect(friendlyError({ code: 'EACCES' })).toMatch(/permission/);
    await expect(readProject(d)).rejects.toThrow(/not a file/);
    expect(MAX_BYTES).toBe(20 * 1024 * 1024);
  });
  it('adds the extension only when missing', () => {
    expect(withExt('a')).toBe('a.manimblocks');
    expect(withExt('a.MANIMBLOCKS')).toBe('a.MANIMBLOCKS');
  });
});

describe('recent projects', () => {
  it('keeps the newest first, no duplicates, max 10, survives corrupt files', () => {
    const f = join(tmp(), 'recent.json');
    const r = new Recent(f);
    for (let i = 0; i < 12; i++) r.add(abs(`p${i}.manimblocks`));
    r.add(abs('p5.manimblocks'));
    expect(r.list()).toHaveLength(10);
    expect(r.list()[0].name).toBe('p5.manimblocks');
    expect(new Recent(f).list()).toHaveLength(10);
    r.remove(abs('p5.manimblocks'));
    expect(r.list().some((x: { name: string }) => x.name === 'p5.manimblocks')).toBe(false);
    writeFileSync(f, '{ broken');
    expect(new Recent(f).list()).toEqual([]);
    writeFileSync(f, JSON.stringify(['relative/path', 5, abs('ok.manimblocks')]));
    expect(new Recent(f).list()).toHaveLength(1);
  });
});

describe('autosave', () => {
  it('writes, reads, validates and clears', async () => {
    const d = join(tmp(), 'autosave');
    const a = autosaveStore(d);
    expect(a.read()).toBeNull();
    await a.write({ path: abs('p.manimblocks'), name: 'p.manimblocks', savedAt: 'now', content: '{}' });
    expect(a.read()).toMatchObject({ name: 'p.manimblocks', content: '{}' });
    await a.write({ path: '../../etc/passwd', name: 'x', content: '{}' });
    expect(a.read()!.path).toBeNull();
    writeFileSync(join(d, 'autosave.json'), 'garbage');
    expect(a.read()).toBeNull();
    a.clear();
    expect(existsSync(join(d, 'autosave.json'))).toBe(false);
  });
});
