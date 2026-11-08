import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as Blockly from 'blockly';
import { generate, SUPPORTED_BLOCK_TYPES, type WorkspaceState } from './generate';
import { B, seq, prog, ref, VARS, SAMPLE } from './fixtures';
import { BLOCK_DEFINITIONS, registerBlocks } from '../blocks/definitions';
import { TOOLBOX } from '../blocks/toolbox';

function pythonCompiles(code: string): boolean | null {
  const dir = mkdtempSync(join(tmpdir(), 'mb-'));
  const file = join(dir, 'scene.py');
  writeFileSync(file, code, 'utf8');
  for (const py of ['python3', 'python']) {
    const r = spawnSync(py, ['-m', 'py_compile', file], { encoding: 'utf8' });
    if (!r.error && r.status === 0) return true;
    if (!r.error && r.status !== 0) { console.error(r.stderr); return false; }
  }
  return null; // no Python on this machine
}

describe('generate', () => {
  it('produces the expected Manim code', () => {
    const r = generate(SAMPLE);
    expect(r.problems).toEqual([]);
    expect(r.code).toContain('from manim import *');
    expect(r.code).toContain('config.frame_rate = 30');
    expect(r.code).toContain('class GeneratedScene(MovingCameraScene):');
    expect(r.code).toContain('circle = Circle(radius=1, color=BLUE)');
    expect(r.code).toContain('self.play(Create(circle), run_time=_rt)');
    expect(r.code).toContain('for _ in range(int(3)):');
    expect(r.code).toContain('circle.animate.shift(RIGHT * 0.5 + UP * (- 1))');
    expect(r.code).toContain('for i in range(int(1), int(3) + 1):');
    expect(r.code).toContain('circle.animate.scale((i * 0.5 + count))');
    expect(r.code).toContain('else:');
  });
  it('generates Python that compiles', () => {
    const ok = pythonCompiles(generate(SAMPLE).code);
    if (ok === null) console.warn('Python not found: skipped compile check');
    else expect(ok).toBe(true);
  });
  it('empty workspace gives a valid empty scene', () => {
    const r = generate({});
    expect(r.errorCount).toBe(0);
    const ok = pythonCompiles(r.code);
    if (ok !== null) expect(ok).toBe(true);
  });
  it('rejects code injection in number fields', () => {
    for (const evil of ['__import__("os").system("calc")', '1; import os', '2**9999999', 'open', '1 +', '(1', '1 2']) {
      const r = generate(prog(B('obj_circle', { R: evil, COLOR: 'BLUE', VAR: ref('c1') }), VARS));
      expect(r.errorCount, evil).toBeGreaterThan(0);
      expect(r.code).not.toContain('import os');
      expect(r.code).not.toContain('open');
    }
  });
  it('escapes text safely', () => {
    const r = generate(prog(B('obj_text', { TEXT: 'He said "hi"\\\nnext', COLOR: 'WHITE', VAR: ref('c1') }), VARS));
    expect(r.problems).toEqual([]);
    expect(r.code).toContain('Text("He said \\"hi\\"\\\\\\nnext", color=WHITE)');
    const ok = pythonCompiles(r.code);
    if (ok !== null) expect(ok).toBe(true);
  });
  it('rejects unknown colors and bad frame rates', () => {
    expect(generate(prog(B('obj_circle', { R: '1', COLOR: '__import__', VAR: ref('c1') }), VARS)).errorCount).toBeGreaterThan(0);
    expect(generate(prog(B('time_fps', { FPS: '0' }))).errorCount).toBeGreaterThan(0);
    expect(generate(prog(B('time_fps', { FPS: '30.5' }))).errorCount).toBeGreaterThan(0);
  });
  it('catches using an object before it is created', () => {
    const r = generate(prog(B('anim_write', { OBJ: ref('c1') }), VARS));
    expect(r.problems[0].message).toMatch(/doesn't exist yet/);
  });
  it('catches number/object name clashes and unset variables', () => {
    expect(generate(prog(seq(B('obj_circle', { R: '1', COLOR: 'BLUE', VAR: ref('c1') }), B('var_set', { VAR: ref('c1'), VALUE: '1' })), VARS)).errorCount).toBe(1);
    expect(generate(prog(B('var_change', { VAR: ref('n1'), VALUE: '1' }), VARS)).errorCount).toBe(1);
    expect(generate(prog(B('prop_opacity', { OBJ: ref('c1'), VALUE: 'count' }), VARS)).errorCount).toBeGreaterThan(0);
  });
  it('requires exactly one start block and warns about loose blocks', () => {
    expect(generate({ blocks: { blocks: [B('time_wait', { T: '1' })] } }).errorCount).toBe(1);
    const two = generate({ blocks: { blocks: [{ type: 'scene_start' }, { type: 'scene_start' }] } });
    expect(two.errorCount).toBe(1);
    const loose = generate({ blocks: { blocks: [{ type: 'scene_start' }, B('time_wait', { T: '1' })] } });
    expect(loose.problems.map((p) => p.severity)).toEqual(['warning']);
  });
  it('makes unsafe variable names safe', () => {
    const r = generate(prog(B('obj_dot', { X: '0', Y: '0', COLOR: 'RED', VAR: ref('v') }), [{ id: 'v', name: 'class' }]));
    expect(r.code).toContain('class_ = Dot(');
    const r2 = generate(prog(B('obj_dot', { X: '0', Y: '0', COLOR: 'RED', VAR: ref('v') }), [{ id: 'v', name: 'Circle' }]));
    expect(r2.code).toContain('my_Circle = Dot(');
    const ok = pythonCompiles(r.code);
    if (ok !== null) expect(ok).toBe(true);
  });
});

describe('block definitions', () => {
  it('every defined block has a generator and appears in the toolbox', () => {
    const defined = BLOCK_DEFINITIONS.map((b) => b.type).sort();
    expect([...SUPPORTED_BLOCK_TYPES].sort()).toEqual(defined);
    const inToolbox = TOOLBOX.contents.flatMap((cat) => cat.contents.map((b) => b.type)).sort();
    expect(inToolbox).toEqual(defined);
  });
  it('the real Blockly workspace loads our JSON and round-trips into working code', () => {
    registerBlocks();
    const ws = new Blockly.Workspace();
    Blockly.serialization.workspaces.load(SAMPLE.blocks ? { blocks: SAMPLE.blocks, variables: SAMPLE.variables } : {}, ws);
    const saved = Blockly.serialization.workspaces.save(ws) as WorkspaceState;
    const r = generate(saved);
    expect(r.problems).toEqual([]);
    expect(r.code).toBe(generate(SAMPLE).code);
    ws.dispose();
  });
});
