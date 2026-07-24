import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { Database } from '@/lib/database.types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ADVISOR_ROLES = ['SERVICE_ADVISOR', 'BMW_SERVICE_ADVISOR']

export async function GET(request: NextRequest) {
    const cookieStore = cookies()
    const supabase = createServerClient<Database>(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { cookies: { get: (name) => cookieStore.get(name)?.value } }
    )

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('user_role, is_active, full_name')
        .eq('id', user.id)
        .single()

    if (profileError || !profile || !profile.is_active) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { data: permission } = await supabase
        .from('role_permissions')
        .select('is_allowed')
        .eq('role', profile.user_role)
        .eq('resource', 'page:follow-up')
        .eq('action', 'view')
        .single()

    if (profile.user_role !== 'ADMIN' && !permission?.is_allowed) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const issuedByFilter = searchParams.get('issuedBy')

    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - 8)

    // Get IDs of REFERRAL coupons that have been redeemed (have an invoiced/visited appointment)
    const { data: redeemedData } = await supabase
        .from('appointments')
        .select('coupon_id')
        .in('status', ['INVOICED', 'VISITED'])
        .not('coupon_id', 'is', null)

    const redeemedCouponIds = Array.from(
        new Set((redeemedData ?? []).map((a) => a.coupon_id).filter(Boolean))
    ) as string[]

    let query = supabase
        .from('coupons')
        .select(`
      id,
      coupon_code,
      plate_number,
      coupon_type,
      status,
      issued_by,
      advisor_name,
      mobile_number,
      created_at,
      offers ( title )
    `)
        .eq('coupon_type', 'REFERRAL')
        .eq('status', 'ACTIVE')
        .lt('created_at', cutoff.toISOString())
        .order('created_at', { ascending: true })

    if (redeemedCouponIds.length > 0) {
        query = query.not('id', 'in', `(${redeemedCouponIds.map(id => `"${id}"`).join(',')})`)
    }

    if (ADVISOR_ROLES.includes(profile.user_role)) {
        query = query.eq('issued_by', user.id)
    } else if (issuedByFilter) {
        query = query.eq('issued_by', issuedByFilter)
    }

    const { data: coupons, error: couponsError } = await query

    if (couponsError) {
        return NextResponse.json({ error: couponsError.message }, { status: 500 })
    }

    // Fetch follow-ups separately
    const couponIds = (coupons ?? []).map((c) => c.id)
    type FollowUpRow = {
        id: string
        coupon_id: string
        follow_up_status: string
        followed_up_by: string
        created_at: string
        updated_at: string
    }
    const followUpsMap: Record<string, FollowUpRow[]> = {}

    if (couponIds.length > 0) {
        const { data: followUps } = await supabase
            .from('coupon_follow_ups')
            .select('id, coupon_id, follow_up_status, followed_up_by, created_at, updated_at')
            .in('coupon_id', couponIds)

        for (const fu of followUps ?? []) {
            if (!followUpsMap[fu.coupon_id]) followUpsMap[fu.coupon_id] = []
            followUpsMap[fu.coupon_id].push(fu as FollowUpRow)
        }
    }

    // Resolve issuer names
    const issuerIds = Array.from(new Set((coupons ?? []).map((c) => c.issued_by).filter(Boolean)))
    let issuerNames: Record<string, string> = {}

    if (issuerIds.length > 0) {
        const { data: issuerProfiles } = await supabase
            .from('profiles')
            .select('id, full_name')
            .in('id', issuerIds as string[])

        issuerNames = Object.fromEntries(
            (issuerProfiles ?? []).map((p) => [p.id, p.full_name ?? 'Unknown'])
        )
    }

    const result = (coupons ?? []).map((coupon) => {
        const followUps = followUpsMap[coupon.id] ?? []
        const latest = [...followUps].sort(
            (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
        )[0] ?? null

        return {
            ...coupon,
            issuer_name: issuerNames[coupon.issued_by ?? ''] ?? 'Unknown',
            follow_up_count: followUps.length,
            latest_follow_up: latest,
        }
    })

    return NextResponse.json({ data: result, userRole: profile.user_role, userId: user.id })
}