/** Saves text through the native Windows dialog in the desktop app; falls back to a browser download in dev. */
export async function saveTextFile(defaultName: string, content: string, filters: { name: string; extensions: string[] }[]): Promise<SaveResult> {
  if (window.manimBlocks) return window.manimBlocks.saveTextFile({ defaultName, content, filters });
  const url = URL.createObjectURL(new Blob([content], { type: 'text/plain;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url; a.download = defaultName; a.click();
  URL.revokeObjectURL(url);
  return { ok: true, path: defaultName };
}

export async function copyText(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* fall through */ }
  const ta = document.createElement('textarea');
  ta.value = text; document.body.appendChild(ta); ta.select();
  const ok = document.execCommand('copy');
  ta.remove();
  return ok;
}
