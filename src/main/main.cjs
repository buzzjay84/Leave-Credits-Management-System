const { app, BrowserWindow, dialog, ipcMain, shell, Menu } = require('electron')
const { autoUpdater } = require('electron-updater')
const path = require('path')
const fs = require('fs')
const {
  CURRENT_DBM_SALARY_CIRCULAR,
  DBM_SALARY_GUIDANCE_URL,
  findNewerDbmSalaryGuidance,
} = require('./dbmSalaryGuidance.cjs')
const {
  backupDatabase,
  cacheEmployees,
  cacheTransactions,
  closeDatabase,
  deleteEmployee,
  getPendingChanges,
  initializeDatabase,
  listEmployees,
  listTransactions,
  recordLeaveTransaction,
  resolvePendingChange,
  restoreDatabase,
  saveEmployee
} = require('./database.cjs')

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged

app.disableHardwareAcceleration()

let mainWindow
let allowWindowClose = false
let closeConfirmationOpen = false
let updateTimer
let salaryGuidanceTimer
let updateStatus = { state: 'idle', message: 'Ready to check for updates.' }
let salaryGuidanceStatus = { state: 'idle', message: 'Ready to check DBM salary-standardization releases.' }
const githubReleaseBaseUrl = 'https://github.com/depedICSDO/lcms/releases'

function publishUpdateStatus(nextStatus) {
  updateStatus = { ...updateStatus, ...nextStatus }
  mainWindow?.webContents.send('update-status', updateStatus)
}

async function checkForUpdates(manual = false) {
  if (isDev) {
    const status = { state: 'development', message: 'Updates are checked only in the installed application.' }
    if (manual) publishUpdateStatus(status)
    return status
  }
  if (['checking', 'downloading'].includes(updateStatus.state)) return updateStatus

  publishUpdateStatus({ state: 'checking', message: 'Checking GitHub for updates…' })
  try {
    await autoUpdater.checkForUpdates()
  } catch (error) {
    publishUpdateStatus({ state: 'error', message: error.message || 'Update check failed.' })
  }
  return updateStatus
}

async function checkDbmSalaryGuidance() {
  salaryGuidanceStatus = { state: 'checking', message: 'Checking official DBM salary-standardization releases…' }
  mainWindow?.webContents.send('dbm-salary-guidance-status', salaryGuidanceStatus)
  try {
    const response = await fetch(DBM_SALARY_GUIDANCE_URL, {
      headers: { 'User-Agent': `LCMS/${app.getVersion()} DBM salary-guidance checker` },
    })
    if (!response.ok) throw new Error(`DBM returned HTTP ${response.status}`)
    const newer = findNewerDbmSalaryGuidance(await response.text(), CURRENT_DBM_SALARY_CIRCULAR)
    salaryGuidanceStatus = newer
      ? {
          state: 'review',
          sourceUrl: DBM_SALARY_GUIDANCE_URL,
          message: `New official DBM salary-standardization guidance detected (NBC No. ${newer.circular}${newer.tranche ? `, ${newer.tranche} tranche` : ''}). Verify it before updating employee salaries.`,
        }
      : {
          state: 'current',
          sourceUrl: DBM_SALARY_GUIDANCE_URL,
          message: 'Official DBM check complete: NBC No. 601 remains the latest detected salary-standardization schedule.',
        }
  } catch (error) {
    salaryGuidanceStatus = {
      state: 'unavailable',
      sourceUrl: DBM_SALARY_GUIDANCE_URL,
      message: `Could not check official DBM salary-standardization releases: ${error.message}`,
    }
  }
  mainWindow?.webContents.send('dbm-salary-guidance-status', salaryGuidanceStatus)
  return salaryGuidanceStatus
}

function buildApplicationMenu() {
  const template = [
    {
      label: 'File',
      submenu: [{ role: 'quit' }]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
        { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' }, { role: 'forceReload' }, { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Window',
      submenu: [{ role: 'minimize' }, { role: 'close' }]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Check for Updates',
          click: () => {
            mainWindow?.webContents.send('menu:check-for-updates')
            checkForUpdates(true)
          }
        }
      ]
    }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 680,
    title: `Leave Credits Management System (LCMS) v${app.getVersion()}`,
    icon: path.join(__dirname, '../image/lcms.ico'),
    backgroundColor: '#f9f9f8',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    },
    // No frame customization — keeps native window controls
    show: false
  })

  buildApplicationMenu()

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'))
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.on('close', async event => {
    if (allowWindowClose) return
    event.preventDefault()
    if (closeConfirmationOpen) return
    closeConfirmationOpen = true
    const result = await dialog.showMessageBox(mainWindow, {
      type: 'question',
      title: 'Exit LCMS?',
      message: 'Are you sure you want to close the application?',
      detail: 'You will need to sign in again the next time LCMS starts.',
      buttons: ['Close Application', 'Cancel'],
      defaultId: 1,
      cancelId: 1,
      noLink: true
    })
    closeConfirmationOpen = false
    if (result.response === 0) {
      allowWindowClose = true
      mainWindow?.close()
    }
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })
}

app.whenReady().then(() => {
  initializeDatabase()
  createWindow()
  if (!isDev) {
    // Windows installs downloaded NSIS updates in-app. On macOS, LCMS sends the
    // user to the matching GitHub Release so they can choose the correct DMG.
    autoUpdater.autoDownload = process.platform === 'win32'
    autoUpdater.autoInstallOnAppQuit = true
    setTimeout(() => checkForUpdates(), 5000)
    updateTimer = setInterval(() => checkForUpdates(), 4 * 60 * 60 * 1000)
  }
  setTimeout(() => checkDbmSalaryGuidance(), 8000)
  salaryGuidanceTimer = setInterval(() => checkDbmSalaryGuidance(), 24 * 60 * 60 * 1000)
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('will-quit', () => {
  if (updateTimer) clearInterval(updateTimer)
  if (salaryGuidanceTimer) clearInterval(salaryGuidanceTimer)
  closeDatabase()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

// --- Auto-updater IPC ---
ipcMain.handle('check-for-updates', () => checkForUpdates(true))
ipcMain.handle('get-update-status', () => updateStatus)

autoUpdater.on('checking-for-update', () => {
  publishUpdateStatus({ state: 'checking', message: 'Checking GitHub for updates…' })
})

autoUpdater.on('update-available', async info => {
  if (process.platform === 'darwin') {
    const releaseUrl = `${githubReleaseBaseUrl}/tag/v${encodeURIComponent(info.version)}`
    publishUpdateStatus({ state: 'available', version: info.version, releaseUrl, message: `Version ${info.version} is available on GitHub.` })
    const result = await dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'LCMS Update Available',
      message: `LCMS version ${info.version} is available.`,
      detail: 'Open the GitHub Release page to download the new macOS installer.',
      buttons: ['Open GitHub Release', 'Later'],
      defaultId: 0,
      cancelId: 1,
      noLink: true
    })
    if (result.response === 0) await shell.openExternal(releaseUrl)
    return
  }

  publishUpdateStatus({ state: 'downloading', version: info.version, percent: 0, message: `Downloading version ${info.version}…` })
  mainWindow?.webContents.send('update-available', { version: info.version })
})

autoUpdater.on('update-not-available', info => {
  publishUpdateStatus({ state: 'current', version: info.version, message: 'LCMS is up to date.' })
})

autoUpdater.on('download-progress', progress => {
  const percent = Math.round(progress.percent || 0)
  publishUpdateStatus({ state: 'downloading', percent, message: `Downloading update… ${percent}%` })
})

autoUpdater.on('update-downloaded', async info => {
  publishUpdateStatus({ state: 'downloaded', version: info.version, percent: 100, message: `Version ${info.version} is ready to install.` })
  mainWindow?.webContents.send('update-downloaded', { version: info.version })
  const result = await dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: 'LCMS Update Ready',
    message: `LCMS version ${info.version} has been downloaded.`,
    detail: 'Press OK to install the update now. The application will close and restart automatically.',
    buttons: ['OK', 'Later'],
    defaultId: 0,
    cancelId: 1,
    noLink: true
  })
  if (result.response === 0) {
    allowWindowClose = true
    autoUpdater.quitAndInstall(true, true)
  }
})

autoUpdater.on('error', error => {
  publishUpdateStatus({ state: 'error', message: error.message || 'Automatic update failed.' })
})

ipcMain.handle('install-update', () => {
  allowWindowClose = true
  autoUpdater.quitAndInstall(true, true)
})
ipcMain.handle('open-update-release', () => {
  const releaseUrl = updateStatus.releaseUrl || `${githubReleaseBaseUrl}/latest`
  return shell.openExternal(releaseUrl)
})

// --- App info IPC ---
ipcMain.handle('get-app-version', () => app.getVersion())
ipcMain.handle('check-dbm-salary-guidance', () => checkDbmSalaryGuidance())
ipcMain.handle('get-dbm-salary-guidance-status', () => salaryGuidanceStatus)
ipcMain.handle('open-dbm-salary-guidance', () => shell.openExternal(DBM_SALARY_GUIDANCE_URL))

// --- Local SQLite data and backup IPC ---
ipcMain.handle('database:list-employees', (_event, options) => listEmployees(options))
ipcMain.handle('database:list-transactions', (_event, options) => listTransactions(options))
ipcMain.handle('database:save-employee', (_event, employee) => saveEmployee(employee))
ipcMain.handle('database:cache-employees', (_event, employees) => cacheEmployees(employees))
ipcMain.handle('database:cache-transactions', (_event, transactions) => cacheTransactions(transactions))
ipcMain.handle('database:delete-employee', (_event, id) => deleteEmployee(id))
ipcMain.handle('database:record-leave', (_event, payload) => {
  recordLeaveTransaction(payload.transaction, payload.employee)
  return { success: true }
})
ipcMain.handle('database:pending-changes', () => getPendingChanges())
ipcMain.handle('database:resolve-change', (_event, payload) => resolvePendingChange(payload))
ipcMain.handle('database:backup', () => backupDatabase())
ipcMain.handle('database:restore', () => restoreDatabase())

// --- Generic text-file save/open (CSV export/import, etc.) ---
ipcMain.handle('file:save-text', async (_event, { defaultFilename, content, filters }) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Save File',
    defaultPath: path.join(app.getPath('documents'), defaultFilename || 'export.csv'),
    filters: filters || [{ name: 'CSV File', extensions: ['csv'] }]
  })
  if (result.canceled || !result.filePath) return { canceled: true }
  fs.writeFileSync(result.filePath, content, 'utf-8')
  return { success: true, filePath: result.filePath }
})

ipcMain.handle('file:open-text', async (_event, { filters } = {}) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Open File',
    properties: ['openFile'],
    filters: filters || [{ name: 'CSV File', extensions: ['csv'] }]
  })
  if (result.canceled || !result.filePaths[0]) return { canceled: true }
  const content = fs.readFileSync(result.filePaths[0], 'utf-8')
  return { success: true, filePath: result.filePaths[0], content }
})
