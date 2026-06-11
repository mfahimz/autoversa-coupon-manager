'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Navbar from '@/components/layout/Navbar'
import Breadcrumb from '@/components/layout/Breadcrumb'

interface Appointment {
  id: string
  appointment_number: string
  coupon_id: string
  coupon_code: string
  vehicle_make: string | null
  vehicle_plate: string | null
  vehicle_year: number | null
  appointment_date: string
  appointment_time: string
  notes: string | null
  follow_up_note: string | null
  booked_by: string | null
  wa_confirmation_sent: boolean
  status: string
  reschedule_count: number
  not_reachable_count: number
  offer_id: string | null
  created_at: string
}

interface CouponLookup {
  id: string
  coupon_code: string
  customer_name: string | null
  vehicle_plate: string | null
  mobile_number: string | null
  status: string
  expiry_date: string | null
  offer_id: string | null
  offers: { title: string; vehicle_config: string | null } | null
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  scheduled: { label: 'Scheduled', color: '#162860', bg: '#EEF1FF' },
  customer_not_reachable: { label: 'Not Reachable', color: '#D0021B', bg: '#FFEAEA' },
  follow_up_confirmed: { label: 'Follow-up Confirmed', color: '#16a34a', bg: '#EEFBF0' },
  rescheduled: { label: 'Rescheduled', color: '#f59e0b', bg: '#FFF8E7' },
  job_card_open: { label: 'Job Card Open', color: '#7c3aed', bg: '#F3EEFF' },
  visited: { label: 'Visited', color: '#0074BD', bg: '#E8F4FF' },
  cancelled: { label: 'Cancelled', color: '#666666', bg: '#F0F0F0' },
}

export default function AppointmentsPage() {
  const router = useRouter()
  const supabase = createClient()

  const [profile, setProfile] = useState<any>(null)
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')

  // New appointment modal
  const [showModal, setShowModal] = useState(false)
  const [couponCode, setCouponCode] = useState('')
  const [couponLookup, setCouponLookup] = useState<CouponLookup | null>(null)
  const [couponError, setCouponError] = useState('')
  const [couponLoading, setCouponLoading] = useState(false)
  const [apptDate, setApptDate] = useState('')
  const [apptTime, setApptTime] = useState('')
  const [vehicleYear, setVehicleYear] = useState('')
  const [apptNotes, setApptNotes] = useState('')
  const [bookingLoading, setBookingLoading] = useState(false)

  // Status update modal
  const [showStatusModal, setShowStatusModal] = useState(false)
  const [selectedAppt, setSelectedAppt] = useState<Appointment | null>(null)
  const [statusNote, setStatusNote] = useState('')
  const [newStatus, setNewStatus] = useState('')
  const [rescheduleDate, setRescheduleDate] = useState('')
  const [rescheduleTime, setRescheduleTime] = useState('')
  const [statusUpdating, setStatusUpdating] = useState(false)

  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  useEffect(() => { init() }, [])

  async function init() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    const { data: profileData } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()

    if (!profileData) { router.push('/login'); return }

    // Block everyone except ADMIN and BMW_SERVICE_ADVISOR
    if (profileData.user_role !== 'ADMIN' && profileData.user_role !== 'BMW_SERVICE_ADVISOR') {
      router.push('/dashboard')
      return
    }

    setProfile(profileData)
    await loadAppointments()
  }

  async function loadAppointments() {
    setLoading(true)
    const { data } = await supabase
      .from('appointments')
      .select('*')
      .order('appointment_date', { ascending: true })
      .order('appointment_time', { ascending: true })
    setAppointments(data || [])
    setLoading(false)
  }

  function showToast(message: string, type: 'success' | 'error' = 'success') {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3500)
  }

  // Stats
  const stats = {
    total: appointments.length,
    scheduled: appointments.filter(a => a.status === 'scheduled').length,
    followUpConfirmed: appointments.filter(a => a.status === 'follow_up_confirmed').length,
    jobCardOpen: appointments.filter(a => a.status === 'job_card_open').length,
    visited: appointments.filter(a => a.status === 'visited').length,
    cancelled: appointments.filter(a => a.status === 'cancelled').length,
  }

  // Filter
  const filtered = appointments.filter(a => {
    const matchSearch = !search ||
      a.coupon_code.toLowerCase().includes(search.toLowerCase()) ||
      (a.vehicle_plate || '').toLowerCase().includes(search.toLowerCase()) ||
      a.appointment_number.toLowerCase().includes(search.toLowerCase())
    const matchStatus = statusFilter === 'all' || a.status === statusFilter
    return matchSearch && matchStatus
  })

  // Coupon lookup
  async function lookupCoupon() {
    if (!couponCode.trim()) return
    setCouponLoading(true)
    setCouponError('')
    setCouponLookup(null)

    const { data, error } = await supabase
      .from('coupons')
      .select('id, coupon_code, customer_name, plate_combined_string, mobile_number, status, expiry_date, offer_id, offers(title, vehicle_config)')
      .eq('coupon_code', couponCode.trim().toUpperCase())
      .single()

    if (error || !data) {
      setCouponError('Coupon code not found.')
      setCouponLoading(false)
      return
    }

    if (data.status !== 'ACTIVE') {
      setCouponError(`Coupon is ${data.status.toLowerCase()} — cannot book an appointment.`)
      setCouponLoading(false)
      return
    }

    if (data.expiry_date && new Date(data.expiry_date) < new Date()) {
      setCouponError('Coupon has expired.')
      setCouponLoading(false)
      return
    }

    // Check if appointment already exists for this coupon
    const { data: existing } = await supabase
      .from('appointments')
      .select('id, status')
      .eq('coupon_code', couponCode.trim().toUpperCase())
      .not('status', 'eq', 'cancelled')
      .maybeSingle()

    if (existing) {
      setCouponError('An active appointment already exists for this coupon.')
      setCouponLoading(false)
      return
    }

    setCouponLookup({ ...data, vehicle_plate: data.plate_combined_string } as any)
    setCouponLoading(false)
  }

  function resetModal() {
    setShowModal(false)
    setCouponCode('')
    setCouponLookup(null)
    setCouponError('')
    setApptDate('')
    setApptTime('')
    setVehicleYear('')
    setApptNotes('')
  }

  async function bookAppointment() {
    if (!couponLookup) return
    if (!apptDate) { showToast('Date is required', 'error'); return }
    if (!apptTime) { showToast('Time is required', 'error'); return }
    if (!vehicleYear) { showToast('Vehicle year is required', 'error'); return }
    if (Number(vehicleYear) < 2012) { showToast('Vehicle must be 2012 or newer (AP-09)', 'error'); return }
    if (Number(vehicleYear) > new Date().getFullYear()) { showToast('Invalid vehicle year', 'error'); return }

    setBookingLoading(true)

    const { error } = await supabase.from('appointments').insert({
      coupon_id: couponLookup.id,
      coupon_code: couponLookup.coupon_code,
      vehicle_make: 'BMW',
      vehicle_plate: couponLookup.vehicle_plate,
      vehicle_year: Number(vehicleYear),
      appointment_date: apptDate,
      appointment_time: apptTime,
      notes: apptNotes.trim() || null,
      offer_id: couponLookup.offer_id,
      status: 'scheduled',
      booked_by: profile?.id,
    })

    if (error) {
      showToast('Failed to book appointment', 'error')
      setBookingLoading(false)
      return
    }

    showToast('Appointment booked successfully')
    setBookingLoading(false)
    resetModal()
    await loadAppointments()
  }

  // Status update
  function openStatusModal(appt: Appointment) {
    setSelectedAppt(appt)
    setNewStatus('')
    setStatusNote('')
    setRescheduleDate('')
    setRescheduleTime('')
    setShowStatusModal(true)
  }

  function getAvailableStatuses(appt: Appointment): string[] {
    switch (appt.status) {
      case 'scheduled':
      case 'rescheduled':
        return [
          'customer_not_reachable',
          'follow_up_confirmed',
          ...(appt.reschedule_count < 1 && appt.status !== 'rescheduled' ? ['rescheduled'] : []),
          'job_card_open',
          'cancelled',
        ]
      case 'customer_not_reachable':
        return appt.not_reachable_count >= 3
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

    // Note required for not_reachable and follow_up_confirmed
    if ((newStatus === 'customer_not_reachable' || newStatus === 'follow_up_confirmed') && !statusNote.trim()) {
      showToast('A note is required for this status', 'error')
      return
    }

    if (newStatus === 'rescheduled' && (!rescheduleDate || !rescheduleTime)) {
      showToast('New date and time required for rescheduling', 'error')
      return
    }

    setStatusUpdating(true)

    const newNotReachableCount = newStatus === 'customer_not_reachable'
      ? selectedAppt.not_reachable_count + 1
      : selectedAppt.not_reachable_count

    const autoCancel = newNotReachableCount >= 3

    const updatePayload: any = {
      status: autoCancel ? 'cancelled' : newStatus,
      follow_up_note: statusNote.trim() || selectedAppt.follow_up_note,
      not_reachable_count: newNotReachableCount,
      updated_at: new Date().toISOString(),
    }

    if (newStatus === 'rescheduled') {
      updatePayload.appointment_date = rescheduleDate
      updatePayload.appointment_time = rescheduleTime
      updatePayload.reschedule_count = selectedAppt.reschedule_count + 1
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

    // If visited — increment offer visited_count
    if (newStatus === 'visited' && selectedAppt.offer_id) {
      await supabase.rpc('increment_offer_visited_count', {
        offer_id_input: selectedAppt.offer_id,
      })
    }

    if (autoCancel) {
      showToast('3 unreachable attempts — appointment auto-cancelled')
    } else {
      showToast('Status updated successfully')
    }

    setStatusUpdating(false)
    setShowStatusModal(false)
    setSelectedAppt(null)
    await loadAppointments()
  }

  const today = new Date().toISOString().split('T')[0]

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#F7F7F7', paddingTop: '16px' }}>
      <style>{`
        @keyframes slideIn { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
        .appt-row:hover { background-color: #F7F9FF !important; }
      `}</style>

      {toast && (
        <div style={{
          position: 'fixed', top: '24px', right: '24px', zIndex: 2000,
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
          { label: 'Appointments' },
        ]} />

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '28px' }}>
          <div>
            <h1 style={{ fontSize: '22px', fontWeight: '700', color: '#1A1A1A', margin: 0 }}>
              Appointments
            </h1>
            <p style={{ color: '#666666', fontSize: '14px', marginTop: '4px' }}>
              {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
          </div>
          <button
            onClick={() => setShowModal(true)}
            style={{
              padding: '10px 20px', backgroundColor: '#0074BD', color: '#FFFFFF',
              border: 'none', borderRadius: '10px', fontSize: '14px',
              fontWeight: '600', cursor: 'pointer',
            }}
          >
            + New Appointment
          </button>
        </div>

        {/* Stat Cards */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: '14px', marginBottom: '28px',
        }}>
          {[
            { label: 'Total', value: stats.total, color: '#162860' },
            { label: 'Scheduled', value: stats.scheduled, color: '#0074BD' },
            { label: 'Follow-up Confirmed', value: stats.followUpConfirmed, color: '#16a34a' },
            { label: 'Job Card Open', value: stats.jobCardOpen, color: '#7c3aed' },
            { label: 'Visited', value: stats.visited, color: '#0074BD' },
            { label: 'Cancelled', value: stats.cancelled, color: '#666666' },
          ].map(s => (
            <div key={s.label} style={{
              backgroundColor: '#FFFFFF', borderRadius: '14px', padding: '18px 20px',
              boxShadow: '0 1px 4px rgba(0,0,0,0.06)', borderLeft: `4px solid ${s.color}`,
            }}>
              <p style={{ fontSize: '12px', color: '#666', fontWeight: '500', margin: '0 0 6px' }}>{s.label}</p>
              {loading ? (
                <div style={{ height: '28px', width: '48px', backgroundColor: '#F0F0F0', borderRadius: '6px', animation: 'pulse 1.5s ease-in-out infinite' }} />
              ) : (
                <p style={{ fontSize: '28px', fontWeight: '700', color: '#1A1A1A', margin: 0, lineHeight: 1 }}>{s.value}</p>
              )}
            </div>
          ))}
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
          <input
            style={{
              padding: '9px 14px', fontSize: '14px', border: '1.5px solid #E0E0E0',
              borderRadius: '8px', outline: 'none', minWidth: '260px', backgroundColor: '#FFFFFF',
            }}
            placeholder="Search by coupon code, plate, or number…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            style={{
              padding: '9px 14px', fontSize: '14px', border: '1.5px solid #E0E0E0',
              borderRadius: '8px', outline: 'none', backgroundColor: '#FFFFFF', color: '#1A1A1A',
            }}
          >
            <option value="all">All Statuses</option>
            {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
              <option key={key} value={key}>{cfg.label}</option>
            ))}
          </select>
        </div>

        {/* Appointments Table */}
        <div style={{
          backgroundColor: '#FFFFFF', borderRadius: '16px',
          boxShadow: '0 1px 4px rgba(0,0,0,0.06)', overflow: 'hidden',
        }}>
          {loading ? (
            <div style={{ padding: '48px', display: 'flex', justifyContent: 'center' }}>
              <div style={{
                width: '32px', height: '32px', borderRadius: '50%',
                border: '3px solid #0074BD', borderTopColor: 'transparent',
                animation: 'spin 0.7s linear infinite',
              }} />
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: '64px', textAlign: 'center', color: '#666', fontSize: '14px' }}>
              {appointments.length === 0
                ? 'No appointments yet. Book the first one using the button above.'
                : 'No appointments match your search.'}
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ backgroundColor: '#F7F7F7', borderBottom: '1px solid #E0E0E0' }}>
                  {['Appt #', 'Coupon Code', 'Plate', 'Date & Time', 'Year', 'Status', 'Actions'].map(h => (
                    <th key={h} style={{
                      padding: '12px 16px', textAlign: 'left', fontSize: '12px',
                      fontWeight: '700', color: '#666', textTransform: 'uppercase', letterSpacing: '0.06em',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(appt => {
                  const cfg = STATUS_CONFIG[appt.status] || STATUS_CONFIG.scheduled
                  const isTerminal = appt.status === 'visited' || appt.status === 'cancelled'
                  const isToday = appt.appointment_date === today
                  return (
                    <tr key={appt.id} className="appt-row" style={{
                      borderBottom: '1px solid #F0F0F0',
                      backgroundColor: isToday ? '#FAFCFF' : '#FFFFFF',
                    }}>
                      <td style={{ padding: '14px 16px', fontSize: '13px', fontWeight: '600', color: '#162860' }}>
                        {appt.appointment_number}
                      </td>
                      <td style={{ padding: '14px 16px', fontSize: '13px', color: '#1A1A1A', fontFamily: 'monospace' }}>
                        {appt.coupon_code}
                      </td>
                      <td style={{ padding: '14px 16px', fontSize: '13px', color: '#444' }}>
                        {appt.vehicle_plate || '—'}
                      </td>
                      <td style={{ padding: '14px 16px', fontSize: '13px', color: '#1A1A1A' }}>
                        <span style={{ fontWeight: isToday ? '700' : '400', color: isToday ? '#0074BD' : '#1A1A1A' }}>
                          {new Date(appt.appointment_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </span>
                        <br />
                        <span style={{ fontSize: '12px', color: '#666' }}>
                          {appt.appointment_time?.slice(0, 5)}
                        </span>
                      </td>
                      <td style={{ padding: '14px 16px', fontSize: '13px', color: '#444' }}>
                        {appt.vehicle_year || '—'}
                      </td>
                      <td style={{ padding: '14px 16px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <span style={{
                            display: 'inline-block', fontSize: '11px', fontWeight: '600',
                            padding: '4px 10px', borderRadius: '100px',
                            backgroundColor: cfg.bg, color: cfg.color,
                          }}>
                            {cfg.label}
                          </span>
                          {appt.not_reachable_count > 0 && (
                            <span style={{ fontSize: '11px', color: '#D0021B' }}>
                              {appt.not_reachable_count}/3 attempts
                            </span>
                          )}
                          {appt.reschedule_count > 0 && (
                            <span style={{ fontSize: '11px', color: '#f59e0b' }}>
                              Rescheduled once
                            </span>
                          )}
                        </div>
                      </td>
                      <td style={{ padding: '14px 16px' }}>
                        {!isTerminal && (
                          <button
                            onClick={() => openStatusModal(appt)}
                            style={{
                              padding: '7px 14px', fontSize: '12px', fontWeight: '600',
                              backgroundColor: '#F0F4FF', color: '#162860',
                              border: 'none', borderRadius: '7px', cursor: 'pointer',
                            }}
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
      </main>

      {/* ── NEW APPOINTMENT MODAL ── */}
      {showModal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          backgroundColor: 'rgba(0,0,0,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '24px',
        }}>
          <div style={{
            backgroundColor: '#FFFFFF', borderRadius: '20px',
            padding: '32px', width: '100%', maxWidth: '520px',
            boxShadow: '0 8px 40px rgba(0,0,0,0.15)',
            maxHeight: '90vh', overflowY: 'auto',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#1A1A1A', margin: 0 }}>
                New Appointment
              </h2>
              <button onClick={resetModal} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#666' }}>×</button>
            </div>

            {/* Coupon lookup */}
            <div style={{ marginBottom: '20px' }}>
              <label style={labelStyle}>Coupon Code *</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  style={{ ...inputStyle, flex: 1, fontFamily: 'monospace' }}
                  value={couponCode}
                  onChange={e => { setCouponCode(e.target.value.toUpperCase()); setCouponLookup(null); setCouponError('') }}
                  placeholder="AUTOVERSA_..."
                  onKeyDown={e => e.key === 'Enter' && lookupCoupon()}
                />
                <button
                  onClick={lookupCoupon}
                  disabled={couponLoading || !couponCode.trim()}
                  style={{
                    padding: '0 16px', backgroundColor: '#0074BD', color: '#FFFFFF',
                    border: 'none', borderRadius: '8px', fontSize: '13px',
                    fontWeight: '600', cursor: 'pointer', whiteSpace: 'nowrap',
                  }}
                >
                  {couponLoading ? '...' : 'Verify'}
                </button>
              </div>
              {couponError && (
                <p style={{ fontSize: '12px', color: '#D0021B', marginTop: '6px' }}>{couponError}</p>
              )}
            </div>

            {/* Coupon details auto-populated */}
            {couponLookup && (
              <div style={{
                backgroundColor: '#F0F7FF', borderRadius: '12px',
                padding: '16px', marginBottom: '20px',
                border: '1.5px solid #0074BD',
              }}>
                <p style={{ fontSize: '12px', fontWeight: '700', color: '#0074BD', margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Coupon Verified ✓
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                  {[
                    ['Customer', couponLookup.customer_name || '—'],
                    ['Plate', couponLookup.vehicle_plate || '—'],
                    ['Mobile', couponLookup.mobile_number ? `+971${couponLookup.mobile_number}` : '—'],
                    ['Offer', (couponLookup.offers as any)?.title || '—'],
                    ['Expires', couponLookup.expiry_date ? new Date(couponLookup.expiry_date).toLocaleDateString('en-GB') : '—'],
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
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                  <div>
                    <label style={labelStyle}>Date *</label>
                    <input
                      style={inputStyle} type="date"
                      min={today}
                      value={apptDate}
                      onChange={e => setApptDate(e.target.value)}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Time *</label>
                    <input
                      style={inputStyle} type="time"
                      value={apptTime}
                      onChange={e => setApptTime(e.target.value)}
                    />
                  </div>
                </div>

                <div style={{ marginBottom: '16px' }}>
                  <label style={labelStyle}>Vehicle Year * (2012 or newer)</label>
                  <input
                    style={inputStyle} type="number"
                    value={vehicleYear}
                    onChange={e => setVehicleYear(e.target.value)}
                    placeholder="e.g. 2019"
                    min="2012"
                    max={new Date().getFullYear()}
                  />
                </div>

                <div style={{ marginBottom: '24px' }}>
                  <label style={labelStyle}>Notes (optional)</label>
                  <textarea
                    style={{ ...inputStyle, height: '70px', resize: 'vertical' }}
                    value={apptNotes}
                    onChange={e => setApptNotes(e.target.value)}
                    placeholder="Any additional notes…"
                  />
                </div>

                <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                  <button onClick={resetModal} style={{
                    padding: '11px 22px', backgroundColor: '#F0F0F0', color: '#444',
                    border: 'none', borderRadius: '9px', fontSize: '14px', fontWeight: '600', cursor: 'pointer',
                  }}>
                    Cancel
                  </button>
                  <button
                    onClick={bookAppointment}
                    disabled={bookingLoading}
                    style={{
                      padding: '11px 28px',
                      backgroundColor: bookingLoading ? '#93C5E8' : '#0074BD',
                      color: '#FFFFFF', border: 'none', borderRadius: '9px',
                      fontSize: '14px', fontWeight: '600',
                      cursor: bookingLoading ? 'not-allowed' : 'pointer',
                    }}
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
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          backgroundColor: 'rgba(0,0,0,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '24px',
        }}>
          <div style={{
            backgroundColor: '#FFFFFF', borderRadius: '20px',
            padding: '32px', width: '100%', maxWidth: '460px',
            boxShadow: '0 8px 40px rgba(0,0,0,0.15)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#1A1A1A', margin: 0 }}>
                Update Status
              </h2>
              <button onClick={() => setShowStatusModal(false)} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#666' }}>×</button>
            </div>

            <p style={{ fontSize: '13px', color: '#666', marginBottom: '20px' }}>
              {selectedAppt.appointment_number} · {selectedAppt.coupon_code}
            </p>

            {/* Current status */}
            <div style={{ marginBottom: '20px' }}>
              <p style={{ fontSize: '12px', color: '#666', margin: '0 0 4px' }}>Current Status</p>
              <span style={{
                display: 'inline-block', fontSize: '12px', fontWeight: '600',
                padding: '5px 12px', borderRadius: '100px',
                backgroundColor: STATUS_CONFIG[selectedAppt.status]?.bg,
                color: STATUS_CONFIG[selectedAppt.status]?.color,
              }}>
                {STATUS_CONFIG[selectedAppt.status]?.label}
              </span>
            </div>

            {getAvailableStatuses(selectedAppt).length === 0 ? (
              <p style={{ fontSize: '14px', color: '#D0021B', fontWeight: '500' }}>
                No further status updates available.
              </p>
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
                          onClick={() => setNewStatus(s)}
                          style={{
                            padding: '12px 16px', borderRadius: '10px', cursor: 'pointer',
                            border: `1.5px solid ${newStatus === s ? cfg.color : '#E0E0E0'}`,
                            backgroundColor: newStatus === s ? cfg.bg : '#FFFFFF',
                            display: 'flex', alignItems: 'center', gap: '10px',
                          }}
                        >
                          <div style={{
                            width: '16px', height: '16px', borderRadius: '50%', flexShrink: 0,
                            border: `2px solid ${newStatus === s ? cfg.color : '#CCC'}`,
                            backgroundColor: newStatus === s ? cfg.color : 'transparent',
                          }} />
                          <span style={{ fontSize: '14px', fontWeight: '600', color: newStatus === s ? cfg.color : '#1A1A1A' }}>
                            {cfg.label}
                          </span>
                          {s === 'customer_not_reachable' && (
                            <span style={{ fontSize: '12px', color: '#D0021B', marginLeft: 'auto' }}>
                              {selectedAppt.not_reachable_count + 1}/3
                            </span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Reschedule date/time */}
                {newStatus === 'rescheduled' && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                    <div>
                      <label style={labelStyle}>New Date *</label>
                      <input style={inputStyle} type="date" min={today} value={rescheduleDate} onChange={e => setRescheduleDate(e.target.value)} />
                    </div>
                    <div>
                      <label style={labelStyle}>New Time *</label>
                      <input style={inputStyle} type="time" value={rescheduleTime} onChange={e => setRescheduleTime(e.target.value)} />
                    </div>
                  </div>
                )}

                {/* Note */}
                {(newStatus === 'customer_not_reachable' || newStatus === 'follow_up_confirmed') && (
                  <div style={{ marginBottom: '16px' }}>
                    <label style={labelStyle}>
                      Note * {newStatus === 'customer_not_reachable' ? '(what was attempted)' : '(confirmation details)'}
                    </label>
                    <textarea
                      style={{ ...inputStyle, height: '70px', resize: 'vertical' }}
                      value={statusNote}
                      onChange={e => setStatusNote(e.target.value)}
                      placeholder={newStatus === 'customer_not_reachable' ? 'e.g. Called twice, no answer' : 'e.g. Customer confirmed via WhatsApp'}
                    />
                    {newStatus === 'customer_not_reachable' && selectedAppt.not_reachable_count + 1 >= 3 && (
                      <p style={{ fontSize: '12px', color: '#D0021B', marginTop: '6px', fontWeight: '600' }}>
                        ⚠ This is the 3rd attempt — appointment will be automatically cancelled.
                      </p>
                    )}
                  </div>
                )}

                <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '8px' }}>
                  <button onClick={() => setShowStatusModal(false)} style={{
                    padding: '11px 22px', backgroundColor: '#F0F0F0', color: '#444',
                    border: 'none', borderRadius: '9px', fontSize: '14px', fontWeight: '600', cursor: 'pointer',
                  }}>
                    Cancel
                  </button>
                  <button
                    onClick={applyStatusUpdate}
                    disabled={statusUpdating || !newStatus}
                    style={{
                      padding: '11px 28px',
                      backgroundColor: statusUpdating || !newStatus ? '#93C5E8' : '#0074BD',
                      color: '#FFFFFF', border: 'none', borderRadius: '9px',
                      fontSize: '14px', fontWeight: '600',
                      cursor: statusUpdating || !newStatus ? 'not-allowed' : 'pointer',
                    }}
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