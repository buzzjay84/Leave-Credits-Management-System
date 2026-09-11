import { createClient } from '@supabase/supabase-js'

// Use the Leave Credits Management System (LCMS) Supabase project credentials.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://nzffzlsadyfrkfvrrknk.supabase.co'
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_7tPwv3s-HnWof_H-cSYmOg_xsixjC-a'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true
  }
})
