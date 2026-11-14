// The hidden field that stores which characters of a text an object oval uses: "from-to" (1-based, both
// included), or empty for the whole text. It is edited from the object oval's drop-down (see FieldObject).
import * as Blockly from 'blockly';

export class FieldTextRange extends Blockly.FieldTextInput {
  constructor(value = '') { super(value); }
  static override fromJson(options: Blockly.FieldTextInputFromJsonConfig): FieldTextRange { return new FieldTextRange(options.text); }
  protected override doClassValidation_(newValue?: string): string | null {
    return typeof newValue === 'string' && /^(\d{1,6}-\d{1,6})?$/.test(newValue.trim()) ? newValue.trim() : null;
  }
}
