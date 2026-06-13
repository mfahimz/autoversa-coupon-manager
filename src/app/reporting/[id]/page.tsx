'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState, useMemo } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Navbar from '@/components/layout/Navbar'
import Breadcrumb from '@/components/layout/Breadcrumb'
import { loadPermissionsForRole, checkPermission } from '@/lib/permissions'

import {
    BarChart, Bar, LineChart, Line,
    XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Offer {
    id: string
    title: string
    is_active: boolean
    coupon_cap: number | null
    visited_count: number
    commission_amount: number | null
    issuance_start_date: string | null
    issuance_end_date: string | null
    loyalty_brand: string | null
    referral_brand: string | null
    first_batch_target: number | null
}

interface Coupon {
    id: string
    coupon_type: string
    stage: number
    issue_date: string
    advisor_name: string | null
    advisor_code: string | null
    issued_by: string | null
    status: string
}

interface Appointment {
    id: string
    coupon_id: string
    status: string
    appointment_date: string
    sub_offer_name: string | null
    created_at: string
}

interface AdvisorStat {
    name: string
    code: string | null
    issued: number
    visits: number
    commission: number
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(dateStr: string): string {
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
    const [coupons, setCoupons] = useState<Coupon[]>([])
    const [appointments, setAppointments] = useState<Appointment[]>([])
    const [loading, setLoading] = useState(true)

    // Date filter
    const [dateFrom, setDateFrom] = useState('')
    const [dateTo, setDateTo] = useState('')

    // Chart granularity
    const [granularity, setGranularity] = useState<'auto' | 'daily' | 'weekly'>('auto')

    useEffect(() => { loadData() }, [offerId])

    async function loadData() {
        setLoading(true)
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { router.push('/login'); return }

        const { data: profileData } = await supabase
            .from('profiles').select('user_role, is_active').eq('id', user.id).single()

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

        const [{ data: offerData }, { data: couponData }, { data: apptData }] = await Promise.all([
            supabase.from('offers').select('id, title, is_active, coupon_cap, visited_count, commission_amount, issuance_start_date, issuance_end_date, first_batch_target, loyalty_brand, referral_brand').eq('id', offerId).single(),
            supabase.from('coupons').select('id, coupon_type, stage, issue_date, advisor_name, advisor_code, issued_by, status').eq('offer_id', offerId).order('issue_date'),
            supabase.from('appointments').select('id, coupon_id, status, appointment_date, sub_offer_name, created_at').eq('offer_id', offerId).order('appointment_date'),
        ])

        if (offerData) setOffer(offerData)
        if (couponData) setCoupons(couponData)
        if (apptData) setAppointments(apptData)

        // Auto-set date range from data
        if (couponData && couponData.length > 0) {
            setDateFrom(couponData[0].issue_date.split('T')[0])
            setDateTo(couponData[couponData.length - 1].issue_date.split('T')[0])
        }

        setLoading(false)
    }

    // ── Filtered data ──────────────────────────────────────────────────────────

    const filteredCoupons = useMemo(() => {
        if (!dateFrom && !dateTo) return coupons
        return coupons.filter(c => {
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
            if (dateFrom && d < dateFrom) return false
            if (dateTo && d > dateTo) return false
            return true
        })
    }, [appointments, dateFrom, dateTo])

    // ── Derived metrics ────────────────────────────────────────────────────────

    const loyaltyCoupons = filteredCoupons.filter(c => c.coupon_type === 'LOYALTY')
    const referralCoupons = filteredCoupons.filter(c => c.coupon_type === 'REFERRAL')
    const visited = filteredAppts.filter(a => a.status === 'visited')
    const commission = (offer?.commission_amount || 0) * visited.length

    // Stage funnel
    const stageFunnel = [
        { name: 'Stage 0 (No visits)', value: loyaltyCoupons.filter(c => c.stage === 0).length, fill: '#E0E0E0' },
        { name: 'Stage 1', value: loyaltyCoupons.filter(c => c.stage >= 1).length, fill: '#0074BD' },
        { name: 'Stage 2', value: loyaltyCoupons.filter(c => c.stage >= 2).length, fill: '#7c3aed' },
        { name: 'Stage 3', value: loyaltyCoupons.filter(c => c.stage >= 3).length, fill: '#16a34a' },
    ]

    // Issuance over time
    const effectiveGranularity = useMemo((): 'daily' | 'weekly' => {
        if (granularity !== 'auto') return granularity
        if (!dateFrom || !dateTo) return 'daily'
        const days = (new Date(dateTo).getTime() - new Date(dateFrom).getTime()) / (1000 * 60 * 60 * 24)
        return days > 30 ? 'weekly' : 'daily'
    }, [granularity, dateFrom, dateTo])

    const issuanceChart = useMemo(() => {
        const loyaltyMap = groupByPeriod(loyaltyCoupons.map(c => ({ date: c.issue_date })), effectiveGranularity)
        const referralMap = groupByPeriod(referralCoupons.map(c => ({ date: c.issue_date })), effectiveGranularity)
        const allKeys = Array.from(new Set([...Object.keys(loyaltyMap), ...Object.keys(referralMap)])).sort()
        return allKeys.map(k => ({
            date: effectiveGranularity === 'weekly'
                ? `Wk ${new Date(k).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })}`
                : new Date(k).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }),
            loyalty: loyaltyMap[k] || 0,
            referral: referralMap[k] || 0,
        }))
    }, [filteredCoupons, effectiveGranularity])

    // Appointments over time
    const apptChart = useMemo(() => {
        const visitedMap = groupByPeriod(
            visited.map(a => ({ date: a.appointment_date })),
            effectiveGranularity
        )
        const allKeys = Object.keys(visitedMap).sort()
        return allKeys.map(k => ({
            date: effectiveGranularity === 'weekly'
                ? `Wk ${new Date(k).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })}`
                : new Date(k).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }),
            Visited: visitedMap[k] || 0,
        }))
    }, [filteredAppts, effectiveGranularity])

    // Sub-offer breakdown
    const subOfferBreakdown = useMemo(() => {
        const map: Record<string, number> = {}
        filteredAppts.forEach(a => {
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
        filteredCoupons.filter(c => c.coupon_type === 'LOYALTY').forEach(c => {
            const key = c.advisor_name || 'Unknown'
            if (!map[key]) map[key] = { name: key, code: c.advisor_code, issued: 0, visits: 0, commission: 0 }
            map[key].issued++
        })
        // Count visits per advisor via Referral coupons
        const referralCouponIds = new Set(referralCoupons.map(c => c.id))
        filteredAppts.filter(a => a.status === 'visited').forEach(a => {
            // Find the Referral coupon for this appointment
            const referralCoupon = referralCoupons.find(c => c.id === a.coupon_id)
            if (!referralCoupon) return
            // Find the Loyalty coupon (same advisor)
            const loyaltyCoupon = loyaltyCoupons.find(m => m.advisor_name === referralCoupon.advisor_name)
            if (!loyaltyCoupon) return
            const key = referralCoupon.advisor_name || 'Unknown'
            if (!map[key]) map[key] = { name: key, code: referralCoupon.advisor_code, issued: 0, visits: 0, commission: 0 }
            map[key].visits++
            map[key].commission += offer?.commission_amount || 0
        })
        return Object.values(map).sort((a, b) => b.visits - a.visits)
    }, [filteredCoupons, filteredAppts, offer])

    // Appointment status breakdown
    const apptStatusBreakdown = useMemo(() => {
        const map: Record<string, number> = {}
        filteredAppts.forEach(a => { map[a.status] = (map[a.status] || 0) + 1 })
        return Object.entries(map).map(([status, count]) => ({ status, count }))
    }, [filteredAppts])

    // ── Render ─────────────────────────────────────────────────────────────────

    if (loading) {
        return (
            <div style={{ minHeight: '100vh', backgroundColor: '#F7F7F7', paddingTop: '16px' }}>
                <Navbar />
                <main style={{ padding: '0 32px 48px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '32px' }}>
                        {Array.from({ length: 5 }).map((_, i) => (
                            <div key={i} style={{ height: '80px', backgroundColor: '#E0E0E0', borderRadius: '16px', animation: 'pulse 1.5s ease-in-out infinite' }} />
                        ))}
                    </div>
                </main>
                <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }`}</style>
            </div>
        )
    }

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

    const capPct = offer.coupon_cap ? Math.min((offer.visited_count / offer.coupon_cap) * 100, 100) : null

    return (
        <div style={{ minHeight: '100vh', backgroundColor: '#F7F7F7', paddingTop: '16px' }}>
            <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }`}</style>
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
                            {offer.commission_amount && ` · AED ${offer.commission_amount} per visit`}
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
                    <div style={{ display: 'flex', gap: '6px', marginLeft: 'auto' }}>
                        {(['auto', 'daily', 'weekly'] as const).map(g => (
                            <button key={g} onClick={() => setGranularity(g)} style={{
                                padding: '6px 12px', fontSize: '12px', fontWeight: '600', border: 'none', borderRadius: '7px', cursor: 'pointer',
                                backgroundColor: granularity === g ? '#162860' : '#F0F0F0',
                                color: granularity === g ? '#FFFFFF' : '#666',
                            }}>
                                {g.charAt(0).toUpperCase() + g.slice(1)}
                            </button>
                        ))}
                    </div>
                </div>

                {/* KPI cards */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '14px', marginBottom: '28px' }}>
                    {[
                        { label: 'Total Issued', value: String(filteredCoupons.length), color: '#162860' },
                        { label: (offer.loyalty_brand || 'Loyalty') + ' Coupons', value: String(loyaltyCoupons.length), color: '#162860' },
                        { label: (offer.referral_brand || 'Referral') + ' Coupons', value: String(referralCoupons.length), color: '#0074BD' },
                        { label: 'Visited', value: String(visited.length), color: '#16a34a' },
                        { label: 'Appointments', value: String(filteredAppts.length), color: '#f59e0b' },
                        { label: 'Commission Earned', value: `AED ${commission.toLocaleString()}`, color: '#16a34a' },
                        { label: 'Stage 1+ Reached', value: String(loyaltyCoupons.filter(c => c.stage >= 1).length), color: '#0074BD' },
                        { label: 'Stage 2+ Reached', value: String(loyaltyCoupons.filter(c => c.stage >= 2).length), color: '#7c3aed' },
                        { label: 'Stage 3 Reached', value: String(loyaltyCoupons.filter(c => c.stage >= 3).length), color: '#16a34a' },
                    ].map(s => (
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
                                {offer.visited_count} / {offer.coupon_cap} ({capPct.toFixed(1)}%)
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

                    {/* Visits over time */}
                    <div style={{ backgroundColor: '#FFFFFF', borderRadius: '16px', padding: '24px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                        <h3 style={{ fontSize: '14px', fontWeight: '700', color: '#1A1A1A', margin: '0 0 4px' }}>{(offer.referral_brand || 'Referral') + ' Visits Over Time'}</h3>
                        <p style={{ fontSize: '12px', color: '#888', margin: '0 0 16px' }}>Completed visits per {effectiveGranularity === 'weekly' ? 'week' : 'day'}</p>
                        {apptChart.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '40px', color: '#888', fontSize: '13px' }}>No visits in selected range</div>
                        ) : (
                            <ResponsiveContainer width="100%" height={220}>
                                <LineChart data={apptChart} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#F0F0F0" />
                                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#888' }} />
                                    <YAxis tick={{ fontSize: 11, fill: '#888' }} allowDecimals={false} />
                                    <Tooltip contentStyle={{ fontSize: '12px', borderRadius: '8px', border: '1px solid #E0E0E0' }} />
                                    <Line dataKey="Visited" name="Visits" stroke="#16a34a" strokeWidth={2} dot={{ r: 3 }} />
                                </LineChart>
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
                                        tickFormatter={v => v.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())} />
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
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr style={{ backgroundColor: '#F7F7F7', borderBottom: '1px solid #E0E0E0' }}>
                                        {['Rank', 'Advisor', 'Code', 'Coupons Issued', (offer.referral_brand || 'Referral') + ' Visits', 'Commission Earned'].map(h => (
                                            <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: '11px', fontWeight: '700', color: '#666', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {advisorStats.map((a, i) => (
                                        <tr key={a.name} style={{ borderBottom: '1px solid #F5F5F5' }}>
                                            <td style={{ padding: '12px 16px' }}>
                                                <span style={{
                                                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                                    width: '24px', height: '24px', borderRadius: '50%', fontSize: '12px', fontWeight: '700',
                                                    backgroundColor: i === 0 ? '#f59e0b' : i === 1 ? '#94a3b8' : i === 2 ? '#b45309' : '#F0F0F0',
                                                    color: i < 3 ? '#FFFFFF' : '#666',
                                                }}>
                                                    {i + 1}
                                                </span>
                                            </td>
                                            <td style={{ padding: '12px 16px', fontSize: '13px', fontWeight: '600', color: '#1A1A1A' }}>{a.name}</td>
                                            <td style={{ padding: '12px 16px', fontSize: '12px', color: '#666', fontFamily: 'monospace' }}>{a.code || '—'}</td>
                                            <td style={{ padding: '12px 16px', fontSize: '13px', fontWeight: '700', color: '#162860' }}>{a.issued}</td>
                                            <td style={{ padding: '12px 16px', fontSize: '13px', fontWeight: '700', color: '#16a34a' }}>{a.visits}</td>
                                            <td style={{ padding: '12px 16px', fontSize: '13px', fontWeight: '700', color: '#f59e0b' }}>AED {a.commission.toLocaleString()}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

            </main>
        </div>
    )
}