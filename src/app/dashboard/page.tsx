'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Navbar from '@/components/layout/Navbar'

interface Profile {
  id: string
  full_name: string
  email: string
  user_role: string
  advisor_code: string | null
}

interface DashboardStats {
  totalCoupons: number
  activeCoupons: number
  redeemedCoupons: number
  expiredCoupons: number
  todaysCoupons: number
  totalAdvisors: number
}

function StatCard({
  label,
  value,
  color,
  loading,
}: {
  label: string
  value: number
  color: string
  loading: boolean
}) {
  return (
    <div style={{
      backgroundColor: '#FFFFFF',
      borderRadius: '16px',
      padding: '24px',
      boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
      borderLeft: `4px solid ${color}`,
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
    }}>
      <p style={{ fontSize: '13px', color: '#666666', fontWeight: '500', margin: 0 }}>
        {label}
      </p>
      {loading ? (
        <div style={{
          height: '36px',
          width: '80px',
          backgroundColor: '#F0F0F0',
          borderRadius: '8px',
          animation: 'pulse 1.5s ease-in-out infinite',
        }} />
      ) : (
        <p style={{
          fontSize: '36px',
          fontWeight: '700',
          color: '#1A1A1A',
          margin: 0,
          lineHeight: 1,
        }}>
          {value.toLocaleString()}
        </p>
      )}
    </div>
  )
}

function RecentCouponRow({ coupon }: { coupon: any }) {
  const statusColors: Record<string, string> = {
    ACTIVE: '#0074BD',
    REDEEMED: '#16a34a',
    EXPIRED: '#666666',
    CANCELLED: '#D0021B',
  }

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '14px 0',
      borderBottom: '1px solid #F0F0F0',
    }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
        <span style={{ fontSize: '14px', fontWeight: '600', color: '#1A1A1A' }}>
          {coupon.coupon_code}
        </span>
        <span style={{ fontSize: '12px', color: '#666666' }}>
          {coupon.customer_name || 'Unknown'} · {coupon.advisor_name || 'Unknown Advisor'}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <span style={{ fontSize: '12px', color: '#666666' }}>
          {new Date(coupon.issue_date).toLocaleDateString('en-GB', {
            day: 'numeric', month: 'short', year: 'numeric'
          })}
        </span>
        <span style={{
          fontSize: '11px',
          fontWeight: '600',
          padding: '4px 10px',
          borderRadius: '100px',
          backgroundColor: `${statusColors[coupon.status] || '#666666'}18`,
          color: statusColors[coupon.status] || '#666666',
        }}>
          {coupon.status}
        </span>
      </div>
    </div>
  )
}

export default function DashboardPage() {
  const router = useRouter()
  const supabase = createClient()

  const [profile, setProfile] = useState<Profile | null>(null)
  const [stats, setStats] = useState<DashboardStats>({
    totalCoupons: 0,
    activeCoupons: 0,
    redeemedCoupons: 0,
    expiredCoupons: 0,
    todaysCoupons: 0,
    totalAdvisors: 0,
  })
  const [recentCoupons, setRecentCoupons] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadDashboard() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()

      if (profileData) setProfile(profileData)

      const isAdvisor = profileData?.user_role === 'SERVICE_ADVISOR' ||
        profileData?.user_role === 'BMW_SERVICE_ADVISOR'

      let query = supabase.from('coupons').select('*', { count: 'exact', head: true })
      if (isAdvisor) query = query.eq('issued_by', user.id)

      const [
        { count: total },
        { count: active },
        { count: redeemed },
        { count: expired },
        { count: advisors },
      ] = await Promise.all([
        supabase.from('coupons').select('*', { count: 'exact', head: true })
          .then(r => isAdvisor ? supabase.from('coupons').select('*', { count: 'exact', head: true }).eq('issued_by', user.id) : r),
        supabase.from('coupons').select('*', { count: 'exact', head: true })
          .eq('status', 'ACTIVE')
          .then(r => isAdvisor ? supabase.from('coupons').select('*', { count: 'exact', head: true }).eq('status', 'ACTIVE').eq('issued_by', user.id) : r),
        supabase.from('coupons').select('*', { count: 'exact', head: true })
          .eq('status', 'REDEEMED')
          .then(r => isAdvisor ? supabase.from('coupons').select('*', { count: 'exact', head: true }).eq('status', 'REDEEMED').eq('issued_by', user.id) : r),
        supabase.from('coupons').select('*', { count: 'exact', head: true })
          .eq('status', 'EXPIRED')
          .then(r => isAdvisor ? supabase.from('coupons').select('*', { count: 'exact', head: true }).eq('status', 'EXPIRED').eq('issued_by', user.id) : r),
        supabase.from('profiles').select('*', { count: 'exact', head: true })
          .in('user_role', ['SERVICE_ADVISOR', 'BMW_SERVICE_ADVISOR']),
      ])

      const today = new Date().toISOString().split('T')[0]
      let todayQuery = supabase.from('coupons').select('*', { count: 'exact', head: true }).gte('issue_date', today)
      if (isAdvisor) todayQuery = todayQuery.eq('issued_by', user.id)
      const { count: todayCount } = await todayQuery

      setStats({
        totalCoupons: total || 0,
        activeCoupons: active || 0,
        redeemedCoupons: redeemed || 0,
        expiredCoupons: expired || 0,
        todaysCoupons: todayCount || 0,
        totalAdvisors: advisors || 0,
      })

      let recentQuery = supabase.from('coupons')
        .select('coupon_code, customer_name, advisor_name, issue_date, status')
        .order('created_at', { ascending: false })
        .limit(8)
      if (isAdvisor) recentQuery = recentQuery.eq('issued_by', user.id)
      const { data: recent } = await recentQuery
      setRecentCoupons(recent || [])

      setLoading(false)
    }

    loadDashboard()
  }, [])

  const isAdvisor = profile?.user_role === 'SERVICE_ADVISOR' ||
    profile?.user_role === 'BMW_SERVICE_ADVISOR'

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#F7F7F7', paddingTop: '16px' }}>
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>

      <Navbar />

      <main style={{ padding: '0 32px 48px' }}>

        {/* Header */}
        <div style={{ marginBottom: '32px' }}>
          {loading ? (
            <div style={{
              height: '28px', width: '240px', backgroundColor: '#E0E0E0',
              borderRadius: '8px', animation: 'pulse 1.5s ease-in-out infinite'
            }} />
          ) : (
            <h1 style={{ fontSize: '22px', fontWeight: '700', color: '#1A1A1A', margin: 0 }}>
              Good {getGreeting()}, {profile?.full_name?.split(' ')[0] || 'there'} 👋
            </h1>
          )}
          <p style={{ color: '#666666', fontSize: '14px', marginTop: '6px' }}>
            {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>

        {/* Stat Cards */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '16px',
          marginBottom: '32px',
        }}>
          <StatCard label="Total Coupons" value={stats.totalCoupons} color="#0074BD" loading={loading} />
          <StatCard label="Active" value={stats.activeCoupons} color="#16a34a" loading={loading} />
          <StatCard label="Redeemed" value={stats.redeemedCoupons} color="#9333ea" loading={loading} />
          <StatCard label="Expired" value={stats.expiredCoupons} color="#666666" loading={loading} />
          <StatCard label="Issued Today" value={stats.todaysCoupons} color="#f59e0b" loading={loading} />
          {!isAdvisor && (
            <StatCard label="Active Advisors" value={stats.totalAdvisors} color="#162860" loading={loading} />
          )}
        </div>

        {/* Recent Coupons */}
        <div style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '16px',
          padding: '24px',
          boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '8px',
          }}>
            <h2 style={{ fontSize: '16px', fontWeight: '700', color: '#1A1A1A', margin: 0 }}>
              Recent Coupons
            </h2>
            <button
              onClick={() => router.push('/coupons')}
              style={{
                fontSize: '13px',
                color: '#0074BD',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontWeight: '500',
              }}
            >
              View all →
            </button>
          </div>

          {loading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} style={{
                height: '48px',
                backgroundColor: '#F0F0F0',
                borderRadius: '8px',
                marginTop: '12px',
                animation: 'pulse 1.5s ease-in-out infinite',
              }} />
            ))
          ) : recentCoupons.length === 0 ? (
            <div style={{
              textAlign: 'center',
              padding: '48px 0',
              color: '#666666',
              fontSize: '14px',
            }}>
              No coupons issued yet.{' '}
              <span
                onClick={() => router.push('/create-coupon')}
                style={{ color: '#0074BD', cursor: 'pointer', fontWeight: '500' }}
              >
                Create the first one →
              </span>
            </div>
          ) : (
            recentCoupons.map(coupon => (
              <RecentCouponRow key={coupon.coupon_code} coupon={coupon} />
            ))
          )}
        </div>

      </main>
    </div>
  )
}

function getGreeting() {
  const hour = new Date().getHours()
  if (hour < 12) return 'morning'
  if (hour < 17) return 'afternoon'
  return 'evening'
}
export const dynamic = 'force-dynamic'

export const dynamic = 'force-dynamic'
