// The .manimblocks project file: JSON with a format marker, a version and the Blockly workspace.
import { version } from '../../package.json';

export const PROJECT_FORMAT = 'manimblocks-project';
export const PROJECT_VERSION = 1;
const MAX_BLOCKS = 20000;
const MAX_DEPTH = 300;

export function serializeProject(workspace: object): string {
  return JSON.stringify({ format: PROJECT_FORMAT, version: PROJECT_VERSION, app: version, savedAt: new Date().toISOString(), workspace }, null, 1);
}

export type ParseResult = { ok: true; workspace: object } | { ok: false; error: string };

export function parseProject(text: string, knownTypes: ReadonlySet<string>): ParseResult {
  let data: unknown;
  try { data = JSON.parse(text); } catch { return { ok: false, error: 'The file is damaged: it does not contain valid project data.' }; }
  const o = data as Record<string, unknown> | null;
  if (!o || typeof o !== 'object' || o.format !== PROJECT_FORMAT) return { ok: false, error: 'This is not a ManimBlocks project file.' };
  if (typeof o.version !== 'number' || !Number.isInteger(o.version) || o.version < 1) return { ok: false, error: 'The file is damaged: its version number is invalid.' };
  if (o.version > PROJECT_VERSION) return { ok: false, error: 'This project was saved by a newer version of ManimBlocks. Update ManimBlocks to open it.' };
  const ws = o.workspace as Record<string, unknown> | null;
  if (!ws || typeof ws !== 'object' || Array.isArray(ws)) return { ok: false, error: 'The file is damaged: the workspace is missing.' };

  const unknown = new Set<string>();
  let count = 0, bad = '';
  const walk = (first: unknown, depth: number): void => {
    for (let b = first as Record<string, any> | undefined; b && !bad; b = b.next?.block) {
      if (typeof b !== 'object' || typeof b.type !== 'string') { bad = 'a block has no type'; return; }
      if (++count > MAX_BLOCKS) { bad = 'it contains too many blocks'; return; }
      if (depth > MAX_DEPTH) { bad = 'blocks are nested too deeply'; return; }
      if (!knownTypes.has(b.type)) unknown.add(b.type);
      if (b.inputs && typeof b.inputs === 'object') for (const inp of Object.values<any>(b.inputs)) { walk(inp?.block, depth + 1); walk(inp?.shadow, depth + 1); }
    }
  };
  const blocks = (ws.blocks as { blocks?: unknown } | undefined)?.blocks;
  if (blocks !== undefined && !Array.isArray(blocks)) return { ok: false, error: 'The file is damaged: the block list is invalid.' };
  for (const top of (blocks as unknown[] | undefined) ?? []) walk(top, 0);
  if (bad) return { ok: false, error: `The file is damaged or unsupported: ${bad}.` };
  if (unknown.size) return { ok: false, error: `The project uses blocks this version does not know (${[...unknown].slice(0, 5).join(', ')}). It may have been made with a different version of ManimBlocks.` };
  const vars = ws.variables;
  if (vars !== undefined && (!Array.isArray(vars) || vars.some((v) => !v || typeof v.id !== 'string' || typeof v.name !== 'string'))) return { ok: false, error: 'The file is damaged: the variable list is invalid.' };
  return { ok: true, workspace: ws };
}
