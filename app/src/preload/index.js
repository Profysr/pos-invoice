import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('invoiceApi', {
  getAppInfo: () => ipcRenderer.invoke('app:info'),
  getBootstrap: () => ipcRenderer.invoke('invoice:bootstrap'),
  getCompany: () => ipcRenderer.invoke('company:get'),
  saveCompany: (values) => ipcRenderer.invoke('company:save', values),
  chooseLogo: () => ipcRenderer.invoke('logo:choose'),
  getPrinter: () => ipcRenderer.invoke('printer:get'),
  savePrinter: (values) => ipcRenderer.invoke('printer:save', values),
  testPrinter: (values) => ipcRenderer.invoke('printer:test', values),
  listSystemPrinters: () => ipcRenderer.invoke('printer:list-system'),
  listInvoices: (options) => ipcRenderer.invoke('invoice:list', options),
  getInvoice: (id) => ipcRenderer.invoke('invoice:get', id),
  deleteInvoice: (id) => ipcRenderer.invoke('invoice:delete', id),
  printInvoice: (payload) => ipcRenderer.invoke('invoice:print', payload)
})
