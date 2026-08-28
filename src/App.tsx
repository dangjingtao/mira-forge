import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'

type Project = {
  id: string
  name: string
  rootPath: string
  repository: string | null
  integrationBranch: string
}

type Task = {
  id: string
  title: string
  status: string
  builder: string | null
  reviewRound: number
  dependsOn: string[]
}

type Batch = {
  id: string
  projectId: string
  name: string
  status: string
  tasks: Task[]
}

type ForgeState = {
  schemaVersion: number
  projects: Project[]
  batches: Batch[]
}

const statusLabels: Record<string, string> = {
  waiting: '等待',
  building: '施工中',
  reviewing: '评审中',
  fixing: '整改中',
  waiting_integration: '待集成',
  interrupted: '已中断',
  stale: '已失效',
  review_passed: '评审通过',
  integrated: '已集成',
}

function App() {
  const [state, setState] = useState<ForgeState | null>(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/state')
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      setState(await response.json())
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }, [])

  useEffect(() => {
    void load()
    const timer = window.setInterval(() => void load(), 2000)
    return () => window.clearInterval(timer)
  }, [load])

  const taskStats = useMemo(() => {
    const tasks = state?.batches.flatMap((batch) => batch.tasks) ?? []
    return {
      total: tasks.length,
      active: tasks.filter((task) => ['building', 'fixing'].includes(task.status)).length,
      reviewing: tasks.filter((task) => task.status === 'reviewing').length,
      passed: tasks.filter((task) => ['review_passed', 'waiting_integration', 'integrated'].includes(task.status)).length,
    }
  }, [state])

  async function register(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setSaving(true)
    try {
      const response = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: form.get('name'),
          rootPath: form.get('rootPath'),
          repository: form.get('repository'),
          integrationBranch: form.get('integrationBranch'),
        }),
      })
      if (!response.ok) {
        const body = await response.json()
        throw new Error(body.message || `HTTP ${response.status}`)
      }
      event.currentTarget.reset()
      await load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="shell">
      <header className="hero">
        <div>
          <p className="eyebrow">LOCAL AI ENGINEERING ORCHESTRATOR</p>
          <h1>Mira Forge</h1>
          <p className="lede">一个全局本地的 AI 工程调度室。项目可以很多，施工工具可以很多，工程状态只有一份。</p>
        </div>
        <button className="ghost" onClick={() => void load()}>刷新</button>
      </header>

      {error && <div className="notice">连接控制服务失败：{error}</div>}

      <section className="metrics" aria-label="施工概况">
        <Metric label="项目" value={state?.projects.length ?? 0} />
        <Metric label="任务" value={taskStats.total} />
        <Metric label="施工" value={taskStats.active} />
        <Metric label="评审" value={taskStats.reviewing} />
        <Metric label="通过" value={taskStats.passed} />
      </section>

      <section className="panel register-panel">
        <div>
          <p className="section-kicker">PROJECT REGISTRY</p>
          <h2>注册本地项目</h2>
          <p>这里只保存 Forge 的运行入口，不复制项目里的任务事实。</p>
        </div>
        <form onSubmit={register}>
          <input name="name" placeholder="项目名，例如 Com Design Prototype" required />
          <input name="rootPath" placeholder="本地路径，例如 /Users/tomz/code/project" required />
          <input name="repository" placeholder="GitHub 仓库（可选）" />
          <input name="integrationBranch" placeholder="集成分支" defaultValue="dev" />
          <button type="submit" disabled={saving}>{saving ? '注册中…' : '注册项目'}</button>
        </form>
      </section>

      <section className="projects">
        {(state?.projects ?? []).map((project) => {
          const batches = state?.batches.filter((batch) => batch.projectId === project.id) ?? []
          return (
            <article className="panel project" key={project.id}>
              <div className="project-head">
                <div>
                  <p className="section-kicker">{project.integrationBranch}</p>
                  <h2>{project.name}</h2>
                  <code>{project.rootPath}</code>
                </div>
                <span className="count">{batches.length} batches</span>
              </div>

              {batches.length === 0 ? (
                <div className="empty">还没有 Batch。下一波接入 Dispatch 后，这里会自动出现施工波次。</div>
              ) : batches.map((batch) => (
                <div className="batch" key={batch.id}>
                  <div className="batch-title"><strong>{batch.name}</strong><span>{batch.status}</span></div>
                  <div className="task-list">
                    {batch.tasks.map((task) => <TaskRow key={task.id} task={task} />)}
                  </div>
                </div>
              ))}
            </article>
          )
        })}

        {state && state.projects.length === 0 && (
          <div className="panel empty big-empty">
            <strong>工地还是空的。</strong>
            <span>先注册一个本地项目。之后 Dispatch / OpenCode / Codex 都只更新这里的运行状态。</span>
          </div>
        )}
      </section>
    </main>
  )
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="metric"><span>{label}</span><strong>{value}</strong></div>
}

function TaskRow({ task }: { task: Task }) {
  const label = statusLabels[task.status] || task.status
  return (
    <div className="task-row">
      <div className={`dot dot-${task.status}`} />
      <strong>{task.id}</strong>
      <span className="task-title">{task.title}</span>
      <span>{task.builder || '—'}</span>
      {task.reviewRound > 0 && <span>Review #{task.reviewRound}</span>}
      <span className="status">{label}</span>
    </div>
  )
}

export default App
