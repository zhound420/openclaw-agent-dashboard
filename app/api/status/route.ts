import { NextResponse } from 'next/server'
import { execSync } from 'child_process'
import os from 'os'

// Simple in-process cache: 30 second TTL
let cache: { data: object; ts: number } | null = null
const CACHE_TTL = 30_000

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

function deriveHealth(health: ReturnType<typeof parseHealth>): 'healthy' | 'degraded' | 'unhealthy' {
  if (health.allProbesOk) return 'healthy'
  if (health.anyProbeOk) return 'degraded'
  return 'unhealthy'
}

function parseHealth(healthData: Record<string, unknown> | null) {
  if (!healthData) return { allProbesOk: false, anyProbeOk: false, channels: [] as string[] }
  const channels = (healthData.channels ?? {}) as Record<string, { probe?: { ok?: boolean }; configured?: boolean }>
  const channelNames = Object.keys(channels)
  const probeResults = channelNames.map(name => channels[name]?.probe?.ok === true)
  const allProbesOk = probeResults.length > 0 && probeResults.every(Boolean)
  const anyProbeOk = probeResults.some(Boolean)
  const configuredAndProbeOk = channelNames.filter(name => channels[name]?.configured && channels[name]?.probe?.ok)
  return { allProbesOk, anyProbeOk, channels: configuredAndProbeOk }
}

function buildStatus(statusData: Record<string, unknown> | null, healthData: Record<string, unknown> | null) {
  const health = parseHealth(healthData)
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

  // Determine version: use registry latest, fall back to gateway self version
  const version = (registry.latestVersion ?? gatewaySelf.version ?? '—') as string

  // Uptime: parse from gatewayService runtime text or fall back to process uptime
  let uptimeSecs = Math.floor(process.uptime())
  const runtimeText = (gatewayService.runtimeShort ?? '') as string
  const pidMatch = runtimeText.match(/pid\s+(\d+)/)
  if (!pidMatch) {
    // Can't parse pid start — use process uptime as proxy
    uptimeSecs = Math.floor(process.uptime())
  }

  // Memory: from OS
  const totalMem = os.totalmem()
  const freeMem = os.freemem()
  const usedMemMb = Math.round((totalMem - freeMem) / 1024 / 1024)

  // CPU: use os.loadavg 1-minute as % (rough proxy)
  const loadAvg1 = os.loadavg()[0]
  const cpuCount = os.cpus().length
  const cpuPercent = Math.min(Math.round((loadAvg1 / cpuCount) * 100), 100)

  // Active channels from health probe
  const activeChannels = health.channels

  // Last heartbeat: find the most recent heartbeat session
  const recentSessions = (sessions.recent ?? []) as Array<{ key: string; updatedAt: number }>
  const lastUpdated = recentSessions[0]?.updatedAt
  const lastHeartbeat = lastUpdated ? new Date(lastUpdated).toISOString() : new Date().toISOString()

  // Heartbeat schedule from status
  const mainAgent = heartbeatAgents.find(a => a.agentId === 'main')
  const heartbeatEvery = mainAgent?.every ?? '—'

  return {
    version,
    uptime: uptimeSecs,
    health: deriveHealth(health),
    activeChannels,
    lastHeartbeat,
    memoryUsageMb: usedMemMb,
    cpuPercent,
    // Extra real fields for the system page
    memoryFiles: (memData.files ?? 0) as number,
    memoryChunks: (memData.chunks ?? 0) as number,
    memoryBackend: (memData.backend ?? 'builtin') as string,
    platform: (osData.label ?? os.platform()) as string,
    heartbeatEvery,
    gatewayVersion: (gatewaySelf.version ?? '—') as string,
    gatewayReachable: (gateway.reachable ?? false) as boolean,
  }
}

export async function GET() {
  const now = Date.now()
  if (cache && now - cache.ts < CACHE_TTL) {
    return NextResponse.json({ data: cache.data, timestamp: new Date().toISOString(), cached: true })
  }

  try {
    const [statusData, healthData] = await Promise.all([
      Promise.resolve(runCLI('openclaw status --json')),
      Promise.resolve(runCLI('openclaw health --json')),
    ])

    const data = buildStatus(
      statusData as Record<string, unknown> | null,
      healthData as Record<string, unknown> | null
    )
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
