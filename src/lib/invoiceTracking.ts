import { createClient } from '@/lib/supabase/client'
import type { Database, Tables } from '@/lib/database.types'
import type { SupabaseClient } from '@supabase/supabase-js'

export type ExtendedDatabase = Omit<Database, 'public'> & {
  public: Omit<Database['public'], 'Functions'> & {
    Functions: Database['public']['Functions'] & {
      get_advisor_leaderboard: {
        Args: Record<string, never>
        Returns: {
          advisor_name: string
          invoices_count: number
          coupons_count: number
          score: number
        }[]
      }
    }
  }
}

export interface MissingDaysResult {
  missingDays: string[]
  needsBaseline: boolean
}

export interface AdvisorMissingStatus {
  advisor_code: string
  full_name: string
  needsBaseline: boolean
  missingDays: string[]
}

export interface DailyInvoiceEntry {
  advisorCode: string
  invoiceDate: string
  invoiceCount: number
}

export interface LeaderboardRow {
  advisor_name: string
  invoices_count: number
  coupons_count: number
  score: number
}

// Helper to get local date components in a safe way (avoid timezone shifts)
function getLocalToday(): Date {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function formatLocalDate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function parseLocalDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number)
  return new Date(year, month - 1, day)
}

/**
 * Returns YYYY-MM-DD strings for all working days (excludes Sundays)
 * from the day after the advisor's last entry up to yesterday.
 * If no entries exist and no baseline exists for the current month, flags needsBaseline: true.
 */
export async function getMissingWorkingDays(advisorCode: string): Promise<MissingDaysResult> {
  const supabase = createClient()
  const today = getLocalToday()
  const currentMonthStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1)

  // 1. Check if baseline exists for this month
  const { data: baseline, error: baselineError } = await supabase
    .from('advisor_monthly_baseline')
    .select('id')
    .eq('advisor_code', advisorCode)
    .eq('month', currentMonthStr)
    .maybeSingle()

  if (baselineError) throw baselineError

  // 2. Get last entry in advisor_daily_invoices for this advisor
  const { data: lastInvoice, error: invoiceError } = await supabase
    .from('advisor_daily_invoices')
    .select('invoice_date')
    .eq('advisor_code', advisorCode)
    .order('invoice_date', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (invoiceError) throw invoiceError

  const hasEntries = !!lastInvoice
  const hasBaseline = !!baseline
  const needsBaseline = !hasEntries && !hasBaseline

  // Calculate start date of missing days checking window
  let startDate: Date
  if (hasEntries) {
    const lastDate = parseLocalDate(lastInvoice.invoice_date)
    startDate = new Date(lastDate.getFullYear(), lastDate.getMonth(), lastDate.getDate() + 1)
  } else {
    startDate = new Date(today.getFullYear(), today.getMonth(), 1)
  }

  const missingDays: string[] = []
  const current = new Date(startDate)
  while (current <= yesterday) {
    if (current.getDay() !== 0) { // Exclude Sundays
      missingDays.push(formatLocalDate(current))
    }
    current.setDate(current.getDate() + 1)
  }

  return {
    missingDays,
    needsBaseline,
  }
}

/**
 * Checks missing working days and baseline needs for all active service advisors.
 */
export async function getAllAdvisorsMissingStatus(): Promise<AdvisorMissingStatus[]> {
  const supabase = createClient()

  // Get active advisors
  const { data: advisors, error } = await supabase
    .from('profiles')
    .select('advisor_code, full_name')
    .in('user_role', ['SERVICE_ADVISOR', 'BMW_SERVICE_ADVISOR'])
    .eq('is_active', true)
    .order('full_name')

  if (error) throw error
  if (!advisors) return []

  const validAdvisors = advisors.filter(a => !!a.advisor_code) as { advisor_code: string; full_name: string | null }[]

  // Call getMissingWorkingDays concurrently for efficiency
  const statuses = await Promise.all(
    validAdvisors.map(async (advisor) => {
      const { missingDays, needsBaseline } = await getMissingWorkingDays(advisor.advisor_code)
      return {
        advisor_code: advisor.advisor_code,
        full_name: advisor.full_name || 'Unknown Advisor',
        needsBaseline,
        missingDays,
      }
    })
  )

  return statuses
}

/**
 * Inserts a monthly baseline row. Rejects if a baseline already exists for advisor + month combination.
 */
export async function submitBaseline(
  advisorCode: string,
  month: string,
  baselineCount: number,
  setBy: string
): Promise<{ data: Tables<'advisor_monthly_baseline'>[] | null; error: Error | null }> {
  const supabase = createClient()

  // Format month to YYYY-MM-01 if YYYY-MM is provided since month is a DATE column
  const dbMonth = month.length === 7 ? `${month}-01` : month

  // Check if exists first to avoid upsert or constraint violations silently failing/throwing
  const { data: existing, error: checkError } = await supabase
    .from('advisor_monthly_baseline')
    .select('id')
    .eq('advisor_code', advisorCode)
    .eq('month', dbMonth)
    .maybeSingle()

  if (checkError) return { data: null, error: new Error(checkError.message) }
  if (existing) {
    return { data: null, error: new Error(`Baseline count already set for advisor ${advisorCode} for ${month}`) }
  }

  // Resolve advisor's profile id to populate the profile_id field
  const { data: advisorProfile, error: profileErr } = await supabase
    .from('profiles')
    .select('id')
    .eq('advisor_code', advisorCode)
    .maybeSingle()

  if (profileErr) return { data: null, error: new Error(profileErr.message) }

  const insertRow = {
    advisor_code: advisorCode,
    month: dbMonth,
    baseline_count: baselineCount,
    set_by: setBy,
    profile_id: advisorProfile?.id || null,
  }

  const { data, error } = await supabase
    .from('advisor_monthly_baseline')
    .insert(insertRow)
    .select()

  if (error) return { data: null, error: new Error(error.message) }
  return { data, error: null }
}

/**
 * Bulk upserts daily invoice counts on conflict of (advisor_code, invoice_date).
 */
export async function submitDailyInvoices(
  entries: DailyInvoiceEntry[],
  enteredBy: string
): Promise<{ data: Tables<'advisor_daily_invoices'>[] | null; error: Error | null }> {
  const supabase = createClient()
  if (entries.length === 0) return { data: [], error: null }

  // Get unique advisor codes from input entries
  const uniqueCodes = Array.from(new Set(entries.map(e => e.advisorCode)))

  // Resolve profiles to get profile IDs for these advisors
  const { data: profiles, error: profileErr } = await supabase
    .from('profiles')
    .select('id, advisor_code')
    .in('advisor_code', uniqueCodes)

  if (profileErr) return { data: null, error: new Error(profileErr.message) }

  const profileMap: Record<string, string> = {}
  profiles?.forEach(p => {
    if (p.advisor_code) {
      profileMap[p.advisor_code] = p.id
    }
  })

  // Build upsert rows matching table columns exactly
  const upsertRows = entries.map(e => ({
    advisor_code: e.advisorCode,
    invoice_date: e.invoiceDate,
    invoice_count: e.invoiceCount,
    entered_by: enteredBy,
    profile_id: profileMap[e.advisorCode] || null,
  }))

  const { data, error } = await supabase
    .from('advisor_daily_invoices')
    .upsert(upsertRows, { onConflict: 'advisor_code,invoice_date' })
    .select()

  if (error) return { data: null, error: new Error(error.message) }
  return { data, error: null }
}

/**
 * Invokes get_advisor_leaderboard database RPC, returning rows sorted by score descending.
 */
export async function getLeaderboard(): Promise<LeaderboardRow[]> {
  const supabase = createClient() as unknown as SupabaseClient<ExtendedDatabase>

  const { data, error } = await supabase.rpc('get_advisor_leaderboard')

  if (error) throw new Error(error.message)
  return data || []
}
