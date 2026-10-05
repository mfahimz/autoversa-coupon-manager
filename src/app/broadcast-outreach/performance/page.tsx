'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Navbar from '@/components/layout/Navbar'
import Breadcrumb from '@/components/layout/Breadcrumb'
import { checkPermission, loadPermissionsForRole } from '@/lib/permissions'
import { toast } from 'sonner'
import LimitReviewModal from '@/components/broadcast/LimitReviewModal'
import ProjectedScheduleTable from '@/components/broadcast/ProjectedScheduleTable'
import { evaluateLimitRecommendation, isRecommendationDismissed, LimitRecommendation } from '@/lib/broadcastLimitAdvisor'
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
    max_daily_messages?: number; messages_sent_today?: number
}

type Settings = {
    wave_min: number
    wave_max: number
    cooldown_min_minutes: number
    cooldown_max_minutes: number
    daily_wave_target: number
    adaptive_enabled: boolean
    max_daily_messages?: number
    intra_delay_min_seconds?: number
    intra_delay_max_seconds?: number
}
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
    algorithm_optimization: 'Algorithm optimization',
    plateau_day_active: 'Plateau day active',
    plateau_tier_advanced: 'Plateau tier advanced',
    plateau_tier_stepped_down: 'Plateau tier stepped down',
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
    const [userRole, setUserRole] = useState('')
    const [throttle, setThrottle] = useState<ThrottleStatus | null>(null)
    const [settings, setSettings] = useState<Settings | null>(null)
    const [sendState, setSendState] = useState<SendStateRow | null>(null)
    const [events, setEvents] = useState<HealthEvent[]>([])
    const [waveLogs, setWaveLogs] = useState<WaveLogRow[]>([])
    const [outcomeCounts, setOutcomeCounts] = useState<Record<string, number>>({})
    const [refreshing, setRefreshing] = useState(false)
    const [maxDailyMessagesInput, setMaxDailyMessagesInput] = useState('150')
    const [waveMinInput, setWaveMinInput] = useState('8')
    const [waveMaxInput, setWaveMaxInput] = useState('15')
    const [cooldownMinInput, setCooldownMinInput] = useState('2')
    const [cooldownMaxInput, setCooldownMaxInput] = useState('5')
    const [intraDelayMinInput, setIntraDelayMinInput] = useState('12')
    const [intraDelayMaxInput, setIntraDelayMaxInput] = useState('25')
    const [dailyWaveTargetInput, setDailyWaveTargetInput] = useState('25')
    const [savingSettings, setSavingSettings] = useState(false)
    const [sentToday, setSentToday] = useState(0)
    const [activeRecommendation, setActiveRecommendation] = useState<LimitRecommendation | null>(null)
    const [showReviewModal, setShowReviewModal] = useState(false)

    async function loadData() {
        const uaeMidnight = `${uaeDayKey(Date.now())}T00:00:00+04:00`
        const [throttleResult, settingsResult, stateResult, eventsResult, wavesResult, batch1, batch2, todaySentResult] = await Promise.all([
            supabase.rpc('get_broadcast_throttle_status'),
            supabase.from('broadcast_settings').select('wave_min, wave_max, cooldown_min_minutes, cooldown_max_minutes, daily_wave_target, adaptive_enabled, max_daily_messages, intra_delay_min_seconds, intra_delay_max_seconds').eq('id', 1).single(),
            supabase.from('broadcast_send_state').select('cooldown_until, waves_completed_today, daily_period_started_at, daily_override_extra, last_sent_at').eq('id', 1).single(),
            supabase.from('broadcast_health_events').select('id, created_at, event_type, score_before, score_after, actor_name, note').order('created_at', { ascending: false }).limit(300),
            supabase.from('broadcast_wave_logs').select('completed_at, messages_sent').order('completed_at', { ascending: false }).limit(500),
            supabase.from('broadcast_contacts').select('delivery_status').range(0, 999),
            supabase.from('broadcast_contacts').select('delivery_status').range(1000, 1999),
            supabase.from('broadcast_contacts').select('id', { count: 'exact', head: true }).gte('sent_at', uaeMidnight),
        ])
        if (throttleResult.error) toast.error('Failed to load algorithm status')
        const throttleData = throttleResult.data?.[0] as ThrottleStatus | undefined
        if (throttleData) setThrottle(throttleData)
        const settingsData = settingsResult.data as Settings | null
        if (settingsData) {
            setSettings(settingsData)
            const cap = settingsData.max_daily_messages || throttleData?.max_daily_messages || 25
            setMaxDailyMessagesInput(String(cap))
            setWaveMinInput(String(settingsData.wave_min ?? 8))
            setWaveMaxInput(String(settingsData.wave_max ?? 15))
            setCooldownMinInput(String(settingsData.cooldown_min_minutes ?? 2))
            setCooldownMaxInput(String(settingsData.cooldown_max_minutes ?? 5))
            setIntraDelayMinInput(String(settingsData.intra_delay_min_seconds ?? 12))
            setIntraDelayMaxInput(String(settingsData.intra_delay_max_seconds ?? 25))
            setDailyWaveTargetInput(String(settingsData.daily_wave_target ?? 25))
        }
        if (stateResult.data) setSendState(stateResult.data as SendStateRow)
        setEvents((eventsResult.data ?? []) as HealthEvent[])
        setWaveLogs((wavesResult.data ?? []) as WaveLogRow[])
        const counts: Record<string, number> = {}
        for (const row of [...(batch1.data ?? []), ...(batch2.data ?? [])] as { delivery_status: string }[]) {
            counts[row.delivery_status] = (counts[row.delivery_status] ?? 0) + 1
        }
        setOutcomeCounts(counts)

        const countToday = todaySentResult.count ?? throttleData?.messages_sent_today ?? 0
        setSentToday(countToday)

        const currentCap = settingsData?.max_daily_messages || throttleData?.max_daily_messages || 25
        const rec = evaluateLimitRecommendation({
            currentMax: currentCap,
            healthScore: Number(throttleData?.health_score ?? 100),
            recentNegRate: throttleData?.recent_neg_rate ?? null,
            consecutiveFailures: throttleData?.consecutive_failures ?? 0,
            messagesSentToday: countToday,
            recentOutcomes: throttleData?.recent_outcomes ?? 0,
        })
        setActiveRecommendation(rec)
        if (rec.type !== 'hold' && !isRecommendationDismissed(rec.type, rec.recommendedMax)) {
            setShowReviewModal(true)
        }
    }

    async function saveAlgorithmParameters(overrides?: Partial<{
        max_daily_messages: number
        wave_min: number
        wave_max: number
        cooldown_min_minutes: number
        cooldown_max_minutes: number
        intra_delay_min_seconds: number
        intra_delay_max_seconds: number
        daily_wave_target: number
    }>) {
        const maxDaily = overrides?.max_daily_messages ?? parseInt(maxDailyMessagesInput, 10)
        const wMin = overrides?.wave_min ?? parseInt(waveMinInput, 10)
        const wMax = overrides?.wave_max ?? parseInt(waveMaxInput, 10)
        const cdMin = overrides?.cooldown_min_minutes ?? parseInt(cooldownMinInput, 10)
        const cdMax = overrides?.cooldown_max_minutes ?? parseInt(cooldownMaxInput, 10)
        const intraMin = overrides?.intra_delay_min_seconds ?? parseInt(intraDelayMinInput, 10)
        const intraMax = overrides?.intra_delay_max_seconds ?? parseInt(intraDelayMaxInput, 10)
        const dailyWaves = overrides?.daily_wave_target ?? parseInt(dailyWaveTargetInput, 10)

        if (isNaN(maxDaily) || maxDaily < 10) { toast.error('Max daily messages must be at least 10'); return }
        if (isNaN(wMin) || isNaN(wMax) || wMin < 1 || wMin > wMax) { toast.error('Min wave size must be ≤ max wave size'); return }
        if (isNaN(cdMin) || isNaN(cdMax) || cdMin < 1 || cdMin > cdMax) { toast.error('Min cooldown must be ≤ max cooldown'); return }
        if (isNaN(intraMin) || isNaN(intraMax) || intraMin < 5 || intraMin > intraMax) { toast.error('Delay between messages must be at least 5s and min ≤ max'); return }
        if (isNaN(dailyWaves) || dailyWaves < 1) { toast.error('Daily wave target must be a positive integer'); return }

        setSavingSettings(true)
        const { error } = await supabase
            .from('broadcast_settings')
            .update({
                max_daily_messages: maxDaily,
                wave_min: wMin,
                wave_max: wMax,
                cooldown_min_minutes: cdMin,
                cooldown_max_minutes: cdMax,
                intra_delay_min_seconds: intraMin,
                intra_delay_max_seconds: intraMax,
                daily_wave_target: dailyWaves,
                updated_at: new Date().toISOString()
            })
            .eq('id', 1)

        if (error) {
            toast.error('Failed to save algorithm parameters')
        } else {
            toast.success('Algorithm timing and safety controls updated')
            setMaxDailyMessagesInput(String(maxDaily))
            setWaveMinInput(String(wMin))
            setWaveMaxInput(String(wMax))
            setCooldownMinInput(String(cdMin))
            setCooldownMaxInput(String(cdMax))
            setIntraDelayMinInput(String(intraMin))
            setIntraDelayMaxInput(String(intraMax))
            setDailyWaveTargetInput(String(dailyWaves))
            setSettings(prev => prev ? {
                ...prev,
                max_daily_messages: maxDaily,
                wave_min: wMin,
                wave_max: wMax,
                cooldown_min_minutes: cdMin,
                cooldown_max_minutes: cdMax,
                intra_delay_min_seconds: intraMin,
                intra_delay_max_seconds: intraMax,
                daily_wave_target: dailyWaves,
            } : prev)
            await refresh()
        }
        setSavingSettings(false)
    }

    function applyPreset(preset: 'natural' | 'fast' | 'conservative') {
        if (preset === 'natural') {
            setIntraDelayMinInput('12')
            setIntraDelayMaxInput('25')
            setWaveMinInput('8')
            setWaveMaxInput('15')
            setCooldownMinInput('3')
            setCooldownMaxInput('6')
            toast.info('Selected "Natural Human" preset (12–25s delay, 8–15 msgs/batch, 3–6m break). Click "Save Settings" to apply.')
        } else if (preset === 'fast') {
            setIntraDelayMinInput('8')
            setIntraDelayMaxInput('16')
            setWaveMinInput('10')
            setWaveMaxInput('18')
            setCooldownMinInput('2')
            setCooldownMaxInput('4')
            toast.info('Selected "Fast Human" preset (8–16s delay, 10–18 msgs/batch, 2–4m break). Click "Save Settings" to apply.')
        } else if (preset === 'conservative') {
            setIntraDelayMinInput('18')
            setIntraDelayMaxInput('35')
            setWaveMinInput('6')
            setWaveMaxInput('10')
            setCooldownMinInput('5')
            setCooldownMaxInput('10')
            toast.info('Selected "Ultra-Safe Stealth" preset (18–35s delay, 6–10 msgs/batch, 5–10m break). Click "Save Settings" to apply.')
        }
    }

    function handleApplyDayPlan(params: {
        max_daily_messages: number
        wave_min: number
        wave_max: number
        daily_wave_target: number
        cooldown_min_minutes: number
        cooldown_max_minutes: number
        intra_delay_min_seconds: number
        intra_delay_max_seconds: number
    }) {
        setMaxDailyMessagesInput(String(params.max_daily_messages))
        setWaveMinInput(String(params.wave_min))
        setWaveMaxInput(String(params.wave_max))
        setDailyWaveTargetInput(String(params.daily_wave_target))
        setCooldownMinInput(String(params.cooldown_min_minutes))
        setCooldownMaxInput(String(params.cooldown_max_minutes))
        setIntraDelayMinInput(String(params.intra_delay_min_seconds))
        setIntraDelayMaxInput(String(params.intra_delay_max_seconds))
        toast.info(`Loaded ${params.max_daily_messages} msgs/day plan into controls above. Click "Save Algorithm Controls" to apply.`)
    }

    useEffect(() => {
        async function init() {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) { router.push('/login'); return }
            const { data: profile } = await supabase.from('profiles').select('user_role, is_active').eq('id', user.id).single<{ user_role: string; is_active: boolean | null }>()
            if (!profile || profile.is_active === false) { router.push('/login'); return }
            setUserRole(profile.user_role)
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

                        {/* WhatsApp Anti-Block & Human-Paced Timing Control Panel */}
                        <section id="max-messages-control" style={{
                            background: '#FFF',
                            borderRadius: '16px',
                            border: '1.5px solid #0074BD',
                            boxShadow: '0 2px 8px rgba(0, 116, 189, 0.08)',
                            padding: '22px 26px',
                            marginBottom: '20px',
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
                                <div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                        <span style={{ fontSize: '20px' }}>🛡️</span>
                                        <h2 style={{ fontSize: '17px', fontWeight: 700, color: '#162860', margin: 0 }}>
                                            Human-Paced Outreach & Anti-Bot Timing Controls
                                        </h2>
                                        <span style={{ fontSize: '11px', fontWeight: 700, background: '#DCFCE7', color: '#166534', padding: '3px 10px', borderRadius: '999px', border: '1px solid #BBF7D0' }}>
                                            Anti-Bot Protection Active
                                        </span>
                                    </div>
                                    <p style={{ fontSize: '13px', color: '#64748B', margin: '6px 0 0', maxWidth: '780px', lineHeight: 1.5 }}>
                                        Controls messaging frequency, batch sizes, and inter-message pauses to mimic genuine human interaction. Natural randomized delays between messages prevent WhatsApp automated bot detection, while daily safety ceilings protect account reputation.
                                    </p>
                                </div>

                                {userRole === 'ADMIN' && (
                                    <button
                                        onClick={() => saveAlgorithmParameters()}
                                        disabled={savingSettings}
                                        style={{
                                            padding: '10px 20px',
                                            background: '#0074BD',
                                            color: '#FFF',
                                            border: 'none',
                                            borderRadius: '8px',
                                            fontSize: '13px',
                                            fontWeight: 700,
                                            cursor: savingSettings ? 'not-allowed' : 'pointer',
                                            boxShadow: '0 2px 6px rgba(0,116,189,0.25)',
                                        }}
                                    >
                                        {savingSettings ? 'Saving Controls…' : 'Save Algorithm Controls'}
                                    </button>
                                )}
                            </div>

                            {/* Outreach progress bar for today */}
                            <div style={{ marginTop: '18px', padding: '12px 14px', background: '#F8FAFC', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px', marginBottom: '6px' }}>
                                    <span style={{ color: '#475569', fontWeight: 600 }}>
                                        Today&apos;s Outreach: <strong style={{ color: '#0F172A' }}>{sentToday}</strong> / {settings?.max_daily_messages || 25} messages sent
                                    </span>
                                    <span style={{ color: (settings?.max_daily_messages || 25) - sentToday <= 10 ? '#DC2626' : '#166534', fontWeight: 700 }}>
                                        {(settings?.max_daily_messages || 25) - sentToday > 0 ? `${(settings?.max_daily_messages || 25) - sentToday} messages remaining today` : 'Daily safety ceiling reached'}
                                    </span>
                                </div>
                                <div style={{ height: '8px', background: '#E2E8F0', borderRadius: '999px', overflow: 'hidden' }}>
                                    <div style={{
                                        width: `${Math.min(100, Math.round((sentToday / Math.max(1, settings?.max_daily_messages || 25)) * 100))}%`,
                                        height: '100%',
                                        background: (sentToday / (settings?.max_daily_messages || 25)) >= 0.9 ? '#DC2626' : (sentToday / (settings?.max_daily_messages || 25)) >= 0.75 ? '#D97706' : '#0074BD',
                                        borderRadius: '999px',
                                        transition: 'width 0.3s ease',
                                    }} />
                                </div>
                            </div>

                            {/* Quick presets for human pacing */}
                            {userRole === 'ADMIN' && (
                                <div style={{ marginTop: '16px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                    <span style={{ fontSize: '12px', fontWeight: 700, color: '#475569' }}>Quick Timing Presets:</span>
                                    <button
                                        onClick={() => applyPreset('natural')}
                                        type="button"
                                        style={{ padding: '5px 11px', background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: '6px', fontSize: '12px', fontWeight: 600, color: '#1E40AF', cursor: 'pointer' }}
                                    >
                                        👤 Natural Human (12–25s delay · 8–15 wave)
                                    </button>
                                    <button
                                        onClick={() => applyPreset('fast')}
                                        type="button"
                                        style={{ padding: '5px 11px', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: '6px', fontSize: '12px', fontWeight: 600, color: '#166534', cursor: 'pointer' }}
                                    >
                                        ⚡ Fast Human (8–16s delay · 10–18 wave)
                                    </button>
                                    <button
                                        onClick={() => applyPreset('conservative')}
                                        type="button"
                                        style={{ padding: '5px 11px', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '6px', fontSize: '12px', fontWeight: 600, color: '#92400E', cursor: 'pointer' }}
                                    >
                                        🛡️ Ultra-Safe Stealth (18–35s delay · 6–10 wave)
                                    </button>
                                </div>
                            )}

                            {/* Configurable Timing & Safety Parameters Grid */}
                            {userRole === 'ADMIN' && (
                                <div style={{ marginTop: '18px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '14px', paddingTop: '16px', borderTop: '1px solid #F1F5F9' }}>
                                    {/* Daily Max */}
                                    <div style={{ background: '#F8FAFC', padding: '12px 14px', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
                                        <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#1E293B', marginBottom: '4px' }}>
                                            Max Daily Messages
                                        </label>
                                        <input
                                            type="number"
                                            min={10}
                                            max={600}
                                            value={maxDailyMessagesInput}
                                            onChange={e => setMaxDailyMessagesInput(e.target.value)}
                                            style={controlInputStyle}
                                        />
                                        <p style={{ fontSize: '11px', color: '#64748B', margin: '4px 0 0' }}>Safety ceiling before auto-pausing</p>
                                    </div>

                                    {/* Delay between messages */}
                                    <div style={{ background: '#F8FAFC', padding: '12px 14px', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
                                        <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#1E293B', marginBottom: '4px' }}>
                                            Time Between Messages (Seconds)
                                        </label>
                                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                            <input
                                                type="number"
                                                min={5}
                                                max={120}
                                                value={intraDelayMinInput}
                                                onChange={e => setIntraDelayMinInput(e.target.value)}
                                                style={{ ...controlInputStyle, width: '70px' }}
                                                placeholder="Min"
                                            />
                                            <span style={{ fontSize: '12px', color: '#64748B' }}>to</span>
                                            <input
                                                type="number"
                                                min={5}
                                                max={120}
                                                value={intraDelayMaxInput}
                                                onChange={e => setIntraDelayMaxInput(e.target.value)}
                                                style={{ ...controlInputStyle, width: '70px' }}
                                                placeholder="Max"
                                            />
                                            <span style={{ fontSize: '12px', color: '#64748B' }}>s</span>
                                        </div>
                                        <p style={{ fontSize: '11px', color: '#64748B', margin: '4px 0 0' }}>Randomized human jitter (prevents bots)</p>
                                    </div>

                                    {/* Messages per wave */}
                                    <div style={{ background: '#F8FAFC', padding: '12px 14px', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
                                        <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#1E293B', marginBottom: '4px' }}>
                                            Batch Size (Messages / Wave)
                                        </label>
                                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                            <input
                                                type="number"
                                                min={1}
                                                max={50}
                                                value={waveMinInput}
                                                onChange={e => setWaveMinInput(e.target.value)}
                                                style={{ ...controlInputStyle, width: '70px' }}
                                                placeholder="Min"
                                            />
                                            <span style={{ fontSize: '12px', color: '#64748B' }}>to</span>
                                            <input
                                                type="number"
                                                min={1}
                                                max={50}
                                                value={waveMaxInput}
                                                onChange={e => setWaveMaxInput(e.target.value)}
                                                style={{ ...controlInputStyle, width: '70px' }}
                                                placeholder="Max"
                                            />
                                            <span style={{ fontSize: '12px', color: '#64748B' }}>msgs</span>
                                        </div>
                                        <p style={{ fontSize: '11px', color: '#64748B', margin: '4px 0 0' }}>Volume per wave before rest break</p>
                                    </div>

                                    {/* Break between waves */}
                                    <div style={{ background: '#F8FAFC', padding: '12px 14px', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
                                        <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#1E293B', marginBottom: '4px' }}>
                                            Break Between Batches (Minutes)
                                        </label>
                                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                            <input
                                                type="number"
                                                min={1}
                                                max={60}
                                                value={cooldownMinInput}
                                                onChange={e => setCooldownMinInput(e.target.value)}
                                                style={{ ...controlInputStyle, width: '70px' }}
                                                placeholder="Min"
                                            />
                                            <span style={{ fontSize: '12px', color: '#64748B' }}>to</span>
                                            <input
                                                type="number"
                                                min={1}
                                                max={60}
                                                value={cooldownMaxInput}
                                                onChange={e => setCooldownMaxInput(e.target.value)}
                                                style={{ ...controlInputStyle, width: '70px' }}
                                                placeholder="Max"
                                            />
                                            <span style={{ fontSize: '12px', color: '#64748B' }}>min</span>
                                        </div>
                                        <p style={{ fontSize: '11px', color: '#64748B', margin: '4px 0 0' }}>Operator rest period between waves</p>
                                    </div>

                                    {/* Daily Wave Target */}
                                    <div style={{ background: '#F8FAFC', padding: '12px 14px', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
                                        <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#1E293B', marginBottom: '4px' }}>
                                            Daily Wave Target
                                        </label>
                                        <input
                                            type="number"
                                            min={1}
                                            max={100}
                                            value={dailyWaveTargetInput}
                                            onChange={e => setDailyWaveTargetInput(e.target.value)}
                                            style={controlInputStyle}
                                        />
                                        <p style={{ fontSize: '11px', color: '#64748B', margin: '4px 0 0' }}>Planned batch waves per day</p>
                                    </div>
                                </div>
                            )}

                            {/* Inline recommendation notice if active */}
                            {activeRecommendation && activeRecommendation.type !== 'hold' && (
                                <div style={{
                                    marginTop: '16px',
                                    padding: '12px 16px',
                                    borderRadius: '10px',
                                    background: activeRecommendation.type === 'decrease' ? '#FFF1F2' : '#F0FDF4',
                                    border: `1px solid ${activeRecommendation.type === 'decrease' ? '#FECDD3' : '#BBF7D0'}`,
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    flexWrap: 'wrap',
                                    gap: '12px',
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <span>{activeRecommendation.type === 'decrease' ? '⚠️' : '💡'}</span>
                                        <div>
                                            <span style={{ fontSize: '13px', fontWeight: 700, color: activeRecommendation.type === 'decrease' ? '#991B1B' : '#166534' }}>
                                                {activeRecommendation.title}
                                            </span>
                                            <p style={{ fontSize: '12px', color: '#475569', margin: '2px 0 0' }}>
                                                {activeRecommendation.type === 'decrease'
                                                    ? `Delivery risk detected. Recommended limit: ${activeRecommendation.recommendedMax} msgs/day.`
                                                    : `Excellent health. Safe to scale up to ${activeRecommendation.recommendedMax} msgs/day.`}
                                            </p>
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <button
                                            onClick={() => saveAlgorithmParameters({ max_daily_messages: activeRecommendation.recommendedMax })}
                                            disabled={savingSettings}
                                            style={{
                                                padding: '6px 14px',
                                                background: activeRecommendation.type === 'decrease' ? '#DC2626' : '#16A34A',
                                                color: '#FFF',
                                                border: 'none',
                                                borderRadius: '6px',
                                                fontSize: '12px',
                                                fontWeight: 600,
                                                cursor: 'pointer',
                                            }}
                                        >
                                            Apply {activeRecommendation.recommendedMax} msgs
                                        </button>
                                        <button
                                            onClick={() => setShowReviewModal(true)}
                                            style={{
                                                padding: '6px 12px',
                                                background: '#FFF',
                                                color: '#475569',
                                                border: '1px solid #CBD5E1',
                                                borderRadius: '6px',
                                                fontSize: '12px',
                                                fontWeight: 600,
                                                cursor: 'pointer',
                                            }}
                                        >
                                            Review Details
                                        </button>
                                    </div>
                                </div>
                            )}
                        </section>

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
                                sub="Human-paced jitter (anti-bot protection)"
                            />
                            <Tile
                                label="7-day failure rate"
                                value={throttle.recent_neg_rate === null ? '—' : `${Math.round(Number(throttle.recent_neg_rate) * 100)}%`}
                                sub={throttle.recent_neg_rate === null ? `Needs 10+ reported outcomes (${throttle.recent_outcomes} so far)` : `${throttle.recent_outcomes} outcomes reported`}
                                accent={throttle.recent_neg_rate !== null && throttle.recent_neg_rate >= 0.15 ? '#DC2626' : undefined}
                            />
                        </div>

                        {/* 14-Day Projected Outreach Schedule & Estimated Time */}
                        <ProjectedScheduleTable
                            currentDailyMax={Number(maxDailyMessagesInput || settings?.max_daily_messages || 25)}
                            unsentCount={outcomeCounts['pending'] ?? 820}
                            messagesSentToday={sentToday}
                            onApplyDayParams={userRole === 'ADMIN' ? handleApplyDayPlan : undefined}
                        />

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

                {activeRecommendation && (
                    <LimitReviewModal
                        isOpen={showReviewModal}
                        onClose={() => setShowReviewModal(false)}
                        recommendation={activeRecommendation}
                        onApply={async (newLimit) => {
                            await saveAlgorithmParameters({ max_daily_messages: newLimit })
                        }}
                    />
                )}
            </main>
        </div>
    )
}

const headerCell: React.CSSProperties = { padding: '12px 18px', fontWeight: 600 }
const cell: React.CSSProperties = { padding: '12px 18px', fontSize: '13.5px', color: '#1A1A1A' }
const controlInputStyle: React.CSSProperties = {
    width: '100%',
    padding: '8px 10px',
    borderRadius: '8px',
    border: '1.5px solid #CBD5E1',
    fontSize: '13.5px',
    fontWeight: 700,
    color: '#1E293B',
    outline: 'none',
    background: '#FFF',
}
