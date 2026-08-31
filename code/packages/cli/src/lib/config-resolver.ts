// SPDX-FileCopyrightText: 2026 INDUSTRIA DE DISEÑO TEXTIL S.A. (INDITEX S.A.)
//
// SPDX-License-Identifier: Apache-2.0

'use strict'

// The one config-precedence rule this CLI applies in more than one place —
// CLI flags win over a persisted/configured value, which wins over a
// hardcoded default — pulled out into a single, tested function instead of
// each command re-deriving the same `{ ...a, ...b, ...c }` merge with its
// own slightly different shape (publish.ts's options, upgrade.ts's title).
// Per-command commands still own *what* the three layers are (reading
// docs/package.json, docs/antora.yml, flags) — this only owns the merge
// order itself, and only overrides a key when the flag/configured layer
// actually provided a value: `undefined` never wins over a real default.
export function resolveConfig<T extends Record<string, unknown>>(
  defaults: T,
  configured: Partial<T> = {},
  flags: Partial<T> = {}
): T {
  const result: T = { ...defaults }
  for (const [key, value] of Object.entries(configured)) {
    if (value !== undefined) (result as Record<string, unknown>)[key] = value
  }
  for (const [key, value] of Object.entries(flags)) {
    if (value !== undefined) (result as Record<string, unknown>)[key] = value
  }
  return result
}
