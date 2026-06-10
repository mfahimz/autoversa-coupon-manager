'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Breadcrumb from '@/components/layout/Breadcrumb'
import Navbar from '@/components/layout/Navbar'

interface VariableConfig {
    key: string
    label: string
    description: string | null
}

interface OfferFormProps {
    mode: 'create' | 'edit'
    initialData?: {
        id: string
        title: string
        description: string | null
        offer_identifier: string
        valid_days: number
        commission_amount: number | null
        coupon_code_structure: string | null
        offer_variables: string[] | null
        is_active: boolean
    }
}

export default function OfferForm({ mode, initialData }: OfferFormProps) {
    const router = useRouter()
    const supabase = createClient()

    const [availableVariables, setAvailableVariables] = useState<VariableConfig[]>([])
    const [form, setForm] = useState({
        title: initialData?.title || '',
        description: initialData?.description || '',
        offer_identifier: initialData?.offer_identifier || '',
        valid_days: initialData?.valid_days || 90,
        commission_amount: initialData?.commission_amount?.toString() || '',
        coupon_code_structure: initialData?.coupon_code_structure || '',
        offer_variables: initialData?.offer_variables || [] as string[],
        is_active: initialData?.is_active ?? true,
    })
    const [saving, setSaving] = useState(false)
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

    useEffect(() => { loadVariables() }, [])

    async function loadVariables() {
        const { data } = await supabase
            .from('admin_variable_config')
            .select('key, label, description')
            .eq('is_enabled', true)
            .order('sort_order', { ascending: true })
        if (data) setAvailableVariables(data)
    }

    function showToast(message: string, type: 'success' | 'error' = 'success') {
        setToast({ message, type })
        setTimeout(() => setToast(null), 3000)
    }

    function toggleVariable(key: string) {
        setForm(f => ({
            ...f,
            offer_variables: f.offer_variables.includes(key)
                ? f.offer_variables.filter(v => v !== key)
                : [...f.offer_variables, key],
        }))
    }

    async function handleSave() {
        if (!form.title.trim()) { showToast('Title is required', 'error'); return }
        if (!form.offer_identifier.trim()) { showToast('Offer identifier is required', 'error'); return }

        setSaving(true)
        const payload = {
            title: form.title.trim(),
            description: form.description.trim() || null,
            offer_identifier: form.offer_identifier.trim().toUpperCase(),
            valid_days: Number(form.valid_days),
            commission_amount: form.commission_amount ? Number(form.commission_amount) : null,
            coupon_code_structure: form.coupon_code_structure.trim() || null,
            offer_variables: form.offer_variables.length > 0 ? form.offer_variables : null,
            is_active: form.is_active,
        }

        if (mode === 'edit' && initialData) {
            const { error } = await supabase.from('offers').update(payload).eq('id', initialData.id)
            if (error) { showToast('Failed to update offer', 'error'); setSaving(false); return }
            showToast('Offer updated successfully')
        } else {
            const { error } = await supabase.from('offers').insert(payload)
            if (error) { showToast('Failed to create offer', 'error'); setSaving(false); return }
            showToast('Offer created successfully')
        }

        setSaving(false)
        setTimeout(() => router.push('/offers'), 1000)
    }

    return (
        <div style={{ minHeight: '100vh', backgroundColor: '#F7F7F7', paddingTop: '16px' }}>
            <style>{`
        @keyframes slideIn { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }
        input:focus, textarea:focus, select:focus { border-color: #0074BD !important; outline: none; }
      `}</style>

            {toast && (
                <div style={{
                    position: 'fixed', top: '24px', right: '24px', zIndex: 1000,
                    backgroundColor: toast.type === 'success' ? '#162860' : '#D0021B',
                    color: '#FFFFFF', padding: '14px 20px', borderRadius: '12px',
                    fontSize: '14px', fontWeight: '500', boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
                    animation: 'slideIn 0.2s ease',
                }}>
                    {toast.message}
                </div>
            )}

            <Navbar />

            <main style={{ padding: '0 32px 48px' }}>
                <Breadcrumb items={[
                    { label: 'Dashboard', href: '/dashboard' },
                    { label: 'Offers', href: '/offers' },
                    { label: mode === 'create' ? 'New Offer' : `Edit — ${initialData?.title || ''}` },
                ]} />

                <div style={{ marginBottom: '32px' }}>
                    <h1 style={{ fontSize: '22px', fontWeight: '700', color: '#1A1A1A', margin: 0 }}>
                        {mode === 'create' ? 'New Offer' : 'Edit Offer'}
                    </h1>
                    <p style={{ color: '#666666', fontSize: '14px', marginTop: '4px' }}>
                        {mode === 'create'
                            ? 'Fill in the details to create a new offer.'
                            : 'Update the offer details below.'}
                    </p>
                </div>

                <div style={{
                    backgroundColor: '#FFFFFF', borderRadius: '16px',
                    padding: '32px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
                    display: 'flex', flexDirection: 'column', gap: '24px',
                }}>

                    {/* Title */}
                    <div>
                        <label style={labelStyle}>Title *</label>
                        <input
                            style={inputStyle}
                            value={form.title}
                            onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                            placeholder="e.g. Minor Service Offer"
                        />
                    </div>

                    {/* Offer Identifier */}
                    <div>
                        <label style={labelStyle}>Offer Identifier *</label>
                        <input
                            style={inputStyle}
                            value={form.offer_identifier}
                            onChange={e => setForm(f => ({ ...f, offer_identifier: e.target.value.toUpperCase() }))}
                            placeholder="e.g. MINOR-SERVICE-2026"
                        />
                        <p style={{ fontSize: '12px', color: '#888', marginTop: '4px' }}>
                            Auto-uppercased. Used in coupon code generation.
                        </p>
                    </div>

                    {/* Description */}
                    <div>
                        <label style={labelStyle}>Description</label>
                        <textarea
                            style={{ ...inputStyle, height: '80px', resize: 'vertical' }}
                            value={form.description}
                            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                            placeholder="Brief description of this offer"
                        />
                    </div>

                    {/* Valid Days + Commission */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                        <div>
                            <label style={labelStyle}>Valid Days</label>
                            <input
                                style={inputStyle}
                                type="number"
                                value={form.valid_days}
                                onChange={e => setForm(f => ({ ...f, valid_days: Number(e.target.value) }))}
                                min="1"
                            />
                        </div>
                        <div>
                            <label style={labelStyle}>Commission (AED)</label>
                            <input
                                style={inputStyle}
                                type="number"
                                value={form.commission_amount}
                                onChange={e => setForm(f => ({ ...f, commission_amount: e.target.value }))}
                                placeholder="e.g. 50"
                                min="0"
                            />
                        </div>
                    </div>

                    {/* Coupon Code Structure */}
                    <div>
                        <label style={labelStyle}>Coupon Code Structure</label>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <input
                                style={{ ...inputStyle, flex: 1 }}
                                value={form.coupon_code_structure}
                                onChange={e => setForm(f => ({ ...f, coupon_code_structure: e.target.value }))}
                                placeholder="e.g. AUTOVERSA_[ADVISOR_CODE]_[OFFER_IDENTIFIER]_[PLATE_OR_MOBILE_LAST5]"
                            />
                            <button
                                onClick={() => setForm(f => ({
                                    ...f,
                                    coupon_code_structure: 'AUTOVERSA_[ADVISOR_CODE]_[OFFER_IDENTIFIER]_[PLATE_OR_MOBILE_LAST5]',
                                }))}
                                style={{
                                    padding: '0 16px', backgroundColor: '#F0F4FF', color: '#162860',
                                    border: 'none', borderRadius: '8px', fontSize: '13px',
                                    fontWeight: '600', cursor: 'pointer', whiteSpace: 'nowrap',
                                }}
                            >
                                Use Preset
                            </button>
                        </div>
                        <p style={{ fontSize: '12px', color: '#888', marginTop: '4px' }}>
                            Preset format: AUTOVERSA_[ADVISOR_CODE]_[OFFER_IDENTIFIER]_[PLATE_OR_MOBILE_LAST5]
                        </p>
                    </div>

                    {/* Divider */}
                    <div style={{ borderTop: '1px solid #F0F0F0', margin: '4px 0' }} />

                    {/* Offer Variables */}
                    <div>
                        <label style={labelStyle}>Coupon Print Variables</label>
                        <p style={{ fontSize: '13px', color: '#888', marginBottom: '14px', marginTop: '2px' }}>
                            Select what information gets printed on the coupon design.
                            Manage available variables in{' '}
                            <span
                                onClick={() => router.push('/admin/settings')}
                                style={{ color: '#0074BD', cursor: 'pointer' }}
                            >
                                Admin Settings
                            </span>.
                        </p>

                        {availableVariables.length === 0 ? (
                            <div style={{
                                padding: '24px', textAlign: 'center',
                                backgroundColor: '#F7F7F7', borderRadius: '10px',
                                color: '#888', fontSize: '13px',
                            }}>
                                No variables configured.{' '}
                                <span
                                    onClick={() => router.push('/admin/settings')}
                                    style={{ color: '#0074BD', cursor: 'pointer' }}
                                >
                                    Add variables in Admin Settings →
                                </span>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {availableVariables.map(v => {
                                    const selected = form.offer_variables.includes(v.key)
                                    return (
                                        <div
                                            key={v.key}
                                            onClick={() => toggleVariable(v.key)}
                                            style={{
                                                display: 'flex', alignItems: 'center', gap: '14px',
                                                padding: '14px 16px', borderRadius: '10px',
                                                border: `1.5px solid ${selected ? '#0074BD' : '#E0E0E0'}`,
                                                backgroundColor: selected ? '#F0F7FF' : '#FFFFFF',
                                                cursor: 'pointer', transition: 'all 0.15s',
                                            }}
                                        >
                                            <div style={{
                                                width: '20px', height: '20px', borderRadius: '5px', flexShrink: 0,
                                                border: `2px solid ${selected ? '#0074BD' : '#CCCCCC'}`,
                                                backgroundColor: selected ? '#0074BD' : 'transparent',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                transition: 'all 0.15s',
                                            }}>
                                                {selected && (
                                                    <span style={{ color: '#FFFFFF', fontSize: '12px', fontWeight: '700', lineHeight: 1 }}>✓</span>
                                                )}
                                            </div>
                                            <div style={{ flex: 1 }}>
                                                <p style={{ fontSize: '14px', fontWeight: '600', color: '#1A1A1A', margin: 0 }}>
                                                    {v.label}
                                                </p>
                                                {v.description && (
                                                    <p style={{ fontSize: '12px', color: '#666', margin: '2px 0 0' }}>
                                                        {v.description}
                                                    </p>
                                                )}
                                            </div>
                                            <span style={{
                                                fontSize: '11px', fontFamily: 'monospace', color: '#888',
                                                backgroundColor: '#F0F0F0', padding: '3px 8px', borderRadius: '4px',
                                                flexShrink: 0,
                                            }}>
                                                {v.key}
                                            </span>
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                    </div>

                    {/* Divider */}
                    <div style={{ borderTop: '1px solid #F0F0F0', margin: '4px 0' }} />

                    {/* Is Active */}
                    <div style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '16px', backgroundColor: '#F7F7F7', borderRadius: '10px',
                    }}>
                        <div>
                            <p style={{ fontSize: '14px', fontWeight: '600', color: '#1A1A1A', margin: 0 }}>
                                Active
                            </p>
                            <p style={{ fontSize: '12px', color: '#666', margin: '2px 0 0' }}>
                                Advisors can only issue coupons for active offers
                            </p>
                        </div>
                        <div
                            onClick={() => setForm(f => ({ ...f, is_active: !f.is_active }))}
                            style={{
                                width: '44px', height: '24px', borderRadius: '100px',
                                backgroundColor: form.is_active ? '#0074BD' : '#CCCCCC',
                                cursor: 'pointer', position: 'relative',
                                transition: 'background-color 0.2s', flexShrink: 0,
                            }}
                        >
                            <div style={{
                                position: 'absolute', top: '2px',
                                left: form.is_active ? '22px' : '2px',
                                width: '20px', height: '20px', borderRadius: '50%',
                                backgroundColor: '#FFFFFF', transition: 'left 0.2s',
                                boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                            }} />
                        </div>
                    </div>

                    {/* Action Buttons */}
                    <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                        <button
                            onClick={() => router.push('/offers')}
                            style={{
                                padding: '12px 24px', backgroundColor: '#F0F0F0', color: '#444444',
                                border: 'none', borderRadius: '10px', fontSize: '14px',
                                fontWeight: '600', cursor: 'pointer',
                            }}
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={saving}
                            style={{
                                padding: '12px 32px',
                                backgroundColor: saving ? '#93C5E8' : '#0074BD',
                                color: '#FFFFFF', border: 'none', borderRadius: '10px',
                                fontSize: '14px', fontWeight: '600',
                                cursor: saving ? 'not-allowed' : 'pointer',
                            }}
                        >
                            {saving ? 'Saving...' : mode === 'create' ? 'Create Offer' : 'Save Changes'}
                        </button>
                    </div>

                </div>
            </main>
        </div>
    )
}

const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: '13px', fontWeight: '600',
    color: '#1A1A1A', marginBottom: '6px',
}

const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 12px', fontSize: '14px',
    border: '1.5px solid #E0E0E0', borderRadius: '8px', outline: 'none',
    backgroundColor: '#FFFFFF', color: '#1A1A1A',
    boxSizing: 'border-box', fontFamily: 'inherit',
}