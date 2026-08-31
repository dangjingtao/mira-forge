import { realpath, readdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'

function requiredString(value, name) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${name} is required`)
  return value.trim()
}

function singleLine(value, name) {
  const text = requiredString(value, name)
  if (/\r|\n|\|/.test(text)) throw new Error(`${name} must be a single Markdown-table-safe line`)
  return text
}

function taskId(value) {
  const id = requiredString(value, 'taskId')
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(id)) throw new Error('taskId contains unsupported characters')
  return id
}

function repoRef(value, name) {
  const ref = requiredString(value, name)
  if (isAbsolute(ref)) throw new Error(`${name} must be repository-relative`)
  return ref
}

function inside(root, candidate) {
  const rel = relative(root, candidate)
  return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel))
}

function assertInside(root, candidate, name) {
  if (!inside(root, candidate)) throw new Error(`${name} escapes project root`)
}

function toRepoRef(root, path) {
  return relative(root, path).split(sep).join('/')
}

async function configuredPaths(project) {
  const rootInput = requiredString(project?.rootPath, 'project.rootPath')
  const ledgerRef = repoRef(project?.taskLedger, 'project.taskLedger')
  const taskDirRef = repoRef(project?.taskDir, 'project.taskDir')
  const root = await realpath(rootInput).catch((error) => {
    throw new Error(`project root is unavailable: ${error.message}`)
  })

  const ledgerCandidate = resolve(root, ledgerRef)
  const taskDirCandidate = resolve(root, taskDirRef)
  assertInside(root, ledgerCandidate, 'task ledger')
  assertInside(root, taskDirCandidate, 'task directory')

  const ledgerPath = await realpath(ledgerCandidate).catch((error) => {
    throw new Error(`task ledger is unavailable: ${ledgerRef}: ${error.message}`)
  })
  const taskDirPath = await realpath(taskDirCandidate).catch((error) => {
    throw new Error(`task directory is unavailable: ${taskDirRef}: ${error.message}`)
  })
  assertInside(root, ledgerPath, 'task ledger')
  assertInside(root, taskDirPath, 'task directory')

  const [ledgerInfo, taskDirInfo] = await Promise.all([stat(ledgerPath), stat(taskDirPath)])
  if (!ledgerInfo.isFile()) throw new Error(`task ledger is not a file: ${ledgerRef}`)
  if (!taskDirInfo.isDirectory()) throw new Error(`task directory is not a directory: ${taskDirRef}`)

  return { root, ledgerPath, taskDirPath, ledgerRef: toRepoRef(root, ledgerPath), taskDirRef: toRepoRef(root, taskDirPath) }
}

function parseTableRow(line) {
  const trimmed = line.trim()
  if (!trimmed.startsWith('|') || !trimmed.endsWith('|')) return null
  const body = trimmed.slice(1, -1)
  const cells = []
  let current = ''
  let escaped = false
  for (const char of body) {
    if (escaped) {
      current += char === '|' ? '|' : `\\${char}`
      escaped = false
    } else if (char === '\\') {
      escaped = true
    } else if (char === '|') {
      cells.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }
  if (escaped) current += '\\'
  cells.push(current.trim())
  return cells
}

function separatorRow(cells) {
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell))
}

function parseLedger(markdown) {
  const lines = markdown.split(/\r?\n/)
  for (let headerIndex = 0; headerIndex < lines.length - 1; headerIndex += 1) {
    const headers = parseTableRow(lines[headerIndex])
    const separator = parseTableRow(lines[headerIndex + 1])
    if (!headers || !separator || headers.length !== separator.length || !separatorRow(separator)) continue

    const normalized = headers.map((header) => header.toLowerCase())
    const idIndex = normalized.indexOf('id')
    const taskIndex = normalized.indexOf('task')
    const statusIndex = normalized.indexOf('status')
    if (idIndex === -1 || taskIndex === -1 || statusIndex === -1) continue

    const rows = []
    let endIndex = headerIndex + 2
    for (; endIndex < lines.length; endIndex += 1) {
      const cells = parseTableRow(lines[endIndex])
      if (!cells) break
      if (cells.length !== headers.length) throw new Error(`malformed task ledger row at line ${endIndex + 1}`)
      rows.push({ lineIndex: endIndex, cells })
    }
    return { lines, headers, rows, endIndex, idIndex, taskIndex, statusIndex }
  }
  throw new Error('task ledger must contain a Markdown table with ID, Task and Status columns')
}

function ledgerTask(table, id) {
  const matches = table.rows.filter((row) => row.cells[table.idIndex] === id)
  if (matches.length === 0) throw new Error(`task ${id} is not present in repository ledger`)
  if (matches.length > 1) throw new Error(`task ${id} appears more than once in repository ledger`)
  const row = matches[0]
  return {
    row,
    title: requiredString(row.cells[table.taskIndex], `ledger task title for ${id}`),
    status: requiredString(row.cells[table.statusIndex], `ledger task status for ${id}`),
  }
}

function renderTableRow(cells) {
  return `| ${cells.map((cell) => String(cell).trim().replace(/\|/g, '\\|')).join(' | ')} |`
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

async function cardPathForTask(paths, id, { required = true } = {}) {
  const matcher = new RegExp(`^${escapeRegExp(id)}(?:[._-].*)?\\.md$`)
  const entries = await readdir(paths.taskDirPath, { withFileTypes: true })
  const names = entries.filter((entry) => entry.isFile() && matcher.test(entry.name)).map((entry) => entry.name)
  if (names.length === 0) {
    if (required) throw new Error(`task card not found for ${id} under ${paths.taskDirRef}`)
    return null
  }
  if (names.length > 1) throw new Error(`multiple task cards match ${id}: ${names.join(', ')}`)
  const candidate = join(paths.taskDirPath, names[0])
  const actual = await realpath(candidate)
  assertInside(paths.root, actual, 'task card')
  return actual
}

function parseTaskCard(content, expectedId) {
  const heading = content.match(/^#\s+([A-Za-z0-9][A-Za-z0-9._-]*)(?:\s+[—–-]\s+(.+?))?\s*$/m)
  if (!heading) throw new Error(`task card ${expectedId} must contain a level-1 heading with its task ID`)
  if (heading[1] !== expectedId) throw new Error(`task card heading ID ${heading[1]} does not match ${expectedId}`)
  const status = content.match(/^Status:\s*(.+?)\s*$/m)
  if (!status || !status[1].trim()) throw new Error(`task card ${expectedId} must contain a Status line`)
  return { title: heading[2]?.trim() || expectedId, status: status[1].trim() }
}

function replaceTaskCardFields(content, { id, title, status }) {
  let next = content
  if (title !== undefined) {
    const safeTitle = singleLine(title, 'title')
    next = next.replace(/^#\s+[A-Za-z0-9][A-Za-z0-9._-]*(?:\s+[—–-]\s+.*?)?\s*$/m, `# ${id} — ${safeTitle}`)
  }
  if (status !== undefined) {
    const safeStatus = singleLine(status, 'status')
    next = next.replace(/^Status:\s*.+?\s*$/m, `Status: ${safeStatus}`)
  }
  parseTaskCard(next, id)
  return next
}

function normalizeExplicitContent(content, id) {
  const text = requiredString(content, 'content').replace(/\r\n/g, '\n')
  const parsed = parseTaskCard(text, id)
  const title = singleLine(parsed.title, 'title')
  const status = singleLine(parsed.status, 'status')
  return { content: text.endsWith('\n') ? text : `${text}\n`, title, status }
}

function makeTaskCard({ id, title, status, body }) {
  const safeTitle = singleLine(title, 'title')
  const safeStatus = singleLine(status ?? 'TODO', 'status')
  const suffix = typeof body === 'string' && body.trim() ? `\n${body.trim()}\n` : ''
  return `# ${id} — ${safeTitle}\n\nStatus: ${safeStatus}\n${suffix}`
}

function slug(title) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)
}

async function atomicWrite(path, content) {
  const temp = join(dirname(path), `.${basename(path)}.${process.pid}.${Date.now()}.tmp`)
  await writeFile(temp, content, 'utf8')
  await rename(temp, path)
}

async function readLedger(paths) {
  const markdown = await readFile(paths.ledgerPath, 'utf8')
  return { markdown, table: parseLedger(markdown) }
}

function normalizedReference(paths, id, ledger, cardPath, card) {
  const warnings = []
  if (ledger.status !== card.status) warnings.push(`ledger status ${ledger.status} differs from task card status ${card.status}`)
  if (ledger.title !== card.title) warnings.push(`ledger title differs from task card title`)
  return {
    id,
    title: ledger.title,
    status: ledger.status,
    cardStatus: card.status,
    taskRef: toRepoRef(paths.root, cardPath),
    ledgerRef: paths.ledgerRef,
    warnings,
  }
}

export async function inspectRepositoryTaskSource(project) {
  const paths = await configuredPaths(project)
  const { table } = await readLedger(paths)
  return {
    kind: 'repository-markdown',
    ledgerRef: paths.ledgerRef,
    taskDirRef: paths.taskDirRef,
    tasks: table.rows.map((row) => ({
      id: requiredString(row.cells[table.idIndex], 'ledger task id'),
      title: requiredString(row.cells[table.taskIndex], 'ledger task title'),
      status: requiredString(row.cells[table.statusIndex], 'ledger task status'),
    })),
  }
}

export async function resolveRepositoryTask(project, inputTaskId) {
  const id = taskId(inputTaskId)
  const paths = await configuredPaths(project)
  const { table } = await readLedger(paths)
  const ledger = ledgerTask(table, id)
  const cardPath = await cardPathForTask(paths, id)
  const content = await readFile(cardPath, 'utf8')
  const card = parseTaskCard(content, id)
  return normalizedReference(paths, id, ledger, cardPath, card)
}

export async function createRepositoryTask(project, input) {
  const id = taskId(input?.id)
  const paths = await configuredPaths(project)
  const { table } = await readLedger(paths)
  if (table.rows.some((row) => row.cells[table.idIndex] === id)) throw new Error(`task ${id} already exists in repository ledger`)
  if (await cardPathForTask(paths, id, { required: false })) throw new Error(`task card already exists for ${id}`)

  let cardContent
  let title
  let status
  if (input?.content !== undefined) {
    if (input.title !== undefined || input.status !== undefined || input.body !== undefined) {
      throw new Error('content cannot be combined with title, status or body')
    }
    const explicit = normalizeExplicitContent(input.content, id)
    cardContent = explicit.content
    title = explicit.title
    status = explicit.status
  } else {
    title = singleLine(input?.title, 'title')
    status = singleLine(input?.status ?? 'TODO', 'status')
    cardContent = makeTaskCard({ id, title, status, body: input?.body })
  }

  const filenameSlug = slug(title)
  const filename = filenameSlug ? `${id}-${filenameSlug}.md` : `${id}.md`
  const cardPath = join(paths.taskDirPath, filename)
  assertInside(paths.root, cardPath, 'task card')

  const cells = table.headers.map(() => '')
  cells[table.idIndex] = id
  cells[table.taskIndex] = title
  cells[table.statusIndex] = status
  const nextLines = [...table.lines]
  nextLines.splice(table.endIndex, 0, renderTableRow(cells))
  const nextLedger = nextLines.join('\n')

  await atomicWrite(cardPath, cardContent)
  try {
    await atomicWrite(paths.ledgerPath, nextLedger)
  } catch (error) {
    await unlink(cardPath).catch(() => undefined)
    throw error
  }

  return resolveRepositoryTask(project, id)
}

export async function updateRepositoryTask(project, inputTaskId, patch) {
  const id = taskId(inputTaskId)
  const paths = await configuredPaths(project)
  const { table } = await readLedger(paths)
  const ledger = ledgerTask(table, id)
  const cardPath = await cardPathForTask(paths, id)
  const currentCard = await readFile(cardPath, 'utf8')
  parseTaskCard(currentCard, id)

  let nextCard
  let nextTitle
  let nextStatus
  if (patch?.content !== undefined) {
    if (patch.title !== undefined || patch.status !== undefined) throw new Error('content cannot be combined with title or status')
    const explicit = normalizeExplicitContent(patch.content, id)
    nextCard = explicit.content
    nextTitle = explicit.title
    nextStatus = explicit.status
  } else {
    if (patch?.title === undefined && patch?.status === undefined) throw new Error('update requires content, title or status')
    nextCard = replaceTaskCardFields(currentCard, { id, title: patch.title, status: patch.status })
    const parsed = parseTaskCard(nextCard, id)
    nextTitle = parsed.title
    nextStatus = parsed.status
  }

  const cells = [...ledger.row.cells]
  cells[table.taskIndex] = nextTitle
  cells[table.statusIndex] = nextStatus
  const nextLines = [...table.lines]
  nextLines[ledger.row.lineIndex] = renderTableRow(cells)
  const nextLedger = nextLines.join('\n')

  await atomicWrite(cardPath, nextCard)
  try {
    await atomicWrite(paths.ledgerPath, nextLedger)
  } catch (error) {
    await atomicWrite(cardPath, currentCard).catch(() => undefined)
    throw error
  }

  return resolveRepositoryTask(project, id)
}
