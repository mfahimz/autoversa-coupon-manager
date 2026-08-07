'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Navbar from '@/components/layout/Navbar'
import Breadcrumb from '@/components/layout/Breadcrumb'
import PageSkeleton from '@/components/layout/PageSkeleton'
import { loadPermissionsForRole, checkPermission } from '@/lib/permissions'
import { toast } from 'sonner'


// ─── Types ───────────────────────────────────────────────────────────────────

interface Appointment {
  id: string
  appointment_number: string
  coupon_id: string | null
  coupon_code: string
  vehicle_make?: string | null
  vehicle_plate: string | null
  vehicle_year: number | null
  appointment_date: string | null
  appointment_time: string | null
  notes?: string | null
  follow_up_note: string | null
  booked_by?: string | null
  wa_confirmation_sent?: boolean | null
  status: string
  reschedule_count: number | null
  not_reachable_count: number | null
  offer_id: string | null
  sub_offer_id: string | null
  sub_offer_name: string | null
  redeemed_plate?: string | null
  customer_mobile?: string | null
  created_at?: string | null
}

interface CouponLookup {
  id: string
  coupon_code: string
  coupon_type: string
  plate_combined_string: string | null
  mobile_number: string | null
  status: string
  expiry_date: string | null
  offer_id: string | null
  offer_title: string | null
  offer_coupon_cap: number | null
  offer_visited_count: number | null
  loyalty_brand: string | null
  referral_brand: string | null
  loyalty_code: string | null
  referral_code: string | null
}

interface SubOffer {
  id: string
  name: string
  sort_order: number | null
}

interface EmirateConfig {
  id: string
  name: string
  code: string
  categories: string[]
  is_enabled?: boolean | null
  sort_order?: number | null
}

// ─── Status config ────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  scheduled: { label: 'Scheduled', color: '#162860', bg: '#EEF1FF' },
  customer_not_reachable: { label: 'Not Reachable', color: '#D0021B', bg: '#FFEAEA' },
  follow_up_confirmed: { label: 'Follow-up Confirmed', color: '#16a34a', bg: '#EEFBF0' },
  rescheduled: { label: 'Rescheduled', color: '#f59e0b', bg: '#FFF8E7' },
  job_card_open: { label: 'Job Card Open', color: '#7c3aed', bg: '#F3EEFF' },
  visited: { label: 'Visited', color: '#0074BD', bg: '#E8F4FF' },
  cancelled: { label: 'Cancelled', color: '#666666', bg: '#F0F0F0' },
}

const PAGE_SIZE = 10
const PRIVILEGED_ROLES_2012_BYPASS = ['ADMIN', 'CEO', 'ASSISTANT_GENERAL_MANAGER', 'MANAGER']

// ─── Shared styles ────────────────────────────────────────────────────────────

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function toDateOnly(dateStr: string): string {
  return dateStr.split('T')[0]
}

// ─── Customer upsert helper ───────────────────────────────────────────────────

async function upsertReferralCustomer(
  supabase: ReturnType<typeof createClient>,
  params: {
    mobile_number: string
    plate: string
    car_make: string | null
    vehicle_year: number | null
  }
) {
  const { mobile_number, plate, car_make, vehicle_year } = params

  const { data: existing } = await supabase
    .from('referral_customers')
    .select('id, plate_numbers, customer_id')
    .eq('mobile_number', mobile_number)
    .maybeSingle()

  if (existing) {
    const plates: string[] = existing.plate_numbers || []
    if (!plates.includes(plate)) {
      await supabase
        .from('referral_customers')
        .update({
          plate_numbers: [...plates, plate],
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
    }
  } else {
    const { data: maxRow } = await supabase
      .from('referral_customers')
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

    await supabase.from('referral_customers').insert({
      customer_id,
      mobile_number,
      plate_numbers: [plate],
      car_make: car_make || null,
    })
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function AppointmentsPage() {
  const router = useRouter()
  const supabase = createClient()

  const [profile, setProfile] = useState<any>(null)
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [emirates, setEmirates] = useState<EmirateConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [currentPage, setCurrentPage] = useState(1)

  const [errors, setErrors] = useState<Record<string, string>>({})

  const [showModal, setShowModal] = useState(false)
  const [couponCode, setCouponCode] = useState('')
  const [couponLookup, setCouponLookup] = useState<CouponLookup | null>(null)
  const [couponError, setCouponError] = useState('')
  const [couponLoading, setCouponLoading] = useState(false)
  const [subOffers, setSubOffers] = useState<SubOffer[]>([])
  const [bmwEmirate, setBmwEmirate] = useState('')
  const [bmwCategory, setBmwCategory] = useState('')
  const [bmwPlateNumber, setBmwPlateNumber] = useState('')
  const [bmwCategories, setBmwCategories] = useState<string[]>([])
  const [bmwMobile, setBmwMobile] = useState('')
  const [apptDate, setApptDate] = useState('')
  const [apptTime, setApptTime] = useState('')
  const [vehicleYear, setVehicleYear] = useState('')
  const [selectedSubOffer, setSelectedSubOffer] = useState('')
  const [apptNotes, setApptNotes] = useState('')
  const [bookingLoading, setBookingLoading] = useState(false)

  const [showStatusModal, setShowStatusModal] = useState(false)
  const [selectedAppt, setSelectedAppt] = useState<Appointment | null>(null)
  const [statusNote, setStatusNote] = useState('')
  const [newStatus, setNewStatus] = useState('')
  const [rescheduleDate, setRescheduleDate] = useState('')
  const [rescheduleTime, setRescheduleTime] = useState('')
  const [statusUpdating, setStatusUpdating] = useState(false)
  const [jobCardSubOffers, setJobCardSubOffers] = useState<SubOffer[]>([])
  const [jobCardSubOffer, setJobCardSubOffer] = useState('')
  const [jobCardSubOfferLoading, setJobCardSubOfferLoading] = useState(false)
  const [invoiceNumber, setInvoiceNumber] = useState('')

  const today = new Date().toISOString().split('T')[0]

  const searchParams = typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search)
    : null
  const prefillCoupon = searchParams?.get('coupon') || ''

  useEffect(() => { init() }, [])

  useEffect(() => {
    setCurrentPage(1)
  }, [search, statusFilter])

  async function init() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    setLoading(true)
    const [profileResult, emiratesResult, appointmentsResult] = await Promise.all([
      supabase.from('profiles').select('user_role, is_active, id').eq('id', user.id).single(),
      supabase.from('emirates_config').select('id, code, name, categories').eq('is_enabled', true).order('sort_order'),
      supabase.from('appointments').select('id, appointment_number, coupon_code, vehicle_plate, sub_offer_name, appointment_date, appointment_time, vehicle_year, status, not_reachable_count, reschedule_count, coupon_id, offer_id, sub_offer_id, follow_up_note').order('appointment_date', { ascending: true }).order('appointment_time', { ascending: true })
    ])

    const { data: profileData } = profileResult
    const { data: emirateData } = emiratesResult
    const { data: appointmentsData } = appointmentsResult

    if (!profileData) { router.push('/login'); return }

    if (profileData?.is_active === false) {
      await supabase.auth.signOut()
      router.push('/login')
      return
    }

    const perms = await loadPermissionsForRole(profileData.user_role)
    if (!checkPermission(perms, profileData.user_role, 'page:appointments', 'view')) {
      router.push('/dashboard')
      return
    }

    setProfile(profileData)
    setEmirates(emirateData || [])
    setAppointments(appointmentsData || [])
    setLoading(false)

    if (prefillCoupon) {
      setShowModal(true)
      setCouponCode(prefillCoupon)
    }
  }

  async function loadAppointments() {
    setLoading(true)
    const { data } = await supabase
      .from('appointments')
      .select('id, appointment_number, coupon_code, vehicle_plate, sub_offer_name, appointment_date, appointment_time, vehicle_year, status, not_reachable_count, reschedule_count, coupon_id, offer_id, sub_offer_id, follow_up_note')
      .order('appointment_date', { ascending: true })
      .order('appointment_time', { ascending: true })
    setAppointments(data || [])
    setLoading(false)
  }

  function showToast(message: string, type: 'success' | 'error' = 'success') {
    if (type === 'success') toast.success(message)
    else toast.error(message)
  }

  const stats = {
    total: appointments.length,
    scheduled: appointments.filter(a => a.status === 'scheduled').length,
    followUp: appointments.filter(a => a.status === 'follow_up_confirmed').length,
    jobCardOpen: appointments.filter(a => a.status === 'job_card_open').length,
    visited: appointments.filter(a => a.status === 'visited').length,
    cancelled: appointments.filter(a => a.status === 'cancelled').length,
  }

  const filtered = appointments.filter(a => {
    const matchSearch = !search ||
      a.coupon_code.toLowerCase().includes(search.toLowerCase()) ||
      (a.vehicle_plate || '').toLowerCase().includes(search.toLowerCase()) ||
      a.appointment_number.toLowerCase().includes(search.toLowerCase())
    const matchStatus = statusFilter === 'all' || a.status === statusFilter
    return matchSearch && matchStatus
  })

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const paginatedAppointments = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  function getEmirateCategories(emirateCode: string): string[] {
    const em = emirates.find(e => e.code === emirateCode)
    return em?.categories || []
  }

  function buildPlateCombined(emirate: string, category: string, plateNum: string): string {
    return `${emirate}${category}${plateNum}`
  }

  async function lookupCoupon() {
    if (!couponCode.trim()) return
    setCouponLoading(true)
    setCouponError('')
    setCouponLookup(null)
    setSubOffers([])
    setSelectedSubOffer('')

    const { data, error } = await supabase
      .from('coupons')
      .select(`
        id, coupon_code, coupon_type,
        plate_combined_string, mobile_number,
        status, expiry_date, offer_id,
        offers (title, coupon_cap, visited_count, loyalty_brand, referral_brand, loyalty_code, referral_code)
      `)
      .eq('coupon_code', couponCode.trim().toUpperCase())
      .single()

    if (error || !data) {
      setCouponError('Coupon code not found.')
      setCouponLoading(false)
      return
    }

    const offerData = data.offers as any

    if (data.coupon_type !== 'REFERRAL') {
      const refBrand = offerData?.referral_brand || 'Referral'
      setCouponError(`Only ${refBrand} referral coupons can be booked here. Use the loyalty coupon page for loyalty redemptions.`)
      setCouponLoading(false)
      return
    }

    if (data.status !== 'ACTIVE') {
      setCouponError(`This coupon is ${(data.status || 'unknown').toLowerCase()} and cannot be used to book an appointment.`)
      setCouponLoading(false)
      return
    }

    if (data.expiry_date && toDateOnly(data.expiry_date) < today) {
      setCouponError(`This coupon expired on ${formatDate(data.expiry_date)} and can no longer be used.`)
      setCouponLoading(false)
      return
    }

    if (
      offerData?.coupon_cap != null &&
      offerData?.visited_count != null &&
      offerData.visited_count >= offerData.coupon_cap
    ) {
      setCouponError(`This offer has reached its maximum of ${offerData.coupon_cap} redemptions. No new appointments can be booked.`)
      setCouponLoading(false)
      return
    }

    setCouponLookup({
      id: data.id,
      coupon_code: data.coupon_code,
      coupon_type: data.coupon_type,
      plate_combined_string: data.plate_combined_string,
      mobile_number: data.mobile_number,
      status: data.status,
      expiry_date: data.expiry_date,
      offer_id: data.offer_id,
      offer_title: offerData?.title || null,
      offer_coupon_cap: offerData?.coupon_cap || null,
      offer_visited_count: offerData?.visited_count || 0,
      loyalty_brand: offerData?.loyalty_brand || null,
      referral_brand: offerData?.referral_brand || null,
      loyalty_code: offerData?.loyalty_code || null,
      referral_code: offerData?.referral_code || null,
    })

    if (data.offer_id) {
      const { data: soData } = await supabase
        .from('sub_offers')
        .select('id, name, sort_order')
        .eq('offer_id', data.offer_id)
        .eq('is_active', true)
        .order('sort_order')
      setSubOffers(soData || [])
    }

    setCouponLoading(false)
  }

  function resetModal() {
    setShowModal(false)
    setCouponCode('')
    setCouponLookup(null)
    setCouponError('')
    setSubOffers([])
    setBmwEmirate('')
    setBmwCategory('')
    setBmwPlateNumber('')
    setBmwCategories([])
    setBmwMobile('')
    setApptDate('')
    setApptTime('')
    setVehicleYear('')
    setSelectedSubOffer('')
    setApptNotes('')
    setErrors({})
  }

  async function bookAppointment() {
    if (!couponLookup) return

    const newErrors: Record<string, string> = {}

    if (!bmwEmirate) newErrors.bmwEmirate = `${couponLookup.referral_brand || 'Referral'} vehicle emirate is required`
    if (!bmwCategory) newErrors.bmwCategory = `${couponLookup.referral_brand || 'Referral'} vehicle plate category is required`

    if (!bmwPlateNumber.trim()) {
      newErrors.bmwPlateNumber = `${couponLookup.referral_brand || 'Referral'} vehicle plate number is required`
    } else if (!/^\d{1,5}$/.test(bmwPlateNumber)) {
      newErrors.bmwPlateNumber = 'Plate number must be digits only, max 5 digits'
    }

    if (!bmwMobile.trim()) {
      newErrors.bmwMobile = `${couponLookup.referral_brand || 'Referral'} customer mobile is required`
    } else if (!/^5\d{8}$/.test(bmwMobile)) {
      newErrors.bmwMobile = 'Enter a valid UAE mobile number starting with 5 (9 digits)'
    }

    if (!apptDate) {
      newErrors.apptDate = 'Appointment date is required'
    } else if (apptDate < today) {
      newErrors.apptDate = 'Appointment date cannot be in the past'
    } else if (couponLookup.expiry_date && apptDate > toDateOnly(couponLookup.expiry_date)) {
      newErrors.apptDate = `Appointment must be on or before the coupon expiry date (${formatDate(couponLookup.expiry_date)})`
    }

    if (!apptTime) newErrors.apptTime = 'Time is required'

    if (!vehicleYear) {
      newErrors.vehicleYear = 'Vehicle year is required'
    } else {
      const yr = Number(vehicleYear)
      const isPrivileged = PRIVILEGED_ROLES_2012_BYPASS.includes(profile?.user_role)
      if (!isPrivileged && yr < 2012) newErrors.vehicleYear = 'Vehicle must be 2012 or newer'
      else if (yr > new Date().getFullYear()) newErrors.vehicleYear = 'Invalid vehicle year'
    }

    if (apptNotes && apptNotes.length > 500) {
      newErrors.apptNotes = 'Notes must be maximum 500 characters'
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      showToast(Object.values(newErrors)[0], 'error')
      return
    }

    setErrors({})

    const bmwPlate = buildPlateCombined(bmwEmirate, bmwCategory, bmwPlateNumber.trim().toUpperCase())
    const subOfferObj = subOffers.find(s => s.id === selectedSubOffer)

    setBookingLoading(true)

    // Pre-check: plate already redeemed this coupon?
    const { data: existingPlate } = await supabase
      .from('appointments')
      .select('id')
      .eq('coupon_id', couponLookup.id)
      .eq('redeemed_plate', bmwPlate)
      .not('status', 'eq', 'cancelled')
      .maybeSingle()

    if (existingPlate) {
      showToast(`This ${couponLookup.referral_brand || 'Referral'} plate has already redeemed this coupon.`, 'error')
      setBookingLoading(false)
      return
    }

    // Race condition guard: re-check cap
    const { data: freshOffer } = await supabase
      .from('offers')
      .select('visited_count, coupon_cap')
      .eq('id', couponLookup.offer_id!)
      .single()

    if (
      freshOffer &&
      freshOffer.coupon_cap != null &&
      freshOffer.visited_count != null &&
      freshOffer.visited_count >= freshOffer.coupon_cap
    ) {
      showToast(`This offer has now reached its maximum of ${freshOffer.coupon_cap} redemptions.`, 'error')
      setBookingLoading(false)
      return
    }

    // Race condition guard: re-check coupon status and expiry
    const { data: freshCoupon } = await supabase
      .from('coupons')
      .select('status, expiry_date')
      .eq('id', couponLookup.id)
      .single()

    if (freshCoupon) {
      if (freshCoupon.status !== 'ACTIVE') {
        showToast('Coupon is no longer active — cannot book.', 'error')
        setBookingLoading(false)
        return
      }
      if (freshCoupon.expiry_date && toDateOnly(freshCoupon.expiry_date) < today) {
        showToast('This coupon has expired and can no longer be used.', 'error')
        setBookingLoading(false)
        return
      }
    }

    const { error } = await supabase.from('appointments').insert({
      coupon_id: couponLookup.id,
      coupon_code: couponLookup.coupon_code,
      vehicle_make: couponLookup.referral_brand || 'Referral',
      vehicle_plate: bmwPlate,
      vehicle_year: Number(vehicleYear),
      appointment_date: apptDate,
      appointment_time: apptTime,
      notes: apptNotes.trim() || null,
      offer_id: couponLookup.offer_id,
      sub_offer_id: subOfferObj?.id || null,
      sub_offer_name: subOfferObj?.name || null,
      redeemed_plate: bmwPlate,
      customer_mobile: bmwMobile.trim(),
      status: 'scheduled',
      booked_by: profile?.id,
    })

    if (error) {
      if (error.code === '23505') {
        showToast(`This ${couponLookup.referral_brand || 'Referral'} plate has already redeemed this coupon.`, 'error')
      } else {
        showToast('Failed to book appointment. Please try again.', 'error')
      }
      setBookingLoading(false)
      return
    }

    // Auto-create or update referral customer profile
    await upsertReferralCustomer(supabase, {
      mobile_number: bmwMobile.trim(),
      plate: bmwPlate,
      car_make: couponLookup.referral_brand,
      vehicle_year: Number(vehicleYear),
    })

    showToast('Appointment booked successfully')
    setBookingLoading(false)
    resetModal()
    await loadAppointments()
  }

  async function openStatusModal(appt: Appointment) {
    setSelectedAppt(appt)
    setNewStatus('')
    setStatusNote('')
    setRescheduleDate('')
    setRescheduleTime('')
    setJobCardSubOffer(appt.sub_offer_id || '')
    setJobCardSubOffers([])
    setErrors({})
    setInvoiceNumber('')
    setShowStatusModal(true)

    if (appt.offer_id) {
      setJobCardSubOfferLoading(true)
      const { data } = await supabase
        .from('sub_offers')
        .select('id, name, sort_order')
        .eq('offer_id', appt.offer_id)
        .eq('is_active', true)
        .order('sort_order')
      setJobCardSubOffers(data || [])
      setJobCardSubOfferLoading(false)
    }
  }

  function getAvailableStatuses(appt: Appointment): string[] {
    switch (appt.status) {
      case 'scheduled':
      case 'rescheduled':
        return [
          'customer_not_reachable',
          'follow_up_confirmed',
          ...((appt.reschedule_count || 0) < 1 && appt.status !== 'rescheduled' ? ['rescheduled'] : []),
          'job_card_open',
          'cancelled',
        ]
      case 'customer_not_reachable':
        return (appt.not_reachable_count || 0) >= 3
          ? []
          : ['customer_not_reachable', 'follow_up_confirmed', 'job_card_open', 'cancelled']
      case 'follow_up_confirmed':
        return ['job_card_open', 'customer_not_reachable', 'cancelled']
      case 'job_card_open':
        return ['visited', 'cancelled']
      default:
        return []
    }
  }

  async function applyStatusUpdate() {
    if (!selectedAppt || !newStatus) return

    const newErrors: Record<string, string> = {}

    if ((newStatus === 'customer_not_reachable' || newStatus === 'follow_up_confirmed') && !statusNote.trim()) {
      newErrors.statusNote = 'A note is required for this status'
    }
    if (newStatus === 'rescheduled') {
      if (!rescheduleDate) newErrors.rescheduleDate = 'New date required'
      else if (rescheduleDate < today) newErrors.rescheduleDate = 'Reschedule date cannot be in the past'
      if (!rescheduleTime) newErrors.rescheduleTime = 'New time required'
    }
    if (newStatus === 'job_card_open' && jobCardSubOffers.length > 0 && !jobCardSubOffer) {
      newErrors.jobCardSubOffer = 'Sub-offer selection is required to open job card'
    }
    if (statusNote && statusNote.length > 500) {
      newErrors.statusNote = 'Notes must be maximum 500 characters'
    }
    if (newStatus === 'visited' && !invoiceNumber.trim()) {
      newErrors.invoiceNumber = 'Invoice number is required to mark visited'
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      showToast(Object.values(newErrors)[0], 'error')
      return
    }

    setErrors({})
    setStatusUpdating(true)

    const newNotReachableCount = newStatus === 'customer_not_reachable'
      ? (selectedAppt.not_reachable_count || 0) + 1
      : (selectedAppt.not_reachable_count || 0)

    const autoCancel = newNotReachableCount >= 3
    const subOfferObj = jobCardSubOffers.find(s => s.id === jobCardSubOffer)

    const updatePayload: any = {
      status: autoCancel ? 'cancelled' : newStatus,
      follow_up_note: statusNote.trim() || selectedAppt.follow_up_note,
      not_reachable_count: newNotReachableCount,
      updated_at: new Date().toISOString(),
    }

    if (newStatus === 'rescheduled') {
      updatePayload.appointment_date = rescheduleDate
      updatePayload.appointment_time = rescheduleTime
      updatePayload.reschedule_count = (selectedAppt.reschedule_count || 0) + 1
    }

    if (newStatus === 'job_card_open' && subOfferObj) {
      updatePayload.sub_offer_id = subOfferObj.id
      updatePayload.sub_offer_name = subOfferObj.name
    }

    if (newStatus === 'visited') {
      updatePayload.invoice_number = invoiceNumber.trim()
    }

    const { error } = await supabase
      .from('appointments')
      .update(updatePayload)
      .eq('id', selectedAppt.id)

    if (error) {
      showToast('Failed to update status', 'error')
      setStatusUpdating(false)
      return
    }

    if (newStatus === 'visited') {
      if (selectedAppt.coupon_id) {
        // REFERRAL coupons are never set to REDEEMED via appointment flow
        // They stay ACTIVE until expiry date passes or manual cancellation
        // Advance the paired LOYALTY coupon stage
        const { error: rpcError, data: rpcResult } = await supabase
          .rpc('advance_m_coupon_stage', { p_b_coupon_id: selectedAppt.coupon_id })

        if (rpcError) {
          showToast('Appointment marked visited but stage advance failed — check manually', 'error')
        } else {
          const result = rpcResult as any
          if (result?.success) {
            showToast(`Visited — loyalty advanced to Stage ${result.new_stage}`)
          } else {
            showToast('Appointment marked visited')
          }
        }
      } else {
        showToast('Appointment marked visited')
      }

      if (selectedAppt.offer_id) {
        await supabase.rpc('increment_offer_visited_count', { offer_id_input: selectedAppt.offer_id })
      }

      // Fetch and calculate commission split if coupon was created by receptionist
      if (selectedAppt.coupon_id) {
        try {
          const { data: couponData, error: couponFetchError } = await supabase
            .from('coupons')
            .select('id, offer_id, issued_by, advisor_name, advisor_code, created_by_receptionist')
            .eq('id', selectedAppt.coupon_id)
            .single()

          if (couponFetchError) {
            console.error('Error fetching referral coupon for commission split:', couponFetchError)
          } else if (couponData && couponData.created_by_receptionist === true && couponData.offer_id && couponData.issued_by) {
            const { data: offerData, error: offerFetchError } = await supabase
              .from('offers')
              .select('commission_amount')
              .eq('id', couponData.offer_id)
              .single()

            if (offerFetchError) {
              console.error('Error fetching offer commission for commission split:', offerFetchError)
            } else if (offerData) {
              const commissionAmount = offerData.commission_amount || 0
              const receptionistAmount = commissionAmount / 2
              const advisorAmount = commissionAmount / 2

              const { error: splitInsertError } = await supabase
                .from('coupon_commission_splits')
                .upsert({
                  coupon_id: couponData.id,
                  offer_id: couponData.offer_id,
                  receptionist_id: couponData.issued_by,
                  advisor_code: couponData.advisor_code || '',
                  advisor_name: couponData.advisor_name || '',
                  total_commission_amount: commissionAmount,
                  receptionist_amount: receptionistAmount,
                  advisor_amount: advisorAmount,
                }, { onConflict: 'coupon_id', ignoreDuplicates: true })

              if (splitInsertError) {
                console.error('Error inserting coupon commission split:', splitInsertError)
              }
            }
          }
        } catch (err) {
          console.error('Unexpected error in coupon commission split logic:', err)
        }
      }
    } else if (autoCancel) {
      showToast('3 unreachable attempts — appointment auto-cancelled')
    } else {
      showToast('Status updated successfully')
    }

    setStatusUpdating(false)
    setShowStatusModal(false)
    setSelectedAppt(null)
    await loadAppointments()
  }

  const apptMaxDate = couponLookup?.expiry_date ? toDateOnly(couponLookup.expiry_date) : undefined

  if (loading) return <PageSkeleton layout="table" />

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#F7F7F7', paddingTop: '16px' }}>
      <style>{`
        @keyframes slideIn { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes pulse   { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
        @keyframes spin    { to { transform: rotate(360deg); } }
        .appt-row:hover { background-color: #F7F9FF !important; }
      `}</style>


      <Navbar />

      <main style={{ padding: '0 32px 48px' }}>
        <Breadcrumb items={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Appointments' }]} />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '28px' }}>
          <div>
            <h1 style={{ fontSize: '22px', fontWeight: '700', color: '#1A1A1A', margin: 0 }}>Appointments</h1>
            <p style={{ color: '#666666', fontSize: '14px', marginTop: '4px' }}>
              {new Date().toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })}
            </p>
          </div>
          <button
            onClick={() => setShowModal(true)}
            style={{ padding: '10px 20px', backgroundColor: '#0074BD', color: '#FFFFFF', border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}
          >
            + New Appointment
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '14px', marginBottom: '28px' }}>
          {[
            { label: 'Total', value: stats.total, color: '#162860' },
            { label: 'Scheduled', value: stats.scheduled, color: '#0074BD' },
            { label: 'Follow-up Confirmed', value: stats.followUp, color: '#16a34a' },
            { label: 'Job Card Open', value: stats.jobCardOpen, color: '#7c3aed' },
            { label: 'Visited', value: stats.visited, color: '#0074BD' },
            { label: 'Cancelled', value: stats.cancelled, color: '#666666' },
          ].map(s => (
            <div key={s.label} style={{ backgroundColor: '#FFFFFF', borderRadius: '14px', padding: '18px 20px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', borderLeft: `4px solid ${s.color}` }}>
              <p style={{ fontSize: '12px', color: '#666', fontWeight: '500', margin: '0 0 6px' }}>{s.label}</p>
              <p style={{ fontSize: '28px', fontWeight: '700', color: '#1A1A1A', margin: 0, lineHeight: 1 }}>{s.value}</p>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
          <input
            style={{ padding: '9px 14px', fontSize: '14px', border: '1.5px solid #E0E0E0', borderRadius: '8px', outline: 'none', minWidth: '260px', backgroundColor: '#FFFFFF' }}
            placeholder="Search by coupon code, plate, or appt number…"
            value={search}
            onChange={e => setSearch(e.target.value.replace(/[<>]/g, '').slice(0, 100))}
          />
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            style={{ padding: '9px 14px', fontSize: '14px', border: '1.5px solid #E0E0E0', borderRadius: '8px', outline: 'none', backgroundColor: '#FFFFFF', color: '#1A1A1A' }}
          >
            <option value="all">All Statuses</option>
            {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
              <option key={key} value={key}>{cfg.label}</option>
            ))}
          </select>
        </div>

        <div style={{ backgroundColor: '#FFFFFF', borderRadius: '16px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
          {filtered.length === 0 ? (
            <div style={{ padding: '64px', textAlign: 'center', color: '#666', fontSize: '14px' }}>
              {appointments.length === 0 ? 'No appointments yet. Book the first one above.' : 'No appointments match your search.'}
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ backgroundColor: '#F7F7F7', borderBottom: '1px solid #E0E0E0' }}>
                  {['Appt #', 'Coupon Code', 'Referral Plate', 'Sub-offer', 'Date & Time', 'Year', 'Status', 'Actions'].map(h => (
                    <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '700', color: '#666', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paginatedAppointments.map(appt => {
                  const cfg = STATUS_CONFIG[appt.status] || STATUS_CONFIG.scheduled
                  const isTerminal = appt.status === 'visited' || appt.status === 'cancelled'
                  const isToday = appt.appointment_date === today
                  return (
                    <tr key={appt.id} className="appt-row" style={{ borderBottom: '1px solid #F0F0F0', backgroundColor: isToday ? '#FAFCFF' : '#FFFFFF' }}>
                      <td style={{ padding: '14px 16px', fontSize: '13px', fontWeight: '600', color: '#162860' }}>{appt.appointment_number}</td>
                      <td style={{ padding: '14px 16px', fontSize: '13px', color: '#1A1A1A', fontFamily: 'monospace' }}>{appt.coupon_code}</td>
                      <td style={{ padding: '14px 16px', fontSize: '13px', color: '#444' }}>{appt.vehicle_plate || '—'}</td>
                      <td style={{ padding: '14px 16px', fontSize: '13px', color: '#444' }}>{appt.sub_offer_name || '—'}</td>
                      <td style={{ padding: '14px 16px', fontSize: '13px', color: '#1A1A1A' }}>
                        <span style={{ fontWeight: isToday ? '700' : '400', color: isToday ? '#0074BD' : '#1A1A1A' }}>
                          {formatDate(appt.appointment_date)}
                        </span>
                        <br />
                        <span style={{ fontSize: '12px', color: '#666' }}>{appt.appointment_time?.slice(0, 5)}</span>
                      </td>
                      <td style={{ padding: '14px 16px', fontSize: '13px', color: '#444' }}>{appt.vehicle_year || '—'}</td>
                      <td style={{ padding: '14px 16px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <span style={{ display: 'inline-block', fontSize: '11px', fontWeight: '600', padding: '4px 10px', borderRadius: '100px', backgroundColor: cfg.bg, color: cfg.color }}>
                            {cfg.label}
                          </span>
                          {(appt.not_reachable_count || 0) > 0 && <span style={{ fontSize: '11px', color: '#D0021B' }}>{appt.not_reachable_count}/3 attempts</span>}
                          {(appt.reschedule_count || 0) > 0 && <span style={{ fontSize: '11px', color: '#f59e0b' }}>Rescheduled once</span>}
                        </div>
                      </td>
                      <td style={{ padding: '14px 16px' }}>
                        {!isTerminal && (
                          <button
                            onClick={() => openStatusModal(appt)}
                            style={{ padding: '7px 14px', fontSize: '12px', fontWeight: '600', backgroundColor: '#F0F4FF', color: '#162860', border: 'none', borderRadius: '7px', cursor: 'pointer' }}
                          >
                            Update Status
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        {totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', padding: '20px 0' }}>
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              style={{ padding: '7px 14px', fontSize: '13px', fontWeight: '600', border: '1.5px solid #E0E0E0', borderRadius: '8px', backgroundColor: '#FFFFFF', color: currentPage === 1 ? '#CCC' : '#162860', cursor: currentPage === 1 ? 'not-allowed' : 'pointer' }}
            >
              ← Prev
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).filter(p => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 2).map((p, idx, arr) => (
              <span key={p}>
                {idx > 0 && arr[idx - 1] !== p - 1 && <span style={{ color: '#888', fontSize: '13px', padding: '0 4px' }}>…</span>}
                <button
                  onClick={() => setCurrentPage(p)}
                  style={{ padding: '7px 12px', fontSize: '13px', fontWeight: '600', border: '1.5px solid', borderColor: p === currentPage ? '#0074BD' : '#E0E0E0', borderRadius: '8px', backgroundColor: p === currentPage ? '#0074BD' : '#FFFFFF', color: p === currentPage ? '#FFFFFF' : '#444', cursor: 'pointer', minWidth: '36px' }}
                >
                  {p}
                </button>
              </span>
            ))}
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              style={{ padding: '7px 14px', fontSize: '13px', fontWeight: '600', border: '1.5px solid #E0E0E0', borderRadius: '8px', backgroundColor: '#FFFFFF', color: currentPage === totalPages ? '#CCC' : '#162860', cursor: currentPage === totalPages ? 'not-allowed' : 'pointer' }}
            >
              Next →
            </button>
            <span style={{ fontSize: '12px', color: '#888', marginLeft: '8px' }}>
              Page {currentPage} of {totalPages}
            </span>
          </div>
        )}
      </main>

      {/* ── NEW APPOINTMENT MODAL ── */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, backgroundColor: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
          <div style={{ backgroundColor: '#FFFFFF', borderRadius: '20px', padding: '32px', width: '100%', boxShadow: '0 8px 40px rgba(0,0,0,0.15)', maxHeight: '90vh', overflowY: 'auto' }}>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#1A1A1A', margin: 0 }}>New Appointment</h2>
              <button onClick={resetModal} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#666' }}>×</button>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={labelStyle}>Referral Coupon Code *</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  style={{ ...inputStyle, flex: 1, fontFamily: 'monospace' }}
                  value={couponCode}
                  onChange={e => { setCouponCode(e.target.value.replace(/[<>]/g, '').toUpperCase()); setCouponLookup(null); setCouponError('') }}
                  placeholder="001_A12345_AUTOVERSA_..."
                  onKeyDown={e => e.key === 'Enter' && lookupCoupon()}
                />
                <button
                  onClick={lookupCoupon}
                  disabled={couponLoading || !couponCode.trim()}
                  style={{ padding: '0 16px', backgroundColor: '#0074BD', color: '#FFFFFF', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: '600', cursor: 'pointer', whiteSpace: 'nowrap', opacity: couponLoading || !couponCode.trim() ? 0.6 : 1 }}
                >
                  {couponLoading ? '...' : 'Verify'}
                </button>
              </div>
              {couponError && <p style={{ fontSize: '12px', color: '#D0021B', marginTop: '6px' }}>{couponError}</p>}
            </div>

            {couponLookup && (
              <div style={{ backgroundColor: '#F0F7FF', borderRadius: '12px', padding: '16px', marginBottom: '20px', border: '1.5px solid #0074BD' }}>
                <p style={{ fontSize: '12px', fontWeight: '700', color: '#0074BD', margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Referral Coupon Verified
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  {[
                    ['Offer', couponLookup.offer_title || '—'],
                    [(couponLookup.loyalty_brand || 'Loyalty') + ' Plate', couponLookup.plate_combined_string || '—'],
                    ['Owner Mobile', couponLookup.mobile_number ? '+971 ' + couponLookup.mobile_number : '—'],
                    ['Expires', couponLookup.expiry_date ? formatDate(couponLookup.expiry_date) : '—'],
                    ['Cap', couponLookup.offer_coupon_cap ? String(couponLookup.offer_visited_count) + ' / ' + String(couponLookup.offer_coupon_cap) + ' used' : 'No cap'],
                  ].map(([k, v]) => (
                    <div key={k}>
                      <p style={{ fontSize: '11px', color: '#666', margin: 0 }}>{k}</p>
                      <p style={{ fontSize: '13px', fontWeight: '600', color: '#1A1A1A', margin: 0 }}>{v}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {couponLookup && (
              <>
                <p style={{ fontSize: '12px', fontWeight: '700', color: '#666', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 12px' }}>{(couponLookup.referral_brand || 'Referral') + ' Vehicle'}</p>

                <div style={{ marginBottom: '16px' }}>
                  <label style={labelStyle}>{(couponLookup.referral_brand || 'Referral') + ' Plate *'}</label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                    <select
                      value={bmwEmirate}
                      onChange={e => {
                        setBmwEmirate(e.target.value)
                        setBmwCategory('')
                        setBmwCategories(getEmirateCategories(e.target.value))
                        if (e.target.value) setErrors(prev => { const copy = { ...prev }; delete copy.bmwEmirate; return copy })
                      }}
                      style={inputStyle}
                    >
                      <option value="">Emirate</option>
                      {emirates.map(em => (
                        <option key={em.id} value={em.code}>{em.name}</option>
                      ))}
                    </select>
                    <select
                      value={bmwCategory}
                      onChange={e => {
                        setBmwCategory(e.target.value)
                        if (e.target.value) setErrors(prev => { const copy = { ...prev }; delete copy.bmwCategory; return copy })
                      }}
                      style={{ ...inputStyle, opacity: !bmwEmirate ? 0.5 : 1 }}
                      disabled={!bmwEmirate}
                    >
                      <option value="">Category</option>
                      {bmwCategories.map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                    <input
                      style={{ ...inputStyle, opacity: !bmwCategory ? 0.5 : 1 }}
                      value={bmwPlateNumber}
                      onChange={e => {
                        const val = e.target.value.replace(/\D/g, '').slice(0, 5)
                        setBmwPlateNumber(val)
                        if (val) setErrors(prev => { const copy = { ...prev }; delete copy.bmwPlateNumber; return copy })
                      }}
                      placeholder="12345"
                      disabled={!bmwCategory}
                    />
                  </div>
                  {errors.bmwEmirate && <p style={{ fontSize: '12px', color: '#D0021B', marginTop: '4px' }}>{errors.bmwEmirate}</p>}
                  {errors.bmwCategory && <p style={{ fontSize: '12px', color: '#D0021B', marginTop: '4px' }}>{errors.bmwCategory}</p>}
                  {errors.bmwPlateNumber && <p style={{ fontSize: '12px', color: '#D0021B', marginTop: '4px' }}>{errors.bmwPlateNumber}</p>}
                  {bmwEmirate && bmwCategory && bmwPlateNumber && (
                    <p style={{ fontSize: '12px', color: '#0074BD', marginTop: '4px', fontWeight: '600' }}>
                      Plate: {buildPlateCombined(bmwEmirate, bmwCategory, bmwPlateNumber.toUpperCase())}
                    </p>
                  )}
                </div>

                <div style={{ marginBottom: '16px' }}>
                  <label style={labelStyle}>Vehicle Year * {!PRIVILEGED_ROLES_2012_BYPASS.includes(profile?.user_role) && '(2012 or newer)'}</label>
                  <input
                    style={inputStyle}
                    value={vehicleYear}
                    onChange={e => {
                      const val = e.target.value.replace(/\D/g, '')
                      setVehicleYear(val)
                      if (val) setErrors(prev => { const copy = { ...prev }; delete copy.vehicleYear; return copy })
                    }}
                    placeholder="e.g. 2019"
                  />
                  {errors.vehicleYear && <p style={{ fontSize: '12px', color: '#D0021B', marginTop: '4px' }}>{errors.vehicleYear}</p>}
                </div>

                <p style={{ fontSize: '12px', fontWeight: '700', color: '#666', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '16px 0 12px' }}>{(couponLookup.referral_brand || 'Referral') + ' Customer'}</p>

                <div style={{ marginBottom: '16px' }}>
                  <label style={labelStyle}>Customer Mobile *</label>
                  <div style={{ display: 'flex', alignItems: 'center', border: '1.5px solid #E0E0E0', borderRadius: '8px', overflow: 'hidden', backgroundColor: '#FFFFFF' }}>
                    <span style={{ padding: '10px 12px', backgroundColor: '#F7F7F7', fontSize: '14px', color: '#666', borderRight: '1.5px solid #E0E0E0', whiteSpace: 'nowrap', fontWeight: '600' }}>+971</span>
                    <input
                      style={{ flex: 1, padding: '10px 12px', fontSize: '14px', border: 'none', outline: 'none', backgroundColor: '#FFFFFF', color: '#1A1A1A', fontFamily: 'inherit' }}
                      value={bmwMobile}
                      onChange={e => {
                        let val = e.target.value.replace(/[^\d+]/g, '')
                        if (val.startsWith('+971')) val = val.slice(4)
                        else if (val.startsWith('9715')) val = val.slice(3)
                        else if (val.startsWith('05')) val = val.slice(1)
                        val = val.replace(/\D/g, '')
                        if (val.length > 0 && !val.startsWith('5')) val = ''
                        val = val.slice(0, 9)
                        setBmwMobile(val)
                        if (val) setErrors(prev => { const copy = { ...prev }; delete copy.bmwMobile; return copy })
                      }}
                      placeholder="5XXXXXXXX"
                    />
                  </div>
                  {errors.bmwMobile && <p style={{ fontSize: '12px', color: '#D0021B', marginTop: '4px' }}>{errors.bmwMobile}</p>}
                </div>

                {subOffers.length > 0 && (
                  <div style={{ marginBottom: '16px' }}>
                    <label style={labelStyle}>Sub-offer (optional)</label>
                    <select
                      value={selectedSubOffer}
                      onChange={e => setSelectedSubOffer(e.target.value)}
                      style={inputStyle}
                    >
                      <option value="">Select sub-offer…</option>
                      {subOffers.map(s => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>
                )}

                <p style={{ fontSize: '12px', fontWeight: '700', color: '#666', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '16px 0 12px' }}>Appointment</p>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                  <div>
                    <label style={labelStyle}>
                      Date *{apptMaxDate ? ` (up to ${formatDate(apptMaxDate)})` : ''}
                    </label>
                    <input
                      style={inputStyle}
                      type="date"
                      min={today}
                      max={apptMaxDate}
                      value={apptDate}
                      onChange={e => {
                        setApptDate(e.target.value)
                        if (e.target.value) setErrors(prev => { const copy = { ...prev }; delete copy.apptDate; return copy })
                      }}
                    />
                    {errors.apptDate && <p style={{ fontSize: '12px', color: '#D0021B', marginTop: '4px' }}>{errors.apptDate}</p>}
                  </div>
                  <div>
                    <label style={labelStyle}>Time *</label>
                    <input style={inputStyle} type="time" value={apptTime} onChange={e => {
                      setApptTime(e.target.value)
                      if (e.target.value) setErrors(prev => { const copy = { ...prev }; delete copy.apptTime; return copy })
                    }} />
                    {errors.apptTime && <p style={{ fontSize: '12px', color: '#D0021B', marginTop: '4px' }}>{errors.apptTime}</p>}
                  </div>
                </div>

                <div style={{ marginBottom: '24px' }}>
                  <label style={labelStyle}>Notes (optional)</label>
                  <textarea
                    style={{ ...inputStyle, height: '70px', resize: 'vertical' }}
                    value={apptNotes}
                    onChange={e => {
                      let val = e.target.value.replace(/[<>]/g, '')
                      if (val.length > 500) val = val.slice(0, 500)
                      setApptNotes(val)
                    }}
                    onBlur={() => setApptNotes(prev => prev.trim())}
                    placeholder="Any additional notes…"
                  />
                  {errors.apptNotes && <p style={{ fontSize: '12px', color: '#D0021B', marginTop: '4px' }}>{errors.apptNotes}</p>}
                </div>

                <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                  <button onClick={resetModal} style={{ padding: '11px 22px', backgroundColor: '#F0F0F0', color: '#444', border: 'none', borderRadius: '9px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}>
                    Cancel
                  </button>
                  <button
                    onClick={bookAppointment}
                    disabled={bookingLoading}
                    style={{ padding: '11px 28px', backgroundColor: bookingLoading ? '#93C5E8' : '#0074BD', color: '#FFFFFF', border: 'none', borderRadius: '9px', fontSize: '14px', fontWeight: '600', cursor: bookingLoading ? 'not-allowed' : 'pointer' }}
                  >
                    {bookingLoading ? 'Booking…' : 'Book Appointment'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── STATUS UPDATE MODAL ── */}
      {showStatusModal && selectedAppt && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, backgroundColor: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
          <div style={{ backgroundColor: '#FFFFFF', borderRadius: '20px', padding: '32px', width: '100%', boxShadow: '0 8px 40px rgba(0,0,0,0.15)', maxHeight: '90vh', overflowY: 'auto' }}>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#1A1A1A', margin: 0 }}>Update Status</h2>
              <button onClick={() => setShowStatusModal(false)} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#666' }}>×</button>
            </div>

            <p style={{ fontSize: '13px', color: '#666', marginBottom: '20px' }}>
              {selectedAppt.appointment_number} · {selectedAppt.coupon_code}
            </p>

            <div style={{ marginBottom: '20px' }}>
              <p style={{ fontSize: '12px', color: '#666', margin: '0 0 4px' }}>Current Status</p>
              <span style={{ display: 'inline-block', fontSize: '12px', fontWeight: '600', padding: '5px 12px', borderRadius: '100px', backgroundColor: STATUS_CONFIG[selectedAppt.status]?.bg, color: STATUS_CONFIG[selectedAppt.status]?.color }}>
                {STATUS_CONFIG[selectedAppt.status]?.label}
              </span>
            </div>

            {getAvailableStatuses(selectedAppt).length === 0 ? (
              <p style={{ fontSize: '14px', color: '#D0021B', fontWeight: '500' }}>No further status updates available.</p>
            ) : (
              <>
                <div style={{ marginBottom: '16px' }}>
                  <label style={labelStyle}>Move to *</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {getAvailableStatuses(selectedAppt).map(s => {
                      const cfg = STATUS_CONFIG[s]
                      return (
                        <div
                          key={s}
                          onClick={() => {
                            setNewStatus(s)
                            setErrors(prev => { const copy = { ...prev }; delete copy.statusNote; delete copy.rescheduleDate; delete copy.rescheduleTime; delete copy.jobCardSubOffer; delete copy.invoiceNumber; return copy })
                          }}
                          style={{ padding: '12px 16px', borderRadius: '10px', cursor: 'pointer', border: `1.5px solid ${newStatus === s ? cfg.color : '#E0E0E0'}`, backgroundColor: newStatus === s ? cfg.bg : '#FFFFFF', display: 'flex', alignItems: 'center', gap: '10px' }}
                        >
                          <div style={{ width: '16px', height: '16px', borderRadius: '50%', flexShrink: 0, border: `2px solid ${newStatus === s ? cfg.color : '#CCC'}`, backgroundColor: newStatus === s ? cfg.color : 'transparent' }} />
                          <span style={{ fontSize: '14px', fontWeight: '600', color: newStatus === s ? cfg.color : '#1A1A1A' }}>{cfg.label}</span>
                          {s === 'customer_not_reachable' && (
                            <span style={{ fontSize: '12px', color: '#D0021B', marginLeft: 'auto' }}>{(selectedAppt.not_reachable_count || 0) + 1}/3</span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>

                {newStatus === 'rescheduled' && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                    <div>
                      <label style={labelStyle}>New Date *</label>
                      <input style={inputStyle} type="date" min={today} value={rescheduleDate} onChange={e => {
                        setRescheduleDate(e.target.value)
                        if (e.target.value) setErrors(prev => { const copy = { ...prev }; delete copy.rescheduleDate; return copy })
                      }} />
                      {errors.rescheduleDate && <p style={{ fontSize: '12px', color: '#D0021B', marginTop: '4px' }}>{errors.rescheduleDate}</p>}
                    </div>
                    <div>
                      <label style={labelStyle}>New Time *</label>
                      <input style={inputStyle} type="time" value={rescheduleTime} onChange={e => {
                        setRescheduleTime(e.target.value)
                        if (e.target.value) setErrors(prev => { const copy = { ...prev }; delete copy.rescheduleTime; return copy })
                      }} />
                      {errors.rescheduleTime && <p style={{ fontSize: '12px', color: '#D0021B', marginTop: '4px' }}>{errors.rescheduleTime}</p>}
                    </div>
                  </div>
                )}

                {newStatus === 'job_card_open' && (
                  <div style={{ marginBottom: '16px' }}>
                    <label style={labelStyle}>
                      {jobCardSubOffers.length > 0 ? 'Sub-offer *' : 'Sub-offer'}
                    </label>
                    {jobCardSubOfferLoading ? (
                      <p style={{ fontSize: '13px', color: '#666' }}>Loading…</p>
                    ) : jobCardSubOffers.length > 0 ? (
                      <select
                        value={jobCardSubOffer}
                        onChange={e => {
                          setJobCardSubOffer(e.target.value)
                          if (e.target.value) setErrors(prev => { const copy = { ...prev }; delete copy.jobCardSubOffer; return copy })
                        }}
                        style={inputStyle}
                      >
                        <option value="">Select sub-offer…</option>
                        {jobCardSubOffers.map(s => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                      </select>
                    ) : (
                      <p style={{ fontSize: '13px', color: '#666' }}>No sub-offers configured for this offer.</p>
                    )}
                    {errors.jobCardSubOffer && <p style={{ fontSize: '12px', color: '#D0021B', marginTop: '4px' }}>{errors.jobCardSubOffer}</p>}
                  </div>
                )}

                {newStatus === 'visited' && (
                  <div style={{ marginBottom: '16px' }}>
                    <label style={labelStyle}>Invoice Number *</label>
                    <input
                      style={inputStyle}
                      value={invoiceNumber}
                      onChange={e => {
                        const val = e.target.value.replace(/[<>]/g, '').slice(0, 100)
                        setInvoiceNumber(val)
                        if (val.trim()) {
                          setErrors(prev => {
                            const copy = { ...prev }
                            delete copy.invoiceNumber
                            return copy
                          })
                        }
                      }}
                      placeholder="e.g. INV-12345"
                    />
                    {errors.invoiceNumber && <p style={{ fontSize: '12px', color: '#D0021B', marginTop: '4px' }}>{errors.invoiceNumber}</p>}
                  </div>
                )}

                {(newStatus === 'customer_not_reachable' || newStatus === 'follow_up_confirmed') && (
                  <div style={{ marginBottom: '16px' }}>
                    <label style={labelStyle}>
                      Note * {newStatus === 'customer_not_reachable' ? '(what was attempted)' : '(confirmation details)'}
                    </label>
                    <textarea
                      style={{ ...inputStyle, height: '70px', resize: 'vertical' }}
                      value={statusNote}
                      onChange={e => {
                        let val = e.target.value.replace(/[<>]/g, '')
                        if (val.length > 500) val = val.slice(0, 500)
                        setStatusNote(val)
                        if (val.trim()) setErrors(prev => { const copy = { ...prev }; delete copy.statusNote; return copy })
                      }}
                      onBlur={() => setStatusNote(prev => prev.trim())}
                      placeholder={newStatus === 'customer_not_reachable' ? 'e.g. Called twice, no answer' : 'e.g. Customer confirmed via WhatsApp'}
                    />
                    {errors.statusNote && <p style={{ fontSize: '12px', color: '#D0021B', marginTop: '4px' }}>{errors.statusNote}</p>}
                    {newStatus === 'customer_not_reachable' && ((selectedAppt.not_reachable_count || 0) + 1) >= 3 && (
                      <p style={{ fontSize: '12px', color: '#D0021B', marginTop: '6px', fontWeight: '600' }}>
                        This is the 3rd attempt — appointment will be automatically cancelled.
                      </p>
                    )}
                  </div>
                )}

                <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '8px' }}>
                  <button onClick={() => setShowStatusModal(false)} style={{ padding: '11px 22px', backgroundColor: '#F0F0F0', color: '#444', border: 'none', borderRadius: '9px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}>
                    Cancel
                  </button>
                  <button
                    onClick={applyStatusUpdate}
                    disabled={statusUpdating || !newStatus}
                    style={{ padding: '11px 28px', backgroundColor: statusUpdating || !newStatus ? '#93C5E8' : '#0074BD', color: '#FFFFFF', border: 'none', borderRadius: '9px', fontSize: '14px', fontWeight: '600', cursor: statusUpdating || !newStatus ? 'not-allowed' : 'pointer' }}
                  >
                    {statusUpdating ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}