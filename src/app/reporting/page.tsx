'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Navbar from '@/components/layout/Navbar'
import Breadcrumb from '@/components/layout/Breadcrumb'
import { loadPermissionsForRole, checkPermission } from '@/lib/permissions'


interface OfferSummary {
  id: string
  title: string
  is_active: boolean | null
  coupon_cap: number | null
  visited_count: number | null
  commission_amount: number | null
  issuance_start_date: string | null
  issuance_end_date: string | null
  loyalty_brand: string | null
  referral_brand: string | null
  total_issued: number
  loyalty_issued: number
  referral_issued: number
  actual_visited: number
  stage1_count: number
  stage2_count: number
  stage3_count: number
}


function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export default function ReportingPage() {
  const router = useRouter()
  const supabase = createClient()

  const [offers, setOffers] = useState<OfferSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState<any>(null)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    const { data: profileData } = await supabase
      .from('profiles').select('user_role, is_active').eq('id', user.id).single()
    setProfile(profileData)

    if (!profileData) { router.push('/login'); return }

    if (profileData.is_active === false) {
      await supabase.auth.signOut()
      router.push('/login')
      return
    }

    const perms = await loadPermissionsForRole(profileData.user_role)
    if (!checkPermission(perms, profileData.user_role, 'page:reporting', 'view')) {
      router.push('/dashboard')
      return
    }

    const { data: offersData } = await supabase
      .from('offers')
      .select('id, title, is_active, coupon_cap, visited_count, commission_amount, issuance_start_date, issuance_end_date, loyalty_brand, referral_brand')
      .order('created_at', { ascending: false })

    if (!offersData) { setLoading(false); return }

    const offerIds = offersData.map(o => o.id)

    // Load coupons and appointments in parallel
    const [{ data: coupons }, { data: appointments }] = await Promise.all([
      supabase
        .from('coupons')
        .select('offer_id, coupon_type, stage')
        .in('offer_id', offerIds),
      supabase
        .from('appointments')
        .select('offer_id, status')
        .in('offer_id', offerIds),
    ])

    const summaries: OfferSummary[] = offersData.map(offer => {
      const offerCoupons = (coupons || []).filter(c => c.offer_id === offer.id)
      const loyaltyCoupons = offerCoupons.filter(c => c.coupon_type === 'LOYALTY')
      const referralCoupons = offerCoupons.filter(c => c.coupon_type === 'REFERRAL')
      const offerAppts = (appointments || []).filter(a => a.offer_id === offer.id)
      const actualVisited = offerAppts.filter(a => a.status === 'visited').length

      return {
        ...offer,
        total_issued: offerCoupons.length,
        loyalty_issued: loyaltyCoupons.length,
        referral_issued: referralCoupons.length,
        actual_visited: actualVisited,
        stage1_count: loyaltyCoupons.filter(c => (c.stage || 0) >= 1).length,
        stage2_count: loyaltyCoupons.filter(c => (c.stage || 0) >= 2).length,
        stage3_count: loyaltyCoupons.filter(c => (c.stage || 0) >= 3).length,
      }
    })

    setOffers(summaries)
    setLoading(false)
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#F7F7F7', paddingTop: '16px' }}>
      <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }`}</style>
      <Navbar />
      <main style={{ padding: '0 32px 48px' }}>
        <Breadcrumb items={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Reports' }]} />

        <div style={{ marginBottom: '28px' }}>
          <h1 style={{ fontSize: '22px', fontWeight: '700', color: '#1A1A1A', margin: 0 }}>Reports</h1>
          <p style={{ color: '#666', fontSize: '14px', marginTop: '4px' }}>
            Performance summary per offer. Click any offer to view its full report.
          </p>
        </div>

        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} style={{ height: '140px', backgroundColor: '#E0E0E0', borderRadius: '16px', animation: 'pulse 1.5s ease-in-out infinite' }} />
            ))}
          </div>
        ) : offers.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '64px', color: '#666', fontSize: '14px' }}>
            No offers created yet.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {offers.map(offer => {
              const capPct = offer.coupon_cap ? Math.min((offer.actual_visited / offer.coupon_cap) * 100, 100) : null
              const commissionEarned = offer.actual_visited * (offer.commission_amount || 0)

              return (
                <div
                  key={offer.id}
                  onClick={() => router.push(`/reporting/${offer.id}`)}
                  style={{
                    backgroundColor: '#FFFFFF', borderRadius: '16px',
                    padding: '24px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
                    cursor: 'pointer', borderLeft: `4px solid ${offer.is_active ? '#0074BD' : '#CCCCCC'}`,
                    transition: 'box-shadow 0.15s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.1)')}
                  onMouseLeave={e => (e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.06)')}
                >
                  {/* Header row */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                        <h2 style={{ fontSize: '16px', fontWeight: '700', color: '#1A1A1A', margin: 0 }}>{offer.title}</h2>
                        <span style={{
                          fontSize: '11px', fontWeight: '600', padding: '3px 8px', borderRadius: '100px',
                          backgroundColor: offer.is_active ? '#dcfce7' : '#F0F0F0',
                          color: offer.is_active ? '#16a34a' : '#666',
                        }}>
                          {offer.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                      {offer.issuance_start_date && (
                        <p style={{ fontSize: '12px', color: '#888', margin: 0 }}>
                          {formatDate(offer.issuance_start_date)}
                          {offer.issuance_end_date && ` — ${formatDate(offer.issuance_end_date)}`}
                        </p>
                      )}
                    </div>
                    <span style={{ fontSize: '13px', color: '#0074BD', fontWeight: '600' }}>View Report →</span>
                  </div>

                  {/* Stats row */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '12px', marginBottom: '16px' }}>
                    {[
                      { label: 'Total Issued', value: String(offer.total_issued), color: '#162860' },
                      { label: (offer.loyalty_brand || 'Loyalty') + ' Coupons', value: String(offer.loyalty_issued), color: '#162860' },
                      { label: (offer.referral_brand || 'Referral') + ' Coupons', value: String(offer.referral_issued), color: '#0074BD' },
                      { label: 'Visited', value: offer.coupon_cap ? `${offer.actual_visited} / ${offer.coupon_cap}` : String(offer.actual_visited), color: '#16a34a' },
                      { label: 'Commission', value: `AED ${commissionEarned.toLocaleString()}`, color: '#f59e0b' },
                      { label: 'Stage 1+', value: String(offer.stage1_count), color: '#0074BD' },
                      { label: 'Stage 2+', value: String(offer.stage2_count), color: '#7c3aed' },
                      { label: 'Stage 3', value: String(offer.stage3_count), color: '#16a34a' },
                    ].map(s => (
                      <div key={s.label} style={{ backgroundColor: '#F7F7F7', borderRadius: '10px', padding: '10px 12px' }}>
                        <p style={{ fontSize: '11px', color: '#888', margin: '0 0 3px', fontWeight: '500' }}>{s.label}</p>
                        <p style={{ fontSize: '16px', fontWeight: '700', color: s.color, margin: 0 }}>{s.value}</p>
                      </div>
                    ))}
                  </div>

                  {/* Cap progress bar */}
                  {capPct !== null && (
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                        <span style={{ fontSize: '11px', color: '#888', fontWeight: '500' }}>Cap utilisation</span>
                        <span style={{ fontSize: '11px', color: '#1A1A1A', fontWeight: '600' }}>{capPct.toFixed(1)}%</span>
                      </div>
                      <div style={{ height: '6px', backgroundColor: '#E0E0E0', borderRadius: '100px', overflow: 'hidden' }}>
                        <div style={{
                          height: '100%', borderRadius: '100px',
                          backgroundColor: capPct >= 90 ? '#D0021B' : capPct >= 70 ? '#f59e0b' : '#0074BD',
                          width: `${capPct}%`, transition: 'width 0.5s ease',
                        }} />
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}