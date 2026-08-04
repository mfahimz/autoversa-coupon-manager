import { createClient } from '@/lib/supabase/client'

export interface AdvisorCommissionSummary {
    advisor_code: string
    advisor_name: string
    profile_id: string | null
    total_issued: number
    total_visits: number
    total_earned: number
    total_paid: number
    pending_balance: number
}

export interface AdvisorCommissionPayout {
    id: string
    advisor_code: string
    advisor_name: string
    profile_id: string | null
    payout_amount: number
    payment_date: string
    period_start_date: string | null
    period_end_date: string | null
    payment_method: string
    reference_number: string | null
    notes: string | null
    paid_by: string | null
    paid_by_name?: string
    status: string
    created_at: string
    updated_at: string
}

export interface CreatePayoutPayload {
    advisor_code: string
    advisor_name: string
    profile_id?: string | null
    payout_amount: number
    payment_date: string
    period_start_date?: string | null
    period_end_date?: string | null
    payment_method: string
    reference_number?: string | null
    notes?: string | null
}

export const PAYMENT_METHODS = [
    { value: 'BANK_TRANSFER', label: 'Bank Transfer' },
    { value: 'CASH', label: 'Cash' },
    { value: 'CHEQUE', label: 'Cheque' },
    { value: 'EXCHANGE', label: 'Exchange / Exchange House' },
    { value: 'OTHER', label: 'Other' },
]

export async function fetchAdvisorCommissionSummaries(): Promise<AdvisorCommissionSummary[]> {
    const supabase = createClient()

    // 1. Fetch active service advisors
    const { data: advisors, error: advisorErr } = await supabase
        .from('profiles')
        .select('id, full_name, advisor_code, user_role')
        .in('user_role', ['SERVICE_ADVISOR', 'BMW_SERVICE_ADVISOR'])
        .eq('is_active', true)
        .order('full_name')

    if (advisorErr) {
        console.error('Error fetching advisors:', advisorErr)
        throw new Error(advisorErr.message)
    }

    const advisorList = (advisors || []).filter(a => !!a.advisor_code)

    if (advisorList.length === 0) return []

    const advisorCodes = advisorList.map(a => a.advisor_code as string)
    const advisorProfileIds = advisorList.map(a => a.id)

    // 2. Fetch loyalty coupons issued by advisors
    const { data: loyaltyCoupons } = await supabase
        .from('coupons')
        .select('id, advisor_code, issued_by, offer_id')
        .eq('coupon_type', 'LOYALTY')

    const filteredLoyalty = (loyaltyCoupons || []).filter(
        c => (c.advisor_code && advisorCodes.includes(c.advisor_code)) || (c.issued_by && advisorProfileIds.includes(c.issued_by))
    )

    const loyaltyIds = filteredLoyalty.map(c => c.id)
    const offerIds = Array.from(new Set(filteredLoyalty.map(c => c.offer_id).filter(Boolean))) as string[]

    // 3. Fetch referral coupons and offer details
    const [referralsRes, offersRes, splitsRes, payoutsRes] = await Promise.all([
        loyaltyIds.length > 0
            ? supabase.from('coupons').select('id, offer_id, parent_coupon_id, advisor_code, issued_by').in('parent_coupon_id', loyaltyIds).eq('coupon_type', 'REFERRAL')
            : Promise.resolve({ data: [] as any }),
        offerIds.length > 0
            ? supabase.from('offers').select('id, commission_amount').in('id', offerIds)
            : Promise.resolve({ data: [] as any }),
        supabase.from('coupon_commission_splits').select('advisor_code, advisor_amount'),
        supabase.from('advisor_commission_payouts').select('advisor_code, payout_amount, status').eq('status', 'COMPLETED'),
    ])

    const referralCoupons = referralsRes.data || []
    const offersData = offersRes.data || []
    const splitsData = splitsRes.data || []
    const payoutsData = payoutsRes.data || []

    const offerCommissionMap: Record<string, number> = {}
    offersData.forEach((o: any) => {
        offerCommissionMap[o.id] = o.commission_amount || 0
    })

    // 4. Fetch visited appointments for referral coupons
    const referralIds = referralCoupons.map((r: any) => r.id)
    const { data: visitedAppts } = referralIds.length > 0
        ? await supabase.from('appointments').select('coupon_id, offer_id').in('coupon_id', referralIds).eq('status', 'visited')
        : { data: [] }

    const visitedCouponIds = new Set((visitedAppts || []).map((a: any) => a.coupon_id))

    // Build loyalty coupon parent lookup
    const loyaltyByChildId: Record<string, any> = {}
    referralCoupons.forEach((ref: any) => {
        const parent = filteredLoyalty.find(l => l.id === ref.parent_coupon_id)
        if (parent) loyaltyByChildId[ref.id] = parent
    })

    // 5. Aggregate metrics per advisor
    const summaryMap: Record<string, AdvisorCommissionSummary> = {}

    advisorList.forEach(adv => {
        const code = adv.advisor_code as string
        summaryMap[code] = {
            advisor_code: code,
            advisor_name: adv.full_name || 'Advisor (' + code + ')',
            profile_id: adv.id,
            total_issued: 0,
            total_visits: 0,
            total_earned: 0,
            total_paid: 0,
            pending_balance: 0,
        }
    })

    // Count issued loyalty coupons
    filteredLoyalty.forEach(c => {
        const code = c.advisor_code || (c.issued_by ? advisorList.find(a => a.id === c.issued_by)?.advisor_code : null)
        if (code && summaryMap[code]) {
            summaryMap[code].total_issued++
        }
    })

    // Count visits & commission earned
    referralCoupons.forEach((ref: any) => {
        if (visitedCouponIds.has(ref.id)) {
            const parent = loyaltyByChildId[ref.id]
            const code = parent?.advisor_code || ref.advisor_code || (parent?.issued_by ? advisorList.find(a => a.id === parent.issued_by)?.advisor_code : null)
            if (code && summaryMap[code]) {
                summaryMap[code].total_visits++
                const comm = offerCommissionMap[ref.offer_id] || offerCommissionMap[parent?.offer_id] || 0
                summaryMap[code].total_earned += comm
            }
        }
    })

    // Add splits earnings if applicable
    splitsData.forEach((s: any) => {
        if (s.advisor_code && summaryMap[s.advisor_code]) {
            summaryMap[s.advisor_code].total_earned += s.advisor_amount || 0
        }
    })

    // Sum paid amounts
    payoutsData.forEach((p: any) => {
        if (p.advisor_code && summaryMap[p.advisor_code]) {
            summaryMap[p.advisor_code].total_paid += Number(p.payout_amount) || 0
        }
    })

    // Calculate pending balance
    Object.values(summaryMap).forEach(s => {
        s.pending_balance = Math.max(0, s.total_earned - s.total_paid)
    })

    return Object.values(summaryMap).sort((a, b) => b.total_earned - a.total_earned)
}

export async function fetchPayoutHistory(filters?: {
    advisorCode?: string
    dateFrom?: string
    dateTo?: string
    paymentMethod?: string
}): Promise<AdvisorCommissionPayout[]> {
    const supabase = createClient()

    let query = supabase
        .from('advisor_commission_payouts')
        .select('id, advisor_code, advisor_name, profile_id, payout_amount, payment_date, period_start_date, period_end_date, payment_method, reference_number, notes, paid_by, status, created_at, updated_at')
        .order('payment_date', { ascending: false })
        .order('created_at', { ascending: false })

    if (filters?.advisorCode && filters.advisorCode !== 'all') {
        query = query.eq('advisor_code', filters.advisorCode)
    }
    if (filters?.dateFrom) {
        query = query.gte('payment_date', filters.dateFrom)
    }
    if (filters?.dateTo) {
        query = query.lte('payment_date', filters.dateTo)
    }
    if (filters?.paymentMethod && filters.paymentMethod !== 'all') {
        query = query.eq('payment_method', filters.paymentMethod)
    }

    const { data: payouts, error } = await query

    if (error) {
        console.error('Error fetching payout history:', error)
        return []
    }

    if (!payouts || payouts.length === 0) return []

    // Resolve paid_by profile names
    const paidByIds = Array.from(new Set(payouts.map(p => p.paid_by).filter(Boolean))) as string[]
    const nameMap: Record<string, string> = {}

    if (paidByIds.length > 0) {
        const { data: profiles } = await supabase
            .from('profiles')
            .select('id, full_name')
            .in('id', paidByIds)

        ;(profiles || []).forEach((p: any) => {
            nameMap[p.id] = p.full_name || 'Admin'
        })
    }

    return payouts.map(p => ({
        ...p,
        payout_amount: Number(p.payout_amount),
        paid_by_name: p.paid_by ? (nameMap[p.paid_by] || 'Admin') : 'System',
    }))
}

export async function recordCommissionPayout(payload: CreatePayoutPayload): Promise<AdvisorCommissionPayout> {
    if (!payload.advisor_code) throw new Error('Advisor code is required')
    if (!payload.advisor_name) throw new Error('Advisor name is required')
    if (!payload.payout_amount || payload.payout_amount <= 0) throw new Error('Payout amount must be greater than 0')
    if (!payload.payment_date) throw new Error('Payment date is required')

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    const insertRow = {
        advisor_code: payload.advisor_code,
        advisor_name: payload.advisor_name,
        profile_id: payload.profile_id || null,
        payout_amount: payload.payout_amount,
        payment_date: payload.payment_date,
        period_start_date: payload.period_start_date || null,
        period_end_date: payload.period_end_date || null,
        payment_method: payload.payment_method || 'BANK_TRANSFER',
        reference_number: payload.reference_number || null,
        notes: payload.notes || null,
        paid_by: user?.id || null,
        status: 'COMPLETED',
    }

    const { data, error } = await supabase
        .from('advisor_commission_payouts')
        .insert(insertRow)
        .select()
        .single()

    if (error) {
        console.error('Error recording commission payout:', error)
        throw new Error(error.message || 'Failed to record payout')
    }

    return {
        ...data,
        payout_amount: Number(data.payout_amount),
    }
}

export async function deleteCommissionPayout(payoutId: string): Promise<void> {
    const supabase = createClient()

    const { error } = await supabase
        .from('advisor_commission_payouts')
        .delete()
        .eq('id', payoutId)

    if (error) {
        console.error('Error deleting commission payout:', error)
        throw new Error(error.message || 'Failed to delete payout record')
    }
}
