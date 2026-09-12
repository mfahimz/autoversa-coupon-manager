import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import Papa from 'papaparse'
import ExcelJS from 'exceljs'
import { Database } from '@/lib/database.types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function normalisePhone(value: unknown): string | null {
    let digits = String(value ?? '').replace(/\D/g, '')
    if (!digits) return null

    // Strip international dial prefix '00'
    if (digits.startsWith('00')) {
        digits = digits.slice(2)
    }

    // Standardise UAE local formats (05XXXXXXXX or 5XXXXXXXX -> 9715XXXXXXXX)
    if (digits.length === 10 && digits.startsWith('05')) {
        digits = '971' + digits.slice(1)
    } else if (digits.length === 9 && digits.startsWith('5')) {
        digits = '971' + digits
    }

    return digits.length >= 7 && digits.length <= 15 ? digits : null
}

function normalizeHeaderName(name: unknown): string {
    return String(name ?? '').trim().toLowerCase().replace(/[\s_\-]+/g, '')
}

function processRows(rows: string[][]): { numbers: string[]; invalidCount: number; duplicateCount: number } {
    if (!rows || rows.length === 0) return { numbers: [], invalidCount: 0, duplicateCount: 0 }

    const firstRow = rows[0]
    const normHeaders = firstRow.map(normalizeHeaderName)

    const primaryColIndex = normHeaders.findIndex(h =>
        ['smsmobile', 'sms', 'mobilenumber', 'mobile', 'mobno', 'cell', 'whatsapp'].includes(h)
    )
    const secondaryColIndex = normHeaders.findIndex(h =>
        ['phone', 'phonenumber', 'telephone', 'tel', 'contact'].includes(h)
    )

    const knownHeaders = [
        'customercode', 'customername', 'smsmobile', 'phone', 'email', 'smsoption',
        'chassis', 'regno', 'brand', 'modelcode', 'modelname', 'modelyear', 'invoicedate', 'milesdone', 'visits'
    ]
    const hasHeader = primaryColIndex !== -1 || secondaryColIndex !== -1 || normHeaders.some(h => knownHeaders.includes(h))

    const dataRows = hasHeader ? rows.slice(1) : rows

    // If no recognizable headers, determine best column
    let detectedPrimary = primaryColIndex
    let detectedSecondary = secondaryColIndex

    if (detectedPrimary === -1 && detectedSecondary === -1) {
        if (dataRows.length > 0 && dataRows[0].length === 1) {
            detectedPrimary = 0
        } else if (dataRows.length > 0) {
            const sample = dataRows.slice(0, 20)
            let bestCol = 0
            let maxValid = 0
            const colCount = Math.max(...dataRows.slice(0, 5).map(r => r.length), 0)
            for (let c = 0; c < colCount; c++) {
                const count = sample.filter(r => normalisePhone(r[c]) !== null).length
                if (count > maxValid) {
                    maxValid = count
                    bestCol = c
                }
            }
            detectedPrimary = bestCol
        }
    }

    const seen = new Set<string>()
    const numbers: string[] = []
    let invalidCount = 0
    let duplicateCount = 0

    for (const row of dataRows) {
        let phone: string | null = null

        // 1. Try SMS MOBILE column
        if (detectedPrimary !== -1 && detectedPrimary < row.length) {
            phone = normalisePhone(row[detectedPrimary])
        }

        // 2. Fallback to PHONE column if SMS MOBILE was empty or invalid
        if (!phone && detectedSecondary !== -1 && detectedSecondary < row.length) {
            phone = normalisePhone(row[detectedSecondary])
        }

        // 3. Fallback: inspect other columns if no header matched
        if (!phone && detectedPrimary === -1) {
            for (let i = 0; i < row.length; i++) {
                const candidate = normalisePhone(row[i])
                if (candidate) {
                    phone = candidate
                    break
                }
            }
        }

        if (phone) {
            if (seen.has(phone)) {
                duplicateCount += 1
            } else {
                seen.add(phone)
                numbers.push(phone)
            }
        } else {
            const hasContent = row.some(cell => String(cell ?? '').trim().length > 0)
            if (hasContent) {
                invalidCount += 1
            }
        }
    }

    return { numbers, invalidCount, duplicateCount }
}

async function parseNumbers(file: File, extension: string) {
    if (extension === 'csv') {
        const text = await file.text()
        const parsed = Papa.parse<string[]>(text, {
            skipEmptyLines: 'greedy',
            delimitersToGuess: [',', '\t', '|', ';', ' '],
        })
        return processRows(parsed.data)
    }

    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(await file.arrayBuffer())
    const worksheet = workbook.worksheets[0]
    if (!worksheet) throw new Error('No worksheet found')

    const rows: string[][] = []
    worksheet.eachRow({ includeEmpty: false }, row => {
        const rowValues: string[] = []
        const vals = Array.isArray(row.values) ? row.values.slice(1) : []
        for (let i = 0; i < vals.length; i++) {
            const v = vals[i]
            const obj = (v !== null && typeof v === 'object') ? (v as unknown as Record<string, unknown>) : null
            if (obj && 'text' in obj) {
                rowValues.push(String(obj.text ?? ''))
            } else if (obj && 'result' in obj) {
                rowValues.push(String(obj.result ?? ''))
            } else {
                rowValues.push(String(v ?? ''))
            }
        }
        if (rowValues.some(val => val.trim().length > 0)) {
            rows.push(rowValues)
        }
    })

    return processRows(rows)
}

const CONTACT_LIMIT = 2000

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

    // Check capacity against the 2000 contact limit
    const serviceSupabase = createClient<Database>(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { count: existingCount, error: countError } = await serviceSupabase
        .from('broadcast_contacts')
        .select('*', { count: 'exact', head: true })

    if (countError) {
        return NextResponse.json({ error: 'Unable to check contact capacity.' }, { status: 500 })
    }

    const currentCount = existingCount ?? 0
    const remaining = Math.max(0, CONTACT_LIMIT - currentCount)

    if (numbers.length > remaining) {
        return NextResponse.json({
            error: remaining === 0
                ? `The contact list is full (${CONTACT_LIMIT.toLocaleString()} contacts). Please clear existing contacts before uploading.`
                : `Only ${remaining.toLocaleString()} more contact${remaining === 1 ? '' : 's'} can be uploaded (${currentCount.toLocaleString()} / ${CONTACT_LIMIT.toLocaleString()} used). Your file contains ${numbers.length.toLocaleString()} valid numbers. Please try again with a smaller file or clear existing contacts.`,
            currentCount,
            limit: CONTACT_LIMIT,
            remaining,
            fileCount: numbers.length,
        }, { status: 400 })
    }

    if (mode === 'preview') {
        return NextResponse.json({ validCount: numbers.length, invalidCount, duplicateCount, sample: numbers.slice(0, 10), currentCount, limit: CONTACT_LIMIT, remaining })
    }
    if (mode !== 'import') {
        return NextResponse.json({ error: 'Invalid upload mode' }, { status: 400 })
    }

    const rows = numbers.map(mobile_number => ({ mobile_number, year, created_by: user.id }))
    const BATCH_SIZE = 1000
    let totalInserted = 0

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const batch = rows.slice(i, i + BATCH_SIZE)
        const { data: inserted, error: insertError } = await serviceSupabase
            .from('broadcast_contacts')
            .insert(batch)
            .select('id')

        if (insertError) {
            return NextResponse.json({ error: insertError.message }, { status: 500 })
        }
        totalInserted += inserted?.length ?? 0
    }

    return NextResponse.json({ insertedCount: totalInserted, invalidCount, duplicateCount })
}
