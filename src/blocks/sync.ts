// Keeps the editor's displayed names in step with the blocks: object names (text1, text2, ...), the
// object ovals, and the always-present "when animation starts" block.
import * as Blockly from 'blockly';
import type { WorkspaceState } from '../codegen/generate';
import { listObjects } from './objects';
import { setObjects } from './registry';

type RefBlock = Blockly.Block & { sync?: () => void };

/** Recomputes object names and refreshes every create block label and object oval. Fires no events. */
export function syncObjects(ws: Blockly.Workspace, state?: WorkspaceState): void {
  const saved = state ?? (Blockly.serialization.workspaces.save(ws) as WorkspaceState);
  const objects = listObjects(saved);
  setObjects(objects);
  Blockly.Events.disable();
  try {
    for (const o of objects) {
      const f = ws.getBlockById(o.id)?.getField('NAME');
      if (f && f.getValue() !== o.name) f.setValue(o.name);
    }
    for (const b of ws.getBlocksByType('obj_ref', false) as RefBlock[]) b.sync?.();
  } finally { Blockly.Events.enable(); }
}

/** Makes sure exactly one "when animation starts" block exists, and that it cannot be deleted. */
export function ensureStart(ws: Blockly.Workspace): void {
  Blockly.Events.disable();
  try {
    const starts = ws.getBlocksByType('scene_start', true);
    // A duplicate (for example from copy and paste) is removed.
    for (const extra of starts.slice(1)) extra.dispose(false);
    let start = starts[0];
    if (!start) {
      start = ws.newBlock('scene_start');
      if (ws instanceof Blockly.WorkspaceSvg) { const svg = start as Blockly.BlockSvg; svg.initSvg(); svg.render(); }
      start.moveBy(48, 36);
    }
    start.setDeletable(false);
  } finally { Blockly.Events.enable(); }
}

/** Call after a project is loaded, a new project is started, or the workspace is cleared. */
export function afterWorkspaceReplaced(ws: Blockly.Workspace): void {
  ensureStart(ws);
  syncObjects(ws);
}
