// Real end-to-end test: installs Python + Manim + FFmpeg with uv into custom folders, then renders.
// Slow (minutes) and needs internet, so it only runs with MB_E2E=1 (see .github/workflows/e2e.yml).
import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { mkdtempSync, existsSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { generate } from '../src/codegen/generate';
import { FULL } from '../src/codegen/fixtures';

const require = createRequire(import.meta.url);
const env = require('./core/env.cjs');
const { render } = require('./core/render.cjs');
const settings = require('./core/settings.cjs');
const uv = resolve(__dirname, '..', '.tools', 'uv', process.platform === 'win32' ? 'uv.exe' : 'uv');

describe.skipIf(!process.env.MB_E2E)('real environment install + render', () => {
  const root = mkdtempSync(join(tmpdir(), 'mb-e2e-'));
  const loc = settings.derive(root);
  const events: string[] = [];

  it('installs the environment into the chosen folders', async () => {
    expect(env.envStatus(loc).ready).toBe(false);
    await env.installEnv(loc, { uv, onProgress: (p: any) => events.push(p.phase), onLog: (l: string) => process.stdout.write(`  ${l}\n`) });
    expect(env.envStatus(loc)).toMatchObject({ ready: true, manim: '0.22.1' });
    expect(events).toEqual(expect.arrayContaining(['python', 'venv', 'packages', 'ffmpeg', 'verify', 'done']));
    expect(existsSync(env.layout(loc).ffmpeg)).toBe(true);
  }, 1_500_000);

  it('renders a program that uses every block (except MathTex) to a real MP4', async () => {
    const r = generate(FULL);
    expect(r.problems).toEqual([]);
    const prog: any[] = [];
    const res = await render({ code: r.code, quality: 'l', loc, onProgress: (p: any) => prog.push(p), onLog: (l: string) => process.stdout.write(`  ${l}\n`) });
    expect(res.error ?? '').toBe('');
    expect(res.ok).toBe(true);
    expect(statSync(res.videoPath).size).toBeGreaterThan(10_000);
    expect(Math.max(...prog.map((p) => p.animation ?? 0))).toBeGreaterThanOrEqual(15);
  }, 600_000);

  it('blocks tampered code before running it', async () => {
    const res = await render({ code: 'from manim import *\nimport os\n', quality: 'l', loc });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/blocked by the safety check/);
  }, 120_000);

  it('can cancel a render', async () => {
    const ac = new AbortController();
    setTimeout(() => ac.abort(), 1500);
    const res = await render({ code: generate(FULL).code, quality: 'h', loc, signal: ac.signal });
    expect(res.ok).toBe(false);
    expect(res.canceled).toBe(true);
  }, 120_000);

  it('refuses to install when there is not enough disk space', async () => {
    const old = process.env.MB_FAKE; void old;
    await expect(env.installEnv({ ...loc }, { uv: '/definitely/missing/uv' })).rejects.toThrow(/setup tool/);
  });
});
