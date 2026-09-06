import { useEffect, useMemo, useState } from 'react'
import type { Batch, Project } from './model'
import WorkspaceInfoPopover from './WorkspaceInfoPopover'

type ProjectSidebarProps = {
  projects: Project[]
  batches: Batch[]
  activeProject: number
  onSelectProject: (index: number) => void
  onNewProject: () => void
}

const collapsedPreferenceKey = 'mira-forge.workspace-sidebar-collapsed'

function projectMark(name: string) {
  const words = name.split(/[^a-zA-Z0-9]+/).filter(Boolean)
  if (words.length > 1) return words.slice(0, 2).map((word) => word[0]?.toUpperCase()).join('')
  return (words[0] ?? name).slice(0, 2).toUpperCase()
}

export default function ProjectSidebar({
  projects,
  batches,
  activeProject,
  onSelectProject,
  onNewProject,
}: ProjectSidebarProps) {
  const [collapsed, setCollapsed] = useState(() => (
    typeof window !== 'undefined' && window.localStorage.getItem(collapsedPreferenceKey) === '1'
  ))
  const [infoProjectId, setInfoProjectId] = useState<string | null>(null)

  useEffect(() => {
    window.localStorage.setItem(collapsedPreferenceKey, collapsed ? '1' : '0')
    if (!collapsed) setInfoProjectId(null)
  }, [collapsed])

  const batchCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const batch of batches) counts.set(batch.projectId, (counts.get(batch.projectId) ?? 0) + 1)
    return counts
  }, [batches])

  const infoProject = projects.find((project) => project.id === infoProjectId) ?? null

  function openWorkspace(index: number) {
    const project = projects[index]
    if (!project) return
    onSelectProject(index)
    setInfoProjectId(project.id)
  }

  return (
    <aside
      className={`sidebar ${collapsed ? 'collapsed' : ''}`}
      aria-label="project navigator"
      onKeyDown={(event) => {
        if (event.key === 'Escape' && infoProjectId) {
          event.stopPropagation()
          setInfoProjectId(null)
        }
      }}
    >
      <div className="sidebar-expanded-view">
        <div className="side-title">
          <span>WORKSPACES</span>
          <span className="side-title-actions">
            <span>{projects.length}</span>
            <button
              className="sidebar-toggle"
              type="button"
              aria-label="Collapse workspace sidebar"
              title="Collapse workspace sidebar"
              onClick={() => setCollapsed(true)}
            >−</button>
          </span>
        </div>
        <div className="project-list">
          {projects.map((project, index) => (
            <button
              key={project.id}
              className={`project-item ${index === activeProject ? 'selected' : ''}`}
              onClick={() => onSelectProject(index)}
            >
              <span className="cursor">{index === activeProject ? '›' : ' '}</span>
              <span>
                <strong>{project.name}</strong>
                <small>
                  {project.integrationBranch} · {batchCounts.get(project.id) ?? 0} batches
                </small>
              </span>
            </button>
          ))}
        </div>
        <button className="new-project" onClick={onNewProject}>
          <span>+</span> new project <kbd>n</kbd>
        </button>
        <div className="sidebar-foot"><span>v0.1.0</span><span>state: ~/.mira-forge</span></div>
      </div>

      <div className="sidebar-collapsed-view" aria-label="collapsed workspaces">
        <button
          className="sidebar-rail-toggle"
          type="button"
          aria-label="Expand workspace sidebar"
          title="Expand workspace sidebar"
          onClick={() => setCollapsed(false)}
        >+</button>
        <div className="collapsed-project-list">
          {projects.map((project, index) => (
            <button
              key={project.id}
              type="button"
              className={`collapsed-project-button ${index === activeProject ? 'selected' : ''}`}
              aria-label={`${project.name} workspace`}
              aria-haspopup="dialog"
              aria-expanded={infoProjectId === project.id}
              title={`${project.name} · Enter for workspace info`}
              onClick={() => openWorkspace(index)}
            >
              {projectMark(project.name)}
            </button>
          ))}
        </div>
      </div>

      {collapsed && infoProject && (
        <WorkspaceInfoPopover
          project={infoProject}
          batchCount={batchCounts.get(infoProject.id) ?? 0}
          onClose={() => setInfoProjectId(null)}
        />
      )}
    </aside>
  )
}
