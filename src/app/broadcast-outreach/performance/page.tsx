'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Navbar from '@/components/layout/Navbar'
import Breadcrumb from '@/components/layout/Breadcrumb'
import { checkPermission, loadPermissionsForRole } from '@/lib/permissions'
import { toast } from 'sonner'
import {
    ResponsiveContainer, LineChart, Line, BarChart, Bar,
    XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts'

const supabase = createClient()

const CHART_BLUE = '#0074BD'

type ThrottleStatus = {
    adaptive_enabled: boolean; health_score: number; health_tier: string; consecutive_failures: number
    last_health_event: string | null; warmup_started_at: string | null; warmup_day: number
    factor: number; health_factor: number; warmup_factor: number; history_factor: number
    recent_neg_rate: number | null; recent_outcomes: number; history_wave_cap: number | null; avg_waves_per_day: number | null
    eff_wave_min: number; eff_wave_max: number; eff_cooldown_min_minutes: number; eff_cooldown_max_minutes: number
    eff_daily_wave_target: number; intra_delay_min_seconds: number; intra_delay_max_seconds: number
}

type Settings = { wave_min: number; wave_max: number; cooldown_min_minutes: number; cooldown_max_minutes: number; daily_wave_target: number; adaptive_enabled: boolean }
type SendStateRow = { cooldown_until: string | null; waves_completed_today: number; daily_period_started_at: string | null; daily_override_extra: number; last_sent_at: string | null }
type HealthEvent = { id: string; created_at: string; event_type: string; score_before: number; score_after: number; actor_name: string | null; note: string | null }
type WaveLogRow = { completed_at: string; messages_sent: number }

const TIER_STYLE: Record<string, { label: string; color: string; background: string }> = {
    excellent: { label: 'Excellent', color: '#065F46', background: '#D1FAE5' },
    good: { label: 'Good', color: '#166534', background: '#DCFCE7' },
    guarded: { label: 'Guarded', color: '#92400E', background: '#FEF3C7' },
    risky: { label: 'Risky', color: '#9A3412', background: '#FFEDD5' },
    critical: { label: 'Critical', color: '#991B1B', background: '#FEE2E2' },
}

const EVENT_LABEL: Record<string, string> = {
    status_delivered: 'Delivered reported',
    status_replied: 'Reply reported',
    status_failed: 'Failed delivery reported',
    status_opted_out: 'Opt-out reported',
    failure_streak_brake: 'Failure-streak brake (2h pause)',
    critical_pause: 'Critical health pause (24h)',
    account_warning: 'WhatsApp account warning (24h pause)',
    daily_recovery: 'Daily recovery',
    manual_reset: 'Manual health reset',
}

// Daily wave counters reset at midnight UAE time (UTC+4, no DST).
function uaeDayKey(ms: number) {
    return new Date(ms + 4 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

function formatDayLabel(dayKey: string) {
    return new Date(`${dayKey}T00:00:00Z`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', timeZone: 'UTC' })
}

function formatEventTime(value: string) {
    return new Date(value).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function Tile({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
    return (
        <div style={{ background: '#FFF', borderRadius: '14px', padding: '16px 18px', border: '1px solid #F0F0F0', boxShadow: '0 1px 4px rgba(0,0,0,0.05)', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: accent ?? CHART_BLUE }} />
            <p style={{ fontSize: '12px', color: '#666', fontWeight: 600, margin: '2px 0 8px' }}>{label}</p>
            <p style={{ fontSize: '22px', fontWeight: 700, color: '#1A1A1A', margin: 0 }}>{value}</p>
            {sub && <p style={{ fontSize: '11px', color: '#888', margin: '5px 0 0' }}>{sub}</p>}
        </div>
    )
}

const tooltipStyle: React.CSSProperties = { background: '#FFF', border: '1px solid #E2E8F0', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.08)', fontSize: '12px', padding: '8px 10px' }

export default function BroadcastAlgorithmPerformancePage() {
    const router = useRouter()
    const [loading, setLoading] = useState(true)
    const [throttle, setThrottle] = useState<ThrottleStatus | null>(null)
    const [settings, setSettings] = useState<Settings | null>(null)
    const [sendState, setSendState] = useState<SendStateRow | null>(null)
    const [events, setEvents] = useState<HealthEvent[]>([])
    const [waveLogs, setWaveLogs] = useState<WaveLogRow[]>([])
    const [outcomeCounts, setOutcomeCounts] = useState<Record<string, number>>({})
    const [refreshing, setRefreshing] = useState(false)

    async function loadData() {
        const [throttleResult, settingsResult, stateResult, eventsResult, wavesResult, batch1, batch2] = await Promise.all([
            supabase.rpc('get_broadcast_throttle_status'),
            supabase.from('broadcast_settings').select('wave_min, wave_max, cooldown_min_minutes, cooldown_max_minutes, daily_wave_target, adaptive_enabled').eq('id', 1).single(),
            supabase.from('broadcast_send_state').select('cooldown_until, waves_completed_today, daily_period_started_at, daily_override_extra, last_sent_at').eq('id', 1).single(),
            supabase.from('broadcast_health_events').select('id, created_at, event_type, score_before, score_after, actor_name, note').order('created_at', { ascending: false }).limit(300),
            supabase.from('broadcast_wave_logs').select('completed_at, messages_sent').order('completed_at', { ascending: false }).limit(500),
            supabase.from('broadcast_contacts').select('delivery_status').range(0, 999),
            supabase.from('broadcast_contacts').select('delivery_status').range(1000, 1999),
        ])
        if (throttleResult.error) toast.error('Failed to load algorithm status')
        if (throttleResult.data?.[0]) setThrottle(throttleResult.data[0] as ThrottleStatus)
        if (settingsResult.data) setSettings(settingsResult.data as Settings)
        if (stateResult.data) setSendState(stateResult.data as SendStateRow)
        setEvents((eventsResult.data ?? []) as HealthEvent[])
        setWaveLogs((wavesResult.data ?? []) as WaveLogRow[])
        const counts: Record<string, number> = {}
        for (const row of [...(batch1.data ?? []), ...(batch2.data ?? [])] as { delivery_status: string }[]) {
            counts[row.delivery_status] = (counts[row.delivery_status] ?? 0) + 1
        }
        setOutcomeCounts(counts)
    }

    useEffect(() => {
        async function init() {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) { router.push('/login'); return }
            const { data: profile } = await supabase.from('profiles').select('user_role, is_active').eq('id', user.id).single<{ user_role: string; is_active: boolean | null }>()
            if (!profile || profile.is_active === false) { router.push('/login'); return }
            const loadedPermissions = await loadPermissionsForRole(profile.user_role)
            if (!checkPermission(loadedPermissions, profile.user_role, 'page:broadcast-outreach-performance', 'view')) { router.push('/dashboard'); return }
            await loadData()
            setLoading(false)
        }
        init()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [router])

    async function refresh() {
        setRefreshing(true)
        await loadData()
        setRefreshing(false)
    }

    const scoreSeries = useMemo(() => {
        const points = [...events]
            .reverse()
            .map(event => ({ time: formatEventTime(event.created_at), score: Number(event.score_after) }))
        if (throttle) points.push({ time: 'Now', score: Math.round(Number(throttle.health_score) * 10) / 10 })
        return points
    }, [events, throttle])

    const wavesPerDay = useMemo(() => {
        const today = uaeDayKey(Date.now())
        const days: { day: string; label: string; waves: number; messages: number }[] = []
        for (let i = 13; i >= 0; i--) {
            const key = uaeDayKey(Date.now() - i * 24 * 60 * 60 * 1000)
            days.push({ day: key, label: key === today ? 'Today' : formatDayLabel(key), waves: 0, messages: 0 })
        }
        const byDay = new Map(days.map(d => [d.day, d]))
        for (const log of waveLogs) {
            const key = uaeDayKey(new Date(log.completed_at).getTime())
            const bucket = byDay.get(key)
            if (bucket) { bucket.waves += 1; bucket.messages += log.messages_sent }
        }
        return days
    }, [waveLogs])

    const waveSummary = useMemo(() => {
        const active = wavesPerDay.filter(d => d.waves > 0)
        if (active.length === 0) return 'No waves completed in the last 14 days.'
        const total = active.reduce((sum, d) => sum + d.waves, 0)
        const messages = active.reduce((sum, d) => sum + d.messages, 0)
        return `${total} waves (${messages} messages) across ${active.length} active day${active.length === 1 ? '' : 's'} · average ${(total / active.length).toFixed(1)} waves/active day`
    }, [wavesPerDay])

    const brakeCounts = useMemo(() => {
        const counts = { brakes: 0, warnings: 0, recoveries: 0 }
        for (const event of events) {
            if (event.event_type === 'failure_streak_brake' || event.event_type === 'critical_pause') counts.brakes += 1
            if (event.event_type === 'account_warning') counts.warnings += 1
            if (event.event_type === 'daily_recovery') counts.recoveries += 1
        }
        return counts
    }, [events])

    const now = Date.now()
    const paused = !!sendState?.cooldown_until && new Date(sendState.cooldown_until).getTime() > now
    const tier = throttle ? (TIER_STYLE[throttle.health_tier] ?? TIER_STYLE.good) : null
    const limiting = useMemo(() => {
        if (!throttle || !throttle.adaptive_enabled) return null
        const entries: { name: string; value: number }[] = [
            { name: 'account health', value: Number(throttle.health_factor) },
            { name: 'warm-up ramp', value: Number(throttle.warmup_factor) },
            { name: 'recent failure rate', value: Number(throttle.history_factor) },
        ]
        const lowest = entries.reduce((min, entry) => (entry.value < min.value ? entry : min), entries[0])
        return lowest.value >= 1 ? null : lowest
    }, [throttle])

    const dailyPeriodExpired = !sendState?.daily_period_started_at || uaeDayKey(now) !== uaeDayKey(new Date(sendState.daily_period_started_at).getTime())
    const wavesToday = dailyPeriodExpired ? 0 : (sendState?.waves_completed_today ?? 0)
    const overrideToday = dailyPeriodExpired ? 0 : (sendState?.daily_override_extra ?? 0)

    return (
        <div style={{ minHeight: '100vh', background: '#F7F7F7', paddingTop: '16px' }}>
            <Navbar />
            <main style={{ padding: '0 32px 48px' }}>
                <Breadcrumb items={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Broadcast Outreach' }, { label: 'Algorithm Performance' }]} />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', flexWrap: 'wrap', marginBottom: '20px' }}>
                    <div>
                        <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#1A1A1A', margin: 0 }}>Adaptive Throttle Performance</h1>
                        <p style={{ color: '#666', fontSize: '14px', marginTop: '6px' }}>How the anti-block algorithm is pacing WhatsApp outreach: health, learned limits, brakes, and recovery. Days reset at 12:00 AM UAE time.</p>
                    </div>
                    <button onClick={refresh} disabled={refreshing || loading} style={{ border: '1px solid #CBD5E1', background: '#FFF', color: '#162860', borderRadius: '8px', padding: '9px 16px', fontSize: '13px', fontWeight: 600, cursor: refreshing || loading ? 'not-allowed' : 'pointer' }}>
                        {refreshing ? 'Refreshing…' : 'Refresh'}
                    </button>
                </div>

                {loading ? (
                    <div style={{ padding: '48px 0', textAlign: 'center', color: '#666' }}>Loading algorithm performance…</div>
                ) : !throttle ? (
                    <div style={{ padding: '48px 0', textAlign: 'center', color: '#666' }}>Algorithm status is unavailable. Ask an admin to check the broadcast configuration.</div>
                ) : (
                    <>
                        {/* Status banners */}
                        {paused && (
                            <p style={{ color: '#9A3412', background: '#FFF7ED', border: '1px solid #FED7AA', borderRadius: '10px', padding: '11px 14px', fontSize: '13px', fontWeight: 600, margin: '0 0 16px' }}>
                                Sending is currently paused until {new Date(sendState!.cooldown_until!).toLocaleString('en-GB')} — either a wave break or a protective brake.
                            </p>
                        )}
                        {!throttle.adaptive_enabled && (
                            <p style={{ color: '#92400E', background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: '10px', padding: '11px 14px', fontSize: '13px', fontWeight: 600, margin: '0 0 16px' }}>
                                Adaptive throttle is OFF — configured limits apply directly and nothing below adjusts automatically.
                            </p>
                        )}

                        {/* Current state tiles */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '14px', marginBottom: '16px' }}>
                            <Tile
                                label="Account health"
                                value={`${Math.round(Number(throttle.health_score))} / 100`}
                                sub={tier ? `Tier: ${tier.label}` : undefined}
                                accent={tier?.color}
                            />
                            <Tile
                                label="Waves today"
                                value={`${wavesToday} / ${throttle.eff_daily_wave_target + overrideToday}`}
                                sub={settings ? `Ceiling ${settings.daily_wave_target}/day${overrideToday ? ` · +${overrideToday} override` : ''}` : undefined}
                            />
                            <Tile
                                label="Wave size now"
                                value={`${throttle.eff_wave_min}–${throttle.eff_wave_max} msgs`}
                                sub={settings ? `Ceiling ${settings.wave_min}–${settings.wave_max}` : undefined}
                            />
                            <Tile
                                label="Break between waves"
                                value={`${throttle.eff_cooldown_min_minutes}–${throttle.eff_cooldown_max_minutes} min`}
                                sub={settings ? `Configured ${settings.cooldown_min_minutes}–${settings.cooldown_max_minutes} min` : undefined}
                            />
                            <Tile
                                label="Delay between messages"
                                value={`${throttle.intra_delay_min_seconds}–${throttle.intra_delay_max_seconds}s`}
                                sub="Base 15–30s, stretches with risk"
                            />
                            <Tile
                                label="7-day failure rate"
                                value={throttle.recent_neg_rate === null ? '—' : `${Math.round(Number(throttle.recent_neg_rate) * 100)}%`}
                                sub={throttle.recent_neg_rate === null ? `Needs 10+ reported outcomes (${throttle.recent_outcomes} so far)` : `${throttle.recent_outcomes} outcomes reported`}
                                accent={throttle.recent_neg_rate !== null && throttle.recent_neg_rate >= 0.15 ? '#DC2626' : undefined}
                            />
                        </div>

                        {/* Why the plan is what it is */}
                        <section style={{ background: '#FFF', borderRadius: '14px', border: '1px solid #F0F0F0', boxShadow: '0 1px 4px rgba(0,0,0,0.05)', padding: '16px 20px', marginBottom: '16px' }}>
                            <p style={{ fontSize: '13px', fontWeight: 700, color: '#162860', margin: '0 0 8px' }}>Current volume factor: {Math.round(Number(throttle.factor) * 100)}% of configured ceilings</p>
                            <p style={{ fontSize: '12.5px', color: '#555', margin: 0, lineHeight: 1.6 }}>
                                Health factor {Math.round(Number(throttle.health_factor) * 100)}% · Warm-up factor {Math.round(Number(throttle.warmup_factor) * 100)}% (day {throttle.warmup_day + 1}) · History dampener {Math.round(Number(throttle.history_factor) * 100)}%
                                {throttle.history_wave_cap !== null && ` · Pace cap ${throttle.history_wave_cap} waves/day (7-day average ${throttle.avg_waves_per_day ?? 0})`}
                                {limiting ? ` — currently limited by ${limiting.name}.` : ' — running at full configured volume.'}
                                {throttle.consecutive_failures > 0 && ` ${throttle.consecutive_failures} consecutive failed deliveries; a third in a row pauses sending for 2 hours.`}
                            </p>
                        </section>

                        {/* Charts */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '16px', marginBottom: '16px' }}>
                            <section style={{ background: '#FFF', borderRadius: '14px', border: '1px solid #F0F0F0', boxShadow: '0 1px 4px rgba(0,0,0,0.05)', padding: '18px 20px' }}>
                                <h2 style={{ fontSize: '14px', fontWeight: 700, color: '#1A1A1A', margin: '0 0 2px' }}>Health score over time</h2>
                                <p style={{ fontSize: '12px', color: '#888', margin: '0 0 12px' }}>Every reported outcome, brake, and recovery moves the score.</p>
                                {scoreSeries.length <= 1 ? (
                                    <p style={{ fontSize: '13px', color: '#666', padding: '28px 0', textAlign: 'center', margin: 0 }}>No health events yet. The line starts once operators report message outcomes.</p>
                                ) : (
                                    <ResponsiveContainer width="100%" height={220}>
                                        <LineChart data={scoreSeries} margin={{ top: 6, right: 12, bottom: 0, left: -18 }}>
                                            <CartesianGrid stroke="#F0F0F0" vertical={false} />
                                            <XAxis dataKey="time" tick={{ fontSize: 11, fill: '#666' }} tickLine={false} axisLine={{ stroke: '#E2E8F0' }} minTickGap={40} />
                                            <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#666' }} tickLine={false} axisLine={false} width={44} />
                                            <Tooltip contentStyle={tooltipStyle} formatter={(value: number | string) => [`${value}`, 'Score']} />
                                            <Line type="monotone" dataKey="score" stroke={CHART_BLUE} strokeWidth={2} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
                                        </LineChart>
                                    </ResponsiveContainer>
                                )}
                            </section>
                            <section style={{ background: '#FFF', borderRadius: '14px', border: '1px solid #F0F0F0', boxShadow: '0 1px 4px rgba(0,0,0,0.05)', padding: '18px 20px' }}>
                                <h2 style={{ fontSize: '14px', fontWeight: 700, color: '#1A1A1A', margin: '0 0 2px' }}>Waves completed per day (UAE days, last 14)</h2>
                                <p style={{ fontSize: '12px', color: '#888', margin: '0 0 12px' }}>{waveSummary}</p>
                                <ResponsiveContainer width="100%" height={220}>
                                    <BarChart data={wavesPerDay} margin={{ top: 6, right: 12, bottom: 0, left: -24 }}>
                                        <CartesianGrid stroke="#F0F0F0" vertical={false} />
                                        <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#666' }} tickLine={false} axisLine={{ stroke: '#E2E8F0' }} interval={1} />
                                        <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#666' }} tickLine={false} axisLine={false} width={40} />
                                        <Tooltip contentStyle={tooltipStyle} formatter={(value: number | string, name: string) => [`${value}`, name === 'waves' ? 'Waves' : name]} labelFormatter={(label: string) => `${label}`} cursor={{ fill: 'rgba(0,116,189,0.06)' }} />
                                        <Bar dataKey="waves" fill={CHART_BLUE} radius={[4, 4, 0, 0]} maxBarSize={18} isAnimationActive={false} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </section>
                        </div>

                        {/* Outcome + safety tiles */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '14px', marginBottom: '16px' }}>
                            <Tile label="Replied" value={String(outcomeCounts.replied ?? 0)} accent="#059669" sub="Strong positive signal (+4)" />
                            <Tile label="Delivered" value={String(outcomeCounts.delivered ?? 0)} accent="#16A34A" sub="Positive signal (+1)" />
                            <Tile label="Failed" value={String(outcomeCounts.failed ?? 0)} accent="#DC2626" sub="Negative signal (−10)" />
                            <Tile label="Opted out" value={String(outcomeCounts.opted_out ?? 0)} accent="#7C3AED" sub="Strong negative (−20)" />
                            <Tile label="Awaiting result" value={String(outcomeCounts.sent ?? 0)} accent="#D97706" sub="Sent, outcome not reported yet" />
                            <Tile label="Protective brakes" value={String(brakeCounts.brakes)} accent="#DC2626" sub={`${brakeCounts.warnings} account warning${brakeCounts.warnings === 1 ? '' : 's'} · ${brakeCounts.recoveries} recovery day${brakeCounts.recoveries === 1 ? '' : 's'}`} />
                        </div>

                        {/* Event feed */}
                        <section style={{ background: '#FFF', borderRadius: '14px', border: '1px solid #F0F0F0', boxShadow: '0 1px 4px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
                            <div style={{ padding: '16px 20px', borderBottom: '1px solid #F0F0F0' }}>
                                <h2 style={{ fontSize: '14px', fontWeight: 700, color: '#1A1A1A', margin: 0 }}>Health event log</h2>
                                <p style={{ fontSize: '12px', color: '#888', margin: '3px 0 0' }}>Latest {Math.min(events.length, 30)} of {events.length} loaded events — the audit trail behind every score change.</p>
                            </div>
                            {events.length === 0 ? (
                                <p style={{ padding: '22px 20px', fontSize: '13px', color: '#666', margin: 0 }}>No events yet. Events appear when operators report outcomes or the algorithm applies brakes and recoveries.</p>
                            ) : (
                                <div style={{ overflowX: 'auto' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '720px' }}>
                                        <thead>
                                            <tr style={{ background: '#162860', color: '#FFF', fontSize: '12px', textTransform: 'uppercase' }}>
                                                <th style={headerCell}>Time</th>
                                                <th style={headerCell}>Event</th>
                                                <th style={headerCell}>Score</th>
                                                <th style={headerCell}>By</th>
                                                <th style={headerCell}>Note</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {events.slice(0, 30).map(event => {
                                                const delta = Number(event.score_after) - Number(event.score_before)
                                                return (
                                                    <tr key={event.id} style={{ background: '#FFF', borderBottom: '1px solid #F5F5F5' }}>
                                                        <td style={{ ...cell, whiteSpace: 'nowrap', color: '#666', fontSize: '12.5px' }}>{formatEventTime(event.created_at)}</td>
                                                        <td style={cell}>{EVENT_LABEL[event.event_type] ?? event.event_type}</td>
                                                        <td style={{ ...cell, whiteSpace: 'nowrap' }}>
                                                            {Math.round(Number(event.score_before))} → <strong>{Math.round(Number(event.score_after))}</strong>
                                                            <span style={{ marginLeft: '6px', fontSize: '12px', fontWeight: 700, color: delta > 0 ? '#166534' : delta < 0 ? '#991B1B' : '#888' }}>
                                                                {delta > 0 ? `+${Math.round(delta * 10) / 10}` : delta < 0 ? `${Math.round(delta * 10) / 10}` : '±0'}
                                                            </span>
                                                        </td>
                                                        <td style={{ ...cell, color: '#555' }}>{event.actor_name ?? '—'}</td>
                                                        <td style={{ ...cell, color: '#777', fontSize: '12.5px' }}>{event.note ?? '—'}</td>
                                                    </tr>
                                                )
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </section>
                    </>
                )}
            </main>
        </div>
    )
}

const headerCell: React.CSSProperties = { padding: '12px 18px', fontWeight: 600 }
const cell: React.CSSProperties = { padding: '12px 18px', fontSize: '13.5px', color: '#1A1A1A' }
