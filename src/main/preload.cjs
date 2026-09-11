const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  // App
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  checkDbmSalaryGuidance: () => ipcRenderer.invoke('check-dbm-salary-guidance'),
  getDbmSalaryGuidanceStatus: () => ipcRenderer.invoke('get-dbm-salary-guidance-status'),
  openDbmSalaryGuidance: () => ipcRenderer.invoke('open-dbm-salary-guidance'),
  onDbmSalaryGuidanceStatus: (cb) => ipcRenderer.on('dbm-salary-guidance-status', (_event, payload) => cb(payload)),
  removeDbmSalaryGuidanceListeners: () => ipcRenderer.removeAllListeners('dbm-salary-guidance-status'),

  // Updates
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  getUpdateStatus: () => ipcRenderer.invoke('get-update-status'),
  installUpdate: () => ipcRenderer.invoke('install-update'),
  openUpdateRelease: () => ipcRenderer.invoke('open-update-release'),
  onUpdateAvailable: (cb) => ipcRenderer.on('update-available', (_event, payload) => cb(payload)),
  onUpdateDownloaded: (cb) => ipcRenderer.on('update-downloaded', (_event, payload) => cb(payload)),
  onUpdateStatus: (cb) => ipcRenderer.on('update-status', (_event, payload) => cb(payload)),
  onMenuCheckForUpdates: (cb) => {
    const listener = () => cb()
    ipcRenderer.on('menu:check-for-updates', listener)
    return () => ipcRenderer.removeListener('menu:check-for-updates', listener)
  },
  removeUpdateListeners: () => {
    ipcRenderer.removeAllListeners('update-available')
    ipcRenderer.removeAllListeners('update-downloaded')
    ipcRenderer.removeAllListeners('update-status')
    ipcRenderer.removeAllListeners('menu:check-for-updates')
  },

  // Local SQLite data
  listLocalEmployees: (options) => ipcRenderer.invoke('database:list-employees', options),
  listLocalTransactions: (options) => ipcRenderer.invoke('database:list-transactions', options),
  saveLocalEmployee: (employee) => ipcRenderer.invoke('database:save-employee', employee),
  cacheLocalEmployees: (employees) => ipcRenderer.invoke('database:cache-employees', employees),
  cacheLocalTransactions: (transactions) => ipcRenderer.invoke('database:cache-transactions', transactions),
  deleteLocalEmployee: (id) => ipcRenderer.invoke('database:delete-employee', id),
  recordLocalLeave: (payload) => ipcRenderer.invoke('database:record-leave', payload),
  getPendingChanges: () => ipcRenderer.invoke('database:pending-changes'),
  resolvePendingChange: (payload) => ipcRenderer.invoke('database:resolve-change', payload),

  // Whole-database migration
  backupDatabase: () => ipcRenderer.invoke('database:backup'),
  restoreDatabase: () => ipcRenderer.invoke('database:restore'),

  // Generic text-file save/open (CSV export/import, etc.)
  saveTextFile: (payload) => ipcRenderer.invoke('file:save-text', payload),
  openTextFile: (payload) => ipcRenderer.invoke('file:open-text', payload)
})
