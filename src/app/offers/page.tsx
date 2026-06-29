'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Navbar from '@/components/layout/Navbar'
import Breadcrumb from '@/components/layout/Breadcrumb'
import { loadPermissionsForRole, checkPermission } from '@/lib/permissions'


interface Offer {
  id: string
  title: string
  description: string | null
  offer_identifier: string | null
  valid_days: number | null
  b_valid_days: number | null
  m_redemption_end_date: string | null
  b_redemption_end_date: string | null
  commission_amount: number | null
  is_active: boolean | null
  coupon_code_structure?: string | null
  offer_variables?: string | null
  coupon_cap?: number | null
  visited_count: number | null
  created_at?: string | null
  first_batch_target: number | null
  loyalty_brand?: string | null
  referral_brand?: string | null
}

const PAGE_SIZE = 10

export default function OffersPage() {
  const router = useRouter()
  const supabase = createClient()

  const [offers, setOffers] = useState<Offer[]>([])
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  const [currentPage, setCurrentPage] = useState(1)

  useEffect(() => { loadOffers() }, [])

  async function loadOffers() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    const [profileResult, offersResult] = await Promise.all([
      supabase.from('profiles').select('user_role, is_active').eq('id', user.id).single(),
      supabase.from('offers').select('id, title, description, offer_identifier, valid_days, b_valid_days, m_redemption_end_date, b_redemption_end_date, commission_amount, visited_count, first_batch_target, is_active, loyalty_brand, referral_brand').order('created_at', { ascending: false })
    ])

    const { data: profileData } = profileResult
    const { data } = offersResult

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

  const totalPages = Math.ceil(offers.length / PAGE_SIZE)
  const paginatedOffers = offers.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

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
            {['Title', 'Identifier', 'Redemption Window', 'Commission', 'Visited', 'Status', 'Actions'].map(h => (
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
            paginatedOffers.map((offer, i) => (
              <div key={offer.id} style={{
                display: 'grid',
                gridTemplateColumns: '2fr 1.5fr 1fr 1fr 1fr 1fr 160px',
                padding: '16px 24px',
                borderBottom: i < paginatedOffers.length - 1 ? '1px solid #F5F5F5' : 'none',
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
                <div>
                  <p style={{ fontSize: '12px', color: '#888', margin: '0 0 2px' }}>Loyalty</p>
                  <span style={{ fontSize: '13px', color: '#444' }}>
                    {offer.valid_days
                      ? `${offer.valid_days} days`
                      : offer.m_redemption_end_date
                        ? `Until ${new Date(offer.m_redemption_end_date).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })}`
                        : '—'}
                  </span>
                  <p style={{ fontSize: '12px', color: '#888', margin: '4px 0 2px' }}>Referral</p>
                  <span style={{ fontSize: '13px', color: '#444' }}>
                    {offer.b_valid_days
                      ? `${offer.b_valid_days} days`
                      : offer.b_redemption_end_date
                        ? `Until ${new Date(offer.b_redemption_end_date).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })}`
                        : '—'}
                  </span>
                </div>

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

        {totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', padding: '20px 0' }}>
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              style={{ padding: '7px 14px', fontSize: '13px', fontWeight: '600', border: '1.5px solid #E0E0E0', borderRadius: '8px', backgroundColor: '#FFFFFF', color: currentPage === 1 ? '#CCC' : '#162860', cursor: currentPage === 1 ? 'not-allowed' : 'pointer' }}
            >
              ← Prev
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).filter(p => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 2).map((p, idx, arr) => (
              <span key={p}>
                {idx > 0 && arr[idx - 1] !== p - 1 && <span style={{ color: '#888', fontSize: '13px', padding: '0 4px' }}>…</span>}
                <button
                  onClick={() => setCurrentPage(p)}
                  style={{ padding: '7px 12px', fontSize: '13px', fontWeight: '600', border: '1.5px solid', borderColor: p === currentPage ? '#0074BD' : '#E0E0E0', borderRadius: '8px', backgroundColor: p === currentPage ? '#0074BD' : '#FFFFFF', color: p === currentPage ? '#FFFFFF' : '#444', cursor: 'pointer', minWidth: '36px' }}
                >
                  {p}
                </button>
              </span>
            ))}
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              style={{ padding: '7px 14px', fontSize: '13px', fontWeight: '600', border: '1.5px solid #E0E0E0', borderRadius: '8px', backgroundColor: '#FFFFFF', color: currentPage === totalPages ? '#CCC' : '#162860', cursor: currentPage === totalPages ? 'not-allowed' : 'pointer' }}
            >
              Next →
            </button>
            <span style={{ fontSize: '12px', color: '#888', marginLeft: '8px' }}>
              Page {currentPage} of {totalPages}
            </span>
          </div>
        )}
      </main>
    </div>
  )
}

export const dynamic = 'force-dynamic'