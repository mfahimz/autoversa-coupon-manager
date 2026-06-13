'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import OfferForm from '@/components/offers/OfferForm'
import { loadPermissionsForRole, checkPermission } from '@/lib/permissions'

export default function NewOfferPage() {
    const router = useRouter()
    const supabase = createClient()
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        async function init() {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) { router.push('/login'); return }

            const { data: profileData } = await supabase
                .from('profiles').select('user_role, is_active').eq('id', user.id).single()

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
            if (!checkPermission(perms, profileData.user_role, 'page:offers', 'view')) {
                router.push('/dashboard')
                return
            }

            setLoading(false)
        }
        init()
    }, [])

    if (loading) {
        return (
            <div style={{
                minHeight: '100vh', display: 'flex',
                alignItems: 'center', justifyContent: 'center',
                backgroundColor: '#F7F7F7', color: '#666',
                fontSize: '14px',
            }}>
                Loading...
            </div>
        )
    }

    return <OfferForm mode="create" />
}

export const dynamic = 'force-dynamic'
