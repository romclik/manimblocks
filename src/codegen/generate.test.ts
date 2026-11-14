import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as Blockly from 'blockly';
import { generate, SUPPORTED_BLOCK_TYPES, type WorkspaceState } from './generate';
import { B, A, O, T, seq, prog, SAMPLE, FULL } from './fixtures';
import { BLOCK_DEFINITIONS, registerBlocks } from '../blocks/definitions';
import { TOOLBOX, HIDDEN_FROM_PALETTE } from '../blocks/toolbox';
import { listObjects } from '../blocks/objects';
import { syncObjects, ensureStart, afterWorkspaceReplaced } from '../blocks/sync';
import { findObject, objectOptions } from '../blocks/registry';

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
const text = (id: string, t: string) => B('obj_text', { COLOR: 'WHITE' }, { TEXT: T(t) }, id);
const circle = (id: string) => B('obj_circle', { R: '1', COLOR: 'BLUE' }, {}, id);
const errors = (s: WorkspaceState) => generate(s).problems.filter((p) => p.severity === 'error').map((p) => p.message);

describe('generate', () => {
  it('produces the expected Manim code', () => {
    const r = generate(SAMPLE);
    expect(r.problems).toEqual([]);
    expect(r.code).toContain('from manim import *');
    expect(r.code).toContain('config.frame_rate = 30');
    expect(r.code).toContain('class GeneratedScene(MovingCameraScene):');
    expect(r.code).toContain('circle1 = Circle(radius=1, color=BLUE)');
    expect(r.code).toContain('square1 = Square(side_length=2, color=RED)');
    expect(r.code).toContain('self.play(Create(circle1), run_time=_rt)');
    expect(r.code).toContain('for _ in range(int(3)):');
    expect(r.code).toContain('circle1.animate.shift(RIGHT * 0.5 + UP * (- 1))');
    expect(r.code).toContain('for i in range(int(1), int(3) + 1):');
    expect(r.code).toContain('circle1.animate.scale((i * 0.5 + 1))');
    expect(r.code).toContain('Transform(circle1, square1)');
    expect(r.code).toContain('else:');
  });
  it('generates Python that compiles', () => {
    for (const s of [SAMPLE, FULL]) {
      const ok = pythonCompiles(generate(s).code);
      if (ok === null) console.warn('Python not found: skipped compile check');
      else expect(ok).toBe(true);
    }
  });
  it('empty workspace gives a valid empty scene', () => {
    const r = generate({});
    expect(r.errorCount).toBe(0);
    const ok = pythonCompiles(r.code);
    if (ok !== null) expect(ok).toBe(true);
  });
  it('rejects code injection in number fields', () => {
    for (const evil of ['__import__("os").system("calc")', '1; import os', '2**9999999', 'open', '1 +', '(1', '1 2', 'circle1']) {
      const r = generate(prog(B('obj_circle', { R: evil, COLOR: 'BLUE' }, {}, 'c1')));
      expect(r.errorCount, evil).toBeGreaterThan(0);
      expect(r.code).not.toContain('import os');
      expect(r.code).not.toContain('open');
    }
  });
  it('escapes text safely', () => {
    const r = generate(prog(text('t', 'He said "hi"\\\nnext')));
    expect(r.problems).toEqual([]);
    expect(r.code).toContain('Text("He said \\"hi\\"\\\\\\nnext", color=WHITE, disable_ligatures=True)');
    const ok = pythonCompiles(r.code);
    if (ok !== null) expect(ok).toBe(true);
  });
  it('rejects unknown colors and bad frame rates', () => {
    expect(generate(prog(B('obj_circle', { R: '1', COLOR: '__import__' }, {}, 'c1'))).errorCount).toBeGreaterThan(0);
    expect(generate(prog(B('time_fps', { FPS: '0' }))).errorCount).toBeGreaterThan(0);
    expect(generate(prog(B('time_fps', { FPS: '30.5' }))).errorCount).toBeGreaterThan(0);
  });
  it('requires exactly one start block and warns about loose blocks', () => {
    expect(generate({ blocks: { blocks: [B('time_wait', { T: '1' })] } }).errorCount).toBe(1);
    const two = generate({ blocks: { blocks: [{ type: 'scene_start' }, { type: 'scene_start' }] } });
    expect(two.errorCount).toBe(1);
    const loose = generate({ blocks: { blocks: [{ type: 'scene_start' }, B('time_wait', { T: '1' })] } });
    expect(loose.problems.map((p) => p.severity)).toEqual(['warning']);
  });
});

describe('automatic object names', () => {
  const names = (s: WorkspaceState) => listObjects(s).map((o) => `${o.id}=${o.name}`);
  it('numbers each kind in running order', () => {
    expect(names(prog(seq(text('a', 'x'), circle('b'), text('c', 'y'), circle('d'))))).toEqual(['a=text1', 'b=circle1', 'c=text2', 'd=circle2']);
  });
  it('numbers objects inside loops and ifs in the order they run', () => {
    const s = prog(seq(text('a', 'x'), B('logic_repeat', { N: '2' }, { DO: { block: text('b', 'y') } }), text('c', 'z')));
    expect(names(s)).toEqual(['a=text1', 'b=text2', 'c=text3']);
  });
  it('removing text1 turns text2 into text1, and animations keep pointing at the same object', () => {
    const full = prog(seq(text('t1', 'one'), text('t2', 'two'), A('anim_fadein', 't2')));
    expect(generate(full).code).toContain('FadeIn(text2)');
    const without = prog(seq(text('t2', 'two'), A('anim_fadein', 't2')));
    expect(names(without)).toEqual(['t2=text1']);
    const r = generate(without);
    expect(r.problems).toEqual([]);
    expect(r.code).toContain('text1 = Text("two"');
    expect(r.code).toContain('FadeIn(text1)');
  });
  it('describes objects for the hover text', () => {
    const d = listObjects(prog(seq(text('a', 'Hello'), circle('b')))).map((o) => o.description);
    expect(d).toEqual(['Text “Hello”, white', 'Circle, radius 1, blue']);
  });
  it('works out the text of each text object, including text copied from another object', () => {
    const s = prog(seq(text('a', 'abcdef'), B('obj_text', { COLOR: 'RED' }, { TEXT: O('a', [2, 4]) }, 'b'), B('obj_text', { COLOR: 'RED' }, { TEXT: O('b') }, 'c'), circle('d')));
    expect(listObjects(s).map((o) => o.text)).toEqual(['abcdef', 'bcd', 'bcd', undefined]);
  });
  it('names are always safe Python identifiers (no keywords, no capitals)', () => {
    for (const o of listObjects(FULL)) expect(o.name).toMatch(/^[a-z]+[0-9]+$/);
  });
  it('a for-each counter cannot reuse an object name', () => {
    const s = prog(seq(circle('c'), B('logic_foreach', { LOOPVAR: 'circle1', FROM: '1', TO: '2' }, { DO: { block: B('time_wait', { T: '1' }) } })));
    expect(errors(s)[0]).toMatch(/name of an object/);
  });
});

describe('object ovals', () => {
  it('catches using an object before it is created', () => {
    const s = prog(seq(A('anim_fadein', 'c'), circle('c')));
    expect(errors(s)[0]).toMatch(/"circle1" doesn't exist yet/);
  });
  it('asks for an object when the oval is empty or points at a deleted object', () => {
    expect(errors(prog(B('anim_fadein', {}, { OBJ: { block: { type: 'obj_ref', fields: { TARGET: '' } } } })))[0]).toMatch(/Choose an object/);
    expect(errors(prog(B('anim_fadein')))[0]).toMatch(/Put an object/);
    expect(errors(prog(A('anim_fadein', 'gone')))[0]).toMatch(/was deleted/);
  });
  it('a plugged-in oval wins over the editable oval underneath it', () => {
    const s = prog(seq(circle('a'), circle('b'), B('anim_fadein', {}, { OBJ: { shadow: O('a').block, block: O('b').block } })));
    expect(generate(s).code).toContain('FadeIn(circle2)');
  });
  it('draw writes text and formulas, and creates outlines of everything else', () => {
    const s = prog(seq(text('t', 'hi'), B('obj_mathtex', { TEX: 'x', COLOR: 'WHITE' }, {}, 'f'), circle('c'), A('anim_create', 't'), A('anim_create', 'f'), A('anim_create', 'c')));
    const code = generate(s).code;
    expect(code).toContain('Write(text1)');
    expect(code).toContain('Write(formula1)');
    expect(code).toContain('Create(circle1)');
    expect(code).not.toContain('Create(text1)');
  });
  it('the old write block is gone', () => {
    expect(BLOCK_DEFINITIONS.map((b) => b.type)).not.toContain('anim_write');
    expect(SUPPORTED_BLOCK_TYPES).not.toContain('anim_write');
  });
  it('parts of a text: characters from-to, with spaces counted', () => {
    const s = (part: [number | string, number | string]) => prog(seq(text('t', 'Hello world'), B('anim_indicate', {}, { OBJ: O('t', part) })));
    expect(generate(s([1, 5])).code).toContain('Indicate(text1[0:5])');
    expect(generate(s([7, 11])).code).toContain('Indicate(text1[6:11])');
    expect(generate(s([6, 6])).problems).toEqual([]); // just the space
    const whole = prog(seq(text('t', 'Hello'), B('anim_indicate', {}, { OBJ: { block: { type: 'obj_ref', fields: { TARGET: 't', RANGE: '2-3' } } } })));
    expect(generate(whole).code).toContain('Indicate(text1)'); // "part" is not ticked, so the whole text is used
  });
  it('an empty part means the whole text', () => {
    const s = prog(seq(text('t', 'Hello'), B('anim_indicate', {}, { OBJ: O('t', '') })));
    expect(generate(s).code).toContain('Indicate(text1)'); // empty: no part ticked in effect
  });
  it('rejects bad character ranges', () => {
    const s = (part: string) => prog(seq(text('t', 'Hello'), B('anim_indicate', {}, { OBJ: O('t', part) })));
    for (const bad of ['0-2', '3-2', '1-9', 'x', '1; import os', '-1-2', '1.5-2', '1-', '1']) {
      const r = generate(s(bad));
      expect(r.errorCount, bad).toBe(1);
      expect(r.code).not.toContain('import os');
    }
  });
  it('part controls are ignored for non-text objects', () => {
    const s = prog(seq(circle('c'), B('anim_fadein', {}, { OBJ: O('c', [1, 2]) })));
    expect(generate(s).code).toContain('FadeIn(circle1)');
  });
  it('works for every animation and property block', () => {
    const r = generate(FULL);
    expect(r.problems).toEqual([]);
    expect(r.code).toContain('Write(text1)');
    expect(r.code).toContain('Write(text2)');
    expect(r.code).toContain('Indicate(text1[0:2])');
    expect(r.code).toContain('text1[3:6].set_color(RED)');
  });
  it('a text object can take its text from (part of) another text object', () => {
    const r = generate(FULL);
    expect(r.code).toContain('text2 = Text("Hi", color=GOLD');
    const whole = prog(seq(text('a', 'Hello'), B('obj_text', { COLOR: 'RED' }, { TEXT: O('a') }, 'b')));
    expect(generate(whole).code).toContain('text2 = Text("Hello", color=RED');
    // chained: part of a part
    const chain = prog(seq(text('a', 'abcdef'), B('obj_text', { COLOR: 'RED' }, { TEXT: O('a', [2, 5]) }, 'b'), B('obj_text', { COLOR: 'RED' }, { TEXT: O('b', [2, 3]) }, 'c')));
    expect(generate(chain).code).toContain('text3 = Text("cd"');
  });
  it('text slots refuse shapes, empty text, and objects that do not exist yet', () => {
    expect(errors(prog(seq(circle('c'), B('obj_text', { COLOR: 'RED' }, { TEXT: O('c') }, 'b'))))[0]).toMatch(/not a text object/);
    expect(errors(prog(B('obj_text', { COLOR: 'RED' }, { TEXT: T('  ') }, 'b')))[0]).toMatch(/empty/);
    expect(errors(prog(B('obj_text', { COLOR: 'RED' }, {}, 'b')))[0]).toMatch(/empty/);
    expect(errors(prog(B('obj_text', { COLOR: 'RED' }, { TEXT: O('b') }, 'b')))[0]).toMatch(/doesn't exist yet/); // itself
  });
  it('an object id can never smuggle code in', () => {
    const evil = '__import__("os").system("calc")';
    const r = generate(prog(seq(circle('c'), B('anim_fadein', {}, { OBJ: O(evil) }))));
    expect(r.errorCount).toBe(1);
    expect(r.code).not.toContain('__import__');
    const r2 = generate(prog(B('obj_circle', { R: '1', COLOR: 'BLUE' }, {}, evil)));
    expect(r2.code).toContain('circle1 = Circle(');
    expect(r2.code).not.toContain('__import__');
  });
});

describe('block definitions', () => {
  it('every defined block has a generator (or is a helper) and appears in the palette (or is hidden on purpose)', () => {
    const defined = BLOCK_DEFINITIONS.map((b) => b.type).sort();
    const helpers = ['obj_ref', 'obj_textval'];
    expect([...SUPPORTED_BLOCK_TYPES, ...helpers].sort()).toEqual(defined);
    const inToolbox = TOOLBOX.contents.flatMap((cat) => cat.contents.map((b) => b.type)).sort();
    expect(inToolbox).toEqual(defined.filter((t) => !HIDDEN_FROM_PALETTE.includes(t)));
  });
  it('the palette has no Start or Variables category, and the object oval is first under Objects', () => {
    expect(TOOLBOX.contents.map((c) => c.name)).toEqual(['Objects', 'Animations', 'Properties', 'Timing', 'Camera', 'Logic']);
    expect(TOOLBOX.contents[0].contents[0].type).toBe('obj_ref');
  });
  it('palette blocks come with an editable oval / text slot already in place', () => {
    const find = (t: string) => TOOLBOX.contents.flatMap((c) => c.contents).find((b) => b.type === t) as { inputs?: Record<string, { shadow: { type: string } }> };
    expect(find('anim_fadein').inputs?.OBJ.shadow.type).toBe('obj_ref');
    expect(find('anim_transform').inputs?.TARGET.shadow.type).toBe('obj_ref');
    expect(find('obj_text').inputs?.TEXT.shadow.type).toBe('obj_textval');
    expect(find('obj_circle').inputs).toBeUndefined();
  });
  it('the real Blockly workspace loads our JSON and round-trips into working code', () => {
    registerBlocks();
    const ws = new Blockly.Workspace();
    Blockly.serialization.workspaces.load({ blocks: FULL.blocks } as never, ws);
    const saved = Blockly.serialization.workspaces.save(ws) as WorkspaceState;
    const r = generate(saved);
    expect(r.problems).toEqual([]);
    expect(r.code).toBe(generate(FULL).code);
    ws.dispose();
  });
});

describe('editor behaviour (headless Blockly)', () => {
  const load = (state: WorkspaceState) => {
    registerBlocks();
    const ws = new Blockly.Workspace();
    Blockly.serialization.workspaces.load({ blocks: state.blocks } as never, ws);
    return ws;
  };
  const label = (ws: Blockly.Workspace, id: string) => String(ws.getBlockById(id)!.getField('NAME')!.getValue());

  it('create blocks show their automatic names and renumber when one is removed', () => {
    const ws = load(prog(seq(text('t1', 'one'), text('t2', 'two'), circle('c1'))));
    syncObjects(ws);
    expect([label(ws, 't1'), label(ws, 't2'), label(ws, 'c1')]).toEqual(['text1', 'text2', 'circle1']);
    ws.getBlockById('t1')!.dispose(true);
    syncObjects(ws);
    expect([label(ws, 't2'), label(ws, 'c1')]).toEqual(['text1', 'circle1']);
    ws.dispose();
  });
  it('object ovals follow the renumbering, list objects, and describe them', () => {
    const ws = load(prog(seq(text('t1', 'one'), text('t2', 'two'), A('anim_fadein', 't2'))));
    syncObjects(ws);
    expect(objectOptions()).toEqual([['text1', 't1'], ['text2', 't2']]);
    expect(findObject('t2')?.description).toBe('Text “two”, white');
    ws.getBlockById('t1')!.dispose(true);
    syncObjects(ws);
    expect(objectOptions()).toEqual([['text1', 't2']]);
    expect(generate(Blockly.serialization.workspaces.save(ws) as WorkspaceState).code).toContain('FadeIn(text1)');
    ws.dispose();
  });
  it('the part controls appear only for text objects, and are saved with the block', () => {
    const ws = load(prog(seq(text('t', 'Hello'), circle('c'), B('anim_indicate', {}, { OBJ: O('t', [2, 4]) }), A('anim_indicate', 'c'))));
    syncObjects(ws);
    const refs = ws.getBlocksByType('obj_ref', true);
    const forText = refs.find((b) => b.getFieldValue('TARGET') === 't')!, forShape = refs.find((b) => b.getFieldValue('TARGET') === 'c')!;
    expect(forText.getField('PART')).toBeTruthy();
    expect(forText.getFieldValue('RANGE')).toBe('2-4');
    expect(forShape.getField('PART')).toBeNull();
    const saved = Blockly.serialization.workspaces.save(ws) as WorkspaceState;
    expect(generate(saved).code).toContain('Indicate(text1[1:4])');
    // untick part: the characters are no longer used
    (forText.getField('PART') as Blockly.FieldCheckbox).setValue('FALSE');
    expect(forText.getField('RANGE')).toBeNull();
    expect(generate(Blockly.serialization.workspaces.save(ws) as WorkspaceState).code).toContain('Indicate(text1)');
    ws.dispose();
  });
  it('shows text parts when ticking the box on a fresh oval', () => {
    const ws = load(prog(seq(text('t', 'Hello'), A('anim_indicate', 't'))));
    syncObjects(ws);
    const r = ws.getBlocksByType('obj_ref', true)[0];
    expect(r.getField('PART')).toBeTruthy();
    expect(r.getField('RANGE')).toBeNull();
    (r.getField('PART') as Blockly.FieldCheckbox).setValue('TRUE');
    expect(r.getField('RANGE')).toBeTruthy();
    r.setFieldValue('2-4', 'RANGE');
    expect(generate(Blockly.serialization.workspaces.save(ws) as WorkspaceState).code).toContain('Indicate(text1[1:4])');
    ws.dispose();
  });
  it('the start block is added automatically, cannot be deleted, and is never duplicated', () => {
    registerBlocks();
    const ws = new Blockly.Workspace();
    afterWorkspaceReplaced(ws);
    const starts = ws.getBlocksByType('scene_start', false);
    expect(starts).toHaveLength(1);
    expect(starts[0].isDeletable()).toBe(false);
    ensureStart(ws);
    expect(ws.getBlocksByType('scene_start', false)).toHaveLength(1);
    ws.newBlock('scene_start');
    ensureStart(ws);
    expect(ws.getBlocksByType('scene_start', false)).toHaveLength(1);
    ws.clear();
    afterWorkspaceReplaced(ws);
    expect(ws.getBlocksByType('scene_start', false)).toHaveLength(1);
    ws.dispose();
  });
  it('an old-style start block that can be deleted becomes protected after loading', () => {
    const ws = load(SAMPLE);
    ensureStart(ws);
    expect(ws.getBlocksByType('scene_start', false)[0].isDeletable()).toBe(false);
    ws.dispose();
  });
});
