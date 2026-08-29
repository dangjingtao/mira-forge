import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

export function createEmptyState() {
  return { schemaVersion: 1, projects: [], batches: [], adapters: [], sessions: [], reviews: [] }
}

function normalizeState(parsed) {
  if (parsed?.schemaVersion !== 1 || !Array.isArray(parsed.projects) || !Array.isArray(parsed.batches)) {
    throw new Error('Unsupported or invalid Mira Forge state file')
  }
  for (const field of ['adapters', 'sessions', 'reviews']) {
    if (parsed[field] !== undefined && !Array.isArray(parsed[field])) {
      throw new Error('Unsupported or invalid Mira Forge state file')
    }
  }
  return {
    ...parsed,
    adapters: parsed.adapters ?? [],
    sessions: parsed.sessions ?? [],
    reviews: parsed.reviews ?? [],
  }
}

export function createStore(filePath) {
  let queue = Promise.resolve()

  async function read() {
    try {
      const raw = await readFile(filePath, 'utf8')
      return normalizeState(JSON.parse(raw))
    } catch (error) {
      if (error?.code === 'ENOENT') return createEmptyState()
      throw error
    }
  }

  async function write(state) {
    await mkdir(dirname(filePath), { recursive: true })
    const tempPath = `${filePath}.${process.pid}.tmp`
    await writeFile(tempPath, `${JSON.stringify(state, null, 2)}\n`, 'utf8')
    await rename(tempPath, filePath)
    return state
  }

  function mutate(mutator) {
    const operation = queue.then(async () => {
      const state = await read()
      const result = await mutator(state)
      await write(state)
      return result ?? state
    })
    queue = operation.catch(() => undefined)
    return operation
  }

  return { filePath, read, write, mutate }
}
