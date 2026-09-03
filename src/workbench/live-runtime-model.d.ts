import type { Batch, Dispatch, MainThread, Review, Session } from './model'

export type LiveRuntimeRow = {
  id: string
  kind: 'main' | 'builder' | 'reviewer' | 'task'
  projectId: string
  threadId: string | null
  sessionId: string | null
  batchId: string | null
  taskId: string | null
  title: string
  provider: string | null
  status: string
  taskStatus: string | null
  externalSessionId: string | null
  startedAt: string | null
  endedAt: string | null
  updatedAt: string
  resultText: string | null
  error: string | null
  detail: string
  active: boolean
  attention: boolean
}

export function formatRuntimeDuration(startedAt: string | null, endedAt: string | null, now?: number): string

export function buildLiveRuntimeRows(input: {
  projectId: string | undefined
  batches: Batch[]
  dispatches: Dispatch[]
  sessions: Session[]
  reviews: Review[]
  threads: MainThread[]
}): LiveRuntimeRow[]
