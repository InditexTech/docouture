# Spec Delta

## Purpose

Defines how `code/CHANGELOG.md` `[Unreleased]` entries are generated at release time from the issues closed by merged PRs, and how PRs are checked against the issue-linking rule, so contributors never hand-edit the changelog.

## ADDED Requirements

### Requirement: Entries are generated from closing issues
At release time the system SHALL write `[Unreleased]` entries from the closing issues of every PR merged between the last numeric release tag and HEAD, as `- [#N](<issue URL>) <issue title>`, deduplicated by issue number, and SHALL NOT require contributors to edit `code/CHANGELOG.md`.

#### Scenario: Multiple PRs close the same issue
- **WHEN** two merged PRs in the range both close issue #N
- **THEN** exactly one entry for #N appears in `[Unreleased]`

#### Scenario: Docs tags ignored
- **WHEN** the range start is resolved and `docs/*` tags exist
- **THEN** only tags matching `[0-9]*` are considered

### Requirement: Section chosen from issue labels
The system SHALL place each entry in the section chosen by the first matching issue label: `kind/security` Security, `kind/bug` Fixed, `kind/enhancement` Added, `kind/documentation` Documentation, `kind/deprecated` Deprecated, `kind/removed` Removed.

#### Scenario: Unlabelled issue
- **WHEN** an issue has none of the mapped `kind/*` labels and is not internal/epic
- **THEN** its entry is placed under Changed and a "section guessed" warning is reported

#### Scenario: Internal issue
- **WHEN** an issue carries `kind/internal` and/or `kind/epic`
- **THEN** no entry is written and the issue is listed in the report as out of scope

#### Scenario: Internal wins over a real category
- **WHEN** an issue carries `kind/epic` or `kind/internal` together with a real category label
- **THEN** no entry is written and the issue is listed in the report as out of scope

### Requirement: Entry title is the issue title
The system SHALL use the issue title verbatim, normalising only non-breaking and invisible whitespace.

#### Scenario: NBSP in title
- **WHEN** an issue title contains a NBSP
- **THEN** the entry contains an ordinary space

### Requirement: PRs must close an issue
Every PR SHALL be linked to an issue through a closing keyword or the Development sidebar; a plain `#N` reference SHALL NOT count. PRs labelled `skip-release` and Dependabot PRs SHALL be exempt.

#### Scenario: No closing issue
- **WHEN** a non-exempt PR has no closing issue
- **THEN** the check reports it, failing only when enforcement is enabled

#### Scenario: Bypassed PR without issue
- **WHEN** a `skip-release` PR has no closing issue
- **THEN** the check passes and no entry is generated

#### Scenario: Bypassed PR with issue
- **WHEN** a `skip-release` PR closes an issue
- **THEN** that issue still produces an entry at the next release

### Requirement: skip-changelog has no effect
The system SHALL NOT read the `skip-changelog` label; entry presence and section are determined solely by the closing issues' labels.

#### Scenario: Legacy label present
- **WHEN** a PR carries `skip-changelog` and closes a `kind/bug` issue
- **THEN** the issue's entry is still generated under Fixed

### Requirement: PR preview and check mode
The system SHALL provide a read-only per-PR mode that reports the entries a PR would produce, and SHALL run it on every PR (not path-filtered), writing a job summary when the token is read-only (fork PRs).

#### Scenario: Fork PR
- **WHEN** a PR comes from a fork
- **THEN** the report appears in the job summary instead of failing for lack of permissions

### Requirement: Release fails safely
The generator SHALL retry API calls with backoff, be idempotent, write only the `[Unreleased]` section, and exit non-zero on any error before the release tag is created.

#### Scenario: API failure
- **WHEN** the GitHub API keeps failing after retries
- **THEN** the release job fails and no tag is created

#### Scenario: Empty Unreleased
- **WHEN** no entries are generated for the range
- **THEN** the changelog bump still succeeds

### Requirement: Already-released issues are not listed again
The system SHALL NOT write an entry for an issue already listed in an earlier released section of the changelog, and SHALL report it as a warning.

#### Scenario: Follow-up PR on a released issue
- **WHEN** a merged PR closes an issue whose URL is already listed under a released version
- **THEN** no new entry is written and a warning names the version

### Requirement: Safe, bounded writes
The generator SHALL keep manual lines already present in `[Unreleased]`, verify before writing that all text outside `[Unreleased]` is unchanged and each added entry appears exactly once, refuse CRLF changelogs, and fail rather than truncate when a GitHub pagination limit is reached.

#### Scenario: Unexpected result
- **WHEN** writing would alter text outside `[Unreleased]`
- **THEN** the generator exits non-zero without writing

#### Scenario: Pagination limit
- **WHEN** a PR has more labels or closing issues than one page returns
- **THEN** the generator fails with a message naming the limit

### Requirement: Only PRs merged into the release branch count
In range mode the system SHALL only consider PRs that are merged and whose base branch is the release branch (`--branch`).

#### Scenario: PR merged elsewhere
- **WHEN** a commit in the range is associated with a PR merged into another branch
- **THEN** that PR contributes no entry

### Requirement: Release preview shows the whole release
The release preview SHALL generate the entries already pending on the base branch and then the previewed PR's, and SHALL wrap issue titles in code spans in the posted text so an `@mention` cannot notify anyone; fork PRs SHALL receive the preview in the job summary.

#### Scenario: Mention in a title
- **WHEN** an issue title contains `@user`
- **THEN** the preview text shows the title inside a code span and `CHANGELOG.md` is unchanged by the wrapping
