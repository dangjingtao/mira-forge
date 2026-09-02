import type { Batch, Project } from './model'

type ProjectSidebarProps = {
  projects: Project[]
  batches: Batch[]
  activeProject: number
  onSelectProject: (index: number) => void
  onNewProject: () => void
}

export default function ProjectSidebar({
  projects,
  batches,
  activeProject,
  onSelectProject,
  onNewProject,
}: ProjectSidebarProps) {
  return (
    <aside className="sidebar" aria-label="project navigator">
      <div className="side-title">WORKSPACES <span>{projects.length}</span></div>
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
                {project.integrationBranch} · {batches.filter((batch) => batch.projectId === project.id).length} batches
              </small>
            </span>
          </button>
        ))}
      </div>
      <button className="new-project" onClick={onNewProject}>
        <span>+</span> new project <kbd>n</kbd>
      </button>
      <div className="sidebar-foot"><span>v0.1.0</span><span>state: ~/.mira-forge</span></div>
    </aside>
  )
}
