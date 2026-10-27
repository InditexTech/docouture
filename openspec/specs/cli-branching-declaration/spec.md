# cli-branching-declaration Specification

## Purpose
Defines how a docouture site declares its branching model (trunk-based or git-flow) in docs/package.json, and how the CLI scaffolds, maintains, backfills and checks that declaration.

## Requirements

### Requirement: Branching declaration in docs/package.json
The `docouture` block of `docs/package.json` SHALL declare `branching` as `trunk-based` or `git-flow`. Under `git-flow` it SHALL also contain `prereleaseBranch`, placed directly after `branching`. Under `trunk-based` it SHALL NOT contain `prereleaseBranch`.

#### Scenario: Scaffold git-flow
- **WHEN** `docouture new` scaffolds a git-flow site with prerelease branch `develop`
- **THEN** `docs/package.json` has `"branching": "git-flow"` and `"prereleaseBranch": "develop"`

#### Scenario: Scaffold trunk-based
- **WHEN** `docouture new` scaffolds a trunk-based site
- **THEN** `docs/package.json` has `"branching": "trunk-based"` and no `prereleaseBranch`

### Requirement: branch-model maintains the declaration
`docouture branch-model` SHALL add `prereleaseBranch` when switching to git-flow and remove it when switching to trunk-based, preserving other keys and their order.

#### Scenario: Switch to trunk-based
- **WHEN** a git-flow site is switched to trunk-based
- **THEN** `prereleaseBranch` is removed

### Requirement: upgrade backfills the declaration
`docouture upgrade` SHALL derive the branches from `antora-playbook.yml` and `docouture-release.yml`. When they differ (git-flow) it SHALL write or correct `branching` and `prereleaseBranch` in `docs/package.json` and print what it changed; it SHALL NOT fail on a mismatch.

#### Scenario: Legacy git-flow site
- **WHEN** a git-flow site's `package.json` lacks `prereleaseBranch`
- **THEN** upgrade adds it and reports the change

### Requirement: doctor checks the declaration
`docouture doctor` SHALL report a missing or mismatched `prereleaseBranch` when `branching` is `git-flow`, suggesting `docouture upgrade`.

#### Scenario: Missing field
- **WHEN** `branching` is `git-flow` and `prereleaseBranch` is absent
- **THEN** doctor reports it with `docouture upgrade` as the fix
