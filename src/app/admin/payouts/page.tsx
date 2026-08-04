'use client'

export const dynamic = 'force-dynamic'

import React, { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Navbar from '@/components/layout/Navbar'
import Breadcrumb from '@/components/layout/Breadcrumb'
import PageSkeleton from '@/components/layout/PageSkeleton'
import ExportButton from '@/components/shared/ExportButton'
import { loadPermissionsForRole, checkPermission } from '@/lib/permissions'
import {
    AdvisorCommissionSummary,
    AdvisorCommissionPayout,
    PAYMENT_METHODS,
    fetchAdvisorCommissionSummaries,
    fetchPayoutHistory,
    deleteCommissionPayout,
} from '@/lib/payouts'
import RecordPayoutDialog from '@/components/payouts/RecordPayoutDialog'
import AdvisorPayoutHistoryDialog from '@/components/payouts/AdvisorPayoutHistoryDialog'
import {
    DollarSign,
    TrendingUp,
    CheckCircle,
    Clock,
    Plus,
    Search,
    RefreshCw,
    History,
    Trash2,
    Calendar,
    Users,
    CreditCard,
} from 'lucide-react'
import { toast } from 'sonner'

export default function CommissionPayoutsPage() {
    const router = useRouter()
    const supabase = createClient()

    const [userRole, setUserRole] = useState<string>('')
    const [userAdvisorCode, setUserAdvisorCode] = useState<string | null>(null)
    const [loading, setLoading] = useState(true)
    const [refreshing, setRefreshing] = useState(false)

    // Data state
    const [summaries, setSummaries] = useState<AdvisorCommissionSummary[]>([])
    const [payouts, setPayouts] = useState<AdvisorCommissionPayout[]>([])

    // Active tab: 'summaries' | 'history'
    const [activeTab, setActiveTab] = useState<'summaries' | 'history'>('summaries')

    // Filters
    const [searchQuery, setSearchQuery] = useState('')
    const [paymentMethodFilter, setPaymentMethodFilter] = useState('all')
    const [dateFrom, setDateFrom] = useState('')
    const [dateTo, setDateTo] = useState('')

    // Dialog state
    const [isRecordDialogOpen, setIsRecordDialogOpen] = useState(false)
    const [selectedAdvisorForPayout, setSelectedAdvisorForPayout] = useState<AdvisorCommissionSummary | null>(null)

    const [isHistoryDialogOpen, setIsHistoryDialogOpen] = useState(false)
    const [selectedAdvisorForHistory, setSelectedAdvisorForHistory] = useState<AdvisorCommissionSummary | null>(null)

    useEffect(() => {
        initPage()
    }, [])

    async function initPage() {
        setLoading(true)
        try {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) {
                router.push('/login')
                return
            }

            const { data: profile } = await supabase
                .from('profiles')
                .select('user_role, advisor_code, is_active')
                .eq('id', user.id)
                .single()

            if (!profile || profile.is_active === false) {
                await supabase.auth.signOut()
                router.push('/login')
                return
            }

            const r = profile.user_role
            setUserRole(r)
            setUserAdvisorCode(profile.advisor_code)

            const perms = await loadPermissionsForRole(r)
            if (!checkPermission(perms, r, 'page:payouts', 'view')) {
                // If not allowed to view payouts page, redirect to dashboard
                router.push('/dashboard')
                return
            }

            await loadData(profile.advisor_code, r)
        } catch (error) {
            console.error('Error initializing payouts page:', error)
            toast.error('Failed to load payouts page')
        } finally {
            setLoading(false)
        }
    }

    async function loadData(advCode?: string | null, role?: string) {
        setRefreshing(true)
        try {
            const [sumRes, payRes] = await Promise.all([
                fetchAdvisorCommissionSummaries(),
                fetchPayoutHistory(),
            ])

            const currentRole = role || userRole
            const isAdvisorOnly = currentRole === 'SERVICE_ADVISOR' || currentRole === 'BMW_SERVICE_ADVISOR'

            if (isAdvisorOnly && advCode) {
                setSummaries(sumRes.filter(s => s.advisor_code === advCode))
                setPayouts(payRes.filter(p => p.advisor_code === advCode))
            } else {
                setSummaries(sumRes)
                setPayouts(payRes)
            }
        } catch (error: any) {
            console.error('Error loading payouts data:', error)
            toast.error('Failed to fetch payouts data')
        } finally {
            setRefreshing(false)
        }
    }

    // ── Filtered Summaries & History ─────────────────────────────────────────

    const filteredSummaries = useMemo(() => {
        return summaries.filter(s => {
            if (!searchQuery.trim()) return true
            const q = searchQuery.toLowerCase()
            return s.advisor_name.toLowerCase().includes(q) || s.advisor_code.toLowerCase().includes(q)
        })
    }, [summaries, searchQuery])

    const filteredPayouts = useMemo(() => {
        return payouts.filter(p => {
            if (searchQuery.trim()) {
                const q = searchQuery.toLowerCase()
                const matchName = p.advisor_name.toLowerCase().includes(q)
                const matchCode = p.advisor_code.toLowerCase().includes(q)
                const matchRef = (p.reference_number || '').toLowerCase().includes(q)
                if (!matchName && !matchCode && !matchRef) return false
            }
            if (paymentMethodFilter !== 'all' && p.payment_method !== paymentMethodFilter) {
                return false
            }
            if (dateFrom && p.payment_date < dateFrom) return false
            if (dateTo && p.payment_date > dateTo) return false
            return true
        })
    }, [payouts, searchQuery, paymentMethodFilter, dateFrom, dateTo])

    // ── Metrics Calculation ───────────────────────────────────────────────────

    const totalEarnedAll = useMemo(() => summaries.reduce((acc, s) => acc + s.total_earned, 0), [summaries])
    const totalPaidAll = useMemo(() => summaries.reduce((acc, s) => acc + s.total_paid, 0), [summaries])
    const totalPendingAll = useMemo(() => summaries.reduce((acc, s) => acc + s.pending_balance, 0), [summaries])

    const isAdminOrManager = ['ADMIN', 'MANAGER', 'ASSISTANT_GENERAL_MANAGER', 'CEO'].includes(userRole)

    function handleOpenRecordPayout(adv?: AdvisorCommissionSummary) {
        setSelectedAdvisorForPayout(adv || null)
        setIsRecordDialogOpen(true)
    }

    function handleOpenHistory(adv: AdvisorCommissionSummary) {
        setSelectedAdvisorForHistory(adv)
        setIsHistoryDialogOpen(true)
    }

    async function handleDeletePayout(payoutId: string) {
        if (!confirm('Are you sure you want to delete this payout entry? This action cannot be undone.')) {
            return
        }

        try {
            await deleteCommissionPayout(payoutId)
            toast.success('Payout entry deleted')
            loadData(userAdvisorCode)
            if (selectedAdvisorForHistory) {
                setIsHistoryDialogOpen(false)
            }
        } catch (error: any) {
            console.error('Error deleting payout:', error)
            toast.error(error.message || 'Failed to delete payout')
        }
    }

    function formatDate(dStr: string | null): string {
        if (!dStr) return '—'
        const d = new Date(dStr)
        return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
    }

    if (loading) return <PageSkeleton layout="stats-charts" />

    const methodMap = new Map(PAYMENT_METHODS.map(m => [m.value, m.label]))

    const exportUrlParams = new URLSearchParams()
    if (paymentMethodFilter !== 'all') exportUrlParams.set('paymentMethod', paymentMethodFilter)
    if (dateFrom) exportUrlParams.set('dateFrom', dateFrom)
    if (dateTo) exportUrlParams.set('dateTo', dateTo)

    return (
        <div style={{ minHeight: '100vh', backgroundColor: '#F8FAFC', paddingTop: '16px' }}>
            <Navbar />
            <main style={{ padding: '0 32px 48px' }}>
                <Breadcrumb items={[
                    { label: 'Dashboard', href: '/dashboard' },
                    { label: 'Commission Payouts' },
                ]} />

                {/* Header */}
                <div style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '16px',
                    marginBottom: '28px',
                }}>
                    <div>
                        <h1 style={{ fontSize: '24px', fontWeight: '800', color: '#0F172A', margin: 0, letterSpacing: '-0.02em' }}>
                            Service Advisor Commission Payouts
                        </h1>
                        <p style={{ color: '#64748B', fontSize: '13px', margin: '4px 0 0' }}>
                            {isAdminOrManager
                                ? 'Track earned commissions, log payout transactions, and view pending balances'
                                : 'My Personal Commission Earnings Statement & Payout History'}
                        </p>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <button
                            onClick={() => loadData(userAdvisorCode)}
                            disabled={refreshing}
                            style={{
                                padding: '9px 14px',
                                fontSize: '13px',
                                fontWeight: '600',
                                borderRadius: '10px',
                                border: '1px solid #CBD5E1',
                                backgroundColor: '#FFFFFF',
                                color: '#475569',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                            }}
                        >
                            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                            Refresh
                        </button>

                        <ExportButton
                            userRole={userRole}
                            exportUrl={`/api/export/payouts?${exportUrlParams.toString()}`}
                        />

                        {isAdminOrManager && (
                            <button
                                onClick={() => handleOpenRecordPayout()}
                                style={{
                                    padding: '9px 18px',
                                    fontSize: '13px',
                                    fontWeight: '600',
                                    borderRadius: '10px',
                                    border: 'none',
                                    background: 'linear-gradient(135deg, #162860 0%, #0074BD 100%)',
                                    color: '#FFFFFF',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    boxShadow: '0 4px 12px rgba(0, 116, 189, 0.3)',
                                }}
                            >
                                <Plus className="w-4 h-4" />
                                Record Payout
                            </button>
                        )}
                    </div>
                </div>

                {/* KPI Stat Cards */}
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                    gap: '16px',
                    marginBottom: '28px',
                }}>
                    <div style={{
                        backgroundColor: '#FFFFFF',
                        borderRadius: '16px',
                        padding: '20px',
                        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05), 0 1px 2px rgba(0, 0, 0, 0.03)',
                        borderLeft: '4px solid #162860',
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span style={{ fontSize: '11px', fontWeight: '700', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                Total Earned Commission
                            </span>
                            <div style={{ padding: '8px', borderRadius: '10px', backgroundColor: '#F1F5F9', color: '#162860' }}>
                                <TrendingUp className="w-4 h-4" />
                            </div>
                        </div>
                        <p style={{ fontSize: '24px', fontWeight: '800', color: '#162860', margin: '10px 0 0' }}>
                            AED {totalEarnedAll.toLocaleString()}
                        </p>
                    </div>

                    <div style={{
                        backgroundColor: '#FFFFFF',
                        borderRadius: '16px',
                        padding: '20px',
                        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05), 0 1px 2px rgba(0, 0, 0, 0.03)',
                        borderLeft: '4px solid #059669',
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span style={{ fontSize: '11px', fontWeight: '700', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                Total Paid Out
                            </span>
                            <div style={{ padding: '8px', borderRadius: '10px', backgroundColor: '#ECFDF5', color: '#059669' }}>
                                <CheckCircle className="w-4 h-4" />
                            </div>
                        </div>
                        <p style={{ fontSize: '24px', fontWeight: '800', color: '#059669', margin: '10px 0 0' }}>
                            AED {totalPaidAll.toLocaleString()}
                        </p>
                    </div>

                    <div style={{
                        backgroundColor: '#FFFFFF',
                        borderRadius: '16px',
                        padding: '20px',
                        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05), 0 1px 2px rgba(0, 0, 0, 0.03)',
                        borderLeft: `4px solid ${totalPendingAll > 0 ? '#D97706' : '#64748B'}`,
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span style={{ fontSize: '11px', fontWeight: '700', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                Total Pending Balance
                            </span>
                            <div style={{ padding: '8px', borderRadius: '10px', backgroundColor: totalPendingAll > 0 ? '#FEF3C7' : '#F1F5F9', color: totalPendingAll > 0 ? '#D97706' : '#64748B' }}>
                                <Clock className="w-4 h-4" />
                            </div>
                        </div>
                        <p style={{ fontSize: '24px', fontWeight: '800', color: totalPendingAll > 0 ? '#D97706' : '#475569', margin: '10px 0 0' }}>
                            AED {totalPendingAll.toLocaleString()}
                        </p>
                    </div>

                    <div style={{
                        backgroundColor: '#FFFFFF',
                        borderRadius: '16px',
                        padding: '20px',
                        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05), 0 1px 2px rgba(0, 0, 0, 0.03)',
                        borderLeft: '4px solid #0074BD',
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span style={{ fontSize: '11px', fontWeight: '700', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                Active Service Advisors
                            </span>
                            <div style={{ padding: '8px', borderRadius: '10px', backgroundColor: '#E0F2FE', color: '#0074BD' }}>
                                <Users className="w-4 h-4" />
                            </div>
                        </div>
                        <p style={{ fontSize: '24px', fontWeight: '800', color: '#0074BD', margin: '10px 0 0' }}>
                            {summaries.length}
                        </p>
                    </div>
                </div>

                {/* Filter Controls & Tabs */}
                <div style={{
                    backgroundColor: '#FFFFFF',
                    borderRadius: '16px',
                    padding: '20px',
                    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
                    marginBottom: '24px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '16px',
                }}>
                    {/* Navigation Tabs */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #E2E8F0', paddingBottom: '12px' }}>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <button
                                onClick={() => setActiveTab('summaries')}
                                style={{
                                    padding: '8px 18px',
                                    fontSize: '13px',
                                    fontWeight: '700',
                                    borderRadius: '100px',
                                    border: 'none',
                                    cursor: 'pointer',
                                    backgroundColor: activeTab === 'summaries' ? '#162860' : '#F1F5F9',
                                    color: activeTab === 'summaries' ? '#FFFFFF' : '#64748B',
                                    transition: 'all 0.2s',
                                }}
                            >
                                Advisor Summaries ({filteredSummaries.length})
                            </button>
                            <button
                                onClick={() => setActiveTab('history')}
                                style={{
                                    padding: '8px 18px',
                                    fontSize: '13px',
                                    fontWeight: '700',
                                    borderRadius: '100px',
                                    border: 'none',
                                    cursor: 'pointer',
                                    backgroundColor: activeTab === 'history' ? '#162860' : '#F1F5F9',
                                    color: activeTab === 'history' ? '#FFFFFF' : '#64748B',
                                    transition: 'all 0.2s',
                                }}
                            >
                                Payout History Log ({filteredPayouts.length})
                            </button>
                        </div>
                    </div>

                    {/* Search & Inputs */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
                        <div style={{ position: 'relative', flex: 1, minWidth: '220px' }}>
                            <Search className="w-4 h-4 text-slate-400" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
                            <input
                                type="text"
                                placeholder="Search by advisor name, code, or ref #..."
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                style={{
                                    width: '100%',
                                    padding: '9px 12px 9px 36px',
                                    fontSize: '13px',
                                    borderRadius: '10px',
                                    border: '1.5px solid #CBD5E1',
                                    outline: 'none',
                                }}
                            />
                        </div>

                        {activeTab === 'history' && (
                            <>
                                <select
                                    value={paymentMethodFilter}
                                    onChange={e => setPaymentMethodFilter(e.target.value)}
                                    style={{
                                        padding: '9px 14px',
                                        fontSize: '13px',
                                        borderRadius: '10px',
                                        border: '1.5px solid #CBD5E1',
                                        backgroundColor: '#FFFFFF',
                                        outline: 'none',
                                    }}
                                >
                                    <option value="all">All Payment Methods</option>
                                    {PAYMENT_METHODS.map(m => (
                                        <option key={m.value} value={m.value}>{m.label}</option>
                                    ))}
                                </select>

                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <input
                                        type="date"
                                        value={dateFrom}
                                        onChange={e => setDateFrom(e.target.value)}
                                        style={{ padding: '8px 10px', fontSize: '13px', border: '1.5px solid #CBD5E1', borderRadius: '8px', outline: 'none' }}
                                    />
                                    <span style={{ color: '#64748B', fontSize: '12px' }}>to</span>
                                    <input
                                        type="date"
                                        value={dateTo}
                                        onChange={e => setDateTo(e.target.value)}
                                        style={{ padding: '8px 10px', fontSize: '13px', border: '1.5px solid #CBD5E1', borderRadius: '8px', outline: 'none' }}
                                    />
                                </div>
                            </>
                        )}
                    </div>
                </div>

                {/* Tab 1: Advisor Summaries Table */}
                {activeTab === 'summaries' && (
                    <div style={{ backgroundColor: '#FFFFFF', borderRadius: '16px', boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)', overflow: 'hidden' }}>
                        {filteredSummaries.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '48px', color: '#64748B', fontSize: '14px' }}>
                                {searchQuery ? 'No service advisors match your search.' : 'No service advisors found.'}
                            </div>
                        ) : (
                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                    <thead>
                                        <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                                            {['Code', 'Service Advisor', 'Coupons Issued', 'Invoiced Visits', 'Total Earned', 'Total Paid Out', 'Pending Balance', 'Actions'].map(h => (
                                                <th key={h} style={{ padding: '12px 18px', textAlign: 'left', fontSize: '11px', fontWeight: '700', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                                                    {h}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredSummaries.map((s, idx) => {
                                            const hasPending = s.pending_balance > 0
                                            return (
                                                <tr key={s.advisor_code} style={{ borderBottom: idx === filteredSummaries.length - 1 ? 'none' : '1px solid #F1F5F9' }}>
                                                    <td style={{ padding: '14px 18px' }}>
                                                        <span style={{ fontFamily: 'monospace', fontSize: '13px', fontWeight: '700', color: '#162860' }}>
                                                            {s.advisor_code}
                                                        </span>
                                                    </td>
                                                    <td style={{ padding: '14px 18px' }}>
                                                        <span style={{ fontSize: '14px', fontWeight: '600', color: '#0F172A' }}>
                                                            {s.advisor_name}
                                                        </span>
                                                    </td>
                                                    <td style={{ padding: '14px 18px', fontSize: '13px', color: '#334155' }}>
                                                        {s.total_issued}
                                                    </td>
                                                    <td style={{ padding: '14px 18px', fontSize: '13px', color: '#334155', fontWeight: '600' }}>
                                                        {s.total_visits}
                                                    </td>
                                                    <td style={{ padding: '14px 18px', fontSize: '14px', fontWeight: '700', color: '#162860' }}>
                                                        AED {s.total_earned.toLocaleString()}
                                                    </td>
                                                    <td style={{ padding: '14px 18px', fontSize: '14px', fontWeight: '700', color: '#059669' }}>
                                                        AED {s.total_paid.toLocaleString()}
                                                    </td>
                                                    <td style={{ padding: '14px 18px' }}>
                                                        <span style={{
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            padding: '4px 10px',
                                                            borderRadius: '100px',
                                                            fontSize: '13px',
                                                            fontWeight: '700',
                                                            backgroundColor: hasPending ? '#FEF3C7' : '#ECFDF5',
                                                            color: hasPending ? '#B45309' : '#047857',
                                                        }}>
                                                            AED {s.pending_balance.toLocaleString()}
                                                        </span>
                                                    </td>
                                                    <td style={{ padding: '14px 18px' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                            {isAdminOrManager && (
                                                                <button
                                                                    onClick={() => handleOpenRecordPayout(s)}
                                                                    style={{
                                                                        padding: '6px 12px',
                                                                        fontSize: '12px',
                                                                        fontWeight: '600',
                                                                        borderRadius: '8px',
                                                                        backgroundColor: '#0074BD',
                                                                        color: '#FFFFFF',
                                                                        border: 'none',
                                                                        cursor: 'pointer',
                                                                        whiteSpace: 'nowrap',
                                                                    }}
                                                                >
                                                                    Record Payout
                                                                </button>
                                                            )}
                                                            <button
                                                                onClick={() => handleOpenHistory(s)}
                                                                style={{
                                                                    padding: '6px 12px',
                                                                    fontSize: '12px',
                                                                    fontWeight: '600',
                                                                    borderRadius: '8px',
                                                                    backgroundColor: '#F1F5F9',
                                                                    color: '#334155',
                                                                    border: 'none',
                                                                    cursor: 'pointer',
                                                                    whiteSpace: 'nowrap',
                                                                }}
                                                            >
                                                                Statement
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            )
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}

                {/* Tab 2: Payout History Log Table */}
                {activeTab === 'history' && (
                    <div style={{ backgroundColor: '#FFFFFF', borderRadius: '16px', boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)', overflow: 'hidden' }}>
                        {filteredPayouts.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '48px', color: '#64748B', fontSize: '14px' }}>
                                No payout transactions match the selected filters.
                            </div>
                        ) : (
                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                    <thead>
                                        <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                                            {['Payment Date', 'Advisor', 'Amount Paid', 'Method', 'Ref / Cheque #', 'Coverage Period', 'Notes', 'Recorded By', ...(isAdminOrManager ? ['Actions'] : [])].map(h => (
                                                <th key={h} style={{ padding: '12px 18px', textAlign: 'left', fontSize: '11px', fontWeight: '700', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                                                    {h}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredPayouts.map((p, idx) => (
                                            <tr key={p.id} style={{ borderBottom: idx === filteredPayouts.length - 1 ? 'none' : '1px solid #F1F5F9' }}>
                                                <td style={{ padding: '14px 18px', fontSize: '13px', fontWeight: '600', color: '#0F172A' }}>
                                                    {formatDate(p.payment_date)}
                                                </td>
                                                <td style={{ padding: '14px 18px' }}>
                                                    <p style={{ fontSize: '13px', fontWeight: '600', color: '#0F172A', margin: 0 }}>{p.advisor_name}</p>
                                                    <span style={{ fontSize: '11px', color: '#64748B', fontFamily: 'monospace' }}>{p.advisor_code}</span>
                                                </td>
                                                <td style={{ padding: '14px 18px', fontSize: '14px', fontWeight: '800', color: '#059669' }}>
                                                    AED {p.payout_amount.toLocaleString()}
                                                </td>
                                                <td style={{ padding: '14px 18px', fontSize: '13px', color: '#334155' }}>
                                                    {methodMap.get(p.payment_method) || p.payment_method}
                                                </td>
                                                <td style={{ padding: '14px 18px', fontSize: '12px', fontFamily: 'monospace', color: '#475569' }}>
                                                    {p.reference_number || '—'}
                                                </td>
                                                <td style={{ padding: '14px 18px', fontSize: '12px', color: '#64748B' }}>
                                                    {p.period_start_date || p.period_end_date
                                                        ? `${formatDate(p.period_start_date)} to ${formatDate(p.period_end_date)}`
                                                        : '—'}
                                                </td>
                                                <td style={{ padding: '14px 18px', fontSize: '12px', color: '#64748B', maxWidth: '200px' }}>
                                                    {p.notes || '—'}
                                                </td>
                                                <td style={{ padding: '14px 18px', fontSize: '12px', color: '#64748B' }}>
                                                    {p.paid_by_name || 'Admin'}
                                                </td>
                                                {isAdminOrManager && (
                                                    <td style={{ padding: '14px 18px' }}>
                                                        <button
                                                            onClick={() => handleDeletePayout(p.id)}
                                                            style={{
                                                                background: 'none',
                                                                border: 'none',
                                                                color: '#EF4444',
                                                                cursor: 'pointer',
                                                                padding: '6px',
                                                                borderRadius: '6px',
                                                            }}
                                                            title="Delete payout entry"
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>
                                                    </td>
                                                )}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}

                {/* Dialogs */}
                <RecordPayoutDialog
                    isOpen={isRecordDialogOpen}
                    onClose={() => setIsRecordDialogOpen(false)}
                    advisor={selectedAdvisorForPayout}
                    advisors={summaries}
                    onSuccess={() => loadData(userAdvisorCode)}
                />

                <AdvisorPayoutHistoryDialog
                    isOpen={isHistoryDialogOpen}
                    onClose={() => setIsHistoryDialogOpen(false)}
                    summary={selectedAdvisorForHistory}
                    payouts={payouts}
                    onDeletePayout={handleDeletePayout}
                    canDelete={isAdminOrManager}
                />
            </main>
        </div>
    )
}
