export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { NextRequest } from 'next/server'
import ExcelJS from 'exceljs'
import { createClient } from '@/lib/supabase/server'
import { loadPermissionsForRole, checkPermission } from '@/lib/permissions'
import { styleWorksheetHeader, addBandedRows, addSheetTitle, workbookToResponse } from '@/lib/excelExport'

function formatDate(dateStr: string | null): string {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export async function GET(request: NextRequest) {
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
  if (!checkPermission(perms, profileData.user_role, 'page:coupons', 'view')) {
    return new Response('Forbidden', { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const filterType = searchParams.get('type')
  const filterStatus = searchParams.get('status')
  const filterOffer = searchParams.get('offer')
  const filterDateFrom = searchParams.get('dateFrom')
  const filterDateTo = searchParams.get('dateTo')

  const isAdvisor = profileData.user_role === 'SERVICE_ADVISOR' ||
    profileData.user_role === 'BMW_SERVICE_ADVISOR' ||
    profileData.user_role === 'RECEPTIONIST'

  let query = supabase
    .from('coupons')
    .select('coupon_code, coupon_type, offer_title, plate_combined_string, advisor_name, mobile_number, issue_date, expiry_date, status, stage, issued_by, offers(loyalty_brand, referral_brand)')
    .order('issue_date', { ascending: false })

  if (isAdvisor) {
    query = query.eq('issued_by', user.id)
  }
  if (filterType && filterType !== 'all') {
    query = query.eq('coupon_type', filterType)
  }
  if (filterStatus && filterStatus !== 'all') {
    query = query.eq('status', filterStatus)
  }
  if (filterOffer && filterOffer !== 'all') {
    query = query.eq('offer_id', filterOffer)
  }
  if (filterDateFrom) {
    query = query.gte('issue_date', filterDateFrom)
  }
  if (filterDateTo) {
    query = query.lte('issue_date', filterDateTo)
  }

  const { data: coupons, error } = await query

  if (error) {
    return new Response('Failed to fetch coupons', { status: 500 })
  }

  const workbook = new ExcelJS.Workbook()
  const worksheet = workbook.addWorksheet('Coupons')

  const columns = [
    { header: 'Coupon Code', key: 'code', width: 32 },
    { header: 'Type', key: 'type', width: 12 },
    { header: 'Brand', key: 'brand', width: 16 },
    { header: 'Offer', key: 'offer', width: 24 },
    { header: 'Plate', key: 'plate', width: 16 },
    { header: 'Advisor', key: 'advisor', width: 20 },
    { header: 'Mobile', key: 'mobile', width: 16 },
    { header: 'Issue Date', key: 'issueDate', width: 14 },
    { header: 'Expiry Date', key: 'expiryDate', width: 14 },
    { header: 'Status', key: 'status', width: 12 },
    { header: 'Stage', key: 'stage', width: 10 },
  ]

  styleWorksheetHeader(worksheet, columns)

  const rows = (coupons || []).map((c: any) => ({
    code: c.coupon_code,
    type: c.coupon_type === 'LOYALTY' ? 'Loyalty' : 'Referral',
    brand: c.coupon_type === 'LOYALTY' ? (c.offers?.loyalty_brand || 'Loyalty') : (c.offers?.referral_brand || 'Referral'),
    offer: c.offer_title || '',
    plate: c.plate_combined_string || '',
    advisor: c.advisor_name || '',
    mobile: c.mobile_number ? '971' + c.mobile_number : '',
    issueDate: formatDate(c.issue_date),
    expiryDate: formatDate(c.expiry_date),
    status: c.status || '',
    stage: c.stage ?? 0,
  }))

  addBandedRows(worksheet, rows)
  addSheetTitle(worksheet, 'AutoVersa Coupons Export', columns.length)

  const filename = `coupons_export_${new Date().toISOString().split('T')[0]}.xlsx`
  return workbookToResponse(workbook, filename)
}
