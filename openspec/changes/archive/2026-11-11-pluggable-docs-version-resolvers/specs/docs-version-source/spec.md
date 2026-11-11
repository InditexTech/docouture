## Purpose

Defines how a versioned docouture site declares where its docs release version comes from, and how the CLI scaffolds, backfills, checks and switches that declaration.

## ADDED Requirements

### Requirement: Version source declaration
The `docouture` block of `docs/package.json` SHALL be able to declare `versionSource` as `descriptor`, `github-release` or `tag-bump`. An absent `versionSource` SHALL mean `descriptor`. When `versionSource` is `github-release` the block MAY declare `versionSourcePrefix`, a string stripped from the start of a release tag. `versionSource` SHALL be placed after `branching` and `prereleaseBranch` and other keys SHALL keep their order.

#### Scenario: Absent value
- **WHEN** `docs/package.json` has no `versionSource`
- **THEN** the site is treated as `descriptor`

#### Scenario: Unknown value
- **WHEN** `versionSource` is any other string
- **THEN** commands that read it fail naming the three valid values

### Requirement: new scaffolds the source
In versioned mode `docouture new` SHALL ask which version source to use, with each option explained and `descriptor` as the default, and SHALL accept `--version-source <source>` to skip the prompt. It SHALL write the choice to `docs/package.json` and create `docs/.release-version` only for `descriptor`. For `tag-bump` it SHALL print the exact `gh label create` commands for `docs/release-minor` and `docs/release-major` and SHALL NOT call the GitHub API. In standalone mode it SHALL neither prompt for nor accept a version source.

#### Scenario: Default
- **WHEN** a versioned site is scaffolded without choosing a source
- **THEN** `versionSource` is `descriptor` and `docs/.release-version` exists

#### Scenario: tag-bump
- **WHEN** a versioned site is scaffolded with `--version-source tag-bump`
- **THEN** no `docs/.release-version` is created and the label commands are printed

#### Scenario: Standalone
- **WHEN** `--version-source` is passed for a standalone site
- **THEN** the command fails saying standalone sites have no version source

### Requirement: upgrade backfills the source
`docouture upgrade` on a versioned site without `versionSource` SHALL write `"versionSource": "descriptor"`, print what it changed and point at `docouture version-source`, without prompting. It SHALL be idempotent, SHALL NOT change an existing `versionSource` and SHALL NOT touch standalone sites. When the running CLI version differs from the version resolved by the project it SHALL warn.

#### Scenario: Legacy versioned site
- **WHEN** a versioned site's `package.json` lacks `versionSource`
- **THEN** upgrade writes `descriptor` and reports it

#### Scenario: Second run
- **WHEN** upgrade runs again
- **THEN** `package.json` is unchanged

### Requirement: version-source command
`docouture version-source [descriptor|github-release|tag-bump]` SHALL refuse a standalone site, set `versionSource`, and per target: for `descriptor` create `docs/.release-version` seeded with the next patch of the latest `docs/v*` tag, or with `--version`; for `github-release` and `tag-bump` remove `docs/.release-version`, warning when it held a pending value, and for `tag-bump` print the `gh label create` commands. `--dry-run` SHALL report what would change without writing. It SHALL be idempotent.

#### Scenario: Switch to tag-bump
- **WHEN** a `descriptor` site holding `1.3.0` in `.release-version` is switched to `tag-bump`
- **THEN** the file is removed, a warning names the pending `1.3.0`, and the label commands are printed

#### Scenario: Switch back
- **WHEN** a `tag-bump` site is switched to `descriptor` and the latest tag is `docs/v1.2.4`
- **THEN** `.release-version` is created containing `1.2.5`

#### Scenario: Dry run
- **WHEN** `--dry-run` is passed
- **THEN** nothing is written and the planned changes are listed

### Requirement: doctor reports the source
`docouture doctor` SHALL show the active version source and SHALL warn when `github-release` or `tag-bump` still has `docs/.release-version`, when `descriptor` has no such file, and when the installed CLI does not support `release resolve`, each with the fix.

#### Scenario: Stray descriptor
- **WHEN** `versionSource` is `tag-bump` and `docs/.release-version` exists
- **THEN** doctor warns and suggests `docouture version-source tag-bump`
