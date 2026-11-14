// Hover helpers: point at an object oval and the block that creates the object lights up
// (and, for a text part, the text slot the characters come from).
import * as Blockly from 'blockly';
import { findObject } from './registry';
import { readRange } from './objects';

let lit: Element[] = [];
let chip: HTMLElement | null = null;

export function clearHighlight(): void {
  for (const el of lit) el.classList.remove('mb-hl', 'mb-hl-field');
  lit = [];
  chip?.remove();
  chip = null;
}

function mark(el: Element | null | undefined, cls: string) {
  if (!el) return;
  el.classList.add(cls);
  lit.push(el);
}

/** Lights up the "create ..." block of an object. With `slot`, also the text slot of a text object. */
export function highlightObject(ws: Blockly.Workspace, id: string, slot = false): void {
  clearHighlight();
  const creator = id ? ws.getBlockById(id) : null;
  if (!creator) return;
  mark((creator as Blockly.BlockSvg).getSvgRoot?.(), 'mb-hl');
  if (slot) mark((creator.getInputTargetBlock('TEXT') as Blockly.BlockSvg | null)?.getSvgRoot?.(), 'mb-hl-field');
}

/** A small note above a "part" selector showing the whole text with the chosen part marked. */
export function showPartPreview(anchor: Element, id: string, range: string): void {
  chip?.remove();
  const info = findObject(id);
  if (info?.text === undefined) return;
  const chars = Array.from(info.text);
  const r = readRange(range, chars.length);
  const { from, to } = 'error' in r ? { from: 1, to: chars.length } : r;
  chip = document.createElement('div');
  chip.className = 'mb-preview';
  chars.forEach((ch, i) => {
    const s = document.createElement('span');
    s.textContent = ch === ' ' ? '\u00a0' : ch;
    if (i + 1 >= from && i + 1 <= to) s.className = 'on';
    chip!.appendChild(s);
  });
  document.body.appendChild(chip);
  const a = anchor.getBoundingClientRect();
  const w = chip.getBoundingClientRect();
  chip.style.left = `${Math.max(4, Math.min(window.innerWidth - w.width - 4, a.left + a.width / 2 - w.width / 2))}px`;
  chip.style.top = `${Math.max(4, a.top - w.height - 8)}px`;
}

/** Wires up hovering over object ovals in the editor. Returns a function that removes the listeners. */
export function setupHoverHighlight(ws: Blockly.WorkspaceSvg, host: HTMLElement): () => void {
  const over = (e: PointerEvent) => {
    const t = e.target as Element | null;
    // The drop-down list lives inside the editor but manages its own highlighting.
    if (t?.closest?.('.blocklyDropDownDiv, .blocklyWidgetDiv')) return;
    const id = t?.closest?.('[data-id]')?.getAttribute('data-id');
    const block = id ? ws.getBlockById(id) : null;
    if (!block || block.type !== 'obj_ref') { clearHighlight(); return; }
    const target = String(block.getFieldValue('TARGET') ?? '');
    const partUsed = !!findObject(target)?.textual && block.getFieldValue('PART') === 'TRUE';
    highlightObject(ws, target, partUsed);
    const field = block.getField('TARGET') as Blockly.Field | null;
    if (partUsed && field?.getSvgRoot()) showPartPreview(field.getSvgRoot()!, target, String(block.getFieldValue('RANGE') ?? ''));
  };
  const out = (e: PointerEvent) => {
    const to = e.relatedTarget as Element | null;
    if (to?.closest?.('.blocklyDropDownDiv, .blocklyWidgetDiv')) return;
    if (!host.contains(to)) clearHighlight();
  };
  host.addEventListener('pointerover', over);
  host.addEventListener('pointerout', out);
  return () => { host.removeEventListener('pointerover', over); host.removeEventListener('pointerout', out); clearHighlight(); };
}
