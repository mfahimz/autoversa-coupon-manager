'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Navbar from '@/components/layout/Navbar'
import Breadcrumb from '@/components/layout/Breadcrumb'
import { loadPermissionsForRole, checkPermission } from '@/lib/permissions'


interface Offer {
  id: string
  title: string
  offer_identifier: string
  valid_days: number | null
  b_valid_days: number | null
  b_redemption_end_date: string | null
  m_redemption_end_date: string | null
  loyalty_brand: string | null
  referral_brand: string | null
  loyalty_code: string | null
  referral_code: string | null
  loyalty_campaign_code: string | null
  referral_campaign_code: string | null
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

interface TemplateData {
  id: string
  file_url: string
  image_width: number | null
  image_height: number | null
  font_family: string | null
  text_color: string | null
  coupon_type: string
  template_variable_positions: {
    variable_key: string
    x_coordinate: number
    y_coordinate: number
    font_size: number | null
    font_color: string | null
    font_weight: string | null
  }[]
}


function formatDate(dateStr: string): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

// ─── Customer upsert helper ───────────────────────────────────────────────────

async function upsertLoyaltyCustomer(
  supabase: ReturnType<typeof createClient>,
  params: {
    mobile_number: string
    plate: string
    car_make: string | null
  }
) {
  const { mobile_number, plate, car_make } = params

  const { data: existing } = await supabase
    .from('loyalty_customers')
    .select('id, plate_numbers, customer_id')
    .eq('mobile_number', mobile_number)
    .maybeSingle()

  if (existing) {
    // Append plate if not already in array
    const plates: string[] = existing.plate_numbers || []
    if (!plates.includes(plate)) {
      await supabase
        .from('loyalty_customers')
        .update({
          plate_numbers: [...plates, plate],
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
    }
  } else {
    // Generate next customer_id
    const { data: maxRow } = await supabase
      .from('loyalty_customers')
      .select('customer_id')
      .order('customer_id', { ascending: false })
      .limit(1)
      .maybeSingle()

    let nextNum = 1
    if (maxRow?.customer_id) {
      const parsed = parseInt(maxRow.customer_id.slice(1), 10)
      if (!isNaN(parsed)) nextNum = parsed + 1
    }
    const customer_id = 'A' + String(nextNum).padStart(4, '0')

    await supabase.from('loyalty_customers').insert({
      customer_id,
      mobile_number,
      plate_numbers: [plate],
      car_make: car_make || null,
    })
  }
}

// ─── Main component ───────────────────────────────────────────────────────────

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

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    const [{ data: profileData }, { data: offersData }, { data: emiratesData }] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).single(),
      supabase.from('offers').select('id, title, offer_identifier, valid_days, b_valid_days, b_redemption_end_date, m_redemption_end_date, loyalty_brand, referral_brand, loyalty_code, referral_code, loyalty_campaign_code, referral_campaign_code').eq('is_active', true).order('title'),
      supabase.from('emirates_config').select('*').eq('is_enabled', true).order('sort_order'),
    ])

    if (!profileData) { router.push('/login'); return }

    if (profileData.is_active === false) {
      await supabase.auth.signOut()
      router.push('/login')
      return
    }

    const perms = await loadPermissionsForRole(profileData.user_role)
    if (!checkPermission(perms, profileData.user_role, 'page:create-coupon', 'view')) {
      router.push('/dashboard')
      return
    }

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
    return /^[A-Za-z]\d+$/.test(val) && val.length >= 2 && val.length <= 10
  }
  function validateMobile(mobile: string) {
    return /^5\d{8}$/.test(mobile)
  }

  function buildCouponCode(seq: number, invoice: string, type: 'LOYALTY' | 'REFERRAL', plate: string) {
    if (!selectedOffer) return ''
    const seqStr = String(seq).padStart(3, '0')
    const invoiceUpper = invoice.toUpperCase()
    const plateUpper = plate.toUpperCase()
    if (type === 'LOYALTY') {
      const campaign = selectedOffer.loyalty_campaign_code || 'ALMARAGHI'
      const code = selectedOffer.loyalty_code || 'M'
      return `${seqStr}_${invoiceUpper}_${campaign}_${code}_${plateUpper}`
    } else {
      const campaign = selectedOffer.referral_campaign_code || 'AUTOVERSA'
      const code = selectedOffer.referral_code || 'B'
      return `${seqStr}_${invoiceUpper}_${campaign}_${code}_${plateUpper}`
    }
  }

  function validate() {
    const newErrors: Record<string, string> = {}
    if (!form.offer_id) newErrors.offer_id = 'Please select an offer'

    if (!form.invoice_number) {
      newErrors.invoice_number = 'Invoice number is required'
    } else if (form.invoice_number.length < 2 || form.invoice_number.length > 10 || !/^[A-Za-z]\d+$/.test(form.invoice_number)) {
      newErrors.invoice_number = 'Invoice must start with a letter followed by digits (e.g. A12345)'
    }

    if (!form.mobile_number) {
      newErrors.mobile_number = 'Mobile number is required'
    } else if (!validateMobile(form.mobile_number)) {
      newErrors.mobile_number = 'Enter a valid UAE mobile number starting with 5 (9 digits)'
    }

    if (!form.emirate) newErrors.emirate = 'Please select an emirate'
    if (!form.plate_category) newErrors.plate_category = 'Please select a category'

    if (!form.plate_number) {
      newErrors.plate_number = 'Plate number is required'
    } else if (!/^\d{1,5}$/.test(form.plate_number)) {
      newErrors.plate_number = 'Plate number must be digits only, max 5 digits'
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
    const issueDateStr = new Date().toISOString().split('T')[0]

    let mExpiryStr = ''
    let mValidDays: number | null = null
    if (selectedOffer.valid_days !== null && selectedOffer.valid_days !== undefined) {
      const mExpiry = new Date()
      mExpiry.setDate(mExpiry.getDate() + selectedOffer.valid_days)
      mExpiryStr = mExpiry.toISOString().split('T')[0]
      mValidDays = selectedOffer.valid_days
    } else if (selectedOffer.m_redemption_end_date) {
      mExpiryStr = selectedOffer.m_redemption_end_date
      mValidDays = null
    } else {
      const mExpiry = new Date()
      mExpiry.setDate(mExpiry.getDate() + 90)
      mExpiryStr = mExpiry.toISOString().split('T')[0]
      mValidDays = 90
    }

    let bExpiryStr = ''
    let bValidDays: number | null = null
    if (selectedOffer.b_valid_days !== null && selectedOffer.b_valid_days !== undefined) {
      const bExpiry = new Date()
      bExpiry.setDate(bExpiry.getDate() + selectedOffer.b_valid_days)
      bExpiryStr = bExpiry.toISOString().split('T')[0]
      bValidDays = selectedOffer.b_valid_days
    } else if (selectedOffer.b_redemption_end_date) {
      bExpiryStr = selectedOffer.b_redemption_end_date
      bValidDays = null
    } else {
      const bExpiry = new Date()
      bExpiry.setDate(bExpiry.getDate() + 90)
      bExpiryStr = bExpiry.toISOString().split('T')[0]
      bValidDays = 90
    }

    const emirateCode = selectedEmirate?.code || form.emirate
    const plate = `${emirateCode}${form.plate_category}${form.plate_number}`.toUpperCase()

    const loyaltyCode = buildCouponCode(sequenceNumber, form.invoice_number, 'LOYALTY', plate)
    const referralCode = buildCouponCode(sequenceNumber, form.invoice_number, 'REFERRAL', plate)

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
      status: 'ACTIVE',
      redemption_count: 0,
    }

    const { data: mData, error: mError } = await supabase
      .from('coupons')
      .insert({ ...baseFields, coupon_code: loyaltyCode, coupon_type: 'LOYALTY', identifier_type: 'PLATE', expiry_date: mExpiryStr, valid_days: mValidDays })
      .select().single()

    if (mError || !mData) {
      showToast('Failed to create Loyalty coupon. Please try again.', 'error')
      setSubmitting(false)
      return
    }

    // Auto-create or update loyalty customer profile
    await upsertLoyaltyCustomer(supabase, {
      mobile_number: form.mobile_number,
      plate,
      car_make: selectedOffer.loyalty_brand,
    })

    const { data: bData, error: bError } = await supabase
      .from('coupons')
      .insert({ ...baseFields, coupon_code: referralCode, coupon_type: 'REFERRAL', identifier_type: 'PLATE', expiry_date: bExpiryStr, parent_coupon_id: mData.id, valid_days: bValidDays })
      .select().single()

    if (bError || !bData) {
      showToast('Failed to create Referral coupon. Please try again.', 'error')
      setSubmitting(false)
      return
    }

    setSuccess({ coupons: [mData, bData], sequenceNumber })
    setSubmitting(false)
  }

  function resetForm() {
    setSuccess(null)
    setForm({ offer_id: '', invoice_number: '', mobile_number: '', emirate: '', plate_category: '', plate_number: '' })
    setErrors({})
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#F7F7F7', paddingTop: '16px' }}>
        <Navbar />
        <main style={{ padding: '0 32px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '32px' }}>
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} style={{ height: '56px', backgroundColor: '#E0E0E0', borderRadius: '10px', animation: 'pulse 1.5s ease-in-out infinite' }} />
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

  const canPreview = !!(selectedOffer && form.invoice_number && validateInvoiceNumber(form.invoice_number) && form.emirate && form.plate_category && form.plate_number)
  const previewPlate = canPreview ? `${selectedEmirate?.code || form.emirate}${form.plate_category}${form.plate_number}`.toUpperCase() : ''

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
          <h1 style={{ fontSize: '22px', fontWeight: '700', color: '#1A1A1A', margin: 0 }}>Create Coupon</h1>
          <p style={{ color: '#666', fontSize: '14px', marginTop: '4px' }}>
            Issuing as <strong>{profile?.full_name}</strong>
            {profile?.advisor_code && (
              <span style={{ marginLeft: '6px', fontFamily: 'monospace', fontSize: '12px', backgroundColor: '#EEF2FF', color: '#162860', padding: '2px 8px', borderRadius: '4px' }}>
                {profile.advisor_code}
              </span>
            )}
          </p>
        </div>

        <div style={{ backgroundColor: '#FFFFFF', borderRadius: '16px', padding: '28px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', display: 'flex', flexDirection: 'column', gap: '20px' }}>

          <div>
            <label style={labelStyle}>Select Offer *</label>
            <select style={{ ...inputStyle, ...(errors.offer_id ? errorBorderStyle : {}) }}
              value={form.offer_id} onChange={e => setForm(f => ({ ...f, offer_id: e.target.value }))}>
              <option value="">Choose an active offer...</option>
              {offers.map(o => (
                <option key={o.id} value={o.id}>
                  {o.title} — {o.valid_days !== null && o.valid_days !== undefined ? `${o.valid_days} days` : o.m_redemption_end_date ? `until ${formatDate(o.m_redemption_end_date)}` : '90 days'}
                </option>
              ))}
            </select>
            {errors.offer_id && <p style={errorStyle}>{errors.offer_id}</p>}
          </div>

          <div>
            <label style={labelStyle}>Invoice / Job Number *</label>
            <input style={{ ...inputStyle, ...(errors.invoice_number ? errorBorderStyle : {}) }}
              value={form.invoice_number}
              onChange={e => {
                let val = e.target.value.replace(/[^A-Za-z0-9]/g, '')
                if (val.length > 0) {
                  const first = val[0].toUpperCase()
                  if (/[A-Z]/.test(first)) {
                    const rest = val.slice(1).replace(/\D/g, '').slice(0, 9)
                    val = first + rest
                  } else {
                    val = ''
                  }
                }
                setForm(f => ({ ...f, invoice_number: val }))
              }}
              placeholder="e.g. A12345" maxLength={10} />
            {errors.invoice_number && <p style={errorStyle}>{errors.invoice_number}</p>}
            <p style={{ fontSize: '12px', color: '#888', marginTop: '4px' }}>Must start with one letter followed by numbers only.</p>
          </div>

          <div style={{ backgroundColor: '#F7F9FF', borderRadius: '12px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px', border: '1px solid #E0E8FF' }}>
            <p style={{ fontSize: '13px', fontWeight: '600', color: '#162860', margin: 0 }}>{(selectedOffer?.loyalty_brand || 'Loyalty') + ' Plate'}</p>

            <div>
              <label style={labelStyle}>Emirate *</label>
              <select style={{ ...inputStyle, ...(errors.emirate ? errorBorderStyle : {}) }}
                value={form.emirate} onChange={e => setForm(f => ({ ...f, emirate: e.target.value, plate_category: '' }))}>
                <option value="">Select emirate...</option>
                {emirates.map(em => <option key={em.id} value={em.name}>{em.name}</option>)}
              </select>
              {errors.emirate && <p style={errorStyle}>{errors.emirate}</p>}
            </div>

            <div>
              <label style={labelStyle}>Plate Category *</label>
              <select style={{ ...inputStyle, ...(errors.plate_category ? errorBorderStyle : {}) }}
                value={form.plate_category} onChange={e => setForm(f => ({ ...f, plate_category: e.target.value }))} disabled={!form.emirate}>
                <option value="">{form.emirate ? 'Select category...' : 'Select emirate first'}</option>
                {availableCategories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
              </select>
              {errors.plate_category && <p style={errorStyle}>{errors.plate_category}</p>}
            </div>

            <div>
              <label style={labelStyle}>Plate Number *</label>
              <input style={{ ...inputStyle, ...(errors.plate_number ? errorBorderStyle : {}) }}
                value={form.plate_number}
                onChange={e => setForm(f => ({ ...f, plate_number: e.target.value.replace(/\D/g, '').slice(0, 5) }))}
                placeholder="Up to 5 digits" maxLength={5} inputMode="numeric" />
              {errors.plate_number && <p style={errorStyle}>{errors.plate_number}</p>}
              {form.emirate && form.plate_category && form.plate_number && (
                <div style={{ marginTop: '8px', padding: '8px 12px', backgroundColor: '#162860', borderRadius: '8px', display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)' }}>Plate:</span>
                  <span style={{ fontSize: '13px', fontWeight: '700', color: '#FFFFFF', fontFamily: 'monospace' }}>{form.emirate} · {form.plate_category} · {form.plate_number}</span>
                </div>
              )}
            </div>
          </div>

          <div>
            <label style={labelStyle}>{(selectedOffer?.loyalty_brand || 'Loyalty') + ' Owner Mobile *'}</label>
            <div style={{ display: 'flex', border: `1.5px solid ${errors.mobile_number ? '#D0021B' : '#E0E0E0'}`, borderRadius: '8px', overflow: 'hidden', backgroundColor: '#FFFFFF' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 12px', backgroundColor: '#F7F7F7', borderRight: '1.5px solid #E0E0E0', flexShrink: 0 }}>
                <span style={{ fontSize: '18px', lineHeight: '1' }}>🇦🇪</span>
                <span style={{ fontSize: '14px', fontWeight: '600', color: '#1A1A1A' }}>+971</span>
              </div>
              <input
                style={{ flex: 1, padding: '10px 12px', fontSize: '14px', border: 'none', outline: 'none', backgroundColor: '#FFFFFF', color: '#1A1A1A', fontFamily: 'inherit' }}
                value={form.mobile_number}
                onChange={e => {
                  let val = e.target.value.replace(/[^\d+]/g, '')
                  if (val.startsWith('+971')) val = val.slice(4)
                  else if (val.startsWith('9715')) val = val.slice(3)
                  else if (val.startsWith('05')) val = val.slice(1)
                  val = val.replace(/\D/g, '')
                  if (val.length > 0 && !val.startsWith('5')) val = ''
                  val = val.slice(0, 9)
                  setForm(f => ({ ...f, mobile_number: val }))
                }}
                placeholder="5XXXXXXXX" maxLength={9} inputMode="numeric" />
            </div>
            {errors.mobile_number && <p style={errorStyle}>{errors.mobile_number}</p>}
            <p style={{ fontSize: '12px', color: '#888', marginTop: '4px' }}>{(selectedOffer?.loyalty_brand || 'Loyalty') + ' owner contact — used for WhatsApp sharing only.'}</p>
          </div>

          {canPreview && (
            <div style={{ backgroundColor: '#F0F7FF', borderRadius: '12px', padding: '16px', border: '1px solid #C7DCFF' }}>
              <p style={{ fontSize: '12px', color: '#666', margin: '0 0 10px', fontWeight: '600' }}>Coupon codes that will be generated:</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '10px', fontWeight: '700', padding: '2px 8px', backgroundColor: '#162860', color: '#FFFFFF', borderRadius: '4px', flexShrink: 0 }}>{selectedOffer.loyalty_code || 'M'}</span>
                  <code style={{ fontSize: '12px', fontWeight: '700', color: '#162860', wordBreak: 'break-all' }}>???_{form.invoice_number.toUpperCase()}_{selectedOffer.loyalty_campaign_code || 'ALMARAGHI'}_{selectedOffer.loyalty_code || 'M'}_{previewPlate}</code>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '10px', fontWeight: '700', padding: '2px 8px', backgroundColor: '#0074BD', color: '#FFFFFF', borderRadius: '4px', flexShrink: 0 }}>{selectedOffer.referral_code || 'B'}</span>
                  <code style={{ fontSize: '12px', fontWeight: '700', color: '#0074BD', wordBreak: 'break-all' }}>???_{form.invoice_number.toUpperCase()}_{selectedOffer.referral_campaign_code || 'AUTOVERSA'}_{selectedOffer.referral_code || 'B'}_{previewPlate}</code>
                </div>
              </div>
              <p style={{ fontSize: '11px', color: '#888', margin: '10px 0 0' }}>Sequence number (???) assigned on submission.</p>
            </div>
          )}

          <button onClick={handleSubmit} disabled={submitting} style={{
            width: '100%', padding: '14px',
            backgroundColor: submitting ? '#93C5E8' : '#0074BD',
            color: '#FFFFFF', border: 'none', borderRadius: '10px',
            fontSize: '15px', fontWeight: '700',
            cursor: submitting ? 'not-allowed' : 'pointer', marginTop: '4px',
          }}>
            {submitting ? 'Generating coupons...' : 'Generate 2 Coupons (Loyalty + Referral)'}
          </button>
        </div>
      </main>
    </div>
  )
}

// ─── Variable value resolver ──────────────────────────────────────────────────

function resolveVariableValues(coupon: any): Record<string, string> {
  return {
    LOYALTY_COUPON_CODE: coupon.coupon_type === 'LOYALTY' ? coupon.coupon_code : '',
    REFERRAL_COUPON_CODE: coupon.coupon_type === 'REFERRAL' ? coupon.coupon_code : '',
    LOYALTY_EXPIRY_DATE: coupon.coupon_type === 'LOYALTY' ? formatDate(coupon.expiry_date) : '',
    REFERRAL_EXPIRY_DATE: coupon.coupon_type === 'REFERRAL' ? formatDate(coupon.expiry_date) : '',
    ADVISOR_NAME: coupon.advisor_name || '',
    OFFER_TITLE: coupon.offer_title || '',
    PLATE_NUMBER: coupon.plate_combined_string || '',
    MOBILE_NUMBER: coupon.mobile_number ? '+971' + coupon.mobile_number : '',
  }
}

// ─── CSS Coupon Preview ───────────────────────────────────────────────────────

function CouponPreview({ coupon, template }: { coupon: any; template: TemplateData }) {
  const values = resolveVariableValues(coupon)
  const aspectRatio = template.image_width && template.image_height
    ? template.image_width / template.image_height
    : 1.586

  return (
    <div style={{
      position: 'relative',
      width: '100%',
      paddingBottom: `${(1 / aspectRatio) * 100}%`,
      borderRadius: '10px',
      overflow: 'hidden',
      boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
      marginBottom: '16px',
    }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={template.file_url}
        alt="Coupon template"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        crossOrigin="anonymous"
      />
      {template.template_variable_positions.map(pos => {
        const value = values[pos.variable_key] || ''
        if (!value) return null
        return (
          <div
            key={pos.variable_key}
            style={{
              position: 'absolute',
              left: `${pos.x_coordinate}%`,
              top: `${pos.y_coordinate}%`,
              transform: 'translate(-50%, -50%)',
              fontSize: `${pos.font_size || 16}px`,
              fontWeight: pos.font_weight || 'normal',
              color: pos.font_color || '#000000',
              whiteSpace: 'nowrap',
              lineHeight: 1,
              fontFamily: 'Arial, sans-serif',
              pointerEvents: 'none',
              textShadow: '0 1px 2px rgba(0,0,0,0.15)',
            }}
          >
            {value}
          </div>
        )
      })}
    </div>
  )
}

// ─── Success Screen ───────────────────────────────────────────────────────────

function SuccessScreen({ coupons, offer, sequenceNumber, onCreateAnother }: {
  coupons: any[]
  offer: Offer
  sequenceNumber: number
  onCreateAnother: () => void
}) {
  const router = useRouter()
  const supabase = createClient()
  const [downloading, setDownloading] = useState<Record<string, boolean>>({})
  const [templates, setTemplates] = useState<Record<string, TemplateData>>({})
  const [templatesLoaded, setTemplatesLoaded] = useState(false)

  const mCoupon = coupons.find(c => c.coupon_type === 'LOYALTY')
  const bCoupon = coupons.find(c => c.coupon_type === 'REFERRAL')

  useEffect(() => {
    if (!offer?.id) return
    loadTemplates(offer.id)
  }, [offer?.id])

  async function loadTemplates(offerId: string) {
    const { data } = await supabase
      .from('templates')
      .select('id, file_url, image_width, image_height, font_family, text_color, coupon_type, template_variable_positions(*)')
      .eq('offer_id', offerId)
      .eq('is_active', true)

    if (data) {
      const map: Record<string, TemplateData> = {}
      // TODO: templates.coupon_type still uses M/B — migration deferred
      data.forEach((t: any) => { map[t.coupon_type === 'M' ? 'LOYALTY' : t.coupon_type === 'B' ? 'REFERRAL' : t.coupon_type] = t })
      setTemplates(map)
    }
    setTemplatesLoaded(true)
  }

  async function downloadCouponJPG(coupon: any) {
    const template = templates[coupon.coupon_type]
    if (!template?.file_url) {
      alert('No template configured for this coupon type.')
      return
    }

    setDownloading(d => ({ ...d, [coupon.id]: true }))

    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.src = template.file_url

    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = template.image_width || img.naturalWidth
      canvas.height = template.image_height || img.naturalHeight
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

      const values = resolveVariableValues(coupon)
      const positions = template.template_variable_positions || []

      positions.forEach(pos => {
        const value = values[pos.variable_key] || ''
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
  }

  function handleWhatsApp(coupon: any) {
    const message = encodeURIComponent(
      `Hi! Here is your AutoVersa coupon\n\nCoupon Code: ${coupon.coupon_code}\nOffer: ${coupon.offer_title}\nExpiry: ${formatDate(coupon.expiry_date)}\n\nPlease present this code at the service centre.`
    )
    window.open(`https://wa.me/971${coupon.mobile_number}?text=${message}`, '_blank')
  }

  function renderCouponCard(coupon: any, accentColor: string, label: string, subtitle: string) {
    const template = templates[coupon.coupon_type]
    const hasTemplate = templatesLoaded && !!template

    return (
      <div style={{
        backgroundColor: '#FFFFFF', borderRadius: '16px',
        padding: '24px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
        marginBottom: '12px', borderLeft: `4px solid ${accentColor}`,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <span style={{ fontSize: '11px', fontWeight: '700', padding: '3px 10px', backgroundColor: accentColor, color: '#FFFFFF', borderRadius: '4px' }}>{label}</span>
              <span style={{ fontSize: '12px', color: '#666' }}>{subtitle}</span>
            </div>
            <p style={{ fontSize: '15px', fontWeight: '800', color: accentColor, margin: 0, fontFamily: 'monospace', wordBreak: 'break-all' }}>
              {coupon.coupon_code}
            </p>
          </div>
          <span style={{ fontSize: '11px', fontWeight: '600', padding: '4px 10px', borderRadius: '100px', backgroundColor: '#dcfce7', color: '#16a34a', flexShrink: 0 }}>ACTIVE</span>
        </div>

        {hasTemplate && <CouponPreview coupon={coupon} template={template} />}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '16px' }}>
          <div style={infoBoxStyle}><p style={infoLabelStyle}>Issue Date</p><p style={infoValueStyle}>{formatDate(coupon.issue_date)}</p></div>
          <div style={infoBoxStyle}><p style={infoLabelStyle}>Expiry Date</p><p style={{ ...infoValueStyle, color: '#D0021B' }}>{formatDate(coupon.expiry_date)}</p></div>
          <div style={infoBoxStyle}><p style={infoLabelStyle}>{coupon.coupon_type === 'LOYALTY' ? 'Plate' : 'Ref. Plate'}</p><p style={{ ...infoValueStyle, fontFamily: 'monospace' }}>{coupon.plate_combined_string}</p></div>
          <div style={infoBoxStyle}><p style={infoLabelStyle}>Valid Days</p><p style={infoValueStyle}>{coupon.valid_days !== null && coupon.valid_days !== undefined ? `${coupon.valid_days} days` : '—'}</p></div>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => downloadCouponJPG(coupon)}
            disabled={downloading[coupon.id] || !hasTemplate}
            style={{
              flex: 1, padding: '12px',
              backgroundColor: downloading[coupon.id] ? '#93C5E8' : !hasTemplate ? '#CCCCCC' : accentColor,
              color: '#FFFFFF', border: 'none', borderRadius: '10px',
              fontSize: '14px', fontWeight: '600',
              cursor: downloading[coupon.id] || !hasTemplate ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
            }}>
            {downloading[coupon.id] ? 'Generating...' : !hasTemplate ? 'No Template' : 'Download JPG'}
          </button>
          <button onClick={() => handleWhatsApp(coupon)} style={{
            flex: 1, padding: '12px', backgroundColor: '#25D366', color: '#FFFFFF',
            border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: '600',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
          }}>
            WhatsApp
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#F7F7F7', paddingTop: '16px' }}>
      <Navbar />
      <main style={{ padding: '0 32px 48px' }}>
        <Breadcrumb items={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Coupons', href: '/coupons' },
          { label: 'Create Coupon', href: '/create-coupon' },
          { label: 'Success' },
        ]} />

        <div style={{ backgroundColor: '#FFFFFF', borderRadius: '16px', padding: '32px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', marginBottom: '16px', textAlign: 'center' }}>
          <div style={{ fontSize: '48px', marginBottom: '12px' }}>✅</div>
          <h1 style={{ fontSize: '22px', fontWeight: '700', color: '#1A1A1A', margin: '0 0 8px' }}>2 Coupons Created!</h1>
          <p style={{ color: '#666', fontSize: '14px', margin: '0 0 4px' }}>Offer: <strong>{offer?.title}</strong></p>
          <p style={{ color: '#888', fontSize: '13px', margin: 0, fontFamily: 'monospace' }}>
            Sequence #{String(sequenceNumber).padStart(3, '0')}
          </p>
        </div>

        {mCoupon && renderCouponCard(mCoupon, '#162860', (offer?.loyalty_brand || 'Loyalty') + ' Coupon', 'Single-use · Tied to plate')}
        {bCoupon && renderCouponCard(bCoupon, '#0074BD', (offer?.referral_brand || 'Referral') + ' Coupon', 'Multi-use · Per-plate limit')}

        <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
          <button onClick={onCreateAnother} style={{ flex: 1, padding: '12px', backgroundColor: '#0074BD', color: '#FFFFFF', border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}>
            Create Another
          </button>
          <button onClick={() => router.push('/coupons')} style={{ flex: 1, padding: '12px', backgroundColor: '#F0F0F0', color: '#444', border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}>
            View All Coupons
          </button>
        </div>
      </main>
    </div>
  )
}

const labelStyle: React.CSSProperties = { display: 'block', fontSize: '13px', fontWeight: '600', color: '#1A1A1A', marginBottom: '6px' }
const inputStyle: React.CSSProperties = { width: '100%', padding: '10px 12px', fontSize: '14px', border: '1.5px solid #E0E0E0', borderRadius: '8px', outline: 'none', backgroundColor: '#FFFFFF', color: '#1A1A1A', boxSizing: 'border-box', fontFamily: 'inherit' }
const errorBorderStyle: React.CSSProperties = { borderColor: '#D0021B' }
const errorStyle: React.CSSProperties = { fontSize: '12px', color: '#D0021B', marginTop: '4px' }
const infoBoxStyle: React.CSSProperties = { backgroundColor: '#F7F7F7', borderRadius: '8px', padding: '10px' }
const infoLabelStyle: React.CSSProperties = { fontSize: '11px', color: '#888', margin: '0 0 2px' }
const infoValueStyle: React.CSSProperties = { fontSize: '13px', fontWeight: '600', color: '#1A1A1A', margin: 0 }