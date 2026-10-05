import { NextRequest, NextResponse } from 'next/server'
import { sendBroadcastDailyReport } from '@/lib/broadcastDailyReport'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    return NextResponse.json(await sendBroadcastDailyReport())
  } catch (error) {
    console.error('Broadcast daily report failed', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 })
  }
}
