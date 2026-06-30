'use client'

import Navbar from '@/components/layout/Navbar'

interface PageSkeletonProps {
  layout?: 'table' | 'cards' | 'stats-table' | 'stats-charts'
  breadcrumb?: string
}

export default function PageSkeleton({ layout = 'table', breadcrumb }: PageSkeletonProps) {
  const widths = [80, 120, 60, 100, 90]

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#F7F7F7', paddingTop: '16px' }}>
      <style>{`
        @keyframes skeletonPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        .sk { animation: skeletonPulse 1.5s ease-in-out infinite; background-color: #E0E0E0; border-radius: 8px; }
      `}</style>
      <Navbar />
      <main style={{ padding: '0 32px 48px' }}>

        {/* Breadcrumb skeleton */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '24px', marginTop: '4px' }}>
          <div className="sk" style={{ width: '70px', height: '14px' }} />
          <div style={{ color: '#CCC', fontSize: '12px' }}>›</div>
          <div className="sk" style={{ width: '100px', height: '14px' }} />
          {breadcrumb && <>
            <div style={{ color: '#CCC', fontSize: '12px' }}>›</div>
            <div className="sk" style={{ width: '120px', height: '14px' }} />
          </>}
        </div>

        {/* Page title skeleton */}
        <div style={{ marginBottom: '28px' }}>
          <div className="sk" style={{ width: '180px', height: '26px', marginBottom: '8px' }} />
          <div className="sk" style={{ width: '260px', height: '14px' }} />
        </div>

        {/* Stats cards row — shown for stats-table and stats-charts */}
        {(layout === 'stats-table' || layout === 'stats-charts') && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '14px', marginBottom: '28px' }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} style={{ backgroundColor: '#FFFFFF', borderRadius: '14px', padding: '16px 18px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                <div className="sk" style={{ width: '80px', height: '11px', marginBottom: '10px' }} />
                <div className="sk" style={{ width: '60px', height: '26px' }} />
              </div>
            ))}
          </div>
        )}

        {/* Charts row — shown for stats-charts only */}
        {layout === 'stats-charts' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '24px' }}>
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} style={{ backgroundColor: '#FFFFFF', borderRadius: '16px', padding: '24px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                <div className="sk" style={{ width: '160px', height: '14px', marginBottom: '8px' }} />
                <div className="sk" style={{ width: '100px', height: '11px', marginBottom: '20px' }} />
                <div className="sk" style={{ width: '100%', height: '220px', borderRadius: '12px' }} />
              </div>
            ))}
          </div>
        )}

        {/* Cards layout — shown for cards only */}
        {layout === 'cards' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} style={{ backgroundColor: '#FFFFFF', borderRadius: '16px', padding: '24px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
                  <div>
                    <div className="sk" style={{ width: '200px', height: '16px', marginBottom: '8px' }} />
                    <div className="sk" style={{ width: '120px', height: '12px' }} />
                  </div>
                  <div className="sk" style={{ width: '80px', height: '14px' }} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '12px', marginBottom: '16px' }}>
                  {Array.from({ length: 5 }).map((_, j) => (
                    <div key={j} style={{ backgroundColor: '#F7F7F7', borderRadius: '10px', padding: '10px 12px' }}>
                      <div className="sk" style={{ width: '60px', height: '11px', marginBottom: '6px' }} />
                      <div className="sk" style={{ width: '40px', height: '18px' }} />
                    </div>
                  ))}
                </div>
                <div className="sk" style={{ width: '100%', height: '6px', borderRadius: '100px' }} />
              </div>
            ))}
          </div>
        )}

        {/* Table layout — shown for table and stats-table */}
        {(layout === 'table' || layout === 'stats-table') && (
          <div style={{ backgroundColor: '#FFFFFF', borderRadius: '16px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
            {/* Table header */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '16px', padding: '14px 24px', backgroundColor: '#F7F7F7', borderBottom: '1px solid #E0E0E0' }}>
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="sk" style={{ height: '11px', width: `${60 + i * 10}px` }} />
              ))}
            </div>
            {/* Table rows */}
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '16px', padding: '16px 24px', borderBottom: '1px solid #F5F5F5', animationDelay: `${i * 0.05}s` }}>
                {Array.from({ length: 5 }).map((_, j) => (
                  <div key={j} className="sk" style={{ height: '13px', width: `${widths[(i * 5 + j) % 5]}px` }} />
                ))}
              </div>
            ))}
          </div>
        )}

      </main>
    </div>
  )
}
