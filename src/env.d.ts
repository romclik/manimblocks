declare module 'prismjs/components/prism-python';
type SaveResult = { ok: true; path: string } | { ok: false; canceled?: boolean; error?: string };
interface Locations { root: string; pythonEnv: string; cache: string; temp: string }
interface EnvStatus { ready: boolean; reason?: 'missing' | 'outdated' | 'damaged'; manim?: string; python?: string }
interface SettingsInfo { configured: boolean; locations: Locations | null; defaults: Locations; uvFound: boolean; envStatus: EnvStatus }
interface EnvProgress { phase: string; percent: number; message: string }
interface RenderProgress { animation?: number; percent?: number; label?: string; message?: string }
type TaskResult = { ok: true } | { ok: false; canceled?: boolean; error?: string };
type RenderResult = { ok: true; videoPath: string; videoUrl: string } | { ok: false; canceled?: boolean; error?: string };
interface ManimApi {
  saveTextFile(opts: { defaultName: string; content: string; filters?: { name: string; extensions: string[] }[] }): Promise<SaveResult>;
  getSettings(): Promise<SettingsInfo>;
  setLocations(loc: Locations): Promise<TaskResult>;
  pickFolder(defaultPath?: string): Promise<string | null>;
  freeSpace(path: string): Promise<{ ok: true; bytes: number } | { ok: false; error: string }>;
  installEnv(): Promise<TaskResult>;
  cancelEnv(): Promise<unknown>;
  startRender(opts: { code: string; quality: 'l' | 'm' | 'h' }): Promise<RenderResult>;
  cancelRender(): Promise<unknown>;
  openVideo(): Promise<SaveResult | TaskResult>;
  showVideo(): Promise<TaskResult>;
  exportVideo(): Promise<SaveResult>;
  onEnvProgress(cb: (p: EnvProgress) => void): () => void;
  onEnvLog(cb: (line: string) => void): () => void;
  onRenderProgress(cb: (p: RenderProgress) => void): () => void;
  onRenderLog(cb: (line: string) => void): () => void;
}
interface Window { manimBlocks?: ManimApi }
