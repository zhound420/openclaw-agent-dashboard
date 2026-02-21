import { NextResponse } from 'next/server'
import { execSync } from 'child_process'
import os from 'os'

// Simple in-process cache: 3 second TTL
let cache: { data: object; ts: number } | null = null
const CACHE_TTL = 3_000

function runCLI(cmd: string): object | null {
  try {
    const out = execSync(cmd, { timeout: 8000, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] })
    // Strip any non-JSON preamble (openclaw may print doctor warnings before JSON)
    const jsonStart = out.indexOf('{')
    if (jsonStart === -1) return null
    return JSON.parse(out.slice(jsonStart))
  } catch {
    return null
  }
}

// Parse channelSummary strings like:
//   "Telegram: configured"
//   "  - default (token:config)"
//   "Discord: configured"
//   "iMessage: configured"
function parseChannelSummary(channelSummary: string[]): string[] {
  return channelSummary
    .filter(line => /^\w[\w\s]*?:\s+configured/.test(line.trim()))
    .map(line => line.split(':')[0].trim().toLowerCase())
}

function buildStatus(statusData: Record<string, unknown> | null) {
  const gateway = (statusData?.gateway ?? {}) as Record<string, unknown>
  const gatewaySelf = (gateway.self ?? {}) as Record<string, unknown>
  const update = (statusData?.update ?? {}) as Record<string, unknown>
  const registry = (update.registry ?? {}) as Record<string, unknown>
  const osData = (statusData?.os ?? {}) as Record<string, unknown>
  const memData = (statusData?.memory ?? {}) as Record<string, unknown>
  const gatewayService = (statusData?.gatewayService ?? {}) as Record<string, unknown>
  const sessions = (statusData?.sessions ?? {}) as Record<string, unknown>
  const heartbeat = (statusData?.heartbeat ?? {}) as Record<string, unknown>
  const heartbeatAgents = (heartbeat.agents ?? []) as Array<{ agentId: string; enabled: boolean; every: string }>
  const channelSummary = (statusData?.channelSummary ?? []) as string[]

  // Version: prefer gateway self version, fall back to registry latest
  const version = (gatewaySelf.version ?? registry.latestVersion ?? '—') as string

  // Gateway reachable directly from status
  const gatewayReachable = (gateway.reachable ?? false) as boolean

  // Active channels parsed from channelSummary strings
  const activeChannels = parseChannelSummary(channelSummary)

  // Health: healthy if gateway reachable AND channels configured, degraded if reachable but no channels
  let health: 'healthy' | 'degraded' | 'unhealthy'
  if (!gatewayReachable) {
    health = 'unhealthy'
  } else if (activeChannels.length > 0) {
    health = 'healthy'
  } else {
    health = 'degraded'
  }

  // Uptime: system uptime (host), not dashboard process uptime
  const uptimeSecs = Math.floor(os.uptime())

  // Memory: from OS
  const totalMem = os.totalmem()
  const freeMem = os.freemem()
  const usedMemMb = Math.round((totalMem - freeMem) / 1024 / 1024)

  // CPU: use os.loadavg 1-minute as % (rough proxy)
  const loadAvg1 = os.loadavg()[0]
  const cpuCount = os.cpus().length
  const cpuPercent = Math.min(Math.round((loadAvg1 / cpuCount) * 100), 100)

  // Last heartbeat: find the most recent session
  const recentSessions = (sessions.recent ?? []) as Array<{ key: string; updatedAt: number }>
  const lastUpdated = recentSessions[0]?.updatedAt
  const lastHeartbeat = lastUpdated ? new Date(lastUpdated).toISOString() : new Date().toISOString()

  // Heartbeat schedule from status
  const mainAgent = heartbeatAgents.find(a => a.agentId === 'main')
  const heartbeatEvery = mainAgent?.every ?? '—'

  return {
    version,
    uptime: uptimeSecs,
    health,
    activeChannels,
    lastHeartbeat,
    memoryUsageMb: usedMemMb,
    totalMemMb: Math.round(totalMem / 1024 / 1024),
    cpuPercent,
    // Extra real fields for the system page
    memoryFiles: (memData.files ?? 0) as number,
    memoryChunks: (memData.chunks ?? 0) as number,
    memoryBackend: (memData.backend ?? 'builtin') as string,
    platform: (osData.label ?? os.platform()) as string,
    heartbeatEvery,
    gatewayVersion: (gatewaySelf.version ?? '—') as string,
    gatewayReachable,
  }
}

export async function GET() {
  const now = Date.now()
  if (cache && now - cache.ts < CACHE_TTL) {
    return NextResponse.json({ data: cache.data, timestamp: new Date().toISOString(), cached: true })
  }

  try {
    const statusData = runCLI('openclaw status --json') as Record<string, unknown> | null
    const data = buildStatus(statusData)
    cache = { data, ts: now }
    return NextResponse.json({ data, timestamp: new Date().toISOString() })
  } catch {
    // Return cached data if available, even if stale
    if (cache) {
      return NextResponse.json({ data: cache.data, timestamp: new Date().toISOString(), cached: true, stale: true })
    }
    return NextResponse.json({ error: 'Failed to fetch status' }, { status: 500 })
  }
}
