export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import ExcelJS from 'exceljs'
import { createClient } from '@/lib/supabase/server'
import { fetchAdvisorCommissionSummaries, fetchPayoutHistory, PAYMENT_METHODS } from '@/lib/payouts'
import { styleWorksheetHeader, addBandedRows, workbookToResponse } from '@/lib/excelExport'

export async function GET(request: NextRequest) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
            return new Response('Unauthorized', { status: 401 })
        }

        const url = new URL(request.url)
        const advisorCode = url.searchParams.get('advisorCode') || undefined
        const dateFrom = url.searchParams.get('dateFrom') || undefined
        const dateTo = url.searchParams.get('dateTo') || undefined
        const paymentMethod = url.searchParams.get('paymentMethod') || undefined

        const [summaries, payouts] = await Promise.all([
            fetchAdvisorCommissionSummaries(),
            fetchPayoutHistory({ advisorCode, dateFrom, dateTo, paymentMethod }),
        ])

        const workbook = new ExcelJS.Workbook()
        workbook.creator = 'AutoVersa Coupon Manager'
        workbook.created = new Date()

        // ── Sheet 1: Advisor Summaries ──────────────────────────────────────
        const summarySheet = workbook.addWorksheet('Advisor Summaries')
        const summaryColumns = [
            { header: 'Advisor Code', key: 'code', width: 16 },
            { header: 'Advisor Name', key: 'name', width: 26 },
            { header: 'Coupons Issued', key: 'issued', width: 16 },
            { header: 'Invoiced Visits', key: 'visits', width: 16 },
            { header: 'Total Earned (AED)', key: 'earned', width: 20 },
            { header: 'Total Paid Out (AED)', key: 'paid', width: 20 },
            { header: 'Pending Balance (AED)', key: 'pending', width: 22 },
        ]

        styleWorksheetHeader(summarySheet, summaryColumns)

        const summaryRows = summaries.map(s => ({
            code: s.advisor_code,
            name: s.advisor_name,
            issued: s.total_issued,
            visits: s.total_visits,
            earned: s.total_earned,
            paid: s.total_paid,
            pending: s.pending_balance,
        }))

        addBandedRows(summarySheet, summaryRows)

        // ── Sheet 2: Payout Transactions Log ─────────────────────────────
        const logSheet = workbook.addWorksheet('Payout Transactions Log')
        const logColumns = [
            { header: 'Payment Date', key: 'date', width: 14 },
            { header: 'Advisor Code', key: 'code', width: 16 },
            { header: 'Advisor Name', key: 'name', width: 26 },
            { header: 'Payout Amount (AED)', key: 'amount', width: 20 },
            { header: 'Payment Method', key: 'method', width: 20 },
            { header: 'Reference / Cheque #', key: 'ref', width: 24 },
            { header: 'Coverage Period', key: 'period', width: 24 },
            { header: 'Notes', key: 'notes', width: 30 },
            { header: 'Recorded By', key: 'recorded_by', width: 22 },
        ]

        styleWorksheetHeader(logSheet, logColumns)

        const methodMap = new Map(PAYMENT_METHODS.map(m => [m.value, m.label]))

        const logRows = payouts.map(p => {
            const methodLabel = methodMap.get(p.payment_method) || p.payment_method
            let periodStr = '—'
            if (p.period_start_date || p.period_end_date) {
                periodStr = `${p.period_start_date || '...'} to ${p.period_end_date || '...'}`
            }
            return {
                date: p.payment_date,
                code: p.advisor_code,
                name: p.advisor_name,
                amount: p.payout_amount,
                method: methodLabel,
                ref: p.reference_number || '—',
                period: periodStr,
                notes: p.notes || '—',
                recorded_by: p.paid_by_name || 'Admin',
            }
        })

        addBandedRows(logSheet, logRows)

        const dateStr = new Date().toISOString().split('T')[0]
        return workbookToResponse(workbook, `Advisor_Commission_Payouts_${dateStr}.xlsx`)

    } catch (error: any) {
        console.error('Error generating payouts export:', error)
        return NextResponse.json({ error: error.message || 'Export failed' }, { status: 500 })
    }
}
