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

            const id = Array.isArray(params.id) ? params.id[0] : params.id
            if (!id) {
                setLoading(false)
                return
            }

            const [profileResult, offerResult] = await Promise.all([
                supabase.from('profiles').select('user_role, is_active').eq('id', user.id).single(),
                supabase.from('offers').select('id, title, description, is_active, valid_days, b_valid_days, coupon_cap, first_batch_target, commission_amount, coupon_code_structure, offer_variables, vehicle_config, offer_identifier, issuance_window_type, issuance_start_date, issuance_end_date, issuance_window_days, m_redemption_window_type, m_redemption_start_date, m_redemption_end_date, b_redemption_window_type, b_redemption_start_date, b_redemption_end_date, loyalty_brand, referral_brand, loyalty_code, referral_code, loyalty_campaign_code, referral_campaign_code, publish_start_date, publish_end_date, activated_at').eq('id', id).single()
            ])

            const { data: profileData } = profileResult
            const { data } = offerResult

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