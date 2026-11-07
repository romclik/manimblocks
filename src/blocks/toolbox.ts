import { BLOCK_DEFINITIONS, CATEGORY_COLOURS } from './definitions';

const group = (name: string, colour: string, prefix: string[]) => ({
  kind: 'category', name, colour,
  contents: BLOCK_DEFINITIONS.filter((b) => prefix.some((p) => b.type.startsWith(p))).map((b) => ({ kind: 'block', type: b.type })),
});

export const TOOLBOX = {
  kind: 'categoryToolbox',
  contents: [
    group('Start', CATEGORY_COLOURS.start, ['scene_']),
    group('Objects', CATEGORY_COLOURS.objects, ['obj_']),
    group('Animations', CATEGORY_COLOURS.animations, ['anim_']),
    group('Properties', CATEGORY_COLOURS.properties, ['prop_']),
    group('Timing', CATEGORY_COLOURS.timing, ['time_']),
    group('Camera', CATEGORY_COLOURS.camera, ['cam_']),
    group('Logic', CATEGORY_COLOURS.logic, ['logic_']),
    group('Variables', CATEGORY_COLOURS.variables, ['var_']),
  ],
};
