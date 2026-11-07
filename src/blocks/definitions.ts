import * as Blockly from 'blockly';
import { COLORS } from './colors';

export const CATEGORY_COLOURS = {
  start: '#8b5cf6', objects: '#7c5cff', animations: '#e5534b', properties: '#1ba39c',
  timing: '#d99a2b', camera: '#3b82f6', logic: '#3f9d6b', variables: '#d6567a',
} as const;
type Cat = keyof typeof CATEGORY_COLOURS;
type Arg = Record<string, unknown>;

const text = (name: string, def: string): Arg => ({ type: 'field_input', name, text: def });
const obj = (name: string): Arg => ({ type: 'field_variable', name, variable: null });
const newVar = (name: string, def: string): Arg => ({ type: 'field_variable', name, variable: def });
const colour = (name: string, def: string): Arg => {
  const first = COLORS.find((c) => c[1] === def)!;
  return { type: 'field_dropdown', name, options: [first, ...COLORS.filter((c) => c[1] !== def)].map(([l, v]) => [l, v]) };
};
const cmp = (name: string): Arg => ({
  type: 'field_dropdown', name,
  options: [['<', '<'], ['>', '>'], ['=', '=='], ['≠', '!='], ['≤', '<='], ['≥', '>=']],
});
const DO: Arg = { type: 'input_statement', name: 'DO' };
const ELSE: Arg = { type: 'input_statement', name: 'ELSE' };

const stmt = (type: string, cat: Cat, message0: string, args0: Arg[], tooltip: string) =>
  ({ type, message0, args0, previousStatement: null, nextStatement: null, colour: CATEGORY_COLOURS[cat], tooltip });
const c = (type: string, cat: Cat, message0: string, args0: Arg[], tooltip: string, withElse = false) => ({
  type, message0, args0, message1: '%1', args1: [DO],
  ...(withElse ? { message2: 'else', args2: [], message3: '%1', args3: [ELSE] } : {}),
  previousStatement: null, nextStatement: null, colour: CATEGORY_COLOURS[cat], tooltip,
});

export const BLOCK_DEFINITIONS = [
  { type: 'scene_start', message0: 'when animation starts', nextStatement: null, hat: 'cap', colour: CATEGORY_COLOURS.start,
    tooltip: 'Everything attached under this block becomes your animation.' },

  // ---- Objects (they exist after this block, but only appear once you animate or show them)
  stmt('obj_text', 'objects', 'create text %1 color %2 as %3', [text('TEXT', 'Hello Manim'), colour('COLOR', 'WHITE'), newVar('VAR', 'text')], 'Creates a text object. Use an animation block to show it.'),
  stmt('obj_mathtex', 'objects', 'create MathTex %1 color %2 as %3', [text('TEX', 'E = mc^2'), colour('COLOR', 'WHITE'), newVar('VAR', 'formula')], 'Creates a LaTeX formula. Rendering needs a LaTeX installation.'),
  stmt('obj_circle', 'objects', 'create circle radius %1 color %2 as %3', [text('R', '1'), colour('COLOR', 'BLUE'), newVar('VAR', 'circle')], 'Creates a circle.'),
  stmt('obj_square', 'objects', 'create square side %1 color %2 as %3', [text('SIDE', '2'), colour('COLOR', 'RED'), newVar('VAR', 'square')], 'Creates a square.'),
  stmt('obj_rectangle', 'objects', 'create rectangle width %1 height %2 color %3 as %4', [text('W', '3'), text('H', '1.5'), colour('COLOR', 'GREEN'), newVar('VAR', 'rectangle')], 'Creates a rectangle.'),
  stmt('obj_triangle', 'objects', 'create triangle color %1 as %2', [colour('COLOR', 'YELLOW'), newVar('VAR', 'triangle')], 'Creates an equilateral triangle.'),
  stmt('obj_line', 'objects', 'create line from x %1 y %2 to x %3 y %4 color %5 as %6', [text('X1', '-2'), text('Y1', '0'), text('X2', '2'), text('Y2', '0'), colour('COLOR', 'WHITE'), newVar('VAR', 'line')], 'Creates a line between two points.'),
  stmt('obj_dot', 'objects', 'create dot at x %1 y %2 color %3 as %4', [text('X', '0'), text('Y', '0'), colour('COLOR', 'WHITE'), newVar('VAR', 'dot')], 'Creates a small dot.'),
  stmt('obj_arrow', 'objects', 'create arrow from x %1 y %2 to x %3 y %4 color %5 as %6', [text('X1', '-2'), text('Y1', '0'), text('X2', '2'), text('Y2', '0'), colour('COLOR', 'ORANGE'), newVar('VAR', 'arrow')], 'Creates an arrow between two points.'),
  stmt('obj_numberplane', 'objects', 'create number plane as %1', [newVar('VAR', 'plane')], 'Creates a coordinate grid.'),

  // ---- Animations
  stmt('anim_add', 'animations', 'show %1 instantly', [obj('OBJ')], 'Puts the object on screen with no animation.'),
  stmt('anim_write', 'animations', 'write %1', [obj('OBJ')], 'Writes text or a formula stroke by stroke.'),
  stmt('anim_create', 'animations', 'draw %1 (Create)', [obj('OBJ')], 'Draws the outline of the object.'),
  stmt('anim_fadein', 'animations', 'fade in %1', [obj('OBJ')], 'Fades the object in.'),
  stmt('anim_fadeout', 'animations', 'fade out %1', [obj('OBJ')], 'Fades the object out and removes it.'),
  stmt('anim_grow', 'animations', 'grow %1 from center', [obj('OBJ')], 'Grows the object from its center.'),
  stmt('anim_shrink', 'animations', 'shrink %1 to center', [obj('OBJ')], 'Shrinks the object to nothing.'),
  stmt('anim_move', 'animations', 'move %1 to x %2 y %3', [obj('OBJ'), text('X', '2'), text('Y', '1')], 'Moves the object to a position.'),
  stmt('anim_shift', 'animations', 'shift %1 by x %2 y %3', [obj('OBJ'), text('X', '1'), text('Y', '0')], 'Moves the object relative to where it is.'),
  stmt('anim_rotate', 'animations', 'rotate %1 by %2 degrees', [obj('OBJ'), text('ANGLE', '90')], 'Rotates the object.'),
  stmt('anim_scale', 'animations', 'scale %1 by %2', [obj('OBJ'), text('FACTOR', '2')], 'Makes the object bigger (>1) or smaller (<1).'),
  stmt('anim_transform', 'animations', 'transform %1 into %2', [obj('OBJ'), obj('TARGET')], 'Morphs the first object into the shape of the second.'),
  stmt('anim_indicate', 'animations', 'indicate %1', [obj('OBJ')], 'Briefly highlights the object.'),
  stmt('anim_circumscribe', 'animations', 'circumscribe %1', [obj('OBJ')], 'Draws a box around the object.'),

  // ---- Properties (instant changes)
  stmt('prop_color', 'properties', 'set color of %1 to %2', [obj('OBJ'), colour('COLOR', 'RED')], 'Changes the color instantly.'),
  stmt('prop_opacity', 'properties', 'set opacity of %1 to %2 (0 to 1)', [obj('OBJ'), text('VALUE', '0.5')], 'Changes transparency instantly.'),
  stmt('prop_position', 'properties', 'set position of %1 to x %2 y %3', [obj('OBJ'), text('X', '0'), text('Y', '0')], 'Teleports the object.'),
  stmt('prop_scale', 'properties', 'set size of %1 by factor %2', [obj('OBJ'), text('FACTOR', '1.5')], 'Resizes instantly.'),
  stmt('prop_stroke', 'properties', 'set stroke width of %1 to %2', [obj('OBJ'), text('WIDTH', '6')], 'Changes outline thickness.'),
  stmt('prop_fill', 'properties', 'set fill of %1 to %2 opacity %3', [obj('OBJ'), colour('COLOR', 'BLUE'), text('OPACITY', '0.5')], 'Fills the object with color.'),

  // ---- Timing
  stmt('time_wait', 'timing', 'wait %1 seconds', [text('T', '1')], 'Pauses the animation.'),
  stmt('time_duration', 'timing', 'set animation duration to %1 seconds', [text('T', '1')], 'All animation blocks after this one take this long (default 1).'),
  stmt('time_fps', 'timing', 'set frame rate to %1', [text('FPS', '30')], 'Whole number from 1 to 240. Applies to the whole video.'),

  // ---- Camera
  stmt('cam_position', 'camera', 'move camera to x %1 y %2', [text('X', '0'), text('Y', '0')], 'Moves the view instantly.'),
  stmt('cam_zoom', 'camera', 'set camera zoom to %1', [text('ZOOM', '1')], '1 is normal, 2 is twice as close.'),

  // ---- Logic
  c('logic_repeat', 'logic', 'repeat %1 times', [text('N', '3')], 'Runs the blocks inside several times.'),
  c('logic_foreach', 'logic', 'for each %1 from %2 to %3', [text('LOOPVAR', 'i'), text('FROM', '1'), text('TO', '3')], 'Counts from the first to the last number (inclusive). Use the name in number fields.'),
  c('logic_if', 'logic', 'if %1 %2 %3', [text('A', 'i'), cmp('OP'), text('B', '2')], 'Runs the blocks inside only if the comparison is true.'),
  c('logic_if_else', 'logic', 'if %1 %2 %3', [text('A', 'i'), cmp('OP'), text('B', '2')], 'Runs the first part if true, otherwise the "else" part.', true),

  // ---- Variables (numbers)
  stmt('var_set', 'variables', 'set %1 to %2', [newVar('VAR', 'x'), text('VALUE', '0')], 'Stores a number. Use its name in any number field.'),
  stmt('var_change', 'variables', 'change %1 by %2', [newVar('VAR', 'x'), text('VALUE', '1')], 'Adds to a number variable.'),
];

let registered = false;
export function registerBlocks(): void {
  if (registered) return;
  registered = true;
  Blockly.common.defineBlocksWithJsonArray(BLOCK_DEFINITIONS as unknown as object[]);
}
