'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Navbar from '@/components/layout/Navbar'
import Breadcrumb from '@/components/layout/Breadcrumb'
import { loadPermissionsForRole, checkPermission } from '@/lib/permissions'


interface VariableConfig {
    id: string
    key: string
    label: string
    description: string | null
    is_enabled: boolean | null
    sort_order: number | null
    is_system: boolean | null
}

interface EmirateConfig {
    id: string
    name: string
    code: string
    categories: string[]
    is_enabled: boolean | null
    sort_order: number | null
}

export default function AdminSettingsPage() {
    const router = useRouter()
    const supabase = createClient()

    const [pageLoading, setPageLoading] = useState(true)
    const [userRole, setUserRole] = useState<string | null>(null)
    const [variables, setVariables] = useState<VariableConfig[]>([])
    const [emirates, setEmirates] = useState<EmirateConfig[]>([])
    const [loadingVars, setLoadingVars] = useState(true)
    const [loadingEmirates, setLoadingEmirates] = useState(true)
    const [savingVar, setSavingVar] = useState<string | null>(null)
    const [savingEmirate, setSavingEmirate] = useState<string | null>(null)
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
    const [showAddVarModal, setShowAddVarModal] = useState(false)
    const [newVar, setNewVar] = useState({ key: '', label: '', description: '' })
    const [adding, setAdding] = useState(false)
    const [editingEmirateId, setEditingEmirateId] = useState<string | null>(null)
    const [editingCategories, setEditingCategories] = useState('')

    useEffect(() => {
        init()
    }, [])

    async function init() {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { router.push('/login'); return }

        const [profileResult, _vars, _emirates] = await Promise.all([
            supabase
                .from('profiles')
                .select('user_role, is_active')
                .eq('id', user.id)
                .single<{ user_role: string; is_active: boolean | null }>(),
            loadVariables(),
            loadEmirates()
        ])

        const { data: profileData } = profileResult

        if (!profileData) {
            router.push('/login')
            return
        }

        if (profileData.is_active === false) {
            await supabase.auth.signOut()
            router.push('/login')
            return
        }

        const perms = await loadPermissionsForRole(profileData.user_role)
        if (!checkPermission(perms, profileData.user_role, 'page:admin', 'view')) {
            router.push('/dashboard')
            return
        }

        setUserRole(profileData.user_role)
        setPageLoading(false)
    }

    async function loadVariables() {
        setLoadingVars(true)
        const { data } = await supabase
            .from('admin_variable_config')
            .select('*')
            .order('sort_order', { ascending: true })
        if (data) setVariables(data)
        setLoadingVars(false)
    }

    async function loadEmirates() {
        setLoadingEmirates(true)
        const { data } = await supabase
            .from('emirates_config')
            .select('*')
            .order('sort_order', { ascending: true })
        if (data) setEmirates(data)
        setLoadingEmirates(false)
    }

    function showToast(message: string, type: 'success' | 'error' = 'success') {
        setToast({ message, type })
        setTimeout(() => setToast(null), 3000)
    }

    async function toggleVariable(variable: VariableConfig) {
        setSavingVar(variable.id)
        const { error } = await supabase
            .from('admin_variable_config')
            .update({ is_enabled: !variable.is_enabled })
            .eq('id', variable.id)
        if (error) showToast('Failed to update variable', 'error')
        else showToast(`${variable.label} ${!variable.is_enabled ? 'enabled' : 'disabled'}`)
        setSavingVar(null)
        loadVariables()
    }

    async function updateVariableLabel(variable: VariableConfig, newLabel: string) {
        const { error } = await supabase
            .from('admin_variable_config')
            .update({ label: newLabel })
            .eq('id', variable.id)
        if (error) showToast('Failed to update label', 'error')
        else showToast('Label updated')
        loadVariables()
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

    async function handleAddVariable() {
        if (!newVar.key.trim()) { showToast('Key is required', 'error'); return }
        if (!newVar.label.trim()) { showToast('Label is required', 'error'); return }
        const key = newVar.key.trim().toUpperCase().replace(/\s+/g, '_')
        if (variables.some(v => v.key === key)) { showToast('Variable key already exists', 'error'); return }
        setAdding(true)
        const { error } = await supabase.from('admin_variable_config').insert({
            key,
            label: newVar.label.trim(),
            description: newVar.description.trim() || null,
            is_enabled: true,
            sort_order: variables.length + 1,
            is_system: false,
        })
        if (error) showToast('Failed to add variable', 'error')
        else {
            showToast('Variable added successfully')
            setShowAddVarModal(false)
            setNewVar({ key: '', label: '', description: '' })
            loadVariables()
        }
        setAdding(false)
    }

    async function toggleEmirate(emirate: EmirateConfig) {
        setSavingEmirate(emirate.id)
        const { error } = await supabase
            .from('emirates_config')
            .update({ is_enabled: !emirate.is_enabled })
            .eq('id', emirate.id)
        if (error) showToast('Failed to update emirate', 'error')
        else showToast(`${emirate.name} ${!emirate.is_enabled ? 'enabled' : 'disabled'}`)
        setSavingEmirate(null)
        loadEmirates()
    }

    async function saveEmirateCategories(emirate: EmirateConfig) {
        const cats = editingCategories
            .split(',')
            .map(c => c.trim().toUpperCase())
            .filter(c => c.length > 0)

        if (cats.length === 0) { showToast('At least one category is required', 'error'); return }

        const { error } = await supabase
            .from('emirates_config')
            .update({ categories: cats })
            .eq('id', emirate.id)

        if (error) showToast('Failed to update categories', 'error')
        else {
            showToast(`${emirate.name} categories updated`)
            setEditingEmirateId(null)
            loadEmirates()
        }
    }

    async function addCategoryToEmirate(emirate: EmirateConfig, newCat: string, position?: number) {
        const cat = newCat.trim().toUpperCase()
        if (!cat) return
        if (emirate.categories.includes(cat)) { showToast('Category already exists', 'error'); return }
        const insertAt = position === undefined ? emirate.categories.length : Math.max(0, Math.min(position, emirate.categories.length))
        const updated = [...emirate.categories]
        updated.splice(insertAt, 0, cat)
        const { error } = await supabase
            .from('emirates_config')
            .update({ categories: updated })
            .eq('id', emirate.id)
        if (error) showToast('Failed to add category', 'error')
        else {
            showToast(`${cat} added to ${emirate.name}`)
            loadEmirates()
        }
    }

    async function removeCategoryFromEmirate(emirate: EmirateConfig, catToRemove: string) {
        if (emirate.categories.length <= 1) { showToast('At least one category is required', 'error'); return }
        const updated = emirate.categories.filter(c => c !== catToRemove)
        const { error } = await supabase
            .from('emirates_config')
            .update({ categories: updated })
            .eq('id', emirate.id)
        if (error) showToast('Failed to remove category', 'error')
        else {
            showToast(`${catToRemove} removed from ${emirate.name}`)
            loadEmirates()
        }
    }

    async function reorderEmirateCategories(emirate: EmirateConfig, newOrder: string[]) {
        const { error } = await supabase
            .from('emirates_config')
            .update({ categories: newOrder })
            .eq('id', emirate.id)
        if (error) showToast('Failed to reorder categories', 'error')
        else loadEmirates()
    }

    if (pageLoading) {
        return (
            <div style={{ minHeight: '100vh', backgroundColor: '#F7F7F7', paddingTop: '16px' }}>
                <Navbar />
                <main style={{ padding: '0 32px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '32px' }}>
                        {Array.from({ length: 5 }).map((_, i) => (
                            <div key={i} style={{ height: '56px', backgroundColor: '#E0E0E0', borderRadius: '10px', animation: 'pulse 1.5s ease-in-out infinite' }} />
                        ))}
                    </div>
                </main>
                <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }`}</style>
            </div>
        )
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

                <div style={{ marginBottom: '32px' }}>
                    <h1 style={{ fontSize: '22px', fontWeight: '700', color: '#1A1A1A', margin: 0 }}>
                        {userRole === 'MANAGER' ? 'Plate Configuration' : 'Admin Settings'}
                    </h1>
                    <p style={{ color: '#666666', fontSize: '14px', marginTop: '4px' }}>
                        {userRole === 'MANAGER' ? 'Manage emirates and plate category codes.' : 'Configure app behaviour without touching the codebase.'}
                    </p>
                </div>

                {/* Section 1 — Coupon Print Variables (hidden for MANAGER) */}
                {userRole !== 'MANAGER' && (
                <div style={{
                    backgroundColor: '#FFFFFF', borderRadius: '16px',
                    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
                    overflow: 'hidden', marginBottom: '24px',
                }}>
                    <div style={{
                        padding: '20px 24px', borderBottom: '1px solid #F0F0F0',
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    }}>
                        <div>
                            <h2 style={{ fontSize: '16px', fontWeight: '700', color: '#1A1A1A', margin: 0 }}>
                                Coupon Print Variables
                            </h2>
                            <p style={{ fontSize: '13px', color: '#666', marginTop: '4px' }}>
                                Variables available when configuring what gets printed on a coupon design.
                                Disable to hide from offer creation. System variables cannot be deleted.
                            </p>
                        </div>
                        <button
                            onClick={() => setShowAddVarModal(true)}
                            style={{
                                padding: '9px 18px', backgroundColor: '#0074BD', color: '#FFFFFF',
                                border: 'none', borderRadius: '10px', fontSize: '13px',
                                fontWeight: '600', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
                            }}
                        >
                            + Add Variable
                        </button>
                    </div>

                    {loadingVars ? (
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
                                saving={savingVar === v.id}
                                onToggle={() => toggleVariable(v)}
                                onLabelSave={(label) => updateVariableLabel(v, label)}
                                onDelete={() => deleteVariable(v)}
                            />
                        ))
                    )}
                </div>
                )}

                {/* Section 2 — Emirates Configuration */}
                <div style={{
                    backgroundColor: '#FFFFFF', borderRadius: '16px',
                    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
                    overflow: 'hidden', marginBottom: '24px',
                }}>
                    <div style={{
                        padding: '20px 24px', borderBottom: '1px solid #F0F0F0',
                    }}>
                        <h2 style={{ fontSize: '16px', fontWeight: '700', color: '#1A1A1A', margin: 0 }}>
                            Emirates & Plate Categories
                        </h2>
                        <p style={{ fontSize: '13px', color: '#666', marginTop: '4px' }}>
                            {userRole === 'MANAGER'
                              ? 'Manage plate category codes for each emirate. These control which options appear when creating coupons.'
                              : 'Control which emirates appear in the coupon creation form and manage their plate category codes. Categories are comma-separated.'}
                        </p>
                    </div>

                    {loadingEmirates ? (
                        Array.from({ length: 7 }).map((_, i) => (
                            <div key={i} style={{
                                height: '60px', margin: '8px 24px', backgroundColor: '#F0F0F0',
                                borderRadius: '8px', animation: 'pulse 1.5s ease-in-out infinite',
                            }} />
                        ))
                    ) : (
                        emirates.map((emirate, i) => (
                            <div
                                key={emirate.id}
                                style={{
                                    padding: '16px 24px',
                                    borderBottom: i < emirates.length - 1 ? '1px solid #F5F5F5' : 'none',
                                    opacity: emirate.is_enabled ? 1 : 0.5,
                                    transition: 'opacity 0.2s',
                                }}
                            >
                                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>

                                    {/* Toggle — hidden for MANAGER, view-only status dot shown instead */}
                                    {userRole === 'MANAGER' ? (
                                        <div
                                            title={emirate.is_enabled ? 'Enabled' : 'Disabled'}
                                            style={{
                                                width: '10px', height: '10px', borderRadius: '50%', flexShrink: 0,
                                                backgroundColor: emirate.is_enabled ? '#16a34a' : '#CCCCCC',
                                                marginTop: '6px',
                                            }}
                                        />
                                    ) : (
                                        <div
                                            onClick={() => toggleEmirate(emirate)}
                                            style={{
                                                width: '40px', height: '22px', borderRadius: '100px', flexShrink: 0,
                                                backgroundColor: emirate.is_enabled ? '#0074BD' : '#CCCCCC',
                                                cursor: savingEmirate === emirate.id ? 'not-allowed' : 'pointer',
                                                position: 'relative', transition: 'background-color 0.2s',
                                                marginTop: '2px',
                                            }}
                                        >
                                            <div style={{
                                                position: 'absolute', top: '2px',
                                                left: emirate.is_enabled ? '20px' : '2px',
                                                width: '18px', height: '18px', borderRadius: '50%',
                                                backgroundColor: '#FFFFFF', transition: 'left 0.2s',
                                                boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                                            }} />
                                        </div>
                                    )}

                                    {/* Emirate code badge */}
                                    <span style={{
                                        fontSize: '11px', fontFamily: 'monospace', fontWeight: '600',
                                        color: '#162860', backgroundColor: '#EEF2FF',
                                        padding: '4px 10px', borderRadius: '6px',
                                        whiteSpace: 'nowrap', flexShrink: 0,
                                    }}>
                                        {emirate.code}
                                    </span>

                                    {/* Name + categories */}
                                    <div style={{ flex: 1 }}>
                                        <p style={{ fontSize: '14px', fontWeight: '600', color: '#1A1A1A', margin: '0 0 6px' }}>
                                            {emirate.name}
                                        </p>

                                        <EmirateCategoryEditor
                                            emirate={emirate}
                                            onAdd={(cat, position) => addCategoryToEmirate(emirate, cat, position)}
                                            onRemove={(cat) => removeCategoryFromEmirate(emirate, cat)}
                                            onReorder={(newOrder) => reorderEmirateCategories(emirate, newOrder)}
                                        />
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>

                {/* Section 3 — More Settings placeholder (hidden for MANAGER) */}
                {userRole !== 'MANAGER' && (
                <div style={{
                    backgroundColor: '#FFFFFF', borderRadius: '16px',
                    boxShadow: '0 1px 4px rgba(0,0,0,0.06)', padding: '24px',
                }}>
                    <h2 style={{ fontSize: '16px', fontWeight: '700', color: '#1A1A1A', margin: '0 0 8px' }}>
                        More Settings
                    </h2>
                    <p style={{ fontSize: '13px', color: '#888', margin: 0 }}>
                        Campaign configuration, redemption rules, and other settings coming soon.
                    </p>
                </div>
                )}

            </main>

            {/* Add Variable Modal */}
            {showAddVarModal && (
                <div
                    onClick={e => { if (e.target === e.currentTarget) setShowAddVarModal(false) }}
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
                                onClick={() => setShowAddVarModal(false)}
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
                                    onChange={e => {
                                        let val = e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '');
                                        if (val.length > 100) val = val.slice(0, 100);
                                        setNewVar(v => ({ ...v, key: val }));
                                    }}
                                    placeholder="e.g. SERVICE_TYPE"
                                    maxLength={100}
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
                                    onChange={e => {
                                        let val = e.target.value.replace(/[<>]/g, '');
                                        if (val.length > 100) val = val.slice(0, 100);
                                        setNewVar(v => ({ ...v, label: val }));
                                    }}
                                    onBlur={() => setNewVar(v => ({ ...v, label: v.label.trim() }))}
                                    placeholder="e.g. Service Type"
                                    maxLength={100}
                                />
                            </div>
                            <div>
                                <label style={labelStyle}>Description</label>
                                <input
                                    style={inputStyle}
                                    value={newVar.description}
                                    onChange={e => {
                                        let val = e.target.value.replace(/[<>]/g, '');
                                        if (val.length > 500) val = val.slice(0, 500);
                                        setNewVar(v => ({ ...v, description: val }));
                                    }}
                                    onBlur={() => setNewVar(v => ({ ...v, description: v.description.trim() }))}
                                    placeholder="e.g. Type of service offered"
                                    maxLength={500}
                                />
                            </div>

                            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '8px' }}>
                                <button
                                    onClick={() => setShowAddVarModal(false)}
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

            <span style={{
                fontSize: '11px', fontFamily: 'monospace', fontWeight: '600',
                color: '#162860', backgroundColor: '#EEF2FF',
                padding: '4px 10px', borderRadius: '6px',
                whiteSpace: 'nowrap', flexShrink: 0,
            }}>
                {variable.key}
            </span>

            <div style={{ flex: 1 }}>
                {editingLabel ? (
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <input
                            value={labelValue}
                            onChange={e => {
                                let val = e.target.value.replace(/[<>]/g, '');
                                if (val.length > 100) val = val.slice(0, 100);
                                setLabelValue(val);
                            }}
                            onBlur={() => setLabelValue(labelValue.trim())}
                            style={{ ...inputStyle, padding: '6px 10px', fontSize: '13px', flex: 1 }}
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
                                style={{ fontSize: '11px', color: '#0074BD', marginLeft: '8px', cursor: 'pointer', fontWeight: '400' }}
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

function EmirateCategoryEditor({
    emirate, onAdd, onRemove, onReorder,
}: {
    emirate: EmirateConfig
    onAdd: (cat: string, position?: number) => void
    onRemove: (cat: string) => void
    onReorder: (newOrder: string[]) => void
}) {
    const [newCat, setNewCat] = useState('')
    const [insertPosition, setInsertPosition] = useState<string>('end')
    const [dragIndex, setDragIndex] = useState<number | null>(null)
    const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)

    function handleAdd() {
        if (!newCat.trim()) return
        const position = insertPosition === 'end' ? emirate.categories.length
            : insertPosition === 'start' ? 0
            : emirate.categories.indexOf(insertPosition) + 1
        onAdd(newCat, position)
        setNewCat('')
        setInsertPosition('end')
    }

    function handleDrop(dropIndex: number) {
        if (dragIndex === null || dragIndex === dropIndex) { setDragIndex(null); setDragOverIndex(null); return }
        const updated = [...emirate.categories]
        const [moved] = updated.splice(dragIndex, 1)
        updated.splice(dropIndex, 0, moved)
        onReorder(updated)
        setDragIndex(null)
        setDragOverIndex(null)
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                {emirate.categories.map((cat, idx) => (
                    <span
                        key={cat}
                        draggable
                        onDragStart={() => setDragIndex(idx)}
                        onDragOver={e => { e.preventDefault(); setDragOverIndex(idx) }}
                        onDragLeave={() => setDragOverIndex(prev => prev === idx ? null : prev)}
                        onDrop={() => handleDrop(idx)}
                        onDragEnd={() => { setDragIndex(null); setDragOverIndex(null) }}
                        title="Drag to reorder"
                        style={{
                            display: 'inline-flex', alignItems: 'center', gap: '5px',
                            fontSize: '11px', fontFamily: 'monospace', fontWeight: '600',
                            backgroundColor: dragOverIndex === idx ? '#DCEBFF' : '#F0F0F0', color: '#444',
                            padding: '4px 6px 4px 10px', borderRadius: '100px',
                            cursor: 'grab', opacity: dragIndex === idx ? 0.4 : 1,
                            border: dragOverIndex === idx ? '1.5px dashed #0074BD' : '1.5px solid transparent',
                            transition: 'background-color 0.15s, border-color 0.15s',
                        }}
                    >
                        <span style={{ color: '#AAA', fontSize: '10px' }}>⠿</span>
                        {cat}
                        <span
                            onClick={() => onRemove(cat)}
                            title={`Remove ${cat}`}
                            style={{
                                cursor: 'pointer', width: '16px', height: '16px', borderRadius: '50%',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                backgroundColor: 'rgba(0,0,0,0.08)', fontSize: '11px', lineHeight: 1, color: '#666',
                            }}
                        >
                            ×
                        </span>
                    </span>
                ))}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                {emirate.categories.length > 1 && (
                    <select
                        value={insertPosition}
                        onChange={e => setInsertPosition(e.target.value)}
                        style={{
                            fontSize: '11px', padding: '4px 6px', borderRadius: '6px',
                            border: '1px solid #E0E0E0', color: '#666', backgroundColor: '#FFFFFF',
                            cursor: 'pointer',
                        }}
                    >
                        <option value="start">Insert at start</option>
                        {emirate.categories.map(cat => (
                            <option key={cat} value={cat}>After {cat}</option>
                        ))}
                        <option value="end">Insert at end</option>
                    </select>
                )}
                <input
                    value={newCat}
                    onChange={e => {
                        let val = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '')
                        if (val.length > 10) val = val.slice(0, 10)
                        setNewCat(val)
                    }}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAdd() } }}
                    placeholder="+ add"
                    style={{
                        width: '64px', padding: '4px 8px', fontSize: '11px', fontFamily: 'monospace',
                        border: '1.5px dashed #C7D2FE', borderRadius: '100px', outline: 'none',
                        color: '#1A1A1A', backgroundColor: '#FAFBFF',
                    }}
                />
                {newCat.trim() && (
                    <span
                        onClick={handleAdd}
                        style={{
                            fontSize: '11px',
                            fontWeight: '600',
                            color: '#0074BD',
                            cursor: 'pointer',
                            marginLeft: '4px',
                        }}
                    >
                        add
                    </span>
                )}
            </div>
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
export const dynamic = 'force-dynamic'
