import Navbar from '@/components/layout/Navbar'

export default function DashboardPage() {
  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#F7F7F7', paddingTop: '16px' }}>
      <Navbar />
      <main style={{ padding: '0 32px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#1A1A1A' }}>
          Dashboard
        </h1>
        <p style={{ color: '#666666', marginTop: '8px' }}>Welcome to AutoVersa Coupon Manager.</p>
      </main>
    </div>
  )
}