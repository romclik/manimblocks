// Turns a Blockly workspace (JSON from Blockly.serialization) into Manim Community Edition Python.
// Pure TypeScript with no DOM or Blockly dependency, so it is fast to unit test.
// Security: users never type Python. Every value is validated (numbers/formulas, whitelisted
// colors, escaped strings, sanitized identifiers) before it can reach the generated code.
import { COLOR_VALUES } from '../blocks/colors';
import { listObjects, inputBlock, type ObjectInfo } from '../blocks/objects';

export interface BlockState {
  type: string; id?: string;
  fields?: Record<string, unknown>;
  extraState?: unknown;
  inputs?: Record<string, { block?: BlockState; shadow?: BlockState }>;
  next?: { block?: BlockState };
}
export interface WorkspaceState { blocks?: { blocks?: BlockState[] }; variables?: { id: string; name: string }[] }
/** An object oval resolved to Python: `code` is the expression, `text` is the characters it covers (text objects only). */
export interface ObjRef { info: ObjectInfo; code: string; text?: string }
export interface Problem { severity: 'error' | 'warning'; message: string; blockId?: string }
export interface GenerateResult { code: string; problems: Problem[]; errorCount: number }

const KEYWORDS = new Set('False None True and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield match case'.split(' '));
const RESERVED = new Set(['self', 'config', 'np']);

export const pyStr = (s: string): string =>
  '"' + s.replace(/\0/g, '').replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r/g, '\\r').replace(/\n/g, '\\n').replace(/\t/g, '\\t') + '"';

class Ctx {
  problems: Problem[] = [];
  loops: string[] = [];
  fps: number | null = null;
  objs = new Map<string, ObjectInfo>();
  /** Objects whose "create" block has already run at this point of the program. */
  assigned = new Set<string>();
  /** The characters of every text object created so far (needed to pick parts of it). */
  texts = new Map<string, string>();

  constructor(list: ObjectInfo[]) { for (const o of list) this.objs.set(o.id, o); }
  err(message: string, b?: BlockState) { this.problems.push({ severity: 'error', message, blockId: b?.id }); }
  warn(message: string, b?: BlockState) { this.problems.push({ severity: 'warning', message, blockId: b?.id }); }
  hasObjectNamed(n: string): boolean { for (const o of this.objs.values()) if (o.name === n) return true; return false; }

  /** The object oval plugged into `input`: which object it is, and (for text) which characters. */
  ref(b: BlockState, input: string): ObjRef | null {
    const r = inputBlock(b, input);
    if (!r || r.type !== 'obj_ref') { this.err('Put an object in the oval of this block.', b); return null; }
    const id = r.fields?.TARGET;
    if (typeof id !== 'string' || !id) { this.err('Choose an object in the oval of this block.', b); return null; }
    const info = this.objs.get(id);
    if (!info) { this.err('The object chosen here was deleted. Choose another one.', b); return null; }
    if (!this.assigned.has(id)) {
      this.err(`"${info.name}" doesn't exist yet. Put the block that creates it above this one.`, b); return null;
    }
    const whole = this.texts.get(id);
    const part = info.textual && (r.extraState as { part?: unknown } | undefined)?.part === true;
    if (!part) return { info, code: info.name, text: info.textual ? whole : undefined };
    if (whole === undefined) return null; // the text itself had a problem, already reported
    const chars = Array.from(whole);
    const read = (name: string, def: number, what: string): number | null => {
      const raw = String(r.fields?.[name] ?? '').trim();
      if (raw === '') return def;
      if (!/^\d{1,6}$/.test(raw)) { this.err(`${what} must be a whole number (you typed "${raw}").`, b); return null; }
      return Number(raw);
    };
    const from = read('FROM', 1, 'The first character'), to = read('TO', chars.length, 'The last character');
    if (from === null || to === null) return null;
    if (from < 1 || to > chars.length || from > to) {
      this.err(`Choose characters from 1 to ${chars.length} of "${info.name}", with the first number not larger than the last.`, b); return null;
    }
    // Text objects are made with ligatures off, so piece number n is exactly character n+1 (spaces included).
    return { info, code: `${info.name}[${from - 1}:${to}]`, text: chars.slice(from - 1, to).join('') };
  }

  /** The text a "create text" block shows: typed in its slot, or taken (all or part) from another text object. */
  textValue(b: BlockState, input: string, what: string): string | null {
    const r = inputBlock(b, input);
    if (!r) { this.err(`${what} is empty.`, b); return null; }
    if (r.type === 'obj_textval') {
      const v = String(r.fields?.TEXT ?? '');
      if (!v.trim()) { this.err(`${what} is empty.`, b); return null; }
      return v;
    }
    const x = this.ref(b, input);
    if (!x) return null;
    if (!x.info.textual || x.text === undefined) { this.err(`"${x.info.name}" is not a text object, so its text can't be used here.`, b); return null; }
    return x.text;
  }

  /** Validates a number/formula typed by the user and returns safe Python. */
  num(b: BlockState, field: string): string {
    const raw = String(b.fields?.[field] ?? '').trim();
    const bad = (msg: string) => { this.err(`${msg} (you typed "${raw}")`, b); return '0'; };
    if (!raw) return bad('This number is empty');
    const toks: string[] = [];
    const re = /\s*(\d+\.?\d*|\.\d+|[A-Za-z_]\w*|[-+*/%()]|\S)/y;
    for (let pos = 0; pos < raw.length;) {
      re.lastIndex = pos;
      const m = re.exec(raw);
      if (!m) break;
      toks.push(m[1]); pos = re.lastIndex;
    }
    for (let i = 0; i < toks.length; i++) {
      const t = toks[i];
      if (/^[\d.]/.test(t)) { toks[i] = t.replace(/^0+(?=\d)/, ''); continue; }
      if (/^[A-Za-z_]/.test(t)) {
        if (this.loops.includes(t)) continue;
        return bad(`Unknown name "${t}" (only the counter of a "for each" block can be used as a name)`);
      }
      if (!'+-*/%()'.includes(t)) return bad(`Character "${t}" isn't allowed in numbers`);
    }
    let i = 0;
    const isAtom = (t?: string) => t !== undefined && /^[\d.A-Za-z_]/.test(t);
    const primary = (): boolean => {
      const t = toks[i];
      if (t === '(') { i++; if (!expr() || toks[i] !== ')') return false; i++; return true; }
      if (isAtom(t)) { i++; return true; }
      return false;
    };
    const factor = (): boolean => { while (toks[i] === '-' || toks[i] === '+') i++; return primary(); };
    const term = (): boolean => { if (!factor()) return false; while (['*', '/', '%'].includes(toks[i])) { i++; if (!factor()) return false; } return true; };
    const expr = (): boolean => { if (!term()) return false; while (toks[i] === '+' || toks[i] === '-') { i++; if (!term()) return false; } return true; };
    if (!expr() || i !== toks.length) return bad('This is not a valid number or formula');
    return toks.length === 1 ? toks[0] : '(' + toks.join(' ') + ')';
  }
  positive(b: BlockState, field: string, what: string): string {
    const e = this.num(b, field);
    if (/^[\d.]+$/.test(e) && !(Number(e) > 0)) this.err(`${what} must be greater than 0.`, b);
    return e;
  }
  color(b: BlockState, field = 'COLOR'): string {
    const v = String(b.fields?.[field] ?? '');
    if (!COLOR_VALUES.has(v)) { this.err('Unknown color.', b); return 'WHITE'; }
    return v;
  }
  str(b: BlockState, field: string, what: string): string | null {
    const v = String(b.fields?.[field] ?? '');
    if (!v.trim()) { this.err(`${what} is empty.`, b); return null; }
    return v;
  }
  vec(b: BlockState, x: string, y: string): string { return `RIGHT * ${this.num(b, x)} + UP * ${this.num(b, y)}`; }
}

type B = BlockState;
type Handler = (b: B, c: Ctx) => string[] | null;

const create = (make: (b: B, c: Ctx, info: ObjectInfo) => string | null): Handler => (b, c) => {
  const info = b.id ? c.objs.get(b.id) : undefined;
  if (!info) { c.err('This block could not be given a name. Try deleting it and adding it again.', b); return null; }
  const e = make(b, c, info);
  c.assigned.add(info.id); // even after a problem, so one mistake does not cause a chain of follow-up errors
  return e === null ? null : [`${info.name} = ${e}`];
};
const prop = (make: (o: string, b: B, c: Ctx) => string): Handler => (b, c) => {
  const o = c.ref(b, 'OBJ');
  return o ? [make(o.code, b, c)] : null;
};
const play = (make: (o: string, b: B, c: Ctx) => string): Handler =>
  prop((o, b, c) => `self.play(${make(o, b, c)}, run_time=_rt)`);
const simplePlay = (cls: string): Handler => play((o) => `${cls}(${o})`);

const indent = (lines: string[]) => lines.map((l) => '    ' + l);
function chain(first: B | undefined, c: Ctx): string[] {
  const out: string[] = [];
  for (let b = first; b; b = b.next?.block) {
    const h = HANDLERS[b.type];
    if (!h) { c.err(`Unsupported block "${b.type}".`, b); continue; }
    const lines = h(b, c);
    if (lines) out.push(...lines);
  }
  return out;
}
const body = (b: B, input: string, c: Ctx): string[] => {
  const l = chain(b.inputs?.[input]?.block, c);
  return indent(l.length ? l : ['pass']);
};
const compare = (b: B, c: Ctx): string => {
  const op = String(b.fields?.OP ?? '');
  if (!['<', '>', '==', '!=', '<=', '>='].includes(op)) { c.err('Unknown comparison.', b); return 'True'; }
  return `${c.num(b, 'A')} ${op} ${c.num(b, 'B')}`;
};

const HANDLERS: Record<string, Handler> = {
  // Objects
  obj_text: create((b, c, info) => {
    const t = c.textValue(b, 'TEXT', 'The text');
    if (t === null) return null;
    c.texts.set(info.id, t);
    return `Text(${pyStr(t)}, color=${c.color(b)}, disable_ligatures=True)`;
  }),
  obj_mathtex: create((b, c) => { const t = c.str(b, 'TEX', 'The formula'); return t === null ? null : `MathTex(${pyStr(t)}, color=${c.color(b)})`; }),
  obj_circle: create((b, c) => `Circle(radius=${c.positive(b, 'R', 'Radius')}, color=${c.color(b)})`),
  obj_square: create((b, c) => `Square(side_length=${c.positive(b, 'SIDE', 'Side length')}, color=${c.color(b)})`),
  obj_rectangle: create((b, c) => `Rectangle(width=${c.positive(b, 'W', 'Width')}, height=${c.positive(b, 'H', 'Height')}, color=${c.color(b)})`),
  obj_triangle: create((b, c) => `Triangle(color=${c.color(b)})`),
  obj_line: create((b, c) => `Line(${c.vec(b, 'X1', 'Y1')}, ${c.vec(b, 'X2', 'Y2')}, color=${c.color(b)})`),
  obj_arrow: create((b, c) => `Arrow(${c.vec(b, 'X1', 'Y1')}, ${c.vec(b, 'X2', 'Y2')}, color=${c.color(b)})`),
  obj_dot: create((b, c) => `Dot(point=${c.vec(b, 'X', 'Y')}, color=${c.color(b)})`),
  obj_numberplane: create(() => 'NumberPlane()'),

  // Animations
  anim_add: prop((o) => `self.add(${o})`),
  // "draw" writes text and formulas stroke by stroke, and draws the outline of everything else.
  anim_create: (b, c) => { const o = c.ref(b, 'OBJ'); return o ? [`self.play(${o.info.textual || o.info.formula ? 'Write' : 'Create'}(${o.code}), run_time=_rt)`] : null; },
  anim_fadein: simplePlay('FadeIn'), anim_fadeout: simplePlay('FadeOut'),
  anim_grow: simplePlay('GrowFromCenter'), anim_shrink: simplePlay('ShrinkToCenter'),
  anim_indicate: simplePlay('Indicate'), anim_circumscribe: simplePlay('Circumscribe'),
  anim_move: play((o, b, c) => `${o}.animate.move_to(${c.vec(b, 'X', 'Y')})`),
  anim_shift: play((o, b, c) => `${o}.animate.shift(${c.vec(b, 'X', 'Y')})`),
  anim_rotate: play((o, b, c) => `Rotate(${o}, angle=${c.num(b, 'ANGLE')} * DEGREES)`),
  anim_scale: play((o, b, c) => `${o}.animate.scale(${c.num(b, 'FACTOR')})`),
  anim_transform: (b, c) => {
    const a = c.ref(b, 'OBJ'), t = c.ref(b, 'TARGET');
    return a && t ? [`self.play(Transform(${a.code}, ${t.code}), run_time=_rt)`] : null;
  },

  // Properties
  prop_color: prop((o, b, c) => `${o}.set_color(${c.color(b)})`),
  prop_opacity: prop((o, b, c) => `${o}.set_opacity(${c.num(b, 'VALUE')})`),
  prop_position: prop((o, b, c) => `${o}.move_to(${c.vec(b, 'X', 'Y')})`),
  prop_scale: prop((o, b, c) => `${o}.scale(${c.num(b, 'FACTOR')})`),
  prop_stroke: prop((o, b, c) => `${o}.set_stroke(width=${c.num(b, 'WIDTH')})`),
  prop_fill: prop((o, b, c) => `${o}.set_fill(${c.color(b)}, opacity=${c.num(b, 'OPACITY')})`),

  // Timing
  time_wait: (b, c) => [`self.wait(${c.positive(b, 'T', 'Wait time')})`],
  time_duration: (b, c) => [`_rt = ${c.positive(b, 'T', 'Duration')}`],
  time_fps: (b, c) => {
    const raw = String(b.fields?.FPS ?? '').trim();
    const n = Number(raw);
    if (!/^\d{1,3}$/.test(raw) || n < 1 || n > 240) { c.err('Frame rate must be a whole number from 1 to 240.', b); return null; }
    c.fps = n;
    return [];
  },

  // Camera (the scene class is MovingCameraScene, so the camera frame is movable)
  cam_position: (b, c) => [`self.camera.frame.move_to(${c.vec(b, 'X', 'Y')})`],
  cam_zoom: (b, c) => [`self.camera.frame.set(width=config.frame_width / ${c.positive(b, 'ZOOM', 'Zoom')})`],

  // Logic
  logic_repeat: (b, c) => { const n = c.num(b, 'N'); return [`for _ in range(int(${n})):`, ...body(b, 'DO', c)]; },
  logic_foreach: (b, c) => {
    const v = String(b.fields?.LOOPVAR ?? '').trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(v) || KEYWORDS.has(v) || RESERVED.has(v) || /^[A-Z]/.test(v) || v.startsWith('_')) {
      c.err(`"${v}" can't be used as a counter name. Use letters/numbers, starting with a lowercase letter (like i).`, b); return null;
    }
    if (c.loops.includes(v)) { c.err(`"${v}" is already used by an outer loop.`, b); return null; }
    if (c.hasObjectNamed(v)) { c.err(`"${v}" is the name of an object. Use another counter name.`, b); return null; }
    const from = c.num(b, 'FROM'), to = c.num(b, 'TO');
    c.loops.push(v);
    const inner = body(b, 'DO', c);
    c.loops.pop();
    return [`for ${v} in range(int(${from}), int(${to}) + 1):`, ...inner];
  },
  logic_if: (b, c) => { const cond = compare(b, c); return [`if ${cond}:`, ...body(b, 'DO', c)]; },
  logic_if_else: (b, c) => { const cond = compare(b, c); return [`if ${cond}:`, ...body(b, 'DO', c), 'else:', ...body(b, 'ELSE', c)]; },
};

export const SUPPORTED_BLOCK_TYPES: string[] = ['scene_start', ...Object.keys(HANDLERS)];

export function generate(state: WorkspaceState): GenerateResult {
  const c = new Ctx(listObjects(state));
  const tops = state.blocks?.blocks ?? [];
  const starts = tops.filter((b) => b.type === 'scene_start');
  if (tops.length && !starts.length) c.err('Add a "when animation starts" block and attach your blocks under it.', tops[0]);
  if (starts.length > 1) c.err('Only one "when animation starts" block is allowed.', starts[1]);
  if (starts.length) for (const t of tops) if (t.type !== 'scene_start') c.warn('This block is not attached to "when animation starts", so it is ignored.', t);
  const lines = starts[0] ? chain(starts[0].next?.block, c) : [];

  const out = [
    '# Generated by ManimBlocks. Changes made here are NOT saved back to your blocks.',
    'from manim import *', '',
  ];
  if (c.fps !== null) out.push(`config.frame_rate = ${c.fps}`, '');
  out.push('', 'class GeneratedScene(MovingCameraScene):', '    def construct(self):', '        _rt = 1  # animation duration in seconds');
  for (const l of lines) out.push('        ' + l);
  const problems = c.problems;
  return { code: out.join('\n') + '\n', problems, errorCount: problems.filter((p) => p.severity === 'error').length };
}
