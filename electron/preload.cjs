const { contextBridge, ipcRenderer } = require('electron');
const call = (channel) => (...args) => ipcRenderer.invoke(channel, ...args);
const on = (channel) => (cb) => {
  const fn = (_e, payload) => cb(payload);
  ipcRenderer.on(channel, fn);
  return () => ipcRenderer.removeListener(channel, fn);
};
contextBridge.exposeInMainWorld('manimBlocks', {
  saveTextFile: call('file:save-text'),
  getSettings: call('settings:get'), setLocations: call('settings:set-locations'),
  pickFolder: call('dialog:pick-folder'), freeSpace: call('disk:free'),
  installEnv: call('env:install'), cancelEnv: call('env:cancel'),
  startRender: call('render:start'), cancelRender: call('render:cancel'),
  openVideo: call('video:open'), showVideo: call('video:show'), exportVideo: call('video:export'),
  saveProject: call('project:save'), saveProjectAs: call('project:save-as'), openProject: call('project:open'),
  openRecent: call('project:open-recent'), commitOpen: call('project:commit-open'), newProject: call('project:new'),
  recentProjects: call('project:recent'), setDirty: call('project:set-dirty'),
  autosaveWrite: call('autosave:write'), autosaveRead: call('autosave:read'), autosaveAdopt: call('autosave:adopt'), autosaveClear: call('autosave:clear'),
  openPending: call('project:open-pending'), onOpenRequested: on('app:open-requested'),
  setPrefs: call('prefs:set'), installLatex: call('latex:install'),
  getUpdateState: call('update:state'), checkUpdates: call('update:check'), downloadUpdate: call('update:download'),
  installUpdate: call('update:install'), remindLater: call('update:remind'), openReleaseNotes: call('update:open-notes'),
  onUpdateState: on('update:state'),
  closeApp: call('app:close'), onCloseRequested: on('app:close-requested'),
  onEnvProgress: on('env:progress'), onEnvLog: on('env:log'),
  onRenderProgress: on('render:progress'), onRenderLog: on('render:log'),
});
