// SPDX-FileCopyrightText: 2026 INDUSTRIA DE DISEÑO TEXTIL S.A. (INDITEX S.A.)
//
// SPDX-License-Identifier: Apache-2.0

'use strict'

// Reporting an authoring mistake.
//
// Scaffolded playbooks set `runtime.log.failure_level: error`, so an error
// logged here does not merely print — it FAILS THE BUILD. That is the intended
// severity for authoring mistakes in this package: an unknown IDS Label colour, a `[cards]` block
// with no cards in it, a tab set with no panels. Each of those renders as
// something plausible-looking but wrong (unstyled markup, an empty region, a
// silently dropped section), and a documentation site that ships those is worse
// than one that fails to build.
//
// So the choice this helper encodes is: authoring mistakes are errors, because
// errors are fatal here. Output that is still correct but degraded ("only the
// first image is rendered") goes through `notice()`, which logs at warn and
// does not stop the build.
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
 * @typedef {{ warn?: (message: string) => void, error?: (message: string) => void }} Logger
 */

/**
 * Logs a message at `level` against the document, shaped the same way for
 * both severities (see `error()` and `notice()` below).
 *
 * ```js
 * error(parent, 'label:' + target + '[]', 'unknown IDS Label variant "' + variant + '"', VARIANTS)
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
 * @param {'error' | 'warn'} level
 * @param {WarnSource} node - the block processor's `parent`, or a document.
 * @param {string} source - what the author wrote, verbatim enough to find:
 *   `label:mauve[]`, `[cards]`, `cta::[]`.
 * @param {string} problem - what is wrong, in lower case, no trailing period.
 * @param {readonly string[]} [expected] - the permitted values, when the
 *   mistake is a value outside a closed set. Appended as
 *   `; expected one of a, b, c`.
 * @returns {void}
 */
function report(level, node, source, problem, expected) {
  const doc = (typeof node.getDocument === 'function' && node.getDocument()) || node
  const logger = typeof doc.getLogger === 'function' ? doc.getLogger() : undefined
  if (!logger || typeof logger[level] !== 'function') return
  const suffix = expected?.length ? '; expected one of ' + expected.join(', ') : ''
  logger[level](source + ' — ' + problem + suffix)
}

/**
 * Logs an authoring mistake at error severity; fails the build under the
 * scaffolded playbooks' `failure_level: error`.
 *
 * @param {WarnSource} node
 * @param {string} source
 * @param {string} problem
 * @param {readonly string[]} [expected]
 * @returns {void}
 */
function error(node, source, problem, expected) {
  report('error', node, source, problem, expected)
}

/**
 * Logs an informational notice at warn severity. The output is still correct
 * (a degraded-but-fine case, e.g. "only the first is rendered"), so it does not
 * fail the build.
 *
 * @param {WarnSource} node
 * @param {string} source
 * @param {string} problem
 * @param {readonly string[]} [expected]
 * @returns {void}
 */
function notice(node, source, problem, expected) {
  report('warn', node, source, problem, expected)
}

module.exports = { error, notice }
