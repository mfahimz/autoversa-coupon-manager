import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { Database } from '@/lib/database.types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
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
        .select('user_role, is_active')
        .eq('id', user.id)
        .single()

    if (profileError || !profile || !profile.is_active) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    let body: any
    try {
        body = await request.json()
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const { coupon_id, follow_up_status } = body || {}

    if (!coupon_id || typeof coupon_id !== 'string') {
        return NextResponse.json({ error: 'coupon_id is required' }, { status: 400 })
    }

    if (follow_up_status !== 'contacted' && follow_up_status !== 'declined') {
        return NextResponse.json({ error: 'Invalid follow_up_status. Must be "contacted" or "declined"' }, { status: 400 })
    }

    const requiredResource = follow_up_status === 'contacted'
        ? 'action:follow_up:send_reminder'
        : 'action:follow_up:decline'

    const { data: permission } = await supabase
        .from('role_permissions')
        .select('is_allowed')
        .eq('role', profile.user_role)
        .eq('resource', requiredResource)
        .eq('action', 'action')
        .single()

    if (profile.user_role !== 'ADMIN' && !permission?.is_allowed) {
        return NextResponse.json({ error: 'Forbidden: missing permission for this action' }, { status: 403 })
    }

    const serviceSupabase = createClient<Database>(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { data: inserted, error: insertError } = await serviceSupabase
        .from('coupon_follow_ups')
        .insert({
            coupon_id,
            followed_up_by: user.id,
            follow_up_status,
        })
        .select()
        .single()

    if (insertError) {
        return NextResponse.json({ error: insertError.message }, { status: 500 })
    }

    return NextResponse.json(inserted)
}
