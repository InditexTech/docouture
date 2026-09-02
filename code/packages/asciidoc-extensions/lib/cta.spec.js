// SPDX-FileCopyrightText: 2026 INDUSTRIA DE DISEÑO TEXTIL S.A. (INDITEX S.A.)
//
// SPDX-License-Identifier: Apache-2.0

'use strict'

import { afterEach, describe, expect, it } from 'vitest'

// @asciidoctor/core 4.0's `convert` is Promise-returning (this package's own
// async-compat.js header explains why); asciidoctor-core-2.2 is what real
// Antora builds actually use and converts synchronously. Both run
// registerCta identically — 4.0 here since it is this package's own
// devDependency and its registry.create()/Extensions API needs no special
// alias (see cta.js's own comment on the 2.2/4.0 split for why 2.2 must be
// required under an alias elsewhere in this package).
const asciidoctor = require('@asciidoctor/core')
const registerCta = require('./cta')

/**
 * @param {string} source
 * @param {{ logger?: { warn: (message: string) => void } }} [options]
 * @returns {Promise<string>}
 */
function convert(source, { logger } = {}) {
  const registry = asciidoctor.Extensions.create()
  registerCta(registry)
  if (logger) asciidoctor.LoggerManager.setLogger(logger)
  return /** @type {Promise<string>} */ (asciidoctor.convert(source, { extension_registry: registry, safe: 'safe' }))
}

describe('cta block', () => {
  afterEach(() => {
    asciidoctor.LoggerManager.setLogger(asciidoctor.MemoryLogger.create())
  })

  it('renders a themed mark (light + dark), title, lead, primary and secondary actions', async () => {
    const html = await convert(`[cta,title="Get started",align=start]
====
image::mark.svg[Mark]
image::mark-dark.svg[role=dark]

Actively maintained and open source.

[.primary]
https://github.com/InditexTech/docouture[Fork it]

[.secondary]
https://example.com/docs[Read the docs]
====
`)
    expect(html).toContain('docouture-cta--start')
    expect(html).toContain('<h2 class="docouture-cta__title discrete dt-text--title-l">Get started</h2>')
    expect(html).toContain('docouture-cta__mark-image--light')
    expect(html).toContain('docouture-cta__mark-image--dark')
    // GitHub targets get the brand icon; a plain https link does not.
    expect(html).toContain('docouture-cta__action-icon--github')
    expect(html).toContain('dt-button--secondary docouture-cta__action" href="https://example.com/docs"')
  })

  it('defaults to center alignment and renders an untethed single mark image with no --light modifier', async () => {
    const html = await convert(`[cta]
====
image::mark.svg[Mark]

Some lead text.

[.primary]
https://example.com[Go]
====
`)
    expect(html).toContain('docouture-cta--center')
    // themed is false (only a light image) so no --light modifier is added.
    expect(html).toContain('<img class="docouture-cta__mark-image" src="mark.svg" alt="Mark">')
  })

  it('warns and falls back to the default alignment for an unknown align value', async () => {
    const logger = asciidoctor.MemoryLogger.create()
    const html = await convert(
      `[cta,align=bogus]
====
Lead only.

[.primary]
https://example.com[Go]
====
`,
      { logger }
    )
    expect(html).toContain('docouture-cta--center')
    expect(logger.getMessages().map((m) => m.getText()).join('\n')).toContain('unknown alignment "bogus"')
  })

  it('warns when there is no [.primary] action', async () => {
    const logger = asciidoctor.MemoryLogger.create()
    await convert(
      `[cta]
====
Lead only, no actions.
====
`,
      { logger }
    )
    expect(logger.getMessages().map((m) => m.getText()).join('\n')).toContain('a cta has no `[.primary]` action')
  })

  it('warns when a [.secondary] action is present without a [.primary] one', async () => {
    const logger = asciidoctor.MemoryLogger.create()
    await convert(
      `[cta]
====
Lead.

[.secondary]
https://example.com[Only secondary]
====
`,
      { logger }
    )
    const messages = logger.getMessages().map((m) => m.getText()).join('\n')
    expect(messages).toContain('a cta has a `[.secondary]` action but no `[.primary]` one')
  })

  it('warns and renders nothing for an action paragraph carrying no link', async () => {
    const logger = asciidoctor.MemoryLogger.create()
    const html = await convert(
      `[cta]
====
Lead.

[.primary]
Just plain text, no link.
====
`,
      { logger }
    )
    // The paragraph converted fine, but renderAction found no anchor in it,
    // so the actions wrapper renders empty rather than a real button.
    expect(html).not.toContain('dt-button--primary')
    const messages = logger.getMessages().map((m) => m.getText()).join('\n')
    expect(messages).toContain('a cta action carries no link')
  })

  it('warns about a non-paragraph body block', async () => {
    const logger = asciidoctor.MemoryLogger.create()
    await convert(
      `[cta]
=====
Lead paragraph.

======
Nested example block, not a paragraph.
======

[.primary]
https://example.com[Go]
=====
`,
      { logger }
    )
    const messages = logger.getMessages().map((m) => m.getText()).join('\n')
    expect(messages).toContain('a cta body holds a')
  })
})
