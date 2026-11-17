import { BrowserWindow } from 'electron'
import { receiptLinesToHtml } from './printing.js'

export async function printSystem(lines, printer) {
  const owner =
    BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows().find((window) => window.isVisible())
  const window = new BrowserWindow({
    show: false,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false }
  })

  try {
    const html = receiptLinesToHtml(lines, printer)
    await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
    return await new Promise((resolve, reject) => {
      window.webContents.print(
        {
          silent: false,
          deviceName: printer.systemPrinterName || undefined,
          printBackground: true,
          margins: { marginType: 'none' }
        },
        (success, reason) => {
          if (success) {
            resolve({
              ok: true,
              message: 'Print job sent to the Windows printer. Physical output is not guaranteed.'
            })
          } else {
            reject(new Error(reason || 'Windows print job failed'))
          }
        }
      )
    })
  } finally {
    if (!window.isDestroyed()) window.destroy()
    if (owner && !owner.isDestroyed()) {
      owner.show()
      owner.focus()
    }
  }
}
