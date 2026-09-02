// SPDX-FileCopyrightText: 2026 INDUSTRIA DE DISEÑO TEXTIL S.A. (INDITEX S.A.)
//
// SPDX-License-Identifier: Apache-2.0

'use strict'

// Reporting an authoring mistake.
//
// Both site playbooks set `runtime.log.failure_level: warn`, so a warning
// logged here does not merely print — it FAILS THE BUILD. That is the intended
// severity for this package: an unknown IDS Label colour, a `[cards]` block
// with no cards in it, a tab set with no panels. Each of those renders as
// something plausible-looking but wrong (unstyled markup, an empty region, a
// silently dropped section), and a documentation site that ships those is worse
// than one that fails to build.
//
// So the choice this helper encodes is: authoring mistakes are warnings,
// because warnings are fatal here. Anything that should NOT stop a build does
// not belong at this level.
//
// It exists mostly to get the logger lookup right in one place. Reaching the
// logger means walking `node -> document -> logger`, and the node an extension
// holds varies by extension point — a block processor's `parent`, a
// postprocessor's `doc`. Getting that wrong throws a TypeError from inside the
// extension, which surfaces as an opaque conversion failure rather than as the
// authoring error it was trying to report.

/**
 * Anything a warning can be raised from: the `parent` handed to a block or
 * macro processor, or a Document.
 *
 * @typedef {{ getDocument?: () => { getLogger?: () => Logger }, getLogger?: () => Logger }} WarnSource
 */

/**
 * The subset of the Asciidoctor logger this uses. Typed structurally rather
 * than imported from `@asciidoctor/core`, because the object at runtime comes
 * from 2.2 under Antora and 4.0 under the preview harness.
 *
 * @typedef {{ warn: (message: string) => void }} Logger
 */

/**
 * Logs a warning against the document, failing the build under both site
 * playbooks' `failure_level: warn`.
 *
 * ```js
 * warn(parent, 'label:' + target + '[]', 'unknown IDS Label variant "' + variant + '"', VARIANTS)
 * // → label:mauve[] — unknown IDS Label variant "mauve"; expected one of white, grey, ...
 * ```
 *
 * The message is assembled here so every extension reports in the same shape:
 * what the author wrote, what is wrong with it, and — when there is a closed
 * set — what was expected instead. The author gets told how to fix it, not just
 * that something is broken.
 *
 * A missing logger is tolerated silently. Asciidoctor always provides one in
 * both majors; a detached node constructed in a test may not, and losing a
 * warning is a better failure mode there than masking the real assertion with a
 * TypeError.
 *
 * @param {WarnSource} node - the block processor's `parent`, or a document.
 * @param {string} source - what the author wrote, verbatim enough to find:
 *   `label:mauve[]`, `[cards]`, `cta::[]`.
 * @param {string} problem - what is wrong, in lower case, no trailing period.
 * @param {readonly string[]} [expected] - the permitted values, when the
 *   mistake is a value outside a closed set. Appended as
 *   `; expected one of a, b, c`.
 * @returns {void}
 */
function warn(node, source, problem, expected) {
  const doc = (typeof node.getDocument === 'function' && node.getDocument()) || node
  const logger = typeof doc.getLogger === 'function' ? doc.getLogger() : undefined
  if (!logger || typeof logger.warn !== 'function') return
  const suffix = expected?.length ? '; expected one of ' + expected.join(', ') : ''
  logger.warn(source + ' — ' + problem + suffix)
}

module.exports = warn
