'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Navbar from '@/components/layout/Navbar'
import Breadcrumb from '@/components/layout/Breadcrumb'
import { loadPermissionsForRole, checkPermission } from '@/lib/permissions'


interface Coupon {
  id: string
  coupon_code: string
  coupon_type: string
  identifier_type: string
  plate_combined_string: string | null
  mobile_number: string | null
  car_model: string | null
  offer_title: string
  offer_id: string | null
  customer_name: string | null
  advisor_name: string
  issue_date: string
  expiry_date: string
  status: string
  redemption_count: number
  stage: number | null
  parent_coupon_id: string | null
  loyalty_brand: string | null
  referral_brand: string | null
}

interface AppointmentStatus {
  coupon_id: string
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

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  ACTIVE: { bg: '#dcfce7', color: '#16a34a' },
  REDEEMED: { bg: '#ede9fe', color: '#7c3aed' },
  EXPIRED: { bg: '#f3f4f6', color: '#666666' },
  CANCELLED: { bg: '#fee2e2', color: '#D0021B' },
}

type KpiTab = 'total' | 'redeemed' | 'not_redeemed' | 'appt_pending' | 'appt_visited'

const KPI_LABELS: Record<KpiTab, string> = {
  total: 'Total Issued',
  redeemed: 'Redeemed',
  not_redeemed: 'Not Redeemed',
  appt_pending: 'Appointment Pending',
  appt_visited: 'Appointment Visited',
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


function formatDate(dateStr: string): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export default function CouponsPage() {
  const router = useRouter()
  const supabase = createClient()

  const [coupons, setCoupons] = useState<Coupon[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [kpiTab, setKpiTab] = useState<KpiTab>('total')
  const [profile, setProfile] = useState<any>(null)

  // appointment statuses keyed by coupon_id
  const [apptStatuses, setApptStatuses] = useState<Record<string, string>>({})
  // max stages per offer_id
  const [offerMaxStages, setOfferMaxStages] = useState<Record<string, number>>({})

  // Download dialog
  const [downloadDialog, setDownloadDialog] = useState<Coupon | null>(null)
  const [downloading, setDownloading] = useState<'LOYALTY' | 'REFERRAL' | null>(null)
  // Templates for the download dialog offer
  const [dlTemplates, setDlTemplates] = useState<Record<string, TemplateData>>({})
  const [dlTemplatesLoading, setDlTemplatesLoading] = useState(false)

  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  useEffect(() => { loadData() }, [])

  function showToast(message: string, type: 'success' | 'error' = 'success') {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3500)
  }

  async function loadData() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    const { data: profileData } = await supabase
      .from('profiles').select('user_role, full_name, id, is_active').eq('id', user.id).single()
    setProfile(profileData)

    if (!profileData) {
      router.push('/login')
      return
    }

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
      profileData?.user_role === 'BMW_SERVICE_ADVISOR'

    let query = supabase
      .from('coupons')
      .select('id, coupon_code, coupon_type, identifier_type, plate_combined_string, mobile_number, car_model, offer_title, offer_id, customer_name, advisor_name, issue_date, expiry_date, status, redemption_count, stage, parent_coupon_id, offers(loyalty_brand, referral_brand)')
      .order('created_at', { ascending: false })

    if (isAdvisor) query = query.eq('issued_by', user.id)

    const { data: couponData } = await query
    if (!couponData) { setLoading(false); return }

    const mappedCoupons = couponData.map((c: any) => ({
      ...c,
      loyalty_brand: c.offers?.loyalty_brand || null,
      referral_brand: c.offers?.referral_brand || null,
    }))
    setCoupons(mappedCoupons)

    // Load appointment statuses for all coupons
    const couponIds = couponData.map(c => c.id)
    if (couponIds.length > 0) {
      const { data: apptData } = await supabase
        .from('appointments')
        .select('coupon_id, status')
        .in('coupon_id', couponIds)
        .not('status', 'eq', 'cancelled')

      if (apptData) {
        const map: Record<string, string> = {}
        apptData.forEach((a: AppointmentStatus) => { map[a.coupon_id] = a.status })
        setApptStatuses(map)
      }
    }

    // Load max stages per offer
    const offerIds = Array.from(new Set(couponData.map(c => c.offer_id).filter(Boolean))) as string[]
    if (offerIds.length > 0) {
      const { data: stagesData } = await supabase
        .from('offer_stages')
        .select('offer_id, stage_number')
        .in('offer_id', offerIds)

      if (stagesData) {
        const map: Record<string, number> = {}
        stagesData.forEach((s: any) => {
          if (!map[s.offer_id] || s.stage_number > map[s.offer_id]) {
            map[s.offer_id] = s.stage_number
          }
        })
        setOfferMaxStages(map)
      }
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

  const filtered = coupons.filter(c => {
    const matchSearch = !search.trim() ||
      c.coupon_code.toLowerCase().includes(search.toLowerCase()) ||
      c.offer_title.toLowerCase().includes(search.toLowerCase()) ||
      c.advisor_name?.toLowerCase().includes(search.toLowerCase()) ||
      c.plate_combined_string?.toLowerCase().includes(search.toLowerCase()) ||
      (c.mobile_number || '').includes(search)
    return matchSearch && filterByKpi(c)
  })

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
      // TODO: templates.coupon_type still uses M/B — migration deferred
      data.forEach((t: any) => { map[t.coupon_type === 'M' ? 'LOYALTY' : t.coupon_type === 'B' ? 'REFERRAL' : t.coupon_type] = t })
      setDlTemplates(map)
    }
    setDlTemplatesLoading(false)
  }

  async function downloadCouponJPG(coupon: Coupon, templateType: 'LOYALTY' | 'REFERRAL') {
    const template = dlTemplates[templateType]
    if (!template?.file_url) {
      showToast(`No template configured for this offer.`, 'error')
      return
    }

    setDownloading(templateType)

    // Need the paired coupon for the other type
    let couponForValues = coupon
    if (coupon.coupon_type !== templateType) {
      // Fetch the paired coupon
      let pairedQuery
      if (templateType === 'REFERRAL' && coupon.coupon_type === 'LOYALTY') {
        // Find Referral coupon that has this Loyalty as parent
        const { data } = await supabase
          .from('coupons')
          .select('*')
          .eq('parent_coupon_id', coupon.id)
          .single()
        if (data) couponForValues = data
      } else if (templateType === 'LOYALTY' && coupon.coupon_type === 'REFERRAL') {
        // Find Loyalty coupon via parent_coupon_id
        const { data } = await supabase
          .from('coupons')
          .select('*')
          .eq('id', coupon.parent_coupon_id)
          .single()
        if (data) couponForValues = data
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
      positions.forEach(pos => {
        const value = values[pos.variable_key] || ''
        if (!value) return
        const x = (pos.x_coordinate / 100) * canvas.width
        const y = (pos.y_coordinate / 100) * canvas.height
        ctx.font = `${pos.font_weight || 'normal'} ${pos.font_size || 24}px ${template.font_family || 'Arial'}`
        ctx.fillStyle = pos.font_color || template.text_color || '#000000'
        ctx.fillText(value, x, y)
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

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#F7F7F7', paddingTop: '16px' }}>
      <style>{`
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
        @keyframes slideIn { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }
        .coupon-row:hover { background-color: #FAFBFF !important; }
      `}</style>

      {toast && (
        <div style={{
          position: 'fixed', top: '24px', right: '24px', zIndex: 2000,
          backgroundColor: toast.type === 'success' ? '#162860' : '#D0021B',
          color: '#FFFFFF', padding: '14px 20px', borderRadius: '12px',
          fontSize: '14px', fontWeight: '500', boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
          animation: 'slideIn 0.2s ease',
        }}>
          {toast.message}
        </div>
      )}

      <Navbar />

      <main style={{ padding: '0 32px 48px' }}>
        <Breadcrumb items={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'All Coupons' }]} />

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <div>
            <h1 style={{ fontSize: '22px', fontWeight: '700', color: '#1A1A1A', margin: 0 }}>All Coupons</h1>
            <p style={{ color: '#666', fontSize: '14px', marginTop: '4px' }}>
              {loading ? '...' : `${filtered.length} of ${coupons.length} coupons`}
            </p>
          </div>
          <button
            onClick={() => router.push('/create-coupon')}
            style={{ padding: '10px 20px', backgroundColor: '#0074BD', color: '#FFFFFF', border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}
          >
            + Create Coupon
          </button>
        </div>

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
                  backgroundColor: '#FFFFFF',
                  borderRadius: '14px',
                  padding: '16px 20px',
                  boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
                  borderLeft: `4px solid ${isActive ? accent : '#E0E0E0'}`,
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                  outline: isActive ? `2px solid ${accent}20` : 'none',
                }}
              >
                <p style={{ fontSize: '11px', color: isActive ? accent : '#666', fontWeight: '600', margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  {KPI_LABELS[tab]}
                </p>
                {loading
                  ? <div style={{ height: '28px', width: '48px', backgroundColor: '#F0F0F0', borderRadius: '6px', animation: 'pulse 1.5s ease-in-out infinite' }} />
                  : <p style={{ fontSize: '26px', fontWeight: '700', color: isActive ? accent : '#1A1A1A', margin: 0, lineHeight: 1 }}>{count}</p>
                }
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

        {/* Table */}
        <div style={{ backgroundColor: '#FFFFFF', borderRadius: '16px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', overflow: 'hidden' }}>

          {/* Header */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '2.2fr 1.4fr 1.2fr 0.8fr 0.8fr 1fr 0.9fr 180px',
            padding: '12px 20px',
            backgroundColor: '#F7F7F7',
            borderBottom: '1px solid #EEEEEE',
          }}>
            {['Coupon Code', 'Offer', 'Plate', 'Type', 'Advisor', 'Issued', 'Stage / Status', 'Actions'].map(h => (
              <span key={h} style={{ fontSize: '11px', fontWeight: '700', color: '#666', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</span>
            ))}
          </div>

          {loading ? (
            <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} style={{ height: '52px', backgroundColor: '#F0F0F0', borderRadius: '8px', animation: 'pulse 1.5s ease-in-out infinite' }} />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '64px 0', color: '#666', fontSize: '14px' }}>
              {search || kpiTab !== 'total' ? 'No coupons match your filters.' : 'No coupons yet. '}
              {!search && kpiTab === 'total' && (
                <span onClick={() => router.push('/create-coupon')} style={{ color: '#0074BD', cursor: 'pointer', fontWeight: '500' }}>
                  Create the first one →
                </span>
              )}
            </div>
          ) : (
            filtered.map((coupon, i) => {
              const statusStyle = STATUS_COLORS[coupon.status] || STATUS_COLORS.EXPIRED
              const isExpired = new Date(coupon.expiry_date) < new Date()
              const apptStatus = apptStatuses[coupon.id]
              const isLoyaltyCoupon = coupon.coupon_type === 'LOYALTY'
              const isReferralCoupon = coupon.coupon_type === 'REFERRAL'
              const maxStage = coupon.offer_id ? (offerMaxStages[coupon.offer_id] || 3) : 3
              const currentStage = coupon.stage ?? 0

              return (
                <div
                  key={coupon.id}
                  className="coupon-row"
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '2.2fr 1.4fr 1.2fr 0.8fr 0.8fr 1fr 0.9fr 180px',
                    padding: '13px 20px',
                    borderBottom: i < filtered.length - 1 ? '1px solid #F5F5F5' : 'none',
                    alignItems: 'center',
                    backgroundColor: '#FFFFFF',
                  }}
                >
                  {/* Coupon code + type badge */}
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

                  {/* Offer */}
                  <span style={{ fontSize: '12px', color: '#444' }}>{coupon.offer_title}</span>

                  {/* Plate */}
                  <span style={{ fontSize: '12px', color: '#444', fontFamily: 'monospace' }}>
                    {coupon.plate_combined_string || '—'}
                  </span>

                  {/* Type badge */}
                  <span style={{
                    display: 'inline-block', fontSize: '11px', fontWeight: '600',
                    padding: '3px 8px', borderRadius: '4px',
                    backgroundColor: isLoyaltyCoupon ? '#EEF2FF' : '#E8F4FF',
                    color: isLoyaltyCoupon ? '#162860' : '#0074BD',
                    width: 'fit-content',
                  }}>
                    {isLoyaltyCoupon ? (coupon.loyalty_brand || 'Loyalty') : (coupon.referral_brand || 'Referral')}
                  </span>

                  {/* Advisor */}
                  <span style={{ fontSize: '12px', color: '#444' }}>{coupon.advisor_name || '—'}</span>

                  {/* Issued / expiry */}
                  <div>
                    <p style={{ fontSize: '12px', color: '#444', margin: 0 }}>
                      {formatDate(coupon.issue_date)}
                    </p>
                    <p style={{ fontSize: '11px', margin: '2px 0 0', color: isExpired && coupon.status === 'ACTIVE' ? '#D0021B' : '#888' }}>
                      Exp: {formatDate(coupon.expiry_date)}
                    </p>
                  </div>

                  {/* Stage (Loyalty) / Status + appointment indicator */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {/* Status pill */}
                    <span style={{
                      display: 'inline-block', fontSize: '11px', fontWeight: '600',
                      padding: '3px 8px', borderRadius: '100px', width: 'fit-content',
                      backgroundColor: statusStyle.bg, color: statusStyle.color,
                    }}>
                      {coupon.status}
                    </span>
                    {/* Stage progress for Loyalty coupons */}
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
                    {/* Appointment status indicator */}
                    {apptStatus && (
                      <span style={{
                        fontSize: '10px', fontWeight: '600', color: apptStatus === 'visited' ? '#16a34a' : '#f59e0b',
                      }}>
                        {apptStatus === 'visited' ? 'Visited' : 'Appt: ' + apptStatus.replace(/_/g, ' ')}
                      </span>
                    )}
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                    {/* Download JPG */}
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

                    {/* Create Appointment — Referral coupons, ACTIVE only */}
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

                    {/* Cancel */}
                    {coupon.status === 'ACTIVE' && (
                      <button
                        onClick={async () => {
                          await supabase.from('coupons').update({ status: 'CANCELLED' }).eq('id', coupon.id)
                          loadData()
                        }}
                        style={{
                          padding: '5px 8px', fontSize: '11px', fontWeight: '600',
                          backgroundColor: '#fee2e2', color: '#D0021B',
                          border: 'none', borderRadius: '6px', cursor: 'pointer',
                        }}
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
      </main>

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

                {/* Loyalty Template */}
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

                {/* Referral Template */}
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