// SPDX-FileCopyrightText: 2026 INDUSTRIA DE DISEÑO TEXTIL S.A. (INDITEX S.A.)
//
// SPDX-License-Identifier: Apache-2.0

'use strict'

const { Readable } = require('stream')

/**
 * Concatenate object-mode streams into one.
 *
 * Replaces merge-stream, which is unmaintained (last released 2018, built for
 * readable-stream v2 semantics) and silently drops data when combined with
 * vinyl-fs 4 on current Node: merging a 2-file stream with a 29-file stream
 * yielded 3 files, so most of the UI never reached the bundle.
 *
 * Sources are drained in order rather than interleaved. Everything here is
 * funnelled into a single destination where order is irrelevant, and sequential
 * draining keeps behaviour deterministic.
 *
 * @param {...NodeJS.ReadableStream} streams
 * @returns {Readable} object-mode stream emitting every source's data in turn
 */
module.exports = (...streams) =>
  Readable.from(
    (async function* () {
      for (const stream of streams) yield* stream
    })(),
    { objectMode: true }
  )
