// [label, Manim constant]. The generator only accepts these constants.
export const COLORS: ReadonlyArray<readonly [string, string]> = [
  ['white', 'WHITE'], ['red', 'RED'], ['green', 'GREEN'], ['blue', 'BLUE'], ['yellow', 'YELLOW'],
  ['orange', 'ORANGE'], ['purple', 'PURPLE'], ['pink', 'PINK'], ['teal', 'TEAL'], ['gold', 'GOLD'],
  ['gray', 'GRAY'], ['black', 'BLACK'],
];
export const COLOR_VALUES = new Set(COLORS.map(([, v]) => v));
