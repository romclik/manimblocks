declare module 'prismjs/components/prism-python';
type SaveResult = { ok: true; path: string } | { ok: false; canceled?: boolean; error?: string };
interface Locations { root: string; pythonEnv: string; cache: string; temp: string }
interface EnvStatus { ready: boolean; reason?: 'missing' | 'outdated' | 'damaged'; manim?: string; python?: string }
type Quality = 'l' | 'm' | 'h';
interface Prefs { theme: 'dark' | 'light'; previewQuality: Quality; renderQuality: Quality; fps: number; exportDir: string; paletteAutoHide: boolean; autoUpdate: boolean; updatePrereleases: boolean; remindUntil: number; remindVersion: string }
interface LatexStatus { available: boolean; source: 'managed' | 'system' | 'none'; path: string | null }
interface SettingsInfo { configured: boolean; locations: Locations | null; defaults: Locations; uvFound: boolean; envStatus: EnvStatus; appVersion: string; prefs: Prefs; latex: LatexStatus }
interface UpdateState { status: 'idle' | 'checking' | 'none' | 'available' | 'downloading' | 'downloaded' | 'error' | 'unsupported'; current: string; version?: string; notes?: string; url?: string; percent?: number; error?: string; checkedAt?: number }
interface EnvProgress { phase: string; percent: number; message: string }
interface RenderProgress { animation?: number; percent?: number; label?: string; message?: string }
type TaskResult = { ok: true } | { ok: false; canceled?: boolean; error?: string };
type RenderResult = { ok: true; videoPath: string; videoUrl: string } | { ok: false; canceled?: boolean; error?: string; needsLatex?: boolean };
type SaveProjectResult = { ok: true; path: string; name: string } | { ok: false; canceled?: boolean; error?: string };
type OpenProjectResult = { ok: true; path: string; name: string; content: string } | { ok: false; canceled?: boolean; error?: string };
interface AutosaveInfo { ok: boolean; found?: boolean; path?: string | null; name?: string; savedAt?: string; content?: string }
interface ManimApi {
  openPending(): Promise<OpenProjectResult>;
  onOpenRequested(cb: () => void): () => void;
  setPrefs(patch: Partial<Prefs>): Promise<{ ok: boolean; prefs: Prefs }>;
  installLatex(): Promise<TaskResult>;
  getUpdateState(): Promise<UpdateState>;
  checkUpdates(): Promise<UpdateState>;
  downloadUpdate(): Promise<UpdateState>;
  installUpdate(): Promise<TaskResult>;
  remindLater(): Promise<UpdateState>;
  openReleaseNotes(): Promise<TaskResult>;
  onUpdateState(cb: (s: UpdateState) => void): () => void;
  saveProject(content: string): Promise<SaveProjectResult>;
  saveProjectAs(content: string): Promise<SaveProjectResult>;
  openProject(): Promise<OpenProjectResult>;
  openRecent(index: number): Promise<OpenProjectResult>;
  commitOpen(): Promise<unknown>;
  newProject(): Promise<unknown>;
  recentProjects(): Promise<{ ok: boolean; items?: { path: string; name: string }[] }>;
  setDirty(dirty: boolean): Promise<unknown>;
  autosaveWrite(content: string): Promise<unknown>;
  autosaveRead(): Promise<AutosaveInfo>;
  autosaveAdopt(): Promise<unknown>;
  autosaveClear(): Promise<unknown>;
  closeApp(): Promise<unknown>;
  onCloseRequested(cb: () => void): () => void;
  saveTextFile(opts: { defaultName: string; content: string; filters?: { name: string; extensions: string[] }[] }): Promise<SaveResult>;
  getSettings(): Promise<SettingsInfo>;
  setLocations(loc: Locations): Promise<TaskResult>;
  pickFolder(defaultPath?: string): Promise<string | null>;
  freeSpace(path: string): Promise<{ ok: true; bytes: number } | { ok: false; error: string }>;
  installEnv(): Promise<TaskResult>;
  cancelEnv(): Promise<unknown>;
  startRender(opts: { code: string; quality: Quality }): Promise<RenderResult>;
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
