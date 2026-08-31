// SPDX-FileCopyrightText: 2026 INDUSTRIA DE DISEÑO TEXTIL S.A. (INDITEX S.A.)
//
// SPDX-License-Identifier: Apache-2.0

'use strict'

/**
 * Reports, on every build, exactly what Antora computed for each
 * component's versions — which ones exist, and which one it picked as
 * `latest`. Purely diagnostic: nothing here changes any build output.
 *
 * Exists because that computation (@antora/content-classifier's
 * `registerComponentVersion`, `component.versions.find(v => !v.prerelease)`)
 * is otherwise invisible until someone notices a version tag/toggle
 * rendering the wrong colour on the built site — by which point it could
 * just as easily be a stale/never-actually-published deploy as a real
 * version-data problem (see the docouture-publish.yml / gh-pages fixes this
 * shipped alongside). Logging it plainly at build time answers "did Antora
 * pick the version I expected as latest" without needing to inspect a live
 * site at all.
 *
 * Hooked on `contentClassified` — the earliest point after
 * `classifyContent` has populated the content catalog (every component's
 * `versions[]` and `.latest` fully resolved) and before navigation/pages are
 * built. Always `logger.info`, never `logger.warn`: this is a plain report
 * of what Antora decided, not a claim that anything is wrong — a component
 * legitimately has only one (prerelease) version before its first release,
 * and that is not an error.
 */
module.exports = function registerVersionReport(context) {
  const logger = context.getLogger('docouture-version-report')

  context.on('contentClassified', ({ contentCatalog }) => {
    for (const component of contentCatalog.getComponents()) {
      const rows = component.versions.map((componentVersion) => {
        const flags = []
        if (componentVersion === component.latest) flags.push('latest')
        if (componentVersion.prerelease) flags.push('prerelease')
        return flags.length ? `${componentVersion.version} (${flags.join(', ')})` : componentVersion.version
      })
      logger.info('%s versions: %s', component.name, rows.join(', '))
    }
  })
}
