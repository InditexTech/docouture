# docs-release-preview Specification

## Purpose
Defines which comment the docs release preview posts on a pull request for each combination of release labels and changes, so authors learn when and whether the docs site will actually be released.

## Requirements

### Requirement: Release-type signal
The preview SHALL treat a pull request as carrying a code release (T) when it has a `release-type/*` label and no `skip-release` label, matching the condition under which `docouture-release.yml` defers the docs release to the published GitHub Release. A pull request with `skip-release` SHALL be previewed as if it had no `release-type/*` label.

#### Scenario: skip-release overrides release-type
- **WHEN** a pull request has `docs/release`, `release-type/minor` and `skip-release`
- **THEN** it is previewed as a `docs/release`-only pull request

### Requirement: Docs release on merge
For a pull request with `docs/release` and no code release (T), the preview SHALL state that merging releases the docs site as the resolved tag right away, and SHALL warn that the tag will be replaced when it already exists. When the PR has no changes under `docs/**`, the preview SHALL instead state that the release will contain nothing new.

#### Scenario: Valid release
- **WHEN** a pull request has `docs/release`, no T, changes under `docs/**` and a valid version (or standalone mode)
- **THEN** the comment says merging publishes the docs site as the tag right away

#### Scenario: Existing tag
- **WHEN** the same pull request targets a tag that already exists
- **THEN** the comment also warns that the tag will be replaced

#### Scenario: No docs changes
- **WHEN** a pull request has `docs/release`, no T and no changes under `docs/**`
- **THEN** the comment says nothing new will be released

### Requirement: Version errors
In versioned mode, when `docs/.release-version` is missing or not valid SemVer, the preview SHALL post an error instead of the release preview and SHALL say that the docs release will fail. For a pull request with T, it SHALL say the failure happens when the code release publishes a GitHub Release, after the code release has gone out, not on merge.

#### Scenario: Missing version, docs only
- **WHEN** a versioned-mode pull request has `docs/release`, no T and no `docs/.release-version`
- **THEN** the comment says the docs release will fail and asks to add the file before merging

#### Scenario: Invalid version with a code release
- **WHEN** a versioned-mode pull request has `docs/release`, T and an invalid `docs/.release-version`
- **THEN** the comment says the docs release will fail when the code Release is published, not on merge

### Requirement: Combined code and docs release
For a pull request with `docs/release` and T and a valid version (or standalone mode), the preview SHALL state that the docs are not released on merge but when the code release publishes a GitHub Release, naming the tag. It SHALL state that if no Release is published (failure, draft or pre-release) no docs are released and that `docouture-release` can be run manually, and SHALL warn when the tag already exists. This SHALL apply whether or not the pull request changes `docs/**`.

#### Scenario: Combined labels
- **WHEN** a pull request has `docs/release` and `release-type/minor` and a valid version
- **THEN** the comment says docs are released with the code release, not on merge

#### Scenario: Combined labels, no docs changes
- **WHEN** the same pull request has no changes under `docs/**`
- **THEN** the same comment is posted and no "nothing new to release" comment is posted

### Requirement: Code release only
For a non-draft pull request with T, without `docs/release`, and with changes under `docs/**`, the preview SHALL state that the docs are released automatically when the code release publishes a GitHub Release, that `docs/release` is not needed, and that no docs are released when no Release is published. It SHALL suggest running `docouture-release` manually or releasing the docs in a separate pull request labelled `docs/release` without `release-type/*`. It SHALL NOT recommend `skip-release`.

#### Scenario: Code release only
- **WHEN** a non-draft pull request has `release-type/patch`, no `docs/release` and changes under `docs/**`
- **THEN** the comment says the docs follow the code release

#### Scenario: Code-only pull request
- **WHEN** a pull request has `release-type/patch` and no changes under `docs/**`
- **THEN** no docs comment is posted

### Requirement: No release signal
For a non-draft pull request with changes under `docs/**`, no `docs/release` and no T, the preview SHALL state that merging does not release the docs and that `docs/release` triggers it. With no changes under `docs/**` it SHALL post nothing.

#### Scenario: No labels
- **WHEN** a non-draft pull request has no release labels and changes under `docs/**`
- **THEN** the comment says the docs will not be released and mentions `docs/release`

#### Scenario: Skip-release with release-type
- **WHEN** a pull request has `release-type/patch` and `skip-release` but not `docs/release`
- **THEN** the same comment is posted

### Requirement: Skipped pull requests
The preview SHALL post no comment on pull requests from forks, and on draft pull requests without `docs/release`.

#### Scenario: Fork
- **WHEN** a pull request comes from a fork
- **THEN** no comment is posted

#### Scenario: Draft without label
- **WHEN** a draft pull request has no `docs/release` label
- **THEN** no comment is posted
