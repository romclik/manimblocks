// Shared test programs (Blockly workspace JSON).
import type { BlockState, WorkspaceState } from './generate';

export const B = (type: string, fields: Record<string, unknown> = {}, inputs: BlockState['inputs'] = {}): BlockState => ({ type, fields, inputs });
export const seq = (...bs: BlockState[]): BlockState => { for (let i = 0; i < bs.length - 1; i++) bs[i].next = { block: bs[i + 1] }; return bs[0]; };
export const prog = (first: BlockState, vars: { id: string; name: string }[] = []): WorkspaceState =>
  ({ variables: vars, blocks: { blocks: [{ type: 'scene_start', next: { block: first } }] } });
export const ref = (id: string) => ({ id });
export const VARS = [{ id: 'c1', name: 'circle' }, { id: 's1', name: 'square' }, { id: 'n1', name: 'count' }];

export const SAMPLE = prog(seq(
  B('time_fps', { FPS: '30' }),
  B('obj_circle', { R: '1', COLOR: 'BLUE', VAR: ref('c1') }),
  B('obj_square', { SIDE: '2', COLOR: 'RED', VAR: ref('s1') }),
  B('var_set', { VAR: ref('n1'), VALUE: '0' }),
  B('anim_create', { OBJ: ref('c1') }),
  B('logic_repeat', { N: '3' }, { DO: { block: seq(
    B('anim_shift', { OBJ: ref('c1'), X: '0.5', Y: '-1' }),
    B('var_change', { VAR: ref('n1'), VALUE: '1' }),
  ) } }),
  B('logic_foreach', { LOOPVAR: 'i', FROM: '1', TO: '3' }, { DO: { block: B('anim_scale', { OBJ: ref('c1'), FACTOR: 'i * 0.5 + count' }) } }),
  B('logic_if_else', { A: 'count', OP: '>=', B: '2' }, { DO: { block: B('prop_color', { OBJ: ref('c1'), COLOR: 'GOLD' }) }, ELSE: { block: B('time_wait', { T: '1' }) } }),
  B('anim_transform', { OBJ: ref('c1'), TARGET: ref('s1') }),
), VARS);

// Uses every block except MathTex (which needs LaTeX). Short durations keep renders fast.
const names = ['title', 'c', 's', 're', 'tr', 'l', 'd', 'a', 'p', 'k'];
export const ALL_VARS = names.map((n) => ({ id: n, name: n }));
const r = ref;
export const FULL = prog(seq(
  B('time_fps', { FPS: '15' }), B('time_duration', { T: '0.2' }),
  B('obj_text', { TEXT: 'Hi "there"', COLOR: 'WHITE', VAR: r('title') }),
  B('obj_circle', { R: '1', COLOR: 'BLUE', VAR: r('c') }), B('obj_square', { SIDE: '2', COLOR: 'RED', VAR: r('s') }),
  B('obj_rectangle', { W: '3', H: '1.5', COLOR: 'GREEN', VAR: r('re') }), B('obj_triangle', { COLOR: 'YELLOW', VAR: r('tr') }),
  B('obj_line', { X1: '-2', Y1: '0', X2: '2', Y2: '1', COLOR: 'WHITE', VAR: r('l') }), B('obj_dot', { X: '1', Y: '1', COLOR: 'PINK', VAR: r('d') }),
  B('obj_arrow', { X1: '0', Y1: '0', X2: '2', Y2: '2', COLOR: 'ORANGE', VAR: r('a') }), B('obj_numberplane', { VAR: r('p') }),
  B('anim_add', { OBJ: r('p') }), B('anim_write', { OBJ: r('title') }), B('anim_create', { OBJ: r('c') }), B('anim_fadein', { OBJ: r('s') }),
  B('anim_grow', { OBJ: r('re') }), B('anim_fadein', { OBJ: r('tr') }), B('anim_create', { OBJ: r('l') }), B('anim_fadein', { OBJ: r('d') }), B('anim_create', { OBJ: r('a') }),
  B('anim_move', { OBJ: r('c'), X: '2', Y: '1' }), B('anim_shift', { OBJ: r('s'), X: '-1', Y: '0.5' }), B('anim_rotate', { OBJ: r('s'), ANGLE: '90' }),
  B('anim_scale', { OBJ: r('c'), FACTOR: '1.5' }), B('anim_indicate', { OBJ: r('c') }), B('anim_circumscribe', { OBJ: r('s') }),
  B('prop_color', { OBJ: r('c'), COLOR: 'RED' }), B('prop_opacity', { OBJ: r('c'), VALUE: '0.5' }), B('prop_position', { OBJ: r('c'), X: '0', Y: '0' }),
  B('prop_scale', { OBJ: r('c'), FACTOR: '1.2' }), B('prop_stroke', { OBJ: r('c'), WIDTH: '8' }), B('prop_fill', { OBJ: r('c'), COLOR: 'BLUE', OPACITY: '0.4' }),
  B('cam_position', { X: '1', Y: '0' }), B('cam_zoom', { ZOOM: '1.5' }), B('time_wait', { T: '0.2' }),
  B('var_set', { VAR: r('k'), VALUE: '0' }),
  B('logic_foreach', { LOOPVAR: 'i', FROM: '1', TO: '2' }, { DO: { block: B('anim_shift', { OBJ: r('d'), X: 'i * 0.5', Y: '0' }) } }),
  B('logic_repeat', { N: '2' }, { DO: { block: B('var_change', { VAR: r('k'), VALUE: '1' }) } }),
  B('logic_if_else', { A: 'k', OP: '>=', B: '2' }, { DO: { block: B('anim_transform', { OBJ: r('c'), TARGET: r('s') }) }, ELSE: { block: B('anim_shrink', { OBJ: r('s') }) } }),
  B('anim_fadeout', { OBJ: r('title') }),
), ALL_VARS);
