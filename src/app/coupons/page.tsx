'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Navbar from '@/components/layout/Navbar'
import Breadcrumb from '@/components/layout/Breadcrumb'
import { useCouponDownload } from '@/hooks/useCouponDownload'

interface Coupon {
  id: string
  coupon_code: string
  identifier_type: string
  plate_combined_string: string | null
  mobile_number: string | null
  car_model: string | null
  offer_title: string
  offer_id: string | null
  customer_name: string | null
  advisor_name: string
  issue_date: string
  expiry_date: string
  status: string
  redemption_count: number
}

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  ACTIVE: { bg: '#dcfce7', color: '#16a34a' },
  REDEEMED: { bg: '#ede9fe', color: '#7c3aed' },
  EXPIRED: { bg: '#f3f4f6', color: '#666666' },
  CANCELLED: { bg: '#fee2e2', color: '#D0021B' },
}

export default function CouponsPage() {
  const router = useRouter()
  const supabase = createClient()
  const { downloadCoupon } = useCouponDownload()

  const [coupons, setCoupons] = useState<Coupon[]>([])
  const [filtered, setFiltered] = useState<Coupon[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [profile, setProfile] = useState<any>(null)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  useEffect(() => { loadData() }, [])

  useEffect(() => {
    let result = coupons
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(c =>
        c.coupon_code.toLowerCase().includes(q) ||
        c.offer_title.toLowerCase().includes(q) ||
        c.advisor_name?.toLowerCase().includes(q) ||
        c.plate_combined_string?.toLowerCase().includes(q) ||
        c.mobile_number?.includes(q)
      )
    }
    if (statusFilter !== 'ALL') result = result.filter(c => c.status === statusFilter)
    setFiltered(result)
  }, [search, statusFilter, coupons])

  async function loadData() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    const { data: profileData } = await supabase
      .from('profiles').select('user_role, full_name').eq('id', user.id).single()
    setProfile(profileData)

    const isAdvisor = profileData?.user_role === 'SERVICE_ADVISOR' ||
      profileData?.user_role === 'BMW_SERVICE_ADVISOR'

    let query = supabase
      .from('coupons')
      .select('id, coupon_code, identifier_type, plate_combined_string, mobile_number, car_model, offer_title, offer_id, customer_name, advisor_name, issue_date, expiry_date, status, redemption_count')
      .order('created_at', { ascending: false })

    if (isAdvisor) query = query.eq('issued_by', user.id)

    const { data } = await query
    if (data) { setCoupons(data); setFiltered(data) }
    setLoading(false)
  }

  async function updateStatus(id: string, status: string) {
    const { error } = await supabase.from('coupons').update({ status }).eq('id', id)
    if (!error) loadData()
  }

  async function handleDownload(coupon: Coupon) {
    setDownloadingId(coupon.id)
    await downloadCoupon(
      {
        coupon_code: coupon.coupon_code,
        expiry_date: coupon.expiry_date,
        customer_name: coupon.customer_name,
        plate_combined_string: coupon.plate_combined_string,
        mobile_number: coupon.mobile_number,
        offer_id: coupon.offer_id,
        advisor_name: coupon.advisor_name,
        offer_title: coupon.offer_title,
      },
      `autoversa-${coupon.coupon_code}`
    )
    setDownloadingId(null)
  }

  const counts = {
    ALL: coupons.length,
    ACTIVE: coupons.filter(c => c.status === 'ACTIVE').length,
    REDEEMED: coupons.filter(c => c.status === 'REDEEMED').length,
    EXPIRED: coupons.filter(c => c.status === 'EXPIRED').length,
    CANCELLED: coupons.filter(c => c.status === 'CANCELLED').length,
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#F7F7F7', paddingTop: '16px' }}>
      <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }`}</style>


      <Navbar />

      <main style={{ padding: '0 32px 48px' }}>
        <Breadcrumb items={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'All Coupons' },
        ]} />

        <div style={{
          display: 'flex', justifyContent: 'space-between',
          alignItems: 'center', marginBottom: '20px',
        }}>
          <div>
            <h1 style={{ fontSize: '22px', fontWeight: '700', color: '#1A1A1A', margin: 0 }}>
              All Coupons
            </h1>
            <p style={{ color: '#666', fontSize: '14px', marginTop: '4px' }}>
              {loading ? '...' : `${filtered.length} of ${coupons.length} coupons`}
            </p>
          </div>
          <button
            onClick={() => router.push('/create-coupon')}
            style={{
              padding: '10px 20px', backgroundColor: '#0074BD', color: '#FFFFFF',
              border: 'none', borderRadius: '10px', fontSize: '14px',
              fontWeight: '600', cursor: 'pointer',
            }}
          >
            + Create Coupon
          </button>
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by code, offer, advisor, plate, mobile..."
            style={{
              flex: 1, minWidth: '260px', padding: '9px 14px',
              fontSize: '14px', border: '1.5px solid #E0E0E0',
              borderRadius: '10px', outline: 'none',
              backgroundColor: '#FFFFFF', color: '#1A1A1A',
            }}
          />
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {(['ALL', 'ACTIVE', 'REDEEMED', 'EXPIRED', 'CANCELLED'] as const).map(s => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                style={{
                  padding: '8px 14px', borderRadius: '10px', border: '1.5px solid',
                  borderColor: statusFilter === s ? '#0074BD' : '#E0E0E0',
                  backgroundColor: statusFilter === s ? '#F0F7FF' : '#FFFFFF',
                  color: statusFilter === s ? '#0074BD' : '#666',
                  fontSize: '13px', fontWeight: '600', cursor: 'pointer', whiteSpace: 'nowrap',
                }}
              >
                {s === 'ALL' ? `All (${counts.ALL})` : `${s} (${counts[s]})`}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div style={{
          backgroundColor: '#FFFFFF', borderRadius: '16px',
          boxShadow: '0 1px 4px rgba(0,0,0,0.06)', overflow: 'hidden',
        }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: '2fr 1.5fr 1.5fr 1fr 1fr 1fr 160px',
            padding: '12px 24px', backgroundColor: '#F7F7F7',
            borderBottom: '1px solid #EEEEEE',
          }}>
            {['Coupon Code', 'Offer', 'Identifier', 'Advisor', 'Issued', 'Status', 'Actions'].map(h => (
              <span key={h} style={{
                fontSize: '12px', fontWeight: '600', color: '#666',
                textTransform: 'uppercase', letterSpacing: '0.5px',
              }}>{h}</span>
            ))}
          </div>

          {loading ? (
            Array.from({ length: 6 }).map((_, i) => (
              <div key={i} style={{
                height: '60px', margin: '8px 24px', backgroundColor: '#F0F0F0',
                borderRadius: '8px', animation: 'pulse 1.5s ease-in-out infinite',
              }} />
            ))
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '64px 0', color: '#666', fontSize: '14px' }}>
              {search || statusFilter !== 'ALL' ? 'No coupons match your filters.' : 'No coupons yet. '}
              {!search && statusFilter === 'ALL' && (
                <span onClick={() => router.push('/create-coupon')} style={{ color: '#0074BD', cursor: 'pointer', fontWeight: '500' }}>
                  Create the first one →
                </span>
              )}
            </div>
          ) : (
            filtered.map((coupon, i) => {
              const statusStyle = STATUS_COLORS[coupon.status] || STATUS_COLORS.EXPIRED
              const isExpired = new Date(coupon.expiry_date) < new Date()
              const isDownloading = downloadingId === coupon.id

              return (
                <div key={coupon.id} style={{
                  display: 'grid',
                  gridTemplateColumns: '2fr 1.5fr 1.5fr 1fr 1fr 1fr 160px',
                  padding: '14px 24px',
                  borderBottom: i < filtered.length - 1 ? '1px solid #F5F5F5' : 'none',
                  alignItems: 'center',
                }}>
                  <div>
                    <p style={{ fontSize: '13px', fontWeight: '700', color: '#162860', margin: 0, fontFamily: 'monospace', wordBreak: 'break-all' }}>
                      {coupon.coupon_code}
                    </p>
                    {coupon.car_model && (
                      <p style={{ fontSize: '11px', color: '#888', margin: '2px 0 0' }}>{coupon.car_model}</p>
                    )}
                  </div>
                  <span style={{ fontSize: '13px', color: '#444' }}>{coupon.offer_title}</span>
                  <div>
                    <span style={{
                      fontSize: '11px', fontWeight: '600',
                      backgroundColor: coupon.identifier_type === 'PLATE' ? '#EEF2FF' : '#F0FFF4',
                      color: coupon.identifier_type === 'PLATE' ? '#162860' : '#16a34a',
                      padding: '2px 8px', borderRadius: '4px',
                    }}>
                      {coupon.identifier_type}
                    </span>
                    <p style={{ fontSize: '12px', color: '#666', margin: '3px 0 0', fontFamily: 'monospace' }}>
                      {coupon.identifier_type === 'PLATE'
                        ? coupon.plate_combined_string
                        : coupon.mobile_number ? `+971${coupon.mobile_number}` : '—'}
                    </p>
                  </div>
                  <span style={{ fontSize: '13px', color: '#444' }}>{coupon.advisor_name || '—'}</span>
                  <div>
                    <p style={{ fontSize: '12px', color: '#444', margin: 0 }}>
                      {new Date(coupon.issue_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                    </p>
                    <p style={{ fontSize: '11px', margin: '2px 0 0', color: isExpired && coupon.status === 'ACTIVE' ? '#D0021B' : '#888' }}>
                      Exp: {new Date(coupon.expiry_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' })}
                    </p>
                  </div>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center',
                    padding: '4px 10px', borderRadius: '100px',
                    fontSize: '11px', fontWeight: '600', width: 'fit-content',
                    backgroundColor: statusStyle.bg, color: statusStyle.color,
                  }}>
                    {coupon.status}
                  </span>
                  <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                    <button
                      onClick={() => handleDownload(coupon)}
                      disabled={isDownloading}
                      style={{
                        padding: '5px 8px', fontSize: '11px', fontWeight: '600',
                        backgroundColor: isDownloading ? '#E0E0E0' : '#F0F4FF',
                        color: isDownloading ? '#888' : '#162860',
                        border: 'none', borderRadius: '6px', cursor: isDownloading ? 'not-allowed' : 'pointer',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {isDownloading ? '...' : '⬇ JPG'}
                    </button>
                    {coupon.status === 'ACTIVE' && (
                      <button
                        onClick={() => updateStatus(coupon.id, 'REDEEMED')}
                        style={{
                          padding: '5px 8px', fontSize: '11px', fontWeight: '600',
                          backgroundColor: '#ede9fe', color: '#7c3aed',
                          border: 'none', borderRadius: '6px', cursor: 'pointer', whiteSpace: 'nowrap',
                        }}
                      >
                        Redeem
                      </button>
                    )}
                    {coupon.status === 'ACTIVE' && (
                      <button
                        onClick={() => updateStatus(coupon.id, 'CANCELLED')}
                        style={{
                          padding: '5px 8px', fontSize: '11px', fontWeight: '600',
                          backgroundColor: '#fee2e2', color: '#D0021B',
                          border: 'none', borderRadius: '6px', cursor: 'pointer',
                        }}
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                </div>
              )
            })
          )}
        </div>
      </main>
    </div>
  )
}

export const dynamic = 'force-dynamic'