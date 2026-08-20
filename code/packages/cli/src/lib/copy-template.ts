'use strict'

import { readdir, readFile, writeFile, mkdir, stat } from 'node:fs/promises'
import { join } from 'node:path'

export interface TemplateValues {
  name: string
  title: string
  // The exact version of the CLI binary doing the scaffolding (read from its
  // own package.json — see new.ts) — never a range. A scaffolded site's
  // devDependency on @inditextech/pdocs-cli must match whatever actually
  // generated it, snapshot/local-release versions (0.0.0-local.<sha>.<ts>)
  // included, or npm install has nothing matching to resolve against on a
  // registry that only ever published that one exact version.
  cliVersion: string
}

const PLACEHOLDERS: Record<string, keyof TemplateValues> = {
  __PDOCS_NAME__: 'name',
  __PDOCS_TITLE__: 'title',
  __PDOCS_CLI_VERSION__: 'cliVersion',
}

// `<!-- prettier-ignore -->` directives exist only to stop prettier mangling a
// placeholder token in the template source (e.g. `__PDOCS_TITLE__` inside a
// markdown heading, which double-underscore emphasis would otherwise rewrite
// to `**PDOCS_TITLE**`) — they are not meant to survive into scaffolded
// output, where the placeholder has already been substituted away.
const PRETTIER_IGNORE_LINE = /^<!-- prettier-ignore -->\n/m

function substitute(text: string, values: TemplateValues): string {
  let out = text.replace(PRETTIER_IGNORE_LINE, '')
  for (const [token, key] of Object.entries(PLACEHOLDERS)) {
    out = out.split(token).join(values[key])
  }
  return out
}

// A `.versioned` marker in a template filename (e.g.
// `antora-playbook.versioned.yml` beside `antora-playbook.yml`, or
// `release-version.versioned` for a file with no natural extension to hang a
// mid-name marker off) is a versioning-mode override — see
// `writeTemplateFile`, which reads one explicitly to lay a versioned-mode
// file down under its real name when `pdocs new --mode versioned` is used.
// It must never be copied under its own literal name by the generic walk
// below, standalone or not.
const VERSIONED_MARKER = '.versioned'

// Copies every file under `srcDir` into `destDir`, substituting placeholder
// tokens in each one. Every template file here is plain text (YAML, AsciiDoc,
// JSON), so there is no binary case to special-case, unlike the UI bundle's
// zip packing — see gulp.d/tasks/pack.js for why that distinction matters
// there and does not here.
export async function copyTemplate(srcDir: string, destDir: string, values: TemplateValues): Promise<void> {
  const entries = await readdir(srcDir, { withFileTypes: true })

  await mkdir(destDir, { recursive: true })

  for (const entry of entries) {
    if (entry.name.includes(VERSIONED_MARKER)) continue

    const from = join(srcDir, entry.name)
    const to = join(destDir, entry.name)

    if (entry.isDirectory()) {
      await copyTemplate(from, to, values)
    } else {
      const content = await readFile(from, 'utf8')
      await writeFile(to, substitute(content, values), 'utf8')
    }
  }
}

// Overwrites a single already-copied file with a versioning-mode override —
// used for `antora-playbook.yml` and `docs/.release-version`, whose
// versioned-mode shape (see reference/versioning-modes.md) differs from the
// standalone default copyTemplate above lays down (or, for
// `.release-version`, does not lay down at all). `docs/antora.yml` is NOT
// overridden this way — it is identical for both modes (see
// templates/starter/docs/antora.yml's own comment). Same placeholder
// substitution, just for one file instead of a whole tree.
export async function writeTemplateFile(srcFile: string, destFile: string, values: TemplateValues): Promise<void> {
  const content = await readFile(srcFile, 'utf8')
  await writeFile(destFile, substitute(content, values), 'utf8')
}

export async function isEmptyOrMissing(dir: string): Promise<boolean> {
  try {
    const entries = await readdir(dir)
    return entries.length === 0
  } catch {
    return true
  }
}

export async function exists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}
