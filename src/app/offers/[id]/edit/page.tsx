'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import OfferForm from '@/components/offers/OfferForm'
import { loadPermissionsForRole, checkPermission } from '@/lib/permissions'

export default function EditOfferPage() {
    const router = useRouter()
    const params = useParams()
    const supabase = createClient()
    const [offer, setOffer] = useState<any>(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        async function loadOffer() {
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

            const id = Array.isArray(params.id) ? params.id[0] : params.id
            if (!id) {
                setLoading(false)
                return
            }

            const { data } = await supabase
                .from('offers')
                .select('*')
                .eq('id', id)
                .single()
            if (data) setOffer(data)
            setLoading(false)
        }
        loadOffer()
    }, [params.id])

    if (loading) {
        return (
            <div style={{
                minHeight: '100vh', display: 'flex',
                alignItems: 'center', justifyContent: 'center',
                backgroundColor: '#F7F7F7', color: '#666',
                fontSize: '14px',
            }}>
                Loading offer...
            </div>
        )
    }

    if (!offer) {
        return (
            <div style={{
                minHeight: '100vh', display: 'flex',
                alignItems: 'center', justifyContent: 'center',
                backgroundColor: '#F7F7F7', color: '#666',
                fontSize: '14px',
            }}>
                Offer not found.
            </div>
        )
    }

    return <OfferForm mode="edit" initialData={offer} />
}