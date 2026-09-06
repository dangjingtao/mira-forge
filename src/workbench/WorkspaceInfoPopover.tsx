import type { Project } from './model'

type WorkspaceInfoPopoverProps = {
  project: Project
  batchCount: number
  onClose: () => void
}

export default function WorkspaceInfoPopover({ project, batchCount, onClose }: WorkspaceInfoPopoverProps) {
  return (
    <section className="workspace-info-popover" role="dialog" aria-label={`${project.name} workspace information`}>
      <div className="workspace-info-head">
        <strong>{project.name}</strong>
        <button type="button" onClick={onClose} aria-label="Close workspace information">×</button>
      </div>
      <dl>
        <div><dt>branch</dt><dd>{project.integrationBranch}</dd></div>
        <div><dt>batches</dt><dd>{batchCount}</dd></div>
        <div><dt>root</dt><dd title={project.rootPath}>{project.rootPath}</dd></div>
        {project.repository && <div><dt>repo</dt><dd title={project.repository}>{project.repository}</dd></div>}
      </dl>
    </section>
  )
}
