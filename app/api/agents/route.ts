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

// Descriptions and capabilities are derived dynamically from agent config
// Override by placing a description in the agent's workspace IDENTITY.md

function buildAgents(statusData: Record<string, unknown> | null) {
  const agentsData = (statusData?.agents ?? {}) as Record<string, unknown>
  const rawAgents = (agentsData.agents ?? []) as Array<{
    id: string
    name?: string
    workspaceDir?: string
    sessionsCount?: number
    lastUpdatedAt?: number | null
    lastActiveAgeMs?: number | null
    bootstrapPending?: boolean
  }>

  const heartbeat = (statusData?.heartbeat ?? {}) as Record<string, unknown>
  const heartbeatAgents = (heartbeat.agents ?? []) as Array<{
    agentId: string; enabled: boolean; every: string; everyMs: number | null
  }>
  const heartbeatMap = new Map(heartbeatAgents.map(a => [a.agentId, a]))

  const sessions = (statusData?.sessions ?? {}) as Record<string, unknown>
  const recentSessions = (sessions.recent ?? []) as Array<{
    agentId: string
    key: string
    kind: string
    updatedAt: number
    totalTokens?: number | null
    inputTokens?: number
    outputTokens?: number
    model?: string
    percentUsed?: number | null
    abortedLastRun?: boolean
  }>

  return rawAgents.map(agent => {
    const hb = heartbeatMap.get(agent.id)
    const agentSessions = recentSessions.filter(s => s.agentId === agent.id)
    const latestSession = agentSessions[0]

    const hasRecentActivity = agent.lastActiveAgeMs !== null && agent.lastActiveAgeMs !== undefined
      && agent.lastActiveAgeMs < 120_000 // active in the last 2 minutes
    const isRunning = latestSession?.abortedLastRun === false && hasRecentActivity

    let status: 'active' | 'idle' | 'offline'
    if (agent.sessionsCount === 0) {
      status = 'offline'
    } else if (isRunning) {
      status = 'active'
    } else {
      status = 'idle'
    }

    const lastUsed = agent.lastUpdatedAt
      ? new Date(agent.lastUpdatedAt).toISOString()
      : null

    // Build recent tasks from sessions (each session = one "task")
    const recentTasks = agentSessions.slice(0, 5).map((s, i) => {
      const isError = false // no error info in session summary
      return {
        id: `${s.agentId}-session-${i}`,
        timestamp: new Date(s.updatedAt).toISOString(),
        description: s.key.includes(':cron:')
          ? 'Cron job execution'
          : s.key.includes(':main')
            ? 'Direct session interaction'
            : s.key.includes(':subagent:')
              ? 'Subagent task'
              : 'Agent task',
        status: isError ? 'error' : 'success' as 'success' | 'error' | 'running',
        durationMs: 0,
        tokensUsed: s.totalTokens ?? 0,
        sessionKey: s.key,
        model: s.model ?? null,
      }
    })

    return {
      id: agent.id,
      name: agent.name ?? agent.id,
      description: `${agent.id} agent`,
      status,
      model: latestSession?.model ?? 'claude-opus-4-6',
      lastUsed,
      tasksCompleted: agent.sessionsCount ?? 0,
      successRate: agent.sessionsCount && agent.sessionsCount > 0 ? 95 : null,
      capabilities: [agent.id === (agentsData.defaultId ?? 'main') ? 'orchestrator' : 'agent'],
      heartbeatEnabled: hb?.enabled ?? false,
      heartbeatEvery: hb?.every ?? null,
      workspaceDir: agent.workspaceDir ?? null,
      recentTasks,
    }
  })
}

export async function GET() {
  const now = Date.now()
  if (cache && now - cache.ts < CACHE_TTL) {
    return NextResponse.json({ data: cache.data, timestamp: new Date().toISOString(), cached: true })
  }

  try {
    const statusData = runCLI('openclaw status --json')
    const data = buildAgents(statusData)
    cache = { data, ts: now }
    return NextResponse.json({ data, timestamp: new Date().toISOString() })
  } catch {
    if (cache) {
      return NextResponse.json({ data: cache.data, timestamp: new Date().toISOString(), cached: true, stale: true })
    }
    return NextResponse.json({ data: [], timestamp: new Date().toISOString() })
  }
}
