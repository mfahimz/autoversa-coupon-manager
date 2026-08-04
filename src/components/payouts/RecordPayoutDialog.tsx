'use client'

import React, { useState, useEffect } from 'react'
import { X, DollarSign, Calendar, CreditCard, FileText, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'
import { AdvisorCommissionSummary, CreatePayoutPayload, PAYMENT_METHODS, recordCommissionPayout } from '@/lib/payouts'

interface RecordPayoutDialogProps {
    isOpen: boolean
    onClose: () => void
    advisor?: AdvisorCommissionSummary | null
    advisors: AdvisorCommissionSummary[]
    onSuccess: () => void
}

export default function RecordPayoutDialog({
    isOpen,
    onClose,
    advisor,
    advisors,
    onSuccess,
}: RecordPayoutDialogProps) {
    const [selectedCode, setSelectedCode] = useState<string>('')
    const [amount, setAmount] = useState<string>('')
    const [paymentDate, setPaymentDate] = useState<string>('')
    const [paymentMethod, setPaymentMethod] = useState<string>('BANK_TRANSFER')
    const [referenceNumber, setReferenceNumber] = useState<string>('')
    const [periodStartDate, setPeriodStartDate] = useState<string>('')
    const [periodEndDate, setPeriodEndDate] = useState<string>('')
    const [notes, setNotes] = useState<string>('')
    const [submitting, setSubmitting] = useState(false)

    useEffect(() => {
        if (isOpen) {
            const today = new Date().toISOString().split('T')[0]
            setPaymentDate(today)

            if (advisor) {
                setSelectedCode(advisor.advisor_code)
                setAmount(advisor.pending_balance > 0 ? String(advisor.pending_balance) : '')
            } else if (advisors.length > 0) {
                setSelectedCode(advisors[0].advisor_code)
                setAmount(advisors[0].pending_balance > 0 ? String(advisors[0].pending_balance) : '')
            }
        }
    }, [isOpen, advisor, advisors])

    const currentAdvisor = advisors.find(a => a.advisor_code === selectedCode) || advisor

    function handleAdvisorChange(code: string) {
        setSelectedCode(code)
        const target = advisors.find(a => a.advisor_code === code)
        if (target) {
            setAmount(target.pending_balance > 0 ? String(target.pending_balance) : '')
        }
    }

    function handleFillFullBalance() {
        if (currentAdvisor) {
            setAmount(String(currentAdvisor.pending_balance))
        }
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()

        if (!currentAdvisor) {
            toast.error('Please select a service advisor')
            return
        }

        const numAmount = Number(amount)
        if (isNaN(numAmount) || numAmount <= 0) {
            toast.error('Please enter a valid payout amount greater than 0')
            return
        }

        if (!paymentDate) {
            toast.error('Please select a payment date')
            return
        }

        setSubmitting(true)

        try {
            const payload: CreatePayoutPayload = {
                advisor_code: currentAdvisor.advisor_code,
                advisor_name: currentAdvisor.advisor_name,
                profile_id: currentAdvisor.profile_id,
                payout_amount: numAmount,
                payment_date: paymentDate,
                payment_method: paymentMethod,
                reference_number: referenceNumber.trim() || undefined,
                period_start_date: periodStartDate || undefined,
                period_end_date: periodEndDate || undefined,
                notes: notes.trim() || undefined,
            }

            await recordCommissionPayout(payload)
            toast.success(`Successfully recorded payout of AED ${numAmount.toLocaleString()} for ${currentAdvisor.advisor_name}`)
            onSuccess()
            onClose()
        } catch (error: any) {
            console.error('Error submitting payout:', error)
            toast.error(error.message || 'Failed to record payout')
        } finally {
            setSubmitting(false)
        }
    }

    if (!isOpen) return null

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
                maxWidth: '540px',
                boxShadow: '0 24px 48px rgba(0, 0, 0, 0.2), 0 0 0 1px rgba(255, 255, 255, 0.1)',
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
                            <DollarSign className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <h2 style={{ fontSize: '18px', fontWeight: '700', margin: 0, lineHeight: '1.2' }}>Record Commission Payout</h2>
                            <p style={{ fontSize: '12px', opacity: 0.8, margin: '2px 0 0' }}>Log payout details for a service advisor</p>
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
                            transition: 'background 0.2s',
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.3)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)'}
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '18px' }}>

                    {/* Advisor Select */}
                    <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#475569', marginBottom: '6px' }}>
                            Service Advisor *
                        </label>
                        <select
                            value={selectedCode}
                            onChange={e => handleAdvisorChange(e.target.value)}
                            style={{
                                width: '100%',
                                padding: '10px 14px',
                                fontSize: '14px',
                                borderRadius: '10px',
                                border: '1.5px solid #CBD5E1',
                                backgroundColor: '#F8FAFC',
                                outline: 'none',
                                fontWeight: '500',
                            }}
                        >
                            {advisors.map(a => (
                                <option key={a.advisor_code} value={a.advisor_code}>
                                    {a.advisor_name} ({a.advisor_code}) — Pending: AED {a.pending_balance.toLocaleString()}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Pending Balance Badge */}
                    {currentAdvisor && (
                        <div style={{
                            padding: '12px 16px',
                            borderRadius: '12px',
                            backgroundColor: currentAdvisor.pending_balance > 0 ? '#FEF3C7' : '#ECFDF5',
                            border: `1px solid ${currentAdvisor.pending_balance > 0 ? '#FCD34D' : '#A7F3D0'}`,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                        }}>
                            <div>
                                <span style={{ fontSize: '11px', fontWeight: '600', textTransform: 'uppercase', color: currentAdvisor.pending_balance > 0 ? '#B45309' : '#047857', letterSpacing: '0.05em' }}>
                                    Current Pending Commission Balance
                                </span>
                                <p style={{ fontSize: '18px', fontWeight: '700', color: currentAdvisor.pending_balance > 0 ? '#92400E' : '#065F46', margin: '2px 0 0' }}>
                                    AED {currentAdvisor.pending_balance.toLocaleString()}
                                </p>
                            </div>
                            {currentAdvisor.pending_balance > 0 && (
                                <button
                                    type="button"
                                    onClick={handleFillFullBalance}
                                    style={{
                                        padding: '6px 12px',
                                        fontSize: '12px',
                                        fontWeight: '600',
                                        borderRadius: '8px',
                                        backgroundColor: '#D97706',
                                        color: '#FFFFFF',
                                        border: 'none',
                                        cursor: 'pointer',
                                        transition: 'background 0.2s',
                                    }}
                                >
                                    Pay Full Balance
                                </button>
                            )}
                        </div>
                    )}

                    {/* Amount & Date Grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                        <div>
                            <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#475569', marginBottom: '6px' }}>
                                Payout Amount (AED) *
                            </label>
                            <input
                                type="number"
                                step="0.01"
                                min="0.01"
                                placeholder="0.00"
                                value={amount}
                                onChange={e => setAmount(e.target.value)}
                                style={{
                                    width: '100%',
                                    padding: '10px 14px',
                                    fontSize: '14px',
                                    fontWeight: '600',
                                    borderRadius: '10px',
                                    border: '1.5px solid #CBD5E1',
                                    outline: 'none',
                                }}
                                required
                            />
                        </div>

                        <div>
                            <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#475569', marginBottom: '6px' }}>
                                Payment Date *
                            </label>
                            <input
                                type="date"
                                value={paymentDate}
                                onChange={e => setPaymentDate(e.target.value)}
                                style={{
                                    width: '100%',
                                    padding: '10px 14px',
                                    fontSize: '13px',
                                    borderRadius: '10px',
                                    border: '1.5px solid #CBD5E1',
                                    outline: 'none',
                                }}
                                required
                            />
                        </div>
                    </div>

                    {/* Payment Method & Reference */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                        <div>
                            <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#475569', marginBottom: '6px' }}>
                                Payment Method *
                            </label>
                            <select
                                value={paymentMethod}
                                onChange={e => setPaymentMethod(e.target.value)}
                                style={{
                                    width: '100%',
                                    padding: '10px 14px',
                                    fontSize: '13px',
                                    borderRadius: '10px',
                                    border: '1.5px solid #CBD5E1',
                                    backgroundColor: '#FFFFFF',
                                    outline: 'none',
                                }}
                            >
                                {PAYMENT_METHODS.map(m => (
                                    <option key={m.value} value={m.value}>{m.label}</option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#475569', marginBottom: '6px' }}>
                                Ref / Cheque / Txn #
                            </label>
                            <input
                                type="text"
                                placeholder="e.g. CHQ-98124 or FT-882"
                                value={referenceNumber}
                                onChange={e => setReferenceNumber(e.target.value)}
                                style={{
                                    width: '100%',
                                    padding: '10px 14px',
                                    fontSize: '13px',
                                    borderRadius: '10px',
                                    border: '1.5px solid #CBD5E1',
                                    outline: 'none',
                                }}
                            />
                        </div>
                    </div>

                    {/* Period Covered */}
                    <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#475569', marginBottom: '6px' }}>
                            Coverage Period (Optional)
                        </label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <input
                                type="date"
                                value={periodStartDate}
                                onChange={e => setPeriodStartDate(e.target.value)}
                                style={{
                                    flex: 1,
                                    padding: '9px 12px',
                                    fontSize: '13px',
                                    borderRadius: '10px',
                                    border: '1.5px solid #CBD5E1',
                                    outline: 'none',
                                }}
                            />
                            <span style={{ fontSize: '12px', color: '#64748B' }}>to</span>
                            <input
                                type="date"
                                value={periodEndDate}
                                onChange={e => setPeriodEndDate(e.target.value)}
                                style={{
                                    flex: 1,
                                    padding: '9px 12px',
                                    fontSize: '13px',
                                    borderRadius: '10px',
                                    border: '1.5px solid #CBD5E1',
                                    outline: 'none',
                                }}
                            />
                        </div>
                    </div>

                    {/* Notes */}
                    <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#475569', marginBottom: '6px' }}>
                            Notes / Remarks (Optional)
                        </label>
                        <textarea
                            rows={2}
                            placeholder="e.g. Paid via direct bank transfer for July 2026 commission"
                            value={notes}
                            onChange={e => setNotes(e.target.value)}
                            style={{
                                width: '100%',
                                padding: '10px 14px',
                                fontSize: '13px',
                                borderRadius: '10px',
                                border: '1.5px solid #CBD5E1',
                                outline: 'none',
                                resize: 'none',
                            }}
                        />
                    </div>

                    {/* Actions */}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
                        <button
                            type="button"
                            onClick={onClose}
                            style={{
                                padding: '10px 18px',
                                fontSize: '13px',
                                fontWeight: '600',
                                borderRadius: '10px',
                                border: '1px solid #CBD5E1',
                                backgroundColor: '#FFFFFF',
                                color: '#475569',
                                cursor: 'pointer',
                            }}
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={submitting}
                            style={{
                                padding: '10px 22px',
                                fontSize: '13px',
                                fontWeight: '600',
                                borderRadius: '10px',
                                border: 'none',
                                background: 'linear-gradient(135deg, #162860 0%, #0074BD 100%)',
                                color: '#FFFFFF',
                                cursor: submitting ? 'not-allowed' : 'pointer',
                                opacity: submitting ? 0.7 : 1,
                                boxShadow: '0 4px 12px rgba(0, 116, 189, 0.3)',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                            }}
                        >
                            {submitting ? 'Recording...' : 'Record Payout'}
                        </button>
                    </div>

                </form>
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
