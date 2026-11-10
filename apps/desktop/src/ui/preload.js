'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('bridge', {
  getConfig: () => ipcRenderer.invoke('config:get'),
  setConfig: (patch) => ipcRenderer.invoke('config:set', patch),
  allowOrigin: (o) => ipcRenderer.invoke('origin:allow', o),
  blockOrigin: (o) => ipcRenderer.invoke('origin:block', o),
  removeOrigin: (o) => ipcRenderer.invoke('origin:remove', o),
  listPrinters: () => ipcRenderer.invoke('printers:list'),
  restart: () => ipcRenderer.invoke('server:restart'),
  testPrint: (p) => ipcRenderer.invoke('test:print', p),
});
