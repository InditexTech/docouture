// SPDX-FileCopyrightText: 2026 INDUSTRIA DE DISEÑO TEXTIL S.A. (INDITEX S.A.)
//
// SPDX-License-Identifier: MPL-2.0

/**
 * `{{or a b}}` — logical OR.
 *
 * With two operands this returns the *value* that decided the result, not a
 * boolean, so it doubles as a fallback selector in templates — for example
 * `{{detag (or page.title defaultPageTitle)}}`. With more operands it reduces
 * to a boolean.
 */
const or = (...args: unknown[]): unknown => {
  if (args.length === 3) return args[0] || args[1]
  if (args.length < 3) throw new Error('{{or}} helper expects at least 2 arguments')
  args.pop()
  return args.some(Boolean)
}

export = or
