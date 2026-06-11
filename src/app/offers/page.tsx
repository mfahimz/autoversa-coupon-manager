'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Navbar from '@/components/layout/Navbar'
import Breadcrumb from '@/components/layout/Breadcrumb'

interface Offer {
  id: string
  title: string
  description: string | null
  offer_identifier: string
  valid_days: number
  commission_amount: number | null
  is_active: boolean
  coupon_code_structure: string | null
  offer_variables: string[] | null
  coupon_cap: number | null
  visited_count: number
  created_at: string
  first_batch_target: number | null
}

export default function OffersPage() {
  const router = useRouter()
  const supabase = createClient()

  const [offers, setOffers] = useState<Offer[]>([])
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  useEffect(() => { loadOffers() }, [])

  async function loadOffers() {
    setLoading(true)
    const { data } = await supabase
      .from('offers')
      .select('*')
      .order('created_at', { ascending: false })
    if (data) setOffers(data)
    setLoading(false)
  }

  function showToast(message: string, type: 'success' | 'error' = 'success') {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }

  async function toggleActive(offer: Offer) {
    const { error } = await supabase
      .from('offers')
      .update({ is_active: !offer.is_active })
      .eq('id', offer.id)
    if (error) { showToast('Failed to update offer', 'error'); return }
    showToast(`Offer ${!offer.is_active ? 'activated' : 'deactivated'}`)
    loadOffers()
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#F7F7F7', paddingTop: '16px' }}>
      <style>{`
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
        @keyframes slideIn { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }
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
          { label: 'Offers' },
        ]} />

        <div style={{
          display: 'flex', justifyContent: 'space-between',
          alignItems: 'center', marginBottom: '24px',
        }}>
          <div>
            <h1 style={{ fontSize: '22px', fontWeight: '700', color: '#1A1A1A', margin: 0 }}>
              Offers
            </h1>
            <p style={{ color: '#666666', fontSize: '14px', marginTop: '4px' }}>
              {loading ? '...' : `${offers.length} offer${offers.length !== 1 ? 's' : ''}`}
            </p>
          </div>
          <button
            onClick={() => router.push('/offers/new')}
            style={{
              padding: '10px 20px', backgroundColor: '#0074BD', color: '#FFFFFF',
              border: 'none', borderRadius: '10px', fontSize: '14px',
              fontWeight: '600', cursor: 'pointer',
            }}
          >
            + New Offer
          </button>
        </div>

        <div style={{
          backgroundColor: '#FFFFFF', borderRadius: '16px',
          boxShadow: '0 1px 4px rgba(0,0,0,0.06)', overflow: 'hidden',
        }}>
          {/* Table Header */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '2fr 1.5fr 1fr 1fr 1fr 1fr 160px',
            padding: '12px 24px', backgroundColor: '#F7F7F7',
            borderBottom: '1px solid #EEEEEE',
          }}>
            {['Title', 'Identifier', 'Valid Days', 'Commission', 'Visited', 'Status', 'Actions'].map(h => (
              <span key={h} style={{
                fontSize: '12px', fontWeight: '600', color: '#666666',
                textTransform: 'uppercase', letterSpacing: '0.5px',
              }}>
                {h}
              </span>
            ))}
          </div>

          {loading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} style={{
                height: '60px', margin: '8px 24px', backgroundColor: '#F0F0F0',
                borderRadius: '8px', animation: 'pulse 1.5s ease-in-out infinite',
              }} />
            ))
          ) : offers.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '64px 0', color: '#666666', fontSize: '14px' }}>
              No offers yet.{' '}
              <span
                onClick={() => router.push('/offers/new')}
                style={{ color: '#0074BD', cursor: 'pointer', fontWeight: '500' }}
              >
                Create your first offer →
              </span>
            </div>
          ) : (
            offers.map((offer, i) => (
              <div key={offer.id} style={{
                display: 'grid',
                gridTemplateColumns: '2fr 1.5fr 1fr 1fr 1fr 1fr 160px',
                padding: '16px 24px',
                borderBottom: i < offers.length - 1 ? '1px solid #F5F5F5' : 'none',
                alignItems: 'center',
              }}>
                {/* Title */}
                <div>
                  <p style={{ fontSize: '14px', fontWeight: '600', color: '#1A1A1A', margin: 0 }}>
                    {offer.title}
                  </p>
                  {offer.description && (
                    <p style={{
                      fontSize: '12px', color: '#666666', margin: '2px 0 0',
                      overflow: 'hidden', textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap', maxWidth: '280px',
                    }}>
                      {offer.description}
                    </p>
                  )}
                </div>

                {/* Identifier */}
                <span style={{ fontSize: '13px', color: '#444', fontFamily: 'monospace' }}>
                  {offer.offer_identifier}
                </span>

                {/* Valid Days */}
                <span style={{ fontSize: '13px', color: '#444' }}>
                  {offer.valid_days} days
                </span>

                {/* Commission */}
                <span style={{ fontSize: '13px', color: '#444' }}>
                  {offer.commission_amount ? `AED ${offer.commission_amount}` : '—'}
                </span>

                {/* Visited Count */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '15px', fontWeight: '700', color: '#0074BD' }}>
                    {offer.visited_count ?? 0}
                  </span>
                  {offer.first_batch_target && (
                    <span style={{ fontSize: '12px', color: '#888' }}>
                      / {offer.first_batch_target}
                    </span>
                  )}
                </div>

                {/* Status */}
                <span style={{
                  display: 'inline-flex', alignItems: 'center',
                  padding: '4px 10px', borderRadius: '100px',
                  fontSize: '12px', fontWeight: '600', width: 'fit-content',
                  backgroundColor: offer.is_active ? '#dcfce7' : '#f3f4f6',
                  color: offer.is_active ? '#16a34a' : '#666666',
                }}>
                  {offer.is_active ? 'Active' : 'Inactive'}
                </span>

                {/* Actions */}
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={() => router.push(`/offers/${offer.id}/edit`)}
                    style={{
                      padding: '6px 14px', fontSize: '12px', fontWeight: '500',
                      backgroundColor: '#F0F4FF', color: '#162860',
                      border: 'none', borderRadius: '8px', cursor: 'pointer',
                    }}
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => toggleActive(offer)}
                    style={{
                      padding: '6px 14px', fontSize: '12px', fontWeight: '500',
                      backgroundColor: offer.is_active ? '#FFF0F0' : '#F0FFF4',
                      color: offer.is_active ? '#D0021B' : '#16a34a',
                      border: 'none', borderRadius: '8px', cursor: 'pointer',
                    }}
                  >
                    {offer.is_active ? 'Deactivate' : 'Activate'}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </main>
    </div>
  )
}

export const dynamic = 'force-dynamic'