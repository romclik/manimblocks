import * as Blockly from 'blockly';
import { COLORS } from './colors';
import { FieldObject } from './FieldObject';
import { FieldTextRange } from './FieldTextRange';
import { findObject } from './registry';

export const CATEGORY_COLOURS = {
  objects: '#7c5cff', animations: '#e5534b', properties: '#1ba39c',
  timing: '#d99a2b', camera: '#3b82f6', logic: '#3f9d6b',
} as const;
const START_COLOUR = '#8b5cf6';
type Cat = keyof typeof CATEGORY_COLOURS;
type Arg = Record<string, unknown>;

const text = (name: string, def: string): Arg => ({ type: 'field_input', name, text: def });
// An oval that holds an object. It starts out as an editable "shadow" oval (pick the object from the list,
// or for text objects choose a part of the text); an object block from the palette can be dropped over it.
const obj = (name = 'OBJ'): Arg => ({ type: 'input_value', name, check: 'Object', shadow: { type: 'obj_ref' } });
// The name of the object a "create" block makes. Filled in automatically (text1, text2, ...); never typed.
const nameLabel = (prefix: string): Arg => ({ type: 'field_label', name: 'NAME', text: prefix + '1' });
// A text slot: type in it, or drop a text object (or part of one) into it.
const textSlot = (name: string, def: string): Arg => ({ type: 'input_value', name, check: ['String', 'Object'], shadow: { type: 'obj_textval', fields: { TEXT: def } } });
const colour = (name: string, def: string): Arg => {
  const first = COLORS.find((c) => c[1] === def)!;
  return { type: 'field_dropdown', name, options: [first, ...COLORS.filter((c) => c[1] !== def)].map(([l, v]) => [l, v]) };
};
const cmp = (name: string): Arg => ({
  type: 'field_dropdown', name,
  options: [['<', '<'], ['>', '>'], ['=', '=='], ['≠', '!='], ['≤', '<='], ['≥', '>=']],
});
const endRow: Arg = { type: 'input_end_row' };
const DO: Arg = { type: 'input_statement', name: 'DO' };
const ELSE: Arg = { type: 'input_statement', name: 'ELSE' };

const stmt = (type: string, cat: Cat, message0: string, args0: Arg[], tooltip: string) =>
  ({ type, message0, args0, inputsInline: true, previousStatement: null, nextStatement: null, colour: CATEGORY_COLOURS[cat], tooltip });
const c = (type: string, cat: Cat, message0: string, args0: Arg[], tooltip: string, withElse = false) => ({
  type, message0, args0, message1: '%1', args1: [DO],
  ...(withElse ? { message2: 'else', args2: [], message3: '%1', args3: [ELSE] } : {}),
  previousStatement: null, nextStatement: null, colour: CATEGORY_COLOURS[cat], tooltip,
});

export const BLOCK_DEFINITIONS = [
  { type: 'scene_start', message0: 'when animation starts', nextStatement: null, hat: 'cap', colour: START_COLOUR,
    tooltip: 'Everything attached under this block becomes your animation. This block is always here.' },

  // ---- Object references (round ovals)
  { type: 'obj_ref', message0: '%1 %2', args0: [{ type: 'field_manim_object', name: 'TARGET' }, { type: 'input_dummy', name: 'MAIN' }], output: 'Object', colour: CATEGORY_COLOURS.objects, inputsInline: true,
    mutator: 'manim_obj_ref',
    tooltip: 'Pick an object. For a text object, tick "part" and drag across its characters to use only those.' },
  { type: 'obj_textval', message0: '%1', args0: [text('TEXT', 'Hello Manim')], output: 'String', outputShape: 3, colour: CATEGORY_COLOURS.objects,
    tooltip: 'Type some text here.' },

  // ---- Objects. Each one gets an automatic name (text1, circle2, ...) that animation blocks pick from a list.
  stmt('obj_text', 'objects', 'create text %1 color %2 as %3', [textSlot('TEXT', 'Hello Manim'), colour('COLOR', 'WHITE'), nameLabel('text')], 'Creates a text object. Type the text, or drop a text object (or part of one) into the slot. Use an animation block to show it.'),
  stmt('obj_mathtex', 'objects', 'create MathTex %1 color %2 as %3', [text('TEX', 'E = mc^2'), colour('COLOR', 'WHITE'), nameLabel('formula')], 'Creates a LaTeX formula. Rendering needs a LaTeX installation.'),
  stmt('obj_circle', 'objects', 'create circle radius %1 color %2 as %3', [text('R', '1'), colour('COLOR', 'BLUE'), nameLabel('circle')], 'Creates a circle.'),
  stmt('obj_square', 'objects', 'create square side %1 color %2 as %3', [text('SIDE', '2'), colour('COLOR', 'RED'), nameLabel('square')], 'Creates a square.'),
  stmt('obj_rectangle', 'objects', 'create rectangle width %1 height %2 color %3 as %4', [text('W', '3'), text('H', '1.5'), colour('COLOR', 'GREEN'), nameLabel('rectangle')], 'Creates a rectangle.'),
  stmt('obj_triangle', 'objects', 'create triangle color %1 as %2', [colour('COLOR', 'YELLOW'), nameLabel('triangle')], 'Creates an equilateral triangle.'),
  stmt('obj_line', 'objects', 'create line from x %1 y %2 to x %3 y %4 %5 color %6 as %7', [text('X1', '-2'), text('Y1', '0'), text('X2', '2'), text('Y2', '0'), endRow, colour('COLOR', 'WHITE'), nameLabel('line')], 'Creates a line between two points.'),
  stmt('obj_dot', 'objects', 'create dot at x %1 y %2 color %3 as %4', [text('X', '0'), text('Y', '0'), colour('COLOR', 'WHITE'), nameLabel('dot')], 'Creates a small dot.'),
  stmt('obj_arrow', 'objects', 'create arrow from x %1 y %2 to x %3 y %4 %5 color %6 as %7', [text('X1', '-2'), text('Y1', '0'), text('X2', '2'), text('Y2', '0'), endRow, colour('COLOR', 'ORANGE'), nameLabel('arrow')], 'Creates an arrow between two points.'),
  stmt('obj_numberplane', 'objects', 'create number plane as %1', [nameLabel('plane')], 'Creates a coordinate grid.'),

  // ---- Animations
  stmt('anim_add', 'animations', 'show %1 instantly', [obj()], 'Puts the object on screen with no animation.'),
  stmt('anim_create', 'animations', 'draw %1', [obj()], 'Draws a shape outline. Text and formulas are written stroke by stroke instead.'),
  stmt('anim_fadein', 'animations', 'fade in %1', [obj()], 'Fades the object in.'),
  stmt('anim_fadeout', 'animations', 'fade out %1', [obj()], 'Fades the object out and removes it.'),
  stmt('anim_grow', 'animations', 'grow %1 from center', [obj()], 'Grows the object from its center.'),
  stmt('anim_shrink', 'animations', 'shrink %1 to center', [obj()], 'Shrinks the object to nothing.'),
  stmt('anim_move', 'animations', 'move %1 to x %2 y %3', [obj(), text('X', '2'), text('Y', '1')], 'Moves the object to a position.'),
  stmt('anim_shift', 'animations', 'shift %1 by x %2 y %3', [obj(), text('X', '1'), text('Y', '0')], 'Moves the object relative to where it is.'),
  stmt('anim_rotate', 'animations', 'rotate %1 by %2 degrees', [obj(), text('ANGLE', '90')], 'Rotates the object.'),
  stmt('anim_scale', 'animations', 'scale %1 by %2', [obj(), text('FACTOR', '2')], 'Makes the object bigger (>1) or smaller (<1).'),
  stmt('anim_transform', 'animations', 'transform %1 into %2', [obj(), obj('TARGET')], 'Morphs the first object into the shape of the second.'),
  stmt('anim_indicate', 'animations', 'indicate %1', [obj()], 'Briefly highlights the object.'),
  stmt('anim_circumscribe', 'animations', 'circumscribe %1', [obj()], 'Draws a box around the object.'),

  // ---- Properties (instant changes)
  stmt('prop_color', 'properties', 'set color of %1 to %2', [obj(), colour('COLOR', 'RED')], 'Changes the color instantly.'),
  stmt('prop_opacity', 'properties', 'set opacity of %1 to %2 (0 to 1)', [obj(), text('VALUE', '0.5')], 'Changes transparency instantly.'),
  stmt('prop_position', 'properties', 'set position of %1 to x %2 y %3', [obj(), text('X', '0'), text('Y', '0')], 'Teleports the object.'),
  stmt('prop_scale', 'properties', 'set size of %1 by factor %2', [obj(), text('FACTOR', '1.5')], 'Resizes instantly.'),
  stmt('prop_stroke', 'properties', 'set stroke width of %1 to %2', [obj(), text('WIDTH', '6')], 'Changes outline thickness.'),
  stmt('prop_fill', 'properties', 'set fill of %1 to %2 opacity %3', [obj(), colour('COLOR', 'BLUE'), text('OPACITY', '0.5')], 'Fills the object with color.'),

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
];

// The object oval: a dropdown of objects plus, for text objects, an optional "part" (characters from-to).
interface RefBlock extends Blockly.Block { part_: boolean; textual_: boolean; updateShape_(): void; recolour_(): void }
const REF_MIXIN = {
  part_: false,
  textual_: false,
  saveExtraState(this: RefBlock) { return this.part_ ? { part: true } : null; },
  loadExtraState(this: RefBlock, state: { part?: boolean } | null) { this.part_ = !!state?.part; this.updateShape_(); },
  /** An oval that is already built into a block takes that block's color; one dragged out of the palette keeps the object color. */
  recolour_(this: RefBlock) {
    const parent = this.getParent();
    const colour = this.isShadow() && parent ? parent.getColour() : CATEGORY_COLOURS.objects;
    if (this.getColour() !== colour) this.setColour(colour);
  },
  /** Shows or hides the "part" controls. Called when the object list changes or the choice changes. */
  sync(this: RefBlock) {
    this.recolour_();
    const f = this.getField('TARGET') as FieldObject | null;
    const info = findObject(String(f?.getValue() ?? ''));
    this.textual_ = !!info?.textual;
    this.updateShape_();
    f?.forceRerender();
  },
  updateShape_(this: RefBlock) {
    const input = this.getInput('MAIN');
    if (!input) return;
    const has = (n: string) => input.fieldRow.some((f) => f.name === n);
    const want = this.textual_ || this.part_;
    if (!want) {
      for (const n of ['PART', 'L_PART', 'RANGE']) if (has(n)) input.removeField(n, true);
      return;
    }
    if (!has('PART')) {
      input.appendField(new Blockly.FieldCheckbox(this.part_ ? 'TRUE' : 'FALSE', (v) => { this.part_ = v === true || v === 'TRUE'; this.updateShape_(); return v; }), 'PART');
      input.appendField(new Blockly.FieldLabel('part'), 'L_PART');
    }
    if (this.part_ && !has('RANGE')) input.appendField(new FieldTextRange() as never, 'RANGE');
    else if (!this.part_ && has('RANGE')) input.removeField('RANGE', true);
  },
};

let registered = false;
export function registerBlocks(): void {
  if (registered) return;
  registered = true;
  Blockly.fieldRegistry.register('field_manim_object', FieldObject as unknown as Blockly.fieldRegistry.RegistrableField);
  Blockly.fieldRegistry.register('field_manim_range', FieldTextRange as unknown as Blockly.fieldRegistry.RegistrableField);
  Blockly.Extensions.registerMutator('manim_obj_ref', REF_MIXIN);
  Blockly.common.defineBlocksWithJsonArray(BLOCK_DEFINITIONS as unknown as object[]);
}
