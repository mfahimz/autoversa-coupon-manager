'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState, Fragment } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Navbar from '@/components/layout/Navbar'
import Breadcrumb from '@/components/layout/Breadcrumb'
import PageSkeleton from '@/components/layout/PageSkeleton'
import { loadPermissionsForRole, checkPermission } from '@/lib/permissions'
import { toast } from 'sonner'
import ExportButton from '@/components/shared/ExportButton'


interface Coupon {
  id: string
  coupon_code: string
  coupon_type: string | null
  identifier_type: string | null
  plate_combined_string: string | null
  mobile_number: string | null
  car_model: string | null
  offer_title: string | null
  offer_id: string | null
  customer_name: string | null
  advisor_name: string | null
  issue_date: string | null
  expiry_date: string | null
  status: string | null
  redemption_count: number | null
  stage: number | null
  parent_coupon_id: string | null
  loyalty_brand: string | null
  referral_brand: string | null
  issued_by: string | null
}

interface AppointmentStatus {
  coupon_id: string | null
  status: string
}

interface TemplateData {
  id: string
  file_url: string
  image_width: number | null
  image_height: number | null
  font_family: string | null
  text_color: string | null
  coupon_type: string
  template_variable_positions: {
    variable_key: string
    x_coordinate: number
    y_coordinate: number
    font_size: number | null
    font_color: string | null
    font_weight: string | null
  }[]
}

interface OfferStage {
  stage_number: number
  bmw_visits_required: number
  reward_label: string
  reward_description: string | null
}

interface VerifyResult {
  coupon: any
  stages: OfferStage[]
  offerBrands: { loyalty_brand: string | null; referral_brand: string | null }
}

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  ACTIVE: { bg: '#dcfce7', color: '#16a34a' },
  REDEEMED: { bg: '#ede9fe', color: '#7c3aed' },
  EXPIRED: { bg: '#f3f4f6', color: '#666666' },
  CANCELLED: { bg: '#fee2e2', color: '#D0021B' },
}

type KpiTab = 'total' | 'redeemed' | 'not_redeemed' | 'appt_pending' | 'appt_visited'
type PageTab = 'my_coupons' | 'verify'

const KPI_LABELS: Record<KpiTab, string> = {
  total: 'Total Issued',
  redeemed: 'Redeemed',
  not_redeemed: 'Not Redeemed',
  appt_pending: 'Appointment Pending',
  appt_visited: 'Appointment Invoiced',
}

function resolveVariableValues(coupon: any): Record<string, string> {
  return {
    LOYALTY_COUPON_CODE: coupon.coupon_type === 'LOYALTY' ? coupon.coupon_code : '',
    REFERRAL_COUPON_CODE: coupon.coupon_type === 'REFERRAL' ? coupon.coupon_code : '',
    LOYALTY_EXPIRY_DATE: coupon.coupon_type === 'LOYALTY' ? formatDate(coupon.expiry_date) : '',
    REFERRAL_EXPIRY_DATE: coupon.coupon_type === 'REFERRAL' ? formatDate(coupon.expiry_date) : '',
    ADVISOR_NAME: coupon.advisor_name || '',
    OFFER_TITLE: coupon.offer_title || '',
    PLATE_NUMBER: coupon.plate_combined_string || '',
    MOBILE_NUMBER: coupon.mobile_number ? '+971' + coupon.mobile_number : '',
  }
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export default function CouponsPage() {
  const router = useRouter()
  const supabase = createClient()

  const [coupons, setCoupons] = useState<Coupon[]>([])
  const [creatorNames, setCreatorNames] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [kpiTab, setKpiTab] = useState<KpiTab>('total')
  const [profile, setProfile] = useState<any>(null)
  const [pageTab, setPageTab] = useState<PageTab>('my_coupons')

  // appointment statuses keyed by coupon_id
  const [apptStatuses, setApptStatuses] = useState<Record<string, string>>({})
  // max stages per offer_id
  const [offerMaxStages, setOfferMaxStages] = useState<Record<string, number>>({})
  // visited appointment count per referral coupon_id
  const [referralVisitCounts, setReferralVisitCounts] = useState<Record<string, number>>({})

  // Download dialog
  const [downloadDialog, setDownloadDialog] = useState<Coupon | null>(null)
  const [downloading, setDownloading] = useState<'LOYALTY' | 'REFERRAL' | null>(null)
  const [dlTemplates, setDlTemplates] = useState<Record<string, TemplateData>>({})
  const [dlTemplatesLoading, setDlTemplatesLoading] = useState(false)

  // Verify tab state
  const [verifyInput, setVerifyInput] = useState('')
  const [verifyMode, setVerifyMode] = useState<'code' | 'plate'>('code')
  const [verifyLoading, setVerifyLoading] = useState(false)
  const [verifyResult, setVerifyResult] = useState<VerifyResult | null>(null)
  const [verifyError, setVerifyError] = useState<string | null>(null)
  const [redeemLoading, setRedeemLoading] = useState(false)
  const [redeemDone, setRedeemDone] = useState(false)

  // CHANGE 1: state variables
  const [filterType, setFilterType] = useState<'all' | 'LOYALTY' | 'REFERRAL'>('all')
  const [filterStatus, setFilterStatus] = useState<'all' | 'ACTIVE' | 'REDEEMED' | 'EXPIRED' | 'CANCELLED'>('all')
  const [filterOffer, setFilterOffer] = useState<string>('all')
  const [filterDateFrom, setFilterDateFrom] = useState<string>('')
  const [filterDateTo, setFilterDateTo] = useState<string>('')
  const [currentPage, setCurrentPage] = useState(1)
  const [cancelConfirmId, setCancelConfirmId] = useState<string | null>(null)

  const PAGE_SIZE = 25

  // ADMIN always bypasses — canVerify includes ADMIN
  const canVerify = profile?.user_role === 'ADMIN' ||
    profile?.user_role === 'SERVICE_ADVISOR' ||
    profile?.user_role === 'BMW_SERVICE_ADVISOR'

  useEffect(() => { loadData() }, [])

  // Reset to page 1 whenever filters change
  useEffect(() => { setCurrentPage(1) }, [search, filterType, filterStatus, filterOffer, filterDateFrom, filterDateTo, kpiTab])

  function showToast(message: string, type: 'success' | 'error' = 'success') {
    if (type === 'success') toast.success(message)
    else toast.error(message)
  }

  async function loadData() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    const { data: profileData } = await supabase
      .from('profiles')
      .select('user_role, full_name, id, is_active')
      .eq('id', user.id)
      .single()

    setProfile(profileData)

    if (!profileData) { router.push('/login'); return }

    if (profileData.is_active === false) {
      await supabase.auth.signOut()
      router.push('/login')
      return
    }

    const perms = await loadPermissionsForRole(profileData.user_role)
    if (!checkPermission(perms, profileData.user_role, 'page:coupons', 'view')) {
      router.push('/dashboard')
      return
    }

    const isAdvisor = profileData?.user_role === 'SERVICE_ADVISOR' ||
      profileData?.user_role === 'BMW_SERVICE_ADVISOR' ||
      profileData?.user_role === 'RECEPTIONIST'

    let query = supabase
      .from('coupons')
      .select('id, coupon_code, coupon_type, identifier_type, plate_combined_string, mobile_number, car_model, offer_title, offer_id, customer_name, advisor_name, issue_date, expiry_date, status, redemption_count, stage, parent_coupon_id, issued_by, offers(loyalty_brand, referral_brand)')
      .order('created_at', { ascending: false })

    if (isAdvisor) {
      query = query.eq('issued_by', user.id)
    }

    const { data: couponData } = await query
    if (!couponData) { setLoading(false); return }

    const mappedCoupons = couponData.map((c: any) => ({
      ...c,
      loyalty_brand: c.offers?.loyalty_brand || null,
      referral_brand: c.offers?.referral_brand || null,
    }))
    setCoupons(mappedCoupons)

    const couponIds = mappedCoupons.map(c => c.id)
    const referralIds = mappedCoupons.filter(c => c.coupon_type === 'REFERRAL').map(c => c.id)
    const offerIds = Array.from(new Set(mappedCoupons.map(c => c.offer_id).filter(Boolean))) as string[]
    const issuerIds = Array.from(new Set(mappedCoupons.map(c => c.issued_by).filter(Boolean))) as string[]

    if (issuerIds.length > 0) {
      const { data: issuerProfiles } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', issuerIds)
      if (issuerProfiles) {
        const map: Record<string, string> = {}
        issuerProfiles.forEach((p: any) => { map[p.id] = p.full_name || 'Unknown' })
        setCreatorNames(map)
      }
    }

    const [apptResult, visitedResult, stagesResult] = await Promise.all([
      couponIds.length > 0
        ? supabase.from('appointments').select('coupon_id, status').in('coupon_id', couponIds).not('status', 'eq', 'cancelled')
        : Promise.resolve({ data: [] as any }),
      referralIds.length > 0
        ? supabase.from('appointments').select('coupon_id').in('coupon_id', referralIds).eq('status', 'visited')
        : Promise.resolve({ data: [] as any }),
      offerIds.length > 0
        ? supabase.from('offer_stages').select('offer_id, stage_number').in('offer_id', offerIds)
        : Promise.resolve({ data: [] as any })
    ])

    const { data: apptData } = apptResult
    const { data: visitedData } = visitedResult
    const { data: stagesData } = stagesResult

    if (apptData) {
      const map: Record<string, string> = {}
      apptData.forEach((a: AppointmentStatus) => {
        if (a.coupon_id) map[a.coupon_id] = a.status
      })
      setApptStatuses(map)
    }

    if (visitedData) {
      const counts: Record<string, number> = {}
      visitedData.forEach((a: any) => {
        counts[a.coupon_id] = (counts[a.coupon_id] || 0) + 1
      })
      setReferralVisitCounts(counts)
    }

    if (stagesData) {
      const map: Record<string, number> = {}
      stagesData.forEach((s: any) => {
        if (!map[s.offer_id] || s.stage_number > map[s.offer_id]) {
          map[s.offer_id] = s.stage_number
        }
      })
      setOfferMaxStages(map)
    }

    setLoading(false)
  }

  // ── KPI filtering ──────────────────────────────────────────────────────────

  function getKpiCount(tab: KpiTab): number {
    switch (tab) {
      case 'total': return coupons.length
      case 'redeemed': return coupons.filter(c => c.status === 'REDEEMED').length
      case 'not_redeemed': return coupons.filter(c => c.status === 'ACTIVE' && !apptStatuses[c.id]).length
      case 'appt_pending': return coupons.filter(c => {
        const s = apptStatuses[c.id]
        return s && s !== 'visited' && s !== 'cancelled'
      }).length
      case 'appt_visited': return coupons.filter(c => apptStatuses[c.id] === 'visited').length
    }
  }

  function filterByKpi(coupon: Coupon): boolean {
    const apptStatus = apptStatuses[coupon.id]
    switch (kpiTab) {
      case 'total': return true
      case 'redeemed': return coupon.status === 'REDEEMED'
      case 'not_redeemed': return coupon.status === 'ACTIVE' && !apptStatus
      case 'appt_pending': return !!apptStatus && apptStatus !== 'visited' && apptStatus !== 'cancelled'
      case 'appt_visited': return apptStatus === 'visited'
    }
  }

  // CHANGE 3: Update the filtered logic to apply all filters
  const filtered = coupons.filter(c => {
    const matchSearch = !search.trim() ||
      c.coupon_code.toLowerCase().includes(search.toLowerCase()) ||
      (c.offer_title || '').toLowerCase().includes(search.toLowerCase()) ||
      c.advisor_name?.toLowerCase().includes(search.toLowerCase()) ||
      c.plate_combined_string?.toLowerCase().includes(search.toLowerCase()) ||
      (c.mobile_number || '').includes(search)
    const matchType = filterType === 'all' || c.coupon_type === filterType
    const matchStatus = filterStatus === 'all' || c.status === filterStatus
    const matchOffer = filterOffer === 'all' || c.offer_id === filterOffer
    const matchDateFrom = !filterDateFrom || (c.issue_date && c.issue_date >= filterDateFrom)
    const matchDateTo = !filterDateTo || (c.issue_date && c.issue_date <= filterDateTo)
    return matchSearch && matchType && matchStatus && matchOffer && matchDateFrom && matchDateTo && filterByKpi(c)
  })

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const paginated = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  // Derive unique offers from loaded coupons for offer filter dropdown
  const offerOptions = Array.from(
    new Map(coupons.filter(c => c.offer_id && c.offer_title).map(c => [c.offer_id, c.offer_title])).entries()
  ).map(([id, title]) => ({ id: id!, title: title! }))

  // ── Download dialog ────────────────────────────────────────────────────────

  async function openDownloadDialog(coupon: Coupon) {
    setDownloadDialog(coupon)
    setDlTemplates({})
    if (!coupon.offer_id) return
    setDlTemplatesLoading(true)
    const { data } = await supabase
      .from('templates')
      .select('id, file_url, image_width, image_height, font_family, text_color, coupon_type, template_variable_positions(*)')
      .eq('offer_id', coupon.offer_id)
      .eq('is_active', true)
    if (data) {
      const map: Record<string, TemplateData> = {}
      data.forEach((t: any) => { map[t.coupon_type === 'M' ? 'LOYALTY' : t.coupon_type === 'B' ? 'REFERRAL' : t.coupon_type] = t })
      setDlTemplates(map)
    }
    setDlTemplatesLoading(false)
  }

  async function downloadCouponJPG(coupon: Coupon, templateType: 'LOYALTY' | 'REFERRAL') {
    const template = dlTemplates[templateType]
    if (!template?.file_url) {
      showToast('No template configured for this offer.', 'error')
      return
    }

    setDownloading(templateType)

    let couponForValues: any = coupon
    if (coupon.coupon_type !== templateType) {
      if (templateType === 'REFERRAL' && coupon.coupon_type === 'LOYALTY') {
        const { data } = await supabase
          .from('coupons').select('coupon_type, coupon_code, expiry_date, advisor_name, offer_title, plate_combined_string, mobile_number').eq('parent_coupon_id', coupon.id).single()
        if (data) {
          couponForValues = {
            ...data,
            loyalty_brand: coupon.loyalty_brand,
            referral_brand: coupon.referral_brand,
          }
        }
      } else if (templateType === 'LOYALTY' && coupon.coupon_type === 'REFERRAL') {
        if (coupon.parent_coupon_id) {
          const { data } = await supabase
            .from('coupons').select('coupon_type, coupon_code, expiry_date, advisor_name, offer_title, plate_combined_string, mobile_number').eq('id', coupon.parent_coupon_id).single()
          if (data) {
            couponForValues = {
              ...data,
              loyalty_brand: coupon.loyalty_brand,
              referral_brand: coupon.referral_brand,
            }
          }
        }
      }
    }

    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.src = template.file_url

    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = template.image_width || img.naturalWidth
      canvas.height = template.image_height || img.naturalHeight
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

      const values = resolveVariableValues(couponForValues)
      const positions = template.template_variable_positions || []
      
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      positions.forEach(pos => {
        const value = values[pos.variable_key] || ''
        if (!value) return
        const x = (pos.x_coordinate / 100) * canvas.width
        const yCenter = (pos.y_coordinate / 100) * canvas.height
        const fontSizePx = (pos.font_size && pos.font_size <= 20)
          ? Math.round((pos.font_size / 100) * canvas.height)
          : (pos.font_size || 24)
        ctx.font = `${pos.font_weight || 'normal'} ${fontSizePx}px ${template.font_family || 'Arial'}`
        ctx.fillStyle = pos.font_color || template.text_color || '#000000'
        ctx.fillText(value, x, yCenter)
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
      })

      const link = document.createElement('a')
      link.download = `${couponForValues.coupon_code}.jpg`
      link.href = canvas.toDataURL('image/jpeg', 0.95)
      link.click()
      setDownloading(null)
    }

    img.onerror = () => {
      showToast('Failed to load template image.', 'error')
      setDownloading(null)
    }
  }

  // ── Verify tab ─────────────────────────────────────────────────────────────

  async function handleVerify() {
    const input = verifyInput.trim()
    if (!input) return

    setVerifyLoading(true)
    setVerifyResult(null)
    setVerifyError(null)
    setRedeemDone(false)

    let query = supabase
      .from('coupons')
      .select('id, coupon_code, offer_title, plate_combined_string, issue_date, expiry_date, advisor_name, issued_by, status, stage, offer_id, offers(loyalty_brand, referral_brand)')
      .eq('coupon_type', 'LOYALTY')

    if (verifyMode === 'code') {
      query = query.ilike('coupon_code', input)
    } else {
      query = query.ilike('plate_combined_string', `%${input}%`)
    }

    const { data: couponData, error } = await query.limit(1).single()

    if (error || !couponData) {
      setVerifyError('No loyalty coupon found matching that ' + (verifyMode === 'code' ? 'coupon code' : 'plate number') + '.')
      setVerifyLoading(false)
      return
    }

    let stages: OfferStage[] = []
    if (couponData.offer_id) {
      const { data: stagesData } = await supabase
        .from('offer_stages')
        .select('stage_number, bmw_visits_required, reward_label, reward_description')
        .eq('offer_id', couponData.offer_id)
        .order('stage_number', { ascending: true })
      if (stagesData) stages = stagesData
    }

    let issuerName = '—'
    if ((couponData as any).issued_by) {
      const { data: issuerProfile } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', (couponData as any).issued_by)
        .single()
      issuerName = issuerProfile?.full_name || '—'
    }

    setVerifyResult({
      coupon: { ...couponData, issuer_name: issuerName },
      stages,
      offerBrands: {
        loyalty_brand: couponData.offers?.loyalty_brand || null,
        referral_brand: couponData.offers?.referral_brand || null,
      },
    })
    setVerifyLoading(false)
  }

  async function handleMarkRedeemed() {
    if (!verifyResult) return
    setRedeemLoading(true)
    const { error } = await supabase
      .from('coupons')
      .update({ status: 'REDEEMED' })
      .eq('id', verifyResult.coupon.id)

    if (error) {
      showToast('Failed to mark as redeemed.', 'error')
    } else {
      setVerifyResult(prev => prev ? { ...prev, coupon: { ...prev.coupon, status: 'REDEEMED' } } : prev)
      setRedeemDone(true)
      showToast('Coupon marked as redeemed.')
    }
    setRedeemLoading(false)
  }

  function getEligibilityVerdict(coupon: any, stages: OfferStage[]) {
    const now = new Date()
    const expiry = new Date(coupon.expiry_date)
    if (coupon.status === 'CANCELLED') return { label: 'Cancelled', color: '#D0021B', bg: '#fee2e2', eligible: false }
    if (coupon.status === 'REDEEMED') return { label: 'Already Redeemed', color: '#7c3aed', bg: '#ede9fe', eligible: false }
    if (expiry < now) return { label: 'Expired', color: '#666', bg: '#f3f4f6', eligible: false }
    if (coupon.status === 'ACTIVE' && (coupon.stage ?? 0) === 0) return { label: 'Valid — No Tier Reached Yet', color: '#f59e0b', bg: '#fef3c7', eligible: false }
    if (coupon.status === 'ACTIVE' && (coupon.stage ?? 0) >= 1) return { label: 'Eligible for Redemption', color: '#16a34a', bg: '#dcfce7', eligible: true }
    return { label: 'Not Valid', color: '#666', bg: '#f3f4f6', eligible: false }
  }

  if (loading) return <PageSkeleton layout="stats-table" />

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#F7F7F7', paddingTop: '16px' }}>
      <style>{`
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
        @keyframes slideIn { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        .coupon-row:hover { background-color: #FAFBFF !important; }
      `}</style>


      <Navbar />

      <main style={{ padding: '0 32px 48px' }}>
        <Breadcrumb items={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Coupons' }]} />

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <div>
            <h1 style={{ fontSize: '22px', fontWeight: '700', color: '#1A1A1A', margin: 0 }}>Coupons</h1>
            <p style={{ color: '#666', fontSize: '14px', marginTop: '4px' }}>
              {pageTab === 'my_coupons'
                ? `${filtered.length} of ${coupons.length} coupons`
                : 'Verify loyalty coupon eligibility'}
            </p>
          </div>
          {pageTab === 'my_coupons' && (
            <div style={{ display: 'flex', gap: '10px' }}>
              <ExportButton
                userRole={profile?.user_role}
                exportUrl={`/api/export/coupons?${new URLSearchParams({
                  type: filterType,
                  status: filterStatus,
                  offer: filterOffer,
                  dateFrom: filterDateFrom,
                  dateTo: filterDateTo,
                }).toString()}`}
              />
              <button
                onClick={() => router.push('/create-coupon')}
                style={{ padding: '10px 20px', backgroundColor: '#0074BD', color: '#FFFFFF', border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}
              >
                + Create Coupon
              </button>
            </div>
          )}
        </div>

        {/* Page tab switcher */}
        {canVerify && (
          <div style={{ display: 'flex', gap: '4px', marginBottom: '24px', backgroundColor: '#FFFFFF', padding: '6px', borderRadius: '12px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', width: 'fit-content' }}>
            {([
              { key: 'my_coupons', label: 'My Coupons' },
              { key: 'verify', label: '🔍 Verify Loyalty Coupon' },
            ] as { key: PageTab; label: string }[]).map(t => (
              <button
                key={t.key}
                onClick={() => setPageTab(t.key)}
                style={{
                  padding: '8px 18px', border: 'none', borderRadius: '8px',
                  fontSize: '13px', fontWeight: '600', cursor: 'pointer',
                  backgroundColor: pageTab === t.key ? '#162860' : 'transparent',
                  color: pageTab === t.key ? '#FFFFFF' : '#666',
                  transition: 'all 0.15s',
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}

        {/* ── MY COUPONS TAB ── */}
        {pageTab === 'my_coupons' && (
          <>
            {/* KPI tabs */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px', marginBottom: '24px' }}>
              {(['total', 'redeemed', 'not_redeemed', 'appt_pending', 'appt_visited'] as KpiTab[]).map(tab => {
                const isActive = kpiTab === tab
                const count = getKpiCount(tab)
                const accentColors: Record<KpiTab, string> = {
                  total: '#162860',
                  redeemed: '#7c3aed',
                  not_redeemed: '#0074BD',
                  appt_pending: '#f59e0b',
                  appt_visited: '#16a34a',
                }
                const accent = accentColors[tab]
                return (
                  <div
                    key={tab}
                    onClick={() => setKpiTab(tab)}
                    style={{
                      backgroundColor: '#FFFFFF', borderRadius: '14px', padding: '16px 20px',
                      boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
                      borderLeft: `4px solid ${isActive ? accent : '#E0E0E0'}`,
                      cursor: 'pointer', transition: 'all 0.15s',
                      outline: isActive ? `2px solid ${accent}20` : 'none',
                    }}
                  >
                    <p style={{ fontSize: '11px', color: isActive ? accent : '#666', fontWeight: '600', margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      {KPI_LABELS[tab]}
                    </p>
                    <p style={{ fontSize: '26px', fontWeight: '700', color: isActive ? accent : '#1A1A1A', margin: 0, lineHeight: 1 }}>{count}</p>
                  </div>
                )
              })}
            </div>

            {/* Search */}
            <div style={{ marginBottom: '16px' }}>
              <input
                value={search}
                onChange={e => {
                  let val = e.target.value.replace(/[<>]/g, '');
                  if (val.length > 100) val = val.slice(0, 100);
                  setSearch(val);
                }}
                placeholder="Search by code, offer, advisor, plate, mobile…"
                style={{
                  width: '100%', padding: '10px 14px', fontSize: '14px',
                  border: '1.5px solid #E0E0E0', borderRadius: '10px', outline: 'none',
                  backgroundColor: '#FFFFFF', color: '#1A1A1A', boxSizing: 'border-box',
                }}
              />
            </div>

            {/* CHANGE 4: Add filter bar between search input and table */}
            <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
              
              {/* Type filter */}
              <select
                value={filterType}
                onChange={e => setFilterType(e.target.value as any)}
                style={{ padding: '8px 12px', fontSize: '13px', fontWeight: '600', border: '1.5px solid #E0E0E0', borderRadius: '8px', outline: 'none', backgroundColor: '#FFFFFF', color: '#1A1A1A', cursor: 'pointer' }}
              >
                <option value="all">All Types</option>
                <option value="LOYALTY">Loyalty</option>
                <option value="REFERRAL">Referral</option>
              </select>

              {/* Status filter */}
              <select
                value={filterStatus}
                onChange={e => setFilterStatus(e.target.value as any)}
                style={{ padding: '8px 12px', fontSize: '13px', fontWeight: '600', border: '1.5px solid #E0E0E0', borderRadius: '8px', outline: 'none', backgroundColor: '#FFFFFF', color: '#1A1A1A', cursor: 'pointer' }}
              >
                <option value="all">All Statuses</option>
                <option value="ACTIVE">Active</option>
                <option value="REDEEMED">Redeemed</option>
                <option value="EXPIRED">Expired</option>
                <option value="CANCELLED">Cancelled</option>
              </select>

              {/* Offer filter */}
              <select
                value={filterOffer}
                onChange={e => setFilterOffer(e.target.value)}
                style={{ padding: '8px 12px', fontSize: '13px', fontWeight: '600', border: '1.5px solid #E0E0E0', borderRadius: '8px', outline: 'none', backgroundColor: '#FFFFFF', color: '#1A1A1A', cursor: 'pointer', maxWidth: '220px' }}
              >
                <option value="all">All Offers</option>
                {offerOptions.map(o => (
                  <option key={o.id} value={o.id}>{o.title}</option>
                ))}
              </select>

              {/* Date from */}
              <input
                type="date"
                value={filterDateFrom}
                onChange={e => setFilterDateFrom(e.target.value)}
                style={{ padding: '8px 12px', fontSize: '13px', border: '1.5px solid #E0E0E0', borderRadius: '8px', outline: 'none', backgroundColor: '#FFFFFF', color: filterDateFrom ? '#1A1A1A' : '#999', cursor: 'pointer' }}
              />

              {/* Date to */}
              <input
                type="date"
                value={filterDateTo}
                onChange={e => setFilterDateTo(e.target.value)}
                style={{ padding: '8px 12px', fontSize: '13px', border: '1.5px solid #E0E0E0', borderRadius: '8px', outline: 'none', backgroundColor: '#FFFFFF', color: filterDateTo ? '#1A1A1A' : '#999', cursor: 'pointer' }}
              />

              {/* Clear filters button — only show if any filter is active */}
              {(filterType !== 'all' || filterStatus !== 'all' || filterOffer !== 'all' || filterDateFrom || filterDateTo) && (
                <button
                  onClick={() => { setFilterType('all'); setFilterStatus('all'); setFilterOffer('all'); setFilterDateFrom(''); setFilterDateTo('') }}
                  style={{ padding: '8px 14px', fontSize: '13px', fontWeight: '600', backgroundColor: '#F0F0F0', color: '#666', border: 'none', borderRadius: '8px', cursor: 'pointer' }}
                >
                  Clear Filters
                </button>
              )}

              <span style={{ fontSize: '12px', color: '#888', marginLeft: 'auto' }}>
                {filtered.length} result{filtered.length !== 1 ? 's' : ''}
              </span>
            </div>

            {/* Table */}
            <div style={{ backgroundColor: '#FFFFFF', borderRadius: '16px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
              <div style={{
                display: 'grid',
                gridTemplateColumns: '2.2fr 1.4fr 1.2fr 0.8fr 0.8fr 1fr 0.9fr 180px',
                padding: '12px 20px',
                backgroundColor: '#F7F7F7',
                borderBottom: '1px solid #EEEEEE',
              }}>
                {['Coupon Code', 'Offer', 'Plate', 'Type', 'Issued By', 'Issued', 'Stage / Status', 'Actions'].map(h => (
                  <span key={h} style={{ fontSize: '11px', fontWeight: '700', color: '#666', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</span>
                ))}
              </div>

              {filtered.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '64px 0', color: '#666', fontSize: '14px' }}>
                  {search || filterType !== 'all' || filterStatus !== 'all' || filterOffer !== 'all' || filterDateFrom || filterDateTo || kpiTab !== 'total' ? 'No coupons match your filters.' : 'No coupons yet. '}
                  {!search && filterType === 'all' && filterStatus === 'all' && filterOffer === 'all' && !filterDateFrom && !filterDateTo && kpiTab === 'total' && (
                    <span onClick={() => router.push('/create-coupon')} style={{ color: '#0074BD', cursor: 'pointer', fontWeight: '500' }}>
                      Create the first one →
                    </span>
                  )}
                </div>
              ) : (
                // CHANGE 5: Update table rows to use paginated instead of filtered
                paginated.map((coupon, i) => {
                  const statusStyle = STATUS_COLORS[coupon.status || 'EXPIRED'] || STATUS_COLORS.EXPIRED
                  const isExpired = coupon.expiry_date ? new Date(coupon.expiry_date) < new Date() : false
                  const apptStatus = apptStatuses[coupon.id]
                  const isLoyaltyCoupon = coupon.coupon_type === 'LOYALTY'
                  const isReferralCoupon = coupon.coupon_type === 'REFERRAL'
                  const maxStage = coupon.offer_id ? (offerMaxStages[coupon.offer_id] || 3) : 3
                  const currentStage = coupon.stage ?? 0
                  const visitCount = referralVisitCounts[coupon.id] ?? 0

                  return (
                    <div
                      key={coupon.id}
                      className="coupon-row"
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '2.2fr 1.4fr 1.2fr 0.8fr 0.8fr 1fr 0.9fr 180px',
                        padding: '13px 20px',
                        borderBottom: i < paginated.length - 1 ? '1px solid #F5F5F5' : 'none',
                        alignItems: 'center',
                        backgroundColor: '#FFFFFF',
                      }}
                    >
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' }}>
                          <span style={{
                            fontSize: '10px', fontWeight: '700', padding: '2px 7px',
                            backgroundColor: isLoyaltyCoupon ? '#162860' : '#0074BD',
                            color: '#FFFFFF', borderRadius: '4px', flexShrink: 0,
                          }}>
                            {isLoyaltyCoupon ? 'Loyalty' : 'Referral'}
                          </span>
                          <p style={{ fontSize: '12px', fontWeight: '700', color: '#162860', margin: 0, fontFamily: 'monospace', wordBreak: 'break-all' }}>
                            {coupon.coupon_code}
                          </p>
                        </div>
                        {coupon.car_model && (
                          <p style={{ fontSize: '11px', color: '#888', margin: 0 }}>{coupon.car_model}</p>
                        )}
                      </div>

                      <span style={{ fontSize: '12px', color: '#444' }}>{coupon.offer_title}</span>
                      <span style={{ fontSize: '12px', color: '#444', fontFamily: 'monospace' }}>{coupon.plate_combined_string || '—'}</span>

                      <span style={{
                        display: 'inline-block', fontSize: '11px', fontWeight: '600',
                        padding: '3px 8px', borderRadius: '4px',
                        backgroundColor: isLoyaltyCoupon ? '#EEF2FF' : '#E8F4FF',
                        color: isLoyaltyCoupon ? '#162860' : '#0074BD',
                        width: 'fit-content',
                      }}>
                        {isLoyaltyCoupon ? (coupon.loyalty_brand || 'Loyalty') : (coupon.referral_brand || 'Referral')}
                      </span>

                      <span style={{ fontSize: '12px', color: '#444' }}>
                        {coupon.issued_by ? (creatorNames[coupon.issued_by] || '—') : '—'}
                      </span>

                      <div>
                        <p style={{ fontSize: '12px', color: '#444', margin: 0 }}>{formatDate(coupon.issue_date)}</p>
                        <p style={{ fontSize: '11px', margin: '2px 0 0', color: isExpired && coupon.status === 'ACTIVE' ? '#D0021B' : '#888' }}>
                          Exp: {formatDate(coupon.expiry_date)}
                        </p>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <span style={{
                          display: 'inline-block', fontSize: '11px', fontWeight: '600',
                          padding: '3px 8px', borderRadius: '100px', width: 'fit-content',
                          backgroundColor: statusStyle.bg, color: statusStyle.color,
                        }}>
                          {coupon.status}
                        </span>
                        {isLoyaltyCoupon && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                            <div style={{ display: 'flex', gap: '3px' }}>
                              {Array.from({ length: maxStage }).map((_, idx) => (
                                <div key={idx} style={{
                                  width: '14px', height: '5px', borderRadius: '2px',
                                  backgroundColor: idx < currentStage ? '#0074BD' : '#E0E0E0',
                                }} />
                              ))}
                            </div>
                            <span style={{ fontSize: '10px', color: '#666', fontWeight: '600' }}>
                              {currentStage}/{maxStage}
                            </span>
                          </div>
                        )}
                        {isReferralCoupon && visitCount > 0 && (
                          <span style={{
                            display: 'inline-block', fontSize: '10px', fontWeight: '600',
                            color: '#7c3aed', backgroundColor: '#ede9fe',
                            padding: '2px 7px', borderRadius: '100px', width: 'fit-content',
                          }}>
                            Redeemed {visitCount}×
                          </span>
                        )}
                        {apptStatus && (
                          <span style={{ fontSize: '10px', fontWeight: '600', color: apptStatus === 'visited' ? '#16a34a' : '#f59e0b' }}>
                            {apptStatus === 'visited'
                              ? 'Invoiced'
                              : apptStatus === 'scheduled'
                                ? 'Appt: Scheduled'
                                : apptStatus === 'customer_not_reachable' || apptStatus === 'follow_up_confirmed'
                                  ? 'Appt: Follow-up'
                                  : 'Appt: ' + apptStatus.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())}
                          </span>
                        )}
                      </div>

                      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                        <button
                          onClick={() => openDownloadDialog(coupon)}
                          style={{
                            padding: '5px 8px', fontSize: '11px', fontWeight: '600',
                            backgroundColor: '#F0F4FF', color: '#162860',
                            border: 'none', borderRadius: '6px', cursor: 'pointer', whiteSpace: 'nowrap',
                          }}
                        >
                          JPG
                        </button>
                        {isReferralCoupon && coupon.status === 'ACTIVE' && (
                          <button
                            onClick={() => router.push(`/appointments?coupon=${encodeURIComponent(coupon.coupon_code)}`)}
                            style={{
                              padding: '5px 8px', fontSize: '11px', fontWeight: '600',
                              backgroundColor: '#E8F4FF', color: '#0074BD',
                              border: 'none', borderRadius: '6px', cursor: 'pointer', whiteSpace: 'nowrap',
                            }}
                          >
                            + Appt
                          </button>
                        )}
                        {coupon.status === 'ACTIVE' && (
                          <button
                            onClick={() => setCancelConfirmId(coupon.id)}
                            style={{ padding: '5px 8px', fontSize: '11px', fontWeight: '600', backgroundColor: '#fee2e2', color: '#D0021B', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
                          >
                            Cancel
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })
              )}
            </div>

            {/* CHANGE 6: Add pagination controls after the table closing div */}
            {totalPages > 1 && (
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', padding: '20px 0' }}>
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  style={{ padding: '7px 14px', fontSize: '13px', fontWeight: '600', border: '1.5px solid #E0E0E0', borderRadius: '8px', backgroundColor: '#FFFFFF', color: currentPage === 1 ? '#CCC' : '#162860', cursor: currentPage === 1 ? 'not-allowed' : 'pointer' }}
                >
                  ← Prev
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).filter(p => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 2).map((p, idx, arr) => (
                  <Fragment key={p}>
                    {idx > 0 && arr[idx - 1] !== p - 1 && (
                      <span style={{ color: '#888', fontSize: '13px' }}>…</span>
                    )}
                    <button
                      onClick={() => setCurrentPage(p)}
                      style={{ padding: '7px 12px', fontSize: '13px', fontWeight: '600', border: '1.5px solid', borderColor: p === currentPage ? '#0074BD' : '#E0E0E0', borderRadius: '8px', backgroundColor: p === currentPage ? '#0074BD' : '#FFFFFF', color: p === currentPage ? '#FFFFFF' : '#444', cursor: 'pointer', minWidth: '36px' }}
                    >
                      {p}
                    </button>
                  </Fragment>
                ))}
                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  style={{ padding: '7px 14px', fontSize: '13px', fontWeight: '600', border: '1.5px solid #E0E0E0', borderRadius: '8px', backgroundColor: '#FFFFFF', color: currentPage === totalPages ? '#CCC' : '#162860', cursor: currentPage === totalPages ? 'not-allowed' : 'pointer' }}
                >
                  Next →
                </button>
                <span style={{ fontSize: '12px', color: '#888', marginLeft: '8px' }}>
                  Page {currentPage} of {totalPages} · {filtered.length} total
                </span>
              </div>
            )}
          </>
        )}

        {/* ── VERIFY TAB ── */}
        {pageTab === 'verify' && (
          <div style={{ animation: 'fadeIn 0.2s ease' }}>

            <div style={{ backgroundColor: '#FFFFFF', borderRadius: '16px', padding: '28px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', marginBottom: '20px' }}>
              <p style={{ fontSize: '13px', fontWeight: '700', color: '#162860', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 20px' }}>
                Search Loyalty Coupon
              </p>

              <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                {([
                  { key: 'code', label: 'By Coupon Code' },
                  { key: 'plate', label: 'By Plate Number' },
                ] as { key: 'code' | 'plate'; label: string }[]).map(m => (
                  <button
                    key={m.key}
                    onClick={() => { setVerifyMode(m.key); setVerifyInput(''); setVerifyResult(null); setVerifyError(null); setRedeemDone(false) }}
                    style={{
                      padding: '8px 18px', border: 'none', borderRadius: '8px',
                      fontSize: '13px', fontWeight: '600', cursor: 'pointer',
                      backgroundColor: verifyMode === m.key ? '#162860' : '#F0F0F0',
                      color: verifyMode === m.key ? '#FFFFFF' : '#666',
                      transition: 'all 0.15s',
                    }}
                  >
                    {m.label}
                  </button>
                ))}
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                <input
                  value={verifyInput}
                  onChange={e => {
                    let val = e.target.value.replace(/[<>]/g, '')
                    if (val.length > 100) val = val.slice(0, 100)
                    setVerifyInput(val)
                    setVerifyResult(null)
                    setVerifyError(null)
                    setRedeemDone(false)
                  }}
                  onKeyDown={e => { if (e.key === 'Enter') handleVerify() }}
                  placeholder={verifyMode === 'code' ? 'e.g. 001_A12345_ALMARAGHI_M_ADHA12345' : 'e.g. ADHA12345 or full plate string'}
                  style={{
                    flex: 1, padding: '11px 14px', fontSize: '14px',
                    border: '1.5px solid #E0E0E0', borderRadius: '10px', outline: 'none',
                    backgroundColor: '#FFFFFF', color: '#1A1A1A', fontFamily: 'monospace',
                    boxSizing: 'border-box',
                  }}
                />
                <button
                  onClick={handleVerify}
                  disabled={!verifyInput.trim() || verifyLoading}
                  style={{
                    padding: '11px 28px', backgroundColor: verifyLoading ? '#93C5E8' : '#0074BD',
                    color: '#FFFFFF', border: 'none', borderRadius: '10px',
                    fontSize: '14px', fontWeight: '600',
                    cursor: !verifyInput.trim() || verifyLoading ? 'not-allowed' : 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {verifyLoading ? 'Searching…' : 'Verify'}
                </button>
              </div>
            </div>

            {verifyError && (
              <div style={{ backgroundColor: '#FFF0F0', border: '1px solid #FFCCCC', borderRadius: '12px', padding: '20px 24px', animation: 'fadeIn 0.2s ease' }}>
                <p style={{ fontSize: '14px', color: '#D0021B', fontWeight: '600', margin: 0 }}>Not Found</p>
                <p style={{ fontSize: '13px', color: '#888', margin: '4px 0 0' }}>{verifyError}</p>
              </div>
            )}

            {verifyResult && (() => {
              const { coupon, stages, offerBrands } = verifyResult
              const verdict = getEligibilityVerdict(coupon, stages)
              const currentStage = coupon.stage ?? 0
              const maxStage = stages.length
              const isExpired = new Date(coupon.expiry_date) < new Date()
              const loyaltyBrand = offerBrands.loyalty_brand || 'Mercedes-Benz'

              return (
                <div style={{ animation: 'fadeIn 0.25s ease' }}>

                  <div style={{
                    backgroundColor: verdict.bg, border: `1.5px solid ${verdict.color}40`,
                    borderRadius: '14px', padding: '20px 24px', marginBottom: '16px',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: verdict.color, flexShrink: 0 }} />
                      <div>
                        <p style={{ fontSize: '16px', fontWeight: '700', color: verdict.color, margin: 0 }}>{verdict.label}</p>
                        <p style={{ fontSize: '12px', color: '#666', margin: '2px 0 0' }}>
                          {loyaltyBrand} Loyalty Coupon
                        </p>
                      </div>
                    </div>
                    {verdict.eligible && !redeemDone && (
                      <button
                        onClick={handleMarkRedeemed}
                        disabled={redeemLoading}
                        style={{
                          padding: '10px 24px', backgroundColor: redeemLoading ? '#93C5E8' : '#162860',
                          color: '#FFFFFF', border: 'none', borderRadius: '10px',
                          fontSize: '14px', fontWeight: '700', cursor: redeemLoading ? 'not-allowed' : 'pointer',
                        }}
                      >
                        {redeemLoading ? 'Processing…' : 'Mark as Redeemed'}
                      </button>
                    )}
                    {redeemDone && (
                      <span style={{ fontSize: '13px', fontWeight: '600', color: '#7c3aed', backgroundColor: '#ede9fe', padding: '8px 16px', borderRadius: '8px' }}>
                        ✓ Redeemed
                      </span>
                    )}
                  </div>

                  <div style={{ backgroundColor: '#FFFFFF', borderRadius: '16px', padding: '24px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', marginBottom: '16px' }}>
                    <p style={{ fontSize: '13px', fontWeight: '700', color: '#162860', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 16px' }}>
                      Coupon Details
                    </p>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
                      {[
                        { label: 'Coupon Code', value: coupon.coupon_code, mono: true },
                        { label: 'Offer', value: coupon.offer_title },
                        { label: 'Loyalty Plate', value: coupon.plate_combined_string || '—', mono: true },
                        { label: 'Issue Date', value: formatDate(coupon.issue_date) },
                        { label: 'Expiry Date', value: formatDate(coupon.expiry_date), warn: isExpired && coupon.status === 'ACTIVE' },
                        { label: 'Issued By', value: coupon.issuer_name || '—' },
                        { label: 'Status', value: coupon.status },
                        { label: 'Referral Visits Completed', value: String(currentStage) + (maxStage ? ` of ${maxStage} stages` : '') },
                      ].map(row => (
                        <div key={row.label}>
                          <p style={{ fontSize: '11px', fontWeight: '600', color: '#999', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 4px' }}>{row.label}</p>
                          <p style={{
                            fontSize: '14px', fontWeight: '600', margin: 0,
                            color: row.warn ? '#D0021B' : '#1A1A1A',
                            fontFamily: row.mono ? 'monospace' : 'inherit',
                            wordBreak: 'break-all',
                          }}>
                            {row.value}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {stages.length > 0 && (
                    <div style={{ backgroundColor: '#FFFFFF', borderRadius: '16px', padding: '24px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                      <p style={{ fontSize: '13px', fontWeight: '700', color: '#162860', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 20px' }}>
                        Loyalty Tier Progress
                      </p>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {stages.map((stage) => {
                          const reached = currentStage >= stage.stage_number
                          const isCurrent = currentStage === stage.stage_number
                          return (
                            <div
                              key={stage.stage_number}
                              style={{
                                display: 'flex', alignItems: 'center', gap: '16px',
                                padding: '14px 16px', borderRadius: '12px',
                                backgroundColor: reached ? '#F0F7FF' : '#F7F7F7',
                                border: `1.5px solid ${isCurrent ? '#0074BD' : reached ? '#C7DCFF' : '#E0E0E0'}`,
                              }}
                            >
                              <div style={{
                                width: '32px', height: '32px', borderRadius: '50%', flexShrink: 0,
                                backgroundColor: reached ? '#0074BD' : '#E0E0E0',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                              }}>
                                {reached
                                  ? <span style={{ color: '#FFFFFF', fontSize: '14px', fontWeight: '700' }}>✓</span>
                                  : <span style={{ color: '#999', fontSize: '13px', fontWeight: '700' }}>{stage.stage_number}</span>
                                }
                              </div>
                              <div style={{ flex: 1 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                                  <p style={{ fontSize: '14px', fontWeight: '700', color: reached ? '#162860' : '#888', margin: 0 }}>
                                    {stage.reward_label}
                                  </p>
                                  {isCurrent && (
                                    <span style={{ fontSize: '10px', fontWeight: '700', backgroundColor: '#0074BD', color: '#FFFFFF', padding: '2px 8px', borderRadius: '100px' }}>
                                      CURRENT
                                    </span>
                                  )}
                                  {reached && !isCurrent && (
                                    <span style={{ fontSize: '10px', fontWeight: '700', backgroundColor: '#dcfce7', color: '#16a34a', padding: '2px 8px', borderRadius: '100px' }}>
                                      REACHED
                                    </span>
                                  )}
                                </div>
                                {stage.reward_description && (
                                  <p style={{ fontSize: '12px', color: '#888', margin: 0 }}>{stage.reward_description}</p>
                                )}
                              </div>
                              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                <p style={{ fontSize: '11px', color: '#888', margin: 0 }}>Requires</p>
                                <p style={{ fontSize: '13px', fontWeight: '700', color: reached ? '#0074BD' : '#888', margin: '2px 0 0' }}>
                                  {stage.bmw_visits_required} visit{stage.bmw_visits_required !== 1 ? 's' : ''}
                                </p>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {stages.length === 0 && (
                    <div style={{ backgroundColor: '#FFFFFF', borderRadius: '16px', padding: '24px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', textAlign: 'center', color: '#888', fontSize: '13px' }}>
                      No loyalty stages configured for this offer.
                    </div>
                  )}
                </div>
              )
            })()}
          </div>
        )}
      </main>

      {/* CHANGE 7: Add cancel confirmation modal */}
      {cancelConfirmId && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, backgroundColor: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
          <div style={{ backgroundColor: '#FFFFFF', borderRadius: '20px', padding: '28px', width: '100%', maxWidth: '380px', boxShadow: '0 8px 40px rgba(0,0,0,0.15)' }}>
            <h2 style={{ fontSize: '17px', fontWeight: '700', color: '#1A1A1A', margin: '0 0 10px' }}>Cancel Coupon?</h2>
            <p style={{ fontSize: '14px', color: '#666', margin: '0 0 24px' }}>This action cannot be undone. The coupon will be permanently cancelled.</p>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={() => setCancelConfirmId(null)}
                style={{ flex: 1, padding: '12px', backgroundColor: '#F0F0F0', color: '#444', border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}
              >
                Keep Coupon
              </button>
              <button
                onClick={async () => {
                  await supabase.from('coupons').update({ status: 'CANCELLED' }).eq('id', cancelConfirmId)
                  setCancelConfirmId(null)
                  loadData()
                }}
                style={{ flex: 1, padding: '12px', backgroundColor: '#D0021B', color: '#FFFFFF', border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: '700', cursor: 'pointer' }}
              >
                Yes, Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── DOWNLOAD DIALOG ── */}
      {downloadDialog && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          backgroundColor: 'rgba(0,0,0,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '24px',
        }}>
          <div style={{
            backgroundColor: '#FFFFFF', borderRadius: '20px',
            padding: '28px', width: '100%', maxWidth: '420px',
            boxShadow: '0 8px 40px rgba(0,0,0,0.15)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ fontSize: '17px', fontWeight: '700', color: '#1A1A1A', margin: 0 }}>Download Coupon</h2>
              <button onClick={() => { setDownloadDialog(null); setDlTemplates({}) }} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#666' }}>×</button>
            </div>
            <p style={{ fontSize: '12px', color: '#666', marginBottom: '16px', fontFamily: 'monospace' }}>
              {downloadDialog.coupon_code}
            </p>
            {dlTemplatesLoading ? (
              <div style={{ textAlign: 'center', padding: '24px', color: '#666', fontSize: '14px' }}>Loading templates…</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <button
                  onClick={() => downloadCouponJPG(downloadDialog, 'LOYALTY')}
                  disabled={downloading === 'LOYALTY' || !dlTemplates['LOYALTY']}
                  style={{
                    padding: '14px 20px',
                    backgroundColor: dlTemplates['LOYALTY'] ? '#162860' : '#F0F0F0',
                    color: dlTemplates['LOYALTY'] ? '#FFFFFF' : '#999',
                    border: 'none', borderRadius: '12px', fontSize: '14px', fontWeight: '600',
                    cursor: dlTemplates['LOYALTY'] && downloading !== 'LOYALTY' ? 'pointer' : 'not-allowed',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    opacity: downloading === 'LOYALTY' ? 0.7 : 1,
                  }}
                >
                  <span>{(downloadDialog.loyalty_brand || 'Loyalty') + ' Template'}</span>
                  <span style={{ fontSize: '12px', opacity: 0.8 }}>
                    {downloading === 'LOYALTY' ? 'Generating…' : dlTemplates['LOYALTY'] ? 'Download JPG' : 'Not configured'}
                  </span>
                </button>
                <button
                  onClick={() => downloadCouponJPG(downloadDialog, 'REFERRAL')}
                  disabled={downloading === 'REFERRAL' || !dlTemplates['REFERRAL']}
                  style={{
                    padding: '14px 20px',
                    backgroundColor: dlTemplates['REFERRAL'] ? '#0074BD' : '#F0F0F0',
                    color: dlTemplates['REFERRAL'] ? '#FFFFFF' : '#999',
                    border: 'none', borderRadius: '12px', fontSize: '14px', fontWeight: '600',
                    cursor: dlTemplates['REFERRAL'] && downloading !== 'REFERRAL' ? 'pointer' : 'not-allowed',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    opacity: downloading === 'REFERRAL' ? 0.7 : 1,
                  }}
                >
                  <span>{(downloadDialog.referral_brand || 'Referral') + ' Template'}</span>
                  <span style={{ fontSize: '12px', opacity: 0.8 }}>
                    {downloading === 'REFERRAL' ? 'Generating…' : dlTemplates['REFERRAL'] ? 'Download JPG' : 'Not configured'}
                  </span>
                </button>
                {!dlTemplates['LOYALTY'] && !dlTemplates['REFERRAL'] && (
                  <p style={{ fontSize: '13px', color: '#D0021B', textAlign: 'center', margin: '8px 0 0' }}>
                    No templates configured for this offer. Set them up in the Offer form.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}