// Activity types
export type ActivityType = 'message' | 'task' | 'cron' | 'heartbeat' | 'memory' | 'tool' | 'error'
export type ActivityStatus = 'success' | 'error' | 'pending' | 'running'
export type ChannelType = 'slack' | 'discord' | 'telegram' | 'imessage' | 'signal' | 'terminal' | 'api' | 'cron' | 'web'

export interface ActivityEntry {
  id: string
  timestamp: string
  type: ActivityType
  channel: ChannelType
  summary: string
  status: ActivityStatus
  details?: string
  agentId?: string
  tokensUsed?: number
  durationMs?: number
}

// Status types
export interface SystemStatus {
  uptime: number // seconds
  version: string
  activeChannels: ChannelType[]
  lastHeartbeat: string
  health: 'healthy' | 'degraded' | 'offline'
  memoryUsageMb: number
  cpuPercent: number
}

// Daily summary types
export interface DailySummary {
  date: string
  messagesHandled: number
  tasksCompleted: number
  filesModified: number
  tokensUsed: number
  subAgentsSpawned: number
  cronJobsRun: number
  errorsEncountered: number
  topActivities: string[]
  hourlyActivity: HourlyActivity[]
}

export interface HourlyActivity {
  hour: number
  messages: number
  tasks: number
  tokens: number
}

// Memory types
export interface MemoryEntry {
  filename: string
  title: string
  content: string
  lastModified: string
  sizeBytes: number
  tags: string[]
}

// Sub-agent types
export type AgentStatus = 'active' | 'idle' | 'offline' | 'error'

export interface SubAgent {
  id: string
  name: string
  description: string
  capabilities: string[]
  status: AgentStatus
  lastUsed: string
  tasksCompleted: number
  successRate: number
  recentTasks: AgentTask[]
}

export interface AgentTask {
  id: string
  timestamp: string
  description: string
  status: ActivityStatus
  durationMs: number
  tokensUsed: number
}

// System / Config types
export interface ChannelHealth {
  channel: ChannelType
  status: 'connected' | 'disconnected' | 'error' | 'unknown'
  lastPing: string
  latencyMs: number
  messagesPerHour: number
}

export interface CronJob {
  id: string
  name: string
  schedule: string
  description: string
  lastRun: string
  nextRun: string
  lastStatus: ActivityStatus
  totalRuns: number
  successRate: number
}

export interface TokenUsageDay {
  date: string
  input: number
  output: number
  total: number
  cost: number
}

export interface SystemConfig {
  agentName: string
  version: string
  environment: string
  timezone: string
  logLevel: string
  maxConcurrentTasks: number
  features: Record<string, boolean>
}

// API response types
export interface ApiResponse<T> {
  data: T
  timestamp: string
  error?: string
}

export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
  hasMore: boolean
}
