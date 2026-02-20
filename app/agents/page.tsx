'use client'

import { useState, useEffect } from 'react'
import { PageHeader } from '@/components/page-header'
import { StatusBadge } from '@/components/status-badge'
import type { SubAgent } from '@/types'
import {
  CheckCircle, Clock, Zap, TrendingUp, Activity, RefreshCw, AlertTriangle
} from 'lucide-react'
import { formatDistanceToNow, format } from 'date-fns'
import { cn } from '@/lib/utils'

const agentEmojis: Record<string, string> = {
  hex: '⬡',
  scout: '🔬',
  scribe: '📝',
  sentinel: '🛡️',
  analyst: '📊',
  ghost: '👻',
}

const agentColors: Record<string, { primary: string; glow: string; bg: string }> = {
  hex: { primary: 'oklch(0.70 0.20 295)', glow: 'oklch(0.70 0.20 295 / 0.4)', bg: 'oklch(0.70 0.20 295 / 0.08)' },
  scout: { primary: 'oklch(0.68 0.18 160)', glow: 'oklch(0.68 0.18 160 / 0.4)', bg: 'oklch(0.68 0.18 160 / 0.08)' },
  scribe: { primary: 'oklch(0.72 0.16 60)', glow: 'oklch(0.72 0.16 60 / 0.4)', bg: 'oklch(0.72 0.16 60 / 0.08)' },
  sentinel: { primary: 'oklch(0.68 0.18 230)', glow: 'oklch(0.68 0.18 230 / 0.4)', bg: 'oklch(0.68 0.18 230 / 0.08)' },
  analyst: { primary: 'oklch(0.68 0.18 195)', glow: 'oklch(0.68 0.18 195 / 0.4)', bg: 'oklch(0.68 0.18 195 / 0.08)' },
  ghost: { primary: 'oklch(0.58 0.05 265)', glow: 'oklch(0.58 0.05 265 / 0.3)', bg: 'oklch(0.58 0.05 265 / 0.06)' },
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(0)}s`
  return `${(ms / 60000).toFixed(1)}m`
}

function AgentAvatar({ agentId, size = 'md' }: { agentId: string; size?: 'sm' | 'md' | 'lg' }) {
  const emoji = agentEmojis[agentId] ?? '🤖'
  const colors = agentColors[agentId] ?? agentColors.hex
  const sz = size === 'lg' ? 'w-14 h-14 text-2xl' : size === 'md' ? 'w-10 h-10 text-xl' : 'w-7 h-7 text-sm'

  return (
    <div className="relative">
      <div
        className={cn('rounded-full flex items-center justify-center shrink-0', sz)}
        style={{
          background: `radial-gradient(circle at 30% 30%, ${colors.primary}30, ${colors.bg})`,
          border: `1px solid ${colors.primary}40`,
          boxShadow: `0 0 12px ${colors.glow}`,
        }}
      >
        {emoji}
      </div>
    </div>
  )
}

function SuccessRing({ rate, color }: { rate: number; color: string }) {
  const r = 20
  const circ = 2 * Math.PI * r
  const dashOffset = circ - (rate / 100) * circ

  return (
    <svg width="54" height="54" className="rotate-[-90deg]">
      <circle cx="27" cy="27" r={r} fill="none" stroke="currentColor" strokeWidth="3" className="text-border" />
      <circle
        cx="27" cy="27" r={r} fill="none"
        stroke={color} strokeWidth="3"
        strokeDasharray={circ}
        strokeDashoffset={dashOffset}
        strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset 0.8s ease' }}
      />
      <text
        x="27" y="31"
        textAnchor="middle"
        fontSize="9"
        fill="currentColor"
        fontFamily="monospace"
        className="text-foreground"
        style={{ transform: 'rotate(90deg)', transformOrigin: '27px 27px' }}
      >
        {Math.round(rate)}%
      </text>
    </svg>
  )
}

function StatusTimeline({ tasks }: { tasks: SubAgent['recentTasks'] }) {
  return (
    <div className="flex items-center gap-1 mt-2">
      {tasks.slice().reverse().map((t, i) => (
        <div
          key={t.id}
          className="flex-1 h-1.5 rounded-full"
          title={`${t.description} · ${formatDuration(t.durationMs)}`}
          style={{
            background: t.status === 'success'
              ? 'oklch(0.68 0.18 145)'
              : t.status === 'error'
                ? 'oklch(0.65 0.22 25)'
                : 'oklch(0.72 0.16 60)',
            opacity: 0.4 + (i / tasks.length) * 0.6,
          }}
        />
      ))}
    </div>
  )
}

export default function SubAgentsPage() {
  const [agents, setAgents] = useState<SubAgent[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => {
    async function fetchAgents() {
      try {
        const res = await fetch('/api/agents')
        const data = await res.json()
        setAgents(data.data ?? [])
      } catch {}
      finally { setLoading(false) }
    }
    fetchAgents()
  }, [])

  const activeAgents = agents.filter(a => a.status === 'active')
  const totalTasks = agents.reduce((sum, a) => sum + a.tasksCompleted, 0)
  const agentsWithData = agents.filter(a => a.successRate !== null && a.tasksCompleted > 0)
  const avgSuccessRate = agentsWithData.length > 0
    ? agentsWithData.reduce((sum, a) => sum + (a.successRate ?? 0), 0) / agentsWithData.length
    : 0

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Sub-Agents" description={`${process.env.NEXT_PUBLIC_AGENT_NAME ?? 'Agent'}'s specialized squad`}>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5" />
            <span>{activeAgents.length} active</span>
          </div>
          <div className="flex items-center gap-1.5">
            <CheckCircle className="w-3.5 h-3.5" />
            <span>{totalTasks.toLocaleString()} total tasks</span>
          </div>
        </div>
      </PageHeader>

      <div className="flex-1 overflow-auto p-5 space-y-5">
        {/* Summary bar */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="rounded-lg p-3 border border-border/60 bg-card">
            <div className="flex items-center gap-2 mb-1">
              <Activity className="w-3.5 h-3.5 text-green-400" />
              <span className="text-[11px] text-muted-foreground">Active now</span>
            </div>
            <div className="text-xl font-bold font-mono text-green-400">{activeAgents.length}</div>
          </div>
          <div className="rounded-lg p-3 border border-border/60 bg-card">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle className="w-3.5 h-3.5 text-primary" />
              <span className="text-[11px] text-muted-foreground">Total tasks</span>
            </div>
            <div className="text-xl font-bold font-mono text-primary">
              {totalTasks.toLocaleString()}
            </div>
          </div>
          <div className="rounded-lg p-3 border border-border/60 bg-card">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="w-3.5 h-3.5 text-blue-400" />
              <span className="text-[11px] text-muted-foreground">Avg success</span>
            </div>
            <div className="text-xl font-bold font-mono text-blue-400">{avgSuccessRate.toFixed(1)}%</div>
          </div>
          <div className="rounded-lg p-3 border border-border/60 bg-card">
            <div className="flex items-center gap-2 mb-1">
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-[11px] text-muted-foreground">Squad size</span>
            </div>
            <div className="text-xl font-bold font-mono text-amber-400">{agents.length}</div>
          </div>
        </div>

        {/* Agent cards */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} className="h-48 rounded-lg border border-border/60 animate-pulse bg-secondary/20" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {agents.map(agent => {
              const colors = agentColors[agent.id] ?? agentColors.hex
              const isExpanded = expanded === agent.id
              const isActive = agent.status === 'active'

              return (
                <div
                  key={agent.id}
                  className={cn(
                    'rounded-lg border transition-all duration-200 overflow-hidden cursor-pointer',
                    isActive ? 'border-opacity-60' : 'border-border/50'
                  )}
                  style={{
                    background: 'var(--card)',
                    borderColor: isActive ? colors.primary + '60' : undefined,
                    boxShadow: isActive ? `0 0 20px ${colors.glow}` : undefined,
                  }}
                  onClick={() => setExpanded(isExpanded ? null : agent.id)}
                >
                  <div className="p-4">
                    {/* Header */}
                    <div className="flex items-start gap-3 mb-3">
                      <AgentAvatar agentId={agent.id} size="md" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-semibold text-foreground">{agent.name}</h3>
                          {isActive && (
                            <div
                              className="w-1.5 h-1.5 rounded-full pulse-dot"
                              style={{ background: colors.primary, boxShadow: `0 0 4px ${colors.primary}` }}
                            />
                          )}
                        </div>
                        <p className="text-[11px] text-muted-foreground/70 truncate">{agent.description}</p>
                      </div>
                      <StatusBadge status={agent.status} />
                    </div>

                    {/* Stats row */}
                    <div className="flex items-center gap-3 mb-3">
                      <SuccessRing rate={agent.successRate ?? 0} color={colors.primary} />
                      <div className="flex-1 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] text-muted-foreground">Tasks</span>
                          <span className="text-[11px] font-mono text-foreground">{agent.tasksCompleted.toLocaleString()}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] text-muted-foreground">Last active</span>
                          <span className="text-[11px] font-mono text-muted-foreground">
                            {agent.lastUsed ? formatDistanceToNow(new Date(agent.lastUsed), { addSuffix: true }) : 'never'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Capabilities */}
                    <div className="flex flex-wrap gap-1 mb-3">
                      {agent.capabilities.slice(0, 4).map(cap => (
                        <span
                          key={cap}
                          className="text-[9px] px-1.5 py-0.5 rounded font-mono"
                          style={{ background: colors.bg, color: colors.primary }}
                        >
                          {cap}
                        </span>
                      ))}
                    </div>

                    {/* Task timeline */}
                    <div>
                      <div className="text-[9px] text-muted-foreground/50 mb-1">recent task history</div>
                      <StatusTimeline tasks={agent.recentTasks} />
                    </div>
                  </div>

                  {/* Expanded recent tasks */}
                  {isExpanded && (
                    <div
                      className="border-t border-border/40 p-3 space-y-2 bg-muted/40"
                      onClick={e => e.stopPropagation()}
                    >
                      <div className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider mb-2">Recent Tasks</div>
                      {agent.recentTasks.map(task => (
                        <div key={task.id} className="flex items-start gap-2">
                          <div
                            className={cn(
                              'w-1.5 h-1.5 rounded-full mt-1.5 shrink-0',
                              task.status === 'success' ? 'bg-green-500' : 'bg-red-500'
                            )}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="text-[11px] text-foreground/80 truncate">{task.description}</div>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-[10px] text-muted-foreground font-mono">
                                {format(new Date(task.timestamp), 'MMM d HH:mm')}
                              </span>
                              <span className="text-[10px] text-muted-foreground font-mono">
                                {formatDuration(task.durationMs)}
                              </span>
                              <span className="text-[10px] text-muted-foreground font-mono">
                                {task.tokensUsed.toLocaleString()} tok
                              </span>
                            </div>
                          </div>
                          {task.status === 'error' && (
                            <AlertTriangle className="w-3 h-3 text-red-400 shrink-0 mt-0.5" />
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* All recent tasks feed */}
        {!loading && agents.length > 0 && (
          <div className="rounded-lg border border-border/60 bg-card">
            <div className="px-4 py-3 border-b border-border/50 flex items-center justify-between">
              <h3 className="text-xs font-semibold text-foreground flex items-center gap-2">
                <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                All Recent Tasks
              </h3>
              <span className="text-[10px] text-muted-foreground">
                Click agent cards to expand details
              </span>
            </div>
            <div className="divide-y divide-border/40">
              {agents
                .flatMap(a => a.recentTasks.map(t => ({ ...t, agentId: a.id, agentName: a.name })))
                .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
                .slice(0, 10)
                .map(task => {
                  const colors = agentColors[task.agentId] ?? agentColors.hex
                  return (
                    <div key={task.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-secondary/20 transition-colors">
                      <AgentAvatar agentId={task.agentId} size="sm" />
                      <div className="flex-1 min-w-0">
                        <span className="text-xs text-foreground/80 truncate block">{task.description}</span>
                        <span className="text-[10px] text-muted-foreground font-mono">
                          @{task.agentName} · {format(new Date(task.timestamp), 'MMM d HH:mm')}
                        </span>
                      </div>
                      <span className="text-[10px] font-mono text-muted-foreground">{formatDuration(task.durationMs)}</span>
                      <span className="text-[10px] font-mono text-muted-foreground">{task.tokensUsed.toLocaleString()}</span>
                      <div
                        className={cn(
                          'w-1.5 h-1.5 rounded-full',
                          task.status === 'success' ? 'bg-green-500' : 'bg-red-500'
                        )}
                      />
                    </div>
                  )
                })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
