// SPDX-FileCopyrightText: 2026 INDUSTRIA DE DISEÑO TEXTIL S.A. (INDITEX S.A.)
//
// SPDX-License-Identifier: Apache-2.0

'use strict'

// The CLI never calls the GitHub API: like `docs/release` today, the extra
// labels a `tag-bump` site uses are only printed as commands to run.
export const TAG_BUMP_LABEL_COMMANDS = [
  "gh label create docs/release-minor --description 'Release the docs with a minor version bump'",
  "gh label create docs/release-major --description 'Release the docs with a major version bump'",
] as const

export function printTagBumpLabelCommands(log: (line: string) => void = console.log): void {
  log("A 'tag-bump' site bumps patch on 'docs/release', minor on 'docs/release-minor' and major on")
  log("'docs/release-major'. Create the two extra labels once:")
  for (const command of TAG_BUMP_LABEL_COMMANDS) log(`  ${command}`)
}
