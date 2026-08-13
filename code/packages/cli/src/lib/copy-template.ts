'use strict'

import { readdir, readFile, writeFile, mkdir, stat } from 'node:fs/promises'
import { join } from 'node:path'

export interface TemplateValues {
  name: string
  title: string
}

const PLACEHOLDERS: Record<string, keyof TemplateValues> = {
  __PDOCS_NAME__: 'name',
  __PDOCS_TITLE__: 'title',
}

function substitute(text: string, values: TemplateValues): string {
  let out = text
  for (const [token, key] of Object.entries(PLACEHOLDERS)) {
    out = out.split(token).join(values[key])
  }
  return out
}

// Copies every file under `srcDir` into `destDir`, substituting placeholder
// tokens in each one. Every template file here is plain text (YAML, AsciiDoc,
// JSON), so there is no binary case to special-case, unlike the UI bundle's
// zip packing — see gulp.d/tasks/pack.js for why that distinction matters
// there and does not here.
export async function copyTemplate(srcDir: string, destDir: string, values: TemplateValues): Promise<void> {
  const entries = await readdir(srcDir, { withFileTypes: true })

  await mkdir(destDir, { recursive: true })

  for (const entry of entries) {
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
