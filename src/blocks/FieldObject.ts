// The dropdown inside an object oval. Its value is the id of the block that creates the object, and it
// shows the object's CURRENT automatic name (so it follows renumbering) plus, when only part of a text is
// used, that part. The list shows every object; pointing at one lights up the block that creates it and
// shows what it is. For a text object the list also holds "use only part of the text": a checkbox and the
// text itself, where you drag across the characters you want.
import * as Blockly from 'blockly';
import { findObject, getObjects, NO_OBJECTS_LABEL, objectOptions } from './registry';
import { clearHighlight, highlightObject } from './highlight';
import { readRange } from './objects';

const MAX_SHOWN = 14;

export class FieldObject extends Blockly.FieldDropdown {
  constructor() { super(() => objectOptions()); }
  static override fromJson(_options: Blockly.FieldDropdownFromJsonConfig): FieldObject { return new FieldObject(); }

  /** Accept any id: the list is filled in after a project loads, and an object may have been deleted. */
  protected override doClassValidation_(newValue?: string): string | null {
    return typeof newValue === 'string' ? newValue : null;
  }

  private partField() { return this.getSourceBlock()?.getField('PART') as Blockly.FieldCheckbox | null | undefined; }
  private rangeField() { return this.getSourceBlock()?.getField('RANGE') ?? null; }

  /** The part of the text in use, as text to show on the oval (undefined when the whole object is used). */
  private partText(): string | undefined {
    const info = findObject(String(this.getValue() ?? ''));
    if (!info?.textual || info.text === undefined || !this.partField()?.getValueBoolean()) return undefined;
    const chars = Array.from(info.text);
    const r = readRange(this.rangeField()?.getValue(), chars.length);
    if ('error' in r) return undefined;
    const part = chars.slice(r.from - 1, r.to).join('').replace(/\s/g, ' ');
    const shown = Array.from(part);
    return '“' + (shown.length > MAX_SHOWN ? shown.slice(0, MAX_SHOWN - 1).join('') + '…' : part) + '”';
  }

  protected override getText_(): string | null {
    const v = String(this.getValue() ?? '');
    if (!v) return 'choose object';
    const name = findObject(v)?.name ?? 'deleted object';
    const part = this.partText();
    return part ? `${name} ${part}` : name;
  }

  protected override showEditor_(): void {
    Blockly.DropDownDiv.clearContent();
    const div = Blockly.DropDownDiv.getContentDiv();
    const ws = this.getSourceBlock()?.workspace;
    const root = document.createElement('div');
    root.className = 'mb-pop';
    root.setAttribute('role', 'listbox');
    const close = () => Blockly.DropDownDiv.hideIfOwner(this as never, true);

    // ---- the objects
    const current = String(this.getValue() ?? '');
    const objs = getObjects();
    const list = document.createElement('div');
    list.className = 'mb-pop-list';
    if (!objs.length) {
      const empty = document.createElement('div');
      empty.className = 'mb-pop-empty';
      empty.textContent = NO_OBJECTS_LABEL;
      empty.title = 'Add a "create ..." block first; objects you create appear here.';
      list.appendChild(empty);
    }
    for (const o of objs) {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'mb-pop-item' + (o.id === current ? ' selected' : '');
      row.setAttribute('role', 'option');
      row.setAttribute('aria-selected', String(o.id === current));
      row.title = `${o.name}: ${o.description}`;
      const tick = document.createElement('span');
      tick.className = 'tick';
      tick.textContent = o.id === current ? '✓' : '';
      const name = document.createElement('span');
      name.textContent = o.name;
      row.append(tick, name);
      row.addEventListener('pointerenter', () => { if (ws) highlightObject(ws, o.id); });
      row.addEventListener('click', () => {
        if (o.id !== current) {
          // A different object: start again with the whole object.
          this.partField()?.setValue('FALSE');
          this.rangeField()?.setValue('');
          this.setValue(o.id);
        }
        close();
      });
      list.appendChild(row);
    }
    list.addEventListener('pointerleave', clearHighlight);
    root.appendChild(list);

    // ---- part of a text
    const info = findObject(current);
    if (info?.textual && info.text !== undefined && info.text !== '' && this.partField() && this.rangeField()) {
      root.appendChild(this.buildPartSection(info.text, close));
    }

    div.appendChild(root);
    const src = this.getSourceBlock();
    Blockly.DropDownDiv.setColour('#1c1828', src ? (src as Blockly.Block).getColour() : '#7c5cff');
    Blockly.DropDownDiv.showPositionedByField(this as never, () => clearHighlight(), undefined, false);
  }

  private buildPartSection(text: string, close: () => void): HTMLElement {
    const part = this.partField()!, range = this.rangeField()!;
    const chars = Array.from(text);
    const sec = document.createElement('div');
    sec.className = 'mb-pop-part';

    const label = document.createElement('label');
    label.className = 'mb-pop-check';
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = !!part.getValueBoolean();
    label.append(box, document.createTextNode(' Use only part of the text'));
    sec.appendChild(label);

    const strip = document.createElement('div');
    strip.className = 'mb-range-chars';
    const spans = chars.map((ch, i) => {
      const s = document.createElement('span');
      s.dataset.i = String(i);
      s.textContent = ch === ' ' ? '\u00a0' : ch === '\n' ? '↵' : ch;
      if (/\s/.test(ch)) s.classList.add('space');
      s.title = `character ${i + 1}`;
      strip.appendChild(s);
      return s;
    });
    sec.appendChild(strip);
    const hint = document.createElement('div');
    hint.className = 'mb-range-info';
    sec.appendChild(hint);

    const r = readRange(range.getValue(), chars.length);
    let a = 'error' in r ? 0 : r.from - 1, b = 'error' in r ? chars.length - 1 : r.to - 1;
    const paint = () => {
      const on = box.checked;
      const lo = Math.min(a, b), hi = Math.max(a, b);
      strip.classList.toggle('inactive', !on);
      spans.forEach((s, i) => s.classList.toggle('on', on && i >= lo && i <= hi));
      hint.textContent = on ? (lo === hi ? `Character ${lo + 1}` : `Characters ${lo + 1} to ${hi + 1}`) : 'Drag across the characters to use only those.';
    };
    paint();
    box.addEventListener('change', () => { part.setValue(box.checked ? 'TRUE' : 'FALSE'); paint(); this.forceRerender(); });

    const at = (e: PointerEvent) => {
      const el = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('[data-i]');
      return el ? Number(el.dataset.i) : null;
    };
    strip.addEventListener('pointerdown', (e) => {
      const i = at(e);
      if (i === null) return;
      e.preventDefault();
      box.checked = true; a = b = i; paint();
      const move = (ev: PointerEvent) => { const j = at(ev); if (j !== null) { b = j; paint(); } };
      const up = () => {
        document.removeEventListener('pointermove', move, true);
        document.removeEventListener('pointerup', up, true);
        const lo = Math.min(a, b) + 1, hi = Math.max(a, b) + 1;
        part.setValue('TRUE');
        range.setValue(lo === 1 && hi === chars.length ? '' : `${lo}-${hi}`);
        this.forceRerender();
        close();
      };
      document.addEventListener('pointermove', move, true);
      document.addEventListener('pointerup', up, true);
    });
    return sec;
  }
}
