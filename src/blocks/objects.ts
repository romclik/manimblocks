// Objects (the things "create ..." blocks make) get automatic names: text1, text2, circle1, ...
// Names are numbered per kind in the order the blocks run, so deleting text1 turns text2 into text1.
// Everything else (animation blocks, object ovals) points at an object by the id of the block that
// creates it, so those links survive renaming and renumbering.
// Pure TypeScript: used by the code generator and by the editor.
import type { BlockState, WorkspaceState } from '../codegen/generate';

export interface ObjKind { prefix: string; textual?: boolean; formula?: boolean }
export const OBJECT_KINDS: Record<string, ObjKind> = {
  obj_text: { prefix: 'text', textual: true },
  obj_mathtex: { prefix: 'formula', formula: true },
  obj_circle: { prefix: 'circle' },
  obj_square: { prefix: 'square' },
  obj_rectangle: { prefix: 'rectangle' },
  obj_triangle: { prefix: 'triangle' },
  obj_line: { prefix: 'line' },
  obj_dot: { prefix: 'dot' },
  obj_arrow: { prefix: 'arrow' },
  obj_numberplane: { prefix: 'plane' },
};

export interface ObjectInfo {
  /** Id of the block that creates the object. */
  id: string;
  type: string;
  /** Automatic name such as text1. Always a safe Python identifier. */
  name: string;
  /** A plain text object: parts of it (character ranges) can be used. */
  textual: boolean;
  formula: boolean;
  /** Short human description, shown when pointing at the object in a list. */
  description: string;
  /** The characters of a text object (when they can be worked out), used by the character selector. */
  text?: string;
}

/** Does this object oval use only part of a text? (The oval keeps this as a hidden checkbox field; older files kept it in extraState.) */
export const usesPart = (r: BlockState): boolean => r.fields?.PART === true || (r.extraState as { part?: unknown } | undefined)?.part === true;

/**
 * Which characters of a text a "part" selection covers. The value is "from-to" (1-based, both included);
 * empty means the whole text.
 */
export function readRange(raw: unknown, length: number): { from: number; to: number } | { error: string } {
  const s = String(raw ?? '').trim();
  if (s === '') return { from: 1, to: length };
  const m = /^(\d{1,6})-(\d{1,6})$/.exec(s);
  if (!m) return { error: 'The characters chosen here are not valid. Select them again.' };
  const from = Number(m[1]), to = Number(m[2]);
  if (from < 1 || from > to || to > length) return { error: `The characters chosen here no longer fit the text (it has ${length} characters). Select them again.` };
  return { from, to };
}

const short = (s: string, n = 40) => { const t = s.replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1) + '…' : t; };
const field = (b: BlockState, n: string) => String(b.fields?.[n] ?? '').trim();
const colorName = (b: BlockState) => field(b, 'COLOR').toLowerCase();

/** The block plugged into (or shadowing) an input. A real block wins over its shadow. */
export const inputBlock = (b: BlockState, name: string): BlockState | undefined => b.inputs?.[name]?.block ?? b.inputs?.[name]?.shadow;

function describe(b: BlockState, nameOf: (id: string) => string | undefined): string {
  const col = colorName(b);
  switch (b.type) {
    case 'obj_text': {
      const src = inputBlock(b, 'TEXT');
      if (src?.type === 'obj_ref') { const n = nameOf(field(src, 'TARGET')); return `Text copied from ${n ?? 'another object'}`; }
      return `Text “${short(field(src ?? b, 'TEXT'))}”, ${col}`;
    }
    case 'obj_mathtex': return `Formula “${short(field(b, 'TEX'))}”, ${col}`;
    case 'obj_circle': return `Circle, radius ${field(b, 'R')}, ${col}`;
    case 'obj_square': return `Square, side ${field(b, 'SIDE')}, ${col}`;
    case 'obj_rectangle': return `Rectangle ${field(b, 'W')} × ${field(b, 'H')}, ${col}`;
    case 'obj_triangle': return `Triangle, ${col}`;
    case 'obj_line': return `Line from (${field(b, 'X1')}, ${field(b, 'Y1')}) to (${field(b, 'X2')}, ${field(b, 'Y2')}), ${col}`;
    case 'obj_arrow': return `Arrow from (${field(b, 'X1')}, ${field(b, 'Y1')}) to (${field(b, 'X2')}, ${field(b, 'Y2')}), ${col}`;
    case 'obj_dot': return `Dot at (${field(b, 'X')}, ${field(b, 'Y')}), ${col}`;
    case 'obj_numberplane': return 'Number plane (coordinate grid)';
    default: return b.type;
  }
}

/** Blocks in the order they run: a block, then what is inside it, then the block after it. */
function* walk(first: BlockState | undefined): Generator<BlockState> {
  for (let b = first; b; b = b.next?.block) {
    yield b;
    yield* walk(b.inputs?.DO?.block);
    yield* walk(b.inputs?.ELSE?.block);
  }
}

/** Every object, in running order, with its automatic name. Scene stacks come before loose blocks. */
export function listObjects(state: WorkspaceState): ObjectInfo[] {
  const tops = state.blocks?.blocks ?? [];
  const ordered = [...tops.filter((t) => t.type === 'scene_start'), ...tops.filter((t) => t.type !== 'scene_start')];
  const counts = new Map<string, number>();
  const out: ObjectInfo[] = [];
  const names = new Map<string, string>();
  const texts = new Map<string, string>();
  let anon = 0;
  /** The text a text object shows: typed in its slot, or taken (all or part) from an earlier text object. */
  const textOf = (b: BlockState): string | undefined => {
    const r = inputBlock(b, 'TEXT');
    if (r?.type === 'obj_textval') return String(r.fields?.TEXT ?? '');
    if (r?.type !== 'obj_ref') return undefined;
    const src = texts.get(String(r.fields?.TARGET ?? ''));
    if (src === undefined) return undefined;
    if (!usesPart(r)) return src;
    const chars = Array.from(src);
    const range = readRange(r.fields?.RANGE, chars.length);
    return 'error' in range ? undefined : chars.slice(range.from - 1, range.to).join('');
  };
  for (const top of ordered) {
    for (const b of walk(top)) {
      const kind = OBJECT_KINDS[b.type];
      if (!kind) continue;
      const n = (counts.get(kind.prefix) ?? 0) + 1;
      counts.set(kind.prefix, n);
      const id = b.id ?? `~${anon++}`;
      const name = kind.prefix + n;
      names.set(id, name);
      const text = kind.textual ? textOf(b) : undefined;
      if (text !== undefined) texts.set(id, text);
      out.push({ id, type: b.type, name, textual: !!kind.textual, formula: !!kind.formula, description: '', text });
    }
  }
  // Descriptions need names of other objects (text copied from text1), so they are filled in afterwards.
  let i = 0;
  for (const top of ordered) for (const b of walk(top)) if (OBJECT_KINDS[b.type]) out[i++].description = describe(b, (id) => names.get(id));
  return out;
}
