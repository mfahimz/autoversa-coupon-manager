export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import ExcelJS from 'exceljs'
import { createClient } from '@/lib/supabase/server'
import { loadPermissionsForRole, checkPermission } from '@/lib/permissions'
import { styleWorksheetHeader, addBandedRows, addSheetTitle, workbookToResponse } from '@/lib/excelExport'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return new Response('Unauthorized', { status: 401 })
  }

  const { data: profileData } = await supabase
    .from('profiles')
    .select('user_role, is_active')
    .eq('id', user.id)
    .single()

  if (!profileData || profileData.is_active === false) {
    return new Response('Unauthorized', { status: 401 })
  }

  const EXPORT_ALLOWED_ROLES = ['ADMIN', 'ASSISTANT_GENERAL_MANAGER', 'CEO']
  if (!EXPORT_ALLOWED_ROLES.includes(profileData.user_role)) {
    return new Response('Forbidden', { status: 403 })
  }

  const perms = await loadPermissionsForRole(profileData.user_role)
  if (!checkPermission(perms, profileData.user_role, 'page:dashboard', 'view')) {
    return new Response('Forbidden', { status: 403 })
  }

  const { data: leaderboardData, error } = await supabase.rpc('get_advisor_leaderboard')

  if (error) {
    return new Response('Failed to fetch leaderboard', { status: 500 })
  }

  const sorted = [...(leaderboardData || [])]
    .filter((row: any) => row && typeof row === 'object')
    .sort((a: any, b: any) => (b.score ?? 0) - (a.score ?? 0))

  const workbook = new ExcelJS.Workbook()
  const worksheet = workbook.addWorksheet('Advisor Leaderboard')

  const columns = [
    { header: 'Rank', key: 'rank', width: 8 },
    { header: 'Advisor', key: 'advisor', width: 24 },
    { header: 'Advisor Code', key: 'code', width: 14 },
    { header: 'Invoices This Month', key: 'invoices', width: 18 },
    { header: 'Coupons This Month', key: 'coupons', width: 18 },
    { header: 'Score (%)', key: 'score', width: 12 },
  ]

  styleWorksheetHeader(worksheet, columns)

  const rows = sorted.map((row: any, idx: number) => ({
    rank: idx + 1,
    advisor: row.advisor_name || 'Unknown',
    code: row.advisor_code || '',
    invoices: row.invoices_this_month ?? 0,
    coupons: row.coupons_this_month ?? 0,
    score: typeof row.score === 'number' ? Number(row.score.toFixed(1)) : 0,
  }))

  addBandedRows(worksheet, rows)
  addSheetTitle(worksheet, 'AutoVersa Advisor Leaderboard', columns.length)

  const filename = `advisor_leaderboard_${new Date().toISOString().split('T')[0]}.xlsx`
  return workbookToResponse(workbook, filename)
}
