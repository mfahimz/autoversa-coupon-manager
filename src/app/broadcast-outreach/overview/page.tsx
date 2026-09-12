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

type SenderStat = {
    userId: string
    name: string
    role: string
    email: string
    sentToday: number
    sentThisMonth: number
    totalSent: number
    lastSentAt: string | null
}

type WaveLog = {
    id: string
    daily_period_started_at: string
    daily_wave_number: number
    message_target: number
    messages_sent: number
    started_at: string
    completed_at: string
    duration_seconds: number
    cooldown_until: string | null
    cooldown_minutes: number | null
    completed_by_name: string | null
}

function formatDuration(seconds: number) {
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60
    return minutes ? `${minutes}m ${remainingSeconds}s` : `${remainingSeconds}s`
}

function formatDateTime(value: string) {
    return new Date(value).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
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
    const [currentUserId, setCurrentUserId] = useState('')
    const [userRole, setUserRole] = useState('')
    const [permissions, setPermissions] = useState<PermissionsMap>({})
    const [stats, setStats] = useState<Stats>({ total: 0, totalSent: 0, sentToday: 0, sentThisMonth: 0 })
    const [myStats, setMyStats] = useState<MyStats>({ today: 0, thisMonth: 0, total: 0 })
    const [senderStats, setSenderStats] = useState<SenderStat[]>([])
    const [byYear, setByYear] = useState<{ year: number; total: number; sent: number }[]>([])
    const [waveLogs, setWaveLogs] = useState<WaveLog[]>([])

    useEffect(() => {
        async function init() {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) { router.push('/login'); return }
            const { data: profile } = await supabase.from('profiles').select('user_role, is_active').eq('id', user.id).single<{ user_role: string; is_active: boolean | null }>()
            if (!profile || profile.is_active === false) { router.push('/login'); return }
            const loadedPermissions = await loadPermissionsForRole(profile.user_role)
            if (!checkPermission(loadedPermissions, profile.user_role, 'page:broadcast-outreach-overview', 'view')) { router.push('/dashboard'); return }

            setCurrentUserId(user.id)
            setUserRole(profile.user_role)
            setPermissions(loadedPermissions)

            const [batch1, batch2, waveLogsResult, profilesResult] = await Promise.all([
                supabase.from('broadcast_contacts').select('id, year, sent_at, sent_by').range(0, 999),
                supabase.from('broadcast_contacts').select('id, year, sent_at, sent_by').range(1000, 1999),
                supabase.from('broadcast_wave_logs').select('id, daily_period_started_at, daily_wave_number, message_target, messages_sent, started_at, completed_at, duration_seconds, cooldown_until, cooldown_minutes, completed_by_name').order('completed_at', { ascending: false }),
                supabase.from('profiles').select('id, full_name, email, user_role'),
            ])

            if (!batch1.error && !batch2.error) {
                const contacts = [...(batch1.data ?? []), ...(batch2.data ?? [])] as BroadcastContact[]
                const now = new Date()
                const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
                const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime()
                const sent = contacts.filter(contact => contact.sent_at)

                // 1. Overall stats
                setStats({
                    total: contacts.length,
                    totalSent: sent.length,
                    sentToday: sent.filter(contact => new Date(contact.sent_at!).getTime() >= todayStart).length,
                    sentThisMonth: sent.filter(contact => new Date(contact.sent_at!).getTime() >= monthStart).length,
                })

                // 2. Personal stats for logged-in user
                const mySent = sent.filter(c => c.sent_by === user.id)
                setMyStats({
                    today: mySent.filter(c => new Date(c.sent_at!).getTime() >= todayStart).length,
                    thisMonth: mySent.filter(c => new Date(c.sent_at!).getTime() >= monthStart).length,
                    total: mySent.length,
                })

                // 3. Sender breakdown
                const profilesMap = new Map((profilesResult.data ?? []).map(p => [p.id, p]))
                const sendersMap = new Map<string, { today: number; month: number; total: number; lastSent: string | null }>()

                sent.forEach(c => {
                    const senderId = c.sent_by || 'unknown'
                    const cur = sendersMap.get(senderId) ?? { today: 0, month: 0, total: 0, lastSent: null }
                    cur.total += 1
                    const sentMs = new Date(c.sent_at!).getTime()
                    if (sentMs >= todayStart) cur.today += 1
                    if (sentMs >= monthStart) cur.month += 1
                    if (!cur.lastSent || sentMs > new Date(cur.lastSent).getTime()) cur.lastSent = c.sent_at
                    sendersMap.set(senderId, cur)
                })

                const breakdownList: SenderStat[] = Array.from(sendersMap.entries()).map(([senderId, data]) => {
                    const prof = profilesMap.get(senderId)
                    return {
                        userId: senderId,
                        name: prof?.full_name || (senderId === user.id ? 'You' : 'Unknown Operator'),
                        role: prof?.user_role || 'STAFF',
                        email: prof?.email || '—',
                        sentToday: data.today,
                        sentThisMonth: data.month,
                        totalSent: data.total,
                        lastSentAt: data.lastSent,
                    }
                }).sort((a, b) => b.totalSent - a.totalSent)

                setSenderStats(breakdownList)

                // 4. Year Breakdown
                const grouped = new Map<number, { total: number; sent: number }>()
                contacts.forEach(contact => {
                    const current = grouped.get(contact.year) ?? { total: 0, sent: 0 }
                    current.total += 1
                    if (contact.sent_at) current.sent += 1
                    grouped.set(contact.year, current)
                })
                setByYear(Array.from(grouped.entries()).map(([year, value]) => ({ year, ...value })).sort((a, b) => b.year - a.year))
            } else {
                console.error('Failed to load contacts:', batch1.error || batch2.error)
                toast.error('Failed to load broadcast contacts')
            }

            if (!waveLogsResult.error) {
                setWaveLogs((waveLogsResult.data ?? []) as WaveLog[])
            } else {
                console.error('Failed to load wave logs:', waveLogsResult.error)
                toast.error('Failed to load wave history')
            }
            setLoading(false)
        }
        init()
    }, [router])

    const canViewAllStats = checkPermission(permissions, userRole, 'action:broadcast_overview:view_all_stats', 'action')
    const canViewSenderBreakdown = checkPermission(permissions, userRole, 'action:broadcast_overview:view_sender_breakdown', 'action')
    const canViewYearBreakdown = checkPermission(permissions, userRole, 'action:broadcast_overview:view_year_breakdown', 'action')
    const canViewWaveLogs = checkPermission(permissions, userRole, 'action:broadcast_overview:view_wave_logs', 'action')

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
                            {canViewAllStats ? 'Contact-list and WhatsApp outreach performance summary.' : 'Your personal WhatsApp dispatch performance summary.'}
                        </p>
                    </div>
                    <Link
                        href="/broadcast-outreach/contacts"
                        style={{ padding: '10px 18px', background: '#0074BD', color: '#FFF', borderRadius: '8px', fontSize: '13px', fontWeight: 600, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                    >
                        Go to Contacts Dispatch →
                    </Link>
                </div>

                {/* Metrics Cards: Company Macro Stats for Admin/Manager OR Personal Dispatch Stats for Senders */}
                {canViewAllStats ? (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '16px', marginBottom: '28px' }}>
                        <StatCard label="Total Contacts" value={stats.total} color="#0074BD" loading={loading} />
                        <StatCard label="Total Sent (All)" value={stats.totalSent} color="#16A34A" loading={loading} />
                        <StatCard label="Sent Today (All)" value={stats.sentToday} color="#7C3AED" loading={loading} />
                        <StatCard label="Sent This Month" value={stats.sentThisMonth} color="#D97706" loading={loading} />
                        <StatCard label="Remaining / Unsent" value={stats.total - stats.totalSent} color="#D0021B" loading={loading} />
                    </div>
                ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '28px' }}>
                        <StatCard label="My Messages Sent Today" value={myStats.today} color="#16A34A" loading={loading} />
                        <StatCard label="My Messages This Month" value={myStats.thisMonth} color="#0074BD" loading={loading} />
                        <StatCard label="My Total All-Time Dispatches" value={myStats.total} color="#7C3AED" loading={loading} />
                    </div>
                )}

                {/* Sender Performance Breakdown Table — for Admins / Managers */}
                {canViewSenderBreakdown && (
                    <section style={{ background: '#FFF', borderRadius: '16px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', overflow: 'hidden', marginBottom: '24px' }}>
                        <div style={{ padding: '20px 24px', borderBottom: '1px solid #F0F0F0' }}>
                            <h2 style={{ fontSize: '16px', fontWeight: 700, color: '#1A1A1A', margin: 0 }}>Sender & Operator Performance</h2>
                            <p style={{ fontSize: '13px', color: '#666', margin: '5px 0 0' }}>Dispatches completed per team member.</p>
                        </div>
                        {loading ? <div style={{ padding: '28px 24px', color: '#666', fontSize: '14px' }}>Loading sender metrics…</div> : senderStats.length === 0 ? <div style={{ padding: '28px 24px', color: '#666', fontSize: '14px' }}>No messages sent yet.</div> : (
                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', minWidth: '700px', borderCollapse: 'collapse', textAlign: 'left' }}>
                                    <thead>
                                        <tr style={{ background: '#162860', color: '#FFF', fontSize: '12px', textTransform: 'uppercase' }}>
                                            <th style={headerCell}>Sender / Operator</th>
                                            <th style={headerCell}>Role</th>
                                            <th style={headerCell}>Sent Today</th>
                                            <th style={headerCell}>Sent This Month</th>
                                            <th style={headerCell}>Total Dispatched</th>
                                            <th style={headerCell}>Last Active</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {senderStats.map(s => (
                                            <tr key={s.userId} style={{ borderBottom: '1px solid #F5F5F5' }}>
                                                <td style={cell}>
                                                    <div style={{ fontWeight: 600, color: s.userId === currentUserId ? '#0074BD' : '#1A1A1A' }}>
                                                        {s.name} {s.userId === currentUserId && <span style={{ fontSize: '11px', background: '#E0F2FE', color: '#0369A1', padding: '2px 6px', borderRadius: '4px', marginLeft: '6px' }}>You</span>}
                                                    </div>
                                                    <div style={{ fontSize: '12px', color: '#888' }}>{s.email}</div>
                                                </td>
                                                <td style={cell}>
                                                    <span style={{ fontSize: '11px', fontWeight: 700, background: '#F1F5F9', color: '#475569', padding: '3px 8px', borderRadius: '6px' }}>
                                                        {s.role}
                                                    </span>
                                                </td>
                                                <td style={cell}><strong>{s.sentToday.toLocaleString()}</strong></td>
                                                <td style={cell}>{s.sentThisMonth.toLocaleString()}</td>
                                                <td style={cell}><strong style={{ color: '#16A34A' }}>{s.totalSent.toLocaleString()}</strong></td>
                                                <td style={cell}>{s.lastSentAt ? formatDateTime(s.lastSentAt) : '—'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </section>
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

                {/* Wave Performance Logs Table — only visible if user has permission */}
                {canViewWaveLogs && (
                    <section style={{ background: '#FFF', borderRadius: '16px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
                        <div style={{ padding: '20px 24px', borderBottom: '1px solid #F0F0F0' }}>
                            <h2 style={{ fontSize: '16px', fontWeight: 700, color: '#1A1A1A', margin: 0 }}>Wave Performance</h2>
                            <p style={{ fontSize: '13px', color: '#666', margin: '5px 0 0' }}>Completed waves and their delivery performance.</p>
                        </div>
                        {loading ? <div style={{ padding: '28px 24px', color: '#666', fontSize: '14px' }}>Loading wave history…</div> : waveLogs.length === 0 ? <div style={{ padding: '28px 24px', color: '#666', fontSize: '14px' }}>No completed waves yet.</div> : (
                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', minWidth: '1060px', borderCollapse: 'collapse', textAlign: 'left' }}>
                                    <thead>
                                        <tr style={{ background: '#162860', color: '#FFF', fontSize: '12px', textTransform: 'uppercase' }}>
                                            <th style={headerCell}>Wave</th>
                                            <th style={headerCell}>Messages</th>
                                            <th style={headerCell}>Started</th>
                                            <th style={headerCell}>Completed</th>
                                            <th style={headerCell}>Duration</th>
                                            <th style={headerCell}>Next Wave</th>
                                            <th style={headerCell}>Completed By</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {waveLogs.map(log => (
                                            <tr key={log.id} style={{ borderBottom: '1px solid #F5F5F5' }}>
                                                <td style={cell}><strong>#{log.daily_wave_number}</strong></td>
                                                <td style={cell}><strong>{log.messages_sent} messages</strong></td>
                                                <td style={cell}>{formatDateTime(log.started_at)}</td>
                                                <td style={cell}>{formatDateTime(log.completed_at)}</td>
                                                <td style={cell}>{formatDuration(log.duration_seconds)}</td>
                                                <td style={cell}>{log.cooldown_minutes !== null ? `In ${log.cooldown_minutes} min` : '—'}</td>
                                                <td style={cell}>{log.completed_by_name || '—'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </section>
                )}

                {/* Personal Sender Activity Notice */}
                {!canViewAllStats && (
                    <div style={{ marginTop: '24px', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '22px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
                        <div>
                            <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#1E293B', margin: '0 0 4px' }}>Personal Performance Tracked</h3>
                            <p style={{ fontSize: '13px', color: '#64748B', margin: 0 }}>
                                Every message you dispatch is automatically logged under your profile. Keep up the great work!
                            </p>
                        </div>
                        <Link
                            href="/broadcast-outreach/contacts"
                            style={{ padding: '8px 16px', background: '#162860', color: '#FFF', borderRadius: '8px', fontSize: '12px', fontWeight: 600, textDecoration: 'none' }}
                        >
                            Open Sender Queue →
                        </Link>
                    </div>
                )}
            </main>
        </div>
    )
}

const headerCell: React.CSSProperties = { padding: '13px 24px', fontWeight: 600 }
const cell: React.CSSProperties = { padding: '15px 24px', color: '#1A1A1A', fontSize: '14px' }
