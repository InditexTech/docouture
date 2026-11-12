## MODIFIED Requirements

### Requirement: Resolve command interface
`docouture release resolve` SHALL accept the site mode (`versioned` or `standalone`), an optional explicit version, the repository root (default: cwd, or its enclosing repo), the event name, the published release tag, the tags of the repository's published GitHub Releases and the pull request labels, and SHALL print the resolved version, the release tag, the source the version came from and the active version source. It SHALL expose these as `key=value` lines suitable for appending to `$GITHUB_OUTPUT`. It SHALL read the active version source from `docs/package.json`, defaulting to `descriptor`, and SHALL print whether the descriptor bump and prerelease sync apply.

#### Scenario: Versioned, version from the descriptor
- **WHEN** it runs in `versioned` mode with source `descriptor`, without an explicit version, and `docs/.release-version` contains `1.2.0`
- **THEN** it reports version `1.2.0`, tag `docs/v1.2.0` and source `docs/.release-version`, says the descriptor steps apply, and exits 0

#### Scenario: Standalone
- **WHEN** it runs in `standalone` mode
- **THEN** it reports version `stable` and tag `docs/stable` regardless of any file, version source or explicit version, says the descriptor steps do not apply, and exits 0

### Requirement: github-release resolver
Under `github-release` the version SHALL be the published release tag with `versionSourcePrefix` stripped when declared, and SHALL be validated as SemVer. A tag that does not start with the declared prefix SHALL fail. An explicit version SHALL still take precedence. When no release tag is given and the event is a pull request carrying `docs/release`, the version SHALL instead be the highest SemVer version among the supplied published GitHub Release tags, selected as follows: only tags that start with the declared prefix are considered (all tags when none is declared), the prefix is stripped, and tags whose remainder is not valid SemVer or is a SemVer prerelease are ignored. The selection SHALL NOT depend on the order of the supplied tags. When that selection yields no version the command SHALL fail with a message that names the declared prefix, if any, and the number of releases considered. A pull request carrying `docs/release` with neither a release tag nor any supplied releases SHALL fail with a message that says a published GitHub Release is needed to republish the docs, and names the configured source. A supplied release tag SHALL take precedence over the supplied releases. The descriptor steps SHALL NOT apply.

#### Scenario: Plain tag
- **WHEN** the release tag is `1.4.0` and no prefix is declared
- **THEN** it reports version `1.4.0` and tag `docs/v1.4.0`

#### Scenario: Prefixed tag
- **WHEN** the release tag is `docs-site@1.4.0` and the prefix is `docs-site@`
- **THEN** it reports version `1.4.0`

#### Scenario: Wrong prefix
- **WHEN** the release tag is `other@1.4.0` and the prefix is `docs-site@`
- **THEN** it exits non-zero and says the tag does not start with the prefix

#### Scenario: Docs-only pull request republishes the highest Release
- **WHEN** a pull request event has `docs/release`, the source is `github-release`, no release tag is given and the supplied releases are `1.3.9`, `1.4.0` and `1.2.0`
- **THEN** it reports version `1.4.0` and tag `docs/v1.4.0`, says the descriptor steps do not apply, and exits 0

#### Scenario: Highest SemVer, not newest
- **WHEN** the supplied releases are listed newest first as `1.3.9` then `1.4.0`
- **THEN** it reports version `1.4.0`

#### Scenario: Prefix selects the package
- **WHEN** the prefix is `docs-site@` and the supplied releases are `api@9.0.1`, `docs-site@1.4.0` and `docs-site@1.3.9`
- **THEN** it reports version `1.4.0`

#### Scenario: Prereleases and non-SemVer tags ignored
- **WHEN** the supplied releases are `1.5.0-rc.1`, `nightly` and `1.4.0` with no prefix declared
- **THEN** it reports version `1.4.0`

#### Scenario: No matching Release
- **WHEN** the prefix is `docs-site@` and the supplied releases are only `api@9.0.1`
- **THEN** it exits non-zero and the message names `docs-site@` and that one release was considered

#### Scenario: Release tag wins over supplied releases
- **WHEN** a release tag `1.5.0` and supplied releases including `1.9.0` are both given
- **THEN** it reports version `1.5.0`

#### Scenario: Release label on a merged PR
- **WHEN** a pull request event has `docs/release`, the source is `github-release`, and neither a release tag nor any releases are given
- **THEN** it exits non-zero and says a published GitHub Release is needed to republish the docs

#### Scenario: Explicit version
- **WHEN** an explicit version `2.0.0` is given on top of supplied releases
- **THEN** it reports version `2.0.0`
