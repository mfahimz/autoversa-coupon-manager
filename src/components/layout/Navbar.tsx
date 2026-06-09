'use client'

import { useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const NAV_ITEMS = [
    { label: 'Dashboard', href: '/dashboard' },
    {
        label: 'Coupons',
        children: [
            { label: 'Create Coupon', href: '/create-coupon' },
            { label: 'All Coupons', href: '/coupons' },
            { label: 'Verify Coupon', href: '/verify-coupon' },
        ],
    },
    { label: 'Appointments', href: '/appointments' },
    { label: 'Offers', href: '/offers' },
    { label: 'Reports', href: '/reporting' },
    {
        label: 'Admin',
        children: [
            { label: 'Users', href: '/users' },
            { label: 'Campaign Config', href: '/campaign-config' },
        ],
    },
]

export default function Navbar() {
    const router = useRouter()
    const pathname = usePathname()
    const supabase = createClient()
    const [openDropdown, setOpenDropdown] = useState<string | null>(null)

    async function handleSignOut() {
        await supabase.auth.signOut()
        router.push('/login')
        router.refresh()
    }

    function isActive(href: string) {
        return pathname === href
    }

    function isGroupActive(children: { href: string }[]) {
        return children.some(c => pathname === c.href)
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
            <nav style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                backgroundColor: '#162860',
                borderRadius: '100px',
                padding: '10px 20px',
                width: '100%',
                boxShadow: '0 4px 24px rgba(22, 40, 96, 0.25)',
                gap: '8px',
            }}>

                {/* Logo */}
                <img
                    src="/autoversa_temp_logo.jpeg"
                    alt="AutoVersa"
                    onClick={() => router.push('/dashboard')}
                    style={{
                        height: '32px',
                        objectFit: 'contain',
                        cursor: 'pointer',
                        flexShrink: 0,
                    }}
                />

                {/* Nav Links */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    flex: 1,
                    justifyContent: 'center',
                }}>
                    {NAV_ITEMS.map(item => {
                        if (item.children) {
                            const active = isGroupActive(item.children)
                            return (
                                <div
                                    key={item.label}
                                    style={{ position: 'relative' }}
                                    onMouseEnter={() => setOpenDropdown(item.label)}
                                    onMouseLeave={() => setOpenDropdown(null)}
                                >
                                    <button style={{
                                        padding: '8px 14px',
                                        borderRadius: '100px',
                                        border: 'none',
                                        cursor: 'pointer',
                                        fontSize: '14px',
                                        fontWeight: active ? '600' : '400',
                                        backgroundColor: active ? '#0074BD' : 'transparent',
                                        color: '#FFFFFF',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        whiteSpace: 'nowrap',
                                        transition: 'background-color 0.2s',
                                    }}>
                                        {item.label}
                                        <span style={{
                                            fontSize: '10px',
                                            opacity: 0.7,
                                            marginTop: '1px',
                                        }}>▼</span>
                                    </button>

                                    {openDropdown === item.label && (
                                        <div style={{
                                            position: 'absolute',
                                            top: '100%',
                                            left: '50%',
                                            transform: 'translateX(-50%)',
                                            backgroundColor: '#1a2f6e',
                                            borderRadius: '16px',
                                            padding: '8px',
                                            paddingTop: '16px',
                                            marginTop: '0px',
                                            minWidth: '200px',
                                            whiteSpace: 'nowrap',
                                        }}>
                                            {item.children.map(child => (
                                                <button
                                                    key={child.href}
                                                    onClick={() => {
                                                        router.push(child.href)
                                                        setOpenDropdown(null)
                                                    }}
                                                    style={{
                                                        display: 'block',
                                                        width: '100%',
                                                        padding: '10px 14px',
                                                        borderRadius: '10px',
                                                        border: 'none',
                                                        cursor: 'pointer',
                                                        fontSize: '14px',
                                                        textAlign: 'left',
                                                        backgroundColor: isActive(child.href) ? '#0074BD' : 'transparent',
                                                        color: '#FFFFFF',
                                                        fontWeight: isActive(child.href) ? '600' : '400',
                                                        transition: 'background-color 0.15s',
                                                    }}
                                                    onMouseEnter={e => {
                                                        if (!isActive(child.href))
                                                            (e.target as HTMLButtonElement).style.backgroundColor = 'rgba(255,255,255,0.1)'
                                                    }}
                                                    onMouseLeave={e => {
                                                        if (!isActive(child.href))
                                                            (e.target as HTMLButtonElement).style.backgroundColor = 'transparent'
                                                    }}
                                                >
                                                    {child.label}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )
                        }

                        const active = isActive(item.href!)
                        return (
                            <button
                                key={item.label}
                                onClick={() => router.push(item.href!)}
                                style={{
                                    padding: '8px 14px',
                                    borderRadius: '100px',
                                    border: 'none',
                                    cursor: 'pointer',
                                    fontSize: '14px',
                                    fontWeight: active ? '600' : '400',
                                    backgroundColor: active ? '#0074BD' : 'transparent',
                                    color: '#FFFFFF',
                                    whiteSpace: 'nowrap',
                                    transition: 'background-color 0.2s',
                                }}
                                onMouseEnter={e => {
                                    if (!active)
                                        (e.target as HTMLButtonElement).style.backgroundColor = 'rgba(255,255,255,0.1)'
                                }}
                                onMouseLeave={e => {
                                    if (!active)
                                        (e.target as HTMLButtonElement).style.backgroundColor = 'transparent'
                                }}
                            >
                                {item.label}
                            </button>
                        )
                    })}
                </div>

                {/* Sign Out */}
                <button
                    onClick={handleSignOut}
                    style={{
                        padding: '8px 16px',
                        borderRadius: '100px',
                        border: '1.5px solid rgba(255,255,255,0.25)',
                        cursor: 'pointer',
                        fontSize: '13px',
                        fontWeight: '500',
                        backgroundColor: 'transparent',
                        color: '#FFFFFF',
                        whiteSpace: 'nowrap',
                        flexShrink: 0,
                        transition: 'border-color 0.2s',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.6)')}
                    onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.25)')}
                >
                    Sign out
                </button>

            </nav>
        </div>
    )
}