import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { Database } from '@/lib/database.types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ADVISOR_MAP = [
    { advisorCode: 'SA001', name: 'Anees', externalCode: 786 },
    { advisorCode: 'SA002', name: 'Sohaib', externalCode: 1123 },
    { advisorCode: 'SA003', name: 'Abaidullah', externalCode: 152 },
    { advisorCode: 'SA004', name: 'Nishad', externalCode: 357 },
]

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

    const { data: profile } = await supabase
        .from('profiles')
        .select('user_role, is_active')
        .eq('id', user.id)
        .single()

    if (!profile || !profile.is_active || profile.user_role !== 'ADMIN') {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const dateFrom = searchParams.get('dateFrom') ?? new Date().toISOString().split('T')[0]
    const dateTo = searchParams.get('dateTo') ?? new Date().toISOString().split('T')[0]

    const serviceSupabase = createClient<Database>(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { data: invoices, error } = await serviceSupabase
        .from('advisor_daily_invoices')
        .select('advisor_code, invoice_date, invoice_count, created_at')
        .gte('invoice_date', dateFrom)
        .lte('invoice_date', dateTo)
        .order('invoice_date', { ascending: false })
        .order('advisor_code', { ascending: true })

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Get last sync time — most recent created_at across all rows
    const lastSync = invoices && invoices.length > 0
        ? invoices.reduce<string | null>((latest, row) => {
            if (!row.created_at) return latest
            if (!latest) return row.created_at
            return row.created_at > latest ? row.created_at : latest
        }, null)
        : null

    return NextResponse.json({
        invoices: invoices ?? [],
        advisorMap: ADVISOR_MAP,
        lastSync,
        backupUrlConfigured: !!process.env.BACKUP_SERVER_URL,
        cronSecretConfigured: !!process.env.CRON_SECRET,
    })
}