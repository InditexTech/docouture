'use strict'

import { describe, expect, it } from 'vitest'

import { MANAGED_END, MANAGED_START, hasManagedSection, mergeAgentsMd } from './agents-md.js'

const TEMPLATE_CONTENT = `${MANAGED_START}
# Example documentation

Some docouture-generated content.
${MANAGED_END}

## Documentation state

| doc page | derived from | status |
| -------- | ------------- | ------ |
`

describe('hasManagedSection', () => {
  it('is false for content with no markers', () => {
    expect(hasManagedSection('# My own notes\n\nJust some content.\n')).toBe(false)
  })

  it('is false when only one marker is present', () => {
    expect(hasManagedSection(`${MANAGED_START}\nunterminated\n`)).toBe(false)
  })

  it('is true when both markers are present, start before end', () => {
    expect(hasManagedSection(TEMPLATE_CONTENT)).toBe(true)
  })
})

describe('mergeAgentsMd', () => {
  it('returns the template content as-is when there is no existing file', () => {
    expect(mergeAgentsMd(undefined, TEMPLATE_CONTENT)).toBe(TEMPLATE_CONTENT)
  })

  it('appends the template content to a foreign file with no managed block', () => {
    const existing = '# Team notes\n\nSay hi to the docs bot.\n'
    const merged = mergeAgentsMd(existing, TEMPLATE_CONTENT)

    expect(merged.startsWith(existing)).toBe(true)
    expect(merged).toContain(MANAGED_START)
    expect(merged).toContain('Some docouture-generated content.')
    expect(merged).toContain('## Documentation state')
  })

  it('replaces only the managed block in place, preserving content before and after it', () => {
    const existing = `# Team notes\n\nSay hi to the docs bot.\n\n${MANAGED_START}\nold stale content\n${MANAGED_END}\n\n## Documentation state\n\n| index.adoc | manual | done |\n`

    const merged = mergeAgentsMd(existing, TEMPLATE_CONTENT)

    expect(merged).toContain('# Team notes')
    expect(merged).toContain('Say hi to the docs bot.')
    expect(merged).not.toContain('old stale content')
    expect(merged).toContain('Some docouture-generated content.')
    // The human-maintained Documentation state table survives untouched —
    // this is the whole reason AGENTS.md isn't a blind whole-file overwrite.
    expect(merged).toContain('| index.adoc | manual | done |')
  })

  it('does not touch a Documentation state table maintained outside the managed block on refresh', () => {
    const existing = `${MANAGED_START}\nold\n${MANAGED_END}\n\n## Documentation state\n\n| index.adoc (home) | manual (hand-written) | reviewed |\n| getting-started.adoc | README.md | draft |\n`

    const merged = mergeAgentsMd(existing, TEMPLATE_CONTENT)

    expect(merged).toContain('| index.adoc (home) | manual (hand-written) | reviewed |')
    expect(merged).toContain('| getting-started.adoc | README.md | draft |')
  })
})
