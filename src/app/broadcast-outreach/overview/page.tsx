'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import Navbar from '@/components/layout/Navbar'
import Breadcrumb from '@/components/layout/Breadcrumb'
import { checkPermission, loadPermissionsForRole, PermissionsMap } from '@/lib/permissions'
import { toast } from 'sonner'
import LimitReviewModal from '@/components/broadcast/LimitReviewModal'
import { evaluateLimitRecommendation, isRecommendationDismissed, LimitRecommendation } from '@/lib/broadcastLimitAdvisor'

const supabase = createClient()

type BroadcastContact = {
    id: string
    year: number
    sent_at: string | null
    sent_by: string | null
}

type Stats = {
    total: number
    totalSent: number
    sentToday: number
    sentThisMonth: number
}

type MyStats = {
    today: number
    thisMonth: number
    total: number
}

function StatCard({ label, value, color, loading }: { label: string; value: number; color: string; loading: boolean }) {
    return (
        <div style={{ background: 'linear-gradient(180deg, #FFFFFF 0%, #FCFCFC 100%)', borderRadius: '16px', padding: '20px 22px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', border: '1px solid #F0F0F0', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: color }} />
            <p style={{ fontSize: '12px', color: '#666666', fontWeight: '600', margin: '4px 0 10px' }}>{label}</p>
            {loading ? <div style={{ height: '28px', width: '70px', borderRadius: '8px', background: '#F0F0F0', animation: 'pulse 1.5s ease-in-out infinite' }} /> : <p style={{ fontSize: '26px', fontWeight: '700', color: '#1A1A1A', margin: 0, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace' }}>{value.toLocaleString()}</p>}
        </div>
    )
}

export default function BroadcastOutreachOverviewPage() {
    const router = useRouter()
    const [loading, setLoading] = useState(true)
    const [userRole, setUserRole] = useState('')
    const [permissions, setPermissions] = useState<PermissionsMap>({})
    const [stats, setStats] = useState<Stats>({ total: 0, totalSent: 0, sentToday: 0, sentThisMonth: 0 })
    const [myStats, setMyStats] = useState<MyStats>({ today: 0, thisMonth: 0, total: 0 })
    const [byYear, setByYear] = useState<{ year: number; total: number; sent: number }[]>([])
    const [activeRecommendation, setActiveRecommendation] = useState<LimitRecommendation | null>(null)
    const [showReviewModal, setShowReviewModal] = useState(false)

    useEffect(() => {
        async function init() {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) { router.push('/login'); return }
            const { data: profile } = await supabase.from('profiles').select('user_role, is_active').eq('id', user.id).single<{ user_role: string; is_active: boolean | null }>()
            if (!profile || profile.is_active === false) { router.push('/login'); return }
            const loadedPermissions = await loadPermissionsForRole(profile.user_role)
            if (!checkPermission(loadedPermissions, profile.user_role, 'page:broadcast-outreach-overview', 'view')) { router.push('/dashboard'); return }

            setUserRole(profile.user_role)
            setPermissions(loadedPermissions)

            const [batch1, batch2, settingsResult, throttleResult] = await Promise.all([
                supabase.from('broadcast_contacts').select('id, year, sent_at, sent_by').range(0, 999),
                supabase.from('broadcast_contacts').select('id, year, sent_at, sent_by').range(1000, 1999),
                supabase.from('broadcast_settings').select('max_daily_messages').eq('id', 1).single(),
                supabase.rpc('get_broadcast_throttle_status'),
            ])

            if (!batch1.error && !batch2.error) {
                const contacts = [...(batch1.data ?? []), ...(batch2.data ?? [])] as BroadcastContact[]
                const now = new Date()
                const todayKey = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString().slice(0, 10)
                const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime()
                const sent = contacts.filter(contact => contact.sent_at)
                const throttleData = throttleResult.data?.[0]
                const sentTodayCount = throttleData?.messages_sent_today ?? sent.filter(contact => contact.sent_at && new Date(new Date(contact.sent_at).getTime() + 4 * 60 * 60 * 1000).toISOString().slice(0, 10) === todayKey).length

                setStats({
                    total: contacts.length,
                    totalSent: sent.length,
                    sentToday: sentTodayCount,
                    sentThisMonth: sent.filter(contact => new Date(contact.sent_at!).getTime() >= monthStart).length,
                })

                const mySent = sent.filter(c => c.sent_by === user.id)
                setMyStats({
                    today: mySent.filter(c => c.sent_at && new Date(new Date(c.sent_at).getTime() + 4 * 60 * 60 * 1000).toISOString().slice(0, 10) === todayKey).length,
                    thisMonth: mySent.filter(c => new Date(c.sent_at!).getTime() >= monthStart).length,
                    total: mySent.length,
                })

                const grouped = new Map<number, { total: number; sent: number }>()
                contacts.forEach(contact => {
                    const current = grouped.get(contact.year) ?? { total: 0, sent: 0 }
                    current.total += 1
                    if (contact.sent_at) current.sent += 1
                    grouped.set(contact.year, current)
                })
                setByYear(Array.from(grouped.entries()).map(([year, value]) => ({ year, ...value })).sort((a, b) => b.year - a.year))

                if (profile.user_role === 'ADMIN') {
                    const currentCap = settingsResult.data?.max_daily_messages || throttleData?.max_daily_messages || 25
                    const rec = evaluateLimitRecommendation({
                        currentMax: currentCap,
                        healthScore: Number(throttleData?.health_score ?? 100),
                        recentNegRate: throttleData?.recent_neg_rate ?? null,
                        consecutiveFailures: throttleData?.consecutive_failures ?? 0,
                        messagesSentToday: sentTodayCount,
                        recentOutcomes: throttleData?.recent_outcomes ?? 0,
                    })
                    setActiveRecommendation(rec)
                    if (rec.type !== 'hold' && !isRecommendationDismissed(rec.type, rec.recommendedMax)) {
                        setShowReviewModal(true)
                    }
                }
            } else {
                console.error('Failed to load contacts:', batch1.error || batch2.error)
                toast.error('Failed to load broadcast contacts')
            }

            setLoading(false)
        }
        init()
    }, [router])

    const canViewAllStats = checkPermission(permissions, userRole, 'action:broadcast_overview:view_all_stats', 'action')
    const canViewYearBreakdown = checkPermission(permissions, userRole, 'action:broadcast_overview:view_year_breakdown', 'action')

    return (
        <div style={{ minHeight: '100vh', background: '#F7F7F7', paddingTop: '16px' }}>
            <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }`}</style>
            <Navbar />
            <main style={{ padding: '0 32px 48px' }}>
                <Breadcrumb items={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Broadcast Outreach' }, { label: 'Overview' }]} />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', marginBottom: '28px' }}>
                    <div>
                        <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#1A1A1A', margin: 0 }}>Broadcast Outreach</h1>
                        <p style={{ color: '#666', fontSize: '14px', marginTop: '6px' }}>
                            {canViewAllStats ? 'A quick view of broadcast progress.' : 'A quick view of your broadcast activity.'}
                        </p>
                    </div>
                    <Link
                        href="/broadcast-outreach/contacts"
                        style={{ padding: '10px 18px', background: '#0074BD', color: '#FFF', borderRadius: '8px', fontSize: '13px', fontWeight: 600, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                    >
                        Open Contacts →
                    </Link>
                </div>

                {/* Active limit recommendation alert banner for Admin */}
                {userRole === 'ADMIN' && activeRecommendation && activeRecommendation.type !== 'hold' && (
                    <div style={{
                        marginBottom: '24px',
                        padding: '16px 20px',
                        borderRadius: '14px',
                        background: activeRecommendation.type === 'decrease' ? '#FFF1F2' : '#F0FDF4',
                        border: `1.5px solid ${activeRecommendation.type === 'decrease' ? '#FECDD3' : '#BBF7D0'}`,
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: '14px',
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <span style={{ fontSize: '22px' }}>{activeRecommendation.type === 'decrease' ? '⚠️' : '🚀'}</span>
                            <div>
                                <strong style={{ fontSize: '14px', color: activeRecommendation.type === 'decrease' ? '#991B1B' : '#166534' }}>
                                    {activeRecommendation.title}
                                </strong>
                                <p style={{ fontSize: '13px', color: '#475569', margin: '3px 0 0' }}>
                                    {activeRecommendation.type === 'decrease'
                                        ? `Recent delivery signals suggest lowering daily safety cap from ${activeRecommendation.currentMax} to ${activeRecommendation.recommendedMax} messages to prevent WhatsApp restrictions.`
                                        : `High account health detected! It is safe to increase your daily limit from ${activeRecommendation.currentMax} to ${activeRecommendation.recommendedMax} messages.`}
                                </p>
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: '10px' }}>
                            <button
                                onClick={() => setShowReviewModal(true)}
                                style={{
                                    padding: '9px 16px',
                                    background: activeRecommendation.type === 'decrease' ? '#DC2626' : '#0074BD',
                                    color: '#FFF',
                                    border: 'none',
                                    borderRadius: '8px',
                                    fontSize: '13px',
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                }}
                            >
                                Review & Change Limit
                            </button>
                            <Link
                                href="/broadcast-outreach/performance"
                                style={{
                                    padding: '9px 16px',
                                    background: '#FFF',
                                    color: '#334155',
                                    border: '1px solid #CBD5E1',
                                    borderRadius: '8px',
                                    fontSize: '13px',
                                    fontWeight: 600,
                                    textDecoration: 'none',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                }}
                            >
                                Algorithm Performance →
                            </Link>
                        </div>
                    </div>
                )}

                {canViewAllStats ? (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '16px', marginBottom: '28px' }}>
                        <StatCard label="Total Contacts" value={stats.total} color="#0074BD" loading={loading} />
                        <StatCard label="Sent" value={stats.totalSent} color="#16A34A" loading={loading} />
                        <StatCard label="Sent Today" value={stats.sentToday} color="#7C3AED" loading={loading} />
                        <StatCard label="Remaining" value={stats.total - stats.totalSent} color="#D0021B" loading={loading} />
                    </div>
                ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '28px' }}>
                        <StatCard label="Sent Today" value={myStats.today} color="#16A34A" loading={loading} />
                        <StatCard label="Sent This Month" value={myStats.thisMonth} color="#0074BD" loading={loading} />
                        <StatCard label="Total Sent" value={myStats.total} color="#7C3AED" loading={loading} />
                    </div>
                )}

                {/* Year Breakdown Table — only visible if user has permission */}
                {canViewYearBreakdown && (
                    <section style={{ background: '#FFF', borderRadius: '16px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', overflow: 'hidden', marginBottom: '24px' }}>
                        <div style={{ padding: '20px 24px', borderBottom: '1px solid #F0F0F0' }}>
                            <h2 style={{ fontSize: '16px', fontWeight: 700, color: '#1A1A1A', margin: 0 }}>Year Breakdown</h2>
                        </div>
                        {loading ? <div style={{ padding: '28px 24px', color: '#666', fontSize: '14px' }}>Loading contacts…</div> : byYear.length === 0 ? <div style={{ padding: '28px 24px', color: '#666', fontSize: '14px' }}>No contacts have been uploaded yet.</div> : (
                            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                                <thead>
                                    <tr style={{ background: '#162860', color: '#FFF', fontSize: '12px', textTransform: 'uppercase' }}>
                                        <th style={headerCell}>Year</th>
                                        <th style={headerCell}>Total Contacts</th>
                                        <th style={headerCell}>Sent</th>
                                        <th style={headerCell}>Remaining</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {byYear.map(row => (
                                        <tr key={row.year} style={{ borderBottom: '1px solid #F5F5F5' }}>
                                            <td style={cell}>{row.year}</td>
                                            <td style={cell}>{row.total.toLocaleString()}</td>
                                            <td style={cell}>{row.sent.toLocaleString()}</td>
                                            <td style={cell}>{(row.total - row.sent).toLocaleString()}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </section>
                )}

                {activeRecommendation && (
                    <LimitReviewModal
                        isOpen={showReviewModal}
                        onClose={() => setShowReviewModal(false)}
                        recommendation={activeRecommendation}
                        isOverviewPage={true}
                        onApply={async (newLimit) => {
                            const { error } = await supabase
                                .from('broadcast_settings')
                                .update({ max_daily_messages: newLimit, updated_at: new Date().toISOString() })
                                .eq('id', 1)
                            if (error) throw error
                            setActiveRecommendation(prev => prev ? { ...prev, currentMax: newLimit, type: 'hold' } : null)
                        }}
                    />
                )}
            </main>
        </div>
    )
}

const headerCell: React.CSSProperties = { padding: '13px 24px', fontWeight: 600 }
const cell: React.CSSProperties = { padding: '15px 24px', color: '#1A1A1A', fontSize: '14px' }
