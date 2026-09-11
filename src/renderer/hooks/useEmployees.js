import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/utils/supabase'
import {
  cacheLocalEmployees,
  cacheLocalTransactions,
  createLocalId,
  deleteLocalEmployee,
  hasLocalDatabase,
  listLocalEmployees,
  listLocalTransactions,
  saveLocalEmployee,
  syncPendingChanges
} from '@/utils/dataStore'
import { useAuth } from './useAuth'

// Supabase/PostgREST caps an unpaginated select() at 1000 rows by default —
// page through with .range() so tables past that size (like leave_employees
// now, at ~1,800 rows) still return in full.
const PAGE_SIZE = 1000

async function fetchAllRows(buildQuery) {
  let all = []
  let from = 0
  while (true) {
    const { data, error } = await buildQuery().range(from, from + PAGE_SIZE - 1)
    if (error) return { data: null, error }
    all = all.concat(data || [])
    if (!data || data.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }
  return { data: all, error: null }
}

export function useEmployees() {
  const { user } = useAuth()
  const [employees, setEmployees] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const fetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    let localRecords = []
    try {
      if (hasLocalDatabase()) {
        localRecords = await listLocalEmployees(user)
        const localTransactions = await listLocalTransactions(user)
        localRecords = localRecords.map(employee => ({
          ...employee,
          leave_transactions: localTransactions.filter(transaction => transaction.employee_id === employee.id)
        }))
        if (localRecords.length) setEmployees(localRecords)
        await syncPendingChanges()
      }

      const isAoiiScoped = user?.role === 'aoii' && user?.school_id

      // AOII sees only their school; HRMO sees all
      const { data, error: err } = await fetchAllRows(() => {
        let query = supabase.from('leave_employees').select('*').order('last_name', { ascending: true })
        if (isAoiiScoped) query = query.eq('school_id', user.school_id)
        return query
      })
      if (err) throw err
      let employeesWithCto = data || []
      const { data: ctoRows, error: ctoError } = await fetchAllRows(() =>
        supabase.from('leave_cto_credits').select('*').order('expires_on', { ascending: true })
      )
      if (!ctoError) {
        employeesWithCto = employeesWithCto.map(employee => ({
          ...employee,
          cto_credits: (ctoRows || []).filter(credit => credit.employee_id === employee.id)
        }))
      }
      const { data: transactions, error: transactionError } = await fetchAllRows(() => {
        let transactionQuery = supabase.from('leave_transactions').select('*').order('created_at', { ascending: false })
        if (isAoiiScoped) transactionQuery = transactionQuery.eq('school_id', user.school_id)
        return transactionQuery
      })
      if (!transactionError) {
        employeesWithCto = employeesWithCto.map(employee => ({
          ...employee,
          leave_transactions: (transactions || []).filter(transaction => transaction.employee_id === employee.id)
        }))
      }
      if (hasLocalDatabase()) {
        await cacheLocalEmployees(employeesWithCto, user)
        if (!transactionError) await cacheLocalTransactions(transactions || [], user)
        const cachedEmployees = await listLocalEmployees(user)
        const cachedTransactions = await listLocalTransactions(user)
        setEmployees(cachedEmployees.map(employee => ({
          ...employee,
          leave_transactions: cachedTransactions.filter(transaction => transaction.employee_id === employee.id)
        })))
      } else {
        setEmployees(employeesWithCto)
      }
    } catch (err) {
      if (!localRecords.length) setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => { if (user) fetch() }, [user, fetch])

  useEffect(() => {
    if (!user) return
    let refreshTimer
    window.addEventListener('online', fetch)
    window.addEventListener('lcms:personnel-updated', fetch)
    window.addEventListener('focus', fetch)
    const channel = supabase.channel(`personnel-refresh-${crypto.randomUUID()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leave_employees' }, () => {
        clearTimeout(refreshTimer)
        refreshTimer = setTimeout(fetch, 500)
      }).subscribe()
    // Poll while visible as a fallback when Realtime is not enabled on the table.
    const interval = setInterval(() => { if (document.visibilityState === 'visible') fetch() }, 60000)
    return () => {
      window.removeEventListener('online', fetch)
      window.removeEventListener('lcms:personnel-updated', fetch)
      window.removeEventListener('focus', fetch)
      clearTimeout(refreshTimer)
      clearInterval(interval)
      supabase.removeChannel(channel)
    }
  }, [fetch, user])

  async function addEmployee(emp) {
    const now = new Date().toISOString()
    const localEmployee = {
      ...emp,
      id: emp.id || createLocalId(),
      school_id: emp.school_id || user?.school_id || 'DEFAULT',
      created_at: emp.created_at || now,
      updated_at: now
    }

    if (hasLocalDatabase()) {
      await saveLocalEmployee(localEmployee)
      setEmployees(prev => [...prev, localEmployee].sort((a, b) => a.last_name.localeCompare(b.last_name)))
      const sync = await syncPendingChanges()
      return { success: true, data: localEmployee, pendingSync: sync.pending > 0 }
    }

    const { data, error } = await supabase
      .from('leave_employees')
      .insert([localEmployee])
      .select()
      .single()
    if (error) return { success: false, error: error.message }
    setEmployees(prev => [...prev, data].sort((a, b) => a.last_name.localeCompare(b.last_name)))
    return { success: true, data }
  }

  async function updateEmployee(id, updates) {
    const current = employees.find(employee => employee.id === id)
    const localEmployee = { ...current, ...updates, id, updated_at: new Date().toISOString() }

    if (hasLocalDatabase()) {
      await saveLocalEmployee(localEmployee)
      setEmployees(prev => prev.map(employee => employee.id === id ? localEmployee : employee))
      const sync = await syncPendingChanges()
      return { success: true, data: localEmployee, pendingSync: sync.pending > 0 }
    }

    const { data, error } = await supabase
      .from('leave_employees')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()
    if (error) return { success: false, error: error.message }
    setEmployees(prev => prev.map(e => e.id === id ? data : e))
    return { success: true, data }
  }

  async function deleteEmployee(id) {
    if (hasLocalDatabase()) {
      await deleteLocalEmployee(id)
      setEmployees(prev => prev.filter(employee => employee.id !== id))
      const sync = await syncPendingChanges()
      return { success: true, pendingSync: sync.pending > 0 }
    }

    const { error } = await supabase
      .from('leave_employees')
      .delete()
      .eq('id', id)
    if (error) return { success: false, error: error.message }
    setEmployees(prev => prev.filter(e => e.id !== id))
    return { success: true }
  }

  return { employees, loading, error, fetch, addEmployee, updateEmployee, deleteEmployee }
}
