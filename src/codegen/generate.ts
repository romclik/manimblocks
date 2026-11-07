// Turns a Blockly workspace (JSON from Blockly.serialization) into Manim Community Edition Python.
// Pure TypeScript with no DOM or Blockly dependency, so it is fast to unit test.
// Security: users never type Python. Every value is validated (numbers/formulas, whitelisted
// colors, escaped strings, sanitized identifiers) before it can reach the generated code.
import { COLOR_VALUES } from '../blocks/colors';

export interface BlockState {
  type: string; id?: string;
  fields?: Record<string, unknown>;
  inputs?: Record<string, { block?: BlockState; shadow?: BlockState }>;
  next?: { block?: BlockState };
}
export interface WorkspaceState { blocks?: { blocks?: BlockState[] }; variables?: { id: string; name: string }[] }
export interface Problem { severity: 'error' | 'warning'; message: string; blockId?: string }
export interface GenerateResult { code: string; problems: Problem[]; errorCount: number }

const KEYWORDS = new Set('False None True and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield match case'.split(' '));
const RESERVED = new Set(['self', 'config', 'np']);

export const pyStr = (s: string): string =>
  '"' + s.replace(/\0/g, '').replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r/g, '\\r').replace(/\n/g, '\\n').replace(/\t/g, '\\t') + '"';

type Kind = 'object' | 'number';

class Ctx {
  problems: Problem[] = [];
  kinds = new Map<string, Kind>();
  assigned = new Set<string>();
  loops: string[] = [];
  fps: number | null = null;
  private byId = new Map<string, { name: string; py: string }>();
  private byName = new Map<string, string>();
  private used = new Set<string>();

  constructor(vars: { id: string; name: string }[]) {
    for (const v of vars) {
      let py = v.name.replace(/[^A-Za-z0-9_]/g, '_').replace(/^_+$/, '') || 'v';
      if (/^[0-9]/.test(py)) py = 'v_' + py;
      if (KEYWORDS.has(py) || RESERVED.has(py) || py.startsWith('__') || py.startsWith('_rt')) py += '_';
      if (/^[A-Z]/.test(py)) py = 'my_' + py; // never shadow Manim classes such as Circle
      let unique = py, k = 2;
      while (this.used.has(unique)) unique = `${py}_${k++}`;
      this.used.add(unique);
      this.byId.set(v.id, { name: v.name, py: unique });
      this.byName.set(v.name, unique);
    }
  }
  err(message: string, b?: BlockState) { this.problems.push({ severity: 'error', message, blockId: b?.id }); }
  warn(message: string, b?: BlockState) { this.problems.push({ severity: 'warning', message, blockId: b?.id }); }

  private varOf(b: BlockState, field: string) {
    const f = b.fields?.[field] as { id?: string } | string | undefined;
    const id = typeof f === 'string' ? f : f?.id;
    return id ? this.byId.get(id) : undefined;
  }
  declare(b: BlockState, field: string, kind: Kind): string | null {
    const v = this.varOf(b, field);
    if (!v) { this.err('Pick a variable name for this block.', b); return null; }
    const existing = this.kinds.get(v.py);
    if (existing && existing !== kind) {
      this.err(`"${v.name}" is used both as an object and as a number. Use a different name for one of them.`, b);
      return null;
    }
    this.kinds.set(v.py, kind);
    return v.py;
  }
  useObj(b: BlockState, field: string): string | null {
    const v = this.varOf(b, field);
    if (!v) { this.err('Choose an object for this block.', b); return null; }
    if (this.kinds.get(v.py) !== 'object' || !this.assigned.has(v.py)) {
      this.err(`"${v.name}" doesn't exist yet. Put a "create ... as ${v.name}" block above this one.`, b);
      return null;
    }
    return v.py;
  }
  useNumberVar(b: BlockState, field: string): string | null {
    const v = this.varOf(b, field);
    if (!v) { this.err('Pick a variable for this block.', b); return null; }
    if (this.kinds.get(v.py) !== 'number' || !this.assigned.has(v.py)) {
      this.err(`"${v.name}" has no number yet. Use "set ${v.name} to ..." above this block first.`, b);
      return null;
    }
    return v.py;
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
        const py = this.byName.get(t);
        if (!py) return bad(`Unknown name "${t}"`);
        if (this.kinds.get(py) !== 'number' || !this.assigned.has(py)) return bad(`"${t}" is not a number variable that has been set yet`);
        toks[i] = py; continue;
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

const create = (make: (b: B, c: Ctx) => string | null): Handler => (b, c) => {
  const name = c.declare(b, 'VAR', 'object');
  if (!name) return null;
  const e = make(b, c);
  if (e === null) return null;
  c.assigned.add(name);
  return [`${name} = ${e}`];
};
const prop = (make: (o: string, b: B, c: Ctx) => string): Handler => (b, c) => {
  const o = c.useObj(b, 'OBJ');
  return o ? [make(o, b, c)] : null;
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
  obj_text: create((b, c) => { const t = c.str(b, 'TEXT', 'The text'); return t === null ? null : `Text(${pyStr(t)}, color=${c.color(b)})`; }),
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
  anim_write: simplePlay('Write'), anim_create: simplePlay('Create'),
  anim_fadein: simplePlay('FadeIn'), anim_fadeout: simplePlay('FadeOut'),
  anim_grow: simplePlay('GrowFromCenter'), anim_shrink: simplePlay('ShrinkToCenter'),
  anim_indicate: simplePlay('Indicate'), anim_circumscribe: simplePlay('Circumscribe'),
  anim_move: play((o, b, c) => `${o}.animate.move_to(${c.vec(b, 'X', 'Y')})`),
  anim_shift: play((o, b, c) => `${o}.animate.shift(${c.vec(b, 'X', 'Y')})`),
  anim_rotate: play((o, b, c) => `Rotate(${o}, angle=${c.num(b, 'ANGLE')} * DEGREES)`),
  anim_scale: play((o, b, c) => `${o}.animate.scale(${c.num(b, 'FACTOR')})`),
  anim_transform: (b, c) => {
    const a = c.useObj(b, 'OBJ'), t = c.useObj(b, 'TARGET');
    return a && t ? [`self.play(Transform(${a}, ${t}), run_time=_rt)`] : null;
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
    const from = c.num(b, 'FROM'), to = c.num(b, 'TO');
    c.loops.push(v);
    const inner = body(b, 'DO', c);
    c.loops.pop();
    return [`for ${v} in range(int(${from}), int(${to}) + 1):`, ...inner];
  },
  logic_if: (b, c) => { const cond = compare(b, c); return [`if ${cond}:`, ...body(b, 'DO', c)]; },
  logic_if_else: (b, c) => { const cond = compare(b, c); return [`if ${cond}:`, ...body(b, 'DO', c), 'else:', ...body(b, 'ELSE', c)]; },

  // Number variables
  var_set: (b, c) => {
    const name = c.declare(b, 'VAR', 'number');
    if (!name) return null;
    const e = c.num(b, 'VALUE');
    c.assigned.add(name);
    return [`${name} = ${e}`];
  },
  var_change: (b, c) => {
    const name = c.useNumberVar(b, 'VAR');
    return name ? [`${name} += ${c.num(b, 'VALUE')}`] : null;
  },
};

export const SUPPORTED_BLOCK_TYPES: string[] = ['scene_start', ...Object.keys(HANDLERS)];

export function generate(state: WorkspaceState): GenerateResult {
  const c = new Ctx(state.variables ?? []);
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
