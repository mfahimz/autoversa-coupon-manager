'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Navbar from '@/components/layout/Navbar'
import Breadcrumb from '@/components/layout/Breadcrumb'

const BMW_MODELS = [
  '1 Series', '2 Series Coupé', '2 Series Gran Coupé', '3 Series', '4 Series Coupé',
  '4 Series Gran Coupé', '4 Series Convertible', '5 Series', '7 Series', '8 Series Coupé',
  '8 Series Convertible', '8 Series Gran Coupé', 'X1', 'X2', 'X3', 'X4', 'X5', 'X6', 'X7', 'XM',
  'i4', 'i5', 'i7', 'iX', 'iX1', 'iX2', 'iX3', 'Z4',
  'M2', 'M3', 'M4', 'M5', 'M8', 'X3 M', 'X4 M', 'X5 M', 'X6 M',
]

interface Offer {
  id: string
  title: string
  offer_identifier: string
  valid_days: number
  coupon_code_structure: string | null
  offer_variables: string[] | null
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

type IdentifierType = 'PLATE' | 'MOBILE'

export default function CreateCouponPage() {
  const router = useRouter()
  const supabase = createClient()

  const [profile, setProfile] = useState<Profile | null>(null)
  const [offers, setOffers] = useState<Offer[]>([])
  const [emirates, setEmirates] = useState<EmirateConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  const [success, setSuccess] = useState<{ coupons: any[] } | null>(null)

  const [form, setForm] = useState({
    offer_id: '',
    mobile_number: '',
    identifier_type: 'PLATE' as IdentifierType,
    emirate: '',
    plate_category: '',
    plate_number: '',
    car_make: 'BMW',
    car_model: '',
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
      supabase.from('offers').select('id, title, offer_identifier, valid_days, coupon_code_structure, offer_variables').eq('is_active', true).order('title'),
      supabase.from('emirates_config').select('*').eq('is_enabled', true).order('sort_order'),
    ])

    if (profileData) setProfile(profileData)
    if (offersData) setOffers(offersData)
    if (emiratesData) setEmirates(emiratesData)

    setLoading(false)
  }

  function showToast(message: string, type: 'success' | 'error' = 'success') {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }

  function validateMobile(mobile: string) {
    const cleaned = mobile.replace(/\s/g, '')
    return /^5\d{8}$/.test(cleaned)
  }

  function getPlateLastFive() {
    if (form.identifier_type === 'PLATE') {
      const combined = `${form.plate_category}${form.plate_number}`
      return combined.slice(-5).toUpperCase()
    }
    return form.mobile_number.slice(-5)
  }

  function generateCouponCode(offer: Offer, identifierLast5: string) {
    const advisorCode = profile?.advisor_code || 'ADV'
    const structure = offer.coupon_code_structure ||
      `AUTOVERSA_${advisorCode}_${offer.offer_identifier}_${identifierLast5}`

    return structure
      .replace('[ADVISOR_CODE]', advisorCode)
      .replace('[OFFER_IDENTIFIER]', offer.offer_identifier)
      .replace('[PLATE_OR_MOBILE_LAST5]', identifierLast5)
      .toUpperCase()
  }

  function validate() {
    const newErrors: Record<string, string> = {}

    if (!form.offer_id) newErrors.offer_id = 'Please select an offer'
    if (!form.mobile_number) {
      newErrors.mobile_number = 'Mobile number is required'
    } else if (!validateMobile(form.mobile_number)) {
      newErrors.mobile_number = 'Enter a valid UAE mobile number (05XXXXXXXX)'
    }

    if (form.identifier_type === 'PLATE') {
      if (!form.emirate) newErrors.emirate = 'Please select an emirate'
      if (!form.plate_category) newErrors.plate_category = 'Please select a category'
      if (!form.plate_number) {
        newErrors.plate_number = 'Plate number is required'
      } else if (!/^\d{1,5}$/.test(form.plate_number)) {
        newErrors.plate_number = 'Plate number must be 1-5 digits'
      }
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  async function handleSubmit() {
    if (!validate()) return
    if (!selectedOffer || !profile) return

    setSubmitting(true)

    const issueDate = new Date()
    const expiryDate = new Date()
    expiryDate.setDate(expiryDate.getDate() + selectedOffer.valid_days)

    const issueDateStr = issueDate.toISOString().split('T')[0]
    const expiryDateStr = expiryDate.toISOString().split('T')[0]

    const mobileLast5 = form.mobile_number.slice(-5)
    const plateCombined = form.identifier_type === 'PLATE'
      ? `${form.emirate}-${form.plate_category}-${form.plate_number}`
      : null

    const plateLast5 = form.identifier_type === 'PLATE'
      ? `${form.plate_category}${form.plate_number}`.slice(-5).toUpperCase()
      : null

    const couponsToCreate = []

    if (form.identifier_type === 'PLATE') {
      // Coupon 1 — plate identifier
      const plateCode = generateCouponCode(selectedOffer, plateLast5!)
      couponsToCreate.push({
        coupon_code: plateCode,
        coupon_type: 'STANDARD',
        identifier_type: 'PLATE',
        plate_number: form.plate_number,
        plate_category: form.plate_category,
        plate_region: form.emirate,
        plate_combined_string: plateCombined,
        mobile_number: form.mobile_number,
        car_model: `BMW ${form.car_model}`,
        offer_id: selectedOffer.id,
        offer_title: selectedOffer.title,
        offer_identifier: selectedOffer.offer_identifier,
        issued_by: profile.id,
        advisor_name: profile.full_name,
        advisor_code: profile.advisor_code,
        issue_date: issueDateStr,
        expiry_date: expiryDateStr,
        valid_days: selectedOffer.valid_days,
        status: 'ACTIVE',
        redemption_count: 0,
      })

      // Coupon 2 — mobile identifier (auto-generated for plate customers)
      const mobileCode = generateCouponCode(selectedOffer, mobileLast5)
      couponsToCreate.push({
        coupon_code: mobileCode,
        coupon_type: 'STANDARD',
        identifier_type: 'MOBILE',
        plate_number: null,
        plate_category: null,
        plate_region: null,
        plate_combined_string: null,
        mobile_number: form.mobile_number,
        car_model: `BMW ${form.car_model}`,
        offer_id: selectedOffer.id,
        offer_title: selectedOffer.title,
        offer_identifier: selectedOffer.offer_identifier,
        issued_by: profile.id,
        advisor_name: profile.full_name,
        advisor_code: profile.advisor_code,
        issue_date: issueDateStr,
        expiry_date: expiryDateStr,
        valid_days: selectedOffer.valid_days,
        status: 'ACTIVE',
        redemption_count: 0,
      })
    } else {
      // Mobile only — single coupon
      const mobileCode = generateCouponCode(selectedOffer, mobileLast5)
      couponsToCreate.push({
        coupon_code: mobileCode,
        coupon_type: 'STANDARD',
        identifier_type: 'MOBILE',
        plate_number: null,
        plate_category: null,
        plate_region: null,
        plate_combined_string: null,
        mobile_number: form.mobile_number,
        car_model: `BMW ${form.car_model}`,
        offer_id: selectedOffer.id,
        offer_title: selectedOffer.title,
        offer_identifier: selectedOffer.offer_identifier,
        issued_by: profile.id,
        advisor_name: profile.full_name,
        advisor_code: profile.advisor_code,
        issue_date: issueDateStr,
        expiry_date: expiryDateStr,
        valid_days: selectedOffer.valid_days,
        status: 'ACTIVE',
        redemption_count: 0,
      })
    }

    const { data, error } = await supabase
      .from('coupons')
      .insert(couponsToCreate)
      .select()

    if (error) {
      showToast('Failed to create coupon. Please try again.', 'error')
      setSubmitting(false)
      return
    }

    setSuccess({ coupons: data || [] })
    setSubmitting(false)
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
    return <SuccessScreen coupons={success.coupons} offer={selectedOffer!} onCreateAnother={() => { setSuccess(null); setForm({ offer_id: '', mobile_number: '', identifier_type: 'PLATE', emirate: '', plate_category: '', plate_number: '', car_make: 'BMW', car_model: '' }) }} />
  }

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

          {/* Mobile Number */}
          <div>
            <label style={labelStyle}>Mobile Number *</label>
            <div style={{
              display: 'flex', gap: '0px',
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
                <span style={{ fontSize: '18px', lineHeight: 1 }}>🇦🇪</span>
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
                  const val = e.target.value.replace(/\D/g, '').slice(0, 10)
                  setForm(f => ({ ...f, mobile_number: val }))
                }}
                placeholder="5XXXXXXXX"
                maxLength={9}
                inputMode="numeric"
              />
            </div>
            {errors.mobile_number && <p style={errorStyle}>{errors.mobile_number}</p>}
            <p style={{ fontSize: '12px', color: '#888', marginTop: '4px' }}>
              UAE numbers only. Enter 9 digits starting with 5 (e.g. 5XXXXXXXX).
            </p>
          </div>

          {/* Identifier Type Toggle */}
          <div>
            <label style={labelStyle}>Coupon Identifier</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              {(['PLATE', 'MOBILE'] as IdentifierType[]).map(type => (
                <button
                  key={type}
                  onClick={() => setForm(f => ({
                    ...f,
                    identifier_type: type,
                    emirate: '',
                    plate_category: '',
                    plate_number: '',
                  }))}
                  style={{
                    flex: 1, padding: '10px',
                    borderRadius: '10px', border: '1.5px solid',
                    borderColor: form.identifier_type === type ? '#0074BD' : '#E0E0E0',
                    backgroundColor: form.identifier_type === type ? '#F0F7FF' : '#FFFFFF',
                    color: form.identifier_type === type ? '#0074BD' : '#666',
                    fontSize: '14px', fontWeight: '600', cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                >
                  {type === 'PLATE' ? '🚗 Plate Number' : '📱 Mobile Only'}
                </button>
              ))}
            </div>
            {form.identifier_type === 'PLATE' && (
              <p style={{ fontSize: '12px', color: '#0074BD', marginTop: '6px', fontWeight: '500' }}>
                Two coupons will be generated — one for the plate, one for the mobile number.
              </p>
            )}
          </div>

          {/* Plate Fields */}
          {form.identifier_type === 'PLATE' && (
            <div style={{
              backgroundColor: '#F7F9FF', borderRadius: '12px',
              padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px',
              border: '1px solid #E0E8FF',
            }}>
              <p style={{ fontSize: '13px', fontWeight: '600', color: '#162860', margin: 0 }}>
                Plate Details
              </p>

              {/* Emirate */}
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

              {/* Category */}
              <div>
                <label style={labelStyle}>Plate Category *</label>
                <select
                  style={{ ...inputStyle, ...(errors.plate_category ? errorBorderStyle : {}) }}
                  value={form.plate_category}
                  onChange={e => setForm(f => ({ ...f, plate_category: e.target.value }))}
                  disabled={!form.emirate}
                >
                  <option value="">{form.emirate ? 'Select category...' : 'Select emirate first'}</option>
                  {availableCategories.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
                {errors.plate_category && <p style={errorStyle}>{errors.plate_category}</p>}
              </div>

              {/* Plate Number */}
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
                    <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)' }}>Plate preview:</span>
                    <span style={{ fontSize: '13px', fontWeight: '700', color: '#FFFFFF', fontFamily: 'monospace' }}>
                      {form.emirate} · {form.plate_category} · {form.plate_number}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Vehicle */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <p style={{ fontSize: '13px', fontWeight: '600', color: '#162860', margin: 0 }}>
              Vehicle Details
            </p>

            {/* Make — fixed BMW */}
            <div>
              <label style={labelStyle}>Make</label>
              <div style={{
                padding: '10px 12px', backgroundColor: '#F7F7F7',
                border: '1.5px solid #E0E0E0', borderRadius: '8px',
                fontSize: '14px', color: '#666', fontWeight: '600',
              }}>
                BMW
              </div>
            </div>

            {/* Model */}
            <div>
              <label style={labelStyle}>Model *</label>
              <select
                style={inputStyle}
                value={form.car_model}
                onChange={e => setForm(f => ({ ...f, car_model: e.target.value }))}
              >
                <option value="">Select model (optional)</option>
                {BMW_MODELS.map(m => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Coupon Code Preview */}
          {selectedOffer && form.mobile_number.length === 10 && validateMobile(form.mobile_number) && (
            <div style={{
              backgroundColor: '#F0F7FF', borderRadius: '12px',
              padding: '16px', border: '1px solid #C7DCFF',
            }}>
              <p style={{ fontSize: '12px', color: '#666', margin: '0 0 6px', fontWeight: '500' }}>
                {form.identifier_type === 'PLATE' && form.plate_number
                  ? 'Coupon codes that will be generated:'
                  : 'Coupon code that will be generated:'}
              </p>
              {form.identifier_type === 'PLATE' && form.plate_category && form.plate_number ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <code style={{ fontSize: '13px', fontWeight: '700', color: '#162860', wordBreak: 'break-all' }}>
                    {generateCouponCode(selectedOffer, `${form.plate_category}${form.plate_number}`.slice(-5).toUpperCase())}
                  </code>
                  <code style={{ fontSize: '13px', fontWeight: '700', color: '#0074BD', wordBreak: 'break-all' }}>
                    {generateCouponCode(selectedOffer, form.mobile_number.slice(-5))}
                  </code>
                </div>
              ) : (
                <code style={{ fontSize: '13px', fontWeight: '700', color: '#162860', wordBreak: 'break-all' }}>
                  {generateCouponCode(selectedOffer, form.mobile_number.slice(-5))}
                </code>
              )}
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
            {submitting
              ? 'Creating...'
              : form.identifier_type === 'PLATE'
                ? 'Generate 2 Coupons'
                : 'Generate Coupon'}
          </button>

        </div>
      </main>
    </div>
  )
}

function SuccessScreen({ coupons, offer, onCreateAnother }: {
  coupons: any[]
  offer: Offer
  onCreateAnother: () => void
}) {
  const router = useRouter()

  function handleWhatsApp(coupon: any) {
    const message = encodeURIComponent(
      `Hi! Here is your AutoVersa coupon 🎉\n\nCoupon Code: ${coupon.coupon_code}\nOffer: ${coupon.offer_title}\nExpiry: ${coupon.expiry_date}\n\nPlease present this code at the service centre.`
    )
    window.open(`https://wa.me/?text=${message}`, '_blank')
  }

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
            {coupons.length === 2 ? '2 Coupons Created!' : 'Coupon Created!'}
          </h1>
          <p style={{ color: '#666', fontSize: '14px', margin: 0 }}>
            For offer: <strong>{offer.title}</strong>
          </p>
        </div>

        {coupons.map((coupon, i) => (
          <div key={coupon.id} style={{
            backgroundColor: '#FFFFFF', borderRadius: '16px',
            padding: '24px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
            marginBottom: '12px',
            borderLeft: `4px solid ${coupon.identifier_type === 'PLATE' ? '#162860' : '#0074BD'}`,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
              <div>
                <p style={{ fontSize: '12px', color: '#666', margin: '0 0 4px' }}>
                  {coupon.identifier_type === 'PLATE' ? '🚗 Plate Coupon' : '📱 Mobile Coupon'}
                </p>
                <p style={{ fontSize: '18px', fontWeight: '800', color: '#162860', margin: 0, fontFamily: 'monospace', wordBreak: 'break-all' }}>
                  {coupon.coupon_code}
                </p>
              </div>
              <span style={{
                fontSize: '11px', fontWeight: '600', padding: '4px 10px',
                borderRadius: '100px', backgroundColor: '#dcfce7', color: '#16a34a',
              }}>
                ACTIVE
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '16px' }}>
              <div style={{ backgroundColor: '#F7F7F7', borderRadius: '8px', padding: '10px' }}>
                <p style={{ fontSize: '11px', color: '#888', margin: '0 0 2px' }}>Issue Date</p>
                <p style={{ fontSize: '13px', fontWeight: '600', color: '#1A1A1A', margin: 0 }}>{coupon.issue_date}</p>
              </div>
              <div style={{ backgroundColor: '#F7F7F7', borderRadius: '8px', padding: '10px' }}>
                <p style={{ fontSize: '11px', color: '#888', margin: '0 0 2px' }}>Expiry Date</p>
                <p style={{ fontSize: '13px', fontWeight: '600', color: '#D0021B', margin: 0 }}>{coupon.expiry_date}</p>
              </div>
              <div style={{ backgroundColor: '#F7F7F7', borderRadius: '8px', padding: '10px' }}>
                <p style={{ fontSize: '11px', color: '#888', margin: '0 0 2px' }}>Vehicle</p>
                <p style={{ fontSize: '13px', fontWeight: '600', color: '#1A1A1A', margin: 0 }}>{coupon.car_model}</p>
              </div>
              <div style={{ backgroundColor: '#F7F7F7', borderRadius: '8px', padding: '10px' }}>
                <p style={{ fontSize: '11px', color: '#888', margin: '0 0 2px' }}>Valid Days</p>
                <p style={{ fontSize: '13px', fontWeight: '600', color: '#1A1A1A', margin: 0 }}>{coupon.valid_days} days</p>
              </div>
            </div>

            <button
              onClick={() => handleWhatsApp(coupon)}
              style={{
                width: '100%', padding: '12px',
                backgroundColor: '#25D366', color: '#FFFFFF',
                border: 'none', borderRadius: '10px',
                fontSize: '14px', fontWeight: '600', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
              }}
            >
              <span>📲</span> Share on WhatsApp
            </button>
          </div>
        ))}

        <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
          <button
            onClick={onCreateAnother}
            style={{
              flex: 1, padding: '12px',
              backgroundColor: '#0074BD', color: '#FFFFFF',
              border: 'none', borderRadius: '10px',
              fontSize: '14px', fontWeight: '600', cursor: 'pointer',
            }}
          >
            Create Another
          </button>
          <button
            onClick={() => router.push('/coupons')}
            style={{
              flex: 1, padding: '12px',
              backgroundColor: '#F0F0F0', color: '#444',
              border: 'none', borderRadius: '10px',
              fontSize: '14px', fontWeight: '600', cursor: 'pointer',
            }}
          >
            View All Coupons
          </button>
        </div>
      </main>
    </div>
  )
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: '13px', fontWeight: '600',
  color: '#1A1A1A', marginBottom: '6px',
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px', fontSize: '14px',
  border: '1.5px solid #E0E0E0', borderRadius: '8px', outline: 'none',
  backgroundColor: '#FFFFFF', color: '#1A1A1A',
  boxSizing: 'border-box', fontFamily: 'inherit',
}

const errorBorderStyle: React.CSSProperties = {
  borderColor: '#D0021B',
}

const errorStyle: React.CSSProperties = {
  fontSize: '12px', color: '#D0021B', marginTop: '4px',
}
export const dynamic = 'force-dynamic'

