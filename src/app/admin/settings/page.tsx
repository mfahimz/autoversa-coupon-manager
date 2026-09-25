'use client'

import { ChangeEvent, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Navbar from '@/components/layout/Navbar'
import Breadcrumb from '@/components/layout/Breadcrumb'
import { loadPermissionsForRole, checkPermission, PermissionsMap } from '@/lib/permissions'
import { toast } from 'sonner'


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

interface BroadcastSettings {
    message_template: string | null
    image_url: string | null
    image_storage_path: string | null
    wave_min: number
    wave_max: number
    cooldown_min_minutes: number
    cooldown_max_minutes: number
    daily_wave_target: number
    adaptive_enabled: boolean
}

interface ContactUploadPreview {
    file: File
    fileName: string
    year: number
    validCount: number
    invalidCount: number
    duplicateCount: number
    sample: string[]
    currentCount: number
    limit: number
    remaining: number
}

export default function AdminSettingsPage() {
    const router = useRouter()
    const supabase = createClient()

    const [pageLoading, setPageLoading] = useState(true)
    const [userRole, setUserRole] = useState<string | null>(null)
    const [settingsUserId, setSettingsUserId] = useState<string | null>(null)
    const [permissions, setPermissions] = useState<PermissionsMap>({})
    const [variables, setVariables] = useState<VariableConfig[]>([])
    const [emirates, setEmirates] = useState<EmirateConfig[]>([])
    const [loadingVars, setLoadingVars] = useState(true)
    const [loadingEmirates, setLoadingEmirates] = useState(true)
    const [savingVar, setSavingVar] = useState<string | null>(null)
    const [savingEmirate, setSavingEmirate] = useState<string | null>(null)
    const [showAddVarModal, setShowAddVarModal] = useState(false)
    const [newVar, setNewVar] = useState({ key: '', label: '', description: '' })
    const [adding, setAdding] = useState(false)
    const [editingEmirateId, setEditingEmirateId] = useState<string | null>(null)
    const [editingCategories, setEditingCategories] = useState('')
    const [broadcastSettings, setBroadcastSettings] = useState<BroadcastSettings>({ message_template: '', image_url: null, image_storage_path: null, wave_min: 5, wave_max: 8, cooldown_min_minutes: 5, cooldown_max_minutes: 15, daily_wave_target: 20, adaptive_enabled: true })
    const [broadcastTemplate, setBroadcastTemplate] = useState('')
    const [broadcastImageFile, setBroadcastImageFile] = useState<File | null>(null)
    const [broadcastImagePreview, setBroadcastImagePreview] = useState<string | null>(null)
    const [loadingBroadcastSettings, setLoadingBroadcastSettings] = useState(false)
    const [savingBroadcastTemplate, setSavingBroadcastTemplate] = useState(false)
    const [savingBroadcastImage, setSavingBroadcastImage] = useState(false)
    const [waveMin, setWaveMin] = useState('5')
    const [waveMax, setWaveMax] = useState('8')
    const [cooldownMin, setCooldownMin] = useState('5')
    const [cooldownMax, setCooldownMax] = useState('15')
    const [savingThrottle, setSavingThrottle] = useState(false)
    const [dailyWaveTarget, setDailyWaveTarget] = useState('20')
    const [uploadYear, setUploadYear] = useState(String(new Date().getFullYear()))
    const [uploading, setUploading] = useState(false)
    const [contactUploadPreview, setContactUploadPreview] = useState<ContactUploadPreview | null>(null)
    const [importingContacts, setImportingContacts] = useState(false)
    const [overrideWaves, setOverrideWaves] = useState('')
    const [grantingOverride, setGrantingOverride] = useState(false)
    const [currentOverride, setCurrentOverride] = useState<number | null>(null)
    const [savingAdaptive, setSavingAdaptive] = useState(false)
    const [currentHealth, setCurrentHealth] = useState<{ score: number; consecutiveFailures: number } | null>(null)
    const [resettingHealth, setResettingHealth] = useState(false)

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

        setPermissions(perms)
        if (checkPermission(perms, profileData.user_role, 'action:broadcast_settings:manage_template', 'action')) {
            await loadBroadcastSettings()
        }

        setUserRole(profileData.user_role)
        setSettingsUserId(user.id)
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

    async function loadBroadcastSettings() {
        setLoadingBroadcastSettings(true)
        const [settingsResult, sendStateResult] = await Promise.all([
            supabase
                .from('broadcast_settings')
                .select('message_template, image_url, image_storage_path, wave_min, wave_max, cooldown_min_minutes, cooldown_max_minutes, daily_wave_target, adaptive_enabled')
                .eq('id', 1)
                .single(),
            supabase.from('broadcast_send_state').select('daily_override_extra, health_score, consecutive_failures').eq('id', 1).single(),
        ])
        const { data, error } = settingsResult
        if (error) showToast('Failed to load broadcast settings', 'error')
        else if (data) {
            setBroadcastSettings(data)
            setBroadcastTemplate(data.message_template ?? '')
            setBroadcastImagePreview(data.image_url ?? null)
            setWaveMin(String(data.wave_min))
            setWaveMax(String(data.wave_max))
            setCooldownMin(String(data.cooldown_min_minutes))
            setCooldownMax(String(data.cooldown_max_minutes))
            setDailyWaveTarget(String(data.daily_wave_target))
        }
        if (sendStateResult.data) {
            setCurrentOverride(sendStateResult.data.daily_override_extra)
            setCurrentHealth({ score: Number(sendStateResult.data.health_score ?? 60), consecutiveFailures: sendStateResult.data.consecutive_failures ?? 0 })
        }
        setLoadingBroadcastSettings(false)
    }

    async function saveBroadcastTemplate() {
        setSavingBroadcastTemplate(true)
        const { error } = await supabase
            .from('broadcast_settings')
            .update({ message_template: broadcastTemplate.trim(), updated_at: new Date().toISOString(), updated_by: settingsUserId })
            .eq('id', 1)
        if (error) showToast('Failed to save broadcast template', 'error')
        else {
            setBroadcastSettings(current => ({ ...current, message_template: broadcastTemplate.trim() }))
            showToast('Broadcast message template saved')
        }
        setSavingBroadcastTemplate(false)
    }

    async function saveThrottleSettings() {
        const min = Number(waveMin)
        const max = Number(waveMax)
        const cdMin = Number(cooldownMin)
        const cdMax = Number(cooldownMax)
        const dailyTarget = Number(dailyWaveTarget)
        if (!Number.isInteger(min) || !Number.isInteger(max) || min < 1 || min > max) { showToast('Min messages per wave must be ≤ max', 'error'); return }
        if (!Number.isInteger(cdMin) || !Number.isInteger(cdMax) || cdMin < 1 || cdMin > cdMax) { showToast('Min cooldown must be ≤ max cooldown', 'error'); return }
        if (!Number.isInteger(dailyTarget) || dailyTarget < 1) { showToast('Daily wave target must be a positive integer', 'error'); return }
        setSavingThrottle(true)
        const { error } = await supabase
            .from('broadcast_settings')
            .update({ wave_min: min, wave_max: max, cooldown_min_minutes: cdMin, cooldown_max_minutes: cdMax, daily_wave_target: dailyTarget, updated_at: new Date().toISOString(), updated_by: settingsUserId })
            .eq('id', 1)
        if (error) showToast('Failed to save throttle settings', 'error')
        else {
            setBroadcastSettings(current => ({ ...current, wave_min: min, wave_max: max, cooldown_min_minutes: cdMin, cooldown_max_minutes: cdMax, daily_wave_target: dailyTarget }))
            showToast('Throttle settings saved')
        }
        setSavingThrottle(false)
    }

    async function toggleAdaptiveThrottle() {
        const next = !broadcastSettings.adaptive_enabled
        setSavingAdaptive(true)
        const { error } = await supabase
            .from('broadcast_settings')
            .update({ adaptive_enabled: next, updated_at: new Date().toISOString(), updated_by: settingsUserId })
            .eq('id', 1)
        if (error) showToast('Failed to update adaptive throttle', 'error')
        else {
            setBroadcastSettings(current => ({ ...current, adaptive_enabled: next }))
            showToast(next ? 'Adaptive throttle enabled' : 'Adaptive throttle disabled — configured values apply directly')
        }
        setSavingAdaptive(false)
    }

    async function resetHealthScore() {
        if (!window.confirm('Reset the account health score to 60 (neutral)? Do this only after resolving the underlying issue, e.g. a new number or a lifted restriction.')) return
        setResettingHealth(true)
        const { error } = await supabase
            .from('broadcast_send_state')
            .update({ health_score: 60, consecutive_failures: 0, last_health_event: 'manual_reset', updated_at: new Date().toISOString() })
            .eq('id', 1)
        if (error) showToast('Failed to reset health score', 'error')
        else {
            setCurrentHealth({ score: 60, consecutiveFailures: 0 })
            showToast('Health score reset to 60')
        }
        setResettingHealth(false)
    }

    async function grantOverrideWaves() {
        const extra = Number(overrideWaves)
        if (!Number.isInteger(extra) || extra < 1) { showToast('Enter a positive number of extra waves to grant', 'error'); return }
        setGrantingOverride(true)
        const { data: current, error: readError } = await supabase.from('broadcast_send_state').select('daily_override_extra').eq('id', 1).single()
        if (readError) { showToast('Failed to read current override', 'error'); setGrantingOverride(false); return }
        const newOverride = (current?.daily_override_extra ?? 0) + extra
        const { error } = await supabase.from('broadcast_send_state').update({ daily_override_extra: newOverride, updated_at: new Date().toISOString() }).eq('id', 1)
        if (error) showToast('Failed to grant override waves', 'error')
        else {
            setCurrentOverride(newOverride)
            setOverrideWaves('')
            showToast(`Granted ${extra} extra wave${extra === 1 ? '' : 's'} for today`)
        }
        setGrantingOverride(false)
    }

    async function handleContactUpload(event: ChangeEvent<HTMLInputElement>) {
        const file = event.target.files?.[0]
        event.target.value = ''
        if (!file) return
        const year = Number(uploadYear)
        if (!Number.isInteger(year) || year < 1900 || year > 3000) { showToast('Enter a valid year before uploading.', 'error'); return }
        const extension = file.name.split('.').pop()?.toLowerCase()
        if (!extension || !['csv', 'xlsx'].includes(extension)) { showToast('Upload a CSV or XLSX file.', 'error'); return }
        setUploading(true)
        try {
            const formData = new FormData()
            formData.append('file', file)
            formData.append('year', String(year))
            formData.append('mode', 'preview')
            const response = await fetch('/api/broadcast-outreach/upload', { method: 'POST', body: formData })
            const result = await response.json()
            if (!response.ok) throw new Error(result.error ?? 'Unable to parse the contact list.')
            const { validCount, invalidCount, duplicateCount, sample, currentCount, limit, remaining } = result as Omit<ContactUploadPreview, 'file' | 'fileName' | 'year'>
            setContactUploadPreview({ file, fileName: file.name, year, validCount, invalidCount, duplicateCount, sample, currentCount, limit, remaining })
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unable to parse the contact list.'
            showToast(message, 'error')
        } finally { setUploading(false) }
    }

    async function approveContactImport() {
        if (!contactUploadPreview) return
        setImportingContacts(true)
        try {
            const formData = new FormData()
            formData.append('file', contactUploadPreview.file)
            formData.append('year', String(contactUploadPreview.year))
            formData.append('mode', 'import')
            const response = await fetch('/api/broadcast-outreach/upload', { method: 'POST', body: formData })
            const result = await response.json()
            if (!response.ok) throw new Error(result.error ?? 'Unable to import the contact list.')
            const { insertedCount, invalidCount, duplicateCount } = result as { insertedCount: number; invalidCount: number; duplicateCount: number }
            showToast(`${insertedCount} number${insertedCount === 1 ? '' : 's'} imported for year ${contactUploadPreview.year}`)
            if (invalidCount) showToast(`${invalidCount} invalid row${invalidCount === 1 ? '' : 's'} skipped.`, 'error')
            if (duplicateCount) showToast(`${duplicateCount} duplicate row${duplicateCount === 1 ? '' : 's'} skipped.`, 'error')
            setContactUploadPreview(null)
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unable to import the contact list.'
            showToast(message, 'error')
        } finally { setImportingContacts(false) }
    }

    function handleBroadcastImageUpload(event: React.ChangeEvent<HTMLInputElement>) {
        const file = event.target.files?.[0]
        if (!file) return
        if (!file.type.startsWith('image/')) { showToast('Please upload an image file', 'error'); return }
        const url = URL.createObjectURL(file)
        setBroadcastImageFile(file)
        setBroadcastImagePreview(url)
    }

    async function saveBroadcastImage() {
        if (!broadcastImageFile) { showToast('Choose an image first', 'error'); return }
        setSavingBroadcastImage(true)
        const ext = broadcastImageFile.name.split('.').pop()
        const path = `broadcast-outreach/message-image.${ext}`
        const previousPath = broadcastSettings.image_storage_path
        if (previousPath && previousPath !== path) await supabase.storage.from('broadcast-outreach').remove([previousPath])
        await supabase.storage.from('broadcast-outreach').remove([path])
        const { error: uploadError } = await supabase.storage.from('broadcast-outreach').upload(path, broadcastImageFile)
        if (uploadError) {
            showToast('Failed to upload broadcast image', 'error')
            setSavingBroadcastImage(false)
            return
        }
        const { data: urlData } = supabase.storage.from('broadcast-outreach').getPublicUrl(path)
        const { error } = await supabase
            .from('broadcast_settings')
            .update({ image_url: urlData.publicUrl, image_storage_path: path, updated_at: new Date().toISOString(), updated_by: settingsUserId })
            .eq('id', 1)
        if (error) showToast('Image uploaded, but failed to save broadcast settings', 'error')
        else {
            setBroadcastSettings(current => ({ ...current, image_url: urlData.publicUrl, image_storage_path: path }))
            setBroadcastImagePreview(urlData.publicUrl)
            setBroadcastImageFile(null)
            showToast('Broadcast image saved')
        }
        setSavingBroadcastImage(false)
    }

    function showToast(message: string, type: 'success' | 'error' = 'success') {
        if (type === 'success') toast.success(message)
        else toast.error(message)
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

                {/* Section 3 — Broadcast Outreach Settings */}
                {(checkPermission(permissions, userRole || '', 'action:broadcast_settings:manage_template', 'action') || checkPermission(permissions, userRole || '', 'action:broadcast_contacts:upload', 'action')) && (
                <div style={{
                    backgroundColor: '#FFFFFF', borderRadius: '16px',
                    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
                    overflow: 'hidden', marginBottom: '24px',
                }}>
                    <div style={{ padding: '20px 24px', borderBottom: '1px solid #F0F0F0' }}>
                        <h2 style={{ fontSize: '16px', fontWeight: '700', color: '#1A1A1A', margin: 0 }}>Broadcast Outreach Settings</h2>
                        <p style={{ fontSize: '13px', color: '#666', marginTop: '4px' }}>Configure the WhatsApp message, image, contact list, and send throttling used for broadcast outreach.</p>
                    </div>
                    {loadingBroadcastSettings ? (
                        <div style={{ height: '180px', margin: '20px 24px', backgroundColor: '#F0F0F0', borderRadius: '8px', animation: 'pulse 1.5s ease-in-out infinite' }} />
                    ) : (
                        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
                            {checkPermission(permissions, userRole || '', 'action:broadcast_contacts:upload', 'action') && (
                            <div>
                                <label style={labelStyle}>Upload Contacts</label>
                                <p style={{ fontSize: '12px', color: '#666', margin: '0 0 12px' }}>Choose a CSV or XLSX list of mobile numbers for a given year, review the parsed data, then approve the import.</p>
                                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'end' }}>
                                    <div><label style={{ ...labelStyle, fontSize: '12px' }}>Year</label><input type="number" value={uploadYear} onChange={e => setUploadYear(e.target.value)} min="1900" max="3000" style={{ ...inputStyle, width: '160px' }} /></div>
                                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '10px 20px', backgroundColor: uploading || importingContacts ? '#93C5E8' : '#0074BD', color: '#FFF', borderRadius: '8px', fontSize: '13px', fontWeight: '600', cursor: uploading || importingContacts ? 'not-allowed' : 'pointer' }}>
                                        <span>{uploading ? 'Preparing preview…' : 'Choose Contacts (.csv, .xlsx)'}</span>
                                        <input type="file" accept=".csv,.xlsx" style={{ display: 'none' }} onChange={handleContactUpload} disabled={uploading || importingContacts} />
                                    </label>
                                </div>
                                {contactUploadPreview && <div style={{ marginTop: '16px', border: '1px solid #BFDBFE', background: '#F8FBFF', borderRadius: '12px', overflow: 'hidden' }}>
                                    <div style={{ padding: '14px 16px', borderBottom: '1px solid #DBEAFE', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                                        <div><p style={{ color: '#162860', fontSize: '14px', fontWeight: 700, margin: 0 }}>Review contact import</p><p style={{ color: '#5B6B86', fontSize: '12px', margin: '3px 0 0' }}>{contactUploadPreview.fileName} · Year {contactUploadPreview.year}</p></div>
                                        <span style={{ color: '#166534', background: '#DCFCE7', borderRadius: '999px', padding: '5px 9px', fontSize: '12px', fontWeight: 700 }}>{contactUploadPreview.validCount} ready to import</span>
                                    </div>
                                    <div style={{ padding: '14px 16px' }}>
                                        <div style={{ display: 'flex', gap: '18px', flexWrap: 'wrap', color: '#44546F', fontSize: '12px', marginBottom: '12px' }}><span><strong style={{ color: '#1A1A1A' }}>{contactUploadPreview.validCount}</strong> valid numbers</span><span><strong style={{ color: contactUploadPreview.invalidCount ? '#B45309' : '#1A1A1A' }}>{contactUploadPreview.invalidCount}</strong> invalid rows</span><span><strong style={{ color: contactUploadPreview.duplicateCount ? '#B45309' : '#1A1A1A' }}>{contactUploadPreview.duplicateCount}</strong> duplicates skipped</span><span style={{ borderLeft: '1px solid #CBD5E1', paddingLeft: '10px' }}>Capacity: <strong style={{ color: '#1A1A1A' }}>{contactUploadPreview.currentCount.toLocaleString()}</strong> / {contactUploadPreview.limit.toLocaleString()} used · <strong style={{ color: contactUploadPreview.remaining < contactUploadPreview.validCount ? '#DC2626' : '#166534' }}>{contactUploadPreview.remaining.toLocaleString()}</strong> remaining</span></div>
                                        <p style={{ color: '#44546F', fontSize: '12px', fontWeight: 700, margin: '0 0 7px' }}>First {contactUploadPreview.sample.length} numbers</p>
                                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>{contactUploadPreview.sample.map(number => <code key={number} style={{ background: '#EAF2FF', color: '#1E4D8E', borderRadius: '5px', padding: '4px 6px', fontSize: '11px' }}>{number}</code>)}</div>
                                        <div style={{ display: 'flex', gap: '10px', marginTop: '16px', flexWrap: 'wrap' }}><button onClick={approveContactImport} disabled={importingContacts} style={{ padding: '9px 16px', background: importingContacts ? '#93C5E8' : '#0074BD', color: '#FFF', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: importingContacts ? 'not-allowed' : 'pointer' }}>{importingContacts ? 'Importing…' : `Approve & Import ${contactUploadPreview.validCount} Contacts`}</button><button onClick={() => setContactUploadPreview(null)} disabled={importingContacts} style={{ padding: '9px 16px', background: '#FFF', color: '#44546F', border: '1px solid #CBD5E1', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: importingContacts ? 'not-allowed' : 'pointer' }}>Cancel</button></div>
                                    </div>
                                </div>}
                            </div>
                            )}
                            {checkPermission(permissions, userRole || '', 'action:broadcast_settings:manage_template', 'action') && (
                            <>
                            <div style={{ paddingTop: checkPermission(permissions, userRole || '', 'action:broadcast_contacts:upload', 'action') ? '20px' : '0', borderTop: checkPermission(permissions, userRole || '', 'action:broadcast_contacts:upload', 'action') ? '1px solid #F0F0F0' : 'none' }}>
                                <label style={labelStyle}>Message Template</label>
                                <textarea value={broadcastTemplate} onChange={event => setBroadcastTemplate(event.target.value)} placeholder="Write the WhatsApp broadcast message…" rows={6} style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5 }} />
                                <div style={{ marginTop: '10px' }}><button onClick={saveBroadcastTemplate} disabled={savingBroadcastTemplate} style={{ padding: '9px 18px', backgroundColor: savingBroadcastTemplate ? '#93C5E8' : '#0074BD', color: '#FFF', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: '600', cursor: savingBroadcastTemplate ? 'not-allowed' : 'pointer' }}>{savingBroadcastTemplate ? 'Saving…' : 'Save Template'}</button></div>
                            </div>
                            <div style={{ paddingTop: '20px', borderTop: '1px solid #F0F0F0' }}>
                                <label style={labelStyle}>Broadcast Image</label>
                                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '10px 20px', backgroundColor: '#F0F4FF', color: '#162860', borderRadius: '8px', fontSize: '13px', fontWeight: '600', cursor: 'pointer', border: '1.5px dashed #0074BD' }}>
                                    <span>{broadcastImagePreview ? 'Replace Image' : 'Upload Image'}</span>
                                    <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleBroadcastImageUpload} />
                                </label>
                                {broadcastImagePreview && <div style={{ marginTop: '12px' }}><img src={broadcastImagePreview} alt="Broadcast message preview" style={{ display: 'block', maxWidth: '320px', maxHeight: '200px', borderRadius: '10px', border: '1px solid #E0E0E0', objectFit: 'contain' }} /></div>}
                                <div style={{ marginTop: '12px' }}><button onClick={saveBroadcastImage} disabled={!broadcastImageFile || savingBroadcastImage} style={{ padding: '9px 18px', backgroundColor: !broadcastImageFile || savingBroadcastImage ? '#93C5E8' : '#0074BD', color: '#FFF', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: '600', cursor: !broadcastImageFile || savingBroadcastImage ? 'not-allowed' : 'pointer' }}>{savingBroadcastImage ? 'Saving…' : 'Save Image'}</button></div>
                            </div>
                            <div style={{ paddingTop: '20px', borderTop: '1px solid #F0F0F0' }}>
                                <label style={labelStyle}>Send Throttling</label>
                                <p style={{ fontSize: '12px', color: '#666', margin: '0 0 12px' }}>Configure wave batch sizes, intervals, and daily targets.</p>
                                <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap', background: '#F8FBFF', border: '1px solid #BFDBFE', borderRadius: '10px', padding: '12px 14px', marginBottom: '14px' }}>
                                    <label style={{ display: 'flex', gap: '8px', alignItems: 'center', color: '#162860', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
                                        <input type="checkbox" checked={broadcastSettings.adaptive_enabled} onChange={toggleAdaptiveThrottle} disabled={savingAdaptive} />
                                        Adaptive auto-throttle (recommended)
                                    </label>
                                    <span style={{ fontSize: '12px', color: '#44546F' }}>
                                        When on, the values below are ceilings. Live limits scale down automatically from the account health score, warm-up ramp, and the last 7 days of delivery outcomes, then recover as results improve.
                                    </span>
                                    {currentHealth && (
                                        <span style={{ fontSize: '12px', fontWeight: 700, borderRadius: '999px', padding: '5px 10px', color: currentHealth.score >= 60 ? '#166534' : currentHealth.score >= 20 ? '#92400E' : '#991B1B', background: currentHealth.score >= 60 ? '#DCFCE7' : currentHealth.score >= 20 ? '#FEF3C7' : '#FEE2E2' }}>
                                            Health: {Math.round(currentHealth.score)} / 100
                                        </span>
                                    )}
                                    <button onClick={resetHealthScore} disabled={resettingHealth} style={{ padding: '6px 12px', background: '#FFF', color: '#44546F', border: '1px solid #CBD5E1', borderRadius: '7px', fontSize: '12px', fontWeight: 600, cursor: resettingHealth ? 'not-allowed' : 'pointer' }}>
                                        {resettingHealth ? 'Resetting…' : 'Reset Health Score'}
                                    </button>
                                </div>
                                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                                    <div><label style={{ ...labelStyle, fontSize: '12px' }}>Min messages per wave</label><input type="number" min={1} value={waveMin} onChange={e => setWaveMin(e.target.value)} style={{ ...inputStyle, width: '160px' }} /></div>
                                    <div><label style={{ ...labelStyle, fontSize: '12px' }}>Max messages per wave</label><input type="number" min={1} value={waveMax} onChange={e => setWaveMax(e.target.value)} style={{ ...inputStyle, width: '160px' }} /></div>
                                    <div><label style={{ ...labelStyle, fontSize: '12px' }}>Min cooldown (minutes)</label><input type="number" min={1} value={cooldownMin} onChange={e => setCooldownMin(e.target.value)} style={{ ...inputStyle, width: '160px' }} /></div>
                                    <div><label style={{ ...labelStyle, fontSize: '12px' }}>Max cooldown (minutes)</label><input type="number" min={1} value={cooldownMax} onChange={e => setCooldownMax(e.target.value)} style={{ ...inputStyle, width: '160px' }} /></div>
                                    <div><label style={{ ...labelStyle, fontSize: '12px' }}>Daily wave target</label><input type="number" min={1} value={dailyWaveTarget} onChange={e => setDailyWaveTarget(e.target.value)} style={{ ...inputStyle, width: '160px' }} /></div>
                                </div>
                                <p style={{ fontSize: '11px', color: '#888', margin: '8px 0 0' }}>Maximum completed waves allowed per 24-hour period.</p>
                                <div style={{ marginTop: '12px' }}><button onClick={saveThrottleSettings} disabled={savingThrottle} style={{ padding: '9px 18px', backgroundColor: savingThrottle ? '#93C5E8' : '#0074BD', color: '#FFF', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: '600', cursor: savingThrottle ? 'not-allowed' : 'pointer' }}>{savingThrottle ? 'Saving…' : 'Save Throttle Settings'}</button></div>
                            </div>
                            <div style={{ paddingTop: '20px', borderTop: '1px solid #F0F0F0' }}>
                                <label style={labelStyle}>Daily Limit Override</label>
                                <p style={{ fontSize: '12px', color: '#666', margin: '0 0 12px' }}>Grant extra waves for today once the daily target has been hit. Wave counters reset at 12:00 AM UAE time.{currentOverride !== null && currentOverride > 0 ? ` Currently granted: +${currentOverride} wave${currentOverride === 1 ? '' : 's'} today.` : ''}</p>
                                <div style={{ display: 'flex', gap: '12px', alignItems: 'end', flexWrap: 'wrap' }}>
                                    <div><label style={{ ...labelStyle, fontSize: '12px' }}>Extra waves to grant</label><input type="number" min={1} value={overrideWaves} onChange={e => setOverrideWaves(e.target.value)} style={{ ...inputStyle, width: '160px' }} /></div>
                                    <button onClick={grantOverrideWaves} disabled={grantingOverride} style={{ padding: '9px 18px', backgroundColor: grantingOverride ? '#93C5E8' : '#0074BD', color: '#FFF', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: '600', cursor: grantingOverride ? 'not-allowed' : 'pointer' }}>{grantingOverride ? 'Granting…' : 'Grant Override'}</button>
                                </div>
                            </div>
                            </>
                            )}
                        </div>
                    )}
                </div>
                )}

                {/* Section 4 — More Settings placeholder (hidden for MANAGER) */}
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
