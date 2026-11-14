// The dropdown inside an object oval. Its value is the id of the block that creates the object, and it
// shows the object's CURRENT automatic name (so it follows renumbering). Pointing at an entry in the open
// list shows a description of the object it stands for.
import * as Blockly from 'blockly';
import { findObject, getObjects, objectOptions, NO_OBJECTS_LABEL } from './registry';
import { clearHighlight, highlightObject } from './highlight';

export class FieldObject extends Blockly.FieldDropdown {
  constructor() { super(() => objectOptions()); }
  static override fromJson(_options: Blockly.FieldDropdownFromJsonConfig): FieldObject { return new FieldObject(); }

  /** Accept any id: the list is filled in after a project loads, and an object may have been deleted. */
  protected override doClassValidation_(newValue?: string): string | null {
    return typeof newValue === 'string' ? newValue : null;
  }

  protected override getText_(): string | null {
    const v = String(this.getValue() ?? '');
    if (!v) return 'choose object';
    return findObject(v)?.name ?? 'deleted object';
  }

  protected override showEditor_(e?: MouseEvent): void {
    super.showEditor_(e);
    // Tooltips on the open list: native `title` text on each entry.
    const tag = () => {
      const items = Blockly.DropDownDiv.getContentDiv().querySelectorAll<HTMLElement>('[role="menuitem"], .blocklyMenuItem');
      const objs = getObjects();
      items.forEach((el, i) => {
        const o = objs[i];
        el.title = o ? `${o.name}: ${o.description}` : NO_OBJECTS_LABEL === el.textContent?.trim() ? 'Add a "create ..." block first; objects you create appear here.' : '';
      });
    };
    tag();
    setTimeout(tag, 0);
    // Pointing at an entry lights up the block that creates that object. The listener sits on the outer
    // drop-down container because the list inside it can be rebuilt after the editor opens.
    const ws = this.getSourceBlock()?.workspace;
    const outer = document.querySelector<HTMLElement>('.blocklyDropDownDiv');
    if (!outer) return;
    this.stopHover?.();
    const light = (ev: Event) => {
      const items = [...outer.querySelectorAll<HTMLElement>('[role="menuitem"], [role="option"], .blocklyMenuItem')];
      const i = items.findIndex((el) => el.contains(ev.target as Node));
      const o = getObjects()[i];
      if (ws && o) highlightObject(ws, o.id); else clearHighlight();
    };
    outer.addEventListener('pointerover', light);
    outer.addEventListener('pointerleave', clearHighlight);
    this.stopHover = () => { outer.removeEventListener('pointerover', light); outer.removeEventListener('pointerleave', clearHighlight); this.stopHover = undefined; };
  }

  private stopHover?: () => void;

  protected override dropdownDispose_(): void {
    this.stopHover?.();
    clearHighlight();
    super.dropdownDispose_();
  }
}
