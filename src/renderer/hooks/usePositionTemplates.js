import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/utils/supabase'
import { useAuth } from './useAuth'
import { BLANK_POSITION_TEMPLATE } from '@/utils/appointmentDefaults'

// Reusable position-description content for the CS Form 33-B appointment
// paper, keyed by position title so filling the same position again
// auto-loads what HRMO entered last time.
export function usePositionTemplates() {
  const { user } = useAuth()
  const [templates, setTemplates] = useState({}) // { [position_title]: fields }
  const [loading, setLoading] = useState(false)

  const fetchTemplates = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase.from('leave_position_templates').select('position_title, fields')
    if (!error) setTemplates(Object.fromEntries((data || []).map(row => [row.position_title, { ...BLANK_POSITION_TEMPLATE, ...row.fields }])))
    setLoading(false)
  }, [])

  useEffect(() => { fetchTemplates() }, [fetchTemplates])

  function templateFor(positionTitle) {
    return templates[positionTitle] || BLANK_POSITION_TEMPLATE
  }

  async function saveTemplate(positionTitle, fields) {
    const { error } = await supabase.from('leave_position_templates').upsert({
      position_title: positionTitle,
      fields,
      updated_by: user?.username || null,
      updated_at: new Date().toISOString(),
    })
    if (error) return { success: false, error: error.message }
    setTemplates(current => ({ ...current, [positionTitle]: fields }))
    return { success: true }
  }

  return { templates, loading, templateFor, saveTemplate, refetch: fetchTemplates }
}
