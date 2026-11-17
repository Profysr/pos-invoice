import { app, BrowserWindow, ipcMain } from 'electron'
import { join } from 'node:path'
import icon from '../../resources/icon.png?asset'
import { createDatabaseStore, initializeUserData } from './database.js'

let database

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  mainWindow.webContents.on('will-navigate', (event) => event.preventDefault())

  mainWindow.once('ready-to-show', () => mainWindow.show())

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  if (process.env.INVOICE_APP_SMOKE_TEST === '1') {
    mainWindow.webContents.once('did-finish-load', () => {
      console.log(`SMOKE_TEST_OK node=${process.versions.node}`)
      app.quit()
    })
  }
}

app
  .whenReady()
  .then(() => {
    app.setAppUserModelId('com.invoicegenerator.desktop')
    const paths = initializeUserData(app.getPath('userData'))
    database = createDatabaseStore(paths.database)

    ipcMain.handle('app:info', () => ({
      version: app.getVersion(),
      nodeVersion: process.versions.node,
      platform: process.platform,
      databaseVersion: database.getVersion()
    }))

    createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })
  .catch((error) => {
    console.error('APP_START_FAILED', error)
    app.quit()
  })

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('will-quit', () => {
  database?.close()
})
