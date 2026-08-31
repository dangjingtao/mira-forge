import { FormEvent, useEffect, useState } from 'react'
import './acceptance.css'

type AcceptanceResult = {
  ok: boolean
  status: 'passed' | 'failed'
  durationMs: number
  adapterId: string
  externalSessionId: string | null
  pid: number | null
  exitCode: number | null
  markerVerified: boolean
  resultText: string | null
  error: string | null
  diagnostic: string | null
  workspaceDisposable: boolean
}

const backgroundShortcuts = new Set(['j', 'k', 'r', 'n', '/', 'q', 'd', 'x', 'a', 'ArrowDown', 'ArrowUp'])

function FirstRunCheck() {
  const [open, setOpen] = useState(false)
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<AcceptanceResult | null>(null)
  const [requestError, setRequestError] = useState('')

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement
      const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)

      if (open) {
        if (event.key === 'Escape' && !running) {
          event.preventDefault()
          event.stopImmediatePropagation()
          setOpen(false)
          return
        }
        if (!typing && backgroundShortcuts.has(event.key)) {
          event.preventDefault()
          event.stopImmediatePropagation()
          return
        }
        return
      }

      if (!typing && event.key === 'a') {
        event.preventDefault()
        event.stopImmediatePropagation()
        setOpen(true)
        setRequestError('')
      }
    }

    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open, running])

  async function runCheck(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setRunning(true)
    setResult(null)
    setRequestError('')
    try {
      const response = await fetch('/api/acceptance/opencode', { method: 'POST' })
      const body = await response.json()
      if (!response.ok) throw new Error(body?.message || `HTTP ${response.status}`)
      setResult(body as AcceptanceResult)
    } catch (cause) {
      setRequestError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setRunning(false)
    }
  }

  return (
    <>
      <button className="acceptance-trigger" type="button" onClick={() => setOpen(true)} title="OpenCode first-run check (a)">
        <kbd>a</kbd> first-run check
      </button>

      {open && (
        <div className="modal-backdrop acceptance-backdrop" onMouseDown={(event) => {
          if (!running && event.target === event.currentTarget) setOpen(false)
        }}>
          <form className="acceptance-modal" onSubmit={runCheck}>
            <div className="modal-title">FIRST-RUN CHECK <kbd>esc</kbd></div>

            <div className="acceptance-copy">
              <strong>Verify real local OpenCode</strong>
              <p>Forge creates a disposable temp workspace, runs the real <code>opencode</code> once, verifies session binding and a marker file, then removes the workspace.</p>
              <p className="acceptance-safe">No registered project is touched. No Batch or task is created.</p>
            </div>

            {running && (
              <div className="acceptance-running" aria-live="polite">
                <span className="acceptance-spinner">›</span>
                <div><strong>checking opencode-local…</strong><small>This may take a little while on the first model call.</small></div>
              </div>
            )}

            {requestError && <div className="acceptance-result acceptance-fail"><strong>REQUEST FAILED</strong><span>{requestError}</span></div>}

            {result && (
              <div className={`acceptance-result ${result.ok ? 'acceptance-pass' : 'acceptance-fail'}`} aria-live="polite">
                <strong>{result.ok ? 'PASS' : 'FAIL'}</strong>
                <span>{result.ok ? 'OpenCode is ready for Forge dispatch.' : result.error}</span>
                {!result.ok && result.diagnostic && <details className="acceptance-diagnostic"><summary>View diagnostic details</summary><pre>{result.diagnostic}</pre></details>}
                <dl>
                  <div><dt>session</dt><dd>{result.externalSessionId ?? 'not observed'}</dd></div>
                  <div><dt>exit</dt><dd>{result.exitCode ?? '—'}</dd></div>
                  <div><dt>marker</dt><dd>{result.markerVerified ? 'verified' : 'missing'}</dd></div>
                  <div><dt>time</dt><dd>{(result.durationMs / 1000).toFixed(1)}s</dd></div>
                </dl>
              </div>
            )}

            <button type="submit" disabled={running}>
              {running ? 'running check…' : result ? 'run again  ↵' : 'run check  ↵'}
            </button>
            <button className="acceptance-close" type="button" disabled={running} onClick={() => setOpen(false)}>close</button>
          </form>
        </div>
      )}
    </>
  )
}

export default FirstRunCheck
