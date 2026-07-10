export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { NextRequest } from 'next/server'
import ExcelJS from 'exceljs'
import { createClient } from '@/lib/supabase/server'
import { loadPermissionsForRole, checkPermission } from '@/lib/permissions'
import { styleWorksheetHeader, addBandedRows, addSheetTitle, workbookToResponse } from '@/lib/excelExport'
import { RECEPTIONIST_COUPON_CREATION_ENABLED } from '@/lib/featureFlags'

function formatDate(dateStr: string | null): string {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const offerId = params.id
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

  const perms = await loadPermissionsForRole(profileData.user_role)
  if (!checkPermission(perms, profileData.user_role, 'page:reporting', 'view')) {
    return new Response('Forbidden', { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const dateFrom = searchParams.get('dateFrom') || ''
  const dateTo = searchParams.get('dateTo') || ''

  const { data: offer } = await supabase
    .from('offers')
    .select('id, title, commission_amount, loyalty_brand, referral_brand')
    .eq('id', offerId)
    .single()

  if (!offer) {
    return new Response('Offer not found', { status: 404 })
  }

  let couponQuery = supabase
    .from('coupons')
    .select('id, coupon_type, stage, issue_date, advisor_name, advisor_code, issued_by, status')
    .eq('offer_id', offerId)
  if (dateFrom) couponQuery = couponQuery.gte('issue_date', dateFrom)
  if (dateTo) couponQuery = couponQuery.lte('issue_date', dateTo)
  const { data: coupons } = await couponQuery

  let apptQuery = supabase
    .from('appointments')
    .select('id, coupon_id, status, appointment_date')
    .eq('offer_id', offerId)
  if (dateFrom) apptQuery = apptQuery.gte('appointment_date', dateFrom)
  if (dateTo) apptQuery = apptQuery.lte('appointment_date', dateTo)
  const { data: appointments } = await apptQuery

  const { data: offerStages } = await supabase
    .from('offer_stages')
    .select('stage_number, reward_label')
    .eq('offer_id', offerId)
    .order('stage_number')

  const loyaltyCoupons = (coupons || []).filter((c: any) => c.coupon_type === 'LOYALTY')
  const referralCoupons = (coupons || []).filter((c: any) => c.coupon_type === 'REFERRAL')
  const visited = (appointments || []).filter((a: any) => a.status === 'visited')
  const commission = (offer.commission_amount || 0) * visited.length

  const workbook = new ExcelJS.Workbook()

  // ── Sheet 1: KPI Summary ──
  const kpiSheet = workbook.addWorksheet('KPI Summary')
  const kpiColumns = [
    { header: 'Metric', key: 'metric', width: 36 },
    { header: 'Value', key: 'value', width: 20 },
  ]
  styleWorksheetHeader(kpiSheet, kpiColumns)
  const kpiRows = [
    { metric: 'Total Issued', value: (coupons || []).length },
    { metric: (offer.loyalty_brand || 'Loyalty') + ' Coupons', value: loyaltyCoupons.length },
    { metric: (offer.referral_brand || 'Referral') + ' Coupons', value: referralCoupons.length },
    { metric: 'Invoiced', value: visited.length },
    { metric: 'Conversion Rate', value: loyaltyCoupons.length > 0 ? ((visited.length / loyaltyCoupons.length) * 100).toFixed(1) + '%' : '—' },
    { metric: 'Appointments', value: (appointments || []).length },
    { metric: 'Commission Earned', value: 'AED ' + commission.toLocaleString() },
    ...(offerStages || []).map((s: any) => ({
      metric: 'Stage ' + s.stage_number + (s.reward_label ? ' — ' + s.reward_label : '') + ' Reached',
      value: loyaltyCoupons.filter((c: any) => (c.stage || 0) >= s.stage_number).length,
    })),
  ]
  addBandedRows(kpiSheet, kpiRows)
  addSheetTitle(kpiSheet, offer.title + ' — KPI Summary', kpiColumns.length)

  // ── Sheet 2: Advisor Leaderboard ──
  const advisorMap: Record<string, { name: string; code: string | null; issued: number; visits: number; commission: number }> = {}
  loyaltyCoupons.forEach((c: any) => {
    const key = c.issued_by || 'unknown'
    if (!advisorMap[key]) advisorMap[key] = { name: c.advisor_name || 'Unknown', code: c.advisor_code, issued: 0, visits: 0, commission: 0 }
    advisorMap[key].issued++
  })
  const referralToAdvisor: Record<string, string> = {}
  referralCoupons.forEach((c: any) => {
    if (c.issued_by) referralToAdvisor[c.id] = c.issued_by
  })
  visited.forEach((a: any) => {
    if (!a.coupon_id) return
    const advisorId = referralToAdvisor[a.coupon_id]
    if (!advisorId || !advisorMap[advisorId]) return
    advisorMap[advisorId].visits++
    advisorMap[advisorId].commission += offer.commission_amount || 0
  })
  if (advisorMap['unknown'] && advisorMap['unknown'].name === 'Unknown' && advisorMap['unknown'].visits === 0) {
    delete advisorMap['unknown']
  }
  const advisorStats = Object.values(advisorMap).sort((a, b) => b.visits - a.visits)

  const leaderboardSheet = workbook.addWorksheet('Advisor Leaderboard')
  const leaderboardColumns = [
    { header: 'Rank', key: 'rank', width: 8 },
    { header: 'Advisor', key: 'advisor', width: 22 },
    { header: 'Code', key: 'code', width: 14 },
    { header: 'Coupons Issued', key: 'issued', width: 16 },
    { header: (offer.referral_brand || 'Referral') + ' Invoiced', key: 'visits', width: 18 },
    { header: 'Commission Earned', key: 'commission', width: 18 },
  ]
  styleWorksheetHeader(leaderboardSheet, leaderboardColumns)
  const leaderboardRows = advisorStats.map((a, idx) => ({
    rank: idx + 1,
    advisor: a.name,
    code: a.code || '',
    issued: a.issued,
    visits: a.visits,
    commission: 'AED ' + a.commission.toLocaleString(),
  }))
  addBandedRows(leaderboardSheet, leaderboardRows)
  addSheetTitle(leaderboardSheet, offer.title + ' — Advisor Leaderboard', leaderboardColumns.length)

  // ── Sheets 3 & 4: Commission Splits (only if flag enabled) ──
  if (RECEPTIONIST_COUPON_CREATION_ENABLED) {
    let splitsQuery = supabase
      .from('coupon_commission_splits')
      .select('id, coupon_id, receptionist_id, advisor_code, advisor_name, total_commission_amount, receptionist_amount, advisor_amount, created_at')
      .eq('offer_id', offerId)
      .order('created_at', { ascending: false })
    const { data: rawSplits } = await splitsQuery

    let filteredSplits = rawSplits || []
    if (dateFrom) filteredSplits = filteredSplits.filter((s: any) => s.created_at && s.created_at.split('T')[0] >= dateFrom)
    if (dateTo) filteredSplits = filteredSplits.filter((s: any) => s.created_at && s.created_at.split('T')[0] <= dateTo)

    let couponMap = new Map<string, string>()
    let profileMap = new Map<string, string>()
    if (filteredSplits.length > 0) {
      const couponIds = Array.from(new Set(filteredSplits.map((s: any) => s.coupon_id)))
      const receptionistIds = Array.from(new Set(filteredSplits.map((s: any) => s.receptionist_id)))
      const [couponsRes, profilesRes] = await Promise.all([
        supabase.from('coupons').select('id, coupon_code').in('id', couponIds),
        supabase.from('profiles').select('id, full_name').in('id', receptionistIds),
      ])
      couponMap = new Map((couponsRes.data || []).map((c: any) => [c.id, c.coupon_code]))
      profileMap = new Map((profilesRes.data || []).map((p: any) => [p.id, p.full_name]))
    }

    const splitsSheet = workbook.addWorksheet('Commission Splits')
    const splitsColumns = [
      { header: 'Coupon Code', key: 'code', width: 32 },
      { header: 'Date', key: 'date', width: 14 },
      { header: 'Receptionist', key: 'receptionist', width: 20 },
      { header: 'Advisor', key: 'advisor', width: 20 },
      { header: 'Total Commission', key: 'total', width: 18 },
      { header: 'Receptionist Share', key: 'recepShare', width: 18 },
      { header: 'Advisor Share', key: 'advisorShare', width: 18 },
    ]
    styleWorksheetHeader(splitsSheet, splitsColumns)
    const splitsRows = filteredSplits.map((s: any) => ({
      code: couponMap.get(s.coupon_id) || '—',
      date: formatDate(s.created_at),
      receptionist: profileMap.get(s.receptionist_id) || '—',
      advisor: s.advisor_name + (s.advisor_code ? ` (${s.advisor_code})` : ''),
      total: 'AED ' + Number(s.total_commission_amount).toLocaleString(),
      recepShare: 'AED ' + Number(s.receptionist_amount).toLocaleString(),
      advisorShare: 'AED ' + Number(s.advisor_amount).toLocaleString(),
    }))
    addBandedRows(splitsSheet, splitsRows)
    addSheetTitle(splitsSheet, offer.title + ' — Receptionist Commission Splits', splitsColumns.length)

    // Summary sheet
    const summaryGroups: Record<string, { receptionist: string; advisor: string; count: number; recepTotal: number; advisorTotal: number }> = {}
    filteredSplits.forEach((s: any) => {
      const key = `${s.receptionist_id}_${s.advisor_code}`
      if (!summaryGroups[key]) {
        summaryGroups[key] = {
          receptionist: profileMap.get(s.receptionist_id) || '—',
          advisor: s.advisor_name + (s.advisor_code ? ` (${s.advisor_code})` : ''),
          count: 0,
          recepTotal: 0,
          advisorTotal: 0,
        }
      }
      summaryGroups[key].count++
      summaryGroups[key].recepTotal += Number(s.receptionist_amount)
      summaryGroups[key].advisorTotal += Number(s.advisor_amount)
    })
    const summaryList = Object.values(summaryGroups).sort((a, b) => b.recepTotal - a.recepTotal)

    const summarySheet = workbook.addWorksheet('Commission Split Summary')
    const summaryColumns = [
      { header: 'Receptionist', key: 'receptionist', width: 22 },
      { header: 'Advisor', key: 'advisor', width: 22 },
      { header: 'Number of Splits', key: 'count', width: 16 },
      { header: 'Total Receptionist Earnings', key: 'recepTotal', width: 22 },
      { header: 'Total Advisor Earnings', key: 'advisorTotal', width: 20 },
    ]
    styleWorksheetHeader(summarySheet, summaryColumns)
    const summaryRows = summaryList.map(s => ({
      receptionist: s.receptionist,
      advisor: s.advisor,
      count: s.count,
      recepTotal: 'AED ' + s.recepTotal.toLocaleString(),
      advisorTotal: 'AED ' + s.advisorTotal.toLocaleString(),
    }))
    addBandedRows(summarySheet, summaryRows)
    addSheetTitle(summarySheet, offer.title + ' — Commission Split Summary', summaryColumns.length)
  }

  const filename = `${offer.title.replace(/[^a-zA-Z0-9]/g, '_')}_report_${new Date().toISOString().split('T')[0]}.xlsx`
  return workbookToResponse(workbook, filename)
}
