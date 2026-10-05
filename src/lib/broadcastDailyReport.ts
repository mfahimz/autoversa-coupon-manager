import { createClient } from '@supabase/supabase-js'
import { Database } from '@/lib/database.types'

const REPORT_RECIPIENT = process.env.BROADCAST_REPORT_TO_EMAIL || 'binfah222@gmail.com'

function uaeDateKey(date = new Date()) {
  return date.toLocaleDateString('en-CA', { timeZone: 'Asia/Dubai' })
}

function uaeDayBounds(dateKey: string) {
  const start = new Date(`${dateKey}T00:00:00+04:00`)
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000)
  return { start: start.toISOString(), end: end.toISOString() }
}

function formatReportDate(dateKey: string) {
  return new Date(`${dateKey}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

function metric(label: string, value: number, color: string) {
  return `<td style="width:25%;padding:12px 8px;text-align:center;background:#f8fafc;border:1px solid #e2e8f0">
    <div style="font-size:22px;font-weight:700;color:${color}">${value.toLocaleString()}</div>
    <div style="margin-top:4px;font-size:12px;color:#64748b">${label}</div>
  </td>`
}

type CountQuery = PromiseLike<{
  count: number | null
  error: { message: string } | null
}>

async function exactCount(query: CountQuery) {
  const { count, error } = await query
  if (error) throw new Error(error.message)
  return count ?? 0
}

export async function sendBroadcastDailyReport() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const resendKey = process.env.RESEND_API_KEY
  const from = process.env.BROADCAST_REPORT_FROM_EMAIL

  if (!supabaseUrl || !serviceKey) throw new Error('Supabase server credentials are not configured')
  if (!resendKey) throw new Error('RESEND_API_KEY is not configured')
  if (!from) throw new Error('BROADCAST_REPORT_FROM_EMAIL is not configured')

  const db = createClient<Database>(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const dateKey = uaeDateKey()
  const { start, end } = uaeDayBounds(dateKey)

  const [total, pending, totalSent, sentToday, delivered, replied, failed, optedOut, wavesResult, stateResult] = await Promise.all([
    exactCount(db.from('broadcast_contacts').select('id', { count: 'exact', head: true })),
    exactCount(db.from('broadcast_contacts').select('id', { count: 'exact', head: true }).eq('delivery_status', 'pending')),
    exactCount(db.from('broadcast_contacts').select('id', { count: 'exact', head: true }).not('sent_at', 'is', null)),
    exactCount(db.from('broadcast_contacts').select('id', { count: 'exact', head: true }).gte('sent_at', start).lt('sent_at', end)),
    exactCount(db.from('broadcast_contacts').select('id', { count: 'exact', head: true }).eq('delivery_status', 'delivered').gte('status_updated_at', start).lt('status_updated_at', end)),
    exactCount(db.from('broadcast_contacts').select('id', { count: 'exact', head: true }).eq('delivery_status', 'replied').gte('status_updated_at', start).lt('status_updated_at', end)),
    exactCount(db.from('broadcast_contacts').select('id', { count: 'exact', head: true }).eq('delivery_status', 'failed').gte('status_updated_at', start).lt('status_updated_at', end)),
    exactCount(db.from('broadcast_contacts').select('id', { count: 'exact', head: true }).eq('delivery_status', 'opted_out').gte('status_updated_at', start).lt('status_updated_at', end)),
    db.from('broadcast_wave_logs').select('messages_sent').gte('completed_at', start).lt('completed_at', end),
    db.from('broadcast_send_state').select('cooldown_until').eq('id', 1).single(),
  ])

  if (wavesResult.error) throw new Error(wavesResult.error.message)
  if (stateResult.error) throw new Error(stateResult.error.message)

  const batches = wavesResult.data?.length ?? 0
  const batchMessages = (wavesResult.data ?? []).reduce((sum, wave) => sum + wave.messages_sent, 0)
  const cooldownUntil = stateResult.data?.cooldown_until
  const paused = !!cooldownUntil && new Date(cooldownUntil).getTime() > Date.now()
  const completion = total ? Math.round((totalSent / total) * 100) : 0
  const reportDate = formatReportDate(dateKey)
  const subject = `Broadcast Daily Report - ${reportDate}`

  const html = `<!doctype html>
  <html><body style="margin:0;background:#f1f5f9;font-family:Arial,sans-serif;color:#0f172a">
    <div style="max-width:680px;margin:0 auto;padding:24px">
      <div style="background:#162860;color:#fff;padding:22px 24px;border-radius:12px 12px 0 0">
        <h1 style="margin:0;font-size:21px">Broadcast Daily Report</h1>
        <p style="margin:6px 0 0;color:#dbeafe;font-size:13px">${reportDate} · UAE</p>
      </div>
      <div style="background:#fff;padding:24px;border-radius:0 0 12px 12px">
        <h2 style="margin:0 0 12px;font-size:16px">Today</h2>
        <table role="presentation" style="width:100%;border-collapse:separate;border-spacing:6px"><tr>
          ${metric('Messages sent', sentToday, '#0074bd')}
          ${metric('Batches', batches, '#7c3aed')}
          ${metric('Delivered', delivered, '#15803d')}
          ${metric('Replies', replied, '#047857')}
        </tr></table>
        <p style="margin:8px 0 22px;font-size:12px;color:#64748b">Completed batch records account for ${batchMessages.toLocaleString()} messages. Outcomes recorded today: ${failed} not delivered and ${optedOut} opted out.</p>

        <h2 style="margin:0 0 12px;font-size:16px">Queue progress</h2>
        <div style="height:10px;background:#e2e8f0;border-radius:999px;overflow:hidden"><div style="width:${completion}%;height:100%;background:#16a34a"></div></div>
        <p style="margin:8px 0 20px;font-size:13px;color:#475569"><strong>${totalSent.toLocaleString()}</strong> of ${total.toLocaleString()} contacts sent (${completion}%). <strong>${pending.toLocaleString()}</strong> remain.</p>

        <div style="padding:12px 14px;border-radius:8px;background:${paused ? '#fff7ed' : '#f0fdf4'};color:${paused ? '#9a3412' : '#166534'};font-size:13px;font-weight:600">
          ${paused ? `Sending is paused until ${new Date(cooldownUntil!).toLocaleString('en-GB', { timeZone: 'Asia/Dubai', hour: '2-digit', minute: '2-digit' })}.` : 'Sending is ready.'}
        </div>
      </div>
      <p style="text-align:center;color:#94a3b8;font-size:11px">AutoVersa Broadcast Outreach</p>
    </div>
  </body></html>`

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendKey}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': `broadcast-daily-report/${dateKey}`,
    },
    body: JSON.stringify({ from, to: [REPORT_RECIPIENT], subject, html }),
  })

  const responseBody = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(`Email delivery failed (${response.status}): ${JSON.stringify(responseBody)}`)
  }

  return {
    success: true,
    date: dateKey,
    recipient: REPORT_RECIPIENT,
    emailId: responseBody?.id ?? null,
    summary: { sentToday, batches, delivered, replied, failed, optedOut, pending, totalSent, total },
  }
}
