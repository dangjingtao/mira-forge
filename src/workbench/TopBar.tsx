type TopBarProps = {
  projectName?: string
  connectionError: string
}

export default function TopBar({ projectName, connectionError }: TopBarProps) {
  return (
    <header className="topbar">
      <span className="brand">MIRA FORGE</span>
      <span className="crumb">/ control plane / {projectName ?? 'workspace'}</span>
      <span className={`connection ${connectionError ? 'degraded' : ''}`}>
        <i /> {connectionError ? 'LOCAL · DEGRADED' : 'LOCAL · LIVE'}
      </span>
    </header>
  )
}
