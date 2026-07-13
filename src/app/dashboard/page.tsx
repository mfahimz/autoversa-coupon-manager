'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Navbar from '@/components/layout/Navbar'
import PageSkeleton from '@/components/layout/PageSkeleton'
import { maskMobileNumber } from '@/lib/utils'
import InvoiceEntryDialog from '@/components/dashboard/InvoiceEntryDialog'
import { getLeaderboard, getAllAdvisorsMissingStatus, type LeaderboardRow } from '@/lib/invoiceTracking'
import { RECEPTIONIST_COUPON_CREATION_ENABLED } from '@/lib/featureFlags'
import ExportButton from '@/components/shared/ExportButton'

const RECEPTIONIST_COMMISSION_CARD_ENABLED = false // toggle back to true to re-enable this card


// ─── Types ────────────────────────────────────────────────────────────────────

interface Profile {
  id?: string
  full_name: string | null
  email?: string | null
  user_role: string
  advisor_code: string | null
  is_active?: boolean | null
}

interface DashboardStats {
  totalCoupons: number
  totalCouponRows: number
  redeemedCoupons: number
  todaysCoupons: number
  totalAdvisors: number
  referralVisits: number
}

interface LoyaltyCouponRow {
  id: string
  coupon_code: string
  plate_combined_string: string | null
  mobile_number: string | null
  advisor_name: string | null
  issued_by: string | null
  stage: number
  stage_updated_at: string | null
  offer_id: string | null
  offer_title: string | null
  last_notified_at: string | null
  bmw_referrals_completed: number
  reward_label: string | null
  reward_description: string | null
  max_stage: number
  wa_template: string | null
}

interface OfferGroup {
  offer_id: string
  offer_title: string
  rows: LoyaltyCouponRow[]
  maxStage: number
}

interface AdvisorProfile {
  id: string
  full_name: string | null
  advisor_code: string | null
  user_role: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function getGreeting() {
  const hour = new Date().getHours()
  if (hour < 12) return 'morning'
  if (hour < 17) return 'afternoon'
  return 'evening'
}

const PAGE_SIZE = 10

// Helper to convert hex colors to rgb values
function hexToRgbStr(hex: string): string {
  let cleaned = hex.replace('#', '')
  if (cleaned.length === 3) {
    cleaned = cleaned.split('').map(c => c + c).join('')
  }
  const r = parseInt(cleaned.substring(0, 2), 16)
  const g = parseInt(cleaned.substring(2, 4), 16)
  const b = parseInt(cleaned.substring(4, 6), 16)
  if (isNaN(r) || isNaN(g) || isNaN(b)) {
    return '0, 116, 189' // Default fallback
  }
  return `${r}, ${g}, ${b}`
}

// Shared helper to compute scoped coupon stats
async function computeScopedCouponStats(supabase: any, query: any) {
  const { data: coupons, error } = await query

  const stats = {
    customersServed: 0,
    couponsIssued: 0,
    referralVisits: 0,
    redeemed: 0,
    issuedToday: 0
  }

  if (error || !coupons) {
    return stats
  }

  stats.couponsIssued = coupons.length

  const todayStr = new Date().toISOString().split('T')[0]
  const referralIds: string[] = []

  coupons.forEach((c: any) => {
    if (c.coupon_type === 'LOYALTY') {
      stats.customersServed++
      if (c.status === 'REDEEMED') {
        stats.redeemed++
      }
      if (c.issue_date && c.issue_date.startsWith(todayStr)) {
        stats.issuedToday++
      }
    } else if (c.coupon_type === 'REFERRAL') {
      referralIds.push(c.id)
    }
  })

  if (referralIds.length > 0) {
    const { data: appointments, error: apptError } = await supabase
      .from('appointments')
      .select('coupon_id')
      .in('coupon_id', referralIds)
      .eq('status', 'visited')

    if (!apptError && appointments) {
      stats.referralVisits = appointments.length
    }
  }

  return stats
}

// ─── Pagination component ─────────────────────────────────────────────────────

function Pagination({ total, page, onPage }: { total: number; page: number; onPage: (p: number) => void }) {
  const totalPages = Math.ceil(total / PAGE_SIZE)
  if (totalPages <= 1) return null
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', padding: '16px', borderTop: '1px solid #F0F0F0' }}>
      <button
        onClick={() => onPage(page - 1)}
        disabled={page === 1}
        style={{ padding: '6px 12px', fontSize: '13px', fontWeight: '600', border: '1.5px solid #E0E0E0', borderRadius: '8px', backgroundColor: '#FFFFFF', color: page === 1 ? '#CCC' : '#162860', cursor: page === 1 ? 'not-allowed' : 'pointer' }}
      >
        ← Prev
      </button>
      {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
        <button
          key={p}
          onClick={() => onPage(p)}
          style={{
            padding: '6px 12px', fontSize: '13px', fontWeight: '600', border: '1.5px solid',
            borderColor: p === page ? '#0074BD' : '#E0E0E0', borderRadius: '8px',
            backgroundColor: p === page ? '#0074BD' : '#FFFFFF',
            color: p === page ? '#FFFFFF' : '#444', cursor: 'pointer',
          }}
        >
          {p}
        </button>
      ))}
      <button
        onClick={() => onPage(page + 1)}
        disabled={page === totalPages}
        style={{ padding: '6px 12px', fontSize: '13px', fontWeight: '600', border: '1.5px solid #E0E0E0', borderRadius: '8px', backgroundColor: '#FFFFFF', color: page === totalPages ? '#CCC' : '#162860', cursor: page === totalPages ? 'not-allowed' : 'pointer' }}
      >
        Next →
      </button>
    </div>
  )
}

// ─── Stat card ─────────────────────────────────────────────────────────────

function StatCard({ label, value, color, loading, format = 'number', subtitle, icon }: {
  label: string; value: number; color: string; loading: boolean; format?: 'number' | 'currency'; subtitle?: string; icon?: string
}) {
  const rgb = hexToRgbStr(color)
  return (
    <div style={{
      background: 'linear-gradient(180deg, #FFFFFF 0%, #FCFCFC 100%)',
      borderRadius: '16px',
      padding: '20px 22px',
      boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
      border: '1px solid #F0F0F0',
      display: 'flex',
      flexDirection: 'column',
      gap: '6px',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Top Edge Gradient Border Glow */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: '3px',
        background: `linear-gradient(90deg, rgba(${rgb}, 0.2), ${color}, rgba(${rgb}, 0.2))`,
        boxShadow: `0 1px 6px rgba(${rgb}, 0.5)`,
      }} />

      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '3px' }}>
        {icon && (
          <div style={{ width: '28px', height: '28px', borderRadius: '8px', backgroundColor: `${color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px' }}>
            {icon}
          </div>
        )}
        <p style={{ fontSize: '12px', color: '#666666', fontWeight: '600', margin: 0 }}>{label}</p>
      </div>

      {loading ? (
        <div style={{ height: '30px', width: '70px', backgroundColor: '#F0F0F0', borderRadius: '8px', animation: 'pulse 1.5s ease-in-out infinite' }} />
      ) : (
        <p style={{
          fontSize: '26px',
          fontWeight: '700',
          color: '#1A1A1A',
          margin: 0,
          lineHeight: 1,
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
          fontVariantNumeric: 'tabular-nums',
          letterSpacing: '0.025em'
        }}>
          {format === 'currency' ? `AED ${value.toLocaleString()}` : value.toLocaleString()}
        </p>
      )}

      {subtitle && <p style={{ fontSize: '11px', color: '#999999', margin: 0 }}>{subtitle}</p>}

      {/* Bottom Progress Bar with gradient fill and subtle glow */}
      <div style={{
        position: 'absolute',
        bottom: 0,
        left: '22px',
        right: '22px',
        height: '3px',
        borderRadius: '3px 3px 0 0',
        background: `linear-gradient(90deg, rgba(${rgb}, 0.4), ${color})`,
        boxShadow: `0 1px 8px rgba(${rgb}, 0.5)`,
      }} />
    </div>
  )
}

function SectionDivider({ label }: { label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: '40px 0 32px' }}>
      <div style={{ flex: 1, height: '1px', backgroundColor: '#E0E0E0' }} />
      <span style={{ fontSize: '11px', fontWeight: '700', color: '#888', textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>{label}</span>
      <div style={{ flex: 1, height: '1px', backgroundColor: '#E0E0E0' }} />
    </div>
  )
}

// ─── Recent coupon layout ───────────────────────────────────────────────────

function RecentCouponRow({ coupon }: { coupon: any }) {
  const statusColors: Record<string, string> = {
    ACTIVE: '#0074BD', REDEEMED: '#16a34a', EXPIRED: '#666666', CANCELLED: '#D0021B',
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 0', borderBottom: '1px solid #F0F0F0' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
        <span style={{ fontSize: '14px', fontWeight: '600', color: '#1A1A1A' }}>{coupon.coupon_code}</span>
        <span style={{ fontSize: '12px', color: '#666666' }}>{coupon.customer_name || 'Unknown'} · {coupon.issuer_name || 'Unknown'}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <span style={{ fontSize: '12px', color: '#666666' }}>{formatDate(coupon.issue_date)}</span>
        <span style={{
          fontSize: '11px', fontWeight: '600', padding: '4px 10px', borderRadius: '100px',
          backgroundColor: `${statusColors[coupon.status] || '#666666'}18`,
          color: statusColors[coupon.status] || '#666666',
        }}>{coupon.status}</span>
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function DashboardPage() {
  const router = useRouter()
  const supabase = createClient()

  const [profile, setProfile] = useState<Profile | null>(null)
  const [stats, setStats] = useState<DashboardStats>({ totalCoupons: 0, totalCouponRows: 0, redeemedCoupons: 0, todaysCoupons: 0, totalAdvisors: 0, referralVisits: 0 })
  const [recentCoupons, setRecentCoupons] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  // Scoped stats for advisor & receptionist
  const [advisorScopedStats, setAdvisorScopedStats] = useState({
    customersServed: 0,
    couponsIssued: 0,
    referralVisits: 0,
    redeemed: 0,
    issuedToday: 0
  })
  const [receptionistScopedStats, setReceptionistScopedStats] = useState({
    customersServed: 0,
    couponsIssued: 0,
    referralVisits: 0,
    redeemed: 0,
    issuedToday: 0
  })

  // Receptionist commission state
  const [receptionistTotalCommission, setReceptionistTotalCommission] = useState(0)
  const [receptionistTotalVisits, setReceptionistTotalVisits] = useState(0)
  const [receptionistCommissionLoading, setReceptionistCommissionLoading] = useState(true)

  // Receptionist pipeline state
  const [receptionistOfferGroups, setReceptionistOfferGroups] = useState<OfferGroup[]>([])
  const [receptionistStagesByOffer, setReceptionistStagesByOffer] = useState<Record<string, any[]>>({})
  const [receptionistBrandsByOffer, setReceptionistBrandsByOffer] = useState<Record<string, { loyalty_brand: string | null; referral_brand: string | null }>>({})
  const [receptionistPipelineLoading, setReceptionistPipelineLoading] = useState(true)
  const [receptionistPipelineSearch, setReceptionistPipelineSearch] = useState('')
  const [receptionistPipelinePages, setReceptionistPipelinePages] = useState<Record<string, number>>({})

  // Shared loyalty coupon data (receptionist + admin loyalty section)
  const [offerGroups, setOfferGroups] = useState<OfferGroup[]>([])
  const [stagesByOffer, setStagesByOffer] = useState<Record<string, any[]>>({})
  const [brandsByOffer, setBrandsByOffer] = useState<Record<string, { loyalty_brand: string | null; referral_brand: string | null }>>({})
  const [rLoading, setRLoading] = useState(true)
  const [loyaltyDashboardTab, setLoyaltyDashboardTab] = useState<'notify' | 'all_eligible'>('notify')
  const [rSearch, setRSearch] = useState('')
  const [notifying, setNotifying] = useState<string | null>(null)

  // Pagination state per offer group (keyed by offer_id)
  const [receptionistPages, setReceptionistPages] = useState<Record<string, number>>({})
  const [advisorPipelinePages, setAdvisorPipelinePages] = useState<Record<string, number>>({})

  // Advisor self-view state
  const [advisorTotalVisits, setAdvisorTotalVisits] = useState(0)
  const [advisorTotalCommission, setAdvisorTotalCommission] = useState(0)
  const [advisorOfferGroups, setAdvisorOfferGroups] = useState<OfferGroup[]>([])
  const [advisorStagesByOffer, setAdvisorStagesByOffer] = useState<Record<string, any[]>>({})
  const [advisorBrandsByOffer, setAdvisorBrandsByOffer] = useState<Record<string, { loyalty_brand: string | null; referral_brand: string | null }>>({})
  const [advisorLoading, setAdvisorLoading] = useState(true)
  const [advisorSearch, setAdvisorSearch] = useState('')

  // Admin advisor pipeline state
  const [advisorList, setAdvisorList] = useState<AdvisorProfile[]>([])
  const [selectedAdvisorId, setSelectedAdvisorId] = useState<string>('all')
  const [adminPipelineGroups, setAdminPipelineGroups] = useState<OfferGroup[]>([])
  const [adminPipelineStages, setAdminPipelineStages] = useState<Record<string, any[]>>({})
  const [adminPipelineBrands, setAdminPipelineBrands] = useState<Record<string, { loyalty_brand: string | null; referral_brand: string | null }>>({})
  const [adminPipelineLoading, setAdminPipelineLoading] = useState(true)
  const [adminPipelineStats, setAdminPipelineStats] = useState({ totalIssued: 0, issuedThisMonth: 0, totalVisits: 0, totalCommission: 0 })
  const [adminPipelineSearch, setAdminPipelineSearch] = useState('')

  // Dialog State
  const [isInvoiceDialogOpen, setIsInvoiceDialogOpen] = useState(false)
  const [hasAutoOpened, setHasAutoOpened] = useState(false)

  // Leaderboard State
  const [leaderboardData, setLeaderboardData] = useState<LeaderboardRow[]>([])
  const [leaderboardLoading, setLeaderboardLoading] = useState(true)

  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  useEffect(() => { loadDashboard() }, [])

  // Auto-open logic for Admin / Manager once profile is loaded
  useEffect(() => {
    if (profile && (profile.user_role === 'ADMIN' || profile.user_role === 'MANAGER') && !hasAutoOpened) {
      setHasAutoOpened(true)
      getAllAdvisorsMissingStatus().then(statuses => {
        const needsAction = statuses.some(s => s.needsBaseline || s.missingDays.length > 0)
        if (needsAction) {
          setIsInvoiceDialogOpen(true)
        }
      }).catch(err => {
        console.error('Error fetching advisor status for auto-open:', err)
      })
    }
  }, [profile, hasAutoOpened])

  function showToast(message: string, type: 'success' | 'error' = 'success') {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3500)
  }

  async function loadDashboard() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    const [
      profileResult,
      advisorsResult,
      statsResult,
      recentResult
    ] = await Promise.all([
      supabase.from('profiles').select('id, user_role, full_name, advisor_code, is_active').eq('id', user.id).single(),
      supabase
        .from('profiles')
        .select('id, full_name, advisor_code, user_role')
        .in('user_role', ['SERVICE_ADVISOR', 'BMW_SERVICE_ADVISOR'])
        .eq('is_active', true)
        .order('full_name'),
      (supabase as any).rpc('get_dashboard_stats'),
      supabase.from('coupons')
        .select('coupon_code, customer_name, advisor_name, issued_by, issue_date, status')
        .order('created_at', { ascending: false }).limit(8)
    ])

    const { data: profileData } = profileResult
    if (profileData) setProfile(profileData)

    if (profileData?.is_active === false) {
      await supabase.auth.signOut()
      router.push('/login')
      return
    }

    const role = profileData?.user_role
    const isAdvisor = role === 'SERVICE_ADVISOR' || role === 'BMW_SERVICE_ADVISOR'
    const isAdmin = role === 'ADMIN'
    const isReceptionist = role === 'RECEPTIONIST'

    if (isAdmin || isReceptionist) loadReceptionistData(user.id)

    if (isAdmin) {
      const { data: advisors } = advisorsResult
      setAdvisorList(advisors || [])
      loadAdminPipeline('all')
    }

    if (isAdvisor) loadAdvisorSelfData(user.id, profileData)

    // Load Advisor Leaderboard for everyone except Receptionist
    if (!isReceptionist) {
      setLeaderboardLoading(true)
      getLeaderboard()
        .then(data => {
          if (Array.isArray(data)) {
            // Verify data, sort client-side by score DESC as a safeguard
            const verified = data.map(item => ({
              advisor_name: item?.advisor_name || (item as any)?.full_name || 'Unknown',
              invoices_count: typeof item?.invoices_count === 'number' ? item.invoices_count : ((item as any)?.invoices_this_month ?? 0),
              coupons_count: typeof item?.coupons_count === 'number' ? item.coupons_count : ((item as any)?.coupons_this_month ?? 0),
              score: typeof item?.score === 'number' ? item.score : 0,
            }))
            const sorted = verified.sort((a, b) => b.score - a.score)
            setLeaderboardData(sorted)
          } else {
            console.error('getLeaderboard returned invalid format:', data)
            setLeaderboardData([])
          }
        })
        .catch(err => {
          console.error('Error fetching leaderboard:', err)
          setLeaderboardData([])
        })
        .finally(() => {
          setLeaderboardLoading(false)
        })
    }

    if (!isReceptionist && !isAdvisor) {
      const statsRow = statsResult.data?.[0]
      setStats({
        totalCoupons: statsRow?.total_coupons || 0,
        totalCouponRows: statsRow?.total_coupon_rows || 0,
        redeemedCoupons: statsRow?.redeemed_coupons || 0,
        todaysCoupons: statsRow?.today_coupons || 0,
        totalAdvisors: statsRow?.total_advisors || 0,
        referralVisits: statsRow?.referral_visits || 0,
      })
      const { data: recent } = recentResult
      if (recent && recent.length > 0) {
        const recentIssuerIds = Array.from(new Set(recent.map((c: any) => c.issued_by).filter(Boolean))) as string[]
        const issuerNameMap = new Map<string, string>()
        if (recentIssuerIds.length > 0) {
          const { data: issuerProfiles } = await supabase
            .from('profiles')
            .select('id, full_name')
            .in('id', recentIssuerIds)
          ;(issuerProfiles || []).forEach((p: any) => issuerNameMap.set(p.id, p.full_name || 'Unknown'))
        }
        const recentWithIssuer = recent.map((c: any) => ({
          ...c,
          issuer_name: c.issued_by ? (issuerNameMap.get(c.issued_by) || 'Unknown') : 'Unknown',
        }))
        setRecentCoupons(recentWithIssuer)
      } else {
        setRecentCoupons([])
      }
    }

    setLoading(false)
  }

  // ─── Shared loyalty data builder ──────────────────────────────────────────

  async function buildLoyaltyGroups(coupons: any[]): Promise<{
    offerGroups: OfferGroup[]
    stagesByOffer: Record<string, any[]>
    brandsByOffer: Record<string, { loyalty_brand: string | null; referral_brand: string | null }>
    visitedCountByLoyalty: Record<string, number>
  }> {
    const loyaltyCouponIds = coupons.map((c: any) => c.id)
    const offerIds = Array.from(new Set(coupons.map((c: any) => c.offer_id).filter(Boolean))) as string[]

    const { data: allReferralCoupons } = await supabase
      .from('coupons').select('id, parent_coupon_id')
      .in('parent_coupon_id', loyaltyCouponIds).eq('coupon_type', 'REFERRAL')

    const referralIds = (allReferralCoupons || []).map((c: any) => c.id)

    const [visitedApptsResult, stagesResult, waResult, offersResult] = await Promise.all([
      referralIds.length > 0
        ? supabase.from('appointments').select('coupon_id').eq('status', 'visited').in('coupon_id', referralIds)
        : Promise.resolve({ data: [] as any }),
      offerIds.length > 0
        ? supabase.from('offer_stages').select('offer_id, stage_number, reward_label, reward_description, bmw_visits_required').in('offer_id', offerIds).order('stage_number')
        : Promise.resolve({ data: [] as any }),
      offerIds.length > 0
        ? supabase.from('offer_whatsapp_templates').select('offer_id, trigger_type, message_body').in('offer_id', offerIds).in('trigger_type', ['STAGE_1', 'STAGE_2', 'STAGE_3', 'STAGE_4', 'STAGE_5'])
        : Promise.resolve({ data: [] as any }),
      offerIds.length > 0
        ? supabase.from('offers').select('id, loyalty_brand, referral_brand').in('id', offerIds)
        : Promise.resolve({ data: [] as any })
    ])

    const visitedAppts = visitedApptsResult.data
    const stagesData = stagesResult.data
    const waTemplates = waResult.data
    const offersData = offersResult.data

    const visitedCouponIds = new Set((visitedAppts || []).map((a: any) => a.coupon_id))
    const visitedCountByLoyalty: Record<string, number> = {}
    ;(allReferralCoupons || []).forEach((b: any) => {
      if (visitedCouponIds.has(b.id))
        visitedCountByLoyalty[b.parent_coupon_id] = (visitedCountByLoyalty[b.parent_coupon_id] || 0) + 1
    })

    const brandsMap: Record<string, { loyalty_brand: string | null; referral_brand: string | null }> = {}
    ;(offersData || []).forEach((o: any) => { brandsMap[o.id] = { loyalty_brand: o.loyalty_brand, referral_brand: o.referral_brand } })

    const stagesByOfferMap: Record<string, any[]> = {}
    ;(stagesData || []).forEach((s: any) => {
      if (!stagesByOfferMap[s.offer_id]) stagesByOfferMap[s.offer_id] = []
      stagesByOfferMap[s.offer_id].push(s)
    })

    const waByOfferAndStage: Record<string, string> = {}
    ;(waTemplates || []).forEach((t: any) => { waByOfferAndStage[`${t.offer_id}_${t.trigger_type}`] = t.message_body })

    const rows: LoyaltyCouponRow[] = coupons.map((c: any) => {
      const stages = stagesByOfferMap[c.offer_id] || []
      const maxStage = stages.length
      const currentStage = c.stage || 0
      const currentStageData = stages.find((s: any) => s.stage_number === currentStage)
      const stageTrigger = currentStage > 0 ? `STAGE_${currentStage}` : null
      const waTemplate = stageTrigger ? (waByOfferAndStage[`${c.offer_id}_${stageTrigger}`] || null) : null
      return {
        ...c,
        bmw_referrals_completed: visitedCountByLoyalty[c.id] || 0,
        reward_label: currentStageData?.reward_label || null,
        reward_description: currentStageData?.reward_description || null,
        max_stage: maxStage,
        wa_template: waTemplate,
      }
    })

    const groupMap: Record<string, OfferGroup> = {}
    rows.forEach(row => {
      const oid = row.offer_id || 'unknown'
      if (!groupMap[oid]) groupMap[oid] = { offer_id: oid, offer_title: row.offer_title || 'Unknown Offer', rows: [], maxStage: row.max_stage }
      groupMap[oid].rows.push(row)
    })

    return {
      offerGroups: Object.values(groupMap),
      stagesByOffer: stagesByOfferMap,
      brandsByOffer: brandsMap,
      visitedCountByLoyalty,
    }
  }

  // ─── Receptionist data loader ─────────────────────────────────────────────

  async function loadReceptionistData(currentUserId?: string) {
    setRLoading(true)
    if (RECEPTIONIST_COUPON_CREATION_ENABLED) {
      setReceptionistCommissionLoading(true)
      setReceptionistPipelineLoading(true)
    }
    try {
      const { data: coupons } = await supabase
        .from('coupons')
        .select('id, coupon_code, plate_combined_string, mobile_number, advisor_name, issued_by, stage, stage_updated_at, offer_id, offer_title, last_notified_at')
        .eq('coupon_type', 'LOYALTY').eq('status', 'ACTIVE')
        .order('offer_id').order('created_at', { ascending: false })

      if (coupons && coupons.length > 0) {
        const result = await buildLoyaltyGroups(coupons)
        setOfferGroups(result.offerGroups)
        setStagesByOffer(result.stagesByOffer)
        setBrandsByOffer(result.brandsByOffer)
      } else {
        setOfferGroups([])
      }

      if (RECEPTIONIST_COUPON_CREATION_ENABLED) {
        const activeUserId = currentUserId || (await supabase.auth.getUser()).data.user?.id
        if (activeUserId) {
          const { data: splits, error } = await supabase
            .from('coupon_commission_splits')
            .select('receptionist_amount')
            .eq('receptionist_id', activeUserId)

          if (error) {
            console.error('Error querying receptionist commission splits:', error)
          } else if (splits) {
            const sum = splits.reduce((acc, row) => acc + (row.receptionist_amount || 0), 0)
            setReceptionistTotalCommission(sum)
            setReceptionistTotalVisits(splits.length)
          }

          // Fetch receptionist's own issued loyalty coupons
          const { data: receptionistCoupons } = await supabase
            .from('coupons')
            .select('id, coupon_code, plate_combined_string, mobile_number, advisor_name, issued_by, stage, stage_updated_at, offer_id, offer_title, last_notified_at')
            .eq('coupon_type', 'LOYALTY')
            .eq('issued_by', activeUserId)
            .order('offer_id').order('created_at', { ascending: false })

          if (receptionistCoupons && receptionistCoupons.length > 0) {
            const result = await buildLoyaltyGroups(receptionistCoupons)
            setReceptionistOfferGroups(result.offerGroups)
            setReceptionistStagesByOffer(result.stagesByOffer)
            setReceptionistBrandsByOffer(result.brandsByOffer)
          } else {
            setReceptionistOfferGroups([])
            setReceptionistStagesByOffer({})
            setReceptionistBrandsByOffer({})
          }

          // Build scope query: select id, coupon_type, status, issue_date, parent_coupon_id, filtered to .eq('issued_by', activeUserId) only
          const receptionistScopeQuery = supabase
            .from('coupons')
            .select('id, coupon_type, status, issue_date, parent_coupon_id')
            .eq('issued_by', activeUserId)

          const receptionistStatsObj = await computeScopedCouponStats(supabase, receptionistScopeQuery)
          setReceptionistScopedStats(receptionistStatsObj)
        }
      }
    } catch (e) {
      console.error('Receptionist data load error:', e)
      setOfferGroups([])
      if (RECEPTIONIST_COUPON_CREATION_ENABLED) {
        setReceptionistOfferGroups([])
        setReceptionistStagesByOffer({})
        setReceptionistBrandsByOffer({})
      }
    } finally {
      setRLoading(false)
      if (RECEPTIONIST_COUPON_CREATION_ENABLED) {
        setReceptionistCommissionLoading(false)
        setReceptionistPipelineLoading(false)
      } else {
        setReceptionistCommissionLoading(false)
        setReceptionistPipelineLoading(false)
        setReceptionistTotalCommission(0)
        setReceptionistTotalVisits(0)
        setReceptionistOfferGroups([])
        setReceptionistStagesByOffer({})
        setReceptionistBrandsByOffer({})
        setReceptionistScopedStats({
          customersServed: 0,
          couponsIssued: 0,
          referralVisits: 0,
          redeemed: 0,
          issuedToday: 0
        })
      }
    }
  }

  // ─── Advisor self data loader ─────────────────────────────────────────────

  async function loadAdvisorSelfData(userId: string, profileDataParam?: Profile | null) {
    setAdvisorLoading(true)
    try {
      const { data: coupons } = await supabase
        .from('coupons')
        .select('id, coupon_code, plate_combined_string, mobile_number, advisor_name, issued_by, stage, stage_updated_at, offer_id, offer_title, last_notified_at')
        .eq('coupon_type', 'LOYALTY')
        .eq('issued_by', userId)
        .order('offer_id').order('created_at', { ascending: false })

      if (coupons && coupons.length > 0) {
        const result = await buildLoyaltyGroups(coupons)
        setAdvisorOfferGroups(result.offerGroups)
        setAdvisorStagesByOffer(result.stagesByOffer)
        setAdvisorBrandsByOffer(result.brandsByOffer)

        // Compute total visits and commission for advisor KPIs
        const loyaltyIds = coupons.map((c: any) => c.id)
        const offerIds = Array.from(new Set(coupons.map((c: any) => c.offer_id).filter(Boolean))) as string[]

        const [referralResult, offersResult] = await Promise.all([
          supabase
            .from('coupons').select('id, offer_id, parent_coupon_id')
            .in('parent_coupon_id', loyaltyIds).eq('coupon_type', 'REFERRAL'),
          offerIds.length > 0
            ? supabase.from('offers').select('id, commission_amount').in('id', offerIds)
            : Promise.resolve({ data: [] as any })
        ])

        const referralCoupons = referralResult.data
        const offersData = offersResult.data

        const referralIds = (referralCoupons || []).map((r: any) => r.id)
        const { data: visitedAppts } = referralIds.length > 0
          ? await supabase.from('appointments').select('coupon_id, offer_id').in('coupon_id', referralIds).eq('status', 'visited')
          : { data: [] }

        const commissionByOffer: Record<string, number> = {}
        ;(offersData || []).forEach((o: any) => { commissionByOffer[o.id] = o.commission_amount || 0 })

        const visitsPerOffer: Record<string, number> = {}
        ;(visitedAppts || []).forEach((a: any) => {
          if (a.offer_id) visitsPerOffer[a.offer_id] = (visitsPerOffer[a.offer_id] || 0) + 1
        })

        let totalCommission = 0
        offerIds.forEach(oid => { totalCommission += (visitsPerOffer[oid] || 0) * (commissionByOffer[oid] || 0) })

        setAdvisorTotalVisits((visitedAppts || []).length)
        setAdvisorTotalCommission(totalCommission)
      } else {
        setAdvisorTotalVisits(0)
        setAdvisorTotalCommission(0)
        setAdvisorOfferGroups([])
      }

      // Build the advisor's scope query on coupons
      let scopeQuery = supabase
        .from('coupons')
        .select('id, coupon_type, status, issue_date, parent_coupon_id')

      const activeProfile = profileDataParam || profile
      if (RECEPTIONIST_COUPON_CREATION_ENABLED && activeProfile?.advisor_code) {
        scopeQuery = scopeQuery.or(`issued_by.eq.${userId},and(advisor_code.eq.${activeProfile.advisor_code},created_by_receptionist.eq.true)`)
      } else {
        scopeQuery = scopeQuery.eq('issued_by', userId)
      }

      const statsObj = await computeScopedCouponStats(supabase, scopeQuery)
      setAdvisorScopedStats(statsObj)

    } catch (e) {
      console.error('Advisor self data error:', e)
      setAdvisorOfferGroups([])
    } finally {
      setAdvisorLoading(false)
    }
  }

  // ─── Admin pipeline loader ────────────────────────────────────────────────

  async function loadAdminPipeline(scopeUserId: string) {
    setAdminPipelineLoading(true)
    try {
      const now = new Date()
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]

      let query = supabase
        .from('coupons')
        .select('id, coupon_code, plate_combined_string, mobile_number, advisor_name, issued_by, stage, stage_updated_at, offer_id, offer_title, last_notified_at')
        .eq('coupon_type', 'LOYALTY')
        .order('offer_id').order('created_at', { ascending: false })

      if (scopeUserId !== 'all') query = query.eq('issued_by', scopeUserId)

      const { data: coupons } = await query

      if (!coupons || coupons.length === 0) {
        setAdminPipelineStats({ totalIssued: 0, issuedThisMonth: 0, totalVisits: 0, totalCommission: 0 })
        setAdminPipelineGroups([])
        setAdminPipelineLoading(false)
        return
      }

      const result = await buildLoyaltyGroups(coupons)
      setAdminPipelineGroups(result.offerGroups)
      setAdminPipelineStages(result.stagesByOffer)
      setAdminPipelineBrands(result.brandsByOffer)

      // Compute stats
      const loyaltyIds = coupons.map((c: any) => c.id)
      const offerIds = Array.from(new Set(coupons.map((c: any) => c.offer_id).filter(Boolean))) as string[]

      const [referralResult, offersResult] = await Promise.all([
        supabase
          .from('coupons').select('id, offer_id, parent_coupon_id')
          .in('parent_coupon_id', loyaltyIds).eq('coupon_type', 'REFERRAL'),
        offerIds.length > 0
          ? supabase.from('offers').select('id, commission_amount').in('id', offerIds)
          : Promise.resolve({ data: [] as any })
      ])

      const referralCoupons = referralResult.data
      const offersData = offersResult.data

      const referralIds = (referralCoupons || []).map((r: any) => r.id)
      const { data: visitedAppts } = referralIds.length > 0
        ? await supabase.from('appointments').select('coupon_id, offer_id').in('coupon_id', referralIds).eq('status', 'visited')
        : { data: [] }

      const commissionByOffer: Record<string, number> = {}
      ;(offersData || []).forEach((o: any) => { commissionByOffer[o.id] = o.commission_amount || 0 })

      const visitsPerOffer: Record<string, number> = {}
      ;(visitedAppts || []).forEach((a: any) => {
        if (a.offer_id) visitsPerOffer[a.offer_id] = (visitsPerOffer[a.offer_id] || 0) + 1
      })

      let totalCommission = 0
      offerIds.forEach(oid => { totalCommission += (visitsPerOffer[oid] || 0) * (commissionByOffer[oid] || 0) })

      const issuedThisMonth = coupons.filter((c: any) => c.issue_date >= monthStart).length

      setAdminPipelineStats({
        totalIssued: coupons.length,
        issuedThisMonth,
        totalVisits: (visitedAppts || []).length,
        totalCommission,
      })

    } catch (e) {
      console.error('Admin pipeline error:', e)
      setAdminPipelineGroups([])
    } finally {
      setAdminPipelineLoading(false)
    }
  }

  // ─── WhatsApp ─────────────────────────────────────────────────────────────

  async function sendWhatsApp(row: LoyaltyCouponRow) {
    if (!row.mobile_number) { showToast('No mobile number on this coupon', 'error'); return }
    if (!row.wa_template) { showToast('No WhatsApp template configured for this stage', 'error'); return }
    const message = row.wa_template
      .replace(/\[PLATE_NO\]/g, row.plate_combined_string || '')
      .replace(/\[LOYALTY_COUPON_CODE\]/g, row.coupon_code)
      .replace(/\[STAGE\]/g, String(row.stage))
      .replace(/\[REWARD_LABEL\]/g, row.reward_label || '')
    // WhatsApp Web direct link — always use web.whatsapp.com/send?phone=...&text=... format for browser-based usage
    // Never use wa.me links — they trigger WhatsApp's redirect page before opening
    window.open(`https://web.whatsapp.com/send?phone=971${row.mobile_number}&text=${encodeURIComponent(message)}`, '_blank')
    setNotifying(row.id)
    const { error } = await supabase.from('coupons').update({ last_notified_at: new Date().toISOString() }).eq('id', row.id)
    if (!error) {
      setOfferGroups(prev => prev.map(g => ({ ...g, rows: g.rows.map(r => r.id === row.id ? { ...r, last_notified_at: new Date().toISOString() } : r) })))
      showToast('WhatsApp opened and notification recorded')
    }
    setNotifying(null)
  }

  // ─── Role flags ───────────────────────────────────────────────────────────

  const isAdvisor = profile?.user_role === 'SERVICE_ADVISOR' || profile?.user_role === 'BMW_SERVICE_ADVISOR'
  const isAdmin = profile?.user_role === 'ADMIN'
  const isReceptionist = profile?.user_role === 'RECEPTIONIST'
  const canLogInvoices = profile?.user_role && ['ADMIN', 'MANAGER', 'ASSISTANT_GENERAL_MANAGER', 'CEO'].includes(profile.user_role)

  // ─── Render: Loyalty table for receptionist/admin ─────────────────────────

  function renderLoyaltyTable(
    groups: OfferGroup[],
    stages: Record<string, any[]>,
    brands: Record<string, { loyalty_brand: string | null; referral_brand: string | null }>,
    search: string,
    pages: Record<string, number>,
    setPages: (fn: (prev: Record<string, number>) => Record<string, number>) => void,
    showWhatsApp: boolean,
    showAdvisorCol: boolean,
    showLastNotified: boolean,
    loyaltyTab: 'notify' | 'all_eligible'
  ) {
    const filtered = groups.map(group => ({
      ...group,
      rows: group.rows.filter(r => {
        // Tab filter
        if (loyaltyTab === 'notify') {
          // Show rows that need notification:
          // - stage >= 1 (has met eligibility)
          // - AND either never notified OR notified before the last stage change
          if ((r.stage ?? 0) < 1) return false
          const needsNotification = !r.last_notified_at ||
            (r.stage_updated_at && r.last_notified_at < r.stage_updated_at)
          if (!needsNotification) return false
        } else {
          // all_eligible: show all rows with stage >= 1
          if ((r.stage ?? 0) < 1) return false
        }
        // Search filter
        if (!search.trim()) return true
        const q = search.toLowerCase()
        return (
          (r.plate_combined_string || '').toLowerCase().includes(q) ||
          (r.advisor_name || '').toLowerCase().includes(q) ||
          (r.mobile_number || '').includes(q) ||
          (r.coupon_code || '').toLowerCase().includes(q)
        )
      }),
    })).filter(g => g.rows.length > 0)

    if (filtered.length === 0) {
      return (
        <div style={{ textAlign: 'center', padding: '48px', backgroundColor: '#FFFFFF', borderRadius: '16px', color: '#66', fontSize: '14px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
          {search
            ? 'No customers match your search.'
            : loyaltyTab === 'notify'
              ? 'No customers pending notification. All eligible customers have been notified.'
              : 'No eligible loyalty customers yet.'}
        </div>
      )
    }

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        {filtered.map(group => {
          const offerStages = stages[group.offer_id] || []
          const stageCounts: { label: string; count: number; color: string }[] = [
            { label: 'No reward yet', count: group.rows.filter(r => r.stage === 0).length, color: '#888' },
            ...offerStages.map((s: any) => ({
              label: s.reward_label || `Stage ${s.stage_number}`,
              count: group.rows.filter(r => r.stage === s.stage_number).length,
              color: ['#0074BD', '#7c3aed', '#16a34a', '#f59e0b', '#D0021B'][(s.stage_number - 1) % 5] || '#0074BD',
            })),
          ]
          const currentPage = pages[group.offer_id] || 1
          const pageRows = group.rows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

          const groupCols = showAdvisorCol
            ? (showLastNotified ? '1.2fr 1fr 1fr 1fr 1.4fr 1.2fr 120px' : '1.2fr 1fr 1fr 1fr 1.8fr 120px')
            : (showLastNotified ? '1.4fr 1.2fr 1.2fr 1fr 1.6fr 1.2fr 120px' : '1.4fr 1.2fr 1.2fr 1fr 2fr 120px')

          const groupHeaders = [
            (brands[group.offer_id]?.loyalty_brand || 'Loyalty') + ' Plate',
            ...(showAdvisorCol ? ['Advisor'] : []),
            'Mobile',
            (brands[group.offer_id]?.referral_brand || 'Referral') + ' Referrals',
            'Eligible Reward',
            ...(showLastNotified ? ['Last Notified'] : []),
            ...(showWhatsApp ? ['Action'] : []),
          ]

          return (
            <div key={group.offer_id}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                <div style={{ flex: 1, height: '1px', backgroundColor: '#E0E0E0' }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 16px', backgroundColor: '#162860', borderRadius: '100px', flexShrink: 0 }}>
                  <span style={{ fontSize: '12px', fontWeight: '700', color: '#FFFFFF' }}>{group.offer_title}</span>
                  <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)' }}>·</span>
                  <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.6)' }}>{group.rows.length} customer{group.rows.length !== 1 ? 's' : ''}</span>
                  <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)' }}>·</span>
                  <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.6)' }}>{group.maxStage} stage{group.maxStage !== 1 ? 's' : ''}</span>
                </div>
                <div style={{ flex: 1, height: '1px', backgroundColor: '#E0E0E0' }} />
              </div>

              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px', paddingLeft: '4px' }}>
                {stageCounts.map((sc, idx) => (
                  <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '5px 12px', borderRadius: '100px', backgroundColor: `${sc.color}15`, border: `1px solid ${sc.color}30` }}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: sc.color, flexShrink: 0 }} />
                    <span style={{ fontSize: '12px', fontWeight: '600', color: sc.color }}>{sc.count}</span>
                    <span style={{ fontSize: '11px', color: '#666' }}>{sc.label}</span>
                  </div>
                ))}
              </div>

              <div style={{ backgroundColor: '#FFFFFF', borderRadius: '14px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
                <div style={{ display: 'grid', gridTemplateColumns: groupCols, padding: '10px 20px', backgroundColor: '#F7F7F7', borderBottom: '1px solid #EEEEEE' }}>
                  {groupHeaders.map(h => (
                    <span key={h} style={{ fontSize: '11px', fontWeight: '700', color: '#66', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</span>
                  ))}
                </div>

                {pageRows.map((row, idx) => {
                  const isLast = idx === pageRows.length - 1
                  const hasReward = row.stage > 0 && !!row.reward_label
                  const canNotify = showWhatsApp && hasReward && !!row.mobile_number && !!row.wa_template
                  const isNotifying = notifying === row.id

                  return (
                    <div key={row.id} style={{ display: 'grid', gridTemplateColumns: groupCols, padding: '13px 20px', borderBottom: isLast ? 'none' : '1px solid #F5F5F5', alignItems: 'center', backgroundColor: '#FFFFFF' }}>
                      <div>
                        <p style={{ fontSize: '13px', fontWeight: '700', color: '#162860', margin: 0, fontFamily: 'monospace' }}>{row.plate_combined_string || '—'}</p>
                        <p style={{ fontSize: '11px', color: '#888', margin: '2px 0 0', fontFamily: 'monospace' }}>{row.coupon_code}</p>
                      </div>
                      {showAdvisorCol && <span style={{ fontSize: '13px', color: '#444' }}>{row.advisor_name || '—'}</span>}
                      <span style={{ fontSize: '13px', color: '#444', fontFamily: 'monospace' }}>{maskMobileNumber(row.mobile_number)}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '18px', fontWeight: '700', color: '#1A1A1A' }}>{row.bmw_referrals_completed}</span>
                        {row.max_stage > 0 && (
                          <div style={{ display: 'flex', gap: '3px' }}>
                            {Array.from({ length: row.max_stage }).map((_, dotIdx) => (
                              <div key={dotIdx} style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: dotIdx < row.stage ? '#0074BD' : '#E0E0E0' }} />
                            ))}
                          </div>
                        )}
                      </div>
                      <div>
                        {hasReward ? (
                          <>
                            <span style={{ display: 'inline-block', fontSize: '11px', fontWeight: '700', padding: '3px 10px', borderRadius: '100px', backgroundColor: '#E8F4FF', color: '#0074BD', marginBottom: '3px' }}>
                              Stage {row.stage} of {row.max_stage}
                            </span>
                            <p style={{ fontSize: '12px', fontWeight: '600', color: '#1A1A1A', margin: 0 }}>{row.reward_label}</p>
                            {row.reward_description && <p style={{ fontSize: '11px', color: '#888', margin: '1px 0 0' }}>{row.reward_description}</p>}
                          </>
                        ) : (
                          <span style={{ fontSize: '12px', color: '#888' }}>No reward yet</span>
                        )}
                      </div>
                      {showLastNotified && (
                        <div>
                          {row.last_notified_at ? (() => {
                            const val = row.last_notified_at
                            const notifiedBeforeStageChange = row.stage_updated_at && val < row.stage_updated_at
                            return (
                              <>
                                <p style={{ fontSize: '12px', color: '#444', margin: 0 }}>{formatDate(val)}</p>
                                <p style={{ fontSize: '11px', color: '#888', margin: '2px 0 0' }}>{new Date(val).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</p>
                                {notifiedBeforeStageChange && (
                                  <span style={{ display: 'inline-block', fontSize: '10px', fontWeight: '700', color: '#f59e0b', backgroundColor: '#fef3c7', padding: '2px 7px', borderRadius: '100px', marginTop: '3px' }}>
                                    New stage reached
                                  </span>
                                )}
                              </>
                            )
                          })() : (
                            <span style={{ fontSize: '12px', color: '#888' }}>Never</span>
                          )}
                        </div>
                      )}
                      {showWhatsApp && (
                        <button
                          onClick={() => sendWhatsApp(row)}
                          disabled={!canNotify || isNotifying}
                          style={{ padding: '8px 12px', backgroundColor: canNotify ? '#25D366' : '#F0F0F0', color: canNotify ? '#FFFFFF' : '#999', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: '600', cursor: canNotify && !isNotifying ? 'pointer' : 'not-allowed', whiteSpace: 'nowrap', opacity: isNotifying ? 0.7 : 1 }}
                        >
                          {isNotifying ? '...' : 'WhatsApp'}
                        </button>
                      )}
                    </div>
                  )
                })}

                <Pagination
                  total={group.rows.length}
                  page={currentPage}
                  onPage={p => setPages(prev => ({ ...prev, [group.offer_id]: p }))}
                />
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  // ─── Render: Advisor loyalty table (no action, no WhatsApp) ──────────────

  function renderAdvisorLoyaltyTable() {
    const filtered = advisorOfferGroups.map(group => ({
      ...group,
      rows: group.rows.filter(r => {
        if (!advisorSearch.trim()) return true
        const q = advisorSearch.toLowerCase()
        return (
          (r.plate_combined_string || '').toLowerCase().includes(q) ||
          (r.coupon_code || '').toLowerCase().includes(q)
        )
      }),
    })).filter(g => g.rows.length > 0)

    if (filtered.length === 0) {
      return (
        <div style={{ textAlign: 'center', padding: '48px', backgroundColor: '#FFFFFF', borderRadius: '16px', color: '#66', fontSize: '14px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
          {advisorSearch ? 'No coupons match your search.' : 'You have not issued any coupons yet.'}
          {!advisorSearch && (
            <div style={{ marginTop: '16px' }}>
              <button onClick={() => router.push('/create-coupon')} style={{ padding: '10px 20px', backgroundColor: '#0074BD', color: '#FFFFFF', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>
                Create your first coupon →
              </button>
            </div>
          )}
        </div>
      )
    }

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        {filtered.map(group => {
          const offerStages = advisorStagesByOffer[group.offer_id] || []
          const stageCounts: { label: string; count: number; color: string }[] = [
            { label: 'No reward yet', count: group.rows.filter(r => r.stage === 0).length, color: '#888' },
            ...offerStages.map((s: any) => ({
              label: s.reward_label || `Stage ${s.stage_number}`,
              count: group.rows.filter(r => r.stage === s.stage_number).length,
              color: ['#0074BD', '#7c3aed', '#16a34a', '#f59e0b', '#D0021B'][(s.stage_number - 1) % 5] || '#0074BD',
            })),
          ]
          const currentPage = advisorPipelinePages[group.offer_id] || 1
          const pageRows = group.rows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)
          const cols = '1.4fr 1.2fr 1fr 1.6fr'

          return (
            <div key={group.offer_id}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                <div style={{ flex: 1, height: '1px', backgroundColor: '#E0E0E0' }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 16px', backgroundColor: '#162860', borderRadius: '100px', flexShrink: 0 }}>
                  <span style={{ fontSize: '12px', fontWeight: '700', color: '#FFFFFF' }}>{group.offer_title}</span>
                  <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)' }}>·</span>
                  <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.6)' }}>{group.rows.length} coupon{group.rows.length !== 1 ? 's' : ''}</span>
                  <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)' }}>·</span>
                  <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.6)' }}>{group.maxStage} stage{group.maxStage !== 1 ? 's' : ''}</span>
                </div>
                <div style={{ flex: 1, height: '1px', backgroundColor: '#E0E0E0' }} />
              </div>

              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px', paddingLeft: '4px' }}>
                {stageCounts.map((sc, idx) => (
                  <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '5px 12px', borderRadius: '100px', backgroundColor: `${sc.color}15`, border: `1px solid ${sc.color}30` }}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: sc.color, flexShrink: 0 }} />
                    <span style={{ fontSize: '12px', fontWeight: '600', color: sc.color }}>{sc.count}</span>
                    <span style={{ fontSize: '11px', color: '#666' }}>{sc.label}</span>
                  </div>
                ))}
              </div>

              <div style={{ backgroundColor: '#FFFFFF', borderRadius: '14px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
                <div style={{ display: 'grid', gridTemplateColumns: cols, padding: '10px 20px', backgroundColor: '#F7F7F7', borderBottom: '1px solid #EEEEEE' }}>
                  {[
                    (advisorBrandsByOffer[group.offer_id]?.loyalty_brand || 'Loyalty') + ' Plate',
                    'Mobile',
                    (advisorBrandsByOffer[group.offer_id]?.referral_brand || 'Referral') + ' Referrals',
                    'Stage Progress',
                  ].map(h => (
                    <span key={h} style={{ fontSize: '11px', fontWeight: '700', color: '#66', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</span>
                  ))}
                </div>

                {pageRows.map((row, idx) => {
                  const isLast = idx === pageRows.length - 1
                  const hasReward = row.stage > 0 && !!row.reward_label
                  return (
                    <div key={row.id} style={{ display: 'grid', gridTemplateColumns: cols, padding: '13px 20px', borderBottom: isLast ? 'none' : '1px solid #F5F5F5', alignItems: 'center', backgroundColor: '#FFFFFF' }}>
                      <div>
                        <p style={{ fontSize: '13px', fontWeight: '700', color: '#162860', margin: 0, fontFamily: 'monospace' }}>{row.plate_combined_string || '—'}</p>
                        <p style={{ fontSize: '11px', color: '#888', margin: '2px 0 0', fontFamily: 'monospace' }}>{row.coupon_code}</p>
                      </div>
                      <span style={{ fontSize: '13px', color: '#444', fontFamily: 'monospace' }}>{maskMobileNumber(row.mobile_number)}</span>
                      <span style={{ fontSize: '18px', fontWeight: '700', color: '#1A1A1A' }}>{row.bmw_referrals_completed}</span>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: hasReward ? '4px' : '0' }}>
                          {row.max_stage > 0 ? (
                            <>
                              {Array.from({ length: row.max_stage }).map((_, dotIdx) => (
                                <div key={dotIdx} style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: dotIdx < row.stage ? '#0074BD' : '#E0E0E0' }} />
                              ))}
                              <span style={{ fontSize: '11px', color: '#888' }}>{row.stage}/{row.max_stage}</span>
                            </>
                          ) : <span style={{ fontSize: '12px', color: '#888' }}>—</span>}
                        </div>
                        {hasReward && (
                          <span style={{ display: 'inline-block', fontSize: '10px', fontWeight: '700', padding: '2px 8px', borderRadius: '100px', backgroundColor: '#E8F4FF', color: '#0074BD' }}>
                            {row.reward_label}
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })}

                <Pagination
                  total={group.rows.length}
                  page={currentPage}
                  onPage={p => setAdvisorPipelinePages(prev => ({ ...prev, [group.offer_id]: p }))}
                />
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  // ─── Render: Shared Advisor Performance Leaderboard ─────────────────────────

  function renderAdvisorLeaderboardSection() {
    if (leaderboardLoading) {
      return (
        <div style={{ backgroundColor: '#FFFFFF', borderRadius: '16px', padding: '24px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', marginBottom: '32px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <span style={{ fontSize: '18px' }}>🏆</span>
            <div style={{ height: '20px', width: '150px', backgroundColor: '#F0F0F0', borderRadius: '4px', animation: 'pulse 1.5s ease-in-out infinite' }} />
          </div>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} style={{ height: '48px', backgroundColor: '#F0F0F0', borderRadius: '8px', marginTop: '12px', animation: 'pulse 1.5s ease-in-out infinite' }} />
          ))}
        </div>
      )
    }

    if (!Array.isArray(leaderboardData) || leaderboardData.length === 0) {
      return (
        <div style={{ backgroundColor: '#FFFFFF', borderRadius: '16px', padding: '24px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', marginBottom: '32px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <span style={{ fontSize: '18px' }}>🏆</span>
            <h3 style={{ fontSize: '14px', fontWeight: '700', color: '#1A1A1A', margin: 0 }}>Advisor Leaderboard</h3>
          </div>
          <p style={{ fontSize: '13px', color: '#888', margin: 0 }}>No leaderboard data available.</p>
        </div>
      )
    }

    // Verify and sort client-side by score DESC as a safeguard before rendering
    const sortedLeaderboard = [...leaderboardData]
      .filter(row => row && typeof row === 'object')
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))

    if (sortedLeaderboard.length === 0) {
      return (
        <div style={{ backgroundColor: '#FFFFFF', borderRadius: '16px', padding: '24px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', marginBottom: '32px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <span style={{ fontSize: '18px' }}>🏆</span>
            <h3 style={{ fontSize: '14px', fontWeight: '700', color: '#1A1A1A', margin: 0 }}>Advisor Leaderboard</h3>
          </div>
          <p style={{ fontSize: '13px', color: '#888', margin: 0 }}>No leaderboard data available.</p>
        </div>
      )
    }

    return (
      <div style={{ backgroundColor: '#FFFFFF', borderRadius: '16px', padding: '24px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', marginBottom: '32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
          <span style={{ fontSize: '18px' }}>🏆</span>
          <h3 style={{ fontSize: '14px', fontWeight: '700', color: '#1A1A1A', margin: 0 }}>Advisor Leaderboard</h3>
          <span style={{ fontSize: '12px', color: '#888', marginLeft: 'auto' }}>Invoice Match Score (%)</span>
          <ExportButton userRole={profile?.user_role} exportUrl="/api/export/leaderboard" />
        </div>

        <div style={{ overflowX: 'auto' }}>
          <div style={{ minWidth: '600px' }}>
            {/* Table headers */}
            <div style={{ display: 'grid', gridTemplateColumns: '60px 2fr 1.2fr 1.2fr 2fr', padding: '10px 16px', backgroundColor: '#F7F7F7', borderRadius: '8px', borderBottom: '1px solid #EEEEEE', fontWeight: '700', fontSize: '11px', color: '#66', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              <span>Rank</span>
              <span>Advisor Name</span>
              <span style={{ textAlign: 'right' }}>Invoices This Month</span>
              <span style={{ textAlign: 'right' }}>Coupons This Month</span>
              <span style={{ textAlign: 'right' }}>Score</span>
            </div>

            {/* Table rows */}
            {sortedLeaderboard.map((row, idx) => {
              // Assign rank numbers AFTER sorting (from the sorted index)
              const rank = idx + 1
              const medalColors = ['#f59e0b', '#94a3b8', '#b45309']
              const isMedal = rank <= 3
              const scoreVal = typeof row.score === 'number' ? row.score : 0
              const barWidth = Math.min(100, Math.max(0, scoreVal))
              const name = row.advisor_name || 'Unknown'
              const invoices = row.invoices_count ?? 0
              const coupons = row.coupons_count ?? 0

              const rankBg = rank === 1 ? '#f59e0b' : rank === 2 ? '#94a3b8' : rank === 3 ? '#b45309' : '#F0F0F0'
              const rankText = rank <= 3 ? '#FFFFFF' : '#666'
              const glowColor = rank === 1 ? '#f59e0b' : rank === 2 ? '#94a3b8' : rank === 3 ? '#b45309' : '#9ca3af'
              const scoreColorHex = scoreVal >= 70 ? '#16a34a' : scoreVal >= 40 ? '#d97706' : '#dc2626'
              const scoreColorRgb = scoreVal >= 70 ? '22, 163, 74' : scoreVal >= 40 ? '217, 119, 6' : '220, 38, 38'

              return (
                <div
                  key={idx}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '60px 2fr 1.2fr 1.2fr 2fr',
                    padding: '14px 16px',
                    borderBottom: idx < sortedLeaderboard.length - 1 ? '1px solid #F5F5F5' : 'none',
                    alignItems: 'center',
                    fontSize: '13px',
                    color: '#1A1A1A'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <div
                      style={{
                        width: '24px',
                        height: '24px',
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '11px',
                        fontWeight: '700',
                        backgroundColor: rankBg,
                        color: rankText,
                        boxShadow: `0 0 0 2px rgba(${hexToRgbStr(glowColor)}, 0.2), 0 0 8px rgba(${hexToRgbStr(glowColor)}, 0.6)`,
                      }}
                    >
                      {rank}
                    </div>
                  </div>

                  <span style={{ fontWeight: '600' }}>{name}</span>

                  <span style={{ textAlign: 'right', fontFamily: 'monospace' }}>{invoices}</span>

                  <span style={{ textAlign: 'right', fontFamily: 'monospace' }}>{coupons}</span>

                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                    <span style={{
                      fontWeight: '700',
                      color: scoreColorHex,
                      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace'
                    }}>
                      {scoreVal.toFixed(1)}%
                    </span>
                    <div style={{ height: '4px', width: '100px', backgroundColor: '#F0F0F0', borderRadius: '100px' }}>
                      <div style={{
                        height: '100%',
                        borderRadius: '100px',
                        background: `linear-gradient(90deg, rgba(${scoreColorRgb}, 0.4), ${scoreColorHex})`,
                        width: `${barWidth}%`,
                        boxShadow: `0 1px 6px rgba(${scoreColorRgb}, 0.5)`,
                        transition: 'width 0.4s ease'
                      }} />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    )
  }

  // ─── Toast + style ────────────────────────────────────────────────────────

  const toastEl = toast && (
    <div style={{ position: 'fixed', top: '24px', right: '24px', zIndex: 2000, backgroundColor: toast.type === 'success' ? '#162860' : '#D0021B', color: '#FFFFFF', padding: '14px 20px', borderRadius: '12px', fontSize: '14px', fontWeight: '500', boxShadow: '0 4px 16px rgba(0,0,0,0.2)', animation: 'slideIn 0.2s ease' }}>
      {toast.message}
    </div>
  )
  const styleEl = <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } } @keyframes slideIn { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }`}</style>

  if (loading) return <PageSkeleton layout="stats-table" />

  // ─── RECEPTIONIST ─────────────────────────────────────────────────────────

  if (isReceptionist) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#F7F7F7', paddingTop: '16px' }}>
        {styleEl}{toastEl}
        <Navbar />
        <main style={{ padding: '0 32px 48px' }}>
          {RECEPTIONIST_COUPON_CREATION_ENABLED && (
            <>
              {/* Header */}
              <div style={{ marginBottom: '28px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                  <h1 style={{ fontSize: '22px', fontWeight: '700', color: '#1A1A1A', margin: 0 }}>Good {getGreeting()}, {profile?.full_name?.split(' ')[0] || 'there'} 👋</h1>
                </div>
                <p style={{ color: '#666666', fontSize: '14px', marginTop: '6px' }}>
                  {new Date().toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                </p>
              </div>

              {/* KPI cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '28px' }}>
                <StatCard label="Customers Served" value={receptionistScopedStats.customersServed} color="#0074BD" loading={receptionistCommissionLoading} icon="👥" subtitle="Unique customers issued Mercedes coupons" />
                <StatCard label="Coupons Issued" value={receptionistScopedStats.couponsIssued} color="#7c3aed" loading={receptionistCommissionLoading} icon="🎟️" subtitle={`${receptionistScopedStats.customersServed} Mercedes + ${receptionistScopedStats.customersServed} BMW`} />
                <StatCard label="BMW Referral Visits" value={receptionistScopedStats.referralVisits} color="#16a34a" loading={receptionistCommissionLoading} icon="🚗" subtitle="BMW coupons redeemed at service" />
                <StatCard label="Mercedes Redeemed" value={receptionistScopedStats.redeemed} color="#9333ea" loading={receptionistCommissionLoading} icon="✅" subtitle="Mercedes coupons marked redeemed" />
                <StatCard label="Customers Issued Today" value={receptionistScopedStats.issuedToday} color="#f59e0b" loading={receptionistCommissionLoading} icon="📅" subtitle="Unique customers, not coupon rows" />
                {RECEPTIONIST_COMMISSION_CARD_ENABLED && (
                  <StatCard label="Commission Earned" value={receptionistTotalCommission} color="#f59e0b" format="currency" loading={receptionistCommissionLoading} />
                )}
              </div>

              {/* Quick actions */}
              <div style={{ display: 'flex', gap: '12px', marginBottom: '36px' }}>
                <button
                  onClick={() => router.push('/create-coupon')}
                  style={{
                    padding: '12px 24px',
                    backgroundColor: '#0074BD',
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: '10px',
                    fontSize: '14px',
                    fontWeight: '600',
                    cursor: 'pointer'
                  }}
                >
                  + Create Coupon
                </button>
              </div>
            </>
          )}

          {RECEPTIONIST_COUPON_CREATION_ENABLED && (
            <>
              {/* Loyalty pipeline */}
              <SectionDivider label="Personal Overview" />
              <div style={{ marginBottom: '20px', marginTop: '24px' }}>
                <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#1A1A1A', margin: 0 }}>My Loyalty Coupon Overview</h2>
                <p style={{ color: '#66', fontSize: '14px', marginTop: '4px' }}>Stage progress for your issued loyalty coupons, grouped by offer.</p>
              </div>

              <div style={{ marginBottom: '20px' }}>
                <input value={receptionistPipelineSearch} onChange={e => setReceptionistPipelineSearch(e.target.value.replace(/[<>]/g, '').slice(0, 100))} placeholder="Search by plate or coupon code…"
                  style={{ width: '100%', padding: '10px 14px', fontSize: '14px', border: '1.5px solid #E0E0E0', borderRadius: '10px', outline: 'none', backgroundColor: '#FFFFFF', color: '#1A1A1A', boxSizing: 'border-box' }} />
              </div>

              {receptionistPipelineLoading ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '36px' }}>
                  {Array.from({ length: 2 }).map((_, i) => <div key={i} style={{ height: '180px', backgroundColor: '#F0F0F0', borderRadius: '14px', animation: 'pulse 1.5s ease-in-out infinite' }} />)}
                </div>
              ) : (
                <div style={{ marginBottom: '36px' }}>
                  {renderLoyaltyTable(receptionistOfferGroups, receptionistStagesByOffer, receptionistBrandsByOffer, receptionistPipelineSearch, receptionistPipelinePages, setReceptionistPipelinePages, false, false, false, 'all_eligible')}
                </div>
              )}
            </>
          )}

          <SectionDivider label="Loyalty Rewards Dashboard" />
          <div style={{ marginBottom: '20px' }}>
            <h2 style={{ fontSize: '22px', fontWeight: '700', color: '#1A1A1A', margin: 0 }}>Loyalty Rewards Dashboard</h2>
            <p style={{ color: '#66', fontSize: '14px', marginTop: '4px' }}>Loyalty customers eligible for rewards based on referral visits.</p>
          </div>
          <div style={{ display: 'flex', gap: '4px', marginBottom: '16px', backgroundColor: '#FFFFFF', padding: '5px', borderRadius: '10px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', width: 'fit-content' }}>
            {([
              { key: 'notify', label: '🔔 Pending Notification' },
              { key: 'all_eligible', label: '✅ All Eligible' },
            ] as { key: 'notify' | 'all_eligible'; label: string }[]).map(t => (
              <button
                key={t.key}
                onClick={() => setLoyaltyDashboardTab(t.key)}
                style={{
                  padding: '7px 16px', border: 'none', borderRadius: '7px',
                  fontSize: '13px', fontWeight: '600', cursor: 'pointer',
                  backgroundColor: loyaltyDashboardTab === t.key ? '#162860' : 'transparent',
                  color: loyaltyDashboardTab === t.key ? '#FFFFFF' : '#666',
                  transition: 'all 0.15s',
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div style={{ marginBottom: '20px' }}>
            <input value={rSearch} onChange={e => setRSearch(e.target.value.replace(/[<>]/g, '').slice(0, 100))} placeholder="Search by plate, advisor, mobile, coupon code…"
              style={{ width: '100%', padding: '10px 14px', fontSize: '14px', border: '1.5px solid #E0E0E0', borderRadius: '10px', outline: 'none', backgroundColor: '#FFFFFF', color: '#1A1A1A', boxSizing: 'border-box' }} />
          </div>
          {rLoading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {Array.from({ length: 3 }).map((_, i) => <div key={i} style={{ height: '120px', backgroundColor: '#F0F0F0', borderRadius: '14px', animation: 'pulse 1.5s ease-in-out infinite' }} />)}
            </div>
          ) : renderLoyaltyTable(offerGroups, stagesByOffer, brandsByOffer, rSearch, receptionistPages, setReceptionistPages, true, false, true, loyaltyDashboardTab)}
        </main>
      </div>
    )
  }

  // ─── ADVISOR ──────────────────────────────────────────────────────────────

  if (isAdvisor) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#F7F7F7', paddingTop: '16px' }}>
        {styleEl}{toastEl}
        <Navbar />
        <main style={{ padding: '0 32px 48px' }}>
          {/* Header */}
          <div style={{ marginBottom: '28px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              <h1 style={{ fontSize: '22px', fontWeight: '700', color: '#1A1A1A', margin: 0 }}>Good {getGreeting()}, {profile?.full_name?.split(' ')[0] || 'there'} 👋</h1>
              {profile?.advisor_code && (
                <span style={{ fontSize: '12px', fontWeight: '700', fontFamily: 'monospace', padding: '4px 12px', borderRadius: '100px', backgroundColor: '#EEF2FF', color: '#162860', border: '1px solid #C7D2FE' }}>
                  {profile.advisor_code}
                </span>
              )}
            </div>
            <p style={{ color: '#666666', fontSize: '14px', marginTop: '6px' }}>
              {new Date().toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })}
            </p>
          </div>

          {/* KPI cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '28px' }}>
            <StatCard label="Customers Served" value={advisorScopedStats.customersServed} color="#0074BD" loading={advisorLoading} icon="👥" subtitle="Unique customers issued Mercedes coupons" />
            <StatCard label="Coupons Issued" value={advisorScopedStats.couponsIssued} color="#7c3aed" loading={advisorLoading} icon="🎟️" subtitle={`${advisorScopedStats.customersServed} Mercedes + ${advisorScopedStats.customersServed} BMW`} />
            <StatCard label="BMW Referral Visits" value={advisorScopedStats.referralVisits} color="#16a34a" loading={advisorLoading} icon="🚗" subtitle="BMW coupons redeemed at service" />
            <StatCard label="Mercedes Redeemed" value={advisorScopedStats.redeemed} color="#9333ea" loading={advisorLoading} icon="✅" subtitle="Mercedes coupons marked redeemed" />
            <StatCard label="Customers Issued Today" value={advisorScopedStats.issuedToday} color="#f59e0b" loading={advisorLoading} icon="📅" subtitle="Unique customers, not coupon rows" />
            <StatCard label="Commission Earned" value={advisorTotalCommission} color="#f59e0b" loading={advisorLoading} format="currency" />
          </div>

          {/* Advisor match score leaderboard */}
          {renderAdvisorLeaderboardSection()}

          {/* Quick actions */}
          <div style={{ display: 'flex', gap: '12px', marginBottom: '36px' }}>
            <button onClick={() => router.push('/create-coupon')} style={{ padding: '12px 24px', backgroundColor: '#0074BD', color: '#FFFFFF', border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}>
              + Create Coupon
            </button>
            <button onClick={() => router.push('/coupons')} style={{ padding: '12px 24px', backgroundColor: '#FFFFFF', color: '#162860', border: '1.5px solid #162860', borderRadius: '10px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}>
              View My Coupons
            </button>
          </div>

          {/* Loyalty pipeline */}
          <div style={{ marginBottom: '20px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#1A1A1A', margin: 0 }}>My Loyalty Coupon Overview</h2>
            <p style={{ color: '#66', fontSize: '14px', marginTop: '4px' }}>Stage progress for your issued loyalty coupons, grouped by offer.</p>
          </div>

          <div style={{ marginBottom: '20px' }}>
            <input value={advisorSearch} onChange={e => setAdvisorSearch(e.target.value.replace(/[<>]/g, '').slice(0, 100))} placeholder="Search by plate or coupon code…"
              style={{ width: '100%', padding: '10px 14px', fontSize: '14px', border: '1.5px solid #E0E0E0', borderRadius: '10px', outline: 'none', backgroundColor: '#FFFFFF', color: '#1A1A1A', boxSizing: 'border-box' }} />
          </div>

          {advisorLoading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {Array.from({ length: 2 }).map((_, i) => <div key={i} style={{ height: '180px', backgroundColor: '#F0F0F0', borderRadius: '14px', animation: 'pulse 1.5s ease-in-out infinite' }} />)}
            </div>
          ) : renderAdvisorLoyaltyTable()}
        </main>
      </div>
    )
  }

  // ─── ADMIN / MANAGER / CEO / AGM ─────────────────────────────────────────

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#F7F7F7', paddingTop: '16px' }}>
      {styleEl}{toastEl}
      <Navbar />
      <main style={{ padding: '0 32px 48px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <h1 style={{ fontSize: '22px', fontWeight: '700', color: '#1A1A1A', margin: 0 }}>Good {getGreeting()}, {profile?.full_name?.split(' ')[0] || 'there'} 👋</h1>
            <p style={{ color: '#666666', fontSize: '14px', marginTop: '6px' }}>
              {new Date().toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })}
            </p>
          </div>
          {canLogInvoices && (
            <button
              onClick={() => setIsInvoiceDialogOpen(true)}
              style={{
                padding: '10px 20px',
                backgroundColor: '#162860',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: '10px',
                fontSize: '14px',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'background-color 0.2s',
              }}
            >
              Log Invoices
            </button>
          )}
        </div>

        {/* Stats grid: 5 uniform cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '32px' }}>
          <StatCard label="Customers Served" value={stats.totalCoupons} color="#0074BD" loading={loading} icon="👥" subtitle="Unique customers issued Mercedes coupons" />
          <StatCard label="Coupons Issued" value={stats.totalCouponRows} color="#7c3aed" loading={loading} icon="🎟️" subtitle={`${stats.totalCoupons} Mercedes + ${stats.totalCoupons} BMW`} />
          <StatCard label="BMW Referral Visits" value={stats.referralVisits} color="#16a34a" loading={loading} icon="🚗" subtitle="BMW coupons redeemed at service" />
          <StatCard label="Mercedes Redeemed" value={stats.redeemedCoupons} color="#9333ea" loading={loading} icon="✅" subtitle="Mercedes coupons marked redeemed" />
          <StatCard label="Customers Issued Today" value={stats.todaysCoupons} color="#f59e0b" loading={loading} icon="📅" subtitle="Unique customers, not coupon rows" />
        </div>

        {/* Advisor performance leaderboard */}
        {renderAdvisorLeaderboardSection()}

        <div style={{ backgroundColor: '#FFFFFF', borderRadius: '16px', padding: '24px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', marginBottom: '40px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <h2 style={{ fontSize: '16px', fontWeight: '700', color: '#1A1A1A', margin: 0 }}>Recent Coupons</h2>
            <button onClick={() => router.push('/coupons')} style={{ fontSize: '13px', color: '#0074BD', background: 'none', border: 'none', cursor: 'pointer', fontWeight: '500' }}>View all →</button>
          </div>
          {loading ? (
            Array.from({ length: 5 }).map((_, i) => <div key={i} style={{ height: '48px', backgroundColor: '#F0F0F0', borderRadius: '8px', marginTop: '12px', animation: 'pulse 1.5s ease-in-out infinite' }} />)
          ) : recentCoupons.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 0', color: '#666666', fontSize: '14px' }}>
              No coupons issued yet.{' '}
              <span onClick={() => router.push('/create-coupon')} style={{ color: '#0074BD', cursor: 'pointer', fontWeight: '500' }}>Create the first one →</span>
            </div>
          ) : recentCoupons.map(coupon => <RecentCouponRow key={coupon.coupon_code} coupon={coupon} />)}
        </div>

        {/* Loyalty Rewards Dashboard */}
        {isAdmin && (
          <>
            <SectionDivider label="Loyalty Rewards Dashboard" />
            <div style={{ marginBottom: '20px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#1A1A1A', margin: 0 }}>Loyalty Rewards Dashboard</h2>
              <p style={{ color: '#66', fontSize: '14px', marginTop: '4px' }}>Loyalty customers eligible for rewards based on referral visits.</p>
            </div>
            <div style={{ display: 'flex', gap: '4px', marginBottom: '16px', backgroundColor: '#FFFFFF', padding: '5px', borderRadius: '10px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', width: 'fit-content' }}>
              {([
                { key: 'notify', label: '🔔 Pending Notification' },
                { key: 'all_eligible', label: '✅ All Eligible' },
              ] as { key: 'notify' | 'all_eligible'; label: string }[]).map(t => (
                <button
                  key={t.key}
                  onClick={() => setLoyaltyDashboardTab(t.key)}
                  style={{
                    padding: '7px 16px', border: 'none', borderRadius: '7px',
                    fontSize: '13px', fontWeight: '600', cursor: 'pointer',
                    backgroundColor: loyaltyDashboardTab === t.key ? '#162860' : 'transparent',
                    color: loyaltyDashboardTab === t.key ? '#FFFFFF' : '#666',
                    transition: 'all 0.15s',
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <div style={{ marginBottom: '20px' }}>
              <input value={rSearch} onChange={e => setRSearch(e.target.value.replace(/[<>]/g, '').slice(0, 100))} placeholder="Search by plate, advisor, mobile, coupon code…"
                style={{ width: '100%', padding: '10px 14px', fontSize: '14px', border: '1.5px solid #E0E0E0', borderRadius: '10px', outline: 'none', backgroundColor: '#FFFFFF', color: '#1A1A1A', boxSizing: 'border-box' }} />
            </div>
            {rLoading ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {Array.from({ length: 3 }).map((_, i) => <div key={i} style={{ height: '120px', backgroundColor: '#F0F0F0', borderRadius: '14px', animation: 'pulse 1.5s ease-in-out infinite' }} />)}
              </div>
            ) : renderLoyaltyTable(offerGroups, stagesByOffer, brandsByOffer, rSearch, receptionistPages, setReceptionistPages, true, false, true, loyaltyDashboardTab)}

            {/* Service Advisor Dashboard */}
            <SectionDivider label="Service Advisor Dashboard" />
            <div style={{ marginTop: '48px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                  <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#1A1A1A', margin: 0 }}>Service Advisor Dashboard</h2>
                  <p style={{ color: '#66', fontSize: '14px', marginTop: '4px' }}>Coupon pipeline per advisor, grouped by offer.</p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <label style={{ fontSize: '13px', fontWeight: '600', color: '#1A1A1A', whiteSpace: 'nowrap' }}>Viewing:</label>
                  <select
                    value={selectedAdvisorId}
                    onChange={e => {
                      const val = e.target.value
                      setSelectedAdvisorId(val)
                      setAdminPipelineSearch('')
                      setAdvisorPipelinePages({})
                      loadAdminPipeline(val)
                    }}
                    style={{ padding: '9px 14px', fontSize: '13px', fontWeight: '600', border: '1.5px solid #E0E0E0', borderRadius: '10px', outline: 'none', backgroundColor: '#FFFFFF', color: '#1A1A1A', cursor: 'pointer', minWidth: '220px' }}
                  >
                    <option value="all">All Advisors (Combined)</option>
                    {advisorList.map(a => (
                      <option key={a.id} value={a.id}>{a.full_name}{a.advisor_code ? ` (${a.advisor_code})` : ''}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Admin pipeline KPIs */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', marginBottom: '24px' }}>
                {adminPipelineLoading ? (
                  Array.from({ length: 4 }).map((_, i) => <div key={i} style={{ height: '88px', backgroundColor: '#E0E0E0', borderRadius: '16px', animation: 'pulse 1.5s ease-in-out infinite' }} />)
                ) : (
                  [
                    { label: 'Coupons Issued', value: adminPipelineStats.totalIssued, color: '#162860', format: 'number' as const },
                    { label: 'Issued This Month', value: adminPipelineStats.issuedThisMonth, color: '#0074BD', format: 'number' as const },
                    { label: 'Referral Visits', value: adminPipelineStats.totalVisits, color: '#16a34a', format: 'number' as const },
                    { label: 'Commission Earned', value: adminPipelineStats.totalCommission, color: '#f59e0b', format: 'currency' as const },
                  ].map(s => {
                    const rgb = hexToRgbStr(s.color)
                    return (
                      <div key={s.label} style={{
                        background: 'linear-gradient(180deg, #FFFFFF 0%, #FCFCFC 100%)',
                        borderRadius: '16px',
                        padding: '20px 24px',
                        boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
                        border: '1px solid #F0F0F0',
                        position: 'relative',
                        overflow: 'hidden',
                      }}>
                        {/* Top Edge Thin Gradient Border Glow */}
                        <div style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          right: 0,
                          height: '3px',
                          background: `linear-gradient(90deg, rgba(${rgb}, 0.2), ${s.color}, rgba(${rgb}, 0.2))`,
                          boxShadow: `0 1px 6px rgba(${rgb}, 0.5)`,
                        }} />

                        <p style={{ fontSize: '12px', color: '#66', fontWeight: '500', margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: '0.04em', marginTop: '3px' }}>{s.label}</p>
                        <p style={{
                          fontSize: '28px',
                          fontWeight: '700',
                          color: '#1A1A1A',
                          margin: 0,
                          lineHeight: 1,
                          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                          fontVariantNumeric: 'tabular-nums',
                          letterSpacing: '0.025em'
                        }}>
                          {s.format === 'currency' ? `AED ${s.value.toLocaleString()}` : s.value.toLocaleString()}
                        </p>
                      </div>
                    )
                  })
                )}
              </div>

              <div style={{ marginBottom: '20px' }}>
                <input value={adminPipelineSearch} onChange={e => setAdminPipelineSearch(e.target.value.replace(/[<>]/g, '').slice(0, 100))} placeholder="Search by plate, advisor, coupon code…"
                  style={{ width: '100%', padding: '10px 14px', fontSize: '14px', border: '1.5px solid #E0E0E0', borderRadius: '10px', outline: 'none', backgroundColor: '#FFFFFF', color: '#1A1A1A', boxSizing: 'border-box' }} />
              </div>

              {adminPipelineLoading ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {Array.from({ length: 2 }).map((_, i) => <div key={i} style={{ height: '200px', backgroundColor: '#F0F0F0', borderRadius: '14px', animation: 'pulse 1.5s ease-in-out infinite' }} />)}
                </div>
              ) : renderLoyaltyTable(adminPipelineGroups, adminPipelineStages, adminPipelineBrands, adminPipelineSearch, advisorPipelinePages, setAdvisorPipelinePages, false, selectedAdvisorId === 'all', false, 'all_eligible')}
            </div>
          </>
        )}
      </main>

      {/* Invoice Entry Dialog */}
      {profile?.id && (
        <InvoiceEntryDialog
          isOpen={isInvoiceDialogOpen}
          onClose={() => {
            setIsInvoiceDialogOpen(false)
            loadDashboard()
          }}
          currentUserId={profile.id}
          currentUserRole={profile.user_role}
        />
      )}
    </div>
  )
}