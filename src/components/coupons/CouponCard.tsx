import React from 'react'

interface CouponCardProps {
    couponCode: string
    expiryDate: string
    customerName?: string | null
    plateNumber?: string | null
    mobileNumber?: string | null
    offerVariables?: string[] | null
}

export function CouponCard({
    couponCode,
    expiryDate,
    customerName,
    plateNumber,
    mobileNumber,
    offerVariables,
}: CouponCardProps) {
    const show = (key: string) =>
        !offerVariables || offerVariables.length === 0 || offerVariables.includes(key)

    const formattedExpiry = (() => {
        try {
            return new Date(expiryDate).toLocaleDateString('en-GB', {
                day: 'numeric', month: 'long', year: 'numeric',
            })
        } catch { return expiryDate }
    })()

    return (
        <div
            id="autoversa-coupon-card"
            style={{
                width: '900px',
                height: '400px',
                backgroundColor: '#FFFFFF',
                borderRadius: '20px',
                boxShadow: '0 4px 32px rgba(0,0,0,0.10)',
                display: 'flex',
                flexDirection: 'row',
                overflow: 'hidden',
                fontFamily: 'Inter, sans-serif',
                position: 'relative',
            }}
        >
            {/* Left accent bar */}
            <div style={{
                width: '12px',
                backgroundColor: '#0074BD',
                flexShrink: 0,
            }} />

            {/* Main content */}
            <div style={{
                flex: 1,
                padding: '40px 48px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
            }}>

                {/* Top — Brand + tagline */}
                <div>
                    <p style={{
                        fontSize: '13px',
                        fontWeight: '700',
                        color: '#0074BD',
                        letterSpacing: '0.12em',
                        textTransform: 'uppercase',
                        margin: 0,
                    }}>
                        AutoVersa Service Coupon
                    </p>
                </div>

                {/* Middle — Customer details */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {show('customer_name') && customerName && (
                        <div>
                            <p style={{ fontSize: '12px', color: '#888', margin: '0 0 2px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Customer</p>
                            <p style={{ fontSize: '22px', fontWeight: '700', color: '#1A1A1A', margin: 0 }}>{customerName}</p>
                        </div>
                    )}

                    <div style={{ display: 'flex', gap: '40px', flexWrap: 'wrap' }}>
                        {show('plate_number') && plateNumber && (
                            <div>
                                <p style={{ fontSize: '12px', color: '#888', margin: '0 0 2px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Plate</p>
                                <p style={{ fontSize: '16px', fontWeight: '600', color: '#1A1A1A', margin: 0 }}>{plateNumber}</p>
                            </div>
                        )}
                        {show('mobile_number') && mobileNumber && (
                            <div>
                                <p style={{ fontSize: '12px', color: '#888', margin: '0 0 2px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Mobile</p>
                                <p style={{ fontSize: '16px', fontWeight: '600', color: '#1A1A1A', margin: 0 }}>+971{mobileNumber}</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Bottom — Expiry */}
                <div>
                    <p style={{ fontSize: '12px', color: '#888', margin: '0 0 2px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Valid Until</p>
                    <p style={{ fontSize: '16px', fontWeight: '600', color: '#D0021B', margin: 0 }}>{formattedExpiry}</p>
                </div>

            </div>

            {/* Right panel — Coupon code */}
            <div style={{
                width: '280px',
                backgroundColor: '#F0F7FF',
                borderLeft: '2px dashed #0074BD',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '32px 24px',
                gap: '16px',
                flexShrink: 0,
            }}>
                <p style={{
                    fontSize: '11px',
                    fontWeight: '700',
                    color: '#0074BD',
                    letterSpacing: '0.12em',
                    textTransform: 'uppercase',
                    margin: 0,
                    textAlign: 'center',
                }}>
                    Coupon Code
                </p>

                {/* Code broken into segments */}
                <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '4px',
                }}>
                    {couponCode.split('_').map((segment, i) => (
                        <p key={i} style={{
                            fontSize: i === 0 ? '13px' : '15px',
                            fontWeight: '700',
                            color: i === 0 ? '#888' : '#162860',
                            fontFamily: 'monospace',
                            margin: 0,
                            letterSpacing: '0.05em',
                        }}>
                            {segment}
                        </p>
                    ))}
                </div>

                {/* Decorative dots */}
                <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
                    {[0, 1, 2].map(i => (
                        <div key={i} style={{
                            width: '6px', height: '6px', borderRadius: '50%',
                            backgroundColor: '#0074BD', opacity: 0.3 + i * 0.3,
                        }} />
                    ))}
                </div>
            </div>

        </div>
    )
}