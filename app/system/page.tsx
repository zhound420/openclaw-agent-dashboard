'use client'

import { useState, useEffect } from 'react'
import { useTheme } from 'next-themes'
import { PageHeader } from '@/components/page-header'
import {
  Cpu, Clock, Activity as ActivityIcon, Server, ChevronDown, ChevronRight,
  CheckCircle, AlertTriangle, Timer
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { cn } from '@/lib/utils'

interface SystemData {
  config: {
    agentName: string
    version: string
    environment: string
    timezone: string
    logLevel: string
    maxConcurrentTasks: number
    features: Record<string, boolean>
  }
  channels: Array<{
    channel: string
    channelId?: string
    status: string
    lastPing: string | null
    latencyMs: number
    messagesPerHour: number
  }>
  cronJobs: Array<{
    id: string
    name: string
    schedule: string
    description: string
    lastRun: string | null
    nextRun: string | null
    lastStatus: string
    totalRuns: number
    successRate: number
    enabled?: boolean
    consecutiveErrors?: number
  }>
  tokenUsage: {
    byModel: Array<{ model: string; input: number; output: number; total: number; sessions: number }>
    totals: { input: number; output: number; total: number; sessions: number }
  }
  systemInfo: {
    hostname: string
    platform: string
    arch: string
    cpuModel: string
    cores: number
    totalRamGb: number
    version: string
    loadAvg: number[]
    uptime: number
  }
}

interface SystemStatus {
  uptime: number
  version: string
  activeChannels: string[]
  lastHeartbeat: string
  health: string
  memoryUsageMb: number
  totalMemMb: number
  memoryFiles: number
  memoryChunks: number
  cpuPercent: number
}

function formatUptime(s: number) {
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (d > 0) return `${d}d ${h}h ${m}m`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

const channelIcons: Record<string, string> = {
  slack: '💬',
  discord: '🎮',
  terminal: '⌨️',
  api: '🔌',
  cron: '⏰',
  web: '🌐',
  telegram: '✈️',
  imessage: '💬',
}

const channelStatusColors: Record<string, string> = {
  connected: 'oklch(0.68 0.18 145)',
  disconnected: 'oklch(0.45 0.03 265)',
  error: 'oklch(0.65 0.22 25)',
  unknown: 'oklch(0.60 0.10 60)',
}

function HealthGauge({ health }: { health: string }) {
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'
  const isHealthy = health === 'healthy'
  const isDegraded = health === 'degraded'
  const r = 44
  const circ = 2 * Math.PI * r
  const arc = circ * 0.75 // 3/4 circle
  const offset = isHealthy ? 0 : isDegraded ? arc * 0.25 : arc * 0.6
  const color = isHealthy
    ? (isDark ? 'oklch(0.68 0.18 145)' : 'oklch(0.45 0.18 145)')
    : isDegraded
      ? (isDark ? 'oklch(0.72 0.16 60)' : 'oklch(0.50 0.16 60)')
      : (isDark ? 'oklch(0.65 0.22 25)' : 'oklch(0.50 0.22 25)')

  return (
    <div className="relative flex items-center justify-center">
      <svg width="120" height="90" viewBox="0 0 120 90">
        {/* Background arc */}
        <circle
          cx="60" cy="70" r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth="8"
          strokeDasharray={`${arc} ${circ - arc}`}
          strokeDashoffset={circ * 0.125}
          strokeLinecap="round"
          className="text-border"
          style={{ transformOrigin: '60px 70px', transform: 'rotate(135deg)' }}
        />
        {/* Fill arc */}
        <circle
          cx="60" cy="70" r={r}
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeDasharray={`${arc - offset} ${circ - (arc - offset)}`}
          strokeDashoffset={circ * 0.125}
          strokeLinecap="round"
          style={{
            transformOrigin: '60px 70px',
            transform: 'rotate(135deg)',
            filter: `drop-shadow(0 0 6px ${color})`,
            transition: 'stroke-dasharray 0.8s ease',
          }}
        />
      </svg>
      <div className="absolute bottom-1 text-center">
        <div className="text-xs font-bold capitalize" style={{ color }}>{health}</div>
      </div>
    </div>
  )
}

function formatTokens(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return `${n}`
}

function ConfigTree({ config }: { config: SystemData['config'] }) {
  const [openSections, setOpenSections] = useState<Set<string>>(new Set(['core', 'features']))

  const toggle = (key: string) => {
    setOpenSections(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const coreEntries = [
    ['agentName', config.agentName],
    ['version', `v${config.version}`],
    ['environment', config.environment],
    ['timezone', config.timezone],
    ['logLevel', config.logLevel],
    ['maxConcurrentTasks', String(config.maxConcurrentTasks)],
  ]

  return (
    <div className="font-mono text-xs space-y-0.5">
      {/* Core section */}
      <button
        onClick={() => toggle('core')}
        className="flex items-center gap-1.5 w-full text-left px-2 py-1.5 rounded hover:bg-secondary/40 transition-colors"
      >
        {openSections.has('core') ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        <span className="text-amber-400">core</span>
        <span className="text-muted-foreground">/</span>
      </button>
      {openSections.has('core') && (
        <div className="ml-6 space-y-0.5">
          {coreEntries.map(([k, v]) => (
            <div key={k} className="flex items-center gap-2 px-2 py-0.5">
              <span className="text-blue-400/70">{k}</span>
              <span className="text-muted-foreground">:</span>
              <span className="text-green-400/80">&quot;{v}&quot;</span>
            </div>
          ))}
        </div>
      )}

      {/* Features section */}
      <button
        onClick={() => toggle('features')}
        className="flex items-center gap-1.5 w-full text-left px-2 py-1.5 rounded hover:bg-secondary/40 transition-colors"
      >
        {openSections.has('features') ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        <span className="text-amber-400">features</span>
        <span className="text-muted-foreground">/</span>
        <span className="ml-1 text-muted-foreground/50">
          {Object.values(config.features).filter(Boolean).length}/{Object.keys(config.features).length} enabled
        </span>
      </button>
      {openSections.has('features') && (
        <div className="ml-6 space-y-0.5">
          {Object.entries(config.features).map(([k, v]) => (
            <div key={k} className="flex items-center gap-2 px-2 py-0.5">
              <span className="text-blue-400/70">{k}</span>
              <span className="text-muted-foreground">:</span>
              <span className={v ? 'text-green-400' : 'text-red-400/70'}>{v ? 'true' : 'false'}</span>
              {v
                ? <CheckCircle className="w-2.5 h-2.5 text-green-400/60" />
                : <AlertTriangle className="w-2.5 h-2.5 text-red-400/40" />
              }
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function SystemPage() {
  const [status, setStatus] = useState<SystemStatus | null>(null)
  const [systemData, setSystemData] = useState<SystemData | null>(null)

  useEffect(() => {
    async function fetchAll() {
      fetch('/api/status')
        .then(r => r.json())
        .then(j => setStatus(j.data))
        .catch(() => {})

      fetch('/api/system')
        .then(r => r.json())
        .then(j => setSystemData(j.data))
        .catch(() => {})
    }
    fetchAll()
    const interval = setInterval(fetchAll, 3000)
    return () => clearInterval(interval)
  }, [])

  const isHealthy = status?.health === 'healthy'

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="System" description="OpenClaw infrastructure status" />

      <div className="flex-1 overflow-auto p-5 space-y-5">
        {/* Top row: health gauge + key metrics */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          {/* Health gauge card */}
          <div
            className="rounded-lg border border-border/60 p-4 flex flex-col items-center justify-center bg-card"
            style={{
              borderColor: isHealthy ? 'oklch(0.55 0.18 145 / 0.4)' : undefined,
              boxShadow: isHealthy ? '0 0 20px oklch(0.55 0.18 145 / 0.08)' : undefined,
            }}
          >
            <HealthGauge health={status?.health ?? 'unknown'} />
            <div className="text-[10px] text-muted-foreground mt-1">system health</div>
          </div>

          {[
            {
              label: 'System Uptime',
              value: status ? formatUptime(status.uptime) : '—',
              icon: Clock,
              color: 'text-primary',
            },
            {
              label: 'Gateway Mem',
              value: status ? `${(status.memoryUsageMb / 1024).toFixed(2)} GB` : '—',
              icon: Server,
              color: 'text-blue-400',
            },
            {
              label: 'Load Average',
              value: systemData?.systemInfo ? systemData.systemInfo.loadAvg[0].toFixed(2) : '—',
              icon: ActivityIcon,
              color: 'text-amber-400',
            },
          ].map(({ label, value, icon: Icon, color }) => (
            <div
              key={label}
              className="rounded-lg border border-border/60 p-4 bg-card"
            >
              <div className="flex items-center gap-2 mb-2">
                <Icon className={`w-3.5 h-3.5 ${color}`} />
                <span className="text-[11px] text-muted-foreground">{label}</span>
              </div>
              <div className={`text-xl font-bold font-mono ${color}`}>{value}</div>
            </div>
          ))}
        </div>

        {/* Channels grid */}
        <div>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
            <ActivityIcon className="w-3.5 h-3.5" />
            Channels
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {(systemData?.channels ?? []).map(ch => {
              const isConnected = ch.status === 'connected'
              const color = channelStatusColors[ch.status] ?? 'oklch(0.45 0.03 265)'
              const iconKey = ch.channelId ?? ch.channel.toLowerCase()
              const icon = channelIcons[iconKey] ?? '🔌'

              return (
                <div
                  key={ch.channel}
                  className="rounded-lg border p-3 transition-all"
                  style={{
                    background: isConnected ? `${color}0D` : 'var(--surface-overlay)',
                    borderColor: isConnected ? `${color}40` : undefined,
                    boxShadow: isConnected ? `0 0 10px ${color}15` : undefined,
                  }}
                >
                  <div className="flex items-start justify-between mb-2">
                    <span className="text-lg leading-none">{icon}</span>
                    <div
                      className={cn('w-1.5 h-1.5 rounded-full', isConnected ? 'pulse-dot' : '')}
                      style={{ background: color, boxShadow: isConnected ? `0 0 4px ${color}` : undefined }}
                    />
                  </div>
                  <div className="text-xs font-semibold text-foreground capitalize">{ch.channel}</div>
                  <div className="text-[10px] font-mono mt-0.5" style={{ color }}>
                    {ch.status}
                  </div>
                  {isConnected && ch.latencyMs > 0 && (
                    <div className="text-[10px] text-muted-foreground/60 font-mono mt-1">
                      {ch.latencyMs}ms · {ch.messagesPerHour}/h
                    </div>
                  )}
                  {!isConnected && (
                    <div className="text-[10px] text-muted-foreground/40 font-mono mt-1">
                      {ch.lastPing ? formatDistanceToNow(new Date(ch.lastPing), { addSuffix: true }) : 'never'}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Cron jobs + token usage */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Cron jobs */}
          <div className="rounded-lg border border-border/60 bg-card">
            <div className="px-4 py-3 border-b border-border/50 flex items-center gap-2">
              <Timer className="w-3.5 h-3.5 text-muted-foreground" />
              <h3 className="text-xs font-semibold text-foreground">Cron Jobs</h3>
            </div>
            <div className="divide-y divide-border/40">
              {(systemData?.cronJobs ?? []).map(job => {
                const isOk = job.lastStatus === 'success'
                return (
                  <div key={job.id} className="px-4 py-3 flex items-start gap-3">
                    <div
                      className={cn(
                        'w-2 h-2 rounded-full mt-1.5 shrink-0',
                        isOk ? 'bg-green-500' : 'bg-red-500'
                      )}
                      style={{
                        boxShadow: isOk ? '0 0 4px oklch(0.55 0.18 145 / 0.6)' : undefined,
                      }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-foreground">{job.name}</span>
                        <span className="text-[10px] font-mono text-muted-foreground/60">{job.schedule}</span>
                      </div>
                      <div className="text-[10px] text-muted-foreground/60 mt-0.5 truncate">{job.description}</div>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-[10px] text-muted-foreground font-mono">
                          {job.totalRuns.toLocaleString()} runs
                        </span>
                        <span className={cn(
                          'text-[10px] font-mono',
                          job.successRate >= 99 ? 'text-green-500 dark:text-green-400' : 'text-amber-500 dark:text-amber-400'
                        )}>
                          {job.successRate}%
                        </span>
                        <span className="text-[10px] text-muted-foreground/50 font-mono">
                          {job.lastRun ? `last ${formatDistanceToNow(new Date(job.lastRun), { addSuffix: true })}` : 'never run'}
                        </span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* System info + token usage by model + config */}
          <div className="space-y-3">
            <div className="rounded-lg border border-border/60 p-4 bg-card">
              <div className="flex items-center gap-2 mb-3">
                <Cpu className="w-3.5 h-3.5 text-primary" />
                <h3 className="text-xs font-semibold text-foreground">System Info</h3>
              </div>
              {systemData?.systemInfo ? (
                <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px] font-mono">
                  <div className="text-muted-foreground">Hostname</div><div className="text-foreground truncate">{systemData.systemInfo.hostname}</div>
                  <div className="text-muted-foreground">Platform</div><div className="text-foreground">{systemData.systemInfo.platform}</div>
                  <div className="text-muted-foreground">Arch</div><div className="text-foreground">{systemData.systemInfo.arch}</div>
                  <div className="text-muted-foreground">CPU</div><div className="text-foreground truncate">{systemData.systemInfo.cpuModel}</div>
                  <div className="text-muted-foreground">Cores</div><div className="text-foreground">{systemData.systemInfo.cores}</div>
                  <div className="text-muted-foreground">Total RAM</div><div className="text-foreground">{systemData.systemInfo.totalRamGb} GB</div>
                  <div className="text-muted-foreground">Version</div><div className="text-foreground">v{systemData.systemInfo.version}</div>
                  <div className="text-muted-foreground">Load Avg</div><div className="text-foreground">{systemData.systemInfo.loadAvg.join(' / ')}</div>
                  <div className="text-muted-foreground">Uptime</div><div className="text-foreground">{formatUptime(systemData.systemInfo.uptime)}</div>
                </div>
              ) : <div className="text-xs text-muted-foreground">Loading...</div>}
            </div>

            <div className="rounded-lg border border-border/60 p-4 bg-card">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-semibold text-foreground">Token Usage by Model</h3>
                <div className="text-[11px] font-mono text-muted-foreground">
                  {systemData?.tokenUsage ? `${formatTokens(systemData.tokenUsage.totals.total)} total` : '—'}
                </div>
              </div>
              <div className="space-y-2">
                {(systemData?.tokenUsage.byModel ?? []).slice(0, 8).map((m) => {
                  const max = Math.max(...(systemData?.tokenUsage.byModel ?? []).map(x => x.total), 1)
                  const pct = Math.max(6, Math.round((m.total / max) * 100))
                  return (
                    <div key={m.model}>
                      <div className="flex items-center justify-between text-[10px] font-mono mb-1">
                        <span className="text-foreground truncate max-w-[55%]">{m.model}</span>
                        <span className="text-muted-foreground">{formatTokens(m.total)} · {m.sessions} sess</span>
                      </div>
                      <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: 'var(--primary)' }} />
                      </div>
                      <div className="text-[10px] text-muted-foreground font-mono mt-0.5">in {formatTokens(m.input)} · out {formatTokens(m.output)}</div>
                    </div>
                  )
                })}
                {(systemData?.tokenUsage.byModel ?? []).length === 0 && <div className="text-xs text-muted-foreground">No session token data yet.</div>}
              </div>
            </div>

            <div className="rounded-lg border border-border/60 bg-card">
              <div className="px-4 py-3 border-b border-border/50 flex items-center gap-2">
                <ActivityIcon className="w-3.5 h-3.5 text-muted-foreground" />
                <h3 className="text-xs font-semibold text-foreground">Configuration</h3>
              </div>
              <div className="p-3">
                {systemData?.config
                  ? <ConfigTree config={systemData.config} />
                  : <div className="text-xs text-muted-foreground text-center py-4">Loading...</div>
                }
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
