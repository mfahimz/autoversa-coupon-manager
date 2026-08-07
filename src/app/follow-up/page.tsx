'use client'

import { useEffect, useState, useCallback } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import { Database } from '@/lib/database.types'
import { toast } from 'sonner'
import Navbar from '@/components/layout/Navbar'
import { loadPermissionsForRole, checkPermission, PermissionsMap } from '@/lib/permissions'

export const dynamic = 'force-dynamic'

const supabase = createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type FollowUpCoupon = {
    id: string
    coupon_code: string
    plate_number: string | null
    status: string | null
    issued_by: string | null
    issuer_name: string
    advisor_name: string | null
    mobile_number: string | null
    created_at: string | null
    offers: { title: string } | null
    follow_up_count: number
    latest_follow_up: {
        id: string
        follow_up_status: string
        followed_up_by: string
        created_at: string
        updated_at: string
    } | null
}

const STATUS_LABELS: Record<string, string> = {
    pending: 'Pending',
    contacted: 'Contacted',
    declined: 'Declined',
}

const STATUS_COLORS: Record<string, string> = {
    pending: 'bg-amber-50 text-amber-700 border border-amber-200',
    contacted: 'bg-blue-50 text-blue-700 border border-blue-200',
    declined: 'bg-red-50 text-red-600 border border-red-200',
}

const PAGE_SIZE = 20
const RESURFACE_DAYS = 21

function daysSince(dateStr: string | null): number {
    if (!dateStr) return 0
    return Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24))
}

function isResurfaced(latestFollowUp: FollowUpCoupon['latest_follow_up']): boolean {
    if (!latestFollowUp) return false
    if (latestFollowUp.follow_up_status === 'pending') return false
    const daysSinceAction = Math.floor((Date.now() - new Date(latestFollowUp.updated_at).getTime()) / (1000 * 60 * 60 * 24))
    return daysSinceAction >= RESURFACE_DAYS
}

function isActiveTier(coupon: FollowUpCoupon): boolean {
    const status = coupon.latest_follow_up?.follow_up_status ?? 'pending'
    if (status === 'pending') return true
    return isResurfaced(coupon.latest_follow_up)
}

function buildWhatsAppMessage(coupon: FollowUpCoupon): string {
  const code = coupon.coupon_code
  const message =
`مرحباً! 👋 لديك كوبون إحالة من AutoVersa: ${code}

شاركه مع صديق يمتلك BMW — سيحصل على عرض خدمة حصري، وستتقدم في مكافأة الولاء الخاصة بك. 🎁

هل أنت مستعد للحجز؟ تواصل معنا في أي وقت.
— فريق المراغي

---

Hi! 👋 You have an AutoVersa referral coupon: ${code}

Share it with a BMW-owning friend — they get an exclusive service benefit, and you advance your loyalty reward. 🎁

Ready to book? Contact us anytime.
— Al Maraghi Team`
  const phone = coupon.mobile_number?.replace(/\D/g, '') ?? ''
  return `https://web.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(message)}`
}

export default function FollowUpPage() {
    const [coupons, setCoupons] = useState<FollowUpCoupon[]>([])
    const [loading, setLoading] = useState(true)
    const [userRole, setUserRole] = useState<string | null>(null)
    const [userId, setUserId] = useState<string | null>(null)
    const [permissions, setPermissions] = useState<PermissionsMap>({})
    const [issuedByFilter, setIssuedByFilter] = useState<string>('')
    const [statusFilter, setStatusFilter] = useState<string>('')
    const [advisors, setAdvisors] = useState<{ id: string; full_name: string }[]>([])
    const [updatingId, setUpdatingId] = useState<string | null>(null)
    const [page, setPage] = useState(1)

    const ADVISOR_ROLES = ['SERVICE_ADVISOR', 'BMW_SERVICE_ADVISOR']

    const loadData = useCallback(async (isBackground = false) => {
        if (!isBackground) setLoading(true)
        const params = new URLSearchParams()
        if (issuedByFilter) params.set('issuedBy', issuedByFilter)

        const res = await fetch(`/api/follow-up/coupons?${params.toString()}`)
        if (!res.ok) {
            toast.error('Failed to load follow-up queue')
            if (!isBackground) setLoading(false)
            return
        }
        const json = await res.json()
        setCoupons(json.data ?? [])
        setUserRole(json.userRole)
        setUserId(json.userId)
        if (json.userRole) {
            const perms = await loadPermissionsForRole(json.userRole)
            setPermissions(perms)
        }
        if (!isBackground) {
            setLoading(false)
            setPage(1)
        }
    }, [issuedByFilter])

    useEffect(() => {
        loadData()
    }, [loadData])

    useEffect(() => {
        if (userRole && !ADVISOR_ROLES.includes(userRole)) {
            supabase
                .from('profiles')
                .select('id, full_name')
                .eq('is_active', true)
                .order('full_name')
                .then(({ data }) =>
                    setAdvisors((data ?? []).map((p) => ({ id: p.id, full_name: p.full_name ?? '' })))
                )
        }
    }, [userRole])

    const canSendReminder = checkPermission(permissions, userRole || '', 'action:follow_up:send_reminder', 'action')
    const canDecline = checkPermission(permissions, userRole || '', 'action:follow_up:decline', 'action')

    async function handleSendReminder(coupon: FollowUpCoupon) {
        if (!userId) return
        if (!canSendReminder) {
            toast.error('You do not have permission to send follow-up reminders.')
            return
        }
        setUpdatingId(coupon.id)

        const res = await fetch('/api/follow-up/record', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                coupon_id: coupon.id,
                follow_up_status: 'contacted',
            }),
        })

        if (!res.ok) {
            if (res.status === 403) {
                toast.error("You don't have permission to do this")
            } else {
                toast.error('Failed to record follow-up')
            }
            setUpdatingId(null)
            return
        }

        const inserted = await res.json()

        window.open(buildWhatsAppMessage(coupon), '_blank')
        toast.success(`Follow-up recorded for ${coupon.plate_number}`)

        setCoupons((prev) =>
            prev.map((c) =>
                c.id === coupon.id
                    ? {
                          ...c,
                          latest_follow_up: inserted,
                          follow_up_count: c.follow_up_count + 1,
                      }
                    : c
            )
        )
        setUpdatingId(null)
        loadData(true)
    }

    async function handleStatusChange(coupon: FollowUpCoupon, newStatus: string) {
        if (!userId) return
        if (!canDecline) {
            toast.error('You do not have permission to mark follow-up as declined.')
            return
        }
        setUpdatingId(coupon.id)

        const res = await fetch('/api/follow-up/record', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                coupon_id: coupon.id,
                follow_up_status: newStatus,
            }),
        })

        if (!res.ok) {
            if (res.status === 403) {
                toast.error("You don't have permission to do this")
            } else {
                toast.error('Failed to update status')
            }
            setUpdatingId(null)
            return
        }

        const inserted = await res.json()

        toast.success('Status updated')

        setCoupons((prev) =>
            prev.map((c) =>
                c.id === coupon.id
                    ? {
                          ...c,
                          latest_follow_up: inserted,
                          follow_up_count: c.follow_up_count + 1,
                      }
                    : c
            )
        )
        setUpdatingId(null)
        loadData(true)
    }

    const isAdvisorRole = userRole ? ADVISOR_ROLES.includes(userRole) : false

    const filtered = coupons
        .filter((c) => {
            if (!statusFilter) return true
            const latest = c.latest_follow_up?.follow_up_status ?? 'pending'
            return latest === statusFilter
        })
        .sort((a, b) => {
            const aActive = isActiveTier(a)
            const bActive = isActiveTier(b)
            if (aActive !== bActive) return aActive ? -1 : 1
            if (aActive) {
                return daysSince(b.created_at) - daysSince(a.created_at)
            }
            const aTime = a.latest_follow_up ? new Date(a.latest_follow_up.updated_at).getTime() : 0
            const bTime = b.latest_follow_up ? new Date(b.latest_follow_up.updated_at).getTime() : 0
            return bTime - aTime
        })

    const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
    const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

    return (
        <>
            <Navbar />
            <div className="px-8 py-6">

                {/* Header */}
                <div className="flex items-start justify-between mb-6">
                    <div>
                        <h1 className="text-2xl font-bold text-[#162860]">Coupon Follow-Up</h1>
                        <p className="text-sm text-[#666666] mt-1">
                            Unredeemed referral coupons issued 8+ days ago — sorted by most overdue.
                        </p>
                    </div>
                    <div className="text-right">
                        <div className="text-2xl font-bold text-[#162860]">{filtered.length}</div>
                        <div className="text-xs text-[#666666]">coupon{filtered.length !== 1 ? 's' : ''} pending</div>
                    </div>
                </div>

                {/* Filters */}
                <div className="flex flex-wrap gap-3 mb-5">
                    {!isAdvisorRole && (
                        <select
                            value={issuedByFilter}
                            onChange={(e) => { setIssuedByFilter(e.target.value); setPage(1) }}
                            className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-[#1A1A1A] bg-white shadow-sm"
                        >
                            <option value="">All Advisors</option>
                            {advisors.map((a) => (
                                <option key={a.id} value={a.id}>{a.full_name}</option>
                            ))}
                        </select>
                    )}
                    <select
                        value={statusFilter}
                        onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }}
                        className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-[#1A1A1A] bg-white shadow-sm"
                    >
                        <option value="">All Statuses</option>
                        <option value="pending">Pending</option>
                        <option value="contacted">Contacted</option>
                        <option value="declined">Declined</option>
                    </select>
                </div>

                {/* Content */}
                {loading ? (
                    <div className="flex items-center justify-center py-24 text-sm text-[#666666]">
                        Loading follow-up queue...
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-24 text-center">
                        <div className="text-4xl mb-3">✓</div>
                        <div className="text-base font-medium text-[#162860]">Queue is clear</div>
                        <div className="text-sm text-[#666666] mt-1">No unredeemed referral coupons match your filters.</div>
                    </div>
                ) : (
                    <>
                        <div className="rounded-xl border border-gray-200 overflow-hidden shadow-sm">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="bg-[#162860] text-white text-xs uppercase tracking-wide">
                                        <th className="text-left px-4 py-3 font-semibold">Plate</th>
                                        <th className="text-left px-4 py-3 font-semibold">Offer</th>
                                        {!isAdvisorRole && (
                                            <th className="text-left px-4 py-3 font-semibold">Issued By</th>
                                        )}
                                        <th className="text-left px-4 py-3 font-semibold">Days Overdue</th>
                                        <th className="text-left px-4 py-3 font-semibold">Follow-Ups</th>
                                        <th className="text-left px-4 py-3 font-semibold">Last Contact</th>
                                        <th className="text-left px-4 py-3 font-semibold">Status</th>
                                        <th className="text-left px-4 py-3 font-semibold">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {paginated.map((coupon) => {
                                        const latestStatus = coupon.latest_follow_up?.follow_up_status ?? 'pending'
                                        const days = daysSince(coupon.created_at)
                                        const isUpdating = updatingId === coupon.id

                                        return (
                                            <tr key={coupon.id} className="bg-white hover:bg-[#F7F7F7] transition-colors">
                                                <td className="px-4 py-3.5">
                                                    <span className="font-semibold text-[#162860]">{coupon.plate_number ?? '—'}</span>
                                                </td>
                                                <td className="px-4 py-3.5 text-[#1A1A1A]">
                                                    {coupon.offers?.title ?? '—'}
                                                </td>
                                                {!isAdvisorRole && (
                                                    <td className="px-4 py-3.5 text-[#1A1A1A]">{coupon.issuer_name}</td>
                                                )}
                                                <td className="px-4 py-3.5">
                                                    <span className="font-semibold text-[#1A1A1A]">{days}d</span>
                                                </td>
                                                <td className="px-4 py-3.5 text-[#666666]">
                                                    {coupon.follow_up_count === 0 ? (
                                                        <span className="text-[#999]">None</span>
                                                    ) : (
                                                        <span className="font-medium text-[#1A1A1A]">{coupon.follow_up_count}×</span>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3.5 text-[#666666] text-xs">
                                                    {coupon.latest_follow_up ? (
                                                        <span title={new Date(coupon.latest_follow_up.updated_at).toLocaleDateString('en-GB')}>
                                                            {(() => {
                                                                const daysSinceAction = Math.floor((Date.now() - new Date(coupon.latest_follow_up.updated_at).getTime()) / (1000 * 60 * 60 * 24))
                                                                if (daysSinceAction === 0) return 'Today'
                                                                if (daysSinceAction === 1) return '1 day ago'
                                                                return `${daysSinceAction} days ago`
                                                            })()}
                                                        </span>
                                                    ) : (
                                                        '—'
                                                    )}
                                                </td>
                                                <td className="px-4 py-3.5">
                                                    <div className="flex items-center gap-1.5 flex-wrap">
                                                        <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[latestStatus] ?? STATUS_COLORS.pending}`}>
                                                            {STATUS_LABELS[latestStatus] ?? 'Pending'}
                                                        </span>
                                                        {isResurfaced(coupon.latest_follow_up) && (
                                                            <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-orange-50 text-orange-700 border border-orange-200">
                                                                Follow-up again
                                                            </span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3.5">
                                                    <div className="flex items-center gap-2">
                                                        {canSendReminder && (
                                                            <button
                                                                onClick={() => handleSendReminder(coupon)}
                                                                disabled={isUpdating}
                                                                className="px-3 py-1.5 bg-[#0074BD] text-white text-xs font-medium rounded-lg hover:bg-[#005a94] disabled:opacity-50 transition-colors whitespace-nowrap"
                                                            >
                                                                Send Reminder
                                                            </button>
                                                        )}
                                                        {canDecline && latestStatus !== 'declined' && (
                                                            <button
                                                                onClick={() => handleStatusChange(coupon, 'declined')}
                                                                disabled={isUpdating}
                                                                className="px-3 py-1.5 bg-white border border-gray-200 text-[#666666] text-xs font-medium rounded-lg hover:border-red-300 hover:text-red-600 disabled:opacity-50 transition-colors"
                                                            >
                                                                Declined
                                                            </button>
                                                        )}
                                                        {!canSendReminder && !canDecline && (
                                                            <span className="text-xs text-gray-400 font-medium">—</span>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>

                        {/* Pagination */}
                        {totalPages > 1 && (
                            <div className="flex items-center justify-between mt-4">
                                <p className="text-sm text-[#666666]">
                                    Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}
                                </p>
                                <div className="flex items-center gap-1">
                                    <button
                                        onClick={() => setPage(p => Math.max(1, p - 1))}
                                        disabled={page === 1}
                                        className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50 transition-colors"
                                    >
                                        Previous
                                    </button>
                                    {Array.from({ length: totalPages }, (_, i) => i + 1)
                                        .filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
                                        .reduce<(number | string)[]>((acc, p, i, arr) => {
                                            if (i > 0 && (p as number) - (arr[i - 1] as number) > 1) acc.push('...')
                                            acc.push(p)
                                            return acc
                                        }, [])
                                        .map((p, i) =>
                                            p === '...' ? (
                                                <span key={`ellipsis-${i}`} className="px-2 text-[#666666] text-sm">…</span>
                                            ) : (
                                                <button
                                                    key={p}
                                                    onClick={() => setPage(p as number)}
                                                    className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${page === p
                                                        ? 'bg-[#162860] text-white border-[#162860]'
                                                        : 'border-gray-200 hover:bg-gray-50'
                                                        }`}
                                                >
                                                    {p}
                                                </button>
                                            )
                                        )}
                                    <button
                                        onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                        disabled={page === totalPages}
                                        className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50 transition-colors"
                                    >
                                        Next
                                    </button>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>
        </>
    )
}