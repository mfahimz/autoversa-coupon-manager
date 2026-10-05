'use client'

import React, { useMemo, useState } from 'react'

interface ProjectedDay {
    dayIndex: number
    dateLabel: string
    dayName: string
    isToday: boolean
    tierName: string
    tierBadge: string
    tierColor: string
    dayInTier: number
    totalDaysInTier: number
    basePlateauTarget: number
    fluctuation: number
    isStepUpDay: boolean
    stepUpAmount: number
    targetMessages: number
    allowedTodayRemaining?: number
    waveMin: number
    waveMax: number
    batchesNeeded: number
    cooldownMin: number
    cooldownMax: number
    intraDelayMin: number
    intraDelayMax: number
    avgIntraDelaySec: number
    activeTimeMinutes: number
    restTimeMinutes: number
    totalTimeMinutes: number
    cumulativeSent: number
    remainingQueue: number
    riskLevel: 'Ultra-Safe' | 'Safe' | 'Moderate'
}

interface ProjectedScheduleTableProps {
    currentDailyMax: number
    unsentCount: number
    messagesSentToday: number
    onApplyDayParams?: (params: {
        max_daily_messages: number
        wave_min: number
        wave_max: number
        daily_wave_target: number
        cooldown_min_minutes: number
        cooldown_max_minutes: number
        intra_delay_min_seconds: number
        intra_delay_max_seconds: number
    }) => void
}

interface PlateauTierDef {
    name: string
    badge: string
    color: string
    base: number
    days: number
    jitters: number[] // relative to base
}

// Gentle, slow growth ramp extending across 21 days (3 full weeks)
const PLATEAU_TIERS: PlateauTierDef[] = [
    {
        name: 'Tier 1: Warmup Base',
        badge: 'Base 25',
        color: '#0284C7',
        base: 25,
        days: 4,
        jitters: [0, +1, -1, 0], // Day 1: 25, Day 2: 26, Day 3: 24, Day 4: 25
    },
    {
        name: 'Tier 2: Gentle Step',
        badge: 'Base 32',
        color: '#0D9488',
        base: 32,
        days: 4,
        jitters: [0, +1, -1, +2], // Day 1: 32, Day 2: 33, Day 3: 31, Day 4: 34
    },
    {
        name: 'Tier 3: Steady Consolidation',
        badge: 'Base 40',
        color: '#16A34A',
        base: 40,
        days: 4,
        jitters: [0, +2, -1, +1], // Day 1: 40, Day 2: 42, Day 3: 39, Day 4: 41
    },
    {
        name: 'Tier 4: Moderate Ramp',
        badge: 'Base 50',
        color: '#CA8A04',
        base: 50,
        days: 4,
        jitters: [0, +2, -2, +1], // Day 1: 50, Day 2: 52, Day 3: 48, Day 4: 51
    },
    {
        name: 'Tier 5: Measured Expansion',
        badge: 'Base 62',
        color: '#D97706',
        base: 62,
        days: 3,
        jitters: [0, +2, -1], // Day 1: 62, Day 2: 64, Day 3: 61
    },
    {
        name: 'Tier 6: Growth Plateau',
        badge: 'Base 75',
        color: '#EA580C',
        base: 75,
        days: 3,
        jitters: [0, +3, -1], // Day 1: 75, Day 2: 78, Day 3: 74
    },
    {
        name: 'Tier 7: Established Outreach',
        badge: 'Base 90',
        color: '#9333EA',
        base: 90,
        days: 3,
        jitters: [0, +3, -2],
    },
    {
        name: 'Tier 8: Advanced Volume',
        badge: 'Base 110',
        color: '#4F46E5',
        base: 110,
        days: 4,
        jitters: [0, +3, -2, +2],
    },
    {
        name: 'Tier 9: High Volume Scale',
        badge: 'Base 130',
        color: '#2563EB',
        base: 130,
        days: 4,
        jitters: [0, +4, -3, +2],
    },
    {
        name: 'Tier 10: Mature Capacity',
        badge: 'Base 150',
        color: '#1E40AF',
        base: 150,
        days: 4,
        jitters: [0, +3, -2, +2],
    },
]

export default function ProjectedScheduleTable({
    currentDailyMax,
    unsentCount,
    messagesSentToday,
    onApplyDayParams,
}: ProjectedScheduleTableProps) {
    const [viewDays, setViewDays] = useState<7 | 14 | 21>(21)

    // Build 21-Day Slow Plateau + Fluctuation Schedule
    const schedule = useMemo(() => {
        const days: ProjectedDay[] = []
        let runningCumulative = 0
        let currentQueue = unsentCount

        // Determine starting plateau tier from currentDailyMax (default 25)
        const startingTierIndex = PLATEAU_TIERS.findIndex(tier => tier.base >= currentDailyMax)
        const tierIdxStart = startingTierIndex === -1 ? 0 : startingTierIndex

        // Flatten sequence of plateau days across 21 days
        interface SequenceItem {
            tier: PlateauTierDef
            dayInTier: number
            totalDaysInTier: number
            fluctuation: number
            isStepUp: boolean
            stepUpAmount: number
            target: number
        }

        const sequence: SequenceItem[] = []
        let currentTierIdx = tierIdxStart
        let currentDayInTier = 0
        let prevTarget = currentDailyMax

        for (let i = 0; i < 21; i++) {
            const tier = PLATEAU_TIERS[currentTierIdx] || PLATEAU_TIERS[PLATEAU_TIERS.length - 1]
            const jitter = tier.jitters[currentDayInTier % tier.jitters.length] ?? 0
            
            // On Day 0 (Today), anchor strictly to currentDailyMax
            const target = i === 0 ? currentDailyMax : tier.base + jitter
            const isStepUp = i > 0 && currentDayInTier === 0
            const stepUpAmount = isStepUp ? target - prevTarget : 0

            sequence.push({
                tier,
                dayInTier: currentDayInTier + 1,
                totalDaysInTier: tier.days,
                fluctuation: i === 0 ? 0 : jitter,
                isStepUp,
                stepUpAmount,
                target,
            })

            prevTarget = target
            currentDayInTier++
            if (currentDayInTier >= tier.days && currentTierIdx < PLATEAU_TIERS.length - 1) {
                currentTierIdx++
                currentDayInTier = 0
            }
        }

        const today = new Date()

        for (let i = 0; i < 21; i++) {
            const date = new Date(today)
            date.setDate(today.getDate() + i)

            const seqItem = sequence[i]
            const target = seqItem.target
            const sendVolume = i === 0
                ? Math.max(0, Math.min(currentQueue, target - messagesSentToday))
                : Math.min(currentQueue, target)

            // Pacing parameters adapt realistically as volume increases
            let waveMin = 6
            let waveMax = 10
            let cooldownMin = 3
            let cooldownMax = 6
            let intraDelayMin = 14
            let intraDelayMax = 28

            if (target >= 120) {
                waveMin = 10
                waveMax = 18
                cooldownMin = 4
                cooldownMax = 8
                intraDelayMin = 12
                intraDelayMax = 25
            } else if (target >= 60) {
                waveMin = 8
                waveMax = 14
                cooldownMin = 3
                cooldownMax = 6
                intraDelayMin = 12
                intraDelayMax = 25
            }

            const avgWaveSize = (waveMin + waveMax) / 2
            const batchesNeeded = Math.max(1, Math.ceil(sendVolume / avgWaveSize))
            const avgIntraDelaySec = (intraDelayMin + intraDelayMax) / 2
            const avgCooldownMin = (cooldownMin + cooldownMax) / 2

            // Active human sending time: operator typing + WhatsApp Web load + intra-delay
            const activeTimeMinutes = Math.round((sendVolume * (avgIntraDelaySec + 4)) / 60)
            // Rest breaks between waves
            const restTimeMinutes = batchesNeeded > 1 ? Math.round((batchesNeeded - 1) * avgCooldownMin) : 0
            const totalTimeMinutes = activeTimeMinutes + restTimeMinutes

            runningCumulative += sendVolume
            currentQueue = Math.max(0, currentQueue - sendVolume)

            let risk: 'Ultra-Safe' | 'Safe' | 'Moderate' = 'Ultra-Safe'
            if (target > 120) risk = 'Moderate'
            else if (target > 50) risk = 'Safe'

            days.push({
                dayIndex: i,
                dateLabel: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                dayName: i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : date.toLocaleDateString('en-US', { weekday: 'short' }),
                isToday: i === 0,
                tierName: seqItem.tier.name,
                tierBadge: seqItem.tier.badge,
                tierColor: seqItem.tier.color,
                dayInTier: seqItem.dayInTier,
                totalDaysInTier: seqItem.totalDaysInTier,
                basePlateauTarget: seqItem.tier.base,
                fluctuation: seqItem.fluctuation,
                isStepUpDay: seqItem.isStepUp,
                stepUpAmount: seqItem.stepUpAmount,
                targetMessages: target,
                allowedTodayRemaining: i === 0 ? Math.max(0, target - messagesSentToday) : undefined,
                waveMin,
                waveMax,
                batchesNeeded,
                cooldownMin,
                cooldownMax,
                intraDelayMin,
                intraDelayMax,
                avgIntraDelaySec,
                activeTimeMinutes,
                restTimeMinutes,
                totalTimeMinutes,
                cumulativeSent: runningCumulative,
                remainingQueue: currentQueue,
                riskLevel: risk,
            })
        }

        return days
    }, [currentDailyMax, unsentCount, messagesSentToday])

    const displayedDays = schedule.slice(0, viewDays)

    // Summary calculations
    const daysToClear = schedule.findIndex(d => d.remainingQueue === 0)
    const clearTimeSummary = daysToClear === -1 ? '> 21 days' : daysToClear === 0 ? 'Today' : `${daysToClear + 1} days`
    const totalProjectedVolume = displayedDays.reduce((acc, d) => acc + (d.isToday ? (d.allowedTodayRemaining ?? 0) : d.targetMessages), 0)
    const avgDailyTimeMinutes = Math.round(displayedDays.reduce((acc, d) => acc + d.totalTimeMinutes, 0) / displayedDays.length)

    return (
        <section style={cardStyle}>
            {/* Header with Title and Toggle */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px', marginBottom: '20px' }}>
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <h2 style={{ fontSize: '16px', fontWeight: 700, color: '#162860', margin: 0 }}>
                            📈 21-Day Slow Plateau &amp; Organic Fluctuation Schedule
                        </h2>
                        <span style={{ fontSize: '11px', fontWeight: 700, background: '#DCFCE7', color: '#166534', padding: '3px 8px', borderRadius: '6px' }}>
                            🛡 Ultra-Gradual 3-Week Ramp
                        </span>
                    </div>
                    <p style={{ color: '#666', fontSize: '13px', margin: '4px 0 0' }}>
                        Slow and steady multi-day plateaus (3–4 days per tier) with natural ±1–2 daily adjustments. Eliminates velocity spikes to prevent WhatsApp restrictions.
                    </p>
                </div>
                <div style={{ display: 'flex', gap: '6px', background: '#F1F5F9', padding: '3px', borderRadius: '8px' }}>
                    <button
                        type="button"
                        onClick={() => setViewDays(7)}
                        style={{
                            ...toggleBtnStyle,
                            background: viewDays === 7 ? '#FFF' : 'transparent',
                            color: viewDays === 7 ? '#162860' : '#64748B',
                            fontWeight: viewDays === 7 ? 700 : 500,
                            boxShadow: viewDays === 7 ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                        }}
                    >
                        7 Days
                    </button>
                    <button
                        type="button"
                        onClick={() => setViewDays(14)}
                        style={{
                            ...toggleBtnStyle,
                            background: viewDays === 14 ? '#FFF' : 'transparent',
                            color: viewDays === 14 ? '#162860' : '#64748B',
                            fontWeight: viewDays === 14 ? 700 : 500,
                            boxShadow: viewDays === 14 ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                        }}
                    >
                        14 Days
                    </button>
                    <button
                        type="button"
                        onClick={() => setViewDays(21)}
                        style={{
                            ...toggleBtnStyle,
                            background: viewDays === 21 ? '#FFF' : 'transparent',
                            color: viewDays === 21 ? '#162860' : '#64748B',
                            fontWeight: viewDays === 21 ? 700 : 500,
                            boxShadow: viewDays === 21 ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                        }}
                    >
                        21 Days View
                    </button>
                </div>
            </div>

            {/* Metric KPI cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '20px' }}>
                <div style={kpiCardStyle}>
                    <span style={kpiLabelStyle}>Est. Time to Clear Queue</span>
                    <strong style={kpiValueStyle}>{clearTimeSummary}</strong>
                    <span style={kpiSubStyle}>{unsentCount.toLocaleString()} pending contacts</span>
                </div>
                <div style={kpiCardStyle}>
                    <span style={kpiLabelStyle}>{viewDays}-Day Projected Total</span>
                    <strong style={kpiValueStyle}>{totalProjectedVolume.toLocaleString()} msgs</strong>
                    <span style={kpiSubStyle}>Gentle 21-day plateau progression</span>
                </div>
                <div style={kpiCardStyle}>
                    <span style={kpiLabelStyle}>Avg Operator Time / Day</span>
                    <strong style={kpiValueStyle}>{avgDailyTimeMinutes} mins</strong>
                    <span style={kpiSubStyle}>Typing delays &amp; batch rest periods</span>
                </div>
                <div style={kpiCardStyle}>
                    <span style={kpiLabelStyle}>Anti-Ban Safety Rating</span>
                    <strong style={{ ...kpiValueStyle, color: '#16A34A' }}>🛡 Maximum Stealth</strong>
                    <span style={kpiSubStyle}>3–4 days per tier · Gentle +5–12 steps</span>
                </div>
            </div>

            {/* Schedule Table */}
            <div style={{ overflowX: 'auto', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '940px', fontSize: '13px' }}>
                    <thead>
                        <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: '#475569', fontSize: '11.5px', textTransform: 'uppercase', letterSpacing: '.04em' }}>
                            <th style={thStyle}>Day / Date</th>
                            <th style={thStyle}>Volume Plateau &amp; Stage</th>
                            <th style={thStyle}>Daily Target</th>
                            <th style={thStyle}>Daily Fluctuation</th>
                            <th style={thStyle}>Wave Structure</th>
                            <th style={thStyle}>Active Time</th>
                            <th style={thStyle}>Rest Breaks</th>
                            <th style={thStyle}>Total Operator Time</th>
                            <th style={thStyle}>Queue Left</th>
                            <th style={thStyle}>Safety</th>
                            {onApplyDayParams && <th style={thStyle}>Action</th>}
                        </tr>
                    </thead>
                    <tbody>
                        {displayedDays.map(day => (
                            <tr
                                key={day.dayIndex}
                                style={{
                                    borderBottom: '1px solid #F1F5F9',
                                    background: day.isToday ? '#F0F9FF' : day.isStepUpDay ? '#FEFCE8' : '#FFF',
                                    fontWeight: day.isToday ? 600 : 400,
                                }}
                            >
                                <td style={tdStyle}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <strong style={{ color: day.isToday ? '#0284C7' : '#1E293B' }}>{day.dayName}</strong>
                                        <span style={{ color: '#64748B', fontSize: '12px' }}>({day.dateLabel})</span>
                                        {day.isToday && (
                                            <span style={{ fontSize: '10px', background: '#0284C7', color: '#FFF', padding: '1px 5px', borderRadius: '4px', textTransform: 'uppercase', fontWeight: 700 }}>
                                                Today
                                            </span>
                                        )}
                                    </div>
                                </td>
                                <td style={tdStyle}>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <span
                                                style={{
                                                    fontSize: '11px',
                                                    fontWeight: 700,
                                                    padding: '2px 7px',
                                                    borderRadius: '4px',
                                                    background: `${day.tierColor}15`,
                                                    color: day.tierColor,
                                                    border: `1px solid ${day.tierColor}30`,
                                                }}
                                            >
                                                {day.tierBadge}
                                            </span>
                                            <span style={{ fontSize: '12px', color: '#475569', fontWeight: 500 }}>
                                                Day {day.dayInTier} of {day.totalDaysInTier}
                                            </span>
                                        </div>
                                        <span style={{ fontSize: '11px', color: '#64748B' }}>{day.tierName}</span>
                                    </div>
                                </td>
                                <td style={tdStyle}>
                                    <span style={{ fontSize: '15px', fontWeight: 700, color: '#0F172A' }}>
                                        {day.targetMessages}
                                    </span>
                                    {day.isToday && (
                                        <span style={{ display: 'block', fontSize: '11px', color: '#0284C7', fontWeight: 600 }}>
                                            {day.allowedTodayRemaining} remaining today
                                        </span>
                                    )}
                                </td>
                                <td style={tdStyle}>
                                    {day.isStepUpDay ? (
                                        <span style={{ fontSize: '11px', fontWeight: 700, background: '#FEF3C7', color: '#92400E', padding: '2px 6px', borderRadius: '4px' }}>
                                            ▲ Gentle Step (+{day.stepUpAmount})
                                        </span>
                                    ) : day.fluctuation > 0 ? (
                                        <span style={{ fontSize: '11px', fontWeight: 600, background: '#ECFDF5', color: '#047857', padding: '2px 6px', borderRadius: '4px' }}>
                                            +{day.fluctuation} organic jitter
                                        </span>
                                    ) : day.fluctuation < 0 ? (
                                        <span style={{ fontSize: '11px', fontWeight: 600, background: '#F1F5F9', color: '#475569', padding: '2px 6px', borderRadius: '4px' }}>
                                            {day.fluctuation} organic jitter
                                        </span>
                                    ) : (
                                        <span style={{ fontSize: '11px', color: '#64748B' }}>
                                            Plateau Base
                                        </span>
                                    )}
                                </td>
                                <td style={tdStyle}>
                                    <div style={{ color: '#334155' }}>
                                        {day.batchesNeeded} {day.batchesNeeded === 1 ? 'batch' : 'batches'} of ~{day.waveMin}–{day.waveMax}
                                    </div>
                                    <span style={{ fontSize: '11px', color: '#64748B' }}>
                                        {day.intraDelayMin}–{day.intraDelayMax}s delay · {day.cooldownMin}–{day.cooldownMax}m break
                                    </span>
                                </td>
                                <td style={tdStyle}>
                                    <span style={{ color: '#0F172A' }}>{day.activeTimeMinutes}m</span>
                                </td>
                                <td style={tdStyle}>
                                    <span style={{ color: '#64748B' }}>{day.restTimeMinutes > 0 ? `${day.restTimeMinutes}m` : '0m'}</span>
                                </td>
                                <td style={tdStyle}>
                                    <strong style={{ color: '#162860' }}>
                                        {day.totalTimeMinutes >= 60
                                            ? `${Math.floor(day.totalTimeMinutes / 60)}h ${day.totalTimeMinutes % 60}m`
                                            : `${day.totalTimeMinutes}m`}
                                    </strong>
                                </td>
                                <td style={tdStyle}>
                                    <span style={{ color: day.remainingQueue === 0 ? '#16A34A' : '#64748B', fontWeight: day.remainingQueue === 0 ? 700 : 400 }}>
                                        {day.remainingQueue === 0 ? '✓ Cleared' : `${day.remainingQueue.toLocaleString()} left`}
                                    </span>
                                </td>
                                <td style={tdStyle}>
                                    <span
                                        style={{
                                            fontSize: '11px',
                                            fontWeight: 600,
                                            padding: '2px 8px',
                                            borderRadius: '999px',
                                            background: day.riskLevel === 'Ultra-Safe' ? '#DCFCE7' : day.riskLevel === 'Safe' ? '#EFF6FF' : '#FEF3C7',
                                            color: day.riskLevel === 'Ultra-Safe' ? '#166534' : day.riskLevel === 'Safe' ? '#1E40AF' : '#92400E',
                                        }}
                                    >
                                        {day.riskLevel}
                                    </span>
                                </td>
                                {onApplyDayParams && (
                                    <td style={tdStyle}>
                                        <button
                                            type="button"
                                            onClick={() => onApplyDayParams({
                                                max_daily_messages: day.targetMessages,
                                                wave_min: day.waveMin,
                                                wave_max: day.waveMax,
                                                daily_wave_target: day.batchesNeeded + 2,
                                                cooldown_min_minutes: day.cooldownMin,
                                                cooldown_max_minutes: day.cooldownMax,
                                                intra_delay_min_seconds: day.intraDelayMin,
                                                intra_delay_max_seconds: day.intraDelayMax,
                                            })}
                                            title="Load this day's plateau parameters into the Algorithm Controls above"
                                            style={loadBtnStyle}
                                        >
                                            Load Plan
                                        </button>
                                    </td>
                                )}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Helpful Explanation Footer */}
            <div style={{ marginTop: '16px', background: '#F8FAFC', borderRadius: '10px', padding: '16px 20px', border: '1px solid #E2E8F0' }}>
                <p style={{ margin: 0, fontSize: '13px', color: '#334155', lineHeight: 1.6 }}>
                    🛡 <strong>Why the 21-Day Slow Ramp is Maximum Stealth:</strong> WhatsApp looks at rolling 7-day and 14-day velocity curves. By spending <strong>3 to 4 days on each tier</strong> and stepping up by only <strong>+6 to +12 messages</strong> at a time ($25 \rightarrow 32 \rightarrow 40 \rightarrow 50 \rightarrow 62 \rightarrow 75$), combined with organic daily adjustments (<strong>±1 to ±2 messages</strong>, e.g. 25, 26, 24, 25), the account grows steadily across 3 weeks without ever triggering WhatsApp velocity anomalies or bot detection.
                </p>
            </div>
        </section>
    )
}

const cardStyle: React.CSSProperties = {
    background: '#FFF',
    borderRadius: '16px',
    border: '1px solid #F0F0F0',
    boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
    padding: '22px 24px',
    marginBottom: '20px',
}

const toggleBtnStyle: React.CSSProperties = {
    border: 'none',
    padding: '6px 14px',
    borderRadius: '6px',
    fontSize: '12.5px',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
}

const kpiCardStyle: React.CSSProperties = {
    background: '#F8FAFC',
    borderRadius: '10px',
    padding: '14px 16px',
    border: '1px solid #E2E8F0',
    display: 'flex',
    flexDirection: 'column',
    gap: '3px',
}

const kpiLabelStyle: React.CSSProperties = {
    fontSize: '11px',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '.04em',
    color: '#64748B',
}

const kpiValueStyle: React.CSSProperties = {
    fontSize: '18px',
    fontWeight: 700,
    color: '#0F172A',
}

const kpiSubStyle: React.CSSProperties = {
    fontSize: '11.5px',
    color: '#64748B',
}

const thStyle: React.CSSProperties = {
    padding: '12px 14px',
    fontWeight: 600,
}

const tdStyle: React.CSSProperties = {
    padding: '12px 14px',
    verticalAlign: 'middle',
}

const loadBtnStyle: React.CSSProperties = {
    border: '1px solid #CBD5E1',
    background: '#FFF',
    color: '#0F172A',
    borderRadius: '6px',
    padding: '5px 10px',
    fontSize: '11.5px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
}
