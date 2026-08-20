'use strict'

import { describe, expect, it } from 'vitest'

import { readSiteUrl, readSourceUrl, readStartPage, readStartPageComponent, readStartPath } from './playbook-yml.js'

const SAMPLE = `site:
  title: Example Docs
  # url: https://docs.example.com
  start_page: example::index.adoc

content:
  sources:
    - url: ..
      start_path: docs/docs
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
    expect(readStartPath(SAMPLE)).toBe('docs/docs')
  })

  it('does not pick up output.dir instead', () => {
    expect(readStartPath(SAMPLE)).not.toBe('build/site')
  })
})
