'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { LimitRecommendation, markRecommendationDismissed } from '@/lib/broadcastLimitAdvisor'

interface LimitReviewModalProps {
    isOpen: boolean
    onClose: () => void
    recommendation: LimitRecommendation
    isOverviewPage?: boolean
    onApply: (newLimit: number) => Promise<void> | void
}

export default function LimitReviewModal({
    isOpen,
    onClose,
    recommendation,
    isOverviewPage,
    onApply,
}: LimitReviewModalProps) {
    const router = useRouter()
    const [customLimit, setCustomLimit] = useState(String(recommendation.recommendedMax))
    const [applying, setApplying] = useState(false)

    useEffect(() => {
        setCustomLimit(String(recommendation.recommendedMax))
    }, [recommendation.recommendedMax])

    if (!isOpen) return null

    const isDecrease = recommendation.type === 'decrease'
    const isIncrease = recommendation.type === 'increase'

    const handleDismiss = () => {
        markRecommendationDismissed(recommendation.type, recommendation.recommendedMax)
        onClose()
    }

    const handleApply = async () => {
        const parsed = parseInt(customLimit, 10)
        if (isNaN(parsed) || parsed < 10) {
            return
        }
        setApplying(true)
        try {
            await onApply(parsed)
            markRecommendationDismissed(recommendation.type, recommendation.recommendedMax)
            onClose()
        } finally {
            setApplying(false)
        }
    }

    const handleNavigateToAlgorithm = () => {
        markRecommendationDismissed(recommendation.type, recommendation.recommendedMax)
        onClose()
        router.push('/broadcast-outreach/performance#max-messages-control')
    }

    return (
        <div
            onClick={e => { if (e.target === e.currentTarget) handleDismiss() }}
            style={{
                position: 'fixed',
                inset: 0,
                backgroundColor: 'rgba(15, 23, 42, 0.65)',
                backdropFilter: 'blur(4px)',
                zIndex: 9999,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '20px',
            }}
        >
            <div
                style={{
                    backgroundColor: '#FFFFFF',
                    borderRadius: '20px',
                    width: '100%',
                    maxWidth: '560px',
                    boxShadow: '0 20px 40px -15px rgba(0, 0, 0, 0.25)',
                    overflow: 'hidden',
                    animation: 'modalSlideIn 0.25s ease-out',
                }}
            >
                {/* Header stripe */}
                <div
                    style={{
                        height: '6px',
                        background: isDecrease ? '#DC2626' : isIncrease ? '#16A34A' : '#0074BD',
                    }}
                />

                <div style={{ padding: '28px 32px 24px' }}>
                    {/* Header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', marginBottom: '14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <div
                                style={{
                                    width: '44px',
                                    height: '44px',
                                    borderRadius: '12px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '22px',
                                    background: isDecrease ? '#FEE2E2' : isIncrease ? '#DCFCE7' : '#EFF6FF',
                                }}
                            >
                                {isDecrease ? '⚠️' : isIncrease ? '📈' : '🛡️'}
                            </div>
                            <div>
                                <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#0F172A', margin: 0 }}>
                                    {recommendation.title}
                                </h3>
                                <span style={{
                                    fontSize: '11px',
                                    fontWeight: 700,
                                    textTransform: 'uppercase',
                                    letterSpacing: '.05em',
                                    color: isDecrease ? '#991B1B' : '#166534',
                                }}>
                                    {isDecrease ? 'Anti-Block Safety Trigger' : 'Capacity Growth Window'}
                                </span>
                            </div>
                        </div>
                        <button
                            onClick={handleDismiss}
                            style={{
                                background: 'none',
                                border: 'none',
                                fontSize: '22px',
                                color: '#94A3B8',
                                cursor: 'pointer',
                                padding: '4px',
                                lineHeight: 1,
                            }}
                            title="Close"
                        >
                            ✕
                        </button>
                    </div>

                    {/* Explanation */}
                    <div
                        style={{
                            background: isDecrease ? '#FFF1F2' : '#F0FDF4',
                            border: `1px solid ${isDecrease ? '#FECDD3' : '#BBF7D0'}`,
                            borderRadius: '12px',
                            padding: '14px 16px',
                            marginBottom: '20px',
                        }}
                    >
                        <p style={{ margin: 0, fontSize: '13.5px', lineHeight: 1.55, color: isDecrease ? '#881337' : '#14532D' }}>
                            {recommendation.reason}
                        </p>
                    </div>

                    {/* Key Metrics Grid */}
                    <div
                        style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(4, 1fr)',
                            gap: '10px',
                            marginBottom: '22px',
                        }}
                    >
                        <div style={metricBoxStyle}>
                            <span style={metricLabelStyle}>Health Score</span>
                            <strong style={{ ...metricValStyle, color: recommendation.healthScore >= 70 ? '#166534' : '#DC2626' }}>
                                {Math.round(recommendation.healthScore)}
                            </strong>
                        </div>
                        <div style={metricBoxStyle}>
                            <span style={metricLabelStyle}>Fail Streak</span>
                            <strong style={{ ...metricValStyle, color: recommendation.consecutiveFailures > 0 ? '#DC2626' : '#166534' }}>
                                {recommendation.consecutiveFailures}
                            </strong>
                        </div>
                        <div style={metricBoxStyle}>
                            <span style={metricLabelStyle}>Negative Rate</span>
                            <strong style={{ ...metricValStyle, color: (recommendation.recentNegRate ?? 0) >= 0.1 ? '#DC2626' : '#166534' }}>
                                {recommendation.recentNegRate !== null ? `${Math.round(recommendation.recentNegRate * 100)}%` : '0%'}
                            </strong>
                        </div>
                        <div style={metricBoxStyle}>
                            <span style={metricLabelStyle}>Sent Today</span>
                            <strong style={{ ...metricValStyle, color: '#1E293B' }}>
                                {recommendation.messagesSentToday}
                            </strong>
                        </div>
                    </div>

                    {/* Limit Adjustment Controls */}
                    <div
                        style={{
                            background: '#F8FAFC',
                            borderRadius: '14px',
                            padding: '16px 20px',
                            border: '1px solid #E2E8F0',
                            marginBottom: '24px',
                        }}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                            <div>
                                <span style={{ fontSize: '13px', fontWeight: 600, color: '#475569' }}>
                                    Current Safety Ceiling: <strong style={{ color: '#0F172A' }}>{recommendation.currentMax} msgs/day</strong>
                                </span>
                                <p style={{ fontSize: '12px', color: '#64748B', margin: '3px 0 0' }}>
                                    Recommended: <strong style={{ color: isDecrease ? '#DC2626' : '#16A34A' }}>{recommendation.recommendedMax} msgs/day</strong>
                                </p>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <label style={{ fontSize: '12px', fontWeight: 700, color: '#334155' }}>
                                    New Limit:
                                </label>
                                <input
                                    type="number"
                                    min={10}
                                    max={600}
                                    value={customLimit}
                                    onChange={e => setCustomLimit(e.target.value)}
                                    style={{
                                        width: '100px',
                                        padding: '8px 12px',
                                        borderRadius: '8px',
                                        border: '1.5px solid #CBD5E1',
                                        fontSize: '15px',
                                        fontWeight: 700,
                                        color: '#0F172A',
                                        textAlign: 'center',
                                        outline: 'none',
                                    }}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Actions */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                        <button
                            onClick={handleNavigateToAlgorithm}
                            style={{
                                background: 'none',
                                border: 'none',
                                color: '#0074BD',
                                fontSize: '13px',
                                fontWeight: 600,
                                cursor: 'pointer',
                                padding: '8px 4px',
                                textDecoration: 'underline',
                            }}
                        >
                            Open Algorithm Controls →
                        </button>

                        <div style={{ display: 'flex', gap: '10px' }}>
                            <button
                                onClick={handleDismiss}
                                disabled={applying}
                                style={{
                                    padding: '10px 18px',
                                    background: '#F1F5F9',
                                    color: '#475569',
                                    border: '1px solid #CBD5E1',
                                    borderRadius: '10px',
                                    fontSize: '13px',
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                }}
                            >
                                Keep Current
                            </button>
                            <button
                                onClick={handleApply}
                                disabled={applying}
                                style={{
                                    padding: '10px 22px',
                                    background: isDecrease ? '#DC2626' : '#16A34A',
                                    color: '#FFF',
                                    border: 'none',
                                    borderRadius: '10px',
                                    fontSize: '13px',
                                    fontWeight: 700,
                                    cursor: applying ? 'not-allowed' : 'pointer',
                                    boxShadow: isDecrease
                                        ? '0 4px 12px rgba(220, 38, 38, 0.3)'
                                        : '0 4px 12px rgba(22, 163, 74, 0.3)',
                                }}
                            >
                                {applying ? 'Applying…' : `Apply ${customLimit} msgs`}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}

const metricBoxStyle: React.CSSProperties = {
    background: '#F8FAFC',
    borderRadius: '10px',
    padding: '10px 12px',
    border: '1px solid #E2E8F0',
    textAlign: 'center',
}

const metricLabelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: '11px',
    color: '#64748B',
    fontWeight: 600,
    marginBottom: '4px',
}

const metricValStyle: React.CSSProperties = {
    fontSize: '16px',
    fontWeight: 700,
}
