import { NextResponse } from 'next/server'
import { execSync } from 'child_process'
import os from 'os'

let cache: { data: object; ts: number } | null = null
const CACHE_TTL = 3_000

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
  cronData: Record<string, unknown> | null,
  sessionsData: Record<string, unknown> | null
) {
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
      totalRuns: 0,
      successRate: state.consecutiveErrors === 0 ? 100 : Math.max(0, 100 - (state.consecutiveErrors ?? 0) * 20),
      enabled: job.enabled,
      consecutiveErrors: state.consecutiveErrors ?? 0,
    }
  })

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

  const gateway = (statusData?.gateway ?? {}) as Record<string, unknown>
  const gatewaySelf = (gateway.self ?? {}) as Record<string, string>
  const update = (statusData?.update ?? {}) as Record<string, unknown>
  const registry = (update.registry ?? {}) as Record<string, string>
  const memData = (statusData?.memory ?? {}) as Record<string, unknown>
  const agentsData = (statusData?.agents ?? {}) as Record<string, unknown>
  const agentsList = (agentsData.agents ?? []) as Array<{ id: string }>

  const config = {
    agentName: gatewaySelf.host ?? process.env.NEXT_PUBLIC_AGENT_NAME ?? 'Agent',
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

  const sessionsList = (sessionsData?.sessions ?? []) as Array<{
    model?: string
    inputTokens?: number
    outputTokens?: number
    totalTokens?: number
  }>

  const byModelMap = new Map<string, { model: string; input: number; output: number; total: number; sessions: number }>()
  let totalInput = 0
  let totalOutput = 0

  for (const s of sessionsList) {
    const model = s.model ?? 'unknown'
    const input = s.inputTokens ?? 0
    const output = s.outputTokens ?? 0
    const total = s.totalTokens ?? (input + output)

    totalInput += input
    totalOutput += output

    const prev = byModelMap.get(model) ?? { model, input: 0, output: 0, total: 0, sessions: 0 }
    prev.input += input
    prev.output += output
    prev.total += total
    prev.sessions += 1
    byModelMap.set(model, prev)
  }

  const byModel = [...byModelMap.values()].sort((a, b) => b.total - a.total)
  const tokenUsage = {
    byModel,
    totals: {
      input: totalInput,
      output: totalOutput,
      total: totalInput + totalOutput,
      sessions: sessionsList.length,
    },
  }

  const cpus = os.cpus()
  const systemInfo = {
    hostname: os.hostname(),
    platform: os.platform(),
    arch: os.arch(),
    cpuModel: cpus[0]?.model ?? 'unknown',
    cores: cpus.length,
    totalRamGb: +(os.totalmem() / 1024 / 1024 / 1024).toFixed(1),
    version: gatewaySelf.version ?? registry.latestVersion ?? '—',
    loadAvg: os.loadavg().map(v => +v.toFixed(2)),
    uptime: os.uptime(),
  }

  return { config, channels, cronJobs, tokenUsage, systemInfo }
}

export async function GET() {
  const now = Date.now()
  if (cache && now - cache.ts < CACHE_TTL) {
    return NextResponse.json({ data: cache.data, timestamp: new Date().toISOString(), cached: true })
  }

  try {
    const statusData = runCLI('openclaw status --json')
    const cronData = runCLI('openclaw cron list --json')
    const sessionsData = runCLI('openclaw sessions --json')

    const data = buildSystemData(statusData, cronData, sessionsData)
    cache = { data, ts: now }
    return NextResponse.json({ data, timestamp: new Date().toISOString() })
  } catch {
    if (cache) {
      return NextResponse.json({ data: cache.data, timestamp: new Date().toISOString(), cached: true, stale: true })
    }
    return NextResponse.json({ error: 'Failed to fetch system data' }, { status: 500 })
  }
}
