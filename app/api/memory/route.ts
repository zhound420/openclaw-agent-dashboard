import { NextRequest, NextResponse } from 'next/server'
import { readFileSync, existsSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import type { MemoryEntry } from '@/types'

const WORKSPACE_DIR = process.env.OPENCLAW_WORKSPACE || `${process.env.HOME}/.openclaw/workspace`
const MEMORY_DIR = `${WORKSPACE_DIR}/memory`
const MEMORY_MAIN = `${WORKSPACE_DIR}/MEMORY.md`

function extractTitle(content: string, filename: string): string {
  const h1 = content.match(/^# (.+)/m)
  if (h1) return h1[1].trim()
  return filename.replace(/\.md$/, '')
}

function extractTags(content: string): string[] {
  // Extract ## headings as tags (up to 5)
  const headings = [...content.matchAll(/^## (.+)/gm)].map(m => m[1].trim().toLowerCase().replace(/\s+/g, '-'))
  return headings.slice(0, 5)
}

function readMemoryFile(filePath: string, filename: string): MemoryEntry | null {
  try {
    const stat = statSync(filePath)
    const content = readFileSync(filePath, 'utf-8')
    return {
      filename,
      title: extractTitle(content, filename),
      content,
      lastModified: stat.mtime.toISOString(),
      sizeBytes: stat.size,
      tags: extractTags(content),
    }
  } catch {
    return null
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const search = searchParams.get('search')?.toLowerCase()

    const entries: MemoryEntry[] = []

    // 1. Read main MEMORY.md
    if (existsSync(MEMORY_MAIN)) {
      const entry = readMemoryFile(MEMORY_MAIN, 'MEMORY.md')
      if (entry) entries.push(entry)
    }

    // 2. Read all .md files from memory/
    if (existsSync(MEMORY_DIR)) {
      const files = readdirSync(MEMORY_DIR)
        .filter(f => f.endsWith('.md'))
        .sort()
        .reverse() // newest first
      for (const file of files) {
        const entry = readMemoryFile(join(MEMORY_DIR, file), file)
        if (entry) entries.push(entry)
      }
    }

    // Filter by search
    let filtered = entries
    if (search) {
      filtered = entries.filter(e =>
        e.filename.toLowerCase().includes(search) ||
        e.title.toLowerCase().includes(search) ||
        e.content.toLowerCase().includes(search) ||
        e.tags.some(t => t.includes(search))
      )
    }

    const totalSizeBytes = filtered.reduce((sum, e) => sum + e.sizeBytes, 0)
    const lastConsolidated = entries.length > 0
      ? entries.reduce((latest, e) => e.lastModified > latest ? e.lastModified : latest, entries[0].lastModified)
      : null

    return NextResponse.json({
      entries: filtered,
      totalSizeBytes,
      lastConsolidated,
      timestamp: new Date().toISOString()
    })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Failed to read memory' }, { status: 500 })
  }
}
