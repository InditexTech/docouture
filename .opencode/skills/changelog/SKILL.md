---
name: changelog
description: "How code/CHANGELOG.md is generated and grouped in this monorepo — the entry format, which GitHub issue label puts a change under which Keep a Changelog section, and the rule that every PR must close an issue. USE WHEN deciding whether a PR needs a CHANGELOG entry, choosing which section (Added/Fixed/Documentation/...) an entry belongs in, labeling a PR or issue, writing or reviewing an issue title, or touching changelog-from-prs.mjs or the changelog CI checks. EXAMPLES: 'does this PR need a changelog line', 'which section does a kind/internal change go in', 'how do I change the wording of a changelog entry', 'why does the changelog check say my PR closes no issue', 'the changelog action failed to bump the version'."
metadata:
  internal: true
---

# CHANGELOG.md conventions

**Contributors do not edit `code/CHANGELOG.md`.** The `[Unreleased]` entries are generated
at release time from the issues that merged PRs close (GitHub `closingIssuesReferences`),
by `.github/scripts/changelog-from-prs.mjs`. What a contributor controls is the PR's
closing issue: its title and its `kind/*` label.

`code/CHANGELOG.md` follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) +
[SemVer](https://semver.org/). Version bumps are performed by
`release-flow/keep-a-changelog-action`'s `bump` command, called from
`.github/workflows/code-npm_node-publish-release-and-snapshot.yml`, right after the
generator ran. That action only parses the `## [Unreleased]` / `## [x.y.z]` H2 boundary;
the `### `-level section names are a repo convention. Which semver segment gets bumped is
decided separately, by the `release-type/{major,minor,patch,hotfix,multi-hotfix}` label on
the merged PR — orthogonal to which section an entry lands in.

```
PR opened/edited/labeled -> Changelog / Closing issue -> changelog-from-prs.mjs --pr N
PR merged (release)      -> release job -> changelog-from-prs.mjs (last tag..HEAD) -> [Unreleased]
                                        -> keep-a-changelog bump -> sanitize -> signed commit -> tag
```

## The rule: every PR closes an issue

Link it with a closing keyword (`Closes #N`) or the Development sidebar. A plain `#N`
does not count. Exempt: PRs labelled `skip-release`, and Dependabot. An exempt PR with no
issue simply gets no entry; a `skip-release` PR that **does** close an issue still gets
its entry (those PRs are released later). `skip-release` is otherwise only the "don't
bump the version yet" label.

There is no `skip-changelog` label anymore: it has no effect. Whether an issue produces an
entry is decided only by its labels.

## Entry format

```
- [#ISSUE_ID](ISSUE_URL) ISSUE_TITLE
```

The title is the issue title verbatim, only normalising NBSP/zero-width whitespace. To fix
the wording of an entry, edit the issue title (keep the `[scope]` tag, e.g.
`[ui-bundle] Header toolbar`). Entries are deduplicated by issue number, so several PRs
closing the same issue produce one line, and an issue already listed in an earlier
released section is not listed again (it is reported as a warning). Entries up to
1.3.2 link PRs instead; `changelog-pages.js` reads both.

## Label → section mapping (on the issue, first match wins)

| Label | Section |
| --- | --- |
| `kind/security` | `### Security` |
| `kind/bug` | `### Fixed` |
| `kind/enhancement` | `### Added` |
| `kind/documentation` | `### Documentation` |
| `kind/deprecated` | `### Deprecated` |
| `kind/removed` | `### Removed` |
| `kind/internal` / `kind/epic` alone | **no entry** (listed in the report as out of scope, never dropped silently) |
| none of the above | `### Changed`, with a "section guessed" warning — fix the label |

A real category label wins over `kind/internal`/`kind/epic`; `kind/epic` is a size flag
only. Empty sections are omitted.

## Where it runs

- `.github/workflows/code-changelog-check.yml` — every PR to `main`/`main-*` (not
  path-filtered): runs the script's tests, then previews the entry in the job summary and
  flags a PR that closes no issue. Warn-only while `CHANGELOG_LINK_ENFORCE` is `"false"`;
  flip it to `"true"` to fail the check instead.
- `.github/workflows/code-release_preview.yml` — two passes into the local `[Unreleased]`:
  the entries already pending on the base branch (`--to HEAD^1 --branch <base>`), then this
  PR's (`--pr N`), before the dry-run bump that feeds the PR comment. Titles are wrapped in
  code spans (`--wrap-titles`) so an `@user` in an issue title cannot notify anyone.
- Release job in `code-npm_node-publish-release-and-snapshot.yml` — generates before the
  bump with `--branch "$BASELINE_BRANCH"`; any error fails the job before the tag exists.
  The snapshot job does not generate.
- `.github/scripts/sanitize-changelog.mjs` still runs after every bump (and as
  `--check` in pr-verify) to keep invisible whitespace out of the file; the generator
  reuses its `normalizeInvisibleWhitespace` for titles.

## Running it locally

```bash
export GITHUB_TOKEN=$(gh auth token)
# what would 1.3.1..1.3.2 produce? Compares with the hand-written [1.3.2] section (read-only)
node .github/scripts/changelog-from-prs.mjs --dry-run --from 1.3.1 --to 1.3.2 --changelog code/CHANGELOG.md
# preview one PR
node .github/scripts/changelog-from-prs.mjs --pr 297
# tests
node --test .github/scripts/changelog-from-prs.test.mjs
```

Range mode finds PRs from first-parent commits since
`git describe --tags --abbrev=0 --match '[0-9]*'` (which skips `docs/*` tags), keeps only
PRs merged into `--branch` (default `main`), and with `--changelog` writes only
`[Unreleased]`: manual lines are kept, issues already listed there are not repeated, the
rest of the file is verified byte-identical before writing, and it is idempotent. Any API
or git error exits non-zero. Hitting a pagination limit also fails instead of silently
dropping an issue or label.
