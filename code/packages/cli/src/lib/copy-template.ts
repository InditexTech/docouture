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
  // Package-manager-aware bits of the scaffolded workflow templates — see
  // lib/detect-package-manager.ts, whose packageManagerPlan() output this
  // maps to token-for-token. 'npm' is always a safe, working default: these
  // only change what CI caches/runs, never what `pdocs build`/`pdocs dev`
  // themselves shell out to (still npm, regardless — see run-script.ts).
  pmName: string
  pmCacheName: string
  pmLockfile: string
  pmCiCmd: string
  pmSetupStepYaml: string
}

const PLACEHOLDERS: Record<string, keyof TemplateValues> = {
  __PDOCS_NAME__: 'name',
  __PDOCS_TITLE__: 'title',
  __PDOCS_CLI_VERSION__: 'cliVersion',
  __PDOCS_PM__: 'pmName',
  __PDOCS_PM_CACHE__: 'pmCacheName',
  __PDOCS_LOCKFILE__: 'pmLockfile',
  __PDOCS_INSTALL_CI__: 'pmCiCmd',
  // The whole comment line (leading spaces, `#`, trailing newline) is the
  // token here, not just the bare placeholder name — a bare
  // `__PDOCS_PM_SETUP_STEP__` sitting at the start of a YAML line with a
  // step's own `- name: …` right after it on the same line is not valid YAML
  // on its own (before substitution), which is exactly the form these
  // template files are in until `pdocs new` runs — and `just fmt`/prettier
  // parses them as real YAML. A `#`-prefixed placeholder is a comment,
  // valid on any line, so the *template* stays parseable; substituting the
  // whole line (not just the token inside it) is what lets the pnpm-only
  // value (which ends in its own `\n` — see packageManagerPlan) or the
  // empty npm value drop cleanly in its place.
  '      # __PDOCS_PM_SETUP_STEP__\n': 'pmSetupStepYaml',
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

// npm's publish step unconditionally strips any file matching `.git*`
// (.gitignore, .gitattributes, .gitmodules, ...) from a package's tarball,
// regardless of the `files` field or an .npmignore — confirmed here with
// `npm pack --dry-run` on this very package, which silently drops
// templates/starter/.gitignore while every sibling file in that directory
// survives. That means a `.gitignore` template only ever worked when
// `pdocs new` ran from a repo checkout, never from an npm-installed copy —
// the real-world case. The fix (the same one create-react-app's own
// template uses): the template source file has no leading dot at all
// (`gitignore`), and this map renames it back to its real name only at
// write time, after npm has already packed it safely.
const DOTFILE_RENAMES: Record<string, string> = {
  gitignore: '.gitignore',
}

// Extensions copied as raw bytes, no placeholder substitution — logo and
// favicon assets under `supplemental-ui/` (GH-114). Substituting text tokens
// into a binary file via `readFile(from, 'utf8')` corrupts it (the bytes get
// decoded as UTF-8 and re-encoded on write), so these must take a separate,
// non-text path instead of the generic one below.
const BINARY_EXTENSIONS = new Set(['.png', '.ico', '.jpg', '.jpeg', '.gif', '.webp'])

function isBinaryFile(name: string): boolean {
  const dot = name.lastIndexOf('.')
  if (dot === -1) return false
  return BINARY_EXTENSIONS.has(name.slice(dot).toLowerCase())
}

export interface CopyTemplateOptions {
  /**
   * Walk the same tree and return the same paths without touching disk —
   * used by `pdocs upgrade --dry-run` to preview which files a real run
   * would create/overwrite. Directories are still recursed into (their
   * existence on disk is never checked, only the source tree's shape), so
   * the returned list is identical to a real run's.
   */
  dryRun?: boolean
}

// Copies every file under `srcDir` into `destDir`, substituting placeholder
// tokens in each text file. Most template files are plain text (YAML,
// AsciiDoc, JSON) and go through that substitution; image assets
// (BINARY_EXTENSIONS) are copied as raw bytes instead — see its own comment.
// Returns every destination file path written (or, under `dryRun`, that
// would have been written) — `new.ts` ignores this, `upgrade.ts` uses it
// both to report progress and to preview a dry run.
export async function copyTemplate(
  srcDir: string,
  destDir: string,
  values: TemplateValues,
  opts: CopyTemplateOptions = {}
): Promise<string[]> {
  const entries = await readdir(srcDir, { withFileTypes: true })
  const written: string[] = []

  if (!opts.dryRun) {
    await mkdir(destDir, { recursive: true })
  }

  for (const entry of entries) {
    if (entry.name.includes(VERSIONED_MARKER)) continue

    const from = join(srcDir, entry.name)
    const to = join(destDir, DOTFILE_RENAMES[entry.name] ?? entry.name)

    if (entry.isDirectory()) {
      written.push(...(await copyTemplate(from, to, values, opts)))
    } else if (opts.dryRun) {
      written.push(to)
    } else if (isBinaryFile(entry.name)) {
      const content = await readFile(from)
      await writeFile(to, content)
      written.push(to)
    } else {
      const content = await readFile(from, 'utf8')
      await writeFile(to, substitute(content, values), 'utf8')
      written.push(to)
    }
  }

  return written
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
