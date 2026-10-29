'use strict';

const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('api', {
  platform: process.platform,
  getLibrary: () => ipcRenderer.invoke('library:get'),
  pickFolder: () => ipcRenderer.invoke('library:pickFolder'),
  addFolder: (p) => ipcRenderer.invoke('library:addFolder', p),
  removeFolder: (p) => ipcRenderer.invoke('library:removeFolder', p),
  rescan: (p) => ipcRenderer.invoke('library:rescan', p),
  stopScan: () => ipcRenderer.invoke('library:stopScan'),
  setFavorite: (p, on) => ipcRenderer.invoke('library:setFavorite', p, on),
  setCategory: (p, cat, sub) => ipcRenderer.invoke('library:setCategory', p, cat, sub),
  setCustom: (list) => ipcRenderer.invoke('library:setCustom', list),
  forget: (word, undo) => ipcRenderer.invoke('library:forget', word, undo),
  saveListen: (batch, final) => ipcRenderer.invoke('library:saveListen', batch, final),
  readHead: (p, bytes) => ipcRenderer.invoke('file:readHead', p, bytes),
  asset: (name) => ipcRenderer.invoke('app:asset', name),
  addRecent: (p) => ipcRenderer.invoke('library:addRecent', p),
  setSettings: (patch) => ipcRenderer.invoke('settings:set', patch),
  readFile: (p) => ipcRenderer.invoke('file:read', p),
  reveal: (p) => ipcRenderer.invoke('file:reveal', p),
  startDrag: (paths) => ipcRenderer.send('file:startDrag', paths),
  // Путь папки, которую перетащили из Проводника или Finder в окно.
  pathForFile: (file) => webUtils.getPathForFile(file),
  onScanProgress: (cb) => ipcRenderer.on('scan:progress', (_e, p) => cb(p)),
  onLibraryChanged: (cb) => ipcRenderer.on('library:changed', (_e, s) => cb(s)),
});
