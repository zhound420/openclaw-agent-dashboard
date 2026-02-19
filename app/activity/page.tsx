'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useTheme } from 'next-themes'
import { PageHeader } from '@/components/page-header'
import { ActivityTypeBadge } from '@/components/activity-type-badge'
import { StatusBadge } from '@/components/status-badge'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import type { ActivityEntry, ActivityType, ChannelType } from '@/types'
import { toZonedTime } from 'date-fns-tz'

const TZ = 'America/Los_Angeles'
function toPST(date: Date) { return toZonedTime(date, TZ) }
import {
  Search, X, ChevronLeft, ChevronRight, RefreshCw, Zap,
  ChevronDown, ChevronUp, Terminal, List,
  Clock
} from 'lucide-react'
import { format, formatDistanceToNow } from 'date-fns'
import { cn } from '@/lib/utils'

const ACTIVITY_TYPES: ActivityType[] = ['message', 'task', 'cron', 'heartbeat', 'memory', 'tool', 'error']
const CHANNELS: ChannelType[] = ['slack', 'discord', 'terminal', 'api', 'cron', 'web']

const rowColors: Record<string, string> = {
  message: 'border-l-blue-500/50 hover:bg-blue-500/5',
  task: 'border-l-purple-500/50 hover:bg-purple-500/5',
  cron: 'border-l-amber-500/50 hover:bg-amber-500/5',
  heartbeat: 'border-l-pink-500/30 hover:bg-pink-500/3',
  memory: 'border-l-teal-500/50 hover:bg-teal-500/5',
  tool: 'border-l-orange-500/50 hover:bg-orange-500/5',
  error: 'border-l-red-500/60 hover:bg-red-500/8',
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

// oklch values work across themes — bg uses low alpha so they adapt naturally
const channelColors: Record<string, { bg: string; text: string }> = {
  slack: { bg: 'oklch(0.60 0.16 220 / 0.12)', text: 'oklch(0.45 0.16 220)' },
  discord: { bg: 'oklch(0.60 0.20 280 / 0.12)', text: 'oklch(0.45 0.18 280)' },
  terminal: { bg: 'oklch(0.55 0.18 145 / 0.12)', text: 'oklch(0.40 0.18 145)' },
  api: { bg: 'oklch(0.55 0.20 295 / 0.12)', text: 'oklch(0.45 0.20 295)' },
  cron: { bg: 'oklch(0.55 0.16 60 / 0.12)', text: 'oklch(0.45 0.16 60)' },
  web: { bg: 'oklch(0.50 0.16 195 / 0.12)', text: 'oklch(0.40 0.14 195)' },
}
const channelColorsDark: Record<string, { bg: string; text: string }> = {
  slack: { bg: 'oklch(0.60 0.16 220 / 0.12)', text: 'oklch(0.72 0.16 220)' },
  discord: { bg: 'oklch(0.60 0.20 280 / 0.12)', text: 'oklch(0.72 0.18 280)' },
  terminal: { bg: 'oklch(0.68 0.18 145 / 0.12)', text: 'oklch(0.75 0.18 145)' },
  api: { bg: 'oklch(0.70 0.20 295 / 0.12)', text: 'oklch(0.78 0.18 295)' },
  cron: { bg: 'oklch(0.72 0.16 60 / 0.12)', text: 'oklch(0.78 0.16 60)' },
  web: { bg: 'oklch(0.60 0.16 195 / 0.12)', text: 'oklch(0.72 0.14 195)' },
}

type ViewMode = 'table' | 'timeline'

function ExpandableRow({ entry }: { entry: ActivityEntry }) {
  const [expanded, setExpanded] = useState(false)
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'
  const colorMap = isDark ? channelColorsDark : channelColors
  const fallback = isDark
    ? { bg: 'oklch(0.16 0.02 265)', text: 'oklch(0.58 0.03 265)' }
    : { bg: 'oklch(0.90 0.01 265)', text: 'oklch(0.45 0.03 265)' }
  const chCol = colorMap[entry.channel] ?? fallback

  return (
    <>
      <tr
        className={cn(
          'border-l-2 transition-all duration-150 cursor-pointer',
          rowColors[entry.type] ?? 'border-l-border hover:bg-secondary/20',
          expanded && 'bg-secondary/20'
        )}
        onClick={() => entry.details && setExpanded(!expanded)}
      >
        <td className="px-3 py-2.5 font-mono text-muted-foreground whitespace-nowrap text-[11px]">
          {format(toPST(new Date(entry.timestamp)), 'MMM d HH:mm:ss')}
        </td>
        <td className="px-3 py-2.5">
          <ActivityTypeBadge type={entry.type} />
        </td>
        <td className="px-3 py-2.5">
          <span
            className="px-1.5 py-0.5 rounded text-[10px] font-mono"
            style={{ background: chCol.bg, color: chCol.text }}
          >
            {entry.channel}
          </span>
        </td>
        <td className="px-3 py-2.5 max-w-xs">
          <span className={cn(
            'text-xs block truncate',
            entry.status === 'error' ? 'text-red-300' : 'text-foreground/90'
          )}>
            {entry.summary}
          </span>
        </td>
        <td className="px-3 py-2.5">
          {entry.agentId
            ? <span className="text-[11px] font-mono text-primary/80">@{entry.agentId}</span>
            : <span className="text-muted-foreground/40 text-[11px]">—</span>
          }
        </td>
        <td className="px-3 py-2.5 text-right font-mono text-muted-foreground text-[11px]">
          {entry.tokensUsed ? entry.tokensUsed.toLocaleString() : '—'}
        </td>
        <td className="px-3 py-2.5">
          <StatusBadge status={entry.status} />
        </td>
        <td className="px-3 py-2.5 w-6">
          {entry.details && (
            <div className={cn('text-muted-foreground/40 transition-transform', expanded && 'rotate-180')}>
              <ChevronDown className="w-3.5 h-3.5" />
            </div>
          )}
        </td>
      </tr>
      {expanded && entry.details && (
        <tr className={cn('border-l-2', rowColors[entry.type])}>
          <td colSpan={8} className="px-3 pb-3">
            <div
              className="mt-1 p-3 rounded-md text-[11px] font-mono leading-relaxed"
              style={{ background: 'var(--expanded-panel-bg)', border: '1px solid var(--expanded-panel-border)' }}
            >
              <div className="text-muted-foreground/50 mb-1 text-[10px]">─── details ───</div>
              <div className={typeColors[entry.type] ?? 'text-foreground/80'}>{entry.details}</div>
              {entry.durationMs && (
                <div className="mt-2 text-muted-foreground/50 text-[10px] flex items-center gap-1">
                  <Clock className="w-2.5 h-2.5" />
                  {entry.durationMs >= 1000
                    ? `${(entry.durationMs / 1000).toFixed(1)}s`
                    : `${entry.durationMs}ms`}
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

function TimelineEntry({ entry, isLast }: { entry: ActivityEntry; isLast: boolean }) {
  const [expanded, setExpanded] = useState(false)
  const dotColor = entry.type === 'error' ? 'oklch(0.65 0.22 25)'
    : entry.type === 'task' ? 'oklch(0.70 0.20 295)'
    : entry.type === 'message' ? 'oklch(0.60 0.16 220)'
    : entry.type === 'cron' ? 'oklch(0.72 0.16 60)'
    : entry.type === 'memory' ? 'oklch(0.68 0.18 160)'
    : entry.type === 'tool' ? 'oklch(0.70 0.18 50)'
    : 'oklch(0.72 0.18 340)'

  return (
    <div className="flex gap-3 group">
      {/* Timeline line + dot */}
      <div className="flex flex-col items-center w-6 shrink-0">
        <div
          className="w-2.5 h-2.5 rounded-full shrink-0 mt-2 z-10 transition-all group-hover:scale-125"
          style={{
            background: dotColor,
            boxShadow: `0 0 6px ${dotColor}`,
          }}
        />
        {!isLast && (
          <div
            className="w-px flex-1 mt-1"
            style={{ background: 'linear-gradient(to bottom, var(--timeline-connector), var(--timeline-connector-end))' }}
          />
        )}
      </div>

      {/* Content */}
      <div className={cn(
        'flex-1 pb-4 min-w-0',
        !isLast && 'border-b border-border/30'
      )}>
        <div className="flex items-start gap-2 flex-wrap">
          <ActivityTypeBadge type={entry.type} />
          <span className="text-[10px] font-mono text-muted-foreground/60 mt-1">
            {format(toPST(new Date(entry.timestamp)), 'HH:mm:ss')} · {formatDistanceToNow(toPST(new Date(entry.timestamp)), { addSuffix: true })}
          </span>
          {entry.agentId && (
            <span className="text-[10px] font-mono mt-1 text-primary/70">@{entry.agentId}</span>
          )}
          <div className="ml-auto">
            <StatusBadge status={entry.status} />
          </div>
        </div>
        <p className={cn(
          'text-xs mt-1.5 leading-relaxed',
          entry.status === 'error' ? 'text-red-500 dark:text-red-300' : 'text-foreground/80'
        )}>
          {entry.summary}
        </p>
        {entry.details && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="mt-1.5 text-[10px] text-muted-foreground/60 hover:text-muted-foreground flex items-center gap-1 transition-colors"
          >
            {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            {expanded ? 'collapse' : 'expand details'}
          </button>
        )}
        {expanded && entry.details && (
          <div
            className="mt-2 p-2.5 rounded text-[11px] font-mono leading-relaxed"
            style={{ background: 'var(--expanded-panel-bg)', border: '1px solid var(--expanded-panel-border)' }}
          >
            {entry.details}
          </div>
        )}
      </div>
    </div>
  )
}

export default function ActivityPage() {
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'
  const [entries, setEntries] = useState<ActivityEntry[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState<ViewMode>('table')

  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<ActivityType | ''>('')
  const [channelFilter, setChannelFilter] = useState<ChannelType | ''>('')

  const pageSize = 20

  const fetchActivity = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      })
      if (search) params.set('search', search)
      if (typeFilter) params.set('type', typeFilter)
      if (channelFilter) params.set('channel', channelFilter)

      const res = await fetch(`/api/activity?${params}`)
      const data = await res.json()
      setEntries(data.items ?? [])
      setTotal(data.total ?? 0)
      setHasMore(data.hasMore ?? false)
    } finally {
      setLoading(false)
    }
  }, [page, search, typeFilter, channelFilter])

  useEffect(() => {
    fetchActivity()
  }, [fetchActivity])

  useEffect(() => {
    setPage(1)
  }, [search, typeFilter, channelFilter])

  const clearFilters = () => {
    setSearch('')
    setTypeFilter('')
    setChannelFilter('')
    setPage(1)
  }

  const hasFilters = search || typeFilter || channelFilter

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Activity Log" description={`${total} total entries`}>
        <div className="flex items-center gap-2">
          {/* View mode toggle */}
          <div
            className="flex items-center rounded-md border border-border p-0.5"
            style={{ background: 'var(--view-toggle-bg)' }}
          >
            <button
              onClick={() => setViewMode('table')}
              className={cn(
                'flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-all',
                viewMode === 'table'
                  ? 'bg-secondary text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <List className="w-3 h-3" />
              Table
            </button>
            <button
              onClick={() => setViewMode('timeline')}
              className={cn(
                'flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-all',
                viewMode === 'timeline'
                  ? 'bg-secondary text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Terminal className="w-3 h-3" />
              Timeline
            </button>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={fetchActivity}
            className="gap-1.5 text-xs border-border hover:border-primary h-8"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </PageHeader>

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Filters */}
        <div className="px-5 py-3 border-b border-border/60 space-y-2.5">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              placeholder="Search entries..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-8 h-8 text-xs bg-secondary/60 border-border/60 font-mono"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap gap-3 items-center">
            <div className="flex flex-wrap gap-1">
              {ACTIVITY_TYPES.map(t => {
                const isActive = typeFilter === t
                const col = typeColors[t] ?? 'text-muted-foreground'
                return (
                  <button
                    key={t}
                    onClick={() => setTypeFilter(typeFilter === t ? '' : t)}
                    className={cn(
                      'text-[11px] px-2 py-0.5 rounded border transition-all font-mono',
                      isActive
                        ? `border-current bg-current/10 ${col}`
                        : 'border-border/50 text-muted-foreground hover:text-foreground hover:border-border'
                    )}
                  >
                    {t}
                  </button>
                )
              })}
            </div>

            <div className="w-px h-4 bg-border/50" />

            <div className="flex flex-wrap gap-1">
              {CHANNELS.map(ch => {
                const isActive = channelFilter === ch
                const colorMap = isDark ? channelColorsDark : channelColors
                const col = colorMap[ch] ?? { text: isDark ? 'oklch(0.58 0.03 265)' : 'oklch(0.45 0.03 265)', bg: '' }
                return (
                  <button
                    key={ch}
                    onClick={() => setChannelFilter(channelFilter === ch ? '' : ch)}
                    className={cn(
                      'text-[11px] px-2 py-0.5 rounded border transition-all font-mono',
                      !isActive && 'border-border/50 text-muted-foreground hover:text-foreground hover:border-border'
                    )}
                    style={isActive
                      ? { background: col.bg, color: col.text, borderColor: `${col.text}40` }
                      : undefined
                    }
                  >
                    {ch}
                  </button>
                )
              })}
            </div>

            {hasFilters && (
              <button
                onClick={clearFilters}
                className="text-[11px] text-red-400/70 hover:text-red-400 flex items-center gap-1 ml-auto transition-colors"
              >
                <X className="w-3 h-3" /> Clear filters
              </button>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="flex items-center justify-center h-32 gap-2 text-muted-foreground text-sm">
              <RefreshCw className="w-4 h-4 animate-spin" />
              Loading...
            </div>
          ) : entries.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-muted-foreground gap-2">
              <Zap className="w-8 h-8 opacity-20" />
              <p className="text-sm">No activity found</p>
            </div>
          ) : viewMode === 'table' ? (
            <table className="w-full">
              <thead className="sticky top-0 border-b border-border/60" style={{ background: 'var(--table-header-bg)' }}>
                <tr>
                  <th className="px-3 py-2.5 text-left text-[11px] text-muted-foreground font-medium w-36">Timestamp</th>
                  <th className="px-3 py-2.5 text-left text-[11px] text-muted-foreground font-medium w-28">Type</th>
                  <th className="px-3 py-2.5 text-left text-[11px] text-muted-foreground font-medium w-20">Channel</th>
                  <th className="px-3 py-2.5 text-left text-[11px] text-muted-foreground font-medium">Summary</th>
                  <th className="px-3 py-2.5 text-left text-[11px] text-muted-foreground font-medium w-20">Agent</th>
                  <th className="px-3 py-2.5 text-right text-[11px] text-muted-foreground font-medium w-20">Tokens</th>
                  <th className="px-3 py-2.5 text-left text-[11px] text-muted-foreground font-medium w-24">Status</th>
                  <th className="px-3 py-2.5 w-6" />
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <ExpandableRow key={entry.id} entry={entry} />
                ))}
              </tbody>
            </table>
          ) : (
            <div className="p-5">
              {entries.map((entry, i) => (
                <TimelineEntry key={entry.id} entry={entry} isLast={i === entries.length - 1} />
              ))}
            </div>
          )}
        </div>

        {/* Pagination */}
        <div className="px-5 py-3 border-t border-border/60 flex items-center justify-between">
          <span className="text-[11px] text-muted-foreground font-mono">
            {total > 0
              ? `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} of ${total}`
              : '0 results'}
          </span>
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(p => p - 1)}
              disabled={page === 1}
              className="h-7 w-7 p-0 border-border/60"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </Button>
            <span className="text-[11px] text-muted-foreground px-1 font-mono">p.{page}</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(p => p + 1)}
              disabled={!hasMore}
              className="h-7 w-7 p-0 border-border/60"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
