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
  onEnvProgress: on('env:progress'), onEnvLog: on('env:log'),
  onRenderProgress: on('render:progress'), onRenderLog: on('render:log'),
});
