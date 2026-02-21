import { NextRequest, NextResponse } from 'next/server'
import { readFileSync, existsSync, readdirSync } from 'fs'
import { join } from 'path'
import type { DailySummary } from '@/types'

const WORKSPACE_DIR = process.env.OPENCLAW_WORKSPACE || `${process.env.HOME}/.openclaw/workspace`
const MEMORY_DIR = `${WORKSPACE_DIR}/memory`

function parseDailySummary(content: string, date: string): DailySummary {
  const lines = content.split('\n')

  // Extract top-level sections as top activities
  const sections = lines
    .filter(l => l.startsWith('## '))
    .map(l => l.replace(/^## /, '').trim())

  // Count bullet points as a proxy for activity volume
  const bullets = lines.filter(l => l.match(/^- /)).length

  // Count messages/tasks/errors by keyword scanning
  const lower = content.toLowerCase()
  const messagesHandled = (lower.match(/telegram|discord|imessage|message|chat/g) ?? []).length
  const tasksCompleted = (lower.match(/completed|finished|done|fixed|deployed|pushed|committed/g) ?? []).length
  const filesModified = (lower.match(/\.(ts|js|tsx|jsx|py|json|md|css|html)\b/g) ?? []).length
  const cronJobsRun = (lower.match(/cron|schedule|heartbeat/g) ?? []).length
  const subAgentsSpawned = (lower.match(/spawn|sub-agent|subagent|kimi|ollama|delegate/g) ?? []).length
  const errorsEncountered = (lower.match(/error|fail|bug|issue|problem/g) ?? []).length

  // Build hourly activity: estimate from bullet count spread across day
  const hourlyActivity = Array.from({ length: 24 }, (_, h) => ({
    hour: h,
    messages: h >= 9 && h <= 22 ? Math.floor(messagesHandled / 14) : 0,
    tasks: h >= 9 && h <= 22 ? Math.floor(tasksCompleted / 14) : 0,
    tokens: 0,
  }))

  return {
    date,
    messagesHandled: Math.max(messagesHandled, 0),
    tasksCompleted: Math.max(tasksCompleted, 0),
    filesModified: Math.max(filesModified, 0),
    tokensUsed: 0, // not available from markdown
    subAgentsSpawned: Math.max(subAgentsSpawned, 0),
    cronJobsRun: Math.max(cronJobsRun, 0),
    errorsEncountered: Math.max(errorsEncountered, 0),
    topActivities: sections.slice(0, 5),
    hourlyActivity,
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const date = searchParams.get('date') ?? new Date().toISOString().slice(0, 10)

    // Look for YYYY-MM-DD.md in memory dir
    const filePath = join(MEMORY_DIR, `${date}.md`)

    if (!existsSync(filePath)) {
      // Try to find any file for that date (e.g. session files like 2026-02-18-0037.md)
      if (existsSync(MEMORY_DIR)) {
        const sessionFiles = readdirSync(MEMORY_DIR)
          .filter(f => f.startsWith(date) && f.endsWith('.md'))
          .sort()
        if (sessionFiles.length > 0) {
          // Merge all session files for the date
          const combined = sessionFiles
            .map(f => readFileSync(join(MEMORY_DIR, f), 'utf-8'))
            .join('\n\n---\n\n')
          const data = parseDailySummary(combined, date)
          data.topActivities = sessionFiles.map(f => f.replace('.md', ''))
          return NextResponse.json({ data, timestamp: new Date().toISOString() })
        }
      }
      return NextResponse.json({ error: `No data for ${date}` }, { status: 404 })
    }

    const content = readFileSync(filePath, 'utf-8')
    const data = parseDailySummary(content, date)
    return NextResponse.json({ data, timestamp: new Date().toISOString() })
  } catch {
    return NextResponse.json({ error: 'Failed to read daily summary' }, { status: 500 })
  }
}
