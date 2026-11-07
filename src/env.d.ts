declare module 'prismjs/components/prism-python';
type SaveResult = { ok: true; path: string } | { ok: false; canceled?: boolean; error?: string };
interface Window {
  manimBlocks?: {
    saveTextFile(opts: { defaultName: string; content: string; filters?: { name: string; extensions: string[] }[] }): Promise<SaveResult>;
  };
}
