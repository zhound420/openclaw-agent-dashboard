import { NextResponse } from 'next/server'
import { execSync } from 'child_process'

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

function redact(value: unknown): unknown {
  if (typeof value === 'string') {
    // Redact anything that looks like a token/secret/key
    if (/token|secret|key|password|auth|bearer|credential/i.test(value) && value.length > 8) {
      return '[REDACTED]'
    }
    // Redact long hex strings (likely tokens)
    if (/^[0-9a-f]{20,}$/i.test(value)) {
      return '[REDACTED]'
    }
    return value
  }
  if (Array.isArray(value)) {
    return value.map(redact)
  }
  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      // Redact values for sensitive keys
      if (/token|secret|key|password|auth|bearer|credential|apikey/i.test(k)) {
        result[k] = '[REDACTED]'
      } else {
        result[k] = redact(v)
      }
    }
    return result
  }
  return value
}

function buildConfig(statusData: Record<string, unknown> | null) {
  const gateway = (statusData?.gateway ?? {}) as Record<string, unknown>
  const gatewaySelf = (gateway.self ?? {}) as Record<string, string>
  const update = (statusData?.update ?? {}) as Record<string, unknown>
  const registry = (update.registry ?? {}) as Record<string, string>
  const memData = (statusData?.memory ?? {}) as Record<string, unknown>
  const osData = (statusData?.os ?? {}) as Record<string, unknown>
  const agentsData = (statusData?.agents ?? {}) as Record<string, unknown>
  const agentsList = (agentsData.agents ?? []) as Array<{ id: string; workspaceDir?: string }>
  const heartbeat = (statusData?.heartbeat ?? {}) as Record<string, unknown>
  const heartbeatAgents = (heartbeat.agents ?? []) as Array<{ agentId: string; enabled: boolean; every: string }>
  const sessions = (statusData?.sessions ?? {}) as Record<string, unknown>
  const sessionsDefaults = (sessions.defaults ?? {}) as Record<string, unknown>
  const securityAudit = (statusData?.securityAudit ?? {}) as Record<string, unknown>

  return {
    gateway: {
      host: gatewaySelf.host ?? '—',
      version: gatewaySelf.version ?? '—',
      latestVersion: registry.latestVersion ?? '—',
      platform: gatewaySelf.platform ?? osData.label ?? '—',
      mode: gateway.mode ?? '—',
      reachable: gateway.reachable ?? false,
      connectLatencyMs: gateway.connectLatencyMs ?? null,
    },
    memory: {
      backend: memData.backend ?? '—',
      provider: memData.provider ?? '—',
      files: memData.files ?? 0,
      chunks: memData.chunks ?? 0,
      workspaceDir: memData.workspaceDir ?? '—',
      searchMode: (memData.custom as Record<string, unknown> | undefined)?.searchMode ?? '—',
      ftsEnabled: (memData.fts as Record<string, boolean> | undefined)?.available ?? false,
      vectorEnabled: (memData.vector as Record<string, boolean> | undefined)?.available ?? false,
    },
    sessions: {
      defaultModel: sessionsDefaults.model ?? '—',
      contextTokens: sessionsDefaults.contextTokens ?? 0,
      totalSessions: agentsData.totalSessions ?? 0,
    },
    agents: agentsList.map(a => ({
      id: a.id,
      workspaceDir: a.workspaceDir ?? '—',
      heartbeat: heartbeatAgents.find(h => h.agentId === a.id) ?? null,
    })),
    security: redact(securityAudit),
    update: {
      installKind: update.installKind ?? '—',
      packageManager: update.packageManager ?? '—',
      registryLatest: registry.latestVersion ?? '—',
    },
  }
}

export async function GET() {
  const now = Date.now()
  if (cache && now - cache.ts < CACHE_TTL) {
    return NextResponse.json({ data: cache.data, timestamp: new Date().toISOString(), cached: true })
  }

  try {
    const statusData = runCLI('openclaw status --json')
    const data = buildConfig(statusData)
    cache = { data, ts: now }
    return NextResponse.json({ data, timestamp: new Date().toISOString() })
  } catch {
    if (cache) {
      return NextResponse.json({ data: cache.data, timestamp: new Date().toISOString(), cached: true, stale: true })
    }
    return NextResponse.json({ error: 'Failed to fetch config' }, { status: 500 })
  }
}
