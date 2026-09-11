import { supabase } from './supabase'

function api() {
  return window.electronAPI
}

export function hasLocalDatabase() {
  return typeof window !== 'undefined' && Boolean(api()?.listLocalEmployees)
}

export async function listLocalEmployees(user) {
  if (!hasLocalDatabase()) return []
  return api().listLocalEmployees({
    schoolId: user?.role === 'aoii' ? user.school_id : undefined
  })
}

export async function listLocalTransactions(user) {
  if (!hasLocalDatabase() || !api()?.listLocalTransactions) return []
  return api().listLocalTransactions({
    schoolId: user?.role === 'aoii' ? user.school_id : undefined
  })
}

export async function cacheLocalEmployees(employees, user) {
  if (!hasLocalDatabase()) return
  await api().cacheLocalEmployees({
    employees,
    schoolId: user?.role === 'aoii' ? user.school_id : undefined
  })
}

export async function cacheLocalTransactions(transactions, user) {
  if (!hasLocalDatabase()) return
  await api().cacheLocalTransactions({
    transactions,
    schoolId: user?.role === 'aoii' ? user.school_id : undefined
  })
}

export async function saveLocalEmployee(employee) {
  if (!hasLocalDatabase()) return
  await api().saveLocalEmployee(employee)
}

export async function deleteLocalEmployee(id) {
  if (!hasLocalDatabase()) return
  await api().deleteLocalEmployee(id)
}

export async function recordLocalLeave(transaction, employee) {
  if (!hasLocalDatabase()) return
  await api().recordLocalLeave({ transaction, employee })
}

const SYNC_BATCH_SIZE = 200

export async function syncPendingChanges() {
  if (!hasLocalDatabase()) return { synced: 0, pending: 0 }

  // Deliberately do not gate this on navigator.onLine — Electron/Chromium's
  // connectivity detection can report offline even with a working connection,
  // which previously caused this to silently no-op (and misreport pending: 0,
  // masking queued changes from callers) while edits sat unsynced forever.
  // Each request below already fails gracefully and stays queued on error.
  const changes = await api().getPendingChanges()
  let synced = 0

  // Employee upserts are the bulk case (e.g. a mass roster import) — push them
  // in batched requests instead of one network round-trip per record, which
  // would otherwise take minutes for anything past a few dozen changes.
  const employeeUpserts = changes.filter(c => c.entity_type === 'employee' && c.operation === 'upsert')
  const otherChanges = changes.filter(c => !(c.entity_type === 'employee' && c.operation === 'upsert'))

  for (let i = 0; i < employeeUpserts.length; i += SYNC_BATCH_SIZE) {
    const batch = employeeUpserts.slice(i, i + SYNC_BATCH_SIZE)
    const payloads = batch.map(change => {
      const { cto_credits: _localCtoCredits, leave_transactions: _localTransactions, ...employeePayload } = change.payload
      return employeePayload
    })
    try {
      const { data, error } = await supabase.from('leave_employees').upsert(payloads, { onConflict: 'id' }).select()
      if (error) throw error
      const dataById = new Map((data || []).map(row => [row.id, row]))
      for (const change of batch) {
        try {
          await api().resolvePendingChange({ queueId: change.id, entity: { type: 'employee', data: dataById.get(change.payload.id) } })
          synced += 1
        } catch {
          // Keep this one queued for the next synchronization.
        }
      }
    } catch {
      // Keep the whole batch queued for the next online synchronization.
    }
  }

  for (const change of otherChanges) {
    try {
      let entity
      if (change.entity_type === 'employee' && change.operation === 'delete') {
        const { error } = await supabase.from('leave_employees').delete().eq('id', change.entity_id)
        if (error) throw error
      } else if (change.entity_type === 'transaction' && change.operation === 'insert') {
        const { data, error } = await supabase
          .from('leave_transactions')
          .insert(change.payload)
          .select()
          .single()
        if (error && error.code !== '23505') throw error
        if (data) entity = { type: 'transaction', data }
      }

      await api().resolvePendingChange({ queueId: change.id, entity })
      synced += 1
    } catch {
      // Keep failed operations queued for the next online synchronization.
    }
  }

  return { synced, pending: changes.length - synced }
}

export function createLocalId() {
  return crypto.randomUUID()
}
