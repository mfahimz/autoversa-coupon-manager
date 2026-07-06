'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Navbar from '@/components/layout/Navbar'
import PageSkeleton from '@/components/layout/PageSkeleton'
import { maskMobileNumber } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Profile {
  id?: string
  full_name: string | null
  email?: string | null
  user_role: string
  advisor_code: string | null
}

interface DashboardStats {
  totalCoupons: number
  activeCoupons: number
  redeemedCoupons: number
  expiredCoupons: number
  todaysCoupons: number
  totalAdvisors: number
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

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({ label, value, color, loading, format = 'number' }: {
  label: string; value: number; color: string; loading: boolean; format?: 'number' | 'currency'
}) {
  return (
    <div style={{
      backgroundColor: '#FFFFFF', borderRadius: '16px', padding: '24px',
      boxShadow: '0 1px 4px rgba(0,0,0,0.06)', borderLeft: `4px solid ${color}`,
      display: 'flex', flexDirection: 'column', gap: '8px',
    }}>
      <p style={{ fontSize: '13px', color: '#666666', fontWeight: '500', margin: 0 }}>{label}</p>
      {loading
        ? <div style={{ height: '36px', width: '80px', backgroundColor: '#F0F0F0', borderRadius: '8px', animation: 'pulse 1.5s ease-in-out infinite' }} />
        : <p style={{ fontSize: '32px', fontWeight: '700', color: '#1A1A1A', margin: 0, lineHeight: 1 }}>
          {format === 'currency' ? `AED ${value.toLocaleString()}` : value.toLocaleString()}
        </p>
      }
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
        <span style={{ fontSize: '12px', color: '#666666' }}>{coupon.customer_name || 'Unknown'} · {coupon.advisor_name || 'Unknown Advisor'}</span>
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
  const [stats, setStats] = useState<DashboardStats>({ totalCoupons: 0, activeCoupons: 0, redeemedCoupons: 0, expiredCoupons: 0, todaysCoupons: 0, totalAdvisors: 0 })
  const [recentCoupons, setRecentCoupons] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

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
  const [advisorLeaderboard, setAdvisorLeaderboard] = useState<{ name: string; count: number; isMe: boolean }[]>([])
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
  const [adminIssuanceLeaderboard, setAdminIssuanceLeaderboard] = useState<{ name: string; code: string | null; count: number }[]>([])
  const [sharedLeaderboard, setSharedLeaderboard] = useState<{ name: string; code: string | null; count: number }[]>([])
  const [sharedLeaderboardLoading, setSharedLeaderboardLoading] = useState(false)

  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  useEffect(() => { loadDashboard() }, [])

  function showToast(message: string, type: 'success' | 'error' = 'success') {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3500)
  }

  async function loadDashboard() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    const today = new Date().toISOString().split('T')[0]

    const [
      profileResult,
      advisorsResult,
      statsResult,
      recentResult
    ] = await Promise.all([
      supabase.from('profiles').select('user_role, full_name, advisor_code').eq('id', user.id).single(),
      supabase
        .from('profiles')
        .select('id, full_name, advisor_code, user_role')
        .in('user_role', ['SERVICE_ADVISOR', 'BMW_SERVICE_ADVISOR'])
        .eq('is_active', true)
        .order('full_name'),
      (supabase as any).rpc('get_dashboard_stats'),
      supabase.from('coupons')
        .select('coupon_code, customer_name, advisor_name, issue_date, status')
        .order('created_at', { ascending: false }).limit(8)
    ])

    const { data: profileData } = profileResult
    if (profileData) setProfile(profileData)

    const role = profileData?.user_role
    const isAdvisor = role === 'SERVICE_ADVISOR' || role === 'BMW_SERVICE_ADVISOR'
    const isAdmin = role === 'ADMIN'
    const isReceptionist = role === 'RECEPTIONIST'

    if (isAdmin || isReceptionist) loadReceptionistData()

    if (isAdmin) {
      const { data: advisors } = advisorsResult
      setAdvisorList(advisors || [])
      loadAdminPipeline('all')
    }

    const isManagerOrAGM = role === 'MANAGER' || role === 'ASSISTANT_GENERAL_MANAGER'
    if (isManagerOrAGM) {
      loadSharedLeaderboard()
    }

    if (isAdvisor) loadAdvisorSelfData(user.id)

    if (!isReceptionist && !isAdvisor) {
      const statsRow = statsResult.data?.[0]
      setStats({
        totalCoupons: statsRow?.total_coupons || 0,
        activeCoupons: statsRow?.active_coupons || 0,
        redeemedCoupons: statsRow?.redeemed_coupons || 0,
        expiredCoupons: statsRow?.expired_coupons || 0,
        todaysCoupons: statsRow?.today_coupons || 0,
        totalAdvisors: statsRow?.total_advisors || 0,
      })
      const { data: recent } = recentResult
      setRecentCoupons(recent || [])
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
    ; (allReferralCoupons || []).forEach((b: any) => {
      if (visitedCouponIds.has(b.id))
        visitedCountByLoyalty[b.parent_coupon_id] = (visitedCountByLoyalty[b.parent_coupon_id] || 0) + 1
    })

    const brandsMap: Record<string, { loyalty_brand: string | null; referral_brand: string | null }> = {}
    ; (offersData || []).forEach((o: any) => { brandsMap[o.id] = { loyalty_brand: o.loyalty_brand, referral_brand: o.referral_brand } })

    const stagesByOfferMap: Record<string, any[]> = {}
    ; (stagesData || []).forEach((s: any) => {
      if (!stagesByOfferMap[s.offer_id]) stagesByOfferMap[s.offer_id] = []
      stagesByOfferMap[s.offer_id].push(s)
    })

    const waByOfferAndStage: Record<string, string> = {}
    ; (waTemplates || []).forEach((t: any) => { waByOfferAndStage[`${t.offer_id}_${t.trigger_type}`] = t.message_body })

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

  async function loadReceptionistData() {
    setRLoading(true)
    try {
      const { data: coupons } = await supabase
        .from('coupons')
        .select('id, coupon_code, plate_combined_string, mobile_number, advisor_name, issued_by, stage, stage_updated_at, offer_id, offer_title, last_notified_at')
        .eq('coupon_type', 'LOYALTY').eq('status', 'ACTIVE')
        .order('offer_id').order('created_at', { ascending: false })

      if (!coupons || coupons.length === 0) { setOfferGroups([]); return }

      const result = await buildLoyaltyGroups(coupons)
      setOfferGroups(result.offerGroups)
      setStagesByOffer(result.stagesByOffer)
      setBrandsByOffer(result.brandsByOffer)
    } catch (e) {
      console.error('Receptionist data load error:', e)
      setOfferGroups([])
    } finally {
      setRLoading(false)
    }
  }

  // ─── Advisor self data loader ─────────────────────────────────────────────

  async function loadAdvisorSelfData(userId: string) {
    setAdvisorLoading(true)
    try {
      const now = new Date()
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]

      const { data: coupons } = await supabase
        .from('coupons')
        .select('id, coupon_code, plate_combined_string, mobile_number, advisor_name, issued_by, stage, stage_updated_at, offer_id, offer_title, last_notified_at')
        .eq('coupon_type', 'LOYALTY')
        .eq('issued_by', userId)
        .order('offer_id').order('created_at', { ascending: false })

      if (!coupons || coupons.length === 0) {
        setAdvisorTotalVisits(0)
        setAdvisorTotalCommission(0)
        setAdvisorOfferGroups([])
        // Build full leaderboard of all advisors by loyalty coupon issuance count
        const { data: allAdvisorCoupons } = await supabase
          .from('coupons')
          .select('issued_by, advisor_name')
          .eq('coupon_type', 'LOYALTY')

        const countMap: Record<string, { name: string; count: number }> = {}
        ;(allAdvisorCoupons || []).forEach((c: any) => {
          const key = c.issued_by || 'unknown'
          if (!countMap[key]) countMap[key] = { name: c.advisor_name || 'Unknown', count: 0 }
          countMap[key].count++
        })
        const leaderboard = Object.entries(countMap)
          .filter(([, v]) => v.name !== 'Unknown')
          .sort((a, b) => b[1].count - a[1].count)
          .map(([id, v]) => ({ name: v.name, count: v.count, isMe: id === userId }))
        setAdvisorLeaderboard(leaderboard)
        setAdvisorLoading(false)
        return
      }

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
      ; (offersData || []).forEach((o: any) => { commissionByOffer[o.id] = o.commission_amount || 0 })

      const visitsPerOffer: Record<string, number> = {}
      ; (visitedAppts || []).forEach((a: any) => {
        if (a.offer_id) visitsPerOffer[a.offer_id] = (visitsPerOffer[a.offer_id] || 0) + 1
      })

      let totalCommission = 0
      offerIds.forEach(oid => { totalCommission += (visitsPerOffer[oid] || 0) * (commissionByOffer[oid] || 0) })

      setAdvisorTotalVisits((visitedAppts || []).length)
      setAdvisorTotalCommission(totalCommission)

      // Build full leaderboard of all advisors by loyalty coupon issuance count
      const { data: allAdvisorCoupons } = await supabase
        .from('coupons')
        .select('issued_by, advisor_name')
        .eq('coupon_type', 'LOYALTY')

      const countMap: Record<string, { name: string; count: number }> = {}
      ;(allAdvisorCoupons || []).forEach((c: any) => {
        const key = c.issued_by || 'unknown'
        if (!countMap[key]) countMap[key] = { name: c.advisor_name || 'Unknown', count: 0 }
        countMap[key].count++
      })
      const leaderboard = Object.entries(countMap)
        .filter(([, v]) => v.name !== 'Unknown')
        .sort((a, b) => b[1].count - a[1].count)
        .map(([id, v]) => ({ name: v.name, count: v.count, isMe: id === userId }))
      setAdvisorLeaderboard(leaderboard)
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
        setAdminIssuanceLeaderboard([])
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
      ; (offersData || []).forEach((o: any) => { commissionByOffer[o.id] = o.commission_amount || 0 })

      const visitsPerOffer: Record<string, number> = {}
      ; (visitedAppts || []).forEach((a: any) => {
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

      const leaderboardMap: Record<string, { name: string; code: string | null; count: number }> = {}
      coupons.forEach((c: any) => {
        const key = c.issued_by || 'unknown'
        if (!leaderboardMap[key]) leaderboardMap[key] = { name: c.advisor_name || 'Unknown', code: null, count: 0 }
        leaderboardMap[key].count++
      })
      // Attach advisor codes from advisorList
      const leaderboard = Object.values(leaderboardMap)
        .filter(e => e.name !== 'Unknown')
        .sort((a, b) => b.count - a.count)
        .slice(0, 5)
      setAdminIssuanceLeaderboard(leaderboard)
    } catch (e) {
      console.error('Admin pipeline error:', e)
      setAdminPipelineGroups([])
    } finally {
      setAdminPipelineLoading(false)
    }
  }

  async function loadSharedLeaderboard() {
    setSharedLeaderboardLoading(true)
    try {
      const { data: coupons } = await supabase
        .from('coupons')
        .select('issued_by, advisor_name')
        .eq('coupon_type', 'LOYALTY')

      const map: Record<string, { name: string; code: string | null; count: number }> = {}
      ;(coupons || []).forEach((c: any) => {
        const key = c.issued_by || 'unknown'
        if (!map[key]) map[key] = { name: c.advisor_name || 'Unknown', code: null, count: 0 }
        map[key].count++
      })
      const leaderboard = Object.values(map)
        .filter(e => e.name !== 'Unknown')
        .sort((a, b) => b.count - a.count)
        .slice(0, 5)
      setSharedLeaderboard(leaderboard)
    } catch (e) {
      console.error('Shared leaderboard error:', e)
    } finally {
      setSharedLeaderboardLoading(false)
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
  const isManagerOrAGM = profile?.user_role === 'MANAGER' || profile?.user_role === 'ASSISTANT_GENERAL_MANAGER'

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
        <div style={{ textAlign: 'center', padding: '48px', backgroundColor: '#FFFFFF', borderRadius: '16px', color: '#666', fontSize: '14px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
          {search
            ? 'No customers match your search.'
            : loyaltyTab === 'notify'
              ? 'No customers pending notification. All eligible customers have been notified.'
              : 'No eligible loyalty customers yet.'}
        </div>
      )
    }

    const cols = showAdvisorCol
      ? (showLastNotified ? '1.2fr 1fr 1fr 1fr 1.4fr 1.2fr 120px' : '1.2fr 1fr 1fr 1fr 1.8fr 120px')
      : (showLastNotified ? '1.4fr 1.2fr 1.2fr 1fr 1.6fr 1.2fr 120px' : '1.4fr 1.2fr 1.2fr 1fr 2fr 120px')

    const headers = [
      (brands[filtered[0]?.offer_id]?.loyalty_brand || 'Loyalty') + ' Plate',
      ...(showAdvisorCol ? ['Advisor'] : []),
      'Mobile',
      (brands[filtered[0]?.offer_id]?.referral_brand || 'Referral') + ' Referrals',
      'Eligible Reward',
      ...(showLastNotified ? ['Last Notified'] : []),
      ...(showWhatsApp ? ['Action'] : []),
    ]

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
                    <span key={h} style={{ fontSize: '11px', fontWeight: '700', color: '#666', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</span>
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
        <div style={{ textAlign: 'center', padding: '48px', backgroundColor: '#FFFFFF', borderRadius: '16px', color: '#666', fontSize: '14px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
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
                    <span key={h} style={{ fontSize: '11px', fontWeight: '700', color: '#666', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</span>
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
          <div style={{ marginBottom: '20px' }}>
            <h2 style={{ fontSize: '22px', fontWeight: '700', color: '#1A1A1A', margin: 0 }}>Loyalty Rewards Dashboard</h2>
            <p style={{ color: '#666', fontSize: '14px', marginTop: '4px' }}>Loyalty customers eligible for rewards based on referral visits.</p>
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
            <input value={rSearch} onChange={e => setRSearch(e.target.value)} placeholder="Search by plate, advisor, mobile, coupon code…"
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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '28px' }}>
            <StatCard label="Referral Visits" value={advisorTotalVisits} color="#16a34a" loading={advisorLoading} />
            <StatCard label="Commission Earned" value={advisorTotalCommission} color="#f59e0b" loading={advisorLoading} format="currency" />
          </div>

          {advisorLeaderboard.length > 0 && (
            <div style={{ backgroundColor: '#FFFFFF', borderRadius: '16px', padding: '20px 24px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', marginBottom: '28px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                <span style={{ fontSize: '16px' }}>🏆</span>
                <h3 style={{ fontSize: '14px', fontWeight: '700', color: '#1A1A1A', margin: 0 }}>Top Issuers</h3>
                <span style={{ fontSize: '12px', color: '#888', marginLeft: 'auto' }}>Loyalty coupons issued</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {advisorLeaderboard.map((entry, i) => {
                  const medalColors = ['#f59e0b', '#94a3b8', '#b45309']
                  const isMedal = i < 3
                  const barWidth = advisorLeaderboard[0].count > 0 ? (entry.count / advisorLeaderboard[0].count) * 100 : 0
                  const barColor = i === 0 ? '#f59e0b' : i === 1 ? '#94a3b8' : i === 2 ? '#b45309' : '#0074BD'
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: entry.isMe ? '8px 10px' : '0', borderRadius: entry.isMe ? '10px' : '0', backgroundColor: entry.isMe ? '#F0F7FF' : 'transparent', border: entry.isMe ? '1.5px solid #0074BD' : 'none', margin: entry.isMe ? '2px 0' : '0' }}>
                      <div style={{ width: '24px', height: '24px', borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: '700', backgroundColor: isMedal ? medalColors[i] : '#F0F0F0', color: isMedal ? '#FFFFFF' : '#666' }}>
                        {i + 1}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                          <span style={{ fontSize: '13px', fontWeight: entry.isMe ? '700' : '600', color: entry.isMe ? '#0074BD' : '#1A1A1A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {entry.name}{entry.isMe ? ' (You)' : ''}
                          </span>
                          <span style={{ fontSize: '13px', fontWeight: '700', color: barColor, flexShrink: 0, marginLeft: '8px' }}>{entry.count}</span>
                        </div>
                        <div style={{ height: '5px', backgroundColor: '#F0F0F0', borderRadius: '100px', overflow: 'hidden' }}>
                          <div style={{ height: '100%', borderRadius: '100px', backgroundColor: entry.isMe ? '#0074BD' : barColor, width: `${barWidth}%`, transition: 'width 0.5s ease' }} />
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

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
            <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#1A1A1A', margin: 0 }}>My Loyalty Coupon Pipeline</h2>
            <p style={{ color: '#666', fontSize: '14px', marginTop: '4px' }}>Stage progress for your issued loyalty coupons, grouped by offer.</p>
          </div>

          <div style={{ marginBottom: '20px' }}>
            <input value={advisorSearch} onChange={e => setAdvisorSearch(e.target.value)} placeholder="Search by plate or coupon code…"
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
        <div style={{ marginBottom: '32px' }}>
          <h1 style={{ fontSize: '22px', fontWeight: '700', color: '#1A1A1A', margin: 0 }}>Good {getGreeting()}, {profile?.full_name?.split(' ')[0] || 'there'} 👋</h1>
          <p style={{ color: '#666666', fontSize: '14px', marginTop: '6px' }}>
            {new Date().toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })}
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', marginBottom: '32px' }}>
          <StatCard label="Total Coupons" value={stats.totalCoupons} color="#0074BD" loading={loading} />
          <StatCard label="Active" value={stats.activeCoupons} color="#16a34a" loading={loading} />
          <StatCard label="Redeemed" value={stats.redeemedCoupons} color="#9333ea" loading={loading} />
          <StatCard label="Expired" value={stats.expiredCoupons} color="#666666" loading={loading} />
          <StatCard label="Issued Today" value={stats.todaysCoupons} color="#f59e0b" loading={loading} />
          <StatCard label="Active Advisors" value={stats.totalAdvisors} color="#162860" loading={loading} />
        </div>

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

        {isManagerOrAGM && (
          <div style={{ backgroundColor: '#FFFFFF', borderRadius: '16px', padding: '20px 24px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', marginBottom: '40px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
              <span style={{ fontSize: '16px' }}>🏆</span>
              <h3 style={{ fontSize: '14px', fontWeight: '700', color: '#1A1A1A', margin: 0 }}>Top Issuers</h3>
              <span style={{ fontSize: '12px', color: '#888', marginLeft: 'auto' }}>Loyalty coupons issued</span>
            </div>
            {sharedLeaderboardLoading ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} style={{ height: '36px', backgroundColor: '#F0F0F0', borderRadius: '8px', animation: 'pulse 1.5s ease-in-out infinite' }} />
                ))}
              </div>
            ) : sharedLeaderboard.length === 0 ? (
              <p style={{ fontSize: '13px', color: '#888', margin: 0 }}>No coupon data yet.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {sharedLeaderboard.map((entry, i) => {
                  const medalColors = ['#f59e0b', '#94a3b8', '#b45309']
                  const isMedal = i < 3
                  const barWidth = sharedLeaderboard[0].count > 0 ? (entry.count / sharedLeaderboard[0].count) * 100 : 0
                  const barColor = i === 0 ? '#f59e0b' : i === 1 ? '#94a3b8' : i === 2 ? '#b45309' : '#0074BD'
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{ width: '24px', height: '24px', borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: '700', backgroundColor: isMedal ? medalColors[i] : '#F0F0F0', color: isMedal ? '#FFFFFF' : '#666' }}>
                        {i + 1}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                          <span style={{ fontSize: '13px', fontWeight: '600', color: '#1A1A1A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.name}</span>
                          <span style={{ fontSize: '13px', fontWeight: '700', color: barColor, flexShrink: 0, marginLeft: '8px' }}>{entry.count}</span>
                        </div>
                        <div style={{ height: '5px', backgroundColor: '#F0F0F0', borderRadius: '100px', overflow: 'hidden' }}>
                          <div style={{ height: '100%', borderRadius: '100px', backgroundColor: barColor, width: `${barWidth}%`, transition: 'width 0.5s ease' }} />
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* Loyalty Rewards Dashboard */}
        {isAdmin && (
          <>
            <div style={{ marginBottom: '20px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#1A1A1A', margin: 0 }}>Loyalty Rewards Dashboard</h2>
              <p style={{ color: '#666', fontSize: '14px', marginTop: '4px' }}>Loyalty customers eligible for rewards based on referral visits.</p>
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
              <input value={rSearch} onChange={e => setRSearch(e.target.value)} placeholder="Search by plate, advisor, mobile, coupon code…"
                style={{ width: '100%', padding: '10px 14px', fontSize: '14px', border: '1.5px solid #E0E0E0', borderRadius: '10px', outline: 'none', backgroundColor: '#FFFFFF', color: '#1A1A1A', boxSizing: 'border-box' }} />
            </div>
            {rLoading ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {Array.from({ length: 3 }).map((_, i) => <div key={i} style={{ height: '120px', backgroundColor: '#F0F0F0', borderRadius: '14px', animation: 'pulse 1.5s ease-in-out infinite' }} />)}
              </div>
            ) : renderLoyaltyTable(offerGroups, stagesByOffer, brandsByOffer, rSearch, receptionistPages, setReceptionistPages, true, false, true, loyaltyDashboardTab)}

            {/* Service Advisor Dashboard */}
            <div style={{ marginTop: '48px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                  <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#1A1A1A', margin: 0 }}>Service Advisor Dashboard</h2>
                  <p style={{ color: '#666', fontSize: '14px', marginTop: '4px' }}>Coupon pipeline per advisor, grouped by offer.</p>
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
                  ].map(s => (
                    <div key={s.label} style={{ backgroundColor: '#FFFFFF', borderRadius: '16px', padding: '20px 24px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', borderLeft: `4px solid ${s.color}` }}>
                      <p style={{ fontSize: '12px', color: '#666', fontWeight: '500', margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{s.label}</p>
                      <p style={{ fontSize: '28px', fontWeight: '700', color: '#1A1A1A', margin: 0, lineHeight: 1 }}>
                        {s.format === 'currency' ? `AED ${s.value.toLocaleString()}` : s.value.toLocaleString()}
                      </p>
                    </div>
                  ))
                )}
              </div>

              {adminIssuanceLeaderboard.length > 0 && (
                <div style={{ backgroundColor: '#FFFFFF', borderRadius: '16px', padding: '20px 24px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', marginBottom: '24px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                    <span style={{ fontSize: '16px' }}>🏆</span>
                    <h3 style={{ fontSize: '14px', fontWeight: '700', color: '#1A1A1A', margin: 0 }}>Top Issuers</h3>
                    <span style={{ fontSize: '12px', color: '#888', marginLeft: 'auto' }}>Loyalty coupons issued</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {adminIssuanceLeaderboard.map((entry, i) => {
                      const medalColors = ['#f59e0b', '#94a3b8', '#b45309']
                      const isMedal = i < 3
                      const barWidth = adminIssuanceLeaderboard[0].count > 0 ? (entry.count / adminIssuanceLeaderboard[0].count) * 100 : 0
                      const barColor = i === 0 ? '#f59e0b' : i === 1 ? '#94a3b8' : i === 2 ? '#b45309' : '#0074BD'
                      return (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <div style={{ width: '24px', height: '24px', borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: '700', backgroundColor: isMedal ? medalColors[i] : '#F0F0F0', color: isMedal ? '#FFFFFF' : '#666' }}>
                            {i + 1}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                              <span style={{ fontSize: '13px', fontWeight: '600', color: '#1A1A1A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.name}</span>
                              <span style={{ fontSize: '13px', fontWeight: '700', color: barColor, flexShrink: 0, marginLeft: '8px' }}>{entry.count}</span>
                            </div>
                            <div style={{ height: '5px', backgroundColor: '#F0F0F0', borderRadius: '100px', overflow: 'hidden' }}>
                              <div style={{ height: '100%', borderRadius: '100px', backgroundColor: barColor, width: `${barWidth}%`, transition: 'width 0.5s ease' }} />
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              <div style={{ marginBottom: '20px' }}>
                <input value={adminPipelineSearch} onChange={e => setAdminPipelineSearch(e.target.value)} placeholder="Search by plate, advisor, coupon code…"
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
    </div>
  )
}