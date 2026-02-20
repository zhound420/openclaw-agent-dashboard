import { NextRequest, NextResponse } from 'next/server'
import { execSync } from 'child_process'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import type { ActivityEntry, ActivityType, ChannelType } from '@/types'

let cachedActivity: ActivityEntry[] | null = null
let cacheTimestamp = 0
const CACHE_TTL = 3_000

function execJSON(cmd: string): unknown {
  try {
    const raw = execSync(cmd, { timeout: 10_000, encoding: 'utf-8' }).trim()
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function getSessionActivity(): ActivityEntry[] {
  const now = Date.now()
  if (cachedActivity && (now - cacheTimestamp) < CACHE_TTL) {
    return cachedActivity
  }

  const entries: ActivityEntry[] = []

  // 1. Get sessions from OpenClaw
  try {
    const data = execJSON('openclaw sessions list --json --limit 50 2>/dev/null') as {
      sessions?: Array<{
        key: string
        kind: string
        updatedAt: number
        sessionId: string
        model?: string
        totalTokens?: number
        inputTokens?: number
        outputTokens?: number
      }>
    } | null

    const sessions = data?.sessions ?? []

    for (const sess of sessions) {
      const key = sess.key || ''
      const ts = new Date(sess.updatedAt).toISOString()

      let type: ActivityEntry['type'] = 'message'
      let channel: ActivityEntry['channel'] = 'terminal'
      let summary = ''

      if (key.includes('cron')) {
        type = 'cron'
        channel = 'cron'
        const cronId = key.split('cron:')[1]?.slice(0, 8) || 'unknown'
        summary = `Cron job ${cronId}`
      } else if (key.includes('spawn')) {
        type = 'task'
        channel = 'terminal'
        const label = key.split('spawn:')[1] || 'subagent'
        summary = `Sub-agent: ${label}`
      } else if (key.includes('telegram')) {
        type = 'message'
        channel = 'telegram'
        summary = 'Telegram conversation'
      } else if (key.includes('discord')) {
        type = 'message'
        channel = 'discord'
        summary = 'Discord conversation'
      } else if (key.includes('imessage')) {
        type = 'message'
        channel = 'imessage'
        summary = 'iMessage conversation'
      } else if (key === 'agent:main:main') {
        type = 'message'
        channel = 'telegram'
        summary = 'Main session (Telegram)'
      } else {
        summary = `Session: ${key}`
      }

      const tokens = sess.totalTokens || ((sess.inputTokens || 0) + (sess.outputTokens || 0))

      entries.push({
        id: sess.sessionId || key,
        timestamp: ts,
        type,
        channel,
        summary,
        status: 'success',
        agentId: key.includes('agent:main') ? 'main' : key.split(':')[1],
        tokensUsed: tokens || undefined,
        details: `Model: ${sess.model || 'unknown'} | Tokens: ${tokens.toLocaleString()}`,
      })
    }
  } catch (err) {
    console.error('Failed to fetch sessions:', err)
  }

  // 2. Get cron job runs
  try {
    const cronData = execJSON('openclaw cron list --json 2>/dev/null') as {
      jobs?: Array<{
        id: string
        name?: string
        enabled: boolean
        schedule?: { kind: string; expr?: string; everyMs?: number }
        lastRunAt?: string
        lastRunStatus?: string
      }>
    } | null

    const jobs = cronData?.jobs ?? []
    for (const job of jobs) {
      if (job.lastRunAt) {
        entries.push({
          id: `cron_${job.id}`,
          timestamp: job.lastRunAt,
          type: 'cron',
          channel: 'cron',
          summary: `Cron: ${job.name || job.id}`,
          status: job.lastRunStatus === 'error' ? 'error' : 'success',
          details: `Schedule: ${job.schedule?.expr || job.schedule?.kind || 'unknown'} | Enabled: ${job.enabled}`,
        })
      }
    }
  } catch {}

  // 3. Read memory files for recent memory events
  try {
    const memoryDir = '/Users/zohairf/clawd/memory'
    const today = new Date().toISOString().slice(0, 10)
    const todayFile = join(memoryDir, `${today}.md`)
    if (existsSync(todayFile)) {
      const content = readFileSync(todayFile, 'utf-8')
      const lines = content.split('\n').filter(l => l.startsWith('## ') || l.startsWith('### '))
      for (let i = 0; i < Math.min(lines.length, 5); i++) {
        entries.push({
          id: `mem_${today}_${i}`,
          timestamp: new Date().toISOString(),
          type: 'memory',
          channel: 'terminal',
          summary: `Memory: ${lines[i].replace(/^#+\s*/, '')}`,
          status: 'success',
          details: `Source: memory/${today}.md`,
        })
      }
    }
  } catch {}

  // Sort by timestamp descending
  entries.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

  // Dedupe
  const seen = new Set<string>()
  const deduped = entries.filter(e => {
    if (seen.has(e.id)) return false
    seen.add(e.id)
    return true
  })

  cachedActivity = deduped
  cacheTimestamp = now
  return deduped
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const type = searchParams.get('type') as ActivityType | null
    const channel = searchParams.get('channel') as ChannelType | null
    const search = searchParams.get('search')?.toLowerCase()
    const page = parseInt(searchParams.get('page') ?? '1')
    const pageSize = parseInt(searchParams.get('pageSize') ?? '25')

    let entries = getSessionActivity()

    if (type) entries = entries.filter(e => e.type === type)
    if (channel) entries = entries.filter(e => e.channel === channel)
    if (search) entries = entries.filter(e =>
      e.summary.toLowerCase().includes(search) ||
      e.type.includes(search) ||
      (e.agentId?.toLowerCase().includes(search) ?? false)
    )

    const total = entries.length
    const start = (page - 1) * pageSize
    const items = entries.slice(start, start + pageSize)

    return NextResponse.json({
      items,
      total,
      page,
      pageSize,
      hasMore: start + pageSize < total,
      timestamp: new Date().toISOString()
    })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Failed to read activity log' }, { status: 500 })
  }
}
