'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Navbar from '@/components/layout/Navbar'
import Breadcrumb from '@/components/layout/Breadcrumb'

interface Offer {
  id: string
  title: string
  offer_identifier: string
  valid_days: number
}

interface EmirateConfig {
  id: string
  name: string
  code: string
  categories: string[]
  is_enabled: boolean
}

interface Profile {
  id: string
  full_name: string
  advisor_code: string | null
  user_role: string
}

export default function CreateCouponPage() {
  const router = useRouter()
  const supabase = createClient()

  const [profile, setProfile] = useState<Profile | null>(null)
  const [offers, setOffers] = useState<Offer[]>([])
  const [emirates, setEmirates] = useState<EmirateConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  const [success, setSuccess] = useState<{ coupons: any[]; sequenceNumber: number } | null>(null)

  const [form, setForm] = useState({
    offer_id: '',
    invoice_number: '',
    mobile_number: '',
    emirate: '',
    plate_category: '',
    plate_number: '',
  })

  const [errors, setErrors] = useState<Record<string, string>>({})

  const selectedOffer = offers.find(o => o.id === form.offer_id)
  const selectedEmirate = emirates.find(e => e.name === form.emirate)
  const availableCategories = selectedEmirate?.categories || []

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    const [{ data: profileData }, { data: offersData }, { data: emiratesData }] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).single(),
      supabase.from('offers').select('id, title, offer_identifier, valid_days').eq('is_active', true).order('title'),
      supabase.from('emirates_config').select('*').eq('is_enabled', true).order('sort_order'),
    ])

    if (profileData) setProfile(profileData)
    if (offersData) setOffers(offersData)
    if (emiratesData) setEmirates(emiratesData)
    setLoading(false)
  }

  function showToast(message: string, type: 'success' | 'error' = 'success') {
    setToast({ message, type })
    setTimeout(() => setToast(null), 4000)
  }

  function validateInvoiceNumber(val: string) {
    return /^[A-Za-z]\d+$/.test(val)
  }

  function validateMobile(mobile: string) {
    return /^5\d{8}$/.test(mobile.replace(/\s/g, ''))
  }

  function buildCouponCode(sequenceNumber: number, invoiceNumber: string, type: 'M' | 'B', plate: string) {
    const seq = String(sequenceNumber).padStart(3, '0')
    return `${seq}_${invoiceNumber.toUpperCase()}_AUTOVERSA_${type}_${plate.toUpperCase()}`
  }

  function validate() {
    const newErrors: Record<string, string> = {}
    if (!form.offer_id) newErrors.offer_id = 'Please select an offer'
    if (!form.invoice_number) {
      newErrors.invoice_number = 'Invoice number is required'
    } else if (!validateInvoiceNumber(form.invoice_number)) {
      newErrors.invoice_number = 'Must start with a letter followed by numbers only (e.g. A12345)'
    }
    if (!form.mobile_number) {
      newErrors.mobile_number = 'Mobile number is required'
    } else if (!validateMobile(form.mobile_number)) {
      newErrors.mobile_number = 'Enter a valid UAE mobile (5XXXXXXXX)'
    }
    if (!form.emirate) newErrors.emirate = 'Please select an emirate'
    if (!form.plate_category) newErrors.plate_category = 'Please select a category'
    if (!form.plate_number) {
      newErrors.plate_number = 'Plate number is required'
    } else if (!/^\d{1,5}$/.test(form.plate_number)) {
      newErrors.plate_number = 'Plate number must be 1-5 digits'
    }
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  async function handleSubmit() {
    if (!validate()) return
    if (!selectedOffer || !profile) return

    setSubmitting(true)

    const { data: seqData, error: seqError } = await supabase
      .rpc('increment_coupon_sequence', { p_offer_id: selectedOffer.id })

    if (seqError || seqData === null) {
      showToast('Failed to generate sequence number. Please try again.', 'error')
      setSubmitting(false)
      return
    }

    const sequenceNumber: number = seqData

    const issueDate = new Date()
    const expiryDate = new Date()
    expiryDate.setDate(expiryDate.getDate() + selectedOffer.valid_days)
    const issueDateStr = issueDate.toISOString().split('T')[0]
    const expiryDateStr = expiryDate.toISOString().split('T')[0]

    const emirateCode = selectedEmirate?.code || form.emirate
    const plate = `${emirateCode}${form.plate_category}${form.plate_number}`.toUpperCase()

    const mCouponCode = buildCouponCode(sequenceNumber, form.invoice_number, 'M', plate)
    const bCouponCode = buildCouponCode(sequenceNumber, form.invoice_number, 'B', plate)

    const baseFields = {
      offer_id: selectedOffer.id,
      offer_title: selectedOffer.title,
      offer_identifier: selectedOffer.offer_identifier,
      issued_by: profile.id,
      advisor_name: profile.full_name,
      advisor_code: profile.advisor_code,
      invoice_number: form.invoice_number.toUpperCase(),
      sequence_number: sequenceNumber,
      plate_number: form.plate_number,
      plate_category: form.plate_category,
      plate_region: form.emirate,
      plate_combined_string: plate,
      mobile_number: form.mobile_number,
      issue_date: issueDateStr,
      expiry_date: expiryDateStr,
      valid_days: selectedOffer.valid_days,
      status: 'ACTIVE',
      redemption_count: 0,
    }

    // Insert M coupon first to get its ID
    const { data: mData, error: mError } = await supabase
      .from('coupons')
      .insert({ ...baseFields, coupon_code: mCouponCode, coupon_type: 'M', identifier_type: 'PLATE' })
      .select()
      .single()

    if (mError || !mData) {
      showToast('Failed to create M coupon. Please try again.', 'error')
      setSubmitting(false)
      return
    }

    // Insert B coupon with parent_coupon_id pointing to M coupon
    const { data: bData, error: bError } = await supabase
      .from('coupons')
      .insert({ ...baseFields, coupon_code: bCouponCode, coupon_type: 'B', identifier_type: 'PLATE', parent_coupon_id: mData.id })
      .select()
      .single()

    if (bError || !bData) {
      showToast('Failed to create B coupon. Please try again.', 'error')
      setSubmitting(false)
      return
    }

    setSuccess({ coupons: [mData, bData], sequenceNumber })
    setSubmitting(false)
  }

  function resetForm() {
    setSuccess(null)
    setForm({
      offer_id: '',
      invoice_number: '',
      mobile_number: '',
      emirate: '',
      plate_category: '',
      plate_number: '',
    })
    setErrors({})
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#F7F7F7', paddingTop: '16px' }}>
        <Navbar />
        <main style={{ padding: '0 32px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '32px' }}>
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} style={{
                height: '56px', backgroundColor: '#E0E0E0', borderRadius: '10px',
                animation: 'pulse 1.5s ease-in-out infinite',
              }} />
            ))}
          </div>
        </main>
        <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }`}</style>
      </div>
    )
  }

  if (success) {
    return (
      <SuccessScreen
        coupons={success.coupons}
        offer={selectedOffer!}
        sequenceNumber={success.sequenceNumber}
        onCreateAnother={resetForm}
      />
    )
  }

  const canPreview = !!(
    selectedOffer &&
    form.invoice_number && validateInvoiceNumber(form.invoice_number) &&
    form.emirate && form.plate_category && form.plate_number
  )

  const previewPlate = canPreview
    ? `${selectedEmirate?.code || form.emirate}${form.plate_category}${form.plate_number}`.toUpperCase()
    : ''

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#F7F7F7', paddingTop: '16px' }}>
      <style>{`
        @keyframes slideIn { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }
        input:focus, select:focus { border-color: #0074BD !important; outline: none; }
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
          { label: 'Coupons', href: '/coupons' },
          { label: 'Create Coupon' },
        ]} />

        <div style={{ marginBottom: '28px' }}>
          <h1 style={{ fontSize: '22px', fontWeight: '700', color: '#1A1A1A', margin: 0 }}>
            Create Coupon
          </h1>
          <p style={{ color: '#666', fontSize: '14px', marginTop: '4px' }}>
            Issuing as <strong>{profile?.full_name}</strong>
            {profile?.advisor_code && (
              <span style={{ marginLeft: '6px', fontFamily: 'monospace', fontSize: '12px', backgroundColor: '#EEF2FF', color: '#162860', padding: '2px 8px', borderRadius: '4px' }}>
                {profile.advisor_code}
              </span>
            )}
          </p>
        </div>

        <div style={{
          backgroundColor: '#FFFFFF', borderRadius: '16px',
          padding: '28px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
          display: 'flex', flexDirection: 'column', gap: '20px',
        }}>

          {/* Offer Selection */}
          <div>
            <label style={labelStyle}>Select Offer *</label>
            <select
              style={{ ...inputStyle, ...(errors.offer_id ? errorBorderStyle : {}) }}
              value={form.offer_id}
              onChange={e => setForm(f => ({ ...f, offer_id: e.target.value }))}
            >
              <option value="">Choose an active offer...</option>
              {offers.map(o => (
                <option key={o.id} value={o.id}>
                  {o.title} — {o.valid_days} days
                </option>
              ))}
            </select>
            {errors.offer_id && <p style={errorStyle}>{errors.offer_id}</p>}
          </div>

          {/* Invoice Number */}
          <div>
            <label style={labelStyle}>Invoice / Job Number *</label>
            <input
              style={{ ...inputStyle, ...(errors.invoice_number ? errorBorderStyle : {}) }}
              value={form.invoice_number}
              onChange={e => {
                const val = e.target.value.replace(/[^A-Za-z0-9]/g, '')
                setForm(f => ({ ...f, invoice_number: val }))
              }}
              placeholder="e.g. A12345"
              maxLength={20}
            />
            {errors.invoice_number && <p style={errorStyle}>{errors.invoice_number}</p>}
            <p style={{ fontSize: '12px', color: '#888', marginTop: '4px' }}>
              Must start with one letter followed by numbers only.
            </p>
          </div>

          {/* Mercedes Plate */}
          <div style={{
            backgroundColor: '#F7F9FF', borderRadius: '12px',
            padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px',
            border: '1px solid #E0E8FF',
          }}>
            <p style={{ fontSize: '13px', fontWeight: '600', color: '#162860', margin: 0 }}>
              Mercedes Plate (Customer Vehicle)
            </p>

            <div>
              <label style={labelStyle}>Emirate *</label>
              <select
                style={{ ...inputStyle, ...(errors.emirate ? errorBorderStyle : {}) }}
                value={form.emirate}
                onChange={e => setForm(f => ({ ...f, emirate: e.target.value, plate_category: '' }))}
              >
                <option value="">Select emirate...</option>
                {emirates.map(em => (
                  <option key={em.id} value={em.name}>{em.name}</option>
                ))}
              </select>
              {errors.emirate && <p style={errorStyle}>{errors.emirate}</p>}
            </div>

            <div>
              <label style={labelStyle}>Plate Category *</label>
              <select
                style={{ ...inputStyle, ...(errors.plate_category ? errorBorderStyle : {}) }}
                value={form.plate_category}
                onChange={e => setForm(f => ({ ...f, plate_category: e.target.value }))}
                disabled={!form.emirate}
              >
                <option value="">{form.emirate ? 'select category...' : 'Select emirate first'}</option>
                {availableCategories.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
              {errors.plate_category && <p style={errorStyle}>{errors.plate_category}</p>}
            </div>

            <div>
              <label style={labelStyle}>Plate Number *</label>
              <input
                style={{ ...inputStyle, ...(errors.plate_number ? errorBorderStyle : {}) }}
                value={form.plate_number}
                onChange={e => {
                  const val = e.target.value.replace(/\D/g, '').slice(0, 5)
                  setForm(f => ({ ...f, plate_number: val }))
                }}
                placeholder="Up to 5 digits"
                maxLength={5}
                inputMode="numeric"
              />
              {errors.plate_number && <p style={errorStyle}>{errors.plate_number}</p>}

              {form.emirate && form.plate_category && form.plate_number && (
                <div style={{
                  marginTop: '8px', padding: '8px 12px',
                  backgroundColor: '#162860', borderRadius: '8px',
                  display: 'inline-flex', alignItems: 'center', gap: '8px',
                }}>
                  <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)' }}>Plate:</span>
                  <span style={{ fontSize: '13px', fontWeight: '700', color: '#FFFFFF', fontFamily: 'monospace' }}>
                    {form.emirate} · {form.plate_category} · {form.plate_number}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Mobile Number */}
          <div>
            <label style={labelStyle}>Mobile Number (Contact Only) *</label>
            <div style={{
              display: 'flex',
              border: `1.5px solid ${errors.mobile_number ? '#D0021B' : '#E0E0E0'}`,
              borderRadius: '8px', overflow: 'hidden',
              backgroundColor: '#FFFFFF',
            }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                padding: '10px 12px',
                backgroundColor: '#F7F7F7',
                borderRight: '1.5px solid #E0E0E0',
                flexShrink: 0,
              }}>
                <span style={{ fontSize: '18px', lineHeight: '1' }}>🇦🇪</span>
                <span style={{ fontSize: '14px', fontWeight: '600', color: '#1A1A1A' }}>+971</span>
              </div>
              <input
                style={{
                  flex: 1, padding: '10px 12px', fontSize: '14px',
                  border: 'none', outline: 'none',
                  backgroundColor: '#FFFFFF', color: '#1A1A1A',
                  fontFamily: 'inherit',
                }}
                value={form.mobile_number}
                onChange={e => {
                  const val = e.target.value.replace(/\D/g, '').slice(0, 9)
                  setForm(f => ({ ...f, mobile_number: val }))
                }}
                placeholder="5XXXXXXXX"
                maxLength={9}
                inputMode="numeric"
              />
            </div>
            {errors.mobile_number && <p style={errorStyle}>{errors.mobile_number}</p>}
            <p style={{ fontSize: '12px', color: '#888', marginTop: '4px' }}>
              Used for WhatsApp sharing only. Not embedded in coupon codes.
            </p>
          </div>

          {/* Code Preview */}
          {canPreview && (
            <div style={{
              backgroundColor: '#F0F7FF', borderRadius: '12px',
              padding: '16px', border: '1px solid #C7DCFF',
            }}>
              <p style={{ fontSize: '12px', color: '#666', margin: '0 0 10px', fontWeight: '600' }}>
                Coupon codes that will be generated:
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{
                    fontSize: '10px', fontWeight: '700', padding: '2px 8px',
                    backgroundColor: '#162860', color: '#FFFFFF', borderRadius: '4px', flexShrink: 0,
                  }}>M</span>
                  <code style={{ fontSize: '12px', fontWeight: '700', color: '#162860', wordBreak: 'break-all' }}>
                    ???_{form.invoice_number.toUpperCase()}_AUTOVERSA_M_{previewPlate}
                  </code>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{
                    fontSize: '10px', fontWeight: '700', padding: '2px 8px',
                    backgroundColor: '#0074BD', color: '#FFFFFF', borderRadius: '4px', flexShrink: 0,
                  }}>B</span>
                  <code style={{ fontSize: '12px', fontWeight: '700', color: '#0074BD', wordBreak: 'break-all' }}>
                    ???_{form.invoice_number.toUpperCase()}_AUTOVERSA_B_{previewPlate}
                  </code>
                </div>
              </div>
              <p style={{ fontSize: '11px', color: '#888', margin: '10px 0 0' }}>
                Sequence number (???) assigned on submission.
              </p>
            </div>
          )}

          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={submitting}
            style={{
              width: '100%', padding: '14px',
              backgroundColor: submitting ? '#93C5E8' : '#0074BD',
              color: '#FFFFFF', border: 'none', borderRadius: '10px',
              fontSize: '15px', fontWeight: '700',
              cursor: submitting ? 'not-allowed' : 'pointer',
              marginTop: '4px',
            }}
          >
            {submitting ? 'Generating coupons...' : 'Generate 2 Coupons (M + B)'}
          </button>

        </div>
      </main>
    </div>
  )
}

function SuccessScreen({ coupons, offer, sequenceNumber, onCreateAnother }: {
  coupons: any[]
  offer: Offer
  sequenceNumber: number
  onCreateAnother: () => void
}) {
  const router = useRouter()
  const supabase = createClient()
  const [downloading, setDownloading] = useState<Record<string, boolean>>({})

  async function downloadCouponJPG(coupon: any) {
    setDownloading(d => ({ ...d, [coupon.id]: true }))
    try {
      const { data: template } = await supabase
        .from('templates')
        .select('*, template_variable_positions(*)')
        .eq('offer_id', coupon.offer_id)
        .eq('is_active', true)
        .single()

      if (!template || !template.file_url) {
        alert('No template configured for this offer. Ask an admin to set up the coupon template.')
        setDownloading(d => ({ ...d, [coupon.id]: false }))
        return
      }

      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.src = template.file_url

      img.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width = template.image_width || img.naturalWidth
        canvas.height = template.image_height || img.naturalHeight
        const ctx = canvas.getContext('2d')!
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

        const VARIABLE_VALUES: Record<string, string> = {
          coupon_code: coupon.coupon_code,
          expiry_date: coupon.expiry_date,
          advisor_name: coupon.advisor_name,
          offer_title: coupon.offer_title,
          plate_number: coupon.plate_combined_string || '',
          mobile_number: coupon.mobile_number ? `+971${coupon.mobile_number}` : '',
        }

        const positions: any[] = template.template_variable_positions || []
        positions.forEach((pos: any) => {
          const key = pos.variable_key.toLowerCase()
          const value = VARIABLE_VALUES[key] || ''
          if (!value) return
          const x = (pos.x_coordinate / 100) * canvas.width
          const y = (pos.y_coordinate / 100) * canvas.height
          ctx.font = `${pos.font_weight || 'normal'} ${pos.font_size || 24}px ${template.font_family || 'Arial'}`
          ctx.fillStyle = pos.font_color || template.text_color || '#000000'
          ctx.fillText(value, x, y)
        })

        const link = document.createElement('a')
        link.download = `${coupon.coupon_code}.jpg`
        link.href = canvas.toDataURL('image/jpeg', 0.95)
        link.click()
        setDownloading(d => ({ ...d, [coupon.id]: false }))
      }

      img.onerror = () => {
        alert('Failed to load template image.')
        setDownloading(d => ({ ...d, [coupon.id]: false }))
      }
    } catch {
      alert('Download failed. Please try again.')
      setDownloading(d => ({ ...d, [coupon.id]: false }))
    }
  }

  function handleWhatsApp(coupon: any) {
    const message = encodeURIComponent(
      `Hi! Here is your AutoVersa coupon\n\nCoupon Code: ${coupon.coupon_code}\nOffer: ${coupon.offer_title}\nExpiry: ${coupon.expiry_date}\n\nPlease present this code at the service centre.`
    )
    window.open(`https://wa.me/971${coupon.mobile_number}?text=${message}`, '_blank')
  }

  const mCoupon = coupons.find(c => c.coupon_type === 'M')
  const bCoupon = coupons.find(c => c.coupon_type === 'B')

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#F7F7F7', paddingTop: '16px' }}>
      <style>{`@keyframes slideIn { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }`}</style>
      <Navbar />
      <main style={{ padding: '0 32px 48px' }}>
        <Breadcrumb items={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Coupons', href: '/coupons' },
          { label: 'Create Coupon', href: '/create-coupon' },
          { label: 'Success' },
        ]} />

        <div style={{
          backgroundColor: '#FFFFFF', borderRadius: '16px',
          padding: '32px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
          marginBottom: '16px', textAlign: 'center',
        }}>
          <div style={{ fontSize: '48px', marginBottom: '12px' }}>✅</div>
          <h1 style={{ fontSize: '22px', fontWeight: '700', color: '#1A1A1A', margin: '0 0 8px' }}>
            2 Coupons Created!
          </h1>
          <p style={{ color: '#666', fontSize: '14px', margin: '0 0 4px' }}>
            Offer: <strong>{offer?.title}</strong>
          </p>
          <p style={{ color: '#888', fontSize: '13px', margin: 0, fontFamily: 'monospace' }}>
            Sequence #{String(sequenceNumber).padStart(3, '0')}
          </p>
        </div>

        {mCoupon && (
          <div style={{
            backgroundColor: '#FFFFFF', borderRadius: '16px',
            padding: '24px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
            marginBottom: '12px', borderLeft: '4px solid #162860',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <span style={{ fontSize: '11px', fontWeight: '700', padding: '3px 10px', backgroundColor: '#162860', color: '#FFFFFF', borderRadius: '4px' }}>M — Mercedes</span>
                  <span style={{ fontSize: '12px', color: '#666' }}>Single-use · Tied to plate</span>
                </div>
                <p style={{ fontSize: '16px', fontWeight: '800', color: '#162860', margin: 0, fontFamily: 'monospace', wordBreak: 'break-all' }}>
                  {mCoupon.coupon_code}
                </p>
              </div>
              <span style={{ fontSize: '11px', fontWeight: '600', padding: '4px 10px', borderRadius: '100px', backgroundColor: '#dcfce7', color: '#16a34a', flexShrink: 0 }}>ACTIVE</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '16px' }}>
              <div style={infoBoxStyle}><p style={infoLabelStyle}>Issue Date</p><p style={infoValueStyle}>{mCoupon.issue_date}</p></div>
              <div style={infoBoxStyle}><p style={infoLabelStyle}>Expiry Date</p><p style={{ ...infoValueStyle, color: '#D0021B' }}>{mCoupon.expiry_date}</p></div>
              <div style={infoBoxStyle}><p style={infoLabelStyle}>Plate</p><p style={{ ...infoValueStyle, fontFamily: 'monospace' }}>{mCoupon.plate_combined_string}</p></div>
              <div style={infoBoxStyle}><p style={infoLabelStyle}>Valid Days</p><p style={infoValueStyle}>{mCoupon.valid_days} days</p></div>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => downloadCouponJPG(mCoupon)} disabled={downloading[mCoupon.id]}
                style={{ flex: 1, padding: '12px', backgroundColor: downloading[mCoupon.id] ? '#93C5E8' : '#162860', color: '#FFFFFF', border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: '600', cursor: downloading[mCoupon.id] ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                {downloading[mCoupon.id] ? '⏳ Generating...' : '⬇️ Download JPG'}
              </button>
              <button onClick={() => handleWhatsApp(mCoupon)}
                style={{ flex: 1, padding: '12px', backgroundColor: '#25D366', color: '#FFFFFF', border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                📲 WhatsApp
              </button>
            </div>
          </div>
        )}

        {bCoupon && (
          <div style={{
            backgroundColor: '#FFFFFF', borderRadius: '16px',
            padding: '24px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
            marginBottom: '12px', borderLeft: '4px solid #0074BD',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <span style={{ fontSize: '11px', fontWeight: '700', padding: '3px 10px', backgroundColor: '#0074BD', color: '#FFFFFF', borderRadius: '4px' }}>B — BMW Referral</span>
                  <span style={{ fontSize: '12px', color: '#666' }}>Multi-use · Per-plate limit</span>
                </div>
                <p style={{ fontSize: '16px', fontWeight: '800', color: '#0074BD', margin: 0, fontFamily: 'monospace', wordBreak: 'break-all' }}>
                  {bCoupon.coupon_code}
                </p>
              </div>
              <span style={{ fontSize: '11px', fontWeight: '600', padding: '4px 10px', borderRadius: '100px', backgroundColor: '#dcfce7', color: '#16a34a', flexShrink: 0 }}>ACTIVE</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '16px' }}>
              <div style={infoBoxStyle}><p style={infoLabelStyle}>Issue Date</p><p style={infoValueStyle}>{bCoupon.issue_date}</p></div>
              <div style={infoBoxStyle}><p style={infoLabelStyle}>Expiry Date</p><p style={{ ...infoValueStyle, color: '#D0021B' }}>{bCoupon.expiry_date}</p></div>
              <div style={infoBoxStyle}><p style={infoLabelStyle}>Ref. Plate</p><p style={{ ...infoValueStyle, fontFamily: 'monospace' }}>{bCoupon.plate_combined_string}</p></div>
              <div style={infoBoxStyle}><p style={infoLabelStyle}>Valid Days</p><p style={infoValueStyle}>{bCoupon.valid_days} days</p></div>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => downloadCouponJPG(bCoupon)} disabled={downloading[bCoupon.id]}
                style={{ flex: 1, padding: '12px', backgroundColor: downloading[bCoupon.id] ? '#93C5E8' : '#0074BD', color: '#FFFFFF', border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: '600', cursor: downloading[bCoupon.id] ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                {downloading[bCoupon.id] ? '⏳ Generating...' : '⬇️ Download JPG'}
              </button>
              <button onClick={() => handleWhatsApp(bCoupon)}
                style={{ flex: 1, padding: '12px', backgroundColor: '#25D366', color: '#FFFFFF', border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                📲 WhatsApp
              </button>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
          <button onClick={onCreateAnother}
            style={{ flex: 1, padding: '12px', backgroundColor: '#0074BD', color: '#FFFFFF', border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}>
            Create Another
          </button>
          <button onClick={() => router.push('/coupons')}
            style={{ flex: 1, padding: '12px', backgroundColor: '#F0F0F0', color: '#444', border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}>
            View All Coupons
          </button>
        </div>
      </main>
    </div>
  )
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: '13px', fontWeight: '600', color: '#1A1A1A', marginBottom: '6px',
}
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px', fontSize: '14px',
  border: '1.5px solid #E0E0E0', borderRadius: '8px', outline: 'none',
  backgroundColor: '#FFFFFF', color: '#1A1A1A',
  boxSizing: 'border-box', fontFamily: 'inherit',
}
const errorBorderStyle: React.CSSProperties = { borderColor: '#D0021B' }
const errorStyle: React.CSSProperties = { fontSize: '12px', color: '#D0021B', marginTop: '4px' }
const infoBoxStyle: React.CSSProperties = { backgroundColor: '#F7F7F7', borderRadius: '8px', padding: '10px' }
const infoLabelStyle: React.CSSProperties = { fontSize: '11px', color: '#888', margin: '0 0 2px' }
const infoValueStyle: React.CSSProperties = { fontSize: '13px', fontWeight: '600', color: '#1A1A1A', margin: 0 }

export const dynamic = 'force-dynamic'