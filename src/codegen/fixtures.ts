// Shared test programs (Blockly workspace JSON).
import type { BlockState, WorkspaceState } from './generate';

/** A block. `id` is needed for "create" blocks: it is how other blocks refer to the object. */
export const B = (type: string, fields: Record<string, unknown> = {}, inputs: BlockState['inputs'] = {}, id?: string): BlockState =>
  ({ type, fields, inputs, ...(id ? { id } : {}) });
export const seq = (...bs: BlockState[]): BlockState => { for (let i = 0; i < bs.length - 1; i++) bs[i].next = { block: bs[i + 1] }; return bs[0]; };
export const prog = (first: BlockState): WorkspaceState => ({ blocks: { blocks: [{ type: 'scene_start', next: { block: first } }] } });

/** An object oval (plugged in or shadow) pointing at the object created by block `id`; `part` picks characters from..to of a text. */
export const O = (id: string, part?: [number | string, number | string] | string) => ({
  block: { type: 'obj_ref', fields: { TARGET: id, ...(part ? { RANGE: typeof part === 'string' ? part : `${part[0]}-${part[1]}` } : {}) }, ...(part ? { extraState: { part: true } } : {}) } as BlockState,
});
/** Typed text in a "create text" slot. */
export const T = (text: string) => ({ shadow: { type: 'obj_textval', fields: { TEXT: text } } as BlockState });
/** An animation or property block aimed at object `id`. */
export const A = (type: string, id: string, fields: Record<string, unknown> = {}): BlockState => B(type, fields, { OBJ: O(id) });

export const SAMPLE = prog(seq(
  B('time_fps', { FPS: '30' }),
  B('obj_circle', { R: '1', COLOR: 'BLUE' }, {}, 'c1'),
  B('obj_square', { SIDE: '2', COLOR: 'RED' }, {}, 's1'),
  A('anim_create', 'c1'),
  B('logic_repeat', { N: '3' }, { DO: { block: A('anim_shift', 'c1', { X: '0.5', Y: '-1' }) } }),
  B('logic_foreach', { LOOPVAR: 'i', FROM: '1', TO: '3' }, { DO: { block: A('anim_scale', 'c1', { FACTOR: 'i * 0.5 + 1' }) } }),
  B('logic_if_else', { A: '2', OP: '>=', B: '1' }, { DO: { block: A('prop_color', 'c1', { COLOR: 'GOLD' }) }, ELSE: { block: B('time_wait', { T: '1' }) } }),
  B('anim_transform', {}, { OBJ: O('c1'), TARGET: O('s1') }),
));

// Uses every block except MathTex (which needs LaTeX). Short durations keep renders fast.
export const FULL = prog(seq(
  B('time_fps', { FPS: '15' }), B('time_duration', { T: '0.2' }),
  B('obj_text', { COLOR: 'WHITE' }, { TEXT: T('Hi "there"') }, 'title'),
  B('obj_text', { COLOR: 'GOLD' }, { TEXT: O('title', [1, 2]) }, 'sub'),
  B('obj_circle', { R: '1', COLOR: 'BLUE' }, {}, 'c'), B('obj_square', { SIDE: '2', COLOR: 'RED' }, {}, 's'),
  B('obj_rectangle', { W: '3', H: '1.5', COLOR: 'GREEN' }, {}, 're'), B('obj_triangle', { COLOR: 'YELLOW' }, {}, 'tr'),
  B('obj_line', { X1: '-2', Y1: '0', X2: '2', Y2: '1', COLOR: 'WHITE' }, {}, 'l'), B('obj_dot', { X: '1', Y: '1', COLOR: 'PINK' }, {}, 'd'),
  B('obj_arrow', { X1: '0', Y1: '0', X2: '2', Y2: '2', COLOR: 'ORANGE' }, {}, 'a'), B('obj_numberplane', {}, {}, 'p'),
  A('anim_add', 'p'), A('anim_create', 'title'), B('anim_create', {}, { OBJ: O('sub') }), A('anim_create', 'c'), A('anim_fadein', 's'),
  A('anim_grow', 're'), A('anim_fadein', 'tr'), A('anim_create', 'l'), A('anim_fadein', 'd'), A('anim_create', 'a'),
  A('anim_move', 'c', { X: '2', Y: '1' }), A('anim_shift', 's', { X: '-1', Y: '0.5' }), A('anim_rotate', 's', { ANGLE: '90' }),
  A('anim_scale', 'c', { FACTOR: '1.5' }), A('anim_indicate', 'c'), A('anim_circumscribe', 's'),
  // parts of a text: every animation and property block also works on a few characters
  B('anim_indicate', {}, { OBJ: O('title', [1, 2]) }), B('prop_color', { COLOR: 'RED' }, { OBJ: O('title', [4, 6]) }),
  A('prop_color', 'c', { COLOR: 'RED' }), A('prop_opacity', 'c', { VALUE: '0.5' }), A('prop_position', 'c', { X: '0', Y: '0' }),
  A('prop_scale', 'c', { FACTOR: '1.2' }), A('prop_stroke', 'c', { WIDTH: '8' }), A('prop_fill', 'c', { COLOR: 'BLUE', OPACITY: '0.4' }),
  B('cam_position', { X: '1', Y: '0' }), B('cam_zoom', { ZOOM: '1.5' }), B('time_wait', { T: '0.2' }),
  B('logic_foreach', { LOOPVAR: 'i', FROM: '1', TO: '2' }, { DO: { block: A('anim_shift', 'd', { X: 'i * 0.5', Y: '0' }) } }),
  B('logic_repeat', { N: '2' }, { DO: { block: A('anim_rotate', 'tr', { ANGLE: '45' }) } }),
  B('logic_if_else', { A: '2', OP: '>=', B: '1' }, { DO: { block: B('anim_transform', {}, { OBJ: O('c'), TARGET: O('s') }) }, ELSE: { block: A('anim_shrink', 's') } }),
  A('anim_fadeout', 'title'),
));
