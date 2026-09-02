import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { dirname, join, relative } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const srcDir = join(repositoryRoot, 'src')
const stylesDir = join(srcDir, 'styles')

const canonicalStyles = [
  'tokens.css',
  'base.css',
  'shell.css',
  'workbench.css',
  'main-thread.css',
  'overlays.css',
]

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) files.push(...await walk(path))
    if (entry.isFile()) files.push(path)
  }

  return files
}

test('frontend uses one canonical stylesheet tree', async () => {
  const rootEntries = await readdir(srcDir, { withFileTypes: true })
  const rootCss = rootEntries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.css'))
    .map((entry) => entry.name)
    .sort()

  assert.deepEqual(rootCss, [], 'src root must not accumulate stylesheet layers')

  const styleFiles = (await readdir(stylesDir))
    .filter((name) => name.endsWith('.css'))
    .sort()
  const expectedStyleFiles = ['index.css', ...canonicalStyles].sort()
  assert.deepEqual(styleFiles, expectedStyleFiles, 'style files must stay inside the canonical ownership tree')

  const index = await readFile(join(stylesDir, 'index.css'), 'utf8')
  const imports = [...index.matchAll(/@import\s+["']\.\/([^"']+)["']\s*;/g)].map((match) => match[1])
  assert.deepEqual(imports, canonicalStyles, 'index.css must import canonical owners in contract order')
})

test('components do not introduce competing stylesheet imports', async () => {
  const files = (await walk(srcDir)).filter((path) => path.endsWith('.tsx'))
  const cssImports = []

  for (const path of files) {
    const source = await readFile(path, 'utf8')
    for (const match of source.matchAll(/import\s+["']([^"']+\.css)["']/g)) {
      cssImports.push({ file: relative(repositoryRoot, path), importPath: match[1] })
    }
  }

  assert.deepEqual(cssImports, [
    { file: 'src/main.tsx', importPath: './styles/index.css' },
  ])
})
