## ADDED Requirements

### Requirement: Release job App token is not narrowed
The `release` job of the docs release workflow SHALL mint its GitHub App installation token without the `owner`, `repositories` or `permission-*` inputs, so that pushes to the release branch honor the App's ruleset bypass.

#### Scenario: Bump on a protected release branch
- **WHEN** a versioned release bumps `docs/.release-version` on a release branch protected by a pull-request ruleset whose bypass list contains the App
- **THEN** the push is accepted as a bypassed violation and the descriptor moves to the next patch version

#### Scenario: Token inputs
- **WHEN** the `Git app token` step of the `release` job is rendered from the template
- **THEN** it sets only `client-id` and `private-key`

### Requirement: Other jobs keep narrowed tokens
The `sync-prerelease` job and `docouture-publish.yml` SHALL keep narrowing their App tokens to the repository and the permissions they need, since neither pushes to the release branch.

#### Scenario: Sync job
- **WHEN** the `sync-prerelease` job mints its token
- **THEN** it still sets `owner`, `repositories`, `permission-contents`, `permission-pull-requests` and `permission-workflows`

### Requirement: Header and docs state the tradeoff
The workflow header comment SHALL NOT describe the release job's token as narrowed, and the releasing guide SHALL explain that narrowing can lose ruleset bypass on protected branches.

#### Scenario: Reader checks the hardening note
- **WHEN** a reader reads the "Docouture hardening" section of the template
- **THEN** it says the release job's token is not narrowed and references #298
