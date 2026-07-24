'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'
import { Database } from '@/lib/database.types'
import Navbar from '@/components/layout/Navbar'
import { toast } from 'sonner'

export const dynamic = 'force-dynamic'

const supabase = createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type InvoiceRow = {
    advisor_code: string
    invoice_date: string
    invoice_count: number
    created_at: string | null
    updated_at: string | null
}

type AdvisorMapEntry = {
    advisorCode: string
    name: string
    externalCode: number
}

function formatDateTime(iso: string | null): string {
    if (!iso) return '—'
    return new Date(iso).toLocaleString('en-GB', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
    })
}

function getNextSync(lastSync: string | null): string {
  if (!lastSync) return '—'
  const next = new Date(new Date(lastSync).getTime() + 5 * 60 * 1000)
  return next.toLocaleString('en-GB', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
}

export default function AdminInvoicesPage() {
    const router = useRouter()
    const [invoices, setInvoices] = useState<InvoiceRow[]>([])
    const [advisorMap, setAdvisorMap] = useState<AdvisorMapEntry[]>([])
    const [lastSync, setLastSync] = useState<string | null>(null)
    const [backupUrlConfigured, setBackupUrlConfigured] = useState(false)
    const [cronSecretConfigured, setCronSecretConfigured] = useState(false)
    const [loading, setLoading] = useState(true)
    const [syncing, setSyncing] = useState(false)
    const [dateFrom, setDateFrom] = useState(new Date().toISOString().split('T')[0])
    const [dateTo, setDateTo] = useState(new Date().toISOString().split('T')[0])

    // Auth guard — ADMIN only
    useEffect(() => {
        supabase.auth.getUser().then(({ data: { user } }) => {
            if (!user) { router.push('/login'); return }
            supabase.from('profiles').select('user_role').eq('id', user.id).single().then(({ data }) => {
                if (!data || data.user_role !== 'ADMIN') router.push('/dashboard')
            })
        })
    }, [])

    const loadData = useCallback(async () => {
        setLoading(true)
        const params = new URLSearchParams({ dateFrom, dateTo })
        const res = await fetch(`/api/admin/invoices?${params}`)
        if (!res.ok) { toast.error('Failed to load invoice data'); setLoading(false); return }
        const json = await res.json()
        setInvoices(json.invoices ?? [])
        setAdvisorMap(json.advisorMap ?? [])
        setLastSync(json.lastSync ?? null)
        setBackupUrlConfigured(json.backupUrlConfigured)
        setCronSecretConfigured(json.cronSecretConfigured)
        setLoading(false)
    }, [dateFrom, dateTo])

  useEffect(() => {
    loadData()
    const interval = setInterval(() => {
      loadData()
    }, 30000)
    return () => clearInterval(interval)
  }, [loadData])

    async function handleSyncNow() {
        setSyncing(true)
        try {
            const res = await fetch('/api/admin/sync-now', { method: 'POST' })
            const json = await res.json()
            if (json.success) {
                toast.success('Sync completed successfully')
                loadData()
            } else {
                toast.error('Sync failed')
            }
        } catch {
            toast.error('Sync request failed')
        }
        setSyncing(false)
    }

    // Group invoices by date then advisor
    const today = new Date().toISOString().split('T')[0]
    const todayInvoices = invoices.filter(r => r.invoice_date === today)
    const totalToday = todayInvoices.reduce((sum, r) => sum + (r.invoice_count ?? 0), 0)
    const totalAll = invoices.reduce((sum, r) => sum + (r.invoice_count ?? 0), 0)

    // Get unique dates
    const dates = Array.from(new Set(invoices.map(r => r.invoice_date))).sort((a, b) => b.localeCompare(a))

    const advisorName = (code: string) =>
        advisorMap.find(a => a.advisorCode === code)?.name ?? code

    return (
        <>
            <Navbar />
            <div className="px-8 py-6">

                {/* Header */}
                <div className="flex items-start justify-between mb-8">
                    <div>
                        <h1 className="text-2xl font-bold text-[#162860]">Invoice Sync</h1>
                        <p className="text-sm text-[#666666] mt-1">
                            Live invoice counts synced from the backup server every 5 minutes.
                        </p>
                    </div>
                    <button
                        onClick={handleSyncNow}
                        disabled={syncing}
                        className="px-4 py-2 bg-[#0074BD] text-white text-sm font-medium rounded-lg hover:bg-[#005a94] disabled:opacity-50 transition-colors"
                    >
                        {syncing ? 'Syncing...' : 'Sync Now'}
                    </button>
                </div>

                {/* Config + Status Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">

                    {/* API Configuration */}
                    <div className="rounded-xl border border-gray-200 p-5 bg-white shadow-sm">
                        <h2 className="text-sm font-semibold text-[#162860] uppercase tracking-wide mb-4">API Configuration</h2>
                        <div className="space-y-3 text-sm">
                            <div className="flex justify-between">
                                <span className="text-[#666666]">Backup Server URL</span>
                                <span className={`font-medium px-2 py-0.5 rounded-full text-xs ${backupUrlConfigured ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-600 border border-red-200'}`}>
                                    {backupUrlConfigured ? 'Configured ✓' : 'Missing ✗'}
                                </span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-[#666666]">Cron Secret</span>
                                <span className={`font-medium px-2 py-0.5 rounded-full text-xs ${cronSecretConfigured ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-600 border border-red-200'}`}>
                                    {cronSecretConfigured ? 'Configured ✓' : 'Missing ✗'}
                                </span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-[#666666]">Sync Frequency</span>
                                <span className="font-medium text-[#1A1A1A]">Every 5 minutes (GitHub Actions)</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-[#666666]">Method</span>
                                <span className="font-medium text-[#1A1A1A]">POST → proxy route</span>
                            </div>
                        </div>

                        {/* Advisor Mapping */}
                        <div className="mt-4 pt-4 border-t border-gray-100">
                            <p className="text-xs font-semibold text-[#666666] uppercase tracking-wide mb-3">Advisor Mapping</p>
                            <table className="w-full text-xs">
                                <thead>
                                    <tr className="text-[#666666]">
                                        <th className="text-left pb-2 font-medium">Name</th>
                                        <th className="text-left pb-2 font-medium">Your Code</th>
                                        <th className="text-left pb-2 font-medium">External Code</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                    {advisorMap.map(a => (
                                        <tr key={a.advisorCode}>
                                            <td className="py-1.5 font-medium text-[#1A1A1A]">{a.name}</td>
                                            <td className="py-1.5 text-[#666666]">{a.advisorCode}</td>
                                            <td className="py-1.5 text-[#666666]">{a.externalCode}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Sync Status */}
                    <div className="rounded-xl border border-gray-200 p-5 bg-white shadow-sm">
                        <h2 className="text-sm font-semibold text-[#162860] uppercase tracking-wide mb-4">Sync Status</h2>
                        <div className="space-y-3 text-sm mb-4">
                            <div className="flex justify-between items-center">
                                <span className="text-[#666666]">Last Sync</span>
                                <span className="font-medium text-[#1A1A1A] flex items-center gap-1.5">
                                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                                    {formatDateTime(lastSync)}
                                </span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-[#666666]">Next Sync (approx)</span>
                                <span className="font-medium text-[#1A1A1A]">{getNextSync(lastSync)}</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-[#666666]">Today's Total Invoices</span>
                                <span className="text-2xl font-bold text-[#0074BD]">{totalToday}</span>
                            </div>
                        </div>

                        {/* Today's per-advisor breakdown */}
                        <div className="pt-4 border-t border-gray-100">
                            <p className="text-xs font-semibold text-[#666666] uppercase tracking-wide mb-3">Today's Breakdown</p>
                            <div className="space-y-2">
                                {advisorMap.map(a => {
                                    const row = todayInvoices.find(r => r.advisor_code === a.advisorCode)
                                    const count = row?.invoice_count ?? 0
                                    return (
                                        <div key={a.advisorCode} className="flex items-center justify-between">
                                            <span className="text-sm text-[#1A1A1A]">{a.name}</span>
                                            <div className="flex items-center gap-2">
                                                <div className="w-24 bg-gray-100 rounded-full h-1.5">
                                                    <div
                                                        className="bg-[#0074BD] h-1.5 rounded-full transition-all"
                                                        style={{ width: totalToday > 0 ? `${(count / totalToday) * 100}%` : '0%' }}
                                                    />
                                                </div>
                                                <span className="text-sm font-semibold text-[#162860] w-4 text-right">{count}</span>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Date Range + Invoice Table */}
                <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
                    <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                        <h2 className="text-sm font-semibold text-[#162860] uppercase tracking-wide">Invoice History</h2>
                        <div className="flex items-center gap-3">
                            <input
                                type="date"
                                value={dateFrom}
                                onChange={(e) => setDateFrom(e.target.value)}
                                className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-[#1A1A1A] bg-white"
                            />
                            <span className="text-sm text-[#666666]">to</span>
                            <input
                                type="date"
                                value={dateTo}
                                onChange={(e) => setDateTo(e.target.value)}
                                className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-[#1A1A1A] bg-white"
                            />
                        </div>
                    </div>

                    {loading ? (
                        <div className="flex items-center justify-center py-16 text-sm text-[#666666]">Loading...</div>
                    ) : invoices.length === 0 ? (
                        <div className="flex items-center justify-center py-16 text-sm text-[#666666]">No data for selected range.</div>
                    ) : (
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-gray-100 text-xs uppercase tracking-wide text-[#666666]">
                                    <th className="text-left px-5 py-3 font-medium">Date</th>
                                    {advisorMap.map(a => (
                                        <th key={a.advisorCode} className="text-center px-4 py-3 font-medium">{a.name}</th>
                                    ))}
                                    <th className="text-center px-4 py-3 font-medium">Total</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {dates.map(date => {
                                    const rowTotal = advisorMap.reduce((sum, a) => {
                                        const inv = invoices.find(r => r.invoice_date === date && r.advisor_code === a.advisorCode)
                                        return sum + (inv?.invoice_count ?? 0)
                                    }, 0)
                                    return (
                                        <tr key={date} className="hover:bg-[#F7F7F7] transition-colors">
                                            <td className="px-5 py-3 font-medium text-[#1A1A1A]">
                                                {new Date(date).toLocaleDateString('en-GB')}
                                            </td>
                                            {advisorMap.map(a => {
                                                const inv = invoices.find(r => r.invoice_date === date && r.advisor_code === a.advisorCode)
                                                return (
                                                    <td key={a.advisorCode} className="px-4 py-3 text-center text-[#1A1A1A]">
                                                        {inv?.invoice_count ?? '—'}
                                                    </td>
                                                )
                                            })}
                                            <td className="px-4 py-3 text-center font-semibold text-[#162860]">{rowTotal}</td>
                                        </tr>
                                    )
                                })}
                                {/* Grand total row */}
                                <tr className="bg-[#162860] text-white border-t border-gray-200">
                                    <td className="px-5 py-3 font-semibold">Total</td>
                                    {advisorMap.map(a => {
                                        const advisorTotal = invoices
                                            .filter(r => r.advisor_code === a.advisorCode)
                                            .reduce((sum, r) => sum + (r.invoice_count ?? 0), 0)
                                        return (
                                            <td key={a.advisorCode} className="px-4 py-3 text-center font-semibold text-white">
                                                {advisorTotal}
                                            </td>
                                        )
                                    })}
                                    <td className="px-4 py-3 text-center font-bold text-white">{totalAll}</td>
                                </tr>
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </>
    )
}