import { NextResponse } from 'next/server'
import { execSync } from 'child_process'

let cache: { data: object[]; ts: number } | null = null
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

// Parse channelSummary strings from openclaw status --json:
//   "Telegram: configured"
//   "  - default (token:config)"
//   "Discord: configured"
//   "  - default (token:config)"
//   "iMessage: configured"
//   "  - default"
function buildChannels(statusData: Record<string, unknown> | null) {
  if (!statusData) return []

  const channelSummary = (statusData.channelSummary ?? []) as string[]

  const results: Array<{
    id: string
    name: string
    status: 'connected' | 'disconnected' | 'error' | 'unknown'
    latency: number | null
    lastProbe: string | null
    configured: boolean
    running: boolean
    details: Record<string, unknown>
  }> = []

  let currentChannel: string | null = null
  const accountLines: string[] = []

  const flush = () => {
    if (!currentChannel) return
    results.push({
      id: currentChannel.toLowerCase(),
      name: currentChannel,
      status: 'connected',
      latency: null,
      lastProbe: null,
      configured: true,
      running: true,
      details: { accounts: [...accountLines] },
    })
    accountLines.length = 0
  }

  for (const line of channelSummary) {
    const trimmed = line.trim()
    // Match lines like "Telegram: configured" or "iMessage: configured"
    const channelMatch = trimmed.match(/^(\w[\w\s]*?):\s+configured/)
    if (channelMatch) {
      flush()
      currentChannel = channelMatch[1]
    } else if (currentChannel && trimmed.startsWith('- ')) {
      accountLines.push(trimmed.slice(2))
    }
  }
  flush()

  return results
}

export async function GET() {
  const now = Date.now()
  if (cache && now - cache.ts < CACHE_TTL) {
    return NextResponse.json({ data: cache.data, timestamp: new Date().toISOString(), cached: true })
  }

  try {
    const statusData = runCLI('openclaw status --json')
    const data = buildChannels(statusData)
    cache = { data, ts: now }
    return NextResponse.json({ data, timestamp: new Date().toISOString() })
  } catch {
    if (cache) {
      return NextResponse.json({ data: cache.data, timestamp: new Date().toISOString(), cached: true, stale: true })
    }
    return NextResponse.json({ data: [], timestamp: new Date().toISOString() })
  }
}
