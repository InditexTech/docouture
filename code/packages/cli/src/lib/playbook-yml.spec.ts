'use strict'

import { describe, expect, it } from 'vitest'

import {
  readBranches,
  readOutputDir,
  readSiteUrl,
  readSourceUrl,
  readStartPage,
  readStartPageComponent,
  readStartPath,
  writeBranches,
} from './playbook-yml.js'

const SAMPLE = `site:
  title: Example Docs
  # url: https://docs.example.com
  start_page: example::index.adoc

content:
  sources:
    - url: ..
      start_path: docs/src
      branches: HEAD

ui:
  bundle:
    url: https://gitlab.com/antora/antora-ui-default/-/jobs/artifacts/master/raw/build/ui-bundle.zip?job=bundle-stable
    snapshot: true

output:
  dir: build/site
`

describe('readSiteUrl', () => {
  it('returns null when site.url is only commented out', () => {
    expect(readSiteUrl(SAMPLE)).toBeNull()
  })

  it('reads an uncommented site.url', () => {
    const withUrl = SAMPLE.replace('# url: https://docs.example.com', 'url: https://docs.example.com')
    expect(readSiteUrl(withUrl)).toBe('https://docs.example.com')
  })

  it('does not pick up ui.bundle.url instead', () => {
    // Regression: an earlier version of the top-level-block scanner could
    // leak past `site:` into the next block.
    expect(readSiteUrl(SAMPLE) ?? '').not.toContain('gitlab.com')
  })
})

describe('readStartPage', () => {
  it('reads site.start_page', () => {
    expect(readStartPage(SAMPLE)).toBe('example::index.adoc')
  })
})

describe('readStartPageComponent', () => {
  it('reads the component-name prefix before ::', () => {
    expect(readStartPageComponent(SAMPLE)).toBe('example')
  })

  it('returns null when there is no start_page', () => {
    expect(readStartPageComponent('site:\n  title: X\n')).toBeNull()
  })
})

describe('readSourceUrl', () => {
  it('reads content.sources[0].url', () => {
    expect(readSourceUrl(SAMPLE)).toBe('..')
  })
})

describe('readStartPath', () => {
  it('reads content.sources[0].start_path', () => {
    expect(readStartPath(SAMPLE)).toBe('docs/src')
  })

  it('does not pick up output.dir instead', () => {
    expect(readStartPath(SAMPLE)).not.toBe('build/site')
  })
})

describe('readOutputDir', () => {
  it('reads output.dir', () => {
    expect(readOutputDir(SAMPLE)).toBe('build/site')
  })

  it('returns null when output.dir is unset, leaving the Antora default to the caller', () => {
    expect(readOutputDir('site:\n  title: X\n')).toBeNull()
  })
})

const SAMPLE_WITH_BRANCHES = `content:
  sources:
    - url: ..
      start_path: docs/src
      branches: [main]
      tags: ['docs/stable']

output:
  dir: build/site
`

describe('readBranches', () => {
  it('reads content.sources[0].branches as a single-element array', () => {
    expect(readBranches(SAMPLE_WITH_BRANCHES)).toEqual(['main'])
  })

  it('reads a multi-element inline array', () => {
    const withTwo = SAMPLE_WITH_BRANCHES.replace('branches: [main]', 'branches: [main, develop]')
    expect(readBranches(withTwo)).toEqual(['main', 'develop'])
  })

  it('treats a bare scalar (e.g. HEAD, no brackets) as a single-element list too', () => {
    expect(readBranches(SAMPLE)).toEqual(['HEAD'])
  })

  it('returns null when there is no content: block at all', () => {
    expect(readBranches('site:\n  title: X\n')).toBeNull()
  })
})

describe('writeBranches', () => {
  it('rewrites content.sources[0].branches to a single new branch name', () => {
    const updated = writeBranches(SAMPLE_WITH_BRANCHES, 'develop')
    expect(readBranches(updated)).toEqual(['develop'])
    // Everything else in the block survives untouched.
    expect(updated).toContain("tags: ['docs/stable']")
    expect(updated).toContain('start_path: docs/src')
  })

  it('leaves content unchanged when no branches: line is found', () => {
    const noBranches = 'content:\n  sources:\n    - url: ..\n'
    expect(writeBranches(noBranches, 'develop')).toBe(noBranches)
  })

  it('does not touch a branches: line belonging to a different top-level block', () => {
    const withDecoy = `output:\n  branches: [decoy]\n\n${SAMPLE_WITH_BRANCHES}`
    const updated = writeBranches(withDecoy, 'develop')
    expect(updated).toContain('branches: [decoy]')
    expect(updated).toContain('branches: [develop]')
  })
})
