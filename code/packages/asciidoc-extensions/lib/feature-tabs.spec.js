// SPDX-FileCopyrightText: 2026 INDUSTRIA DE DISEÑO TEXTIL S.A. (INDITEX S.A.)
//
// SPDX-License-Identifier: Apache-2.0

'use strict'

import { afterEach, describe, expect, it } from 'vitest'

const asciidoctor = require('@asciidoctor/core')
const registerFeatureTabs = require('./feature-tabs')

/**
 * @param {string} source
 * @param {{ logger?: { warn: (message: string) => void } }} [options]
 * @returns {Promise<string>}
 */
function convert(source, { logger } = {}) {
  const registry = asciidoctor.Extensions.create()
  registerFeatureTabs(registry)
  if (logger) asciidoctor.LoggerManager.setLogger(logger)
  return /** @type {Promise<string>} */ (asciidoctor.convert(source, { extension_registry: registry, safe: 'safe' }))
}

describe('feature-tabs block', () => {
  afterEach(() => {
    asciidoctor.LoggerManager.setLogger(asciidoctor.MemoryLogger.create())
  })

  it('renders a slide with both title and label, a themed media pair and an external cta', async () => {
    const html = await convert(`[feature-tabs]
====
[feature,label="UI-agnostic"]
.Integrates with any UI framework
--
image::feature-1.png[Alt text]
image::feature-1-dark.png[role=dark]

Change the UI using our included primitives.

[.cta]
https://example.com/learn-more[Learn more]
--
====
`)
    expect(html).toContain('data-feature-tabs')
    expect(html).toContain('dt-tabs-item--selected')
    expect(html).toContain('>UI-agnostic</a>')
    expect(html).toContain('docouture-feature-tabs__heading" id=')
    expect(html).toContain('Integrates with any UI framework</h3>')
    expect(html).toContain('docouture-feature-tabs__image--light')
    expect(html).toContain('docouture-feature-tabs__image--dark')
    // An absolute https target gets the external-link icon on the CTA.
    expect(html).toContain('dt-icon-mask--external-link')
  })

  it('title-only slide: the tab uses the title, and the heading is marked redundant', async () => {
    const html = await convert(`[feature-tabs]
====
[feature]
.Title-only slide
--
image::feature-2.png[Alt]
--
====
`)
    expect(html).toContain('>Title-only slide</a>')
    expect(html).toContain('docouture-feature-tabs__heading--redundant')
  })

  it('an internal (same-site) cta target gets no external-link icon', async () => {
    const html = await convert(`[feature-tabs]
====
[feature,label="Internal"]
--
image::feature-3.png[Alt]

[.cta]
xref:main:quickstart.adoc[Learn more]
--
====
`)
    expect(html).not.toContain('dt-icon-mask--external-link')
  })

  it('warns when a feature-tabs block has no [feature] slides at all', async () => {
    const logger = asciidoctor.MemoryLogger.create()
    await convert(
      `[feature-tabs]
====
Just a stray paragraph, no [feature] style.
====
`,
      { logger }
    )
    const messages = logger.getMessages().map((m) => m.getText()).join('\n')
    expect(messages).toContain('a feature-tabs block with no `[feature]` in it')
  })

  it('warns when a slide has neither a title nor a label', async () => {
    const logger = asciidoctor.MemoryLogger.create()
    const html = await convert(
      `[feature-tabs]
====
[feature]
--
image::feature-4.png[Alt]
--
====
`,
      { logger }
    )
    // renderFeature returns { tab: '', panel: '' } for the unlabelled slide.
    expect(html).toContain('<ul class="docouture-feature-tabs__list"></ul>')
    const messages = logger.getMessages().map((m) => m.getText()).join('\n')
    expect(messages).toContain('a slide has no label')
  })

  it('warns when a slide has no image at all', async () => {
    const logger = asciidoctor.MemoryLogger.create()
    await convert(
      `[feature-tabs]
====
[feature,label="No image"]
--
Prose only, no image::.
--
====
`,
      { logger }
    )
    const messages = logger.getMessages().map((m) => m.getText()).join('\n')
    expect(messages).toContain('a slide has no `image::` of its own')
  })

  it('warns and renders nothing for a cta paragraph carrying no link', async () => {
    const logger = asciidoctor.MemoryLogger.create()
    const html = await convert(
      `[feature-tabs]
====
[feature,label="Broken cta"]
--
image::feature-5.png[Alt]

[.cta]
Just text, no link.
--
====
`,
      { logger }
    )
    expect(html).not.toContain('docouture-feature-tabs__cta"')
    const messages = logger.getMessages().map((m) => m.getText()).join('\n')
    expect(messages).toContain("a slide's call to action carries no link")
  })

  it('accepts a bare-paragraph [feature] slide (not an open block)', async () => {
    const html = await convert(`[feature-tabs]
====
[feature,label="Prose slide"]
Just a paragraph, no open block at all.
====
`)
    expect(html).toContain('>Prose slide</a>')
    expect(html).toContain('Just a paragraph, no open block at all.')
  })
})
