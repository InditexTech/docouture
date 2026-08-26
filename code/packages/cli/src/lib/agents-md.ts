'use strict'

// AGENTS.md is the one scaffolded file `docouture new`/`docouture upgrade` never
// treat as all-or-nothing: unlike a workflow file or a skill directory, a
// repository may well already have its own AGENTS.md before `docouture new`
// ever runs, and the `documenting-your-repo` skill edits this file's own
// '## Documentation state' table over time as a repo's docs grow — content
// no template regenerates. Rather than clobber the whole file (today's
// behavior for every other scaffolded file) or refuse outright, docouture' own
// content lives inside a clearly marked, mechanically findable block —
// everything outside it (a human's own notes, or that evolving table) is
// never touched. The template itself
// (templates/agent-support/AGENTS.md) places MANAGED_END right before
// '## Documentation state', so that section is deliberately outside the
// block even on a brand-new scaffold.
export const MANAGED_START =
  '<!-- docouture:start - managed by docouture; edits inside this block are overwritten by `docouture new`/`docouture upgrade` -->'
export const MANAGED_END = '<!-- docouture:end -->'

export const AGENTS_MD_FILENAME = 'AGENTS.md'

// True when `content` already has a complete docouture-managed block — the
// signal `new.ts` uses to decide whether an existing AGENTS.md counts as a
// genuine overwrite conflict (subject to the same confirm-before-overwrite
// prompt as workflows/skills) versus a foreign file that's simply safe to
// append to without asking.
export function hasManagedSection(content: string): boolean {
  const start = content.indexOf(MANAGED_START)
  const end = content.indexOf(MANAGED_END)
  return start !== -1 && end !== -1 && end > start
}

function extractManagedBlock(templateContent: string): string {
  const start = templateContent.indexOf(MANAGED_START)
  const end = templateContent.indexOf(MANAGED_END)
  if (start === -1 || end === -1 || end <= start) {
    // Only reachable if templates/agent-support/AGENTS.md itself loses its
    // own markers — a packaging bug, not a runtime/user condition.
    throw new Error('templates/agent-support/AGENTS.md is missing its docouture:start/docouture:end markers')
  }
  return templateContent.slice(start, end + MANAGED_END.length)
}

// Merges `templateContent` — this run's freshly rendered AGENTS.md, exactly
// as `docouture new` would write it from scratch (placeholders already
// substituted, both markers and the default '## Documentation state' tail
// all present) — into `existing`, the AGENTS.md content already on disk (or
// `undefined` if there wasn't one):
//   - no existing file           -> templateContent as-is, unchanged from
//                                    today's whole-file scaffold output.
//   - existing has a managed     -> only that block is replaced, sliced out
//     block already                 of templateContent; everything in
//                                    `existing` before/after it (a human's
//                                    own notes, the Documentation state
//                                    table) survives byte for byte.
//   - existing has no managed    -> templateContent (block + its own
//     block (a foreign/human         default tail) is appended to the end
//     AGENTS.md, or one from        of `existing`, blank-line separated;
//     before this existed)          nothing already there is touched.
export function mergeAgentsMd(existing: string | undefined, templateContent: string): string {
  if (existing === undefined) return templateContent

  const start = existing.indexOf(MANAGED_START)
  const end = existing.indexOf(MANAGED_END)

  if (start !== -1 && end !== -1 && end > start) {
    const before = existing.slice(0, start)
    const after = existing.slice(end + MANAGED_END.length)
    return `${before}${extractManagedBlock(templateContent)}${after}`
  }

  const separator =
    existing.length === 0 ? '' : existing.endsWith('\n\n') ? '' : existing.endsWith('\n') ? '\n' : '\n\n'
  return `${existing}${separator}${templateContent}`
}
