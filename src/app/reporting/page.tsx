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
  stageCounts: { stage_number: number; count: bigint | number }[]
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
  const [stageLabelsMap, setStageLabelsMap] = useState<Map<string, Map<number, string>>>(new Map())

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    const [profileResult, offersResult, summariesResult, stageCountsResult, offerStagesResult] = await Promise.all([
      supabase.from('profiles').select('user_role, is_active').eq('id', user.id).single(),
      supabase.from('offers').select('id, title, is_active, coupon_cap, visited_count, commission_amount, issuance_start_date, issuance_end_date, loyalty_brand, referral_brand').order('created_at', { ascending: false }),
      (supabase as any).rpc('get_offer_summaries'),
      (supabase as any).rpc('get_offer_stage_counts'),
      supabase.from('offer_stages').select('offer_id, stage_number, reward_label').order('stage_number'),
    ])

    const { data: profileData } = profileResult
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

    const { data: offersData } = offersResult
    if (!offersData) { setLoading(false); return }

    const { data: summaryRows } = summariesResult
    const summaryMap = new Map<string, any>((summaryRows || []).map((s: any) => [s.offer_id, s]))

    const { data: stageCountRows } = stageCountsResult
    const stageCountsMap = new Map<string, { stage_number: number; count: number }[]>()
    ;(stageCountRows || []).forEach((row: any) => {
      const existing = stageCountsMap.get(row.offer_id) || []
      existing.push({ stage_number: row.stage_number, count: Number(row.count) })
      stageCountsMap.set(row.offer_id, existing)
    })

    const { data: offerStagesData } = offerStagesResult
    const stageLabelsMapTmp = new Map<string, Map<number, string>>()
    ;(offerStagesData || []).forEach((row: any) => {
      if (!stageLabelsMapTmp.has(row.offer_id)) stageLabelsMapTmp.set(row.offer_id, new Map())
      stageLabelsMapTmp.get(row.offer_id)!.set(row.stage_number, row.reward_label || `Stage ${row.stage_number}`)
    })

    const summaries: OfferSummary[] = offersData.map(offer => {
      const s = summaryMap.get(offer.id)
      const stages = (stageCountsMap.get(offer.id) || []).sort((a, b) => a.stage_number - b.stage_number)
      return {
        ...offer,
        total_issued: Number(s?.total_issued) || 0,
        loyalty_issued: Number(s?.loyalty_issued) || 0,
        referral_issued: Number(s?.referral_issued) || 0,
        actual_visited: Number(s?.actual_visited) || 0,
        stageCounts: stages,
      }
    })

    setStageLabelsMap(stageLabelsMapTmp)
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
                      { label: 'Invoiced', value: offer.coupon_cap ? `${offer.actual_visited} / ${offer.coupon_cap}` : String(offer.actual_visited), color: '#16a34a' },
                      { label: 'Commission', value: `AED ${commissionEarned.toLocaleString()}`, color: '#f59e0b' },
                      { label: 'Conversion Rate', value: offer.loyalty_issued > 0 ? ((offer.actual_visited / offer.loyalty_issued) * 100).toFixed(1) + '%' : '—', color: '#0074BD' },
                    ].map(s => (
                      <div key={s.label} style={{ backgroundColor: '#F7F7F7', borderRadius: '10px', padding: '10px 12px' }}>
                        <p style={{ fontSize: '11px', color: '#888', margin: '0 0 3px', fontWeight: '500' }}>{s.label}</p>
                        <p style={{ fontSize: '16px', fontWeight: '700', color: s.color, margin: 0 }}>{s.value}</p>
                      </div>
                    ))}
                  </div>

                  {/* Dynamic stage breakdown section */}
                  {offer.stageCounts.length > 0 && (
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #F0F0F0', marginBottom: '16px' }}>
                      {offer.stageCounts.map((sc, idx) => {
                        const colors = ['#0074BD', '#7c3aed', '#16a34a', '#f59e0b', '#D0021B']
                        const color = colors[(sc.stage_number - 1) % colors.length]
                        const label = stageLabelsMap.get(offer.id)?.get(sc.stage_number) || `Stage ${sc.stage_number}`
                        return (
                          <div key={sc.stage_number} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '5px 12px', borderRadius: '100px', backgroundColor: `${color}15`, border: `1px solid ${color}30` }}>
                            <div style={{ width: '7px', height: '7px', borderRadius: '50%', backgroundColor: color, flexShrink: 0 }} />
                            <span style={{ fontSize: '11px', fontWeight: '700', color }}>{sc.count}</span>
                            <span style={{ fontSize: '11px', color: '#666' }}>{label}</span>
                          </div>
                        )
                      })}
                    </div>
                  )}

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