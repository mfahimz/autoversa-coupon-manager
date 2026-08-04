'use client'

import React from 'react'
import { X, History, Trash2, Calendar, FileText, CheckCircle2 } from 'lucide-react'
import { AdvisorCommissionSummary, AdvisorCommissionPayout, PAYMENT_METHODS } from '@/lib/payouts'

interface AdvisorPayoutHistoryDialogProps {
    isOpen: boolean
    onClose: () => void
    summary?: AdvisorCommissionSummary | null
    payouts: AdvisorCommissionPayout[]
    onDeletePayout?: (id: string) => void
    canDelete?: boolean
}

export default function AdvisorPayoutHistoryDialog({
    isOpen,
    onClose,
    summary,
    payouts,
    onDeletePayout,
    canDelete = false,
}: AdvisorPayoutHistoryDialogProps) {
    if (!isOpen || !summary) return null

    const advisorPayouts = payouts.filter(p => p.advisor_code === summary.advisor_code)
    const methodMap = new Map(PAYMENT_METHODS.map(m => [m.value, m.label]))

    function formatDate(dStr: string | null): string {
        if (!dStr) return '—'
        const d = new Date(dStr)
        return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
    }

    return (
        <div style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(8px)',
            padding: '16px',
        }}>
            <div style={{
                backgroundColor: '#FFFFFF',
                borderRadius: '20px',
                width: '100%',
                maxWidth: '720px',
                maxHeight: '90vh',
                boxShadow: '0 24px 48px rgba(0, 0, 0, 0.2)',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                animation: 'modalSlide 0.25s ease-out',
            }}>
                {/* Header */}
                <div style={{
                    background: 'linear-gradient(135deg, #162860 0%, #0074BD 100%)',
                    padding: '20px 24px',
                    color: '#FFFFFF',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{
                            width: '40px',
                            height: '40px',
                            borderRadius: '12px',
                            backgroundColor: 'rgba(255, 255, 255, 0.15)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}>
                            <History className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <h2 style={{ fontSize: '18px', fontWeight: '700', margin: 0 }}>{summary.advisor_name}</h2>
                            <p style={{ fontSize: '12px', opacity: 0.8, margin: '2px 0 0' }}>Code: {summary.advisor_code} · Payout History Statement</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        style={{
                            background: 'rgba(255, 255, 255, 0.15)',
                            border: 'none',
                            borderRadius: '50%',
                            width: '32px',
                            height: '32px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#FFFFFF',
                            cursor: 'pointer',
                        }}
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* Body */}
                <div style={{ padding: '24px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '20px' }}>

                    {/* Summary Cards */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
                        <div style={{ padding: '14px', borderRadius: '12px', backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0' }}>
                            <span style={{ fontSize: '11px', fontWeight: '600', color: '#64748B', textTransform: 'uppercase' }}>Total Earned</span>
                            <p style={{ fontSize: '18px', fontWeight: '700', color: '#162860', margin: '4px 0 0' }}>
                                AED {summary.total_earned.toLocaleString()}
                            </p>
                        </div>
                        <div style={{ padding: '14px', borderRadius: '12px', backgroundColor: '#ECFDF5', border: '1px solid #A7F3D0' }}>
                            <span style={{ fontSize: '11px', fontWeight: '600', color: '#047857', textTransform: 'uppercase' }}>Total Paid</span>
                            <p style={{ fontSize: '18px', fontWeight: '700', color: '#065F46', margin: '4px 0 0' }}>
                                AED {summary.total_paid.toLocaleString()}
                            </p>
                        </div>
                        <div style={{ padding: '14px', borderRadius: '12px', backgroundColor: summary.pending_balance > 0 ? '#FEF3C7' : '#F1F5F9', border: `1px solid ${summary.pending_balance > 0 ? '#FCD34D' : '#E2E8F0'}` }}>
                            <span style={{ fontSize: '11px', fontWeight: '600', color: summary.pending_balance > 0 ? '#B45309' : '#475569', textTransform: 'uppercase' }}>Pending Balance</span>
                            <p style={{ fontSize: '18px', fontWeight: '700', color: summary.pending_balance > 0 ? '#92400E' : '#334155', margin: '4px 0 0' }}>
                                AED {summary.pending_balance.toLocaleString()}
                            </p>
                        </div>
                    </div>

                    {/* Transactions Log Table */}
                    <div>
                        <h3 style={{ fontSize: '14px', fontWeight: '700', color: '#1E293B', marginBottom: '12px' }}>
                            Payout Transactions ({advisorPayouts.length})
                        </h3>

                        {advisorPayouts.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '36px', backgroundColor: '#F8FAFC', borderRadius: '12px', color: '#64748B', fontSize: '13px' }}>
                                No payout transactions recorded for this service advisor yet.
                            </div>
                        ) : (
                            <div style={{ borderRadius: '12px', border: '1px solid #E2E8F0', overflow: 'hidden' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                    <thead>
                                        <tr style={{ backgroundColor: '#F1F5F9', borderBottom: '1px solid #E2E8F0' }}>
                                            {['Date', 'Amount', 'Method', 'Ref / Cheque #', 'Period Covered', 'Recorded By', ...(canDelete ? ['Actions'] : [])].map(h => (
                                                <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: '11px', fontWeight: '700', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                                    {h}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {advisorPayouts.map((p, idx) => (
                                            <tr key={p.id} style={{ borderBottom: idx === advisorPayouts.length - 1 ? 'none' : '1px solid #F1F5F9' }}>
                                                <td style={{ padding: '12px 14px', fontSize: '13px', fontWeight: '600', color: '#1E293B' }}>
                                                    {formatDate(p.payment_date)}
                                                </td>
                                                <td style={{ padding: '12px 14px', fontSize: '14px', fontWeight: '700', color: '#059669' }}>
                                                    AED {p.payout_amount.toLocaleString()}
                                                </td>
                                                <td style={{ padding: '12px 14px', fontSize: '12px', color: '#334155' }}>
                                                    {methodMap.get(p.payment_method) || p.payment_method}
                                                </td>
                                                <td style={{ padding: '12px 14px', fontSize: '12px', fontFamily: 'monospace', color: '#475569' }}>
                                                    {p.reference_number || '—'}
                                                </td>
                                                <td style={{ padding: '12px 14px', fontSize: '12px', color: '#64748B' }}>
                                                    {p.period_start_date || p.period_end_date
                                                        ? `${formatDate(p.period_start_date)} - ${formatDate(p.period_end_date)}`
                                                        : '—'}
                                                </td>
                                                <td style={{ padding: '12px 14px', fontSize: '12px', color: '#64748B' }}>
                                                    {p.paid_by_name || 'Admin'}
                                                </td>
                                                {canDelete && (
                                                    <td style={{ padding: '12px 14px' }}>
                                                        <button
                                                            onClick={() => onDeletePayout && onDeletePayout(p.id)}
                                                            style={{
                                                                background: 'none',
                                                                border: 'none',
                                                                color: '#EF4444',
                                                                cursor: 'pointer',
                                                                padding: '4px',
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
                </div>

                {/* Footer */}
                <div style={{ padding: '16px 24px', backgroundColor: '#F8FAFC', borderTop: '1px solid #E2E8F0', display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                        onClick={onClose}
                        style={{
                            padding: '9px 18px',
                            fontSize: '13px',
                            fontWeight: '600',
                            borderRadius: '10px',
                            border: '1px solid #CBD5E1',
                            backgroundColor: '#FFFFFF',
                            color: '#475569',
                            cursor: 'pointer',
                        }}
                    >
                        Close
                    </button>
                </div>
            </div>
            <style>{`
                @keyframes modalSlide {
                    from { transform: translateY(16px); opacity: 0; }
                    to { transform: translateY(0); opacity: 1; }
                }
            `}</style>
        </div>
    )
}
