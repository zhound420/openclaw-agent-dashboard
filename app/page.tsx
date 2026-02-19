import { execSync } from 'child_process'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import os from 'os'
import type { ActivityEntry } from '@/types'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ActivityTypeBadge } from '@/components/activity-type-badge'
import { StatusBadge } from '@/components/status-badge'
import {
  Activity,
  Zap,
  FileText,
  CheckCircle,
  Bot,
  Timer,
  Cpu,
  MemoryStick,
  AlertTriangle,
  Brain,
  Terminal,
  ArrowRight,
  TrendingUp,
} from 'lucide-react'
import { formatDistanceToNow, format } from 'date-fns'
import { toZonedTime } from 'date-fns-tz'

const TZ = 'America/Los_Angeles'
function toPST(date: Date) { return toZonedTime(date, TZ) }
import Link from 'next/link'

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

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (d > 0) return `${d}d ${h}h ${m}m`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

function formatTokens(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`
  return String(n)
}

const typeColors: Record<string, string> = {
  message: 'text-blue-400',
  task: 'text-purple-400',
  cron: 'text-amber-400',
  heartbeat: 'text-pink-400',
  memory: 'text-teal-400',
  tool: 'text-orange-400',
  error: 'text-red-400',
}

const typePrefix: Record<string, string> = {
  message: '[MSG]',
  task: '[TSK]',
  cron: '[CRN]',
  heartbeat: '[HBT]',
  memory: '[MEM]',
  tool: '[TUL]',
  error: '[ERR]',
}

export default function HomePage() {
  // Fetch real data from CLI
  const statusData = runCLI('openclaw status --json')
  const healthData = runCLI('openclaw health --json')

  // Derive system status from CLI data
  const gateway = (statusData?.gateway ?? {}) as Record<string, unknown>
  const gatewaySelf = (gateway.self ?? {}) as Record<string, string>
  const update = (statusData?.update ?? {}) as Record<string, unknown>
  const registry = (update.registry ?? {}) as Record<string, string>

  const version = registry.latestVersion ?? gatewaySelf.version ?? '—'
  const uptimeSecs = Math.floor(process.uptime())

  // Memory from OS
  const totalMem = os.totalmem()
  const freeMem = os.freemem()
  const usedMemMb = Math.round((totalMem - freeMem) / 1024 / 1024)

  // CPU
  const loadAvg1 = os.loadavg()[0]
  const cpuCount = os.cpus().length
  const cpuPercent = Math.min(Math.round((loadAvg1 / cpuCount) * 100), 100)

  // Health from channel probes
  const healthChannels = (healthData?.channels ?? {}) as Record<string, { probe?: { ok?: boolean }; configured?: boolean }>
  const channelNames = Object.keys(healthChannels)
  const probeResults = channelNames.map(name => healthChannels[name]?.probe?.ok === true)
  const allProbesOk = probeResults.length > 0 && probeResults.every(Boolean)
  const anyProbeOk = probeResults.some(Boolean)
  const health = allProbesOk ? 'healthy' : anyProbeOk ? 'degraded' : ('error' as const)
  const activeChannels = channelNames.filter(name => healthChannels[name]?.configured && healthChannels[name]?.probe?.ok)
  const channelLabels = (healthData?.channelLabels ?? {}) as Record<string, string>

  // Last heartbeat from most recent session
  const sessions = (statusData?.sessions ?? {}) as Record<string, unknown>
  const recentSessions = (sessions.recent ?? []) as Array<{ updatedAt: number }>
  const lastUpdated = recentSessions[0]?.updatedAt
  const lastHeartbeat = lastUpdated ? new Date(lastUpdated).toISOString() : new Date().toISOString()

  // Agents
  const agentsData = (statusData?.agents ?? {}) as Record<string, unknown>
  const agentsList = (agentsData.agents ?? []) as Array<{ id: string; sessionsCount?: number }>
  const totalSessions = (agentsData.totalSessions ?? 0) as number

  // Heartbeat agents
  const heartbeat = (statusData?.heartbeat ?? {}) as Record<string, unknown>
  const heartbeatAgents = (heartbeat.agents ?? []) as Array<{ agentId: string; enabled: boolean }>
  const activeHeartbeats = heartbeatAgents.filter(a => a.enabled).length

  // Memory stats
  const memData = (statusData?.memory ?? {}) as Record<string, unknown>
  const memoryFiles = (memData.files ?? 0) as number

  // Tokens from recent session
  const latestSession = (recentSessions[0] ?? {}) as Record<string, unknown>
  const recentTokens = (latestSession.totalTokens ?? 0) as number

  const cpuPct = cpuPercent
  const memPct = Math.min(Math.round((usedMemMb / (Math.round(totalMem / 1024 / 1024))) * 100), 100)

  // Activity from jsonl file (still read from disk — no CLI command for this)
  const activityPath = join(process.cwd(), 'data', 'activity.jsonl')
  let recentActivity: ActivityEntry[] = []
  if (existsSync(activityPath)) {
    const raw = readFileSync(activityPath, 'utf-8')
    recentActivity = raw.split('\n').filter(Boolean).map(l => JSON.parse(l)).slice(0, 14)
  }

  // Channel type distribution from recent activity
  const typeCounts = recentActivity.reduce<Record<string, number>>((acc, e) => {
    acc[e.type] = (acc[e.type] ?? 0) + 1
    return acc
  }, {})

  const totalEntries = recentActivity.length || 1
  const typeDistribution = Object.entries(typeCounts).map(([type, count]) => ({
    type,
    count,
    pct: Math.round((count / totalEntries) * 100),
  })).sort((a, b) => b.count - a.count)

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Overview"
        description={`System dashboard · ${format(new Date(), 'EEE, MMM d yyyy')}`}
      />

      <div className="flex-1 p-5 space-y-5 overflow-auto">

        {/* Top stat cards — real data where available, zeros otherwise */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            {
              label: 'Active Channels',
              value: activeChannels.length,
              icon: Activity,
              color: activeChannels.length > 0 ? 'text-blue-400' : 'text-muted-foreground',
              glow: 'oklch(0.60 0.16 220)',
              bg: 'oklch(0.60 0.16 220 / 0.08)',
              trend: activeChannels.map(c => channelLabels[c] ?? c).join(', ') || 'none configured',
            },
            {
              label: 'Memory Files',
              value: memoryFiles,
              icon: CheckCircle,
              color: 'text-green-400',
              glow: 'oklch(0.75 0.18 145)',
              bg: 'oklch(0.75 0.18 145 / 0.08)',
              trend: 'in memory store',
            },
            {
              label: 'Total Sessions',
              value: totalSessions,
              icon: FileText,
              color: 'text-amber-400',
              glow: 'oklch(0.72 0.16 60)',
              bg: 'oklch(0.72 0.16 60 / 0.08)',
              trend: `across ${agentsList.length} agents`,
            },
            {
              label: 'Errors',
              value: 0,
              icon: AlertTriangle,
              color: 'text-muted-foreground',
              glow: 'oklch(0.65 0.22 25)',
              bg: 'transparent',
              trend: 'all clear',
            },
          ].map(({ label, value, icon: Icon, color, glow, bg, trend }) => (
            <div
              key={label}
              className="rounded-lg p-4 border border-border/60 relative overflow-hidden transition-all duration-200 hover:border-border bg-card"
            >
              <div
                className="absolute inset-0 opacity-100 rounded-lg"
                style={{ background: bg }}
              />
              <div className="relative">
                <div className="flex items-start justify-between mb-3">
                  <div
                    className="w-8 h-8 rounded-md flex items-center justify-center"
                    style={{ background: bg, border: `1px solid ${glow}33` }}
                  >
                    <Icon className={`w-4 h-4 ${color}`} />
                  </div>
                  <TrendingUp className="w-3 h-3 text-muted-foreground/40" />
                </div>
                <div className={`text-2xl font-bold font-mono ${color}`}>{value}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
                <div className="text-[10px] text-muted-foreground/60 mt-1 truncate">{trend}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Middle row: System + Resources + Activity Mix */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* System status */}
          <Card className="border-border/60">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-2">
                <div
                  className="w-1.5 h-1.5 rounded-full pulse-dot"
                  style={{ background: 'oklch(0.75 0.18 145)', boxShadow: '0 0 6px oklch(0.75 0.18 145 / 0.8)' }}
                />
                System Status
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Health</span>
                <StatusBadge status={health} pulse={health === 'healthy'} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Uptime</span>
                <span className="text-xs text-foreground font-mono">{formatUptime(uptimeSecs)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Version</span>
                <span className="text-xs font-mono text-primary">v{version}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Last session</span>
                <span className="text-xs text-foreground font-mono">
                  {lastHeartbeat
                    ? formatDistanceToNow(new Date(lastHeartbeat), { addSuffix: true })
                    : '—'}
                </span>
              </div>
              <div className="pt-1.5 border-t border-border/50">
                <div className="flex flex-wrap gap-1">
                  {activeChannels.map(ch => (
                    <span
                      key={ch}
                      className="px-1.5 py-0.5 rounded text-[10px] border font-mono text-primary"
                      style={{
                        background: 'color-mix(in oklch, var(--primary) 8%, transparent)',
                        borderColor: 'color-mix(in oklch, var(--primary) 25%, transparent)',
                      }}
                    >
                      {channelLabels[ch] ?? ch}
                    </span>
                  ))}
                  {activeChannels.length === 0 && (
                    <span className="text-[10px] text-muted-foreground/50">no channels active</span>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Resources */}
          <Card className="border-border/60">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-2">
                <Cpu className="w-3 h-3" />
                Resources
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="flex justify-between mb-1.5">
                  <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <Cpu className="w-3 h-3" /> CPU load
                  </span>
                  <span className="text-xs font-mono" style={{ color: cpuPct > 80 ? 'oklch(0.65 0.22 25)' : cpuPct > 50 ? 'oklch(0.72 0.16 60)' : 'oklch(0.75 0.18 145)' }}>
                    {cpuPct}%
                  </span>
                </div>
                <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${cpuPct}%`,
                      background: cpuPct > 80 ? 'oklch(0.65 0.22 25)' : cpuPct > 50 ? 'oklch(0.72 0.16 60)' : 'oklch(0.70 0.20 295)',
                      boxShadow: `0 0 6px ${cpuPct > 80 ? 'oklch(0.65 0.22 25 / 0.5)' : 'oklch(0.70 0.20 295 / 0.4)'}`,
                    }}
                  />
                </div>
              </div>
              <div>
                <div className="flex justify-between mb-1.5">
                  <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <MemoryStick className="w-3 h-3" /> Memory
                  </span>
                  <span className="text-xs font-mono text-foreground">
                    {(usedMemMb / 1024).toFixed(1)}GB <span className="text-muted-foreground">/ {(totalMem / 1024 / 1024 / 1024).toFixed(0)}GB</span>
                  </span>
                </div>
                <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${memPct}%`,
                      background: 'linear-gradient(90deg, oklch(0.60 0.16 220), oklch(0.70 0.20 295))',
                      boxShadow: '0 0 6px oklch(0.60 0.16 220 / 0.4)',
                    }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 pt-1 border-t border-border/50">
                <div className="text-center">
                  <div className="text-base font-bold font-mono text-foreground">{agentsList.length}</div>
                  <div className="text-[10px] text-muted-foreground flex items-center gap-1 justify-center">
                    <Bot className="w-2.5 h-2.5" /> agents
                  </div>
                </div>
                <div className="text-center border-x border-border/50">
                  <div className="text-base font-bold font-mono text-foreground">{activeHeartbeats}</div>
                  <div className="text-[10px] text-muted-foreground flex items-center gap-1 justify-center">
                    <Timer className="w-2.5 h-2.5" /> heartbeats
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-base font-bold font-mono text-primary">
                    {formatTokens(recentTokens)}
                  </div>
                  <div className="text-[10px] text-muted-foreground flex items-center gap-1 justify-center">
                    <Zap className="w-2.5 h-2.5" /> tokens
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Type distribution / channel mix */}
          <Card className="border-border/60">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-2">
                <Activity className="w-3 h-3" />
                Activity Mix
              </CardTitle>
            </CardHeader>
            <CardContent>
              {typeDistribution.length > 0 ? (
                <div className="space-y-2">
                  {typeDistribution.slice(0, 5).map(({ type, count, pct }) => (
                    <div key={type} className="flex items-center gap-2">
                      <div className={`text-[10px] font-mono w-16 shrink-0 ${typeColors[type] ?? 'text-muted-foreground'}`}>
                        {typePrefix[type] ?? type}
                      </div>
                      <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${pct}%`,
                            background: type === 'message' ? 'oklch(0.60 0.16 220)'
                              : type === 'task' ? 'oklch(0.70 0.20 295)'
                              : type === 'cron' ? 'oklch(0.72 0.16 60)'
                              : type === 'heartbeat' ? 'oklch(0.72 0.18 340)'
                              : type === 'memory' ? 'oklch(0.68 0.18 180)'
                              : type === 'tool' ? 'oklch(0.70 0.18 50)'
                              : 'oklch(0.65 0.22 25)',
                          }}
                        />
                      </div>
                      <span className="text-[10px] text-muted-foreground font-mono w-8 text-right shrink-0">{count}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-2">
                  {/* Show channel probe status as activity mix when no activity log */}
                  {channelNames.slice(0, 5).map(name => {
                    const ch = healthChannels[name]
                    const probeOk = ch?.probe?.ok === true
                    return (
                      <div key={name} className="flex items-center gap-2">
                        <div className="text-[10px] font-mono w-16 shrink-0 text-muted-foreground">
                          {channelLabels[name] ?? name}
                        </div>
                        <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: probeOk ? '100%' : '10%',
                              background: probeOk ? 'oklch(0.68 0.18 145)' : 'oklch(0.45 0.03 265)',
                            }}
                          />
                        </div>
                        <span className="text-[10px] font-mono" style={{ color: probeOk ? 'oklch(0.68 0.18 145)' : 'oklch(0.55 0.10 265)' }}>
                          {probeOk ? 'ok' : 'off'}
                        </span>
                      </div>
                    )
                  })}
                  <div className="text-[10px] text-muted-foreground/50 mt-2">Channel probe status</div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Bottom: Terminal feed + Quick actions */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          {/* Terminal activity feed — 2/3 width */}
          <Card className="lg:col-span-2 border-border/60 overflow-hidden">
            <CardHeader className="pb-2 border-b border-border/50">
              <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-2">
                <Terminal className="w-3 h-3" />
                <span>Live Feed</span>
                <div
                  className="w-1.5 h-1.5 rounded-full ml-1 pulse-dot"
                  style={{ background: 'oklch(0.75 0.18 145)', boxShadow: '0 0 6px oklch(0.75 0.18 145 / 0.7)' }}
                />
                <span className="ml-auto text-muted-foreground/50">stdout</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div
                className="p-3 space-y-0.5"
                style={{ background: 'var(--surface-terminal)' }}
              >
                {recentActivity.length > 0 ? recentActivity.slice(0, 12).map((entry, i) => (
                  <div key={entry.id} className="terminal-line flex items-start gap-2 group">
                    <span className="text-muted-foreground/40 font-mono text-[10px] w-5 text-right shrink-0 mt-px select-none">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <span className="text-muted-foreground/50 font-mono text-[10px] shrink-0 mt-px">
                      {format(toPST(new Date(entry.timestamp)), 'HH:mm:ss')}
                    </span>
                    <span className={`font-mono text-[10px] font-semibold shrink-0 mt-px ${typeColors[entry.type] ?? 'text-muted-foreground'}`}>
                      {typePrefix[entry.type] ?? `[${entry.type.toUpperCase()}]`}
                    </span>
                    <span className={`font-mono text-[10px] flex-1 truncate leading-relaxed ${
                      entry.status === 'error' ? 'text-red-300' : 'text-foreground/80'
                    }`}>
                      {entry.summary}
                    </span>
                    {entry.agentId && (
                      <span className="font-mono text-[10px] shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-primary/70">
                        @{entry.agentId}
                      </span>
                    )}
                    <span className={`font-mono text-[10px] shrink-0 ${entry.status === 'error' ? 'text-red-400' : entry.status === 'success' ? 'text-green-400/60' : 'text-amber-400/60'}`}>
                      {entry.status === 'error' ? '✗' : entry.status === 'success' ? '✓' : '◎'}
                    </span>
                  </div>
                )) : (
                  // Show real gateway info when no activity log exists
                  [
                    { text: `gateway connected · ${gatewaySelf.host ?? 'Mordecai'} · v${version}`, color: 'text-green-400/70', prefix: '[SYS]', prefixColor: 'text-green-400' },
                    { text: `channels: ${activeChannels.map(c => channelLabels[c] ?? c).join(', ') || 'none active'}`, color: 'text-foreground/70', prefix: '[NET]', prefixColor: 'text-blue-400' },
                    { text: `memory: ${memoryFiles} files · ${(memData.chunks ?? 0)} chunks · backend: ${memData.backend ?? 'builtin'}`, color: 'text-foreground/70', prefix: '[MEM]', prefixColor: 'text-teal-400' },
                    { text: `agents: ${agentsList.map(a => a.id).join(', ')}`, color: 'text-foreground/70', prefix: '[AGT]', prefixColor: 'text-purple-400' },
                    { text: `sessions: ${totalSessions} total across all agents`, color: 'text-foreground/70', prefix: '[SES]', prefixColor: 'text-amber-400' },
                    { text: `system load: ${cpuPct}% cpu · ${(usedMemMb / 1024).toFixed(1)}GB ram`, color: 'text-foreground/60', prefix: '[RES]', prefixColor: 'text-muted-foreground' },
                  ].map((line, i) => (
                    <div key={i} className="terminal-line flex items-start gap-2">
                      <span className="text-muted-foreground/40 font-mono text-[10px] w-5 text-right shrink-0 mt-px select-none">
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      <span className={`font-mono text-[10px] font-semibold shrink-0 mt-px ${line.prefixColor}`}>
                        {line.prefix}
                      </span>
                      <span className={`font-mono text-[10px] flex-1 truncate leading-relaxed ${line.color}`}>
                        {line.text}
                      </span>
                    </div>
                  ))
                )}
                <div className="terminal-line flex items-center gap-2 blink-cursor text-[10px] text-muted-foreground/50 pl-7 font-mono">
                  mordecai@system:~$
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Quick actions + gateway info — 1/3 */}
          <div className="space-y-3">
            {/* Quick actions */}
            <Card className="border-border/60">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground">Quick Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5 p-3 pt-0">
                {[
                  { href: '/memory', label: 'View Memory Files', icon: Brain, color: 'text-teal-400' },
                  { href: '/activity', label: 'Browse Activity Log', icon: Activity, color: 'text-blue-400' },
                  { href: '/agents', label: 'Check Sub-Agents', icon: Bot, color: 'text-purple-400' },
                  { href: '/system', label: 'System Config', icon: Cpu, color: 'text-amber-400' },
                ].map(({ href, label, icon: Icon, color }) => (
                  <Link
                    key={href}
                    href={href}
                    className="flex items-center gap-2.5 px-2.5 py-2 rounded-md group transition-all duration-150 hover:bg-secondary/60"
                    style={{ border: '1px solid transparent' }}
                  >
                    <Icon className={`w-3.5 h-3.5 ${color} shrink-0`} />
                    <span className="text-xs text-muted-foreground group-hover:text-foreground transition-colors flex-1">{label}</span>
                    <ArrowRight className="w-3 h-3 text-muted-foreground/30 group-hover:text-muted-foreground/70 transition-all group-hover:translate-x-0.5" />
                  </Link>
                ))}
              </CardContent>
            </Card>

            {/* Gateway info */}
            <Card className="border-border/60">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-2">
                  <CheckCircle className="w-3 h-3" />
                  Gateway
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3 pt-0 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-muted-foreground">Host</span>
                  <span className="text-[11px] font-mono text-foreground">{gatewaySelf.host ?? '—'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-muted-foreground">Version</span>
                  <span className="text-[11px] font-mono text-primary">v{gatewaySelf.version ?? '—'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-muted-foreground">Latest</span>
                  <span className="text-[11px] font-mono text-foreground">v{registry.latestVersion ?? '—'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-muted-foreground">Platform</span>
                  <span className="text-[11px] font-mono text-foreground/70 truncate max-w-24">{gatewaySelf.platform ?? '—'}</span>
                </div>
                <div className="flex items-center justify-between pt-1 border-t border-border/40">
                  <span className="text-[11px] text-muted-foreground">Status</span>
                  <span className="text-[11px] font-mono text-green-400">{(gateway.reachable ?? false) ? '● reachable' : '○ unreachable'}</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
