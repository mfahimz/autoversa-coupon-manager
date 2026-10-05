export type LimitRecommendationType = 'decrease' | 'increase' | 'hold'

export interface LimitRecommendation {
    type: LimitRecommendationType
    currentMax: number
    recommendedMax: number
    healthScore: number
    consecutiveFailures: number
    recentNegRate: number | null
    messagesSentToday: number
    title: string
    reason: string
    urgency: 'high' | 'medium' | 'info'
    actionLabel: string
}

export interface RecommendationParams {
    currentMax: number
    healthScore: number
    recentNegRate: number | null
    consecutiveFailures: number
    messagesSentToday: number
    recentOutcomes?: number
}

const MIN_SAFETY_FLOOR = 10

function uaeDayKey(): string {
    return new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

function getDismissalKey(type: string, targetCap: number): string {
    return `broadcast_limit_modal_dismissed_${uaeDayKey()}_${type}_${targetCap}`
}

export function isRecommendationDismissed(type: string, targetCap: number): boolean {
    if (typeof window === 'undefined') return false
    try {
        return localStorage.getItem(getDismissalKey(type, targetCap)) === 'true'
    } catch {
        return false
    }
}

export function markRecommendationDismissed(type: string, targetCap: number): void {
    if (typeof window === 'undefined') return
    try {
        localStorage.setItem(getDismissalKey(type, targetCap), 'true')
    } catch {
        // ignore storage errors
    }
}

export function evaluateLimitRecommendation(params: RecommendationParams): LimitRecommendation {
    const { currentMax, healthScore, recentNegRate, consecutiveFailures, messagesSentToday, recentOutcomes } = params
    const safeCurrent = Math.max(MIN_SAFETY_FLOOR, currentMax || 25)

    // Statistical evidence check: A minimum of 10 recent verified outcomes is required.
    // If recentOutcomes < 10 or recentNegRate === null, we do NOT have enough data to prove health.
    const outcomeCount = recentOutcomes ?? (recentNegRate !== null ? 10 : 0)
    const hasSufficientEvidence = outcomeCount >= 10 && recentNegRate !== null

    // 1. Critical or High Risk -> DECREASE
    if (consecutiveFailures >= 2 || (recentNegRate !== null && recentNegRate >= 0.15) || healthScore < 60) {
        // If already at or below the safety floor, we cannot decrease further
        if (safeCurrent <= MIN_SAFETY_FLOOR) {
            return {
                type: 'hold',
                currentMax: safeCurrent,
                recommendedMax: MIN_SAFETY_FLOOR,
                healthScore,
                consecutiveFailures,
                recentNegRate,
                messagesSentToday,
                title: 'At Minimum Safety Floor (10 msgs/day)',
                reason: `Delivery friction detected (Health: ${Math.round(healthScore)}/100, Consecutive failures: ${consecutiveFailures}). Account is already at the lowest safe operating floor (10 msgs/day). Consider pausing outreach today to allow WhatsApp trust recovery.`,
                urgency: 'high',
                actionLabel: 'Hold at Minimum Floor (10 msgs)',
            }
        }

        // Guaranteed strict decrease: at least 5 messages less than safeCurrent, down to MIN_SAFETY_FLOOR
        const rawCalculated = Math.round((safeCurrent * 0.65) / 5) * 5
        const decreaseTarget = Math.max(MIN_SAFETY_FLOOR, Math.min(safeCurrent - 5, rawCalculated))
        const reason = consecutiveFailures >= 2
            ? `${consecutiveFailures} consecutive failed deliveries detected. WhatsApp may be flagging recent outreach.`
            : recentNegRate !== null && recentNegRate >= 0.15
            ? `High failure rate (${Math.round(recentNegRate * 100)}%) in recent dispatches.`
            : `Account health score has dropped to ${Math.round(healthScore)}/100.`

        return {
            type: 'decrease',
            currentMax: safeCurrent,
            recommendedMax: decreaseTarget,
            healthScore,
            consecutiveFailures,
            recentNegRate,
            messagesSentToday,
            title: 'Reduce Daily Volume (Safety Advisory)',
            reason: `${reason} Lowering your daily ceiling from ${safeCurrent} to ${decreaseTarget} messages gives the account breathing room to prevent WhatsApp blocking.`,
            urgency: 'high',
            actionLabel: `Decrease Limit to ${decreaseTarget} msgs`,
        }
    }

    // 2. Moderate Risk -> DECREASE
    if ((recentNegRate !== null && recentNegRate >= 0.10) || healthScore < 75) {
        if (safeCurrent <= MIN_SAFETY_FLOOR) {
            return {
                type: 'hold',
                currentMax: safeCurrent,
                recommendedMax: MIN_SAFETY_FLOOR,
                healthScore,
                consecutiveFailures,
                recentNegRate,
                messagesSentToday,
                title: 'Maintain Minimum Safety Floor',
                reason: `Recent delivery signals show slight friction (Health: ${Math.round(healthScore)}/100). The account is currently at the minimum safety floor (10 msgs/day).`,
                urgency: 'medium',
                actionLabel: 'Hold Current Floor',
            }
        }

        // Guaranteed strict decrease: at least 5 messages less than safeCurrent
        const rawCalculated = Math.round((safeCurrent * 0.80) / 5) * 5
        const decreaseTarget = Math.max(MIN_SAFETY_FLOOR, Math.min(safeCurrent - 5, rawCalculated))

        return {
            type: 'decrease',
            currentMax: safeCurrent,
            recommendedMax: decreaseTarget,
            healthScore,
            consecutiveFailures,
            recentNegRate,
            messagesSentToday,
            title: 'Slight Volume Adjustment Recommended',
            reason: `Recent delivery signals show slight friction (Health: ${Math.round(healthScore)}, Failure rate: ${recentNegRate ? Math.round(recentNegRate * 100) : 0}%). Pacing down from ${safeCurrent} to ${decreaseTarget} msgs protects your WhatsApp number.`,
            urgency: 'medium',
            actionLabel: `Set Limit to ${decreaseTarget} msgs`,
        }
    }

    // 3. Healthy & High Utilization -> INCREASE
    // CRITICAL: We require POSITIVE, VERIFIED evidence of health, NOT absence of evidence!
    // Missing evidence (recentNegRate === null or outcomeCount < 10) must NEVER trigger an increase.
    if (
        healthScore >= 85 &&
        hasSufficientEvidence &&
        recentNegRate !== null &&
        recentNegRate < 0.05 &&
        consecutiveFailures === 0 &&
        messagesSentToday >= safeCurrent * 0.70 &&
        safeCurrent < 500
    ) {
        let increaseTarget: number
        if (safeCurrent < 32) increaseTarget = 32
        else if (safeCurrent < 40) increaseTarget = 40
        else if (safeCurrent < 50) increaseTarget = 50
        else if (safeCurrent < 62) increaseTarget = 62
        else if (safeCurrent < 75) increaseTarget = 75
        else if (safeCurrent < 90) increaseTarget = 90
        else if (safeCurrent < 110) increaseTarget = 110
        else if (safeCurrent < 130) increaseTarget = 130
        else if (safeCurrent < 150) increaseTarget = 150
        else increaseTarget = Math.min(200, safeCurrent + 10)

        return {
            type: 'increase',
            currentMax: safeCurrent,
            recommendedMax: increaseTarget,
            healthScore,
            consecutiveFailures,
            recentNegRate,
            messagesSentToday,
            title: 'Advance to Next Volume Plateau',
            reason: `Account health is verified excellent (${Math.round(healthScore)}/100) with ${outcomeCount} positive outcomes, 0 failures, and strong activity (${messagesSentToday}/${safeCurrent} sent). Recommending a safe step up from ${safeCurrent} to the ${increaseTarget} msgs/day plateau. Senders should remain at this new plateau for 3–4 days with natural daily fluctuations before any further increase.`,
            urgency: 'info',
            actionLabel: `Step Up to ${increaseTarget} msgs Plateau`,
        }
    }

    // 4. High utilization but insufficient evidence yet -> HOLD with guidance
    if (messagesSentToday >= safeCurrent * 0.70 && !hasSufficientEvidence && healthScore >= 80) {
        return {
            type: 'hold',
            currentMax: safeCurrent,
            recommendedMax: safeCurrent,
            healthScore,
            consecutiveFailures,
            recentNegRate,
            messagesSentToday,
            title: 'Gathering Delivery Evidence',
            reason: `Account sent ${messagesSentToday} messages today, but has fewer than 10 verified delivery outcomes (${outcomeCount} recorded so far). To protect the number from sudden velocity flags, the algorithm holds the limit at ${safeCurrent} msgs until positive delivery health is confirmed.`,
            urgency: 'info',
            actionLabel: 'Keep Current Limit',
        }
    }

    // 5. Balanced / Steady
    return {
        type: 'hold',
        currentMax: safeCurrent,
        recommendedMax: safeCurrent,
        healthScore,
        consecutiveFailures,
        recentNegRate,
        messagesSentToday,
        title: 'Outreach Limits are Optimal',
        reason: 'Current delivery signals and health scores are well-balanced with configured limits.',
        urgency: 'info',
        actionLabel: 'Keep Current Limit',
    }
}
