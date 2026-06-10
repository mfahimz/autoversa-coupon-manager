'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import OfferForm from '@/components/offers/OfferForm'

export default function EditOfferPage() {
    const params = useParams()
    const supabase = createClient()
    const [offer, setOffer] = useState<any>(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        async function loadOffer() {
            const { data } = await supabase
                .from('offers')
                .select('*')
                .eq('id', params.id)
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