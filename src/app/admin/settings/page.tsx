'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Navbar from '@/components/layout/Navbar'
import Breadcrumb from '@/components/layout/Breadcrumb'

interface VariableConfig {
    id: string
    key: string
    label: string
    description: string | null
    is_enabled: boolean
    sort_order: number
    is_system: boolean
}

export default function AdminSettingsPage() {
    const supabase = createClient()

    const [variables, setVariables] = useState<VariableConfig[]>([])
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState<string | null>(null)
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
    const [showAddModal, setShowAddModal] = useState(false)
    const [newVar, setNewVar] = useState({ key: '', label: '', description: '' })
    const [adding, setAdding] = useState(false)

    useEffect(() => { loadVariables() }, [])

    async function loadVariables() {
        setLoading(true)
        const { data } = await supabase
            .from('admin_variable_config')
            .select('*')
            .order('sort_order', { ascending: true })
        if (data) setVariables(data)
        setLoading(false)
    }

    function showToast(message: string, type: 'success' | 'error' = 'success') {
        setToast({ message, type })
        setTimeout(() => setToast(null), 3000)
    }

    async function toggleEnabled(variable: VariableConfig) {
        setSaving(variable.id)
        const { error } = await supabase
            .from('admin_variable_config')
            .update({ is_enabled: !variable.is_enabled })
            .eq('id', variable.id)
        if (error) { showToast('Failed to update variable', 'error') }
        else { showToast(`${variable.label} ${!variable.is_enabled ? 'enabled' : 'disabled'}`) }
        setSaving(null)
        loadVariables()
    }

    async function updateLabel(variable: VariableConfig, newLabel: string) {
        const { error } = await supabase
            .from('admin_variable_config')
            .update({ label: newLabel })
            .eq('id', variable.id)
        if (error) showToast('Failed to update label', 'error')
        else showToast('Label updated')
        loadVariables()
    }

    async function handleAddVariable() {
        if (!newVar.key.trim()) { showToast('Key is required', 'error'); return }
        if (!newVar.label.trim()) { showToast('Label is required', 'error'); return }

        const key = newVar.key.trim().toUpperCase().replace(/\s+/g, '_')
        const exists = variables.some(v => v.key === key)
        if (exists) { showToast('A variable with this key already exists', 'error'); return }

        setAdding(true)
        const { error } = await supabase
            .from('admin_variable_config')
            .insert({
                key,
                label: newVar.label.trim(),
                description: newVar.description.trim() || null,
                is_enabled: true,
                sort_order: variables.length + 1,
                is_system: false,
            })

        if (error) { showToast('Failed to add variable', 'error') }
        else {
            showToast('Variable added successfully')
            setShowAddModal(false)
            setNewVar({ key: '', label: '', description: '' })
            loadVariables()
        }
        setAdding(false)
    }

    async function deleteVariable(variable: VariableConfig) {
        if (variable.is_system) { showToast('System variables cannot be deleted', 'error'); return }
        const { error } = await supabase
            .from('admin_variable_config')
            .delete()
            .eq('id', variable.id)
        if (error) showToast('Failed to delete variable', 'error')
        else showToast('Variable deleted')
        loadVariables()
    }

    return (
        <div style={{ minHeight: '100vh', backgroundColor: '#F7F7F7', paddingTop: '16px' }}>
            <style>{`
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
        @keyframes slideIn { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }
        input:focus { border-color: #0074BD !important; outline: none; }
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
                    { label: 'Admin', href: '/admin/settings' },
                    { label: 'Settings' },
                ]} />

                <div style={{
                    display: 'flex', justifyContent: 'space-between',
                    alignItems: 'center', marginBottom: '32px',
                }}>
                    <div>
                        <h1 style={{ fontSize: '22px', fontWeight: '700', color: '#1A1A1A', margin: 0 }}>
                            Admin Settings
                        </h1>
                        <p style={{ color: '#666666', fontSize: '14px', marginTop: '4px' }}>
                            Configure app behaviour without touching the codebase.
                        </p>
                    </div>
                </div>

                {/* Section — Coupon Print Variables */}
                <div style={{
                    backgroundColor: '#FFFFFF', borderRadius: '16px',
                    boxShadow: '0 1px 4px rgba(0,0,0,0.06)', overflow: 'hidden',
                    marginBottom: '32px',
                }}>
                    {/* Section Header */}
                    <div style={{
                        padding: '20px 24px',
                        borderBottom: '1px solid #F0F0F0',
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    }}>
                        <div>
                            <h2 style={{ fontSize: '16px', fontWeight: '700', color: '#1A1A1A', margin: 0 }}>
                                Coupon Print Variables
                            </h2>
                            <p style={{ fontSize: '13px', color: '#666', marginTop: '4px' }}>
                                These variables are available when configuring what gets printed on a coupon design.
                                Disable to hide from offer creation. System variables cannot be deleted.
                            </p>
                        </div>
                        <button
                            onClick={() => setShowAddModal(true)}
                            style={{
                                padding: '9px 18px', backgroundColor: '#0074BD', color: '#FFFFFF',
                                border: 'none', borderRadius: '10px', fontSize: '13px',
                                fontWeight: '600', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
                            }}
                        >
                            + Add Variable
                        </button>
                    </div>

                    {/* Variable Rows */}
                    {loading ? (
                        Array.from({ length: 6 }).map((_, i) => (
                            <div key={i} style={{
                                height: '60px', margin: '8px 24px', backgroundColor: '#F0F0F0',
                                borderRadius: '8px', animation: 'pulse 1.5s ease-in-out infinite',
                            }} />
                        ))
                    ) : (
                        variables.map((v, i) => (
                            <VariableRow
                                key={v.id}
                                variable={v}
                                isLast={i === variables.length - 1}
                                saving={saving === v.id}
                                onToggle={() => toggleEnabled(v)}
                                onLabelSave={(label) => updateLabel(v, label)}
                                onDelete={() => deleteVariable(v)}
                            />
                        ))
                    )}
                </div>

                {/* More sections will go here in future */}
                <div style={{
                    backgroundColor: '#FFFFFF', borderRadius: '16px',
                    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
                    padding: '24px',
                }}>
                    <h2 style={{ fontSize: '16px', fontWeight: '700', color: '#1A1A1A', margin: '0 0 8px' }}>
                        More Settings
                    </h2>
                    <p style={{ fontSize: '13px', color: '#888', margin: 0 }}>
                        Campaign configuration, redemption rules, and other settings coming soon.
                    </p>
                </div>

            </main>

            {/* Add Variable Modal */}
            {showAddModal && (
                <div
                    onClick={e => { if (e.target === e.currentTarget) setShowAddModal(false) }}
                    style={{
                        position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)',
                        zIndex: 500, display: 'flex', alignItems: 'center',
                        justifyContent: 'center', padding: '24px',
                    }}
                >
                    <div style={{
                        backgroundColor: '#FFFFFF', borderRadius: '20px',
                        width: '100%', maxWidth: '480px', padding: '32px',
                    }}>
                        <div style={{
                            display: 'flex', justifyContent: 'space-between',
                            alignItems: 'center', marginBottom: '24px',
                        }}>
                            <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#1A1A1A', margin: 0 }}>
                                Add Custom Variable
                            </h2>
                            <button
                                onClick={() => setShowAddModal(false)}
                                style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#666' }}
                            >
                                ✕
                            </button>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <div>
                                <label style={labelStyle}>Variable Key *</label>
                                <input
                                    style={inputStyle}
                                    value={newVar.key}
                                    onChange={e => setNewVar(v => ({ ...v, key: e.target.value.toUpperCase().replace(/\s+/g, '_') }))}
                                    placeholder="e.g. SERVICE_TYPE"
                                />
                                <p style={{ fontSize: '12px', color: '#888', marginTop: '4px' }}>
                                    Auto-uppercased. Used in template rendering.
                                </p>
                            </div>
                            <div>
                                <label style={labelStyle}>Display Label *</label>
                                <input
                                    style={inputStyle}
                                    value={newVar.label}
                                    onChange={e => setNewVar(v => ({ ...v, label: e.target.value }))}
                                    placeholder="e.g. Service Type"
                                />
                            </div>
                            <div>
                                <label style={labelStyle}>Description</label>
                                <input
                                    style={inputStyle}
                                    value={newVar.description}
                                    onChange={e => setNewVar(v => ({ ...v, description: e.target.value }))}
                                    placeholder="e.g. Type of service offered"
                                />
                            </div>

                            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '8px' }}>
                                <button
                                    onClick={() => setShowAddModal(false)}
                                    style={{
                                        padding: '10px 20px', backgroundColor: '#F0F0F0', color: '#444',
                                        border: 'none', borderRadius: '8px', fontSize: '14px',
                                        fontWeight: '600', cursor: 'pointer',
                                    }}
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleAddVariable}
                                    disabled={adding}
                                    style={{
                                        padding: '10px 24px',
                                        backgroundColor: adding ? '#93C5E8' : '#0074BD',
                                        color: '#FFFFFF', border: 'none', borderRadius: '8px',
                                        fontSize: '14px', fontWeight: '600',
                                        cursor: adding ? 'not-allowed' : 'pointer',
                                    }}
                                >
                                    {adding ? 'Adding...' : 'Add Variable'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

function VariableRow({
    variable, isLast, saving, onToggle, onLabelSave, onDelete,
}: {
    variable: VariableConfig
    isLast: boolean
    saving: boolean
    onToggle: () => void
    onLabelSave: (label: string) => void
    onDelete: () => void
}) {
    const [editingLabel, setEditingLabel] = useState(false)
    const [labelValue, setLabelValue] = useState(variable.label)

    return (
        <div style={{
            display: 'flex', alignItems: 'center', gap: '16px',
            padding: '16px 24px',
            borderBottom: isLast ? 'none' : '1px solid #F5F5F5',
            opacity: variable.is_enabled ? 1 : 0.5,
            transition: 'opacity 0.2s',
        }}>
            {/* Enable/Disable Toggle */}
            <div
                onClick={onToggle}
                style={{
                    width: '40px', height: '22px', borderRadius: '100px',
                    backgroundColor: variable.is_enabled ? '#0074BD' : '#CCCCCC',
                    cursor: saving ? 'not-allowed' : 'pointer',
                    position: 'relative', transition: 'background-color 0.2s', flexShrink: 0,
                }}
            >
                <div style={{
                    position: 'absolute', top: '2px',
                    left: variable.is_enabled ? '20px' : '2px',
                    width: '18px', height: '18px', borderRadius: '50%',
                    backgroundColor: '#FFFFFF', transition: 'left 0.2s',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                }} />
            </div>

            {/* Key Badge */}
            <span style={{
                fontSize: '11px', fontFamily: 'monospace', fontWeight: '600',
                color: '#162860', backgroundColor: '#EEF2FF',
                padding: '4px 10px', borderRadius: '6px',
                whiteSpace: 'nowrap', flexShrink: 0,
            }}>
                {variable.key}
            </span>

            {/* Label — editable */}
            <div style={{ flex: 1 }}>
                {editingLabel ? (
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <input
                            value={labelValue}
                            onChange={e => setLabelValue(e.target.value)}
                            style={{
                                ...inputStyle, padding: '6px 10px', fontSize: '13px', flex: 1,
                            }}
                            autoFocus
                        />
                        <button
                            onClick={() => { onLabelSave(labelValue); setEditingLabel(false) }}
                            style={{
                                padding: '6px 12px', backgroundColor: '#0074BD', color: '#FFF',
                                border: 'none', borderRadius: '6px', fontSize: '12px',
                                fontWeight: '600', cursor: 'pointer',
                            }}
                        >
                            Save
                        </button>
                        <button
                            onClick={() => { setLabelValue(variable.label); setEditingLabel(false) }}
                            style={{
                                padding: '6px 12px', backgroundColor: '#F0F0F0', color: '#444',
                                border: 'none', borderRadius: '6px', fontSize: '12px',
                                fontWeight: '600', cursor: 'pointer',
                            }}
                        >
                            Cancel
                        </button>
                    </div>
                ) : (
                    <div>
                        <p style={{ fontSize: '14px', fontWeight: '600', color: '#1A1A1A', margin: 0 }}>
                            {variable.label}
                            <span
                                onClick={() => setEditingLabel(true)}
                                style={{
                                    fontSize: '11px', color: '#0074BD', marginLeft: '8px',
                                    cursor: 'pointer', fontWeight: '400',
                                }}
                            >
                                rename
                            </span>
                        </p>
                        {variable.description && (
                            <p style={{ fontSize: '12px', color: '#666', margin: '2px 0 0' }}>
                                {variable.description}
                            </p>
                        )}
                    </div>
                )}
            </div>

            {/* System badge or delete */}
            {variable.is_system ? (
                <span style={{
                    fontSize: '11px', color: '#888', backgroundColor: '#F5F5F5',
                    padding: '3px 8px', borderRadius: '6px', whiteSpace: 'nowrap', flexShrink: 0,
                }}>
                    system
                </span>
            ) : (
                <button
                    onClick={onDelete}
                    style={{
                        padding: '5px 10px', backgroundColor: '#FFF0F0', color: '#D0021B',
                        border: 'none', borderRadius: '6px', fontSize: '12px',
                        fontWeight: '500', cursor: 'pointer', flexShrink: 0,
                    }}
                >
                    Delete
                </button>
            )}
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