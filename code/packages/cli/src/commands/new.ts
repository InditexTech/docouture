'use strict'

import { execFileSync } from 'node:child_process'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { parseArgs } from '../lib/args.js'
import { copyTemplate, exists, isEmptyOrMissing } from '../lib/copy-template.js'

// Matches the rule an npm package name (and, not coincidentally, an Antora
// component name — both end up as URL segments) can safely be: this is
// stricter than npm's own rule, which also allows dots and a leading `@scope/`
// that makes no sense for a directory name here.
const NAME_PATTERN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/

function titleCase(name: string): string {
  return name
    .split('-')
    .filter(Boolean)
    .map((word) => word[0]!.toUpperCase() + word.slice(1))
    .join(' ')
}

function isInsideGitWorkTree(dir: string): boolean {
  try {
    execFileSync('git', ['rev-parse', '--is-inside-work-tree'], { cwd: dir, stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

export async function runNew(argv: string[]): Promise<number> {
  const { positional, flags } = parseArgs(argv)
  const name = positional[0]

  if (!name) {
    console.error('usage: pdocs new <name> [--dir <path>] [--title <title>]')
    return 1
  }

  if (!NAME_PATTERN.test(name)) {
    console.error(`invalid name: '${name}'`)
    console.error('expected lowercase letters, digits and hyphens, e.g. my-project-docs')
    return 1
  }

  const title = typeof flags.title === 'string' ? flags.title : titleCase(name)
  const target = typeof flags.dir === 'string' ? resolve(flags.dir) : resolve(process.cwd(), name)

  if ((await exists(target)) && !(await isEmptyOrMissing(target))) {
    console.error(`'${target}' already exists and is not empty`)
    return 1
  }

  // build/commands/new.js -> build/templates/starter — see
  // scripts/copy-templates.mjs, which puts the templates/ directory here at
  // build time. Resolved from import.meta.url so this works regardless of
  // the directory pdocs is invoked from.
  const here = dirname(fileURLToPath(import.meta.url))
  const templateDir = join(here, '..', 'templates', 'starter')

  await copyTemplate(templateDir, target, { name, title })

  // A repository with no commits makes every Antora content source resolve
  // to nothing — the exact zero-pages failure this project's own README
  // documents. Committing here means `pdocs new` never hands someone that
  // surprise on their first build. Skipped entirely if the new directory
  // already lives inside a git work tree: nesting a second repository inside
  // the first would be the wrong fix for the same problem.
  const parentIsRepo = isInsideGitWorkTree(dirname(target))
  if (!parentIsRepo) {
    try {
      execFileSync('git', ['init', '--quiet'], { cwd: target, stdio: 'ignore' })
      execFileSync('git', ['add', '-A'], { cwd: target, stdio: 'ignore' })
      execFileSync(
        'git',
        [
          '-c',
          'user.name=pdocs',
          '-c',
          'user.email=pdocs@example.com',
          'commit',
          '--quiet',
          '-m',
          'chore: initial commit',
        ],
        { cwd: target, stdio: 'ignore' }
      )
    } catch {
      console.warn('warning: could not initialise git — Antora needs at least one commit to find content')
    }
  }

  console.log(`created ${target}`)
  console.log('')
  console.log('next steps:')
  const rel = relative(process.cwd(), target)
  console.log(`  cd ${rel.startsWith('..') ? target : rel}`)
  console.log('  npm install')
  console.log('  npm run build')
  if (parentIsRepo) {
    console.log('')
    console.log('note: this directory is already inside a git repository — commit it there before building.')
  }

  return 0
}
