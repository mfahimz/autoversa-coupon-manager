import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import Papa from 'papaparse'
import ExcelJS from 'exceljs'
import { Database } from '@/lib/database.types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function normalisePhone(value: unknown) {
    const digits = String(value ?? '').replace(/\D/g, '')
    return digits.length >= 7 && digits.length <= 15 ? digits : null
}

async function parseNumbers(file: File, extension: string) {
    let values: unknown[] = []
    if (extension === 'csv') {
        const text = await file.text()
        const parsed = Papa.parse<string[]>(text, { skipEmptyLines: true })
        values = parsed.data.map(row => row[0])
    } else {
        const workbook = new ExcelJS.Workbook()
        await workbook.xlsx.load(await file.arrayBuffer())
        const worksheet = workbook.worksheets[0]
        if (!worksheet) throw new Error('No worksheet found')
        values = worksheet.getColumn(1).values.slice(1) as unknown[]
    }

    let invalidCount = 0
    const seen = new Set<string>()
    let duplicateCount = 0
    const numbers = values.reduce<string[]>((valid, value) => {
        const phone = normalisePhone(value)
        if (phone) {
            if (seen.has(phone)) duplicateCount += 1
            else { seen.add(phone); valid.push(phone) }
        } else if (String(value ?? '').trim()) invalidCount += 1
        return valid
    }, [])

    return { numbers, invalidCount, duplicateCount }
}

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

    const { data: permission } = await supabase
        .from('role_permissions')
        .select('is_allowed')
        .eq('role', profile.user_role)
        .eq('resource', 'action:broadcast_contacts:upload')
        .eq('action', 'action')
        .single()

    if (profile.user_role !== 'ADMIN' && !permission?.is_allowed) {
        return NextResponse.json({ error: 'Forbidden: missing permission for this action' }, { status: 403 })
    }

    let formData: FormData
    try {
        formData = await request.formData()
    } catch {
        return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
    }

    const file = formData.get('file')
    const yearRaw = formData.get('year')
    const mode = formData.get('mode')
    if (!(file instanceof File)) {
        return NextResponse.json({ error: 'file is required' }, { status: 400 })
    }

    const year = Number(yearRaw)
    if (!Number.isInteger(year) || year < 1900 || year > 3000) {
        return NextResponse.json({ error: 'Enter a valid year before uploading.' }, { status: 400 })
    }

    const extension = file.name.split('.').pop()?.toLowerCase()
    if (!extension || !['csv', 'xlsx'].includes(extension)) {
        return NextResponse.json({ error: 'Upload a CSV or XLSX file.' }, { status: 400 })
    }

    let parsed: { numbers: string[]; invalidCount: number; duplicateCount: number }
    try {
        parsed = await parseNumbers(file, extension)
    } catch {
        return NextResponse.json({ error: 'Unable to parse the uploaded file.' }, { status: 400 })
    }

    const { numbers, invalidCount, duplicateCount } = parsed

    if (numbers.length === 0) {
        return NextResponse.json({ error: 'No valid mobile numbers were found in the file.' }, { status: 400 })
    }

    if (mode === 'preview') {
        return NextResponse.json({ validCount: numbers.length, invalidCount, duplicateCount, sample: numbers.slice(0, 10) })
    }
    if (mode !== 'import') {
        return NextResponse.json({ error: 'Invalid upload mode' }, { status: 400 })
    }

    const serviceSupabase = createClient<Database>(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const rows = numbers.map(mobile_number => ({ mobile_number, year, created_by: user.id }))
    const { data: inserted, error: insertError } = await serviceSupabase
        .from('broadcast_contacts')
        .insert(rows)
        .select('id')

    if (insertError) {
        return NextResponse.json({ error: insertError.message }, { status: 500 })
    }

    return NextResponse.json({ insertedCount: inserted?.length ?? 0, invalidCount, duplicateCount })
}
