import { BLOCK_DEFINITIONS, CATEGORY_COLOURS } from './definitions';

/** Blocks that exist but are not in the palette (the start block is always on the canvas; text values only appear inside slots). */
export const HIDDEN_FROM_PALETTE = ['scene_start', 'obj_textval'];

type Arg = { type?: string; name?: string; shadow?: unknown };
// Slots that hold an object oval or a text value start with a ready-made editable block inside ("shadow").
const shadowInputs = (def: object) => {
  const args = Object.entries(def).filter(([k]) => /^args\d+$/.test(k)).flatMap(([, v]) => v as Arg[]);
  const inputs = Object.fromEntries(args.filter((a) => a.type === 'input_value' && a.shadow).map((a) => [a.name, { shadow: a.shadow }]));
  return Object.keys(inputs).length ? { inputs } : {};
};

const group = (name: string, colour: string, prefix: string) => ({
  kind: 'category', name, colour,
  contents: BLOCK_DEFINITIONS
    .filter((b) => b.type.startsWith(prefix) && !HIDDEN_FROM_PALETTE.includes(b.type))
    .map((b) => ({ kind: 'block', type: b.type, ...shadowInputs(b) })),
});

export const TOOLBOX = {
  kind: 'categoryToolbox',
  contents: [
    group('Objects', CATEGORY_COLOURS.objects, 'obj_'),
    group('Animations', CATEGORY_COLOURS.animations, 'anim_'),
    group('Properties', CATEGORY_COLOURS.properties, 'prop_'),
    group('Timing', CATEGORY_COLOURS.timing, 'time_'),
    group('Camera', CATEGORY_COLOURS.camera, 'cam_'),
    group('Logic', CATEGORY_COLOURS.logic, 'logic_'),
  ],
};
