import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import './main-thread.css'

type MainThreadAdapter = 'opencode' | 'codex-desktop' | 'codex'

type Project = {
  id: string
  name: string
}

type MainThread = {
  id: string
  projectId: string
  adapter: MainThreadAdapter
  title: string
  model: string | null
  status: string
  externalThreadId: string | null
  lastError: string | null
  createdAt: string
  updatedAt: string
}

type ThreadEvent = {
  id: string
  type: 'message' | 'thinking' | 'tool' | 'status' | 'artifact' | 'handoff'
  role: string | null
  text: string | null
  tool: { name: string; status: string | null } | null
  artifact: { kind: string; ref: string | null } | null
  handoff: {
    projectId: string
    taskId: string
    taskRef: string
    preferredBuilder: string
  } | null
  createdAt: string
}

type ThreadSnapshot = {
  thread: MainThread
  events: ThreadEvent[]
}

type ThreadTurn = {
  id: string
  user: ThreadEvent
  process: ThreadEvent[]
  assistant: ThreadEvent | null
  complete: boolean
}

type TimelineEntry =
  | { kind: 'turn'; turn: ThreadTurn }
  | { kind: 'event'; event: ThreadEvent }

function parseErrorBody(body: unknown, fallback: string) {
  if (body && typeof body === 'object' && 'message' in body && typeof body.message === 'string') return body.message
  return fallback
}

function eventLabel(event: ThreadEvent) {
  if (event.type === 'message') return event.role || 'message'
  if (event.type === 'thinking') return 'thinking'
  if (event.type === 'tool') return event.tool?.name || 'tool'
  if (event.type === 'artifact') return event.artifact?.kind || 'artifact'
  if (event.type === 'handoff') return `handoff · ${event.handoff?.taskId || 'task'}`
  return event.text || 'status'
}

function eventTone(event: ThreadEvent) {
  if (event.type !== 'status' || !event.text) return ''
  if (event.text.startsWith('turn.completed')) return 'tone-success'
  if (event.text.startsWith('turn.failed') || event.text.startsWith('turn.interrupted')) return 'tone-error'
  if (event.text.includes('running') || event.text.includes('started')) return 'tone-running'
  return ''
}

function isTerminalStatus(event: ThreadEvent) {
  return event.type === 'status'
    && Boolean(event.text && (
      event.text.startsWith('turn.completed')
      || event.text.startsWith('turn.failed')
      || event.text.startsWith('turn.interrupted')
    ))
}

function buildTimeline(events: ThreadEvent[]) {
  const timeline: TimelineEntry[] = []
  let current: ThreadTurn | null = null

  for (const event of events) {
    if (event.type === 'message' && event.role === 'user') {
      current = {
        id: event.id,
        user: event,
        process: [],
        assistant: null,
        complete: false,
      }
      timeline.push({ kind: 'turn', turn: current })
      continue
    }

    if (!current) {
      timeline.push({ kind: 'event', event })
      continue
    }

    if (event.type === 'message' && event.role === 'assistant') {
      current.assistant = event
      continue
    }

    current.process.push(event)
    if (isTerminalStatus(event)) {
      current.complete = true
      current = null
    }
  }

  return timeline
}

function ThreadEventView({ event }: { event: ThreadEvent }) {
  return (
    <div className={`main-thread-event event-${event.type} role-${event.role || 'system'} ${eventTone(event)}`}>
      <span>{eventLabel(event)}</span>
      {(event.type === 'message' || event.type === 'thinking') && <p>{event.text}</p>}
      {event.type === 'handoff' && event.handoff && (
        <p>{event.handoff.taskRef} → {event.handoff.preferredBuilder}</p>
      )}
      {event.type === 'artifact' && event.artifact?.ref && <p>{event.artifact.ref}</p>}
      {event.type === 'tool' && <p>{event.tool?.status || 'running'}</p>}
      {event.type === 'status' && <p>{event.text}</p>}
    </div>
  )
}

function MainThreadPanel() {
  const [collapsed, setCollapsed] = useState(false)
  const [projects, setProjects] = useState<Project[]>([])
  const [projectId, setProjectId] = useState('')
  const [threads, setThreads] = useState<MainThread[]>([])
  const [threadId, setThreadId] = useState('')
  const [snapshot, setSnapshot] = useState<ThreadSnapshot | null>(null)
  const [adapter, setAdapter] = useState<MainThreadAdapter>('opencode')
  const [model, setModel] = useState('')
  const [draft, setDraft] = useState('')
  const [creating, setCreating] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  const loadProjects = useCallback(async () => {
    const response = await fetch('/api/projects')
    const body = await response.json()
    if (!response.ok) throw new Error(parseErrorBody(body, `HTTP ${response.status}`))
    const next = body as Project[]
    setProjects(next)
    setProjectId((current) => current && next.some((project) => project.id === current)
      ? current
      : next[0]?.id || '')
  }, [])

  const loadThreads = useCallback(async (activeProjectId: string) => {
    if (!activeProjectId) {
      setThreads([])
      setThreadId('')
      return
    }
    const response = await fetch(`/api/threads?projectId=${encodeURIComponent(activeProjectId)}`)
    const body = await response.json()
    if (!response.ok) throw new Error(parseErrorBody(body, `HTTP ${response.status}`))
    const next = body as MainThread[]
    setThreads(next)
    setThreadId((current) => current && next.some((thread) => thread.id === current)
      ? current
      : next.at(-1)?.id || '')
  }, [])

  const loadSnapshot = useCallback(async (activeThreadId: string) => {
    if (!activeThreadId) {
      setSnapshot(null)
      return
    }
    const response = await fetch(`/api/threads/${encodeURIComponent(activeThreadId)}`)
    const body = await response.json()
    if (!response.ok) throw new Error(parseErrorBody(body, `HTTP ${response.status}`))
    setSnapshot(body as ThreadSnapshot)
  }, [])

  useEffect(() => {
    void loadProjects().catch((cause) => setError(cause instanceof Error ? cause.message : String(cause)))
  }, [loadProjects])

  useEffect(() => {
    void loadThreads(projectId).catch((cause) => setError(cause instanceof Error ? cause.message : String(cause)))
  }, [loadThreads, projectId])

  useEffect(() => {
    void loadSnapshot(threadId).catch((cause) => setError(cause instanceof Error ? cause.message : String(cause)))
    if (!threadId) return
    const live = sending || snapshot?.thread.status === 'running'
    const timer = window.setInterval(() => {
      void loadSnapshot(threadId).catch(() => undefined)
    }, live ? 450 : 2500)
    return () => window.clearInterval(timer)
  }, [loadSnapshot, sending, snapshot?.thread.status, threadId])

  const visibleEvents = useMemo(() => snapshot?.events.slice(-100) ?? [], [snapshot?.events])
  const timeline = useMemo(() => buildTimeline(visibleEvents), [visibleEvents])
  const threadAdapter = snapshot?.thread.adapter ?? adapter
  const threadStatus = snapshot?.thread.status ?? (threadId ? 'loading' : 'ready')

  async function createThread(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!projectId) return
    setCreating(true)
    try {
      const response = await fetch('/api/threads', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          projectId,
          adapter,
          model: model.trim() || undefined,
        }),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(parseErrorBody(body, `HTTP ${response.status}`))
      const created = body as MainThread
      await loadThreads(projectId)
      setThreadId(created.id)
      setModel('')
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setCreating(false)
    }
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!threadId) return
    const message = draft.trim()
    if (!message) return

    setDraft('')
    setSending(true)
    try {
      const response = await fetch(`/api/threads/${encodeURIComponent(threadId)}/messages`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message }),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(parseErrorBody(body, `HTTP ${response.status}`))
      setSnapshot(body as ThreadSnapshot)
      setError('')
    } catch (cause) {
      setDraft(message)
      setError(cause instanceof Error ? cause.message : String(cause))
      await loadSnapshot(threadId).catch(() => undefined)
    } finally {
      setSending(false)
    }
  }

  return (
    <section className={`main-thread-panel ${collapsed ? 'collapsed' : ''}`} aria-label="main thread">
      <header className="main-thread-head">
        <div className="main-thread-headline">
          <strong>MAIN THREAD</strong>
          <span className="main-thread-head-separator" aria-hidden="true">·</span>
          <span className="main-thread-adapter">{threadAdapter}</span>
          <span className="main-thread-head-separator" aria-hidden="true">·</span>
          <span className={`main-thread-status status-${threadStatus}`}>{threadStatus}</span>
        </div>
        <button type="button" onClick={() => setCollapsed((value) => !value)} aria-label={collapsed ? 'Expand main thread' : 'Collapse main thread'}>
          {collapsed ? '+' : '−'}
        </button>
      </header>

      {!collapsed && (
        <>
          <div className="main-thread-controls">
            <select value={projectId} onChange={(event) => setProjectId(event.target.value)} aria-label="main thread project">
              {projects.length === 0 && <option value="">no project</option>}
              {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
            </select>
            <select value={threadId} onChange={(event) => setThreadId(event.target.value)} aria-label="main thread session">
              <option value="">new thread</option>
              {threads.map((thread) => (
                <option key={thread.id} value={thread.id}>
                  {thread.adapter} · {thread.title}
                </option>
              ))}
            </select>
          </div>

          {!threadId && projectId && (
            <form className="main-thread-create" onSubmit={createThread}>
              <select value={adapter} onChange={(event) => setAdapter(event.target.value as MainThreadAdapter)}>
                <option value="opencode">OpenCode</option>
                <option value="codex-desktop">Codex Desktop</option>
                <option value="codex">Codex CLI</option>
              </select>
              <input value={model} onChange={(event) => setModel(event.target.value)} placeholder="model · optional" />
              <button type="submit" disabled={creating}>{creating ? 'opening…' : 'open thread'}</button>
            </form>
          )}

          <div className="main-thread-stream" aria-live="polite">
            {timeline.length === 0 ? (
              <div className="main-thread-empty">Open a durable main thread to discuss, inspect and plan this project.</div>
            ) : timeline.map((entry) => {
              if (entry.kind === 'event') return <ThreadEventView event={entry.event} key={entry.event.id} />
              const { turn } = entry
              return (
                <div className="main-thread-turn" key={turn.id}>
                  <ThreadEventView event={turn.user} />
                  {turn.process.length > 0 && (
                    <details className="main-thread-process" open={!turn.complete}>
                      <summary>{turn.complete ? `process · ${turn.process.length}` : 'thinking / execution…'}</summary>
                      <div>
                        {turn.process.map((processEvent) => <ThreadEventView event={processEvent} key={processEvent.id} />)}
                      </div>
                    </details>
                  )}
                  {turn.assistant && <ThreadEventView event={turn.assistant} />}
                </div>
              )
            })}
          </div>

          {error && <div className="main-thread-error">! {error}</div>}

          <form className="main-thread-compose" onSubmit={sendMessage}>
            <textarea
              name="message"
              rows={2}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && event.ctrlKey) {
                  event.preventDefault()
                  event.currentTarget.form?.requestSubmit()
                }
              }}
              placeholder={threadId ? 'Message the main thread… · Ctrl+Enter to send' : 'Open a thread first'}
              disabled={!threadId || sending || snapshot?.thread.status === 'running'}
              required
            />
            <button
              type="submit"
              title="Send · Ctrl+Enter"
              disabled={!threadId || sending || snapshot?.thread.status === 'running'}
            >
              {sending || snapshot?.thread.status === 'running' ? 'running…' : 'send ^↵'}
            </button>
          </form>
        </>
      )}
    </section>
  )
}

export default MainThreadPanel
