import { describe, expect, it } from 'vitest';
import * as Blockly from 'blockly';
import { parseProject, serializeProject, PROJECT_FORMAT } from './project';
import { BLOCK_DEFINITIONS, registerBlocks } from '../blocks/definitions';
import { generate, type WorkspaceState } from '../codegen/generate';
import { FULL } from '../codegen/fixtures';

const known = new Set(BLOCK_DEFINITIONS.map((b) => b.type));
const wrap = (workspace: unknown, extra: object = {}) => JSON.stringify({ format: PROJECT_FORMAT, version: 3, workspace, ...extra });

describe('project files', () => {
  it('upgrades a format 2 project: two character fields become one range', () => {
    const v2 = { blocks: { blocks: [{ type: 'scene_start', next: { block: { type: 'anim_indicate', inputs: { OBJ: { shadow: { type: 'obj_ref', fields: { TARGET: 'x', FROM: '2', TO: '4' }, extraState: { part: true } } } } } } }] } };
    const r = parseProject(wrap(v2, { version: 2 }), known) as { ok: boolean; workspace: any };
    expect(r.ok).toBe(true);
    const ref = r.workspace.blocks.blocks[0].next.block.inputs.OBJ.shadow;
    expect(ref.fields).toEqual({ TARGET: 'x', PART: true, RANGE: '2-4' });
    const blank = { blocks: { blocks: [{ type: 'obj_ref', fields: { TARGET: 'x', FROM: '', TO: '3' } }] } };
    expect((parseProject(wrap(blank, { version: 2 }), known) as any).workspace.blocks.blocks[0].fields.RANGE).toBe('');
  });
  it('round-trips a full project through real Blockly and regenerates identical code', () => {
    registerBlocks();
    const ws1 = new Blockly.Workspace();
    Blockly.serialization.workspaces.load({ blocks: FULL.blocks } as never, ws1);
    const text = serializeProject(Blockly.serialization.workspaces.save(ws1));
    const parsed = parseProject(text, known);
    expect(parsed.ok).toBe(true);
    const ws2 = new Blockly.Workspace();
    Blockly.serialization.workspaces.load((parsed as { workspace: object }).workspace as never, ws2);
    const back = Blockly.serialization.workspaces.save(ws2) as WorkspaceState;
    expect(generate(back).code).toBe(generate(FULL).code);
    expect(generate(back).problems).toEqual([]);
    ws1.dispose(); ws2.dispose();
  });
  it('accepts an empty workspace', () => { expect(parseProject(wrap({}), known).ok).toBe(true); });
  it.each([
    ['not JSON', '{ nope', /damaged/],
    ['truncated file', serializeProject({ blocks: { blocks: [] } }).slice(0, 40), /damaged/],
    ['empty file', '', /damaged/],
    ['a different JSON file', JSON.stringify({ name: 'package' }), /not a ManimBlocks/],
    ['null', 'null', /not a ManimBlocks/],
    ['newer version', wrap({}, { version: 99 }), /newer version/],
    ['bad version', wrap({}, { version: 'x' }), /version number/],
    ['no workspace', JSON.stringify({ format: PROJECT_FORMAT, version: 3 }), /workspace is missing/],
    ['blocks not a list', wrap({ blocks: { blocks: 5 } }), /block list/],
    ['block without type', wrap({ blocks: { blocks: [{ id: 'x' }] } }), /no type/],
    ['unknown block', wrap({ blocks: { blocks: [{ type: 'evil_block' }] } }), /does not know \(evil_block\)/],
    ['bad variables', wrap({ variables: [{ id: 1 }] }), /variable list/],
    ['older test version', wrap({}, { version: 1 }), /older test version/],
  ])('rejects %s with a friendly message', (_n, text, re) => {
    const r = parseProject(text as string, known);
    expect(r.ok).toBe(false);
    expect((r as { error: string }).error).toMatch(re as RegExp);
  });
  it('rejects absurdly deep nesting', () => {
    let b: object = { type: 'time_wait' };
    for (let i = 0; i < 400; i++) b = { type: 'logic_repeat', inputs: { DO: { block: b } } };
    expect((parseProject(wrap({ blocks: { blocks: [b] } }), known) as { error: string }).error).toMatch(/nested too deeply/);
  });
});
