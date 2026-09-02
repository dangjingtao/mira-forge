export type Project = {
  id: string
  name: string
  rootPath: string
  repository: string | null
  integrationBranch: string
  taskLedger?: string | null
  taskDir?: string | null
}

export type Task = {
  id: string
  title: string
  status: string
  builder: string | null
  reviewRound: number
}

export type Batch = {
  id: string
  projectId: string
  name: string
  status: string
  tasks: Task[]
}

export type Dispatch = {
  id: string
  projectId: string
  batchId: string
  taskId: string
  adapterId: string
  sessionId: string
  status: string
  externalSessionId: string | null
  pid: number | null
  error: string | null
  resultText: string | null
  createdAt: string
  updatedAt: string
}

export type RuntimeEvent = {
  id: string
  type: string
  projectId: string | null
  batchId: string | null
  taskId: string | null
  dispatchId: string | null
  sessionId: string | null
  data: Record<string, unknown>
  createdAt: string
}

export type ForgeState = {
  schemaVersion: number
  projects: Project[]
  batches: Batch[]
  dispatches?: Dispatch[]
  events?: RuntimeEvent[]
}

export type ForgeMeta = {
  builderChoices?: string[]
}

export type RepositoryTask = {
  id: string
  title: string
  status: string
}

export type RepositoryTaskSource = {
  kind: string
  ledgerRef: string
  taskDirRef: string
  tasks: RepositoryTask[]
}

export type ResolvedRepositoryTask = RepositoryTask & {
  cardStatus: string
  taskRef: string
  ledgerRef: string
  warnings: string[]
}

export type SelectedTask = {
  batch: Batch
  task: Task
}

export type DispatchDraft = SelectedTask & {
  taskRef: string
}

export type DispatchReadiness = {
  ready: Array<{ taskId: string }>
  blocked: Array<{ taskId: string; reasons: Array<{ code: string }> }>
}

export type WorkbenchStats = {
  total: number
  active: number
  reviewing: number
  passed: number
}

export const statusLabels: Record<string, string> = {
  waiting: 'waiting',
  building: 'building',
  reviewing: 'reviewing',
  fixing: 'fixing',
  waiting_integration: 'waiting integration',
  interrupted: 'interrupted',
  stale: 'stale',
  review_passed: 'review passed',
  integrated: 'integrated',
}

export const builderLabels: Record<string, string> = {
  opencode: 'OpenCode',
  piagent: 'PiAgent',
  codex: 'Codex',
}

export const activeDispatchStatuses = new Set(['starting', 'running'])

export function taskKey(batchId: string, taskId: string) {
  return `${batchId}:${taskId}`
}

export function parseErrorBody(body: unknown, fallback: string) {
  if (body && typeof body === 'object' && 'message' in body && typeof body.message === 'string') return body.message
  return fallback
}

export function formatTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '--:--:--'
  return date.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export function formatEventData(event: RuntimeEvent) {
  const parts: string[] = []
  const { data } = event
  if (data.externalSessionId) parts.push(`session ${String(data.externalSessionId)}`)
  if (data.pid !== undefined && data.pid !== null) parts.push(`pid ${String(data.pid)}`)
  if (data.exitCode !== undefined && data.exitCode !== null) parts.push(`exit ${String(data.exitCode)}`)
  if (data.reason) parts.push(String(data.reason))
  if (data.message) parts.push(String(data.message))
  return parts.join(' · ')
}
