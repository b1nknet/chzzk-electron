const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('chzzk', {
  getChannels: () => ipcRenderer.invoke('get-channels'),
  saveChannels: (channels) => ipcRenderer.invoke('save-channels', channels),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  setOpacity: (opacity) => ipcRenderer.invoke('set-opacity', opacity),
  setAlwaysOnTop: (value) => ipcRenderer.invoke('set-always-on-top', value),
  fetchChannelInfo: (channelId) => ipcRenderer.invoke('fetch-channel-info', channelId),
  fetchAllChannels: (channelIds) => ipcRenderer.invoke('fetch-all-channels', channelIds),
  openChannel: (channelId) => ipcRenderer.invoke('open-channel', channelId),
  closeApp: () => ipcRenderer.send('close-app'),
  minimizeApp: () => ipcRenderer.send('minimize-app'),
});
