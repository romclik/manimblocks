import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generate } from '../../src/codegen/generate';
import { FULL, SAMPLE, prog, B, A, seq } from '../../src/codegen/fixtures';
import { BLOCK_DEFINITIONS } from '../../src/blocks/definitions';

const require = createRequire(import.meta.url);
const { parseProgress, summarizeError, LATEX_MSG } = require('./render.cjs');
const settings = require('./settings.cjs');
const script = readFileSync(join(__dirname, 'validate_scene.py'), 'utf8');

function python(): string | null {
  for (const py of ['python3', 'python']) { const r = spawnSync(py, ['--version']); if (!r.error && r.status === 0) return py; }
  return null;
}
const py = python();
function validate(code: string): { ok: boolean; out: string } {
  const dir = mkdtempSync(join(tmpdir(), 'mbv-'));
  const f = join(dir, 'scene.py');
  writeFileSync(f, code, 'utf8');
  const r = spawnSync(py!, ['-', f], { input: script, encoding: 'utf8' });
  return { ok: r.status === 0, out: r.stdout + r.stderr };
}
const wrap = (body: string, head = 'from manim import *\n') =>
  `${head}\n\nclass GeneratedScene(MovingCameraScene):\n    def construct(self):\n        _rt = 1\n        ${body}\n`;

describe.skipIf(!py)('scene safety validator (defense in depth)', () => {
  it('accepts everything the generator makes, for every block', () => {
    for (const st of [SAMPLE, FULL]) {
      const r = generate(st);
      expect(r.problems).toEqual([]);
      const v = validate(r.code);
      expect(v.out.trim(), v.out).toBe('OK');
    }
  });
  it('FULL program really covers every block type except MathTex', () => {
    const used = new Set<string>();
    const walk = (b: any) => { for (; b; b = b.next?.block) { used.add(b.type); for (const i of Object.values<any>(b.inputs ?? {})) { walk(i.block); walk(i.shadow); } } };
    for (const t of FULL.blocks!.blocks!) walk(t);
    const missing = BLOCK_DEFINITIONS.map((d) => d.type).filter((t) => !used.has(t) && !['obj_mathtex', 'logic_if'].includes(t));
    expect(missing).toEqual([]);
  });
  it('accepts MathTex programs (LaTeX is checked separately)', () => {
    const code = generate(prog(B('obj_mathtex', { TEX: 'x^2', COLOR: 'WHITE' }, {}, 'f'))).code;
    expect(validate(code).ok).toBe(true);
  });
  it.each([
    ['import', 'import os'],
    ['dunder import', '__import__("os").system("calc")'],
    ['open', 'open("C:/x").read()'],
    ['exec', 'exec("1")'],
    ['attribute escape', 'self.__class__.__mro__'],
    ['lambda', 'x = (lambda: 1)'],
    ['while', 'while True:\n            pass'],
    ['method call', 'self.renderer.file_writer.close()'],
    ['subscript', 'x = RIGHT[0]'],
    ['f-string', 'x = f"{1}"'],
    ['shadowing a class', 'Circle = 1'],
    ['unknown keyword', 'x = Circle(foo=1)'],
  ])('rejects %s', (_n, body) => {
    const v = validate(wrap(body));
    expect(v.ok, v.out).toBe(false);
  });
  it('allows a slice of an object (part of a text) but nothing cleverer', () => {
    expect(validate(wrap('text1 = Text("hello", color=WHITE, disable_ligatures=True)\n        self.play(Write(text1[0:3]), run_time=_rt)')).ok).toBe(true);
    for (const bad of ['text1[0:3:2]', 'text1[-1:3]', 'text1[0:len(x)]', 'text1[0:1.5]', 'text1[True:3]', 'text1[0]', 'text1[0:3][0:1]', 'RIGHT[0:1]']) {
      const v = validate(wrap(`text1 = Text("hello", color=WHITE)\n        x = ${bad}`));
      expect(v.ok, `${bad}: ${v.out}`).toBe(false);
    }
  });
  it('rejects extra top-level code and a wrong class', () => {
    expect(validate(wrap('pass', 'from manim import *\nimport os\n')).ok).toBe(false);
    expect(validate(wrap('pass', 'from manim import *\nprint(1)\n')).ok).toBe(false);
    expect(validate('from manim import *\nclass GeneratedScene(Scene):\n    def construct(self):\n        pass\n').ok).toBe(false);
  });
});

describe('render helpers', () => {
  it('parses Manim progress lines', () => {
    expect(parseProgress('Animation 0: Create(Circle):  33%|███▎      | 5/15 [00:00<00:00]')).toEqual({ animation: 1, percent: 33, label: 'Create(Circle)' });
    expect(parseProgress('Animation 12: Wait: 100%|██████████| 3/3')).toMatchObject({ animation: 13, percent: 100 });
    expect(parseProgress('                      INFO     Animation 4 : Partial      scene_file_writer.py:173')).toEqual({ animation: 5, percent: 100, done: true });
    expect(parseProgress('Some other line')).toBeNull();
  });
  it('turns failures into helpful messages', () => {
    expect(summarizeError(['FileNotFoundError: [Errno 2] No such file or directory: latex'])).toBe(LATEX_MSG);
    expect(summarizeError(['x', 'ValueError: bad radius'])).toBe('ValueError: bad radius');
    expect(summarizeError(['a', 'b'])).toContain('Last output');
  });
});

describe('settings', () => {
  it('derives folders and validates paths', () => {
    const d = settings.derive(process.platform === 'win32' ? 'D:\\MB' : '/mb');
    expect(settings.valid(d)).toBe(true);
    expect(settings.valid({ ...d, cache: 'relative/path' })).toBe(false);
    const f = join(mkdtempSync(join(tmpdir(), 'mbs-')), 's.json');
    expect(settings.load(f).configured).toBe(false);
    settings.save(f, d);
    expect(settings.load(f)).toEqual({ configured: true, locations: d });
    expect(() => settings.save(f, { ...d, root: 'x' })).toThrow();
    writeFileSync(f, '{ corrupt');
    expect(settings.load(f).configured).toBe(false);
  });
});
