import { NextResponse } from 'next/server'
import { execSync } from 'child_process'

let cache: { data: object[]; ts: number } | null = null
const CACHE_TTL = 30_000

function runCLI(cmd: string): Record<string, unknown> | null {
  try {
    const out = execSync(cmd, { timeout: 8000, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] })
    const jsonStart = out.indexOf('{')
    if (jsonStart === -1) return null
    return JSON.parse(out.slice(jsonStart))
  } catch {
    return null
  }
}

function buildChannels(healthData: Record<string, unknown> | null) {
  if (!healthData) return []

  const channels = (healthData.channels ?? {}) as Record<string, {
    configured?: boolean
    running?: boolean
    probe?: {
      ok?: boolean
      elapsedMs?: number
      error?: string | null
      bot?: { username?: string; id?: number | string }
    }
    lastProbeAt?: number | null
    lastStartAt?: number | null
    lastStopAt?: number | null
    lastError?: string | null
  }>
  const channelLabels = (healthData.channelLabels ?? {}) as Record<string, string>

  return Object.entries(channels).map(([id, ch]) => {
    const probeOk = ch.probe?.ok === true
    const configured = ch.configured ?? false
    const running = ch.running ?? false

    let status: 'connected' | 'disconnected' | 'error' | 'unknown'
    if (!configured) {
      status = 'unknown'
    } else if (ch.probe?.error) {
      status = 'error'
    } else if (probeOk) {
      status = 'connected'
    } else {
      status = 'disconnected'
    }

    const latency = ch.probe?.elapsedMs ?? null
    const lastProbe = ch.lastProbeAt ? new Date(ch.lastProbeAt).toISOString() : null

    const details: Record<string, unknown> = {
      configured,
      running,
      probeOk,
    }
    if (ch.probe?.bot?.username) {
      details.botUsername = ch.probe.bot.username
    }
    if (ch.lastError) {
      details.lastError = ch.lastError
    }

    return {
      id,
      name: channelLabels[id] ?? id,
      status,
      latency,
      lastProbe,
      configured,
      running,
      details,
    }
  })
}

export async function GET() {
  const now = Date.now()
  if (cache && now - cache.ts < CACHE_TTL) {
    return NextResponse.json({ data: cache.data, timestamp: new Date().toISOString(), cached: true })
  }

  try {
    const healthData = runCLI('openclaw health --json')
    const data = buildChannels(healthData)
    cache = { data, ts: now }
    return NextResponse.json({ data, timestamp: new Date().toISOString() })
  } catch {
    if (cache) {
      return NextResponse.json({ data: cache.data, timestamp: new Date().toISOString(), cached: true, stale: true })
    }
    return NextResponse.json({ data: [], timestamp: new Date().toISOString() })
  }
}
