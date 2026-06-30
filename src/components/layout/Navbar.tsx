'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { loadPermissionsForRole, checkPermission, PermissionsMap } from '@/lib/permissions'
import autoversaLogo from '@/assets/AutoVersa_logo_fav.png'

const ALL_NAV_ITEMS = [
    { label: 'Dashboard', href: '/dashboard', resource: 'page:dashboard' },
    { label: 'Coupons', href: '/coupons', resource: 'page:coupons' },
    { label: 'Customers', href: '/customers', resource: 'page:customers' },
    { label: 'Appointments', href: '/appointments', resource: 'page:appointments' },
    { label: 'Offers', href: '/offers', resource: 'page:offers' },
    { label: 'Reports', href: '/reporting', resource: 'page:reporting' },
]

const ADMIN_DROPDOWN = [
    { label: 'Users', href: '/users', resource: 'page:users' },
    { label: 'Settings', href: '/admin/settings', resource: 'page:admin' },
]

export default function Navbar() {
    const router = useRouter()
    const pathname = usePathname()
    const supabase = createClient()

    const [openDropdown, setOpenDropdown] = useState<string | null>(null)
    const [role, setRole] = useState<string>('')
    const [permissions, setPermissions] = useState<PermissionsMap>({})
    const [permissionsLoaded, setPermissionsLoaded] = useState(false)
    const closeDropdownTimer = useRef<NodeJS.Timeout | null>(null)

    useEffect(() => {
        async function init() {
            try {
                const { data: { user } } = await supabase.auth.getUser()
                if (!user) return

                const cacheKey = `navbar_perms_${user.id}`
                let cachedData: { role: string; permissions: PermissionsMap } | null = null

                try {
                    const cached = sessionStorage.getItem(cacheKey)
                    if (cached) {
                        cachedData = JSON.parse(cached)
                    }
                } catch (e) {
                    console.warn('Error reading from sessionStorage:', e)
                }

                if (cachedData) {
                    setRole(cachedData.role)
                    setPermissions(cachedData.permissions)
                    setPermissionsLoaded(true)
                    return
                }

                const { data: profile } = await supabase
                    .from('profiles')
                    .select('user_role')
                    .eq('id', user.id)
                    .single()
                if (!profile) return

                const r = profile.user_role
                setRole(r)

                const perms = await loadPermissionsForRole(r)
                setPermissions(perms)
                setPermissionsLoaded(true)

                try {
                    sessionStorage.setItem(cacheKey, JSON.stringify({ role: r, permissions: perms }))
                } catch (e) {
                    console.warn('Error writing to sessionStorage:', e)
                }
            } catch (error) {
                console.error('Error in Navbar init:', error)
            }
        }
        init()
    }, [])

    async function handleSignOut() {
        try {
            const { data: { user } } = await supabase.auth.getUser()
            if (user) {
                sessionStorage.removeItem(`navbar_perms_${user.id}`)
            }
        } catch (e) {
            console.warn('Error clearing sessionStorage:', e)
        }
        await supabase.auth.signOut()
        router.push('/login')
        router.refresh()
    }

    function isActive(href: string) {
        return pathname === href || pathname.startsWith(href + '/')
    }

    function canSee(resource: string) {
        return checkPermission(permissions, role, resource, 'view')
    }

    const visibleNavItems = permissionsLoaded ? ALL_NAV_ITEMS.filter(item => canSee(item.resource)) : []
    const visibleAdminItems = permissionsLoaded ? ADMIN_DROPDOWN.filter(item => canSee(item.resource)) : []
    const showAdminDropdown = permissionsLoaded && (role === 'ADMIN' || visibleAdminItems.length > 0)

    function navBtnStyle(active: boolean): React.CSSProperties {
        return {
            padding: '8px 14px',
            borderRadius: '100px',
            border: 'none',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: active ? 600 : 400,
            background: active
                ? 'linear-gradient(135deg, rgba(0,116,189,0.9), rgba(22,40,96,0.8))'
                : 'transparent',
            color: '#FFFFFF',
            whiteSpace: 'nowrap' as const,
            transition: 'all 0.2s',
            letterSpacing: '0.01em',
            boxShadow: active ? '0 2px 8px rgba(0,116,189,0.4)' : 'none',
        }
    }

    function dropdownItemStyle(active: boolean): React.CSSProperties {
        return {
            display: 'block',
            width: '100%',
            padding: '10px 14px',
            borderRadius: '12px',
            border: 'none',
            cursor: 'pointer',
            fontSize: '14px',
            textAlign: 'left' as const,
            background: active ? 'rgba(0,116,189,0.7)' : 'transparent',
            color: '#FFFFFF',
            fontWeight: active ? 600 : 400,
            transition: 'all 0.15s',
            whiteSpace: 'nowrap' as const,
        }
    }

    return (
        <div style={{
            position: 'sticky',
            top: '16px',
            zIndex: 100,
            display: 'flex',
            justifyContent: 'center',
            padding: '0 24px',
            marginBottom: '32px',
        }}>
            <div style={{
                width: '100%',
                borderRadius: '100px',
                padding: '1.5px',
                background: 'linear-gradient(135deg, rgba(0,116,189,0.8) 0%, rgba(255,255,255,0.2) 40%, rgba(208,2,27,0.6) 100%)',
                boxShadow: '0 8px 32px rgba(22,40,96,0.35), 0 2px 8px rgba(0,116,189,0.2)',
            }}>
                <nav style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    width: '100%',
                    padding: '9px 16px',
                    borderRadius: '100px',
                    gap: '8px',
                    background: 'linear-gradient(135deg, rgba(22,40,96,0.88) 0%, rgba(0,116,189,0.65) 50%, rgba(22,40,96,0.82) 100%)',
                    backdropFilter: 'blur(24px) saturate(180%)',
                    WebkitBackdropFilter: 'blur(24px) saturate(180%)',
                    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.1), inset 0 -1px 0 rgba(208,2,27,0.1)',
                }}>

                    <img
                        src={autoversaLogo.src}
                        alt="AutoVersa"
                        onClick={() => router.push('/dashboard')}
                        style={{ height: '32px', objectFit: 'contain', cursor: 'pointer', flexShrink: 0, borderRadius: '6px' }}
                    />

                    {/* Nav items — only render after permissions are loaded */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '2px', flex: 1, justifyContent: 'center' }}>
                        {!permissionsLoaded ? (
                            // Loading skeleton — subtle shimmer pills to prevent layout shift
                            Array.from({ length: 4 }).map((_, i) => (
                                <div key={i} style={{
                                    width: `${60 + i * 10}px`, height: '34px',
                                    borderRadius: '100px',
                                    backgroundColor: 'rgba(255,255,255,0.08)',
                                    animation: 'navPulse 1.2s ease-in-out infinite',
                                    animationDelay: `${i * 0.1}s`,
                                }} />
                            ))
                        ) : (
                            <>
                                {visibleNavItems.map(item => (
                                    <button
                                        key={item.label}
                                        onClick={() => router.push(item.href)}
                                        style={navBtnStyle(isActive(item.href))}
                                        onMouseEnter={e => {
                                            if (!isActive(item.href))
                                                (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.12)'
                                        }}
                                        onMouseLeave={e => {
                                            if (!isActive(item.href))
                                                (e.currentTarget as HTMLButtonElement).style.background = 'transparent'
                                        }}
                                    >
                                        {item.label}
                                    </button>
                                ))}

                                {showAdminDropdown && (
                                    <div
                                        style={{ position: 'relative' }}
                                        onMouseEnter={() => {
                                            if (closeDropdownTimer.current) clearTimeout(closeDropdownTimer.current)
                                            setOpenDropdown('admin')
                                        }}
                                        onMouseLeave={() => {
                                            closeDropdownTimer.current = setTimeout(() => setOpenDropdown(null), 200)
                                        }}
                                    >
                                        <button
                                            style={{
                                                ...navBtnStyle(visibleAdminItems.some(c => isActive(c.href))),
                                                display: 'flex', alignItems: 'center', gap: '6px',
                                            }}
                                            onMouseEnter={e => {
                                                if (!visibleAdminItems.some(c => isActive(c.href)))
                                                    (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.12)'
                                            }}
                                            onMouseLeave={e => {
                                                if (!visibleAdminItems.some(c => isActive(c.href)))
                                                    (e.currentTarget as HTMLButtonElement).style.background = 'transparent'
                                            }}
                                        >
                                            Admin
                                            <span style={{ fontSize: '9px', opacity: 0.7 }}>▼</span>
                                        </button>

                                        {openDropdown === 'admin' && (
                                            <div
                                                style={{
                                                    position: 'absolute',
                                                    top: 'calc(100% + 8px)',
                                                    left: '50%',
                                                    transform: 'translateX(-50%)',
                                                    borderRadius: '20px',
                                                    padding: '8px',
                                                    minWidth: '180px',
                                                    background: 'linear-gradient(160deg, rgba(22,40,96,0.92) 0%, rgba(0,116,189,0.7) 100%)',
                                                    backdropFilter: 'blur(24px) saturate(180%)',
                                                    WebkitBackdropFilter: 'blur(24px) saturate(180%)',
                                                    border: '1px solid rgba(255,255,255,0.12)',
                                                    boxShadow: '0 8px 32px rgba(22,40,96,0.4), 0 2px 8px rgba(0,116,189,0.2)',
                                                    zIndex: 200,
                                                }}
                                                onMouseEnter={() => {
                                                    if (closeDropdownTimer.current) clearTimeout(closeDropdownTimer.current)
                                                }}
                                                onMouseLeave={() => {
                                                    closeDropdownTimer.current = setTimeout(() => setOpenDropdown(null), 200)
                                                }}
                                            >
                                                {(role === 'ADMIN' ? ADMIN_DROPDOWN : visibleAdminItems).map(child => (
                                                    <button
                                                        key={child.href}
                                                        onClick={() => { router.push(child.href); setOpenDropdown(null) }}
                                                        style={dropdownItemStyle(isActive(child.href))}
                                                        onMouseEnter={e => {
                                                            if (!isActive(child.href))
                                                                (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.12)'
                                                        }}
                                                        onMouseLeave={e => {
                                                            if (!isActive(child.href))
                                                                (e.currentTarget as HTMLButtonElement).style.background = isActive(child.href) ? 'rgba(0,116,189,0.7)' : 'transparent'
                                                        }}
                                                    >
                                                        {child.label}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </>
                        )}
                    </div>

                    <button
                        onClick={handleSignOut}
                        style={{
                            padding: '8px 16px',
                            borderRadius: '100px',
                            border: '1px solid rgba(255,255,255,0.2)',
                            cursor: 'pointer',
                            fontSize: '13px',
                            fontWeight: 500,
                            background: 'rgba(255,255,255,0.05)',
                            color: '#FFFFFF',
                            whiteSpace: 'nowrap',
                            flexShrink: 0,
                            transition: 'all 0.2s',
                            backdropFilter: 'blur(8px)',
                        }}
                        onMouseEnter={e => {
                            e.currentTarget.style.borderColor = 'rgba(208,2,27,0.6)'
                            e.currentTarget.style.background = 'rgba(208,2,27,0.12)'
                            e.currentTarget.style.boxShadow = '0 0 12px rgba(208,2,27,0.2)'
                        }}
                        onMouseLeave={e => {
                            e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)'
                            e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
                            e.currentTarget.style.boxShadow = 'none'
                        }}
                    >
                        Sign out
                    </button>
                </nav>
            </div>
            <style>{`
                @keyframes navPulse {
                    0%, 100% { opacity: 0.4; }
                    50% { opacity: 0.8; }
                }
            `}</style>
        </div>
    )
}