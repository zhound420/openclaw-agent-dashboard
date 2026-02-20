import { NextResponse } from 'next/server'
import { execSync } from 'child_process'

let cache: { data: object; ts: number } | null = null
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

function buildSystemData(
  statusData: Record<string, unknown> | null,
  cronData: Record<string, unknown> | null
) {
  // --- Channels from channelSummary ---
  // Format: "Telegram: configured", "  - default (token:config)", "Discord: configured", ...
  const channelSummary = (statusData?.channelSummary ?? []) as string[]
  const channels: Array<{
    channel: string
    channelId: string
    status: string
    lastPing: string | null
    latencyMs: number
    messagesPerHour: number
    configured: boolean
    running: boolean
    probeOk: boolean
  }> = []

  for (const line of channelSummary) {
    const trimmed = line.trim()
    const match = trimmed.match(/^(\w[\w\s]*?):\s+configured/)
    if (match) {
      const name = match[1]
      channels.push({
        channel: name,
        channelId: name.toLowerCase(),
        status: 'connected',
        lastPing: null,
        latencyMs: 0,
        messagesPerHour: 0,
        configured: true,
        running: true,
        probeOk: true,
      })
    }
  }

  // --- Cron Jobs ---
  const cronJobs = ((cronData?.jobs ?? []) as Array<{
    id: string
    name: string
    enabled: boolean
    schedule?: { kind: string; expr: string; tz?: string }
    state?: {
      lastRunAtMs?: number | null
      nextRunAtMs?: number | null
      lastStatus?: string
      lastDurationMs?: number
      consecutiveErrors?: number
    }
    payload?: { message?: string }
  }>).map(job => {
    const state = job.state ?? {}
    const scheduleExpr = job.schedule?.kind === 'cron'
      ? job.schedule.expr
      : job.schedule?.kind ?? 'manual'
    const lastStatus = state.lastStatus === 'ok' ? 'success' : (state.lastStatus ?? 'unknown')
    const lastRun = state.lastRunAtMs ? new Date(state.lastRunAtMs).toISOString() : null
    const nextRun = state.nextRunAtMs ? new Date(state.nextRunAtMs).toISOString() : null
    const description = job.payload?.message ?? ''

    return {
      id: job.id,
      name: job.name,
      schedule: scheduleExpr,
      description: description.slice(0, 120),
      lastRun,
      nextRun,
      lastStatus,
      totalRuns: 0, // not available from basic CLI output
      successRate: state.consecutiveErrors === 0 ? 100 : Math.max(0, 100 - (state.consecutiveErrors ?? 0) * 20),
      enabled: job.enabled,
      consecutiveErrors: state.consecutiveErrors ?? 0,
    }
  })

  // --- Heartbeat as a synthetic "cron job" ---
  const heartbeat = (statusData?.heartbeat ?? {}) as Record<string, unknown>
  const heartbeatAgents = (heartbeat.agents ?? []) as Array<{
    agentId: string; enabled: boolean; every: string; everyMs: number | null
  }>

  heartbeatAgents.filter(a => a.enabled).forEach(a => {
    if (!cronJobs.find(j => j.id === `heartbeat-${a.agentId}`)) {
      cronJobs.push({
        id: `heartbeat-${a.agentId}`,
        name: `Heartbeat (${a.agentId})`,
        schedule: `every ${a.every}`,
        description: 'Periodic health check and context update',
        lastRun: null,
        nextRun: null,
        lastStatus: 'unknown',
        totalRuns: 0,
        successRate: 100,
        enabled: true,
        consecutiveErrors: 0,
      })
    }
  })

  // --- Config (non-sensitive overview) ---
  const gateway = (statusData?.gateway ?? {}) as Record<string, unknown>
  const gatewaySelf = (gateway.self ?? {}) as Record<string, string>
  const update = (statusData?.update ?? {}) as Record<string, unknown>
  const registry = (update.registry ?? {}) as Record<string, string>
  const memData = (statusData?.memory ?? {}) as Record<string, unknown>
  const agentsData = (statusData?.agents ?? {}) as Record<string, unknown>
  const agentsList = (agentsData.agents ?? []) as Array<{ id: string }>
  const sessions = (statusData?.sessions ?? {}) as Record<string, unknown>
  const sessionsDefaults = (sessions.defaults ?? {}) as Record<string, unknown>

  const config = {
    agentName: gatewaySelf.host ?? 'Mordecai',
    version: registry.latestVersion ?? gatewaySelf.version ?? '—',
    environment: gateway.mode ?? 'local',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    logLevel: 'info',
    maxConcurrentTasks: agentsList.length,
    features: {
      heartbeat: heartbeatAgents.some(a => a.enabled),
      memorySearch: (memData.fts as Record<string, boolean> | undefined)?.available ?? false,
      vectorMemory: (memData.vector as Record<string, boolean> | undefined)?.available ?? false,
      cronJobs: cronData !== null,
      multiAgent: agentsList.length > 1,
      gateway: (gateway.reachable ?? false) as boolean,
    },
  }

  // Token usage: not available from CLI, return empty array
  const tokenUsage: Array<{ date: string; input: number; output: number; total: number; cost: number }> = []

  return { config, channels, cronJobs, tokenUsage }
}

export async function GET() {
  const now = Date.now()
  if (cache && now - cache.ts < CACHE_TTL) {
    return NextResponse.json({ data: cache.data, timestamp: new Date().toISOString(), cached: true })
  }

  try {
    const [statusData, cronData] = await Promise.all([
      Promise.resolve(runCLI('openclaw status --json')),
      Promise.resolve(runCLI('openclaw cron list --json')),
    ])

    const data = buildSystemData(statusData, cronData)
    cache = { data, ts: now }
    return NextResponse.json({ data, timestamp: new Date().toISOString() })
  } catch {
    if (cache) {
      return NextResponse.json({ data: cache.data, timestamp: new Date().toISOString(), cached: true, stale: true })
    }
    return NextResponse.json({ error: 'Failed to fetch system data' }, { status: 500 })
  }
}
