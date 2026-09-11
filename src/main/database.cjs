const { app, dialog } = require('electron')
const fs = require('fs')
const path = require('path')
const Database = require('better-sqlite3')

// Keep this legacy internal ID and filename stable so existing LCMS backups and
// installations remain compatible after the product-title rename.
const APP_DATABASE_ID = 'leave-credits-system'
const DATABASE_FILENAME = 'leave-credits.sqlite'

let db
let databasePath

function serialize(value) {
  return JSON.stringify(value)
}

function deserialize(value) {
  return JSON.parse(value)
}

function openDatabase(filePath = databasePath) {
  const connection = new Database(filePath)
  connection.pragma('journal_mode = WAL')
  connection.pragma('foreign_keys = ON')
  connection.pragma('busy_timeout = 5000')
  return connection
}

function migrate(connection) {
  connection.exec(`
    CREATE TABLE IF NOT EXISTS app_metadata (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS employees (
      id TEXT PRIMARY KEY,
      school_id TEXT NOT NULL,
      last_name TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL,
      payload TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_local_employees_school
      ON employees (school_id, last_name);

    CREATE TABLE IF NOT EXISTS leave_transactions (
      id TEXT PRIMARY KEY,
      employee_id TEXT NOT NULL,
      school_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      payload TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_local_transactions_employee
      ON leave_transactions (employee_id, created_at);

    CREATE TABLE IF NOT EXISTS sync_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_type TEXT NOT NULL CHECK (entity_type IN ('employee', 'transaction')),
      entity_id TEXT NOT NULL,
      operation TEXT NOT NULL CHECK (operation IN ('upsert', 'delete', 'insert')),
      payload TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_sync_queue_created
      ON sync_queue (created_at, id);
  `)

  connection.prepare(`
    INSERT INTO app_metadata (key, value) VALUES ('app_id', ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(APP_DATABASE_ID)

  connection.prepare(`
    INSERT INTO app_metadata (key, value) VALUES ('schema_version', '1')
    ON CONFLICT(key) DO NOTHING
  `).run()
}

function initializeDatabase() {
  databasePath = path.join(app.getPath('userData'), DATABASE_FILENAME)
  db = openDatabase(databasePath)
  migrate(db)
  return databasePath
}

function closeDatabase() {
  if (db?.open) db.close()
  db = undefined
}

function requireDatabase() {
  if (!db?.open) throw new Error('Local database is not available.')
  return db
}

function queueChange(connection, entityType, entityId, operation, payload) {
  if (entityType === 'employee') {
    connection.prepare(`
      DELETE FROM sync_queue WHERE entity_type = 'employee' AND entity_id = ?
    `).run(entityId)
  }

  connection.prepare(`
    INSERT INTO sync_queue (entity_type, entity_id, operation, payload)
    VALUES (?, ?, ?, ?)
  `).run(entityType, entityId, operation, payload ? serialize(payload) : null)
}

function writeEmployee(connection, employee, shouldQueue) {
  connection.prepare(`
    INSERT INTO employees (id, school_id, last_name, updated_at, payload)
    VALUES (@id, @school_id, @last_name, @updated_at, @payload)
    ON CONFLICT(id) DO UPDATE SET
      school_id = excluded.school_id,
      last_name = excluded.last_name,
      updated_at = excluded.updated_at,
      payload = excluded.payload
  `).run({
    id: employee.id,
    school_id: employee.school_id || 'DEFAULT',
    last_name: employee.last_name || '',
    updated_at: employee.updated_at || new Date().toISOString(),
    payload: serialize(employee)
  })

  if (shouldQueue) queueChange(connection, 'employee', employee.id, 'upsert', employee)
}

function listEmployees({ schoolId } = {}) {
  const connection = requireDatabase()
  const rows = schoolId
    ? connection.prepare('SELECT payload FROM employees WHERE school_id = ? ORDER BY last_name').all(schoolId)
    : connection.prepare('SELECT payload FROM employees ORDER BY last_name').all()
  return rows.map(row => deserialize(row.payload))
}

function saveEmployee(employee, shouldQueue = true) {
  const connection = requireDatabase()
  connection.transaction(() => writeEmployee(connection, employee, shouldQueue))()
  return employee
}

function cacheEmployees({ employees, schoolId }) {
  const connection = requireDatabase()
  connection.transaction((records, scopeSchoolId) => {
    const remoteIds = new Set(records.map(employee => employee.id))
    const pendingIds = new Set(connection.prepare(`
      SELECT entity_id FROM sync_queue WHERE entity_type = 'employee'
    `).all().map(row => row.entity_id))
    const localRows = scopeSchoolId
      ? connection.prepare('SELECT id FROM employees WHERE school_id = ?').all(scopeSchoolId)
      : connection.prepare('SELECT id FROM employees').all()

    for (const row of localRows) {
      if (!remoteIds.has(row.id) && !pendingIds.has(row.id)) {
        connection.prepare('DELETE FROM employees WHERE id = ?').run(row.id)
      }
    }
    for (const employee of records) {
      if (!pendingIds.has(employee.id)) writeEmployee(connection, employee, false)
    }
  })(employees, schoolId)
  return employees.length
}

function cacheTransactions({ transactions, schoolId }) {
  const connection = requireDatabase()
  connection.transaction((records, scopeSchoolId) => {
    const remoteIds = new Set(records.map(transaction => transaction.id))
    const pendingIds = new Set(connection.prepare(`
      SELECT entity_id FROM sync_queue WHERE entity_type = 'transaction'
    `).all().map(row => row.entity_id))
    const localRows = scopeSchoolId
      ? connection.prepare('SELECT id FROM leave_transactions WHERE school_id = ?').all(scopeSchoolId)
      : connection.prepare('SELECT id FROM leave_transactions').all()

    for (const row of localRows) {
      if (!remoteIds.has(row.id) && !pendingIds.has(row.id)) {
        connection.prepare('DELETE FROM leave_transactions WHERE id = ?').run(row.id)
      }
    }

    const statement = connection.prepare(`
      INSERT INTO leave_transactions (id, employee_id, school_id, created_at, payload)
      VALUES (@id, @employee_id, @school_id, @created_at, @payload)
      ON CONFLICT(id) DO UPDATE SET payload = excluded.payload
    `)
    for (const transaction of records) {
      if (pendingIds.has(transaction.id)) continue
      statement.run({
        id: transaction.id,
        employee_id: transaction.employee_id,
        school_id: transaction.school_id || 'DEFAULT',
        created_at: transaction.created_at || new Date().toISOString(),
        payload: serialize(transaction)
      })
    }
  })(transactions, schoolId)
  return transactions.length
}

function listTransactions({ schoolId } = {}) {
  const connection = requireDatabase()
  const rows = schoolId
    ? connection.prepare('SELECT payload FROM leave_transactions WHERE school_id = ? ORDER BY created_at DESC').all(schoolId)
    : connection.prepare('SELECT payload FROM leave_transactions ORDER BY created_at DESC').all()
  return rows.map(row => deserialize(row.payload))
}

function deleteEmployee(id, shouldQueue = true) {
  const connection = requireDatabase()
  connection.transaction(() => {
    connection.prepare('DELETE FROM employees WHERE id = ?').run(id)
    if (shouldQueue) queueChange(connection, 'employee', id, 'delete', null)
  })()
}

function recordLeaveTransaction(transaction, employee) {
  const connection = requireDatabase()
  connection.transaction(() => {
    writeEmployee(connection, employee, true)
    connection.prepare(`
      INSERT INTO leave_transactions (id, employee_id, school_id, created_at, payload)
      VALUES (@id, @employee_id, @school_id, @created_at, @payload)
      ON CONFLICT(id) DO UPDATE SET payload = excluded.payload
    `).run({
      id: transaction.id,
      employee_id: transaction.employee_id,
      school_id: transaction.school_id || 'DEFAULT',
      created_at: transaction.created_at || new Date().toISOString(),
      payload: serialize(transaction)
    })
    queueChange(connection, 'transaction', transaction.id, 'insert', transaction)
  })()
}

function getPendingChanges() {
  return requireDatabase().prepare(`
    SELECT id, entity_type, entity_id, operation, payload, created_at
    FROM sync_queue ORDER BY id
  `).all().map(row => ({
    ...row,
    payload: row.payload ? deserialize(row.payload) : null
  }))
}

function resolvePendingChange({ queueId, entity }) {
  const connection = requireDatabase()
  connection.transaction(() => {
    if (entity) {
      if (entity.type === 'employee') writeEmployee(connection, entity.data, false)
      if (entity.type === 'transaction') {
        connection.prepare(`
          INSERT INTO leave_transactions (id, employee_id, school_id, created_at, payload)
          VALUES (@id, @employee_id, @school_id, @created_at, @payload)
          ON CONFLICT(id) DO UPDATE SET payload = excluded.payload
        `).run({
          id: entity.data.id,
          employee_id: entity.data.employee_id,
          school_id: entity.data.school_id || 'DEFAULT',
          created_at: entity.data.created_at || new Date().toISOString(),
          payload: serialize(entity.data)
        })
      }
    }
    connection.prepare('DELETE FROM sync_queue WHERE id = ?').run(queueId)
  })()
}

function validateBackup(filePath) {
  let candidate
  try {
    candidate = new Database(filePath, { readonly: true, fileMustExist: true })
    const integrity = candidate.pragma('integrity_check', { simple: true })
    const metadata = candidate.prepare("SELECT value FROM app_metadata WHERE key = 'app_id'").get()
    if (integrity !== 'ok' || metadata?.value !== APP_DATABASE_ID) {
      throw new Error('The selected file is not a valid Leave Credits Management System (LCMS) backup.')
    }
  } finally {
    candidate?.close()
  }
}

function removeDatabaseSidecars(filePath) {
  for (const suffix of ['-wal', '-shm']) {
    const sidecar = `${filePath}${suffix}`
    if (fs.existsSync(sidecar)) fs.rmSync(sidecar)
  }
}

async function backupDatabase() {
  const connection = requireDatabase()
  const stamp = new Date().toISOString().slice(0, 10)
  const result = await dialog.showSaveDialog({
    title: 'Back Up LCMS Database',
    defaultPath: path.join(app.getPath('documents'), `LCMS Backup ${stamp}.sqlite`),
    filters: [{ name: 'SQLite Database', extensions: ['sqlite', 'db'] }]
  })
  if (result.canceled || !result.filePath) return { canceled: true }
  if (path.resolve(result.filePath) === path.resolve(databasePath)) {
    throw new Error('Choose a backup location other than the active database.')
  }

  connection.pragma('wal_checkpoint(PASSIVE)')
  await connection.backup(result.filePath)
  validateBackup(result.filePath)
  return { success: true, filePath: result.filePath }
}

async function restoreDatabase() {
  requireDatabase()
  const result = await dialog.showOpenDialog({
    title: 'Restore LCMS Database',
    properties: ['openFile'],
    filters: [{ name: 'SQLite Database', extensions: ['sqlite', 'db'] }]
  })
  if (result.canceled || !result.filePaths[0]) return { canceled: true }

  const sourcePath = result.filePaths[0]
  if (path.resolve(sourcePath) === path.resolve(databasePath)) {
    throw new Error('Select a backup file other than the active database.')
  }
  validateBackup(sourcePath)

  const backupDirectory = path.join(app.getPath('userData'), 'backups')
  fs.mkdirSync(backupDirectory, { recursive: true })
  const safetyPath = path.join(backupDirectory, `pre-restore-${Date.now()}.sqlite`)

  closeDatabase()
  try {
    fs.copyFileSync(databasePath, safetyPath)
    removeDatabaseSidecars(databasePath)
    fs.copyFileSync(sourcePath, databasePath)
    const restored = openDatabase(databasePath)
    validateBackup(databasePath)
    restored.close()
  } catch (error) {
    removeDatabaseSidecars(databasePath)
    if (fs.existsSync(safetyPath)) fs.copyFileSync(safetyPath, databasePath)
    db = openDatabase(databasePath)
    throw error
  }

  setTimeout(() => {
    app.relaunch()
    app.exit(0)
  }, 500)

  return { success: true, safetyPath, restarting: true }
}

module.exports = {
  initializeDatabase,
  closeDatabase,
  listEmployees,
  saveEmployee,
  cacheEmployees,
  cacheTransactions,
  listTransactions,
  deleteEmployee,
  recordLeaveTransaction,
  getPendingChanges,
  resolvePendingChange,
  backupDatabase,
  restoreDatabase
}
