'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Navbar from '@/components/layout/Navbar'
import Breadcrumb from '@/components/layout/Breadcrumb'
import { loadPermissionsForRole, checkPermission, PERMISSIONS_REGISTRY } from '@/lib/permissions'

// ─── Types ────────────────────────────────────────────────────────────────────

interface UserProfile {
  id: string
  full_name: string | null
  email: string | null
  user_role: string
  advisor_code: string | null
  is_active: boolean | null
  created_at: string | null
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ROLES = [
  'SERVICE_ADVISOR',
  'BMW_SERVICE_ADVISOR',
  'RECEPTIONIST',
  'MANAGER',
  'ASSISTANT_GENERAL_MANAGER',
  'CEO',
]

const ROLE_LABELS: Record<string, string> = {
  SERVICE_ADVISOR: 'Service Advisor',
  BMW_SERVICE_ADVISOR: 'BMW Service Advisor',
  MANAGER: 'Manager',
  ASSISTANT_GENERAL_MANAGER: 'AGM',
  CEO: 'CEO',
  RECEPTIONIST: 'Receptionist',
  ADMIN: 'Admin',
}

const ROLE_COLORS: Record<string, { bg: string; color: string; activeBg: string; activeColor: string }> = {
  SERVICE_ADVISOR: { bg: '#F0F0F0', color: '#666', activeBg: '#162860', activeColor: '#FFFFFF' },
  BMW_SERVICE_ADVISOR: { bg: '#F0F0F0', color: '#666', activeBg: '#0074BD', activeColor: '#FFFFFF' },
  RECEPTIONIST: { bg: '#F0F0F0', color: '#666', activeBg: '#7c3aed', activeColor: '#FFFFFF' },
  MANAGER: { bg: '#F0F0F0', color: '#666', activeBg: '#16a34a', activeColor: '#FFFFFF' },
  ASSISTANT_GENERAL_MANAGER: { bg: '#F0F0F0', color: '#666', activeBg: '#f59e0b', activeColor: '#FFFFFF' },
  CEO: { bg: '#F0F0F0', color: '#666', activeBg: '#D0021B', activeColor: '#FFFFFF' },
}

type TabType = 'users' | 'permissions'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function isAdvisorRole(role: string) {
  return role === 'SERVICE_ADVISOR' || role === 'BMW_SERVICE_ADVISOR'
}

function generateAdvisorCode(existingCodes: string[]): string {
  const nums = existingCodes
    .filter(c => c && /^SA\d+$/.test(c))
    .map(c => parseInt(c.replace('SA', ''), 10))
    .filter(n => !isNaN(n))
  const next = nums.length > 0 ? Math.max(...nums) + 1 : 1
  return `SA${String(next).padStart(3, '0')}`
}

function buildDefaultPermMap(): Record<string, boolean> {
  const map: Record<string, boolean> = {}
  PERMISSIONS_REGISTRY.forEach(page => {
    map[page.resource + '||view'] = false
    page.actions.forEach(a => { map[a.resource + '||action'] = false })
  })
  return map
}

// ─── Checkbox component ───────────────────────────────────────────────────────

function PermCheckbox({ checked, disabled, size = 20 }: { checked: boolean; disabled?: boolean; size?: number }) {
  return (
    <div style={{
      width: `${size}px`, height: `${size}px`,
      borderRadius: size > 16 ? '6px' : '4px',
      flexShrink: 0,
      border: `2px solid ${checked && !disabled ? '#0074BD' : disabled ? '#E0E0E0' : '#CCC'}`,
      backgroundColor: checked && !disabled ? '#0074BD' : 'transparent',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      transition: 'all 0.15s',
    }}>
      {checked && !disabled && (
        <span style={{ color: '#FFFFFF', fontSize: size > 16 ? '12px' : '10px', fontWeight: '700', lineHeight: 1 }}>✓</span>
      )}
      {disabled && (
        <span style={{ color: '#CCC', fontSize: size > 16 ? '12px' : '10px', fontWeight: '700', lineHeight: 1 }}>—</span>
      )}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function UsersPage() {
  const router = useRouter()
  const supabase = createClient()

  const [tab, setTab] = useState<TabType>('users')
  const [users, setUsers] = useState<UserProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})

  // Permissions tab
  const [selectedRole, setSelectedRole] = useState<string>(ROLES[0])
  const [permissions, setPermissions] = useState<Record<string, boolean>>(buildDefaultPermMap())
  const [savedPermissions, setSavedPermissions] = useState<Record<string, boolean>>(buildDefaultPermMap())
  const [permSaving, setPermSaving] = useState(false)
  const [permLoading, setPermLoading] = useState(false)

  // Edit state per user
  const [editingRole, setEditingRole] = useState<Record<string, string>>({})
  const [editingCode, setEditingCode] = useState<Record<string, string>>({})

  useEffect(() => { init() }, [])
  useEffect(() => { loadPermissions(selectedRole) }, [selectedRole])

  function showToast(message: string, type: 'success' | 'error' = 'success') {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3500)
  }

  async function init() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    const { data: profile } = await supabase
      .from('profiles').select('user_role, is_active').eq('id', user.id).single()

    if (profile?.is_active === false) {
      await supabase.auth.signOut()
      router.push('/login')
      return
    }
    if (profile?.user_role !== 'ADMIN') { router.push('/dashboard'); return }

    await loadUsers()
    setLoading(false)
  }

  async function loadUsers() {
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, email, user_role, advisor_code, is_active, created_at')
      .order('created_at', { ascending: false })
    if (data) setUsers(data)
  }

  async function loadPermissions(role: string) {
    setPermLoading(true)
    const { data } = await supabase
      .from('role_permissions')
      .select('resource, action, is_allowed')
      .eq('role', role)

    const map = buildDefaultPermMap()
      ; (data || []).forEach((p: any) => {
        map[p.resource + '||' + p.action] = p.is_allowed
      })
    setPermissions({ ...map })
    setSavedPermissions({ ...map })
    setPermLoading(false)
  }

  // Check if there are unsaved changes
  const hasUnsavedChanges = Object.keys(permissions).some(
    key => permissions[key] !== savedPermissions[key]
  )

  const changedCount = Object.keys(permissions).filter(
    key => permissions[key] !== savedPermissions[key]
  ).length

  async function savePermissions() {
    setPermSaving(true)
    await supabase.from('role_permissions').delete().eq('role', selectedRole)

    const rows: any[] = []
    PERMISSIONS_REGISTRY.forEach(page => {
      rows.push({ role: selectedRole, resource: page.resource, action: 'view', is_allowed: permissions[page.resource + '||view'] ?? false })
      page.actions.forEach(a => {
        rows.push({ role: selectedRole, resource: a.resource, action: 'action', is_allowed: permissions[a.resource + '||action'] ?? false })
      })
    })

    const { error } = await supabase.from('role_permissions').insert(rows)
    if (error) {
      showToast('Failed to save permissions', 'error')
    } else {
      setSavedPermissions({ ...permissions })
      showToast('Permissions saved successfully')
    }
    setPermSaving(false)
  }

  function togglePageAccess(pageResource: string) {
    const key = pageResource + '||view'
    const newValue = !permissions[key]
    const page = PERMISSIONS_REGISTRY.find(p => p.resource === pageResource)
    if (!page) return
    const updates: Record<string, boolean> = { [key]: newValue }
    if (!newValue) {
      page.actions.forEach(a => { updates[a.resource + '||action'] = false })
    }
    setPermissions(prev => ({ ...prev, ...updates }))
  }

  function toggleAction(resource: string) {
    const key = resource + '||action'
    setPermissions(prev => ({ ...prev, [key]: !prev[key] }))
  }

  function resetChanges() {
    setPermissions({ ...savedPermissions })
  }

  async function saveUserRole(userId: string) {
    const newRole = editingRole[userId]
    if (!newRole) return
    setSaving(userId + '_role')
    const updates: any = { user_role: newRole }
    if (isAdvisorRole(newRole)) {
      const existingCodes = users.map(u => u.advisor_code).filter(Boolean) as string[]
      const user = users.find(u => u.id === userId)
      if (!user?.advisor_code) {
        updates.advisor_code = generateAdvisorCode(existingCodes)
        setEditingCode(prev => ({ ...prev, [userId]: updates.advisor_code }))
      }
    } else {
      updates.advisor_code = null
    }
    const { error } = await supabase.from('profiles').update(updates).eq('id', userId)
    if (error) { showToast('Failed to update role', 'error') } else { showToast('Role updated'); await loadUsers() }
    setSaving(null)
  }

  async function saveAdvisorCode(userId: string) {
    const code = editingCode[userId]?.trim()
    if (!code) return
    if (!/^[A-Z]{2}\d{3}$/.test(code)) {
      setErrors(prev => ({ ...prev, [userId]: 'Advisor code must be 2 letters followed by 3 digits (e.g. SA001)' }))
      return
    }
    setErrors(prev => { const copy = { ...prev }; delete copy[userId]; return copy })
    const duplicate = users.find(u => u.id !== userId && u.advisor_code === code)
    if (duplicate) { showToast(`${code} already assigned to ${duplicate.full_name}`, 'error'); return }
    setSaving(userId + '_code')
    const { error } = await supabase.from('profiles').update({ advisor_code: code }).eq('id', userId)
    if (error) { showToast('Failed to update code', 'error') } else { showToast('Advisor code updated'); await loadUsers() }
    setSaving(null)
  }

  async function toggleUserActive(user: UserProfile) {
    setSaving(user.id + '_active')
    const { error } = await supabase.from('profiles').update({ is_active: !user.is_active }).eq('id', user.id)
    if (error) { showToast('Failed to update status', 'error') } else {
      showToast(!user.is_active ? `${user.full_name} activated` : `${user.full_name} deactivated`)
      await loadUsers()
    }
    setSaving(null)
  }

  // Summary counts
  const totalPages = PERMISSIONS_REGISTRY.length
  const totalActions = PERMISSIONS_REGISTRY.reduce((acc, p) => acc + p.actions.length, 0)
  const enabledPages = PERMISSIONS_REGISTRY.filter(p => permissions[p.resource + '||view']).length
  const enabledActions = PERMISSIONS_REGISTRY.flatMap(p => p.actions).filter(a => permissions[a.resource + '||action']).length

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#F7F7F7', paddingTop: '16px' }}>
      <style>{`
        @keyframes pulse   { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
        @keyframes slideIn { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }
        .user-row:hover { background-color: #FAFBFF !important; }
        .perm-page:hover { background-color: #F5F9FF !important; }
        .perm-action:hover { background-color: #F9FBFF !important; }
      `}</style>

      {toast && (
        <div style={{ position: 'fixed', top: '24px', right: '24px', zIndex: 2000, backgroundColor: toast.type === 'success' ? '#162860' : '#D0021B', color: '#FFFFFF', padding: '14px 20px', borderRadius: '12px', fontSize: '14px', fontWeight: '500', boxShadow: '0 4px 16px rgba(0,0,0,0.2)', animation: 'slideIn 0.2s ease' }}>
          {toast.message}
        </div>
      )}

      <Navbar />

      <main style={{ padding: '0 32px 48px' }}>
        <Breadcrumb items={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Users & Permissions' }]} />

        <div style={{ marginBottom: '28px' }}>
          <h1 style={{ fontSize: '22px', fontWeight: '700', color: '#1A1A1A', margin: 0 }}>Users & Permissions</h1>
          <p style={{ color: '#666', fontSize: '14px', marginTop: '4px' }}>Manage user roles, advisor codes, and role-based access control.</p>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '4px', marginBottom: '24px', backgroundColor: '#FFFFFF', padding: '6px', borderRadius: '12px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', width: 'fit-content' }}>
          {(['users', 'permissions'] as TabType[]).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{ padding: '8px 20px', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: '600', cursor: 'pointer', backgroundColor: tab === t ? '#162860' : 'transparent', color: tab === t ? '#FFFFFF' : '#666', transition: 'all 0.15s', position: 'relative' }}>
              {t === 'users' ? 'Users' : 'Page & Action Permissions'}
              {t === 'permissions' && hasUnsavedChanges && (
                <span style={{ position: 'absolute', top: '6px', right: '6px', width: '7px', height: '7px', borderRadius: '50%', backgroundColor: '#f59e0b', border: '1.5px solid #FFFFFF' }} />
              )}
            </button>
          ))}
        </div>

        {/* ── USERS TAB ── */}
        {tab === 'users' && (
          <div style={{ backgroundColor: '#FFFFFF', borderRadius: '16px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1.4fr 1fr 1fr 0.8fr 180px', padding: '12px 20px', backgroundColor: '#F7F7F7', borderBottom: '1px solid #EEEEEE' }}>
              {['Name', 'Email', 'Role', 'Advisor Code', 'Status', 'Actions'].map(h => (
                <span key={h} style={{ fontSize: '11px', fontWeight: '700', color: '#666', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</span>
              ))}
            </div>

            {loading ? (
              <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} style={{ height: '52px', backgroundColor: '#F0F0F0', borderRadius: '8px', animation: 'pulse 1.5s ease-in-out infinite' }} />
                ))}
              </div>
            ) : users.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '64px', color: '#666', fontSize: '14px' }}>No users found.</div>
            ) : (
              users.map((user, i) => {
                const currentRole = editingRole[user.id] ?? user.user_role
                const currentCode = editingCode[user.id] ?? (user.advisor_code || '')
                const roleChanged = editingRole[user.id] && editingRole[user.id] !== user.user_role
                const codeChanged = editingCode[user.id] !== undefined && editingCode[user.id] !== (user.advisor_code || '')
                const isSavingRole = saving === user.id + '_role'
                const isSavingCode = saving === user.id + '_code'
                const isSavingActive = saving === user.id + '_active'
                const needsCode = isAdvisorRole(currentRole)
                const isAdminUser = user.user_role === 'ADMIN'

                return (
                  <div key={user.id} className="user-row" style={{ display: 'grid', gridTemplateColumns: '1.6fr 1.4fr 1fr 1fr 0.8fr 180px', padding: '14px 20px', borderBottom: i < users.length - 1 ? '1px solid #F5F5F5' : 'none', alignItems: 'center', backgroundColor: user.is_active ? '#FFFFFF' : '#FAFAFA' }}>
                    <div>
                      <p style={{ fontSize: '13px', fontWeight: '700', color: user.is_active ? '#1A1A1A' : '#999', margin: 0 }}>{user.full_name}</p>
                      <p style={{ fontSize: '11px', color: '#888', margin: '2px 0 0' }}>{formatDate(user.created_at)}</p>
                    </div>
                    <span style={{ fontSize: '12px', color: '#666' }}>{user.email || '—'}</span>
                    <div>
                      {isAdminUser ? (
                        <span style={{ fontSize: '12px', fontWeight: '700', color: '#162860', backgroundColor: '#EEF2FF', padding: '4px 10px', borderRadius: '6px' }}>Admin</span>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <select value={currentRole} onChange={e => setEditingRole(prev => ({ ...prev, [user.id]: e.target.value }))} style={{ padding: '6px 8px', fontSize: '12px', border: `1.5px solid ${roleChanged ? '#0074BD' : '#E0E0E0'}`, borderRadius: '7px', outline: 'none', backgroundColor: '#FFFFFF', color: '#1A1A1A', cursor: 'pointer' }}>
                            {ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                          </select>
                          {roleChanged && (
                            <button onClick={() => saveUserRole(user.id)} disabled={isSavingRole} style={{ padding: '5px 10px', fontSize: '11px', fontWeight: '600', backgroundColor: '#0074BD', color: '#FFFFFF', border: 'none', borderRadius: '6px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                              {isSavingRole ? '...' : 'Save'}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                    <div>
                      {needsCode && !isAdminUser ? (
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <input
                              value={currentCode}
                              onChange={e => {
                                const val = e.target.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase()
                                setEditingCode(prev => ({ ...prev, [user.id]: val }))
                                setErrors(prev => { const copy = { ...prev }; delete copy[user.id]; return copy })
                              }}
                              placeholder="SA001"
                              style={{ width: '70px', padding: '6px 8px', fontSize: '12px', fontFamily: 'monospace', border: `1.5px solid ${codeChanged ? '#0074BD' : '#E0E0E0'}`, borderRadius: '7px', outline: 'none' }}
                            />
                            {codeChanged && (
                              <button onClick={() => saveAdvisorCode(user.id)} disabled={isSavingCode} style={{ padding: '5px 10px', fontSize: '11px', fontWeight: '600', backgroundColor: '#0074BD', color: '#FFFFFF', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>
                                {isSavingCode ? '...' : 'Save'}
                              </button>
                            )}
                          </div>
                          {errors[user.id] && <p style={{ fontSize: '11px', color: '#D0021B', margin: '4px 0 0' }}>{errors[user.id]}</p>}
                        </div>
                      ) : (
                        <span style={{ fontSize: '12px', color: '#888' }}>—</span>
                      )}
                    </div>
                    <span style={{ display: 'inline-block', fontSize: '11px', fontWeight: '600', padding: '4px 10px', borderRadius: '100px', width: 'fit-content', backgroundColor: user.is_active ? '#dcfce7' : '#F0F0F0', color: user.is_active ? '#16a34a' : '#666' }}>
                      {user.is_active ? 'Active' : 'Inactive'}
                    </span>
                    <div>
                      {!isAdminUser ? (
                        <button onClick={() => toggleUserActive(user)} disabled={isSavingActive} style={{ padding: '6px 12px', fontSize: '12px', fontWeight: '600', backgroundColor: user.is_active ? '#fee2e2' : '#dcfce7', color: user.is_active ? '#D0021B' : '#16a34a', border: 'none', borderRadius: '7px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                          {isSavingActive ? '...' : user.is_active ? 'Deactivate' : 'Activate'}
                        </button>
                      ) : (
                        <span style={{ fontSize: '12px', color: '#888', fontStyle: 'italic' }}>Protected</span>
                      )}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        )}

        {/* ── PERMISSIONS TAB ── */}
        {tab === 'permissions' && (
          <div>
            {/* Role selector bar */}
            <div style={{ backgroundColor: '#FFFFFF', borderRadius: '14px', padding: '20px 24px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', marginBottom: '16px' }}>
              <p style={{ fontSize: '12px', fontWeight: '700', color: '#888', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 12px' }}>Select Role to Configure</p>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {ROLES.map(r => {
                  const colors = ROLE_COLORS[r] || { bg: '#F0F0F0', color: '#666', activeBg: '#162860', activeColor: '#FFFFFF' }
                  const isSelected = selectedRole === r
                  return (
                    <button
                      key={r}
                      onClick={() => {
                        if (hasUnsavedChanges) {
                          if (!confirm('You have unsaved changes. Switch role and discard them?')) return
                        }
                        setSelectedRole(r)
                      }}
                      style={{
                        padding: '8px 16px', border: 'none', borderRadius: '9px',
                        fontSize: '13px', fontWeight: '600', cursor: 'pointer',
                        backgroundColor: isSelected ? colors.activeBg : colors.bg,
                        color: isSelected ? colors.activeColor : colors.color,
                        transition: 'all 0.15s',
                        boxShadow: isSelected ? '0 2px 8px rgba(0,0,0,0.15)' : 'none',
                      }}
                    >
                      {ROLE_LABELS[r]}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Summary + save bar */}
            <div style={{
              backgroundColor: hasUnsavedChanges ? '#FFF8E7' : '#FFFFFF',
              borderRadius: '14px', padding: '16px 24px',
              boxShadow: '0 1px 4px rgba(0,0,0,0.06)', marginBottom: '24px',
              border: hasUnsavedChanges ? '1.5px solid #f59e0b' : '1.5px solid transparent',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px',
              transition: 'all 0.2s',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
                <div>
                  <p style={{ fontSize: '13px', fontWeight: '700', color: '#1A1A1A', margin: 0 }}>
                    {ROLE_LABELS[selectedRole]}
                  </p>
                  <p style={{ fontSize: '12px', color: '#666', margin: '2px 0 0' }}>
                    {enabledPages} of {totalPages} pages · {enabledActions} of {totalActions} actions enabled
                  </p>
                </div>
                {hasUnsavedChanges && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', backgroundColor: '#FEF3C7', borderRadius: '8px', border: '1px solid #f59e0b' }}>
                    <span style={{ fontSize: '14px' }}>⚠️</span>
                    <span style={{ fontSize: '12px', fontWeight: '600', color: '#92400e' }}>
                      {changedCount} unsaved change{changedCount !== 1 ? 's' : ''}
                    </span>
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                {hasUnsavedChanges && (
                  <button
                    onClick={resetChanges}
                    style={{ padding: '9px 16px', backgroundColor: '#F0F0F0', color: '#444', border: 'none', borderRadius: '9px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}
                  >
                    Discard
                  </button>
                )}
                <button
                  onClick={savePermissions}
                  disabled={permSaving || !hasUnsavedChanges}
                  style={{
                    padding: '9px 20px',
                    backgroundColor: permSaving ? '#93C5E8' : hasUnsavedChanges ? '#0074BD' : '#E0E0E0',
                    color: hasUnsavedChanges ? '#FFFFFF' : '#999',
                    border: 'none', borderRadius: '9px', fontSize: '13px', fontWeight: '600',
                    cursor: permSaving || !hasUnsavedChanges ? 'not-allowed' : 'pointer',
                    transition: 'all 0.15s',
                  }}
                >
                  {permSaving ? 'Saving…' : 'Save Permissions'}
                </button>
              </div>
            </div>

            {/* Permission cards */}
            {permLoading ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} style={{ height: '72px', backgroundColor: '#E0E0E0', borderRadius: '12px', animation: 'pulse 1.5s ease-in-out infinite' }} />
                ))}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {PERMISSIONS_REGISTRY.map(page => {
                  const pageKey = page.resource + '||view'
                  const pageAllowed = permissions[pageKey] ?? false
                  const enabledActionCount = page.actions.filter(a => permissions[a.resource + '||action']).length
                  const savedPageAllowed = savedPermissions[pageKey] ?? false
                  const pageChanged = pageAllowed !== savedPageAllowed

                  return (
                    <div
                      key={page.resource}
                      style={{
                        backgroundColor: '#FFFFFF',
                        borderRadius: '14px',
                        boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
                        overflow: 'hidden',
                        border: `1.5px solid ${pageChanged ? '#f59e0b' : pageAllowed ? '#0074BD30' : '#E0E0E0'}`,
                      }}
                    >
                      {/* Page header row */}
                      <div
                        className="perm-page"
                        onClick={() => togglePageAccess(page.resource)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '14px',
                          padding: '16px 20px', cursor: 'pointer',
                          backgroundColor: pageAllowed ? '#F0F7FF' : '#FAFAFA',
                          transition: 'background-color 0.15s',
                          userSelect: 'none',
                        }}
                      >
                        <PermCheckbox checked={pageAllowed} size={20} />

                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <p style={{ fontSize: '14px', fontWeight: '700', color: pageAllowed ? '#162860' : '#666', margin: 0 }}>
                              {page.label}
                            </p>
                            {pageChanged && (
                              <span style={{ fontSize: '10px', fontWeight: '700', padding: '2px 6px', borderRadius: '4px', backgroundColor: '#FEF3C7', color: '#92400e' }}>
                                CHANGED
                              </span>
                            )}
                          </div>
                          <p style={{ fontSize: '11px', color: '#AAA', margin: '2px 0 0', fontFamily: 'monospace' }}>{page.resource}</p>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
                          {page.actions.length > 0 && (
                            <span style={{ fontSize: '12px', color: '#888' }}>
                              {enabledActionCount}/{page.actions.length} actions
                            </span>
                          )}
                          <span style={{
                            fontSize: '11px', fontWeight: '700', padding: '4px 12px', borderRadius: '100px',
                            backgroundColor: pageAllowed ? '#dcfce7' : '#F0F0F0',
                            color: pageAllowed ? '#16a34a' : '#999',
                            minWidth: '60px', textAlign: 'center',
                          }}>
                            {pageAllowed ? 'Allowed' : 'Blocked'}
                          </span>
                        </div>
                      </div>

                      {/* Actions */}
                      {page.actions.length > 0 && (
                        <div style={{
                          borderTop: '1px solid #F0F0F0',
                          opacity: pageAllowed ? 1 : 0.4,
                          pointerEvents: pageAllowed ? 'auto' : 'none',
                          backgroundColor: pageAllowed ? '#FFFFFF' : '#F7F7F7',
                        }}>
                          {page.actions.map((action, idx) => {
                            const actionKey = action.resource + '||action'
                            const actionAllowed = permissions[actionKey] ?? false
                            const savedActionAllowed = savedPermissions[actionKey] ?? false
                            const actionChanged = actionAllowed !== savedActionAllowed && pageAllowed

                            return (
                              <div
                                key={action.resource}
                                className="perm-action"
                                onClick={() => pageAllowed && toggleAction(action.resource)}
                                style={{
                                  display: 'flex', alignItems: 'center', gap: '12px',
                                  padding: '11px 20px 11px 52px',
                                  borderBottom: idx < page.actions.length - 1 ? '1px solid #F5F5F5' : 'none',
                                  cursor: pageAllowed ? 'pointer' : 'default',
                                  backgroundColor: actionAllowed && pageAllowed ? '#F7FCFF' : 'transparent',
                                  transition: 'background-color 0.1s',
                                  userSelect: 'none',
                                }}
                              >
                                <PermCheckbox checked={actionAllowed && pageAllowed} disabled={!pageAllowed} size={16} />

                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <p style={{ fontSize: '13px', fontWeight: '500', color: actionAllowed && pageAllowed ? '#1A1A1A' : '#888', margin: 0 }}>
                                      {action.label}
                                    </p>
                                    {actionChanged && (
                                      <span style={{ fontSize: '9px', fontWeight: '700', padding: '1px 5px', borderRadius: '3px', backgroundColor: '#FEF3C7', color: '#92400e' }}>
                                        CHANGED
                                      </span>
                                    )}
                                  </div>
                                  <p style={{ fontSize: '10px', color: '#BBB', margin: '1px 0 0', fontFamily: 'monospace' }}>{action.resource}</p>
                                </div>

                                <span style={{
                                  fontSize: '11px', fontWeight: '600', padding: '2px 10px', borderRadius: '100px',
                                  backgroundColor: actionAllowed && pageAllowed ? '#dcfce7' : '#F0F0F0',
                                  color: actionAllowed && pageAllowed ? '#16a34a' : '#999',
                                  minWidth: '55px', textAlign: 'center', flexShrink: 0,
                                }}>
                                  {actionAllowed && pageAllowed ? 'Allowed' : 'Blocked'}
                                </span>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}

                {/* Info note */}
                <div style={{ padding: '14px 18px', backgroundColor: '#F0F7FF', borderRadius: '10px', border: '1px solid #C7DCFF', display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                  <span style={{ fontSize: '16px', flexShrink: 0 }}>ℹ️</span>
                  <div>
                    <p style={{ fontSize: '12px', fontWeight: '700', color: '#162860', margin: '0 0 2px' }}>How permissions work</p>
                    <p style={{ fontSize: '12px', color: '#444', margin: 0, lineHeight: 1.5 }}>
                      ADMIN always has full access regardless of these settings. Blocking a page automatically disables all its child actions. New pages and actions are automatically reflected here when added to the PERMISSIONS_REGISTRY in lib/permissions.ts — no code changes needed in this UI.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}