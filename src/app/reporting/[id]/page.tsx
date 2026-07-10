'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState, useMemo } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Navbar from '@/components/layout/Navbar'
import Breadcrumb from '@/components/layout/Breadcrumb'
import PageSkeleton from '@/components/layout/PageSkeleton'
import { loadPermissionsForRole, checkPermission } from '@/lib/permissions'
import { RECEPTIONIST_COUPON_CREATION_ENABLED } from '@/lib/featureFlags'
import ExportButton from '@/components/shared/ExportButton'

import {
    BarChart, Bar, LineChart, Line, ComposedChart,
    XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Offer {
    id: string
    title: string
    is_active: boolean | null
    coupon_cap: number | null
    visited_count: number | null
    commission_amount: number | null
    issuance_start_date: string | null
    issuance_end_date: string | null
    loyalty_brand: string | null
    referral_brand: string | null
    first_batch_target: number | null
}

interface Coupon {
    id: string
    coupon_type: string | null
    stage: number | null
    issue_date: string | null
    advisor_name: string | null
    advisor_code: string | null
    issued_by: string | null
    status: string | null
}

interface Appointment {
    id: string
    coupon_id: string | null
    status: string
    appointment_date: string | null
    sub_offer_name: string | null
    created_at: string | null
}

interface AdvisorStat {
    name: string
    code: string | null
    issued: number
    visits: number
    commission: number
}

interface CommissionSplitRow {
    id: string
    coupon_id: string
    coupon_code: string
    receptionist_id: string
    receptionist_name: string
    advisor_code: string
    advisor_name: string
    total_commission_amount: number
    receptionist_amount: number
    advisor_amount: number
    created_at: string
}

const LEADERBOARD_PAGE_SIZE = 10

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function groupByPeriod(items: { date: string }[], mode: 'daily' | 'weekly'): Record<string, number> {
    const map: Record<string, number> = {}
    items.forEach(item => {
        const d = new Date(item.date)
        let key: string
        if (mode === 'weekly') {
            const startOfWeek = new Date(d)
            startOfWeek.setDate(d.getDate() - d.getDay())
            key = startOfWeek.toISOString().split('T')[0]
        } else {
            key = item.date.split('T')[0]
        }
        map[key] = (map[key] || 0) + 1
    })
    return map
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function OfferReportPage() {
    const router = useRouter()
    const params = useParams()
    const offerId = params.id as string
    const supabase = createClient()

    const [offer, setOffer] = useState<Offer | null>(null)
    const [userRole, setUserRole] = useState<string | null>(null)
    const [coupons, setCoupons] = useState<Coupon[]>([])
    const [appointments, setAppointments] = useState<Appointment[]>([])
    const [loading, setLoading] = useState(true)

    // Splits state
    const [commissionSplits, setCommissionSplits] = useState<CommissionSplitRow[]>([])
    const [commissionSplitsLoading, setCommissionSplitsLoading] = useState(true)

    // Date filter
    const [dateFrom, setDateFrom] = useState('')
    const [dateTo, setDateTo] = useState('')

    // Chart granularity
    const [granularity, setGranularity] = useState<'auto' | 'daily' | 'weekly'>('auto')
    const [leaderboardPage, setLeaderboardPage] = useState(1)
    const [offerStages, setOfferStages] = useState<{ stage_number: number; reward_label: string }[]>([])

    useEffect(() => { loadData() }, [offerId])

    useEffect(() => {
      setLeaderboardPage(1)
    }, [dateFrom, dateTo])

    async function loadData() {
        setLoading(true)
        if (RECEPTIONIST_COUPON_CREATION_ENABLED) {
            setCommissionSplitsLoading(true)
        }
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { router.push('/login'); return }

        // Start splits query concurrently if flag is enabled
        let splitsPromise = null
        if (RECEPTIONIST_COUPON_CREATION_ENABLED) {
            splitsPromise = supabase
                .from('coupon_commission_splits')
                .select('id, coupon_id, receptionist_id, advisor_code, advisor_name, total_commission_amount, receptionist_amount, advisor_amount, created_at')
                .eq('offer_id', offerId)
                .order('created_at', { ascending: false })
        }

        const [profileResult, offerResult, couponResult, apptResult, stagesResult, splitsResult] = await Promise.all([
            supabase.from('profiles').select('user_role, is_active').eq('id', user.id).single(),
            supabase.from('offers').select('id, title, is_active, coupon_cap, visited_count, commission_amount, issuance_start_date, issuance_end_date, first_batch_target, loyalty_brand, referral_brand').eq('id', offerId).single(),
            supabase.from('coupons').select('id, coupon_type, stage, issue_date, advisor_name, advisor_code, issued_by, status').eq('offer_id', offerId).order('issue_date'),
            supabase.from('appointments').select('id, coupon_id, status, appointment_date, sub_offer_name, created_at').eq('offer_id', offerId).order('appointment_date'),
            supabase.from('offer_stages').select('stage_number, reward_label').eq('offer_id', offerId).order('stage_number'),
            (splitsPromise || Promise.resolve({ data: null })) as any,
        ])

        const { data: profileData } = profileResult
        const { data: offerData } = offerResult
        const { data: couponData } = couponResult
        const { data: apptData } = apptResult
        const { data: stagesData } = stagesResult
        const { data: rawSplits } = splitsResult

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
        if (!checkPermission(perms, profileData.user_role, 'page:reporting', 'view')) {
            router.push('/dashboard')
            return
        }

        setUserRole(profileData.user_role)

        if (stagesData) setOfferStages(stagesData)

        if (offerData) setOffer(offerData)
        if (couponData) setCoupons(couponData)
        if (apptData) setAppointments(apptData)

        // Resolve joins for splits if splits exist
        if (RECEPTIONIST_COUPON_CREATION_ENABLED && rawSplits && rawSplits.length > 0) {
            const couponIds: string[] = Array.from(new Set<string>(rawSplits.map((s: any) => s.coupon_id as string)))
            const receptionistIds: string[] = Array.from(new Set<string>(rawSplits.map((s: any) => s.receptionist_id as string)))

            const [couponsRes, profilesRes] = await Promise.all([
                supabase.from('coupons').select('id, coupon_code').in('id', couponIds),
                supabase.from('profiles').select('id, full_name').in('id', receptionistIds),
            ])

            const couponMap = new Map(couponsRes.data?.map(c => [c.id, c.coupon_code]) || [])
            const profileMap = new Map(profilesRes.data?.map(p => [p.id, p.full_name]) || [])

            const merged: CommissionSplitRow[] = rawSplits.map((s: any) => ({
                id: s.id,
                coupon_id: s.coupon_id,
                coupon_code: couponMap.get(s.coupon_id) || '—',
                receptionist_id: s.receptionist_id,
                receptionist_name: profileMap.get(s.receptionist_id) || '—',
                advisor_code: s.advisor_code,
                advisor_name: s.advisor_name,
                total_commission_amount: s.total_commission_amount,
                receptionist_amount: s.receptionist_amount,
                advisor_amount: s.advisor_amount,
                created_at: s.created_at || '',
            }))
            setCommissionSplits(merged)
            setCommissionSplitsLoading(false)
        } else {
            setCommissionSplits([])
            setCommissionSplitsLoading(false)
        }

        // Auto-set date range from data
        if (couponData && couponData.length > 0) {
            const first = couponData[0].issue_date
            const last = couponData[couponData.length - 1].issue_date
            if (first) setDateFrom(first.split('T')[0])
            if (last) setDateTo(last.split('T')[0])
        }

        setLoading(false)
    }

    // ── Filtered data ──────────────────────────────────────────────────────────

    const filteredCoupons = useMemo(() => {
        if (!dateFrom && !dateTo) return coupons
        return coupons.filter(c => {
            if (!c.issue_date) return false
            const d = c.issue_date.split('T')[0]
            if (dateFrom && d < dateFrom) return false
            if (dateTo && d > dateTo) return false
            return true
        })
    }, [coupons, dateFrom, dateTo])

    const filteredAppts = useMemo(() => {
        if (!dateFrom && !dateTo) return appointments
        return appointments.filter(a => {
            const d = a.appointment_date
            if (!d) return false
            if (dateFrom && d < dateFrom) return false
            if (dateTo && d > dateTo) return false
            return true
        })
    }, [appointments, dateFrom, dateTo])

    const filteredCommissionSplits = useMemo(() => {
        if (!dateFrom && !dateTo) return commissionSplits
        return commissionSplits.filter(cs => {
            if (!cs.created_at) return false
            const d = cs.created_at.split('T')[0]
            if (dateFrom && d < dateFrom) return false
            if (dateTo && d > dateTo) return false
            return true
        })
    }, [commissionSplits, dateFrom, dateTo])

    const commissionSplitSummary = useMemo(() => {
        const groups: Record<string, {
            receptionist_id: string
            receptionist_name: string
            advisor_code: string
            advisor_name: string
            splits_count: number
            total_receptionist_earnings: number
            total_advisor_earnings: number
        }> = {}

        filteredCommissionSplits.forEach(split => {
            const key = `${split.receptionist_id}_${split.advisor_code}`
            if (!groups[key]) {
                groups[key] = {
                    receptionist_id: split.receptionist_id,
                    receptionist_name: split.receptionist_name,
                    advisor_code: split.advisor_code,
                    advisor_name: split.advisor_name,
                    splits_count: 0,
                    total_receptionist_earnings: 0,
                    total_advisor_earnings: 0,
                }
            }
            groups[key].splits_count++
            groups[key].total_receptionist_earnings += split.receptionist_amount
            groups[key].total_advisor_earnings += split.advisor_amount
        })

        return Object.values(groups).sort((a, b) => b.total_receptionist_earnings - a.total_receptionist_earnings)
    }, [filteredCommissionSplits])

    // ── Derived metrics ────────────────────────────────────────────────────────

    const loyaltyCoupons = filteredCoupons.filter(c => c.coupon_type === 'LOYALTY')
    const referralCoupons = filteredCoupons.filter(c => c.coupon_type === 'REFERRAL')
    const visited = filteredAppts.filter(a => a.status === 'visited')
    const commission = (offer?.commission_amount || 0) * visited.length

    // Stage funnel
    const stageFunnel = useMemo(() => {
        const stageColors = ['#0074BD', '#7c3aed', '#16a34a', '#f59e0b', '#D0021B']
        const result = [
            { name: 'Stage 0 (No visits)', value: loyaltyCoupons.filter(c => (c.stage || 0) === 0).length, fill: '#E0E0E0' },
            ...offerStages.map((s, i) => ({
                name: `Stage ${s.stage_number}${s.reward_label ? ` — ${s.reward_label}` : ''}`,
                value: loyaltyCoupons.filter(c => (c.stage || 0) >= s.stage_number).length,
                fill: stageColors[i % stageColors.length],
            })),
        ]
        return result
    }, [loyaltyCoupons, offerStages])

    // Issuance over time
    const effectiveGranularity = useMemo((): 'daily' | 'weekly' => {
        if (granularity !== 'auto') return granularity
        if (!dateFrom || !dateTo) return 'daily'
        const days = (new Date(dateTo).getTime() - new Date(dateFrom).getTime()) / (1000 * 60 * 60 * 24)
        return days > 30 ? 'weekly' : 'daily'
    }, [granularity, dateFrom, dateTo])

    const issuanceChart = useMemo(() => {
        const loyaltyMap = groupByPeriod(
            loyaltyCoupons.filter(c => c.issue_date !== null).map(c => ({ date: c.issue_date as string })),
            effectiveGranularity
        )
        const referralMap = groupByPeriod(
            referralCoupons.filter(c => c.issue_date !== null).map(c => ({ date: c.issue_date as string })),
            effectiveGranularity
        )
        const allKeys = Array.from(new Set([...Object.keys(loyaltyMap), ...Object.keys(referralMap)])).sort()
        return allKeys.map(k => ({
            date: effectiveGranularity === 'weekly'
                ? `Wk ${new Date(k).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })}`
                : new Date(k).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }),
            loyalty: loyaltyMap[k] || 0,
            referral: referralMap[k] || 0,
        }))
    }, [filteredCoupons, effectiveGranularity])

    // Appointments over time (with cumulative commission)
    const apptChart = useMemo(() => {
        const visitedMap = groupByPeriod(
            visited.filter(a => a.appointment_date !== null).map(a => ({ date: a.appointment_date as string })),
            effectiveGranularity
        )
        const allKeys = Object.keys(visitedMap).sort()
        let cumulativeCommission = 0
        return allKeys.map(k => {
            const periodVisits = visitedMap[k] || 0
            cumulativeCommission += periodVisits * (offer?.commission_amount || 0)
            return {
                date: effectiveGranularity === 'weekly'
                    ? `Wk ${new Date(k).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })}`
                    : new Date(k).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }),
                Visited: periodVisits,
                CumulativeCommission: cumulativeCommission,
            }
        })
    }, [filteredAppts, effectiveGranularity, offer])

    // Sub-offer breakdown
    const subOfferBreakdown = useMemo(() => {
        const map: Record<string, number> = {}
        filteredAppts.filter(a => a.status === 'visited').forEach(a => {
            const key = a.sub_offer_name || 'Not specified'
            map[key] = (map[key] || 0) + 1
        })
        return Object.entries(map)
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count)
    }, [filteredAppts])

    // Advisor leaderboard
    const advisorStats = useMemo((): AdvisorStat[] => {
        const map: Record<string, AdvisorStat> = {}

        // Count coupons issued per advisor using issued_by (user ID) as key
        filteredCoupons.filter(c => c.coupon_type === 'LOYALTY').forEach(c => {
            const key = c.issued_by || 'unknown'
            if (!map[key]) map[key] = { name: c.advisor_name || 'Unknown', code: c.advisor_code, issued: 0, visits: 0, commission: 0 }
            map[key].issued++
        })

        // Build a map of referral coupon id -> issued_by from loyalty coupons
        // Each referral coupon shares the same issued_by as its paired loyalty coupon
        const referralToAdvisor: Record<string, string> = {}
        filteredCoupons.filter(c => c.coupon_type === 'REFERRAL').forEach(c => {
            if (c.issued_by) referralToAdvisor[c.id] = c.issued_by
        })

        // Count visits per advisor via referral coupon appointments
        filteredAppts.filter(a => a.status === 'visited').forEach(a => {
            if (!a.coupon_id) return
            const advisorId = referralToAdvisor[a.coupon_id]
            if (!advisorId) return
            if (!map[advisorId]) return
            map[advisorId].visits++
            map[advisorId].commission += offer?.commission_amount || 0
        })

        // Remove 'unknown' advisor entry if it has no visits and name is Unknown
        if (map['unknown'] && map['unknown'].name === 'Unknown' && map['unknown'].visits === 0) {
            delete map['unknown']
        }

        return Object.values(map).sort((a, b) => b.visits - a.visits)
    }, [filteredCoupons, filteredAppts, offer])

    // Appointment status breakdown
    const apptStatusBreakdown = useMemo(() => {
        const map: Record<string, number> = {}
        filteredAppts.forEach(a => { map[a.status] = (map[a.status] || 0) + 1 })
        return Object.entries(map).map(([status, count]) => ({ status, count }))
    }, [filteredAppts])

    const leaderboardTotalPages = Math.ceil(advisorStats.length / LEADERBOARD_PAGE_SIZE)
    const paginatedLeaderboard = advisorStats.slice((leaderboardPage - 1) * LEADERBOARD_PAGE_SIZE, leaderboardPage * LEADERBOARD_PAGE_SIZE)

    if (loading) return <PageSkeleton layout="stats-charts" />

    if (!offer) {
        return (
            <div style={{ minHeight: '100vh', backgroundColor: '#F7F7F7', paddingTop: '16px' }}>
                <Navbar />
                <main style={{ padding: '0 32px' }}>
                    <p style={{ color: '#D0021B', marginTop: '32px' }}>Offer not found.</p>
                </main>
            </div>
        )
    }

    const capPct = offer.coupon_cap ? Math.min((visited.length / offer.coupon_cap) * 100, 100) : null

    const kpiCards = [
      { label: 'Total Issued', value: String(filteredCoupons.length), color: '#162860' },
      { label: (offer.loyalty_brand || 'Loyalty') + ' Coupons', value: String(loyaltyCoupons.length), color: '#162860' },
      { label: (offer.referral_brand || 'Referral') + ' Coupons', value: String(referralCoupons.length), color: '#0074BD' },
      { label: 'Invoiced', value: String(visited.length), color: '#16a34a' },
      { label: 'Conversion Rate', value: loyaltyCoupons.length > 0 ? ((visited.length / loyaltyCoupons.length) * 100).toFixed(1) + '%' : '—', color: '#0074BD' },
      { label: 'Appointments', value: String(filteredAppts.length), color: '#f59e0b' },
      { label: 'Commission Earned', value: 'AED ' + commission.toLocaleString(), color: '#16a34a' },
      ...offerStages.map((s, i) => {
        const stageColors = ['#0074BD', '#7c3aed', '#16a34a', '#f59e0b', '#D0021B']
        return {
          label: 'Stage ' + s.stage_number + (s.reward_label ? ' — ' + s.reward_label : '') + ' Reached',
          value: String(loyaltyCoupons.filter(c => (c.stage || 0) >= s.stage_number).length),
          color: stageColors[(s.stage_number - 1) % stageColors.length],
        }
      }),
    ]

    return (
        <div style={{ minHeight: '100vh', backgroundColor: '#F7F7F7', paddingTop: '16px' }}>
            <style>{`
                @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
            `}</style>
            <Navbar />
            <main style={{ padding: '0 32px 48px' }}>
                <Breadcrumb items={[
                    { label: 'Dashboard', href: '/dashboard' },
                    { label: 'Reports', href: '/reporting' },
                    { label: offer.title },
                ]} />

                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '28px' }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                            <h1 style={{ fontSize: '22px', fontWeight: '700', color: '#1A1A1A', margin: 0 }}>{offer.title}</h1>
                            <span style={{
                                fontSize: '11px', fontWeight: '600', padding: '3px 8px', borderRadius: '100px',
                                backgroundColor: offer.is_active ? '#dcfce7' : '#F0F0F0',
                                color: offer.is_active ? '#16a34a' : '#666',
                            }}>
                                {offer.is_active ? 'Active' : 'Inactive'}
                            </span>
                        </div>
                        <p style={{ color: '#666', fontSize: '13px', margin: 0 }}>
                            {offer.issuance_start_date && formatDate(offer.issuance_start_date)}
                            {offer.issuance_end_date && ` — ${formatDate(offer.issuance_end_date)}`}
                            {offer.coupon_cap && ` · Cap: ${offer.coupon_cap}`}
                            {offer.commission_amount && ` · AED ${offer.commission_amount} per visit`}{' '}
                            · Commission and visit counts reflect the selected date range
                        </p>
                    </div>
                </div>

                {/* Date filter */}
                <div style={{
                    backgroundColor: '#FFFFFF', borderRadius: '12px', padding: '16px 20px',
                    boxShadow: '0 1px 4px rgba(0,0,0,0.06)', marginBottom: '24px',
                    display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap',
                }}>
                    <span style={{ fontSize: '13px', fontWeight: '600', color: '#1A1A1A' }}>Date Range</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                            style={{ padding: '7px 10px', fontSize: '13px', border: '1.5px solid #E0E0E0', borderRadius: '8px', outline: 'none' }} />
                        <span style={{ color: '#888', fontSize: '13px' }}>to</span>
                        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                            style={{ padding: '7px 10px', fontSize: '13px', border: '1.5px solid #E0E0E0', borderRadius: '8px', outline: 'none' }} />
                    </div>
                    <div style={{ display: 'flex', gap: '6px', marginLeft: 'auto', alignItems: 'center' }}>
                        {(['auto', 'daily', 'weekly'] as const).map(g => (
                            <button key={g} onClick={() => setGranularity(g)} style={{
                                padding: '6px 12px', fontSize: '12px', fontWeight: '600', border: 'none', borderRadius: '7px', cursor: 'pointer',
                                backgroundColor: granularity === g ? '#162860' : '#F0F0F0',
                                color: granularity === g ? '#FFFFFF' : '#666',
                            }}>
                                {g.charAt(0).toUpperCase() + g.slice(1)}
                            </button>
                        ))}
                        <ExportButton
                            userRole={userRole}
                            exportUrl={`/api/export/reporting/${offerId}?${new URLSearchParams({ dateFrom, dateTo }).toString()}`}
                        />
                    </div>
                </div>

                {/* KPI cards */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '14px', marginBottom: '28px' }}>
                    {kpiCards.map(s => (
                        <div key={s.label} style={{ backgroundColor: '#FFFFFF', borderRadius: '14px', padding: '16px 18px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', borderLeft: `3px solid ${s.color}` }}>
                            <p style={{ fontSize: '11px', color: '#888', fontWeight: '500', margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{s.label}</p>
                            <p style={{ fontSize: '22px', fontWeight: '700', color: s.color, margin: 0, lineHeight: 1 }}>{s.value}</p>
                        </div>
                    ))}
                </div>

                {/* Cap progress */}
                {capPct !== null && (
                    <div style={{ backgroundColor: '#FFFFFF', borderRadius: '14px', padding: '20px 24px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', marginBottom: '24px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                            <span style={{ fontSize: '13px', fontWeight: '600', color: '#1A1A1A' }}>Cap Utilisation</span>
                            <span style={{ fontSize: '13px', fontWeight: '700', color: capPct >= 90 ? '#D0021B' : '#1A1A1A' }}>
                                {visited.length} / {offer.coupon_cap} ({capPct.toFixed(1)}%)
                            </span>
                        </div>
                        <div style={{ height: '10px', backgroundColor: '#E0E0E0', borderRadius: '100px', overflow: 'hidden' }}>
                            <div style={{
                                height: '100%', borderRadius: '100px',
                                backgroundColor: capPct >= 90 ? '#D0021B' : capPct >= 70 ? '#f59e0b' : '#0074BD',
                                width: `${capPct}%`, transition: 'width 0.5s ease',
                            }} />
                        </div>
                    </div>
                )}

                {/* Coupon status breakdown */}
                <div style={{ backgroundColor: '#FFFFFF', borderRadius: '14px', padding: '20px 24px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', marginBottom: '24px' }}>
                  <h3 style={{ fontSize: '14px', fontWeight: '700', color: '#1A1A1A', margin: '0 0 16px' }}>Loyalty Coupon Status</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '12px' }}>
                    {[
                      { label: 'Active', value: loyaltyCoupons.filter(c => c.status === 'ACTIVE').length, color: '#16a34a' },
                      { label: 'Redeemed', value: loyaltyCoupons.filter(c => c.status === 'REDEEMED').length, color: '#0074BD' },
                      { label: 'Expired', value: loyaltyCoupons.filter(c => c.status === 'EXPIRED').length, color: '#f59e0b' },
                      { label: 'Cancelled', value: loyaltyCoupons.filter(c => c.status === 'CANCELLED').length, color: '#D0021B' },
                    ].map(s => (
                      <div key={s.label} style={{ backgroundColor: '#F7F7F7', borderRadius: '10px', padding: '12px 16px', borderLeft: `3px solid ${s.color}` }}>
                        <p style={{ fontSize: '11px', color: '#888', fontWeight: '500', margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{s.label}</p>
                        <p style={{ fontSize: '20px', fontWeight: '700', color: s.color, margin: 0 }}>{s.value}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Charts grid */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '24px' }}>

                    {/* Issuance over time */}
                    <div style={{ backgroundColor: '#FFFFFF', borderRadius: '16px', padding: '24px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                        <h3 style={{ fontSize: '14px', fontWeight: '700', color: '#1A1A1A', margin: '0 0 4px' }}>Coupon Issuance Over Time</h3>
                        <p style={{ fontSize: '12px', color: '#888', margin: '0 0 16px' }}>Loyalty and Referral coupons issued per {effectiveGranularity === 'weekly' ? 'week' : 'day'}</p>
                        {issuanceChart.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '40px', color: '#888', fontSize: '13px' }}>No data in selected range</div>
                        ) : (
                            <ResponsiveContainer width="100%" height={220}>
                                <BarChart data={issuanceChart} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#F0F0F0" />
                                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#888' }} />
                                    <YAxis tick={{ fontSize: 11, fill: '#888' }} allowDecimals={false} />
                                    <Tooltip contentStyle={{ fontSize: '12px', borderRadius: '8px', border: '1px solid #E0E0E0' }} />
                                    <Legend wrapperStyle={{ fontSize: '12px' }} />
                                    <Bar dataKey="loyalty" name={(offer.loyalty_brand || 'Loyalty') + ' Coupon'} fill="#162860" radius={[3, 3, 0, 0]} />
                                    <Bar dataKey="referral" name={(offer.referral_brand || 'Referral') + ' Coupon'} fill="#0074BD" radius={[3, 3, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        )}
                    </div>

                    {/* Visits over time + cumulative commission */}
                    <div style={{ backgroundColor: '#FFFFFF', borderRadius: '16px', padding: '24px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                        <h3 style={{ fontSize: '14px', fontWeight: '700', color: '#1A1A1A', margin: '0 0 4px' }}>{(offer.referral_brand || 'Referral') + ' Invoiced Over Time'}</h3>
                        <p style={{ fontSize: '12px', color: '#888', margin: '0 0 16px' }}>Completed invoices and cumulative commission per {effectiveGranularity === 'weekly' ? 'week' : 'day'}</p>
                        {apptChart.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '40px', color: '#888', fontSize: '13px' }}>No visits in selected range</div>
                        ) : (
                            <ResponsiveContainer width="100%" height={220}>
                                <ComposedChart data={apptChart} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#F0F0F0" />
                                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#888' }} />
                                    <YAxis yAxisId="left" tick={{ fontSize: 11, fill: '#888' }} allowDecimals={false} />
                                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: '#888' }} tickFormatter={(v) => `AED ${v}`} />
                                    <Tooltip contentStyle={{ fontSize: '12px', borderRadius: '8px', border: '1px solid #E0E0E0' }}
                                        formatter={(v: any, name: string) => name === 'Cumulative Commission' ? [`AED ${Number(v).toLocaleString()}`, name] : [v, name]} />
                                    <Legend wrapperStyle={{ fontSize: '12px' }} />
                                    <Bar yAxisId="left" dataKey="Visited" name="Visits" fill="#16a34a" radius={[3, 3, 0, 0]} />
                                    <Line yAxisId="right" dataKey="CumulativeCommission" name="Cumulative Commission" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} />
                                </ComposedChart>
                            </ResponsiveContainer>
                        )}
                    </div>

                    {/* Stage funnel */}
                    <div style={{ backgroundColor: '#FFFFFF', borderRadius: '16px', padding: '24px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                        <h3 style={{ fontSize: '14px', fontWeight: '700', color: '#1A1A1A', margin: '0 0 4px' }}>{(offer.loyalty_brand || 'Loyalty') + ' Stage Funnel'}</h3>
                        <p style={{ fontSize: '12px', color: '#888', margin: '0 0 16px' }}>How many loyalty customers reached each stage</p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            {stageFunnel.map((s, i) => {
                                const max = stageFunnel[0].value || 1
                                const pct = (s.value / max) * 100
                                return (
                                    <div key={s.name}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                            <span style={{ fontSize: '12px', fontWeight: '600', color: '#1A1A1A' }}>{s.name}</span>
                                            <span style={{ fontSize: '12px', fontWeight: '700', color: s.fill === '#E0E0E0' ? '#666' : s.fill }}>{s.value}</span>
                                        </div>
                                        <div style={{ height: '8px', backgroundColor: '#F0F0F0', borderRadius: '100px', overflow: 'hidden' }}>
                                            <div style={{ height: '100%', borderRadius: '100px', backgroundColor: s.fill, width: `${pct}%`, transition: 'width 0.5s ease' }} />
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    </div>

                    {/* Appointment status breakdown */}
                    <div style={{ backgroundColor: '#FFFFFF', borderRadius: '16px', padding: '24px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                        <h3 style={{ fontSize: '14px', fontWeight: '700', color: '#1A1A1A', margin: '0 0 4px' }}>Appointment Status Breakdown</h3>
                        <p style={{ fontSize: '12px', color: '#888', margin: '0 0 16px' }}>Distribution of appointment statuses</p>
                        {apptStatusBreakdown.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '40px', color: '#888', fontSize: '13px' }}>No appointments yet</div>
                        ) : (
                            <ResponsiveContainer width="100%" height={220}>
                                <BarChart data={apptStatusBreakdown} layout="vertical" margin={{ top: 0, right: 20, left: 60, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#F0F0F0" horizontal={false} />
                                    <XAxis type="number" tick={{ fontSize: 11, fill: '#888' }} allowDecimals={false} />
                                    <YAxis dataKey="status" type="category" tick={{ fontSize: 11, fill: '#888' }} width={90}
                                        tickFormatter={v => {
                                            if (v === 'scheduled') return 'Scheduled';
                                            if (v === 'customer_not_reachable' || v === 'follow_up_confirmed') return 'Follow-up';
                                            if (v === 'visited') return 'Invoiced';
                                            return v.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase());
                                        }} />
                                    <Tooltip contentStyle={{ fontSize: '12px', borderRadius: '8px', border: '1px solid #E0E0E0' }}
                                        formatter={(v: any) => [v, 'Count']} />
                                    <Bar dataKey="count" name="Count" fill="#0074BD" radius={[0, 3, 3, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        )}
                    </div>
                </div>

                {/* Sub-offer breakdown */}
                {subOfferBreakdown.length > 0 && (
                    <div style={{ backgroundColor: '#FFFFFF', borderRadius: '16px', padding: '24px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', marginBottom: '24px' }}>
                        <h3 style={{ fontSize: '14px', fontWeight: '700', color: '#1A1A1A', margin: '0 0 4px' }}>Sub-offer Popularity</h3>
                        <p style={{ fontSize: '12px', color: '#888', margin: '0 0 16px' }}>Which services referral customers selected at booking</p>
                        <ResponsiveContainer width="100%" height={Math.max(160, subOfferBreakdown.length * 50)}>
                            <BarChart data={subOfferBreakdown} layout="vertical" margin={{ top: 0, right: 20, left: 10, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#F0F0F0" horizontal={false} />
                                <XAxis type="number" tick={{ fontSize: 11, fill: '#888' }} allowDecimals={false} />
                                <YAxis dataKey="name" type="category" tick={{ fontSize: 11, fill: '#888' }} width={160} />
                                <Tooltip contentStyle={{ fontSize: '12px', borderRadius: '8px', border: '1px solid #E0E0E0' }} formatter={(v: any) => [v, 'Bookings']} />
                                <Bar dataKey="count" name="Bookings" fill="#162860" radius={[0, 3, 3, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                )}

                {/* Advisor leaderboard */}
                <div style={{ backgroundColor: '#FFFFFF', borderRadius: '16px', padding: '24px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', marginBottom: '24px' }}>
                    <h3 style={{ fontSize: '14px', fontWeight: '700', color: '#1A1A1A', margin: '0 0 4px' }}>Advisor Leaderboard</h3>
                    <p style={{ fontSize: '12px', color: '#888', margin: '0 0 16px' }}>Ranked by referral visits completed</p>
                    {advisorStats.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '32px', color: '#888', fontSize: '13px' }}>No data yet</div>
                    ) : (
                        <>
                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                    <thead>
                                        <tr style={{ backgroundColor: '#F7F7F7', borderBottom: '1px solid #E0E0E0' }}>
                                            {['Rank', 'Advisor', 'Code', 'Coupons Issued', (offer.referral_brand || 'Referral') + ' Invoiced', 'Commission Earned'].map(h => (
                                                <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: '11px', fontWeight: '700', color: '#666', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {paginatedLeaderboard.map((a, i) => {
                                            const rank = (leaderboardPage - 1) * LEADERBOARD_PAGE_SIZE + i + 1
                                            const isTopThree = rank <= 3
                                            return (
                                                <tr key={a.name} style={{ borderBottom: '1px solid #F5F5F5' }}>
                                                    <td style={{ padding: '12px 16px' }}>
                                                        <span style={{
                                                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                                            width: '24px', height: '24px', borderRadius: '50%', fontSize: '12px', fontWeight: '700',
                                                            backgroundColor: rank === 1 ? '#f59e0b' : rank === 2 ? '#94a3b8' : rank === 3 ? '#b45309' : '#F0F0F0',
                                                            color: isTopThree ? '#FFFFFF' : '#666',
                                                        }}>
                                                            {rank}
                                                        </span>
                                                    </td>
                                                    <td style={{ padding: '12px 16px', fontSize: '13px', fontWeight: '600', color: '#1A1A1A' }}>{a.name}</td>
                                                    <td style={{ padding: '12px 16px', fontSize: '12px', color: '#666', fontFamily: 'monospace' }}>{a.code || '—'}</td>
                                                    <td style={{ padding: '12px 16px', fontSize: '13px', fontWeight: '700', color: '#162860' }}>{a.issued}</td>
                                                    <td style={{ padding: '12px 16px', fontSize: '13px', fontWeight: '700', color: '#16a34a' }}>{a.visits}</td>
                                                    <td style={{ padding: '12px 16px', fontSize: '13px', fontWeight: '700', color: '#f59e0b' }}>AED {a.commission.toLocaleString()}</td>
                                                </tr>
                                            )
                                        })}
                                    </tbody>
                                </table>
                            </div>

                            {leaderboardTotalPages > 1 && (
                                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', padding: '20px 0' }}>
                                    <button
                                        onClick={() => setLeaderboardPage(p => Math.max(1, p - 1))}
                                        disabled={leaderboardPage === 1}
                                        style={{ padding: '7px 14px', fontSize: '13px', fontWeight: '600', border: '1.5px solid #E0E0E0', borderRadius: '8px', backgroundColor: '#FFFFFF', color: leaderboardPage === 1 ? '#CCC' : '#162860', cursor: leaderboardPage === 1 ? 'not-allowed' : 'pointer' }}
                                    >
                                        ← Prev
                                    </button>
                                    {Array.from({ length: leaderboardTotalPages }, (_, i) => i + 1).filter(p => p === 1 || p === leaderboardTotalPages || Math.abs(p - leaderboardPage) <= 2).map((p, idx, arr) => (
                                        <span key={p}>
                                            {idx > 0 && arr[idx - 1] !== p - 1 && <span style={{ color: '#888', fontSize: '13px', padding: '0 4px' }}>…</span>}
                                            <button
                                                onClick={() => setLeaderboardPage(p)}
                                                style={{ padding: '7px 12px', fontSize: '13px', fontWeight: '600', border: '1.5px solid', borderColor: p === leaderboardPage ? '#0074BD' : '#E0E0E0', borderRadius: '8px', backgroundColor: p === leaderboardPage ? '#0074BD' : '#FFFFFF', color: p === leaderboardPage ? '#FFFFFF' : '#444', cursor: 'pointer', minWidth: '36px' }}
                                            >
                                                {p}
                                            </button>
                                        </span>
                                    ))}
                                    <button
                                        onClick={() => setLeaderboardPage(p => Math.min(leaderboardTotalPages, p + 1))}
                                        disabled={leaderboardPage === leaderboardTotalPages}
                                        style={{ padding: '7px 14px', fontSize: '13px', fontWeight: '600', border: '1.5px solid #E0E0E0', borderRadius: '8px', backgroundColor: '#FFFFFF', color: leaderboardPage === leaderboardTotalPages ? '#CCC' : '#162860', cursor: leaderboardPage === leaderboardTotalPages ? 'not-allowed' : 'pointer' }}
                                    >
                                        Next →
                                    </button>
                                    <span style={{ fontSize: '12px', color: '#888', marginLeft: '8px' }}>
                                        Page {leaderboardPage} of {leaderboardTotalPages}
                                    </span>
                                </div>
                            )}
                        </>
                    )}
                </div>

                {/* Receptionist Commission Splits */}
                {RECEPTIONIST_COUPON_CREATION_ENABLED && (
                    <>
                        <div style={{ backgroundColor: '#FFFFFF', borderRadius: '16px', padding: '24px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', marginBottom: '24px' }}>
                            <h3 style={{ fontSize: '14px', fontWeight: '700', color: '#1A1A1A', margin: '0 0 4px' }}>Receptionist Commission Splits</h3>
                            <p style={{ fontSize: '12px', color: '#888', margin: '0 0 16px' }}>Detailed split log for receptionist-created coupons in selected range</p>
                            
                            {commissionSplitsLoading ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                    {Array.from({ length: 4 }).map((_, i) => (
                                        <div key={i} style={{ height: '40px', backgroundColor: '#F0F0F0', borderRadius: '8px', animation: 'pulse 1.5s ease-in-out infinite' }} />
                                    ))}
                                </div>
                            ) : filteredCommissionSplits.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '32px', color: '#888', fontSize: '13px' }}>No receptionist-created coupons in this range.</div>
                            ) : (
                                <div style={{ overflowX: 'auto' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                        <thead>
                                            <tr style={{ backgroundColor: '#F7F7F7', borderBottom: '1px solid #E0E0E0' }}>
                                                {['Coupon Code', 'Receptionist', 'Advisor', 'Total Commission', 'Receptionist Share', 'Advisor Share', 'Date'].map(h => (
                                                    <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: '11px', fontWeight: '700', color: '#666', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {filteredCommissionSplits.map((cs) => (
                                                <tr key={cs.id} style={{ borderBottom: '1px solid #F5F5F5' }}>
                                                    <td style={{ padding: '12px 16px', fontSize: '13px', color: '#1A1A1A', fontFamily: 'monospace' }}>{cs.coupon_code}</td>
                                                    <td style={{ padding: '12px 16px', fontSize: '13px', fontWeight: '600', color: '#1A1A1A' }}>{cs.receptionist_name}</td>
                                                    <td style={{ padding: '12px 16px', fontSize: '13px', color: '#444' }}>{cs.advisor_name}</td>
                                                    <td style={{ padding: '12px 16px', fontSize: '13px', fontWeight: '700', color: '#162860' }}>AED {cs.total_commission_amount.toLocaleString()}</td>
                                                    <td style={{ padding: '12px 16px', fontSize: '13px', fontWeight: '700', color: '#16a34a' }}>AED {cs.receptionist_amount.toLocaleString()}</td>
                                                    <td style={{ padding: '12px 16px', fontSize: '13px', fontWeight: '700', color: '#0074BD' }}>AED {cs.advisor_amount.toLocaleString()}</td>
                                                    <td style={{ padding: '12px 16px', fontSize: '12px', color: '#666' }}>{formatDate(cs.created_at)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>

                        {/* Commission Split Summary */}
                        <div style={{ backgroundColor: '#FFFFFF', borderRadius: '16px', padding: '24px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', marginBottom: '24px' }}>
                            <h3 style={{ fontSize: '14px', fontWeight: '700', color: '#1A1A1A', margin: '0 0 4px' }}>Commission Split Summary</h3>
                            <p style={{ fontSize: '12px', color: '#888', margin: '0 0 16px' }}>Aggregated commission earnings grouped by receptionist and advisor pair</p>

                            {commissionSplitsLoading ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                    {Array.from({ length: 3 }).map((_, i) => (
                                        <div key={i} style={{ height: '40px', backgroundColor: '#F0F0F0', borderRadius: '8px', animation: 'pulse 1.5s ease-in-out infinite' }} />
                                    ))}
                                </div>
                            ) : filteredCommissionSplits.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '32px', color: '#888', fontSize: '13px' }}>No receptionist-created coupons in this range.</div>
                            ) : (
                                <div style={{ overflowX: 'auto' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                        <thead>
                                            <tr style={{ backgroundColor: '#F7F7F7', borderBottom: '1px solid #E0E0E0' }}>
                                                {['Receptionist', 'Advisor', 'Number of Splits', 'Total Receptionist Earnings', 'Total Advisor Earnings'].map(h => (
                                                    <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: '11px', fontWeight: '700', color: '#666', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {commissionSplitSummary.map((summary, idx) => (
                                                <tr key={idx} style={{ borderBottom: '1px solid #F5F5F5' }}>
                                                    <td style={{ padding: '12px 16px', fontSize: '13px', fontWeight: '600', color: '#1A1A1A' }}>{summary.receptionist_name}</td>
                                                    <td style={{ padding: '12px 16px', fontSize: '13px', color: '#444' }}>{summary.advisor_name} {summary.advisor_code ? `(${summary.advisor_code})` : ''}</td>
                                                    <td style={{ padding: '12px 16px', fontSize: '13px', fontWeight: '700', color: '#162860' }}>{summary.splits_count}</td>
                                                    <td style={{ padding: '12px 16px', fontSize: '13px', fontWeight: '700', color: '#16a34a' }}>AED {summary.total_receptionist_earnings.toLocaleString()}</td>
                                                    <td style={{ padding: '12px 16px', fontSize: '13px', fontWeight: '700', color: '#0074BD' }}>AED {summary.total_advisor_earnings.toLocaleString()}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </>
                )}

            </main>
        </div>
    )
}