# Spec Delta

## Purpose

Defines how `docouture new` chooses the Antora component name and explains the choice, so sites published to GitHub Pages do not repeat the repository name in their URLs.

## ADDED Requirements

### Requirement: Component name defaults to ROOT
The CLI SHALL set the scaffolded `docs/antora.yml` component `name` to `ROOT` unless the extra URL segment is explicitly requested, in which case it SHALL be the site slug. The `package.json` name and the site title SHALL be unaffected either way.

#### Scenario: Default
- **WHEN** `docouture new` runs without `--url-segment` and the wizard answer is the default
- **THEN** `antora.yml` has `name: ROOT`

#### Scenario: Opt in
- **WHEN** `--url-segment` is passed or the wizard question is answered yes
- **THEN** `antora.yml` `name` equals the site slug

### Requirement: Wizard explains the URL segment choice
The wizard prompt for the extra URL segment SHALL be marked "(recommended: no)", SHALL define site, component and module, and SHALL show the published URL shape for both answers. It SHALL state that GitHub Pages already includes the repository name.

#### Scenario: Prompt content
- **WHEN** the wizard reaches the URL segment question
- **THEN** the message contains the recommendation, the definitions, and both example URLs

### Requirement: Flag is documented
The `--url-segment` flag SHALL appear in the CLI help output and the CLI reference page, stating that the default is `ROOT` and why.

#### Scenario: Help output
- **WHEN** the user runs `docouture --help`
- **THEN** `--url-segment` is listed with its default and purpose
