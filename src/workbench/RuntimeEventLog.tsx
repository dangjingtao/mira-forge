import type { RuntimeEvent } from './model'
import { formatEventData, formatTime } from './model'

type RuntimeEventLogProps = {
  events: RuntimeEvent[]
}

export default function RuntimeEventLog({ events }: RuntimeEventLogProps) {
  if (!events.length) return null

  return (
    <div className="event-log" aria-label="runtime events">
      <div className="event-log-title">EVENT LOG <span>latest {Math.min(events.length, 30)}</span></div>
      {[...events].slice(-30).reverse().map((event) => (
        <div className={`runtime-event event-${event.type.split('.').at(-1)}`} key={event.id}>
          <time>{formatTime(event.createdAt)}</time>
          <span className="event-task">{event.taskId ?? '—'}</span>
          <strong>{event.type}</strong>
          <span className="event-detail">{formatEventData(event)}</span>
        </div>
      ))}
    </div>
  )
}
