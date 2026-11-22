import { BrowserWindow } from 'electron'

/**
 * Print an already-rendered HTML receipt to a Windows system printer.
 *
 * @param {string} html - complete HTML document string
 * @param {object} printer - printer profile (systemPrinterName used for device)
 * @param {object} options - { silent?: boolean }
 */
export async function printSystem(html, printer, options = {}) {
  // silent: true skips the Windows print dialog (used by the Test button).
  const { silent = false } = options
  const owner =
    BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows().find((window) => window.isVisible())
  const window = new BrowserWindow({
    show: false,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false }
  })

  try {
    await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
    return await new Promise((resolve, reject) => {
      window.webContents.print(
        {
          silent,
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
