import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('invoiceApi', {
  getAppInfo: () => ipcRenderer.invoke('app:info')
})
