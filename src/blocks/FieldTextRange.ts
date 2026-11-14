// The "part of a text" field. It shows the characters that will be used (for example “ello”) and,
// when clicked, opens the text itself: drag across the characters to select them, like selecting text.
// The value is "from-to" (1-based, both included); empty means the whole text.
import * as Blockly from 'blockly';
import { findObject } from './registry';

const MAX_SHOWN = 16;

export class FieldTextRange extends Blockly.FieldTextInput {
  constructor(value = '') { super(value); }
  static override fromJson(options: Blockly.FieldTextInputFromJsonConfig): FieldTextRange { return new FieldTextRange(options.text); }

  protected override doClassValidation_(newValue?: string): string | null {
    return typeof newValue === 'string' && /^(\d{1,6}-\d{1,6})?$/.test(newValue.trim()) ? newValue.trim() : null;
  }

  /** The text of the object this block points at, or undefined when it cannot be worked out. */
  sourceText(): string | undefined {
    const id = String(this.getSourceBlock()?.getFieldValue('TARGET') ?? '');
    return findObject(id)?.text;
  }

  protected override getText_(): string | null {
    const text = this.sourceText();
    const raw = String(this.getValue() ?? '');
    if (text === undefined) return raw ? raw.replace('-', ' to ') : 'select';
    const chars = Array.from(text);
    const m = /^(\d+)-(\d+)$/.exec(raw);
    const from = m ? Number(m[1]) : 1, to = m ? Number(m[2]) : chars.length;
    if (from < 1 || to > chars.length || from > to) return 'select';
    const part = chars.slice(from - 1, to).join('').replace(/\s/g, ' ');
    const shown = Array.from(part);
    return '“' + (shown.length > MAX_SHOWN ? shown.slice(0, MAX_SHOWN - 1).join('') + '…' : part) + '”';
  }

  protected override showEditor_(): void {
    const text = this.sourceText();
    Blockly.DropDownDiv.clearContent();
    const div = Blockly.DropDownDiv.getContentDiv();
    const wrap = document.createElement('div');
    wrap.className = 'mb-range';
    const title = document.createElement('div');
    title.className = 'mb-range-title';
    wrap.appendChild(title);
    if (text === undefined || text === '') {
      title.textContent = 'The text of this object is not known yet. Choose a text object that has its text typed in.';
      div.appendChild(wrap);
    } else {
      title.textContent = 'Drag across the characters to use';
      const chars = Array.from(text);
      const box = document.createElement('div');
      box.className = 'mb-range-chars';
      const spans = chars.map((ch, i) => {
        const s = document.createElement('span');
        s.dataset.i = String(i);
        s.textContent = ch === ' ' ? '\u00a0' : ch === '\n' ? '↵' : ch;
        if (/\s/.test(ch)) s.classList.add('space');
        s.title = `character ${i + 1}`;
        box.appendChild(s);
        return s;
      });
      wrap.appendChild(box);
      const info = document.createElement('div');
      info.className = 'mb-range-info';
      wrap.appendChild(info);
      const m = /^(\d+)-(\d+)$/.exec(String(this.getValue() ?? ''));
      let a = m ? Number(m[1]) - 1 : 0, b = m ? Number(m[2]) - 1 : chars.length - 1;
      const paint = () => {
        const lo = Math.min(a, b), hi = Math.max(a, b);
        spans.forEach((s, i) => s.classList.toggle('on', i >= lo && i <= hi));
        info.textContent = lo === hi ? `Character ${lo + 1}` : `Characters ${lo + 1} to ${hi + 1}`;
      };
      paint();
      let dragging = false;
      const at = (e: PointerEvent) => {
        const el = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('[data-i]');
        return el ? Number(el.dataset.i) : null;
      };
      box.addEventListener('pointerdown', (e) => {
        const i = at(e);
        if (i === null) return;
        e.preventDefault();
        dragging = true; a = b = i; paint();
        const move = (ev: PointerEvent) => { const j = at(ev); if (j !== null) { b = j; paint(); } };
        const up = () => {
          document.removeEventListener('pointermove', move, true);
          document.removeEventListener('pointerup', up, true);
          if (!dragging) return;
          dragging = false;
          const lo = Math.min(a, b) + 1, hi = Math.max(a, b) + 1;
          this.setValue(lo === 1 && hi === chars.length ? '' : `${lo}-${hi}`);
          Blockly.DropDownDiv.hideIfOwner(this as never, true);
        };
        document.addEventListener('pointermove', move, true);
        document.addEventListener('pointerup', up, true);
      });
      const all = document.createElement('button');
      all.textContent = 'Use the whole text';
      all.className = 'mb-range-all';
      all.addEventListener('click', () => { this.setValue(''); Blockly.DropDownDiv.hideIfOwner(this as never, true); });
      wrap.appendChild(all);
      div.appendChild(wrap);
    }
    const src = this.getSourceBlock();
    const colour = src && 'getColour' in src ? (src as Blockly.Block).getColour() : '#7c5cff';
    Blockly.DropDownDiv.setColour('#1c1828', colour);
    Blockly.DropDownDiv.showPositionedByField(this as never, undefined, undefined, false);
  }
}
