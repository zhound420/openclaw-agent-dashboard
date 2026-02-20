'use client'

import { useEffect, useState } from 'react'
import { useTheme } from 'next-themes'
import { Heart, Wifi, Clock, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { SystemStatus } from '@/types'

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (d > 0) return `${d}d ${h}h ${m}m`
  if (h > 0) return `${h}h ${m}m ${s}s`
  return `${m}m ${s}s`
}

const channelColors: Record<string, string> = {
  slack: 'oklch(0.68 0.18 230)',
  discord: 'oklch(0.60 0.20 280)',
  terminal: 'oklch(0.75 0.18 145)',
  api: 'oklch(0.70 0.20 295)',
  cron: 'oklch(0.72 0.16 60)',
  web: 'oklch(0.68 0.18 195)',
  telegram: 'oklch(0.60 0.18 215)',
  imessage: 'oklch(0.68 0.18 145)',
}

interface TopStatusBarProps {
  initialStatus?: SystemStatus | null
}

export function TopStatusBar({ initialStatus }: TopStatusBarProps) {
  const { resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const isDark = mounted ? resolvedTheme === 'dark' : true
  const [status, setStatus] = useState<SystemStatus | null>(initialStatus ?? null)
  const [uptime, setUptime] = useState(initialStatus?.uptime ?? 0)
  const [heartbeat, setHeartbeat] = useState(false)
  const [lastPingAgo, setLastPingAgo] = useState(0)

  useEffect(() => setMounted(true), [])

  useEffect(() => {
    // Tick uptime every second
    const interval = setInterval(() => {
      setUptime(u => u + 1)
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    // Fetch status periodically
    async function fetchStatus() {
      try {
        const res = await fetch('/api/status')
        const json = await res.json()
        if (json.data) {
          setStatus(json.data)
          setUptime(json.data.uptime)
        }
      } catch {}
    }
    fetchStatus()
    const interval = setInterval(fetchStatus, 3000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    // Heartbeat animation every 5 seconds
    const pulse = () => {
      setHeartbeat(true)
      setTimeout(() => setHeartbeat(false), 600)
    }
    pulse()
    const interval = setInterval(pulse, 5000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    // Update "last ping ago"
    if (!status?.lastHeartbeat) return
    const update = () => {
      const diff = Math.floor((Date.now() - new Date(status.lastHeartbeat).getTime()) / 1000)
      setLastPingAgo(diff)
    }
    update()
    const interval = setInterval(update, 1000)
    return () => clearInterval(interval)
  }, [status?.lastHeartbeat])

  const isHealthy = status?.health === 'healthy'
  const channels = status?.activeChannels ?? []

  return (
    <div
      className="h-9 flex items-center px-4 border-b border-border/50 shrink-0 relative overflow-hidden"
      style={{
        background: isDark
          ? 'linear-gradient(180deg, oklch(0.09 0.015 265) 0%, oklch(0.075 0.012 265) 100%)'
          : 'linear-gradient(180deg, oklch(0.97 0.006 265) 0%, oklch(0.96 0.005 265) 100%)',
      }}
    >
      {/* Subtle animated gradient line at top */}
      <div
        className="absolute top-0 left-0 right-0 h-px"
        style={{
          background: isDark
            ? 'linear-gradient(90deg, transparent 0%, oklch(0.70 0.20 295 / 0.4) 30%, oklch(0.60 0.16 220 / 0.3) 70%, transparent 100%)'
            : 'linear-gradient(90deg, transparent 0%, oklch(0.55 0.22 295 / 0.3) 30%, oklch(0.50 0.16 220 / 0.2) 70%, transparent 100%)',
        }}
      />

      <div className="flex items-center gap-4 w-full text-[11px] text-muted-foreground">
        {/* Heartbeat */}
        <div className="flex items-center gap-1.5">
          <Heart
            className={cn(
              'w-3 h-3 transition-all duration-150',
              heartbeat ? 'text-red-400 scale-125' : 'text-muted-foreground scale-100'
            )}
            fill={heartbeat ? 'currentColor' : 'none'}
          />
          <span className={cn(
            'transition-colors duration-300',
            lastPingAgo < 30 ? 'text-green-400' : lastPingAgo < 120 ? 'text-amber-400' : 'text-red-400'
          )}>
            {lastPingAgo < 5 ? 'just now' : `${lastPingAgo}s ago`}
          </span>
        </div>

        <div className="w-px h-3 bg-border/50" />

        {/* Uptime */}
        <div className="flex items-center gap-1.5">
          <Clock className="w-3 h-3" />
          <span className="font-mono">{formatUptime(uptime)}</span>
        </div>

        <div className="w-px h-3 bg-border/50" />

        {/* Health */}
        <div className="flex items-center gap-1.5">
          <div
            className={cn(
              'w-1.5 h-1.5 rounded-full',
              isHealthy ? 'pulse-dot' : ''
            )}
            style={{
              background: isHealthy
                ? 'oklch(0.75 0.18 145)'
                : status?.health === 'degraded'
                  ? 'oklch(0.72 0.16 60)'
                  : 'oklch(0.65 0.22 25)',
              boxShadow: isHealthy
                ? '0 0 6px oklch(0.75 0.18 145 / 0.8)'
                : undefined,
            }}
          />
          <span className={isHealthy ? 'text-green-400' : 'text-amber-400'}>
            {status?.health ?? 'unknown'}
          </span>
        </div>

        <div className="w-px h-3 bg-border/50" />

        {/* Active channels */}
        <div className="flex items-center gap-1.5">
          <Wifi className="w-3 h-3" />
          <div className="flex items-center gap-1">
            {channels.length > 0
              ? channels.map((ch) => (
                <div
                  key={ch}
                  className="w-1.5 h-1.5 rounded-full pulse-dot"
                  title={ch}
                  style={{
                    background: channelColors[ch] ?? 'oklch(0.58 0.03 265)',
                    boxShadow: `0 0 4px ${channelColors[ch] ?? 'oklch(0.58 0.03 265)'} / 0.8`,
                    animationDelay: `${channels.indexOf(ch) * 0.3}s`,
                  }}
                />
              ))
              : <span>no channels</span>
            }
          </div>
          <span>{channels.length} active</span>
        </div>

        <div className="flex-1" />

        {/* Right side: mem + cpu */}
        {status && (
          <>
            <div className="flex items-center gap-1.5">
              <Zap className="w-3 h-3" />
              <span>{status.cpuPercent}% CPU</span>
            </div>
            <div className="w-px h-3 bg-border/50" />
            <div className="flex items-center gap-1.5">
              <span>{status.memoryUsageMb}MB</span>
            </div>
            <div className="w-px h-3 bg-border/50" />
          </>
        )}
        <div className="flex items-center gap-1" title="Polling every 3s">
          <div
            className="w-1.5 h-1.5 rounded-full pulse-dot"
            style={{ background: 'oklch(0.75 0.18 145)', boxShadow: '0 0 5px oklch(0.75 0.18 145 / 0.8)' }}
          />
          <span className="text-[10px] font-mono text-green-400/80 uppercase tracking-wider">live</span>
        </div>
      </div>
    </div>
  )
}
