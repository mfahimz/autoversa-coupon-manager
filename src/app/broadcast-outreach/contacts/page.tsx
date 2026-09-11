'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Navbar from '@/components/layout/Navbar'
import Breadcrumb from '@/components/layout/Breadcrumb'
import { checkPermission, loadPermissionsForRole, PermissionsMap } from '@/lib/permissions'
import { toast } from 'sonner'

const supabase = createClient()

const PAGE_SIZE = 20

type BroadcastContact = { id: string; mobile_number: string; year: number; sent_at: string | null; sent_by: string | null; created_at: string }
type BroadcastSettings = { message_template: string | null; image_url: string | null; wave_min: number; wave_max: number; cooldown_min_minutes: number; cooldown_max_minutes: number; daily_wave_target: number }
type SendState = { current_wave_count: number; wave_target: number; cooldown_until: string | null; last_sent_at: string | null; waves_completed_today: number; daily_period_started_at: string | null; daily_override_extra: number }

const DEFAULT_SEND_STATE: SendState = { current_wave_count: 0, wave_target: 0, cooldown_until: null, last_sent_at: null, waves_completed_today: 0, daily_period_started_at: null, daily_override_extra: 0 }

function maskMobileNumber(number: string) {
    const lastFour = number.replace(/\D/g, '').slice(-4)
    return `•••• ${lastFour}`
}

function relativeDate(dateStr: string) {
    const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24))
    if (days <= 0) return 'Today'
    if (days === 1) return '1 day ago'
    return `${days} days ago`
}

function toPngBlob(sourceBlob: Blob): Promise<Blob> {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(sourceBlob)
        const img = new Image()
        img.onload = () => {
            const canvas = document.createElement('canvas')
            canvas.width = img.naturalWidth
            canvas.height = img.naturalHeight
            const ctx = canvas.getContext('2d')
            if (!ctx) { URL.revokeObjectURL(url); reject(new Error('Canvas not supported')); return }
            ctx.drawImage(img, 0, 0)
            canvas.toBlob(blob => {
                URL.revokeObjectURL(url)
                if (blob) resolve(blob)
                else reject(new Error('Failed to convert image to PNG'))
            }, 'image/png')
        }
        img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Failed to load image')) }
        img.src = url
    })
}

function formatCountdown(ms: number) {
    const totalSeconds = Math.max(0, Math.ceil(ms / 1000))
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60
    return `${minutes}m ${seconds}s`
}

export default function BroadcastOutreachContactsPage() {
    const router = useRouter()
    const [loading, setLoading] = useState(true)
    const [contacts, setContacts] = useState<BroadcastContact[]>([])
    const [settings, setSettings] = useState<BroadcastSettings>({ message_template: null, image_url: null, wave_min: 5, wave_max: 8, cooldown_min_minutes: 5, cooldown_max_minutes: 15, daily_wave_target: 20 })
    const [sendState, setSendState] = useState<SendState>(DEFAULT_SEND_STATE)
    const [now, setNow] = useState(() => Date.now())
    const [userRole, setUserRole] = useState('')
    const [userId, setUserId] = useState('')
    const [permissions, setPermissions] = useState<PermissionsMap>({})
    const [yearFilter, setYearFilter] = useState('')
    const [showSent, setShowSent] = useState(false)
    const [page, setPage] = useState(1)
    const [updatingId, setUpdatingId] = useState<string | null>(null)
    const [copying, setCopying] = useState(false)

    useEffect(() => {
        async function init() {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) { router.push('/login'); return }
            const { data: profile } = await supabase.from('profiles').select('user_role, is_active').eq('id', user.id).single<{ user_role: string; is_active: boolean | null }>()
            if (!profile) { router.push('/login'); return }
            if (profile.is_active === false) { await supabase.auth.signOut(); router.push('/login'); return }
            const loadedPermissions = await loadPermissionsForRole(profile.user_role)
            if (!checkPermission(loadedPermissions, profile.user_role, 'page:broadcast-outreach-contacts', 'view')) { router.push('/dashboard'); return }
            const [contactsResult, settingsResult, sendStateResult] = await Promise.all([
                supabase.from('broadcast_contacts').select('id, mobile_number, year, sent_at, sent_by, created_at'),
                supabase.from('broadcast_settings').select('message_template, image_url, wave_min, wave_max, cooldown_min_minutes, cooldown_max_minutes, daily_wave_target').eq('id', 1).single(),
                supabase.from('broadcast_send_state').select('current_wave_count, wave_target, cooldown_until, last_sent_at, waves_completed_today, daily_period_started_at, daily_override_extra').eq('id', 1).single(),
            ])
            if (contactsResult.error) toast.error('Failed to load broadcast contacts')
            setContacts((contactsResult.data ?? []) as BroadcastContact[])
            setSettings((settingsResult.data ?? { message_template: null, image_url: null, wave_min: 5, wave_max: 8, cooldown_min_minutes: 5, cooldown_max_minutes: 15, daily_wave_target: 20 }) as BroadcastSettings)
            if (sendStateResult.error && !sendStateResult.data) {
                await supabase.from('broadcast_send_state').upsert({ id: 1, ...DEFAULT_SEND_STATE })
            }
            setSendState((sendStateResult.data ?? DEFAULT_SEND_STATE) as SendState)
            setUserRole(profile.user_role)
            setUserId(user.id)
            setPermissions(loadedPermissions)
            setLoading(false)
        }
        init()
    }, [router])

    useEffect(() => {
        const interval = setInterval(() => setNow(Date.now()), 1000)
        return () => clearInterval(interval)
    }, [])

    const cooldownActive = !!sendState.cooldown_until && new Date(sendState.cooldown_until).getTime() > now
    const cooldownRemainingMs = cooldownActive ? new Date(sendState.cooldown_until!).getTime() - now : 0

    const dailyPeriodExpired = !sendState.daily_period_started_at || now - new Date(sendState.daily_period_started_at).getTime() >= 24 * 60 * 60 * 1000
    const wavesToday = dailyPeriodExpired ? 0 : sendState.waves_completed_today
    const dailyOverride = dailyPeriodExpired ? 0 : sendState.daily_override_extra
    const dailyLimit = settings.daily_wave_target + dailyOverride
    const dailyBlocked = !dailyPeriodExpired && wavesToday >= dailyLimit

    const canSend = checkPermission(permissions, userRole, 'action:broadcast_contacts:send_message', 'action')
    const canFilterByYear = checkPermission(permissions, userRole, 'action:broadcast_contacts:filter_by_year', 'action')
    const years = useMemo(() => Array.from(new Set(contacts.map(contact => contact.year))).sort((a, b) => b - a), [contacts])
    const filtered = useMemo(() => contacts
        .filter(contact => !canFilterByYear || !yearFilter || String(contact.year) === yearFilter)
        .filter(contact => showSent || !contact.sent_at)
        .sort((a, b) => {
            if (!!a.sent_at !== !!b.sent_at) return a.sent_at ? 1 : -1
            if (!a.sent_at) return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
            return new Date(b.sent_at!).getTime() - new Date(a.sent_at!).getTime()
        }), [contacts, canFilterByYear, yearFilter, showSent])
    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
    const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

    useEffect(() => { setPage(1) }, [yearFilter, showSent])

    async function copyImage() {
        if (!settings.image_url) return
        if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
            toast.error('Your browser does not support copying images to the clipboard.')
            return
        }
        setCopying(true)
        try {
            const response = await fetch(settings.image_url)
            if (!response.ok) throw new Error('Image could not be fetched')
            const sourceBlob = await response.blob()
            const pngBlob = await toPngBlob(sourceBlob)
            await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob })])
            toast.success('Broadcast image copied to clipboard')
        } catch (error) {
            console.error('Copy image failed', error)
            toast.error('Unable to copy the image. Your browser may block clipboard image access.')
        } finally { setCopying(false) }
    }

    async function advanceSendState() {
        const { data, error } = await supabase.rpc('advance_broadcast_send_state')
        const result = data?.[0]
        if (!error && result) {
            setSendState(previous => ({
                ...previous,
                current_wave_count: result.current_wave_count,
                wave_target: result.wave_target,
                cooldown_until: result.cooldown_until,
                waves_completed_today: result.waves_completed_today,
                daily_period_started_at: result.daily_period_started_at,
                daily_override_extra: result.daily_override_extra,
            }))
        }
    }

    async function sendMessage(contact: BroadcastContact) {
        if (!canSend || !userId || cooldownActive || dailyBlocked) return
        if (!settings.message_template?.trim()) { toast.error('Ask an admin to configure the broadcast message template first.'); return }
        setUpdatingId(contact.id)
        const phone = contact.mobile_number.replace(/\D/g, '')
        window.open(`https://web.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(settings.message_template)}`, '_blank')
        const sentAt = new Date().toISOString()
        const { error } = await supabase.from('broadcast_contacts').update({ sent_at: sentAt, sent_by: userId }).eq('id', contact.id)
        if (error) toast.error('WhatsApp opened, but the sent status could not be saved.')
        else {
            setContacts(previous => previous.map(item => item.id === contact.id ? { ...item, sent_at: sentAt, sent_by: userId } : item))
            toast.success('Message marked as sent')
            await advanceSendState()
        }
        setUpdatingId(null)
    }

    return (
        <div style={{ minHeight: '100vh', background: '#F7F7F7', paddingTop: '16px' }}>
            <Navbar />
            <main style={{ padding: '0 32px 48px' }}>
                <Breadcrumb items={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Broadcast Outreach' }, { label: 'Contacts' }]} />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', flexWrap: 'wrap', marginBottom: '24px' }}>
                    <div><h1 style={{ fontSize: '22px', fontWeight: 700, color: '#1A1A1A', margin: 0 }}>Broadcast Contacts</h1><p style={{ color: '#666', fontSize: '14px', marginTop: '6px' }}>Send the configured message to uploaded contact lists.</p></div>
                    <button onClick={copyImage} disabled={!settings.image_url || copying} style={{ ...buttonStyle, background: settings.image_url ? '#0074BD' : '#CCC', cursor: settings.image_url ? 'pointer' : 'not-allowed' }}>{copying ? 'Copying…' : 'Copy Image'}</button>
                </div>
                {!settings.image_url && <p style={{ color: '#8A5A00', background: '#FFF7E6', borderRadius: '8px', padding: '10px 12px', fontSize: '13px', margin: '0 0 16px' }}>No broadcast image is configured. Ask an admin to configure it in Settings.</p>}
                {canSend && (dailyBlocked
                    ? <p style={{ color: '#9A3412', background: '#FFF7ED', borderRadius: '8px', padding: '10px 12px', fontSize: '13px', fontWeight: 600, margin: '0 0 16px' }}>Daily wave limit reached ({wavesToday} / {dailyLimit} waves) — ask an admin to grant additional waves for today.</p>
                    : cooldownActive
                    ? <p style={{ color: '#9A3412', background: '#FFF7ED', borderRadius: '8px', padding: '10px 12px', fontSize: '13px', fontWeight: 600, margin: '0 0 16px' }}>Sending paused — resumes in {formatCountdown(cooldownRemainingMs)} · Waves today: {wavesToday} / {dailyLimit}</p>
                    : <p style={{ color: '#1E3A8A', background: '#EFF6FF', borderRadius: '8px', padding: '10px 12px', fontSize: '13px', fontWeight: 600, margin: '0 0 16px' }}>Wave: {sendState.current_wave_count} / {sendState.wave_target || settings.wave_min} messages sent · Waves today: {wavesToday} / {dailyLimit}</p>
                )}
                <section style={cardStyle}>
                    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'end', padding: '20px 24px', borderBottom: '1px solid #F0F0F0' }}>
                        {canFilterByYear && <label style={fieldLabel}>Year<select value={yearFilter} onChange={event => setYearFilter(event.target.value)} style={inputStyle}><option value="">All years</option>{years.map(year => <option key={year} value={year}>{year}</option>)}</select></label>}
                        <label style={{ display: 'flex', gap: '8px', alignItems: 'center', color: '#444', fontSize: '13px', paddingBottom: '9px' }}><input type="checkbox" checked={showSent} onChange={event => setShowSent(event.target.checked)} /> Show sent contacts</label>
                    </div>
                    {loading ? <div style={{ padding: '28px 24px', color: '#666' }}>Loading contacts…</div> : filtered.length === 0 ? <div style={{ padding: '28px 24px', color: '#666' }}>No contacts match the current view.</div> : <><div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '760px' }}><thead><tr style={{ background: '#162860', color: '#FFF', fontSize: '12px', textTransform: 'uppercase' }}><th style={headerCell}>Mobile Number</th><th style={headerCell}>Year</th><th style={headerCell}>Status</th><th style={headerCell}>Sent Date</th><th style={headerCell}>Action</th></tr></thead><tbody>{paginated.map(contact => <tr key={contact.id} style={{ background: '#FFF', borderBottom: '1px solid #F5F5F5' }}><td style={cell}><span title={contact.mobile_number}>{maskMobileNumber(contact.mobile_number)}</span>{/* This masks the visual UI only; it is not a security boundary. */}</td><td style={cell}>{contact.year}</td><td style={cell}><span style={{ fontSize: '12px', fontWeight: 600, borderRadius: '100px', padding: '4px 9px', color: contact.sent_at ? '#166534' : '#9A3412', background: contact.sent_at ? '#DCFCE7' : '#FFF7ED' }}>{contact.sent_at ? 'Sent' : 'Not Sent'}</span></td><td style={cell}>{contact.sent_at ? <span title={new Date(contact.sent_at).toLocaleString('en-GB')}>{relativeDate(contact.sent_at)}</span> : '—'}</td><td style={cell}>{canSend ? <button onClick={() => sendMessage(contact)} disabled={!!contact.sent_at || updatingId === contact.id || cooldownActive || dailyBlocked} style={{ ...smallButtonStyle, opacity: contact.sent_at || updatingId === contact.id || cooldownActive || dailyBlocked ? .5 : 1, cursor: contact.sent_at || cooldownActive || dailyBlocked ? 'not-allowed' : 'pointer' }}>{updatingId === contact.id ? 'Sending…' : contact.sent_at ? 'Sent' : dailyBlocked ? 'Limit Reached' : cooldownActive ? 'Paused' : 'Send Message'}</button> : '—'}</td></tr>)}</tbody></table></div>{totalPages > 1 && <div style={{ padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><span style={{ color: '#666', fontSize: '13px' }}>Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}</span><div style={{ display: 'flex', gap: '8px' }}><button onClick={() => setPage(value => Math.max(1, value - 1))} disabled={page === 1} style={smallButtonStyle}>Previous</button><button onClick={() => setPage(value => Math.min(totalPages, value + 1))} disabled={page === totalPages} style={smallButtonStyle}>Next</button></div></div>}</>}
                </section>
            </main>
        </div>
    )
}

const cardStyle: React.CSSProperties = { background: '#FFF', borderRadius: '16px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', overflow: 'hidden' }
const fieldLabel: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: '5px', color: '#444', fontSize: '12px', fontWeight: 600 }
const inputStyle: React.CSSProperties = { minWidth: '130px', padding: '8px 10px', border: '1px solid #DDD', borderRadius: '8px', fontSize: '13px', color: '#1A1A1A', background: '#FFF' }
const buttonStyle: React.CSSProperties = { border: 'none', color: '#FFF', borderRadius: '8px', padding: '10px 16px', fontSize: '13px', fontWeight: 600, display: 'inline-flex', alignItems: 'center' }
const smallButtonStyle: React.CSSProperties = { border: 'none', background: '#0074BD', color: '#FFF', borderRadius: '7px', padding: '7px 10px', fontSize: '12px', fontWeight: 600 }
const headerCell: React.CSSProperties = { padding: '13px 20px', fontWeight: 600 }
const cell: React.CSSProperties = { padding: '14px 20px', fontSize: '14px', color: '#1A1A1A' }
