import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Database } from '@/lib/database.types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ADMIN_UUID = '23fff561-c602-4a78-aca4-29b8389f4b2e'

const ADVISOR_MAP: { advisorCode: string; profileId: string; externalCode: number }[] = [
    { advisorCode: 'SA001', profileId: '79622f72-c82a-468b-aa0b-25836bd50b46', externalCode: 786 },
    { advisorCode: 'SA002', profileId: '65ae954e-cbcd-446c-90d1-f5bbb37c26c4', externalCode: 1123 },
    { advisorCode: 'SA003', profileId: '99f94d3b-47a9-4575-8b29-6f98c05875bc', externalCode: 152 },
    { advisorCode: 'SA004', profileId: '44e5f2c1-f5c2-47e6-aef1-90580a076845', externalCode: 357 },
]

function getTodayDate(): string {
    return new Date().toISOString().split('T')[0]
}

export async function GET(request: NextRequest) {
    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const backupUrl = process.env.BACKUP_SERVER_URL
    if (!backupUrl) {
        return NextResponse.json({ error: 'BACKUP_SERVER_URL not configured' }, { status: 500 })
    }

    const supabase = createClient<Database>(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const today = getTodayDate()
    const results: { advisorCode: string; count: number; error?: string }[] = []

    for (const advisor of ADVISOR_MAP) {
        try {
            const res = await fetch(backupUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    datefrom: today,
                    dateto: today,
                    advisorcode: advisor.externalCode,
                }),
            })

            if (!res.ok) {
                results.push({ advisorCode: advisor.advisorCode, count: 0, error: `HTTP ${res.status}` })
                continue
            }

            const json = await res.json()
            const count: number = json?.data?.count ?? 0

            const { error: upsertError } = await supabase
                .from('advisor_daily_invoices')
                .upsert(
                    {
                        advisor_code: advisor.advisorCode,
                        profile_id: advisor.profileId,
                        invoice_date: today,
                        invoice_count: count,
                        entered_by: ADMIN_UUID,
                    },
                    { onConflict: 'advisor_code,invoice_date' }
                )

            if (upsertError) {
                results.push({ advisorCode: advisor.advisorCode, count, error: upsertError.message })
            } else {
                results.push({ advisorCode: advisor.advisorCode, count })
            }
        } catch (err) {
            results.push({ advisorCode: advisor.advisorCode, count: 0, error: String(err) })
        }
    }

    return NextResponse.json({ success: true, date: today, results })
}