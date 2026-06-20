'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Navbar from '@/components/layout/Navbar'
import Breadcrumb from '@/components/layout/Breadcrumb'
import { loadPermissionsForRole, checkPermission, PermissionsMap } from '@/lib/permissions'
import { maskMobileNumber } from '@/lib/utils'

// ─── Types ───────────────────────────────────────────────────────────────────

interface LoyaltyCustomer {
    id: string
    customer_id: string
    full_name: string | null
    mobile_number: string
    email: string | null
    plate_numbers: string[]
    car_make: string | null
    car_model: string | null
    created_at: string | null
    updated_at: string | null
}

interface ReferralCustomer {
    id: string
    customer_id: string
    full_name: string | null
    mobile_number: string
    email: string | null
    plate_numbers: string[]
    car_make: string | null
    car_model: string | null
    created_at: string | null
    updated_at: string | null
}

// ─── Shared styles ────────────────────────────────────────────────────────────

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

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(dateStr: string | null): string {
    if (!dateStr) return '—'
    const d = new Date(dateStr)
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function CustomersPage() {
    const router = useRouter()
    const supabase = createClient()

    const [profile, setProfile] = useState<any>(null)
    const [permissions, setPermissions] = useState<PermissionsMap>({})
    const [activeTab, setActiveTab] = useState<'loyalty' | 'referral'>('loyalty')
    const [loyaltyCustomers, setLoyaltyCustomers] = useState<LoyaltyCustomer[]>([])
    const [referralCustomers, setReferralCustomers] = useState<ReferralCustomer[]>([])
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState('')

    const [selectedCustomer, setSelectedCustomer] = useState<LoyaltyCustomer | ReferralCustomer | null>(null)
    const [editForm, setEditForm] = useState({ full_name: '', email: '', car_model: '' })
    const [editErrors, setEditErrors] = useState<Record<string, string>>({})
    const [saving, setSaving] = useState(false)
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

    useEffect(() => { init() }, [])

    async function init() {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { router.push('/login'); return }

        const { data: profileData } = await supabase
            .from('profiles').select('*').eq('id', user.id).single()

        if (!profileData) { router.push('/login'); return }

        if (profileData?.is_active === false) {
            await supabase.auth.signOut()
            router.push('/login')
            return
        }

        const perms = await loadPermissionsForRole(profileData.user_role)
        if (!checkPermission(perms, profileData.user_role, 'page:customers', 'view')) {
            router.push('/dashboard')
            return
        }

        setProfile(profileData)
        setPermissions(perms)
        await loadAll()
    }

    async function loadAll() {
        setLoading(true)
        const [{ data: lData }, { data: rData }] = await Promise.all([
            supabase.from('loyalty_customers').select('*').order('customer_id', { ascending: true }),
            supabase.from('referral_customers').select('*').order('customer_id', { ascending: true }),
        ])
        setLoyaltyCustomers(lData || [])
        setReferralCustomers(rData || [])
        setLoading(false)
    }

    function showToast(message: string, type: 'success' | 'error' = 'success') {
        setToast({ message, type })
        setTimeout(() => setToast(null), 3500)
    }

    function openEdit(customer: LoyaltyCustomer | ReferralCustomer) {
        setSelectedCustomer(customer)
        setEditForm({
            full_name: customer.full_name || '',
            email: customer.email || '',
            car_model: customer.car_model || '',
        })
        setEditErrors({})
    }

    function closeEdit() {
        setSelectedCustomer(null)
        setEditForm({ full_name: '', email: '', car_model: '' })
        setEditErrors({})
    }

    async function saveEdit() {
        if (!selectedCustomer) return

        if (!checkPermission(permissions, profile?.user_role, 'action:customer:edit', 'action')) {
            showToast('You do not have permission to edit customer profiles.', 'error')
            return
        }

        const newErrors: Record<string, string> = {}

        const name = editForm.full_name.trim()
        const email = editForm.email.trim()
        const model = editForm.car_model.trim()

        if (name.length > 100) newErrors.full_name = 'Name must be 100 characters or less'
        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) newErrors.email = 'Enter a valid email address'
        if (email.length > 200) newErrors.email = 'Email must be 200 characters or less'
        if (model.length > 100) newErrors.car_model = 'Car model must be 100 characters or less'

        if (Object.keys(newErrors).length > 0) {
            setEditErrors(newErrors)
            return
        }

        setSaving(true)
        const table = activeTab === 'loyalty' ? 'loyalty_customers' : 'referral_customers'

        const { error } = await supabase
            .from(table)
            .update({
                full_name: name || null,
                email: email || null,
                car_model: model || null,
                updated_at: new Date().toISOString(),
            })
            .eq('id', selectedCustomer.id)

        if (error) {
            showToast('Failed to save — ' + error.message, 'error')
            setSaving(false)
            return
        }

        showToast('Customer updated successfully')
        setSaving(false)
        closeEdit()
        await loadAll()
    }

    const loyaltyFiltered = loyaltyCustomers.filter(c => {
        const q = search.toLowerCase()
        return !q ||
            c.customer_id.toLowerCase().includes(q) ||
            c.mobile_number.includes(q) ||
            (c.full_name || '').toLowerCase().includes(q) ||
            c.plate_numbers.some(p => p.toLowerCase().includes(q))
    })

    const referralFiltered = referralCustomers.filter(c => {
        const q = search.toLowerCase()
        return !q ||
            c.customer_id.toLowerCase().includes(q) ||
            c.mobile_number.includes(q) ||
            (c.full_name || '').toLowerCase().includes(q) ||
            c.plate_numbers.some(p => p.toLowerCase().includes(q))
    })

    const displayed = activeTab === 'loyalty' ? loyaltyFiltered : referralFiltered
    const canEdit = checkPermission(permissions, profile?.user_role, 'action:customer:edit', 'action')

    return (
        <div style={{ minHeight: '100vh', backgroundColor: '#F7F7F7', paddingTop: '16px' }}>
            <style>{`
        @keyframes slideIn { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes pulse   { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
        @keyframes spin    { to { transform: rotate(360deg); } }
        .cust-row:hover { background-color: #F7F9FF !important; cursor: pointer; }
      `}</style>

            {toast && (
                <div style={{
                    position: 'fixed', top: '24px', right: '24px', zIndex: 2000,
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
                <Breadcrumb items={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Customers' }]} />

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '28px' }}>
                    <div>
                        <h1 style={{ fontSize: '22px', fontWeight: '700', color: '#1A1A1A', margin: 0 }}>Customers</h1>
                        <p style={{ color: '#666', fontSize: '14px', marginTop: '4px' }}>
                            {loyaltyCustomers.length} loyalty · {referralCustomers.length} referral
                        </p>
                    </div>
                </div>

                {/* KPI cards */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '14px', marginBottom: '28px' }}>
                    {[
                        { label: 'Loyalty Customers', value: loyaltyCustomers.length, color: '#162860' },
                        { label: 'Referral Customers', value: referralCustomers.length, color: '#0074BD' },
                        { label: 'Total Customers', value: loyaltyCustomers.length + referralCustomers.length, color: '#666' },
                    ].map(s => (
                        <div key={s.label} style={{ backgroundColor: '#FFFFFF', borderRadius: '14px', padding: '18px 20px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', borderLeft: `4px solid ${s.color}` }}>
                            <p style={{ fontSize: '12px', color: '#666', fontWeight: '500', margin: '0 0 6px' }}>{s.label}</p>
                            {loading
                                ? <div style={{ height: '28px', width: '48px', backgroundColor: '#F0F0F0', borderRadius: '6px', animation: 'pulse 1.5s ease-in-out infinite' }} />
                                : <p style={{ fontSize: '28px', fontWeight: '700', color: '#1A1A1A', margin: 0, lineHeight: 1 }}>{s.value}</p>
                            }
                        </div>
                    ))}
                </div>

                {/* Tabs */}
                <div style={{ display: 'flex', gap: '0', marginBottom: '20px', backgroundColor: '#FFFFFF', borderRadius: '12px', padding: '4px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', width: 'fit-content' }}>
                    {([
                        { key: 'loyalty', label: 'Loyalty Customers', color: '#162860' },
                        { key: 'referral', label: 'Referral Customers', color: '#0074BD' },
                    ] as const).map(tab => (
                        <button
                            key={tab.key}
                            onClick={() => { setActiveTab(tab.key); setSearch('') }}
                            style={{
                                padding: '9px 20px', fontSize: '13px', fontWeight: '600',
                                border: 'none', borderRadius: '9px', cursor: 'pointer',
                                backgroundColor: activeTab === tab.key ? tab.color : 'transparent',
                                color: activeTab === tab.key ? '#FFFFFF' : '#666',
                                transition: 'all 0.15s ease',
                            }}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* Search */}
                <div style={{ marginBottom: '16px' }}>
                    <input
                        style={{ padding: '9px 14px', fontSize: '14px', border: '1.5px solid #E0E0E0', borderRadius: '8px', outline: 'none', minWidth: '300px', backgroundColor: '#FFFFFF' }}
                        placeholder="Search by ID, mobile, name, or plate…"
                        value={search}
                        onChange={e => setSearch(e.target.value.replace(/[<>]/g, '').slice(0, 100))}
                    />
                </div>

                {/* Table */}
                <div style={{ backgroundColor: '#FFFFFF', borderRadius: '16px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
                    {loading ? (
                        <div style={{ padding: '48px', display: 'flex', justifyContent: 'center' }}>
                            <div style={{ width: '32px', height: '32px', borderRadius: '50%', border: '3px solid #0074BD', borderTopColor: 'transparent', animation: 'spin 0.7s linear infinite' }} />
                        </div>
                    ) : displayed.length === 0 ? (
                        <div style={{ padding: '64px', textAlign: 'center', color: '#666', fontSize: '14px' }}>
                            {(activeTab === 'loyalty' ? loyaltyCustomers : referralCustomers).length === 0
                                ? 'No customers yet — they are created automatically when coupons are issued or appointments are booked.'
                                : 'No customers match your search.'}
                        </div>
                    ) : (
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ backgroundColor: '#F7F7F7', borderBottom: '1px solid #E0E0E0' }}>
                                    {['Customer ID', 'Name', 'Mobile', 'Plates', 'Make / Model', 'Joined', ...(canEdit ? ['Actions'] : [])].map(h => (
                                        <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '700', color: '#666', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {displayed.map(customer => (
                                    <tr
                                        key={customer.id}
                                        className="cust-row"
                                        style={{ borderBottom: '1px solid #F0F0F0', backgroundColor: '#FFFFFF' }}
                                        onClick={() => canEdit && openEdit(customer)}
                                    >
                                        <td style={{ padding: '14px 16px' }}>
                                            <span style={{ fontSize: '12px', fontWeight: '700', fontFamily: 'monospace', padding: '3px 8px', borderRadius: '4px', backgroundColor: activeTab === 'loyalty' ? '#EEF2FF' : '#E8F4FF', color: activeTab === 'loyalty' ? '#162860' : '#0074BD' }}>
                                                {customer.customer_id}
                                            </span>
                                        </td>
                                        <td style={{ padding: '14px 16px', fontSize: '13px', color: '#1A1A1A' }}>
                                            {customer.full_name || <span style={{ color: '#999', fontStyle: 'italic' }}>—</span>}
                                        </td>
                                        <td style={{ padding: '14px 16px', fontSize: '13px', color: '#1A1A1A', fontFamily: 'monospace' }}>
                                            {maskMobileNumber(customer.mobile_number)}
                                        </td>
                                        <td style={{ padding: '14px 16px' }}>
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                                {customer.plate_numbers.map(plate => (
                                                    <span key={plate} style={{ fontSize: '11px', fontWeight: '600', padding: '2px 8px', borderRadius: '4px', backgroundColor: '#F0F4FF', color: '#162860', fontFamily: 'monospace' }}>
                                                        {plate}
                                                    </span>
                                                ))}
                                            </div>
                                        </td>
                                        <td style={{ padding: '14px 16px', fontSize: '13px', color: '#444' }}>
                                            {[customer.car_make, customer.car_model].filter(Boolean).join(' ') || '—'}
                                        </td>
                                        <td style={{ padding: '14px 16px', fontSize: '12px', color: '#666' }}>
                                            {formatDate(customer.created_at)}
                                        </td>
                                        {canEdit && (
                                            <td style={{ padding: '14px 16px' }}>
                                                <button
                                                    onClick={e => { e.stopPropagation(); openEdit(customer) }}
                                                    style={{ padding: '6px 14px', fontSize: '12px', fontWeight: '600', backgroundColor: '#F0F4FF', color: '#162860', border: 'none', borderRadius: '7px', cursor: 'pointer' }}
                                                >
                                                    Edit
                                                </button>
                                            </td>
                                        )}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </main>

            {/* ── EDIT PANEL ── */}
            {selectedCustomer && canEdit && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 1000, backgroundColor: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
                    <div style={{ backgroundColor: '#FFFFFF', borderRadius: '20px', padding: '32px', width: '100%', maxWidth: '480px', boxShadow: '0 8px 40px rgba(0,0,0,0.15)', maxHeight: '90vh', overflowY: 'auto' }}>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                            <div>
                                <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#1A1A1A', margin: 0 }}>Customer Profile</h2>
                                <p style={{ fontSize: '12px', color: '#666', margin: '4px 0 0', fontFamily: 'monospace' }}>{selectedCustomer.customer_id}</p>
                            </div>
                            <button onClick={closeEdit} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#666' }}>×</button>
                        </div>

                        {/* Read-only fields */}
                        <div style={{ backgroundColor: '#F7F9FF', borderRadius: '12px', padding: '16px', marginBottom: '20px', marginTop: '16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                            <div>
                                <p style={{ fontSize: '11px', color: '#666', margin: '0 0 2px' }}>Mobile</p>
                                <p style={{ fontSize: '13px', fontWeight: '600', color: '#1A1A1A', margin: 0, fontFamily: 'monospace' }}>+971 {selectedCustomer.mobile_number}</p>
                            </div>
                            <div>
                                <p style={{ fontSize: '11px', color: '#666', margin: '0 0 2px' }}>Car Make</p>
                                <p style={{ fontSize: '13px', fontWeight: '600', color: '#1A1A1A', margin: 0 }}>{selectedCustomer.car_make || '—'}</p>
                            </div>
                            <div style={{ gridColumn: '1 / -1' }}>
                                <p style={{ fontSize: '11px', color: '#666', margin: '0 0 6px' }}>Plates</p>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                    {selectedCustomer.plate_numbers.map(plate => (
                                        <span key={plate} style={{ fontSize: '12px', fontWeight: '700', padding: '4px 10px', borderRadius: '6px', backgroundColor: '#162860', color: '#FFFFFF', fontFamily: 'monospace' }}>
                                            {plate}
                                        </span>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <p style={{ fontSize: '11px', color: '#666', margin: '0 0 2px' }}>Joined</p>
                                <p style={{ fontSize: '13px', fontWeight: '600', color: '#1A1A1A', margin: 0 }}>{formatDate(selectedCustomer.created_at)}</p>
                            </div>
                            <div>
                                <p style={{ fontSize: '11px', color: '#666', margin: '0 0 2px' }}>Last Updated</p>
                                <p style={{ fontSize: '13px', fontWeight: '600', color: '#1A1A1A', margin: 0 }}>{formatDate(selectedCustomer.updated_at)}</p>
                            </div>
                        </div>

                        <p style={{ fontSize: '12px', fontWeight: '700', color: '#666', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 16px' }}>Editable Fields</p>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '24px' }}>
                            <div>
                                <label style={labelStyle}>Full Name (optional)</label>
                                <input
                                    style={{ ...inputStyle, ...(editErrors.full_name ? { borderColor: '#D0021B' } : {}) }}
                                    value={editForm.full_name}
                                    onChange={e => {
                                        const val = e.target.value.replace(/[<>]/g, '').slice(0, 100)
                                        setEditForm(f => ({ ...f, full_name: val }))
                                        if (val) setEditErrors(prev => { const copy = { ...prev }; delete copy.full_name; return copy })
                                    }}
                                    onBlur={() => setEditForm(f => ({ ...f, full_name: f.full_name.trim() }))}
                                    placeholder="Customer full name"
                                />
                                {editErrors.full_name && <p style={{ fontSize: '12px', color: '#D0021B', marginTop: '4px' }}>{editErrors.full_name}</p>}
                            </div>

                            <div>
                                <label style={labelStyle}>Email (optional)</label>
                                <input
                                    style={{ ...inputStyle, ...(editErrors.email ? { borderColor: '#D0021B' } : {}) }}
                                    value={editForm.email}
                                    type="email"
                                    onChange={e => {
                                        const val = e.target.value.replace(/[<>]/g, '').slice(0, 200)
                                        setEditForm(f => ({ ...f, email: val }))
                                        if (val) setEditErrors(prev => { const copy = { ...prev }; delete copy.email; return copy })
                                    }}
                                    onBlur={() => setEditForm(f => ({ ...f, email: f.email.trim() }))}
                                    placeholder="customer@example.com"
                                />
                                {editErrors.email && <p style={{ fontSize: '12px', color: '#D0021B', marginTop: '4px' }}>{editErrors.email}</p>}
                            </div>

                            <div>
                                <label style={labelStyle}>Car Model (optional)</label>
                                <input
                                    style={{ ...inputStyle, ...(editErrors.car_model ? { borderColor: '#D0021B' } : {}) }}
                                    value={editForm.car_model}
                                    onChange={e => {
                                        const val = e.target.value.replace(/[<>]/g, '').slice(0, 100)
                                        setEditForm(f => ({ ...f, car_model: val }))
                                        if (val) setEditErrors(prev => { const copy = { ...prev }; delete copy.car_model; return copy })
                                    }}
                                    onBlur={() => setEditForm(f => ({ ...f, car_model: f.car_model.trim() }))}
                                    placeholder="e.g. C200, 320i"
                                />
                                {editErrors.car_model && <p style={{ fontSize: '12px', color: '#D0021B', marginTop: '4px' }}>{editErrors.car_model}</p>}
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                            <button onClick={closeEdit} style={{ padding: '11px 22px', backgroundColor: '#F0F0F0', color: '#444', border: 'none', borderRadius: '9px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}>
                                Cancel
                            </button>
                            <button
                                onClick={saveEdit}
                                disabled={saving}
                                style={{ padding: '11px 28px', backgroundColor: saving ? '#93C5E8' : '#0074BD', color: '#FFFFFF', border: 'none', borderRadius: '9px', fontSize: '14px', fontWeight: '600', cursor: saving ? 'not-allowed' : 'pointer' }}
                            >
                                {saving ? 'Saving…' : 'Save'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}