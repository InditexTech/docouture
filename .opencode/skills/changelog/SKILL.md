---
name: changelog
description: "How code/CHANGELOG.md is written and grouped in this monorepo — the entry format, which GitHub label puts a change under which Keep a Changelog section, and the issue/PR two-tier convention that decides what gets an entry at all. USE WHEN adding or editing a CHANGELOG.md entry, deciding whether a PR needs one, choosing which section (Added/Fixed/Documentation/...) an entry belongs in, labeling a PR or issue, or touching the pr-verify CHANGELOG gate. EXAMPLES: 'add a changelog entry for this PR', 'does this PR need a changelog line', 'which section does a kind/internal change go in', 'why does pr-verify say my CHANGELOG entry is missing a label', 'the changelog action failed to bump the version'."
---

# CHANGELOG.md conventions

`code/CHANGELOG.md` follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) +
[SemVer](https://semver.org/). Version bumps are performed by
`release-flow/keep-a-changelog-action`'s `bump` command, called from
`.github/workflows/code-npm_node-publish-release-and-snapshot.yml`. That action only
parses the `## [Unreleased]` / `## [x.y.z]` H2 boundary (see its `src/types.ts` —
`ReleaseHeading` keys off H2 headings only); the `### `-level section names underneath
are a **repo convention we control**, not something the action validates or requires to
match Keep a Changelog's canonical vocabulary. Which semver segment gets bumped is decided
separately, by the `release-type/{major,minor,patch,hotfix,multi-hotfix}` label on the
merged/closing PR — that label is completely orthogonal to which CHANGELOG section an
entry lands in.

## Entry format

```
- [#PR_ID](PR_URL) PR_NAME
```

`PR_ID`/`PR_URL` always point at the **PR that shipped the code** (not a tracking issue —
issues aren't browsable diffs and don't have a merge). `PR_NAME` is the PR's title, and
the PR's title must be kept identical to its linked issue's title, scope tag included
(e.g. `[ui-bundle] Header toolbar`) — see "Two-tier: issue vs PR" below for why the issue
owns the canonical name.

## Label → section mapping

| Label | Section |
| --- | --- |
| `kind/enhancement` | `### Added` |
| `kind/bug` | `### Fixed` |
| `kind/documentation` | `### Documentation` (not canonical Keep a Changelog vocabulary, but this repo ships a docs generator, so doc-only changes are common enough to deserve their own bucket instead of being buried in Added) |
| `kind/deprecated` | `### Deprecated` |
| `kind/removed` | `### Removed` |
| `kind/security` | `### Security` |
| `kind/internal` | **no entry** (see below) |
| `kind/epic` | not a section — a size/container flag only, never on its own decides anything |
| `skip-release` | **not exempt on its own** — blocks the version bump only, still needs a normal entry unless `kind/internal`/`kind/epic` also applies (see below) |

Omit empty section headings entirely rather than leaving them with no bullets under them.

### `kind/internal` and `kind/epic` mean "no changelog entry" — `skip-release` does not

If, after resolving labels (below), the only labels that apply are `kind/internal` and/or
`kind/epic` — with none of the six real category labels above also present — the PR/issue
gets **no CHANGELOG entry at all**. `kind/epic` by itself never produces an entry either
way; it just flags that an issue is a large, multi-PR unit of work. If a change is *both*
e.g. `kind/enhancement` and `kind/epic`, the real category wins and it gets a normal
`### Added` entry.

`skip-release` is a **separate, orthogonal concern**: it tells the release-flow bump
action not to cut a version for this PR (e.g. one slice of a multi-PR issue where only
the last PR should trigger the release). It does **not** exempt the PR from the
CHANGELOG.md requirement — a `skip-release` PR still needs its entry in `[Unreleased]`
if it (or its closing issue) carries a real category label; the entry just gets promoted
into a versioned section later, whenever some other PR does trigger the bump.

## Two-tier: issue vs PR, and how to resolve the label

This repo tracks larger changes with a GitHub **issue** (the user-facing unit of work,
carrying the real `kind/*` category label and often a `[scope]` prefix in its title, e.g.
`[cli]`, `[ui-bundle]`, `[tooling]`) that's implemented by one or more **PRs** (the
concrete shipped diffs). Because an issue can span several PRs, those implementing PRs are
routinely labeled `skip-release` — merging one slice of a multi-PR issue shouldn't bump
the version yet, but each slice still gets its own CHANGELOG entry as it merges. The real
category most often lives on the issue, not the PR.

Resolution order when writing/reviewing an entry:

1. **The PR's own label wins if it carries one of the six real category labels
   directly** — a PR can legitimately be more/less user-facing than the issue it belongs
   to (e.g. an issue is `kind/enhancement` overall, but one of its PRs was pure internal
   scaffolding and is itself labeled `kind/internal` — that PR gets no entry even though
   its issue would otherwise qualify).
2. **Otherwise, fall back to the label(s) of the issue the PR closes** (GitHub's "Closes
   #N" / `closingIssuesReferences`).
3. If a PR closes more than one issue, prefer the **non-epic** issue as the source of
   truth for the title/category — `kind/epic` issues are containers, not the concrete
   change being shipped.
4. If neither the PR nor any closed issue carries a real category label, and it isn't
   `kind/internal`/`kind/epic` either, that's a labeling gap — fix the label on GitHub
   before merging, don't guess a section. (`skip-release` alone never resolves this gap —
   it doesn't carry a category and doesn't exempt the PR.)

To find a PR's closing issue(s) from the CLI:

```bash
gh api graphql -f query='
  query($owner:String!,$repo:String!,$num:Int!){
    repository(owner:$owner,name:$repo){
      pullRequest(number:$num){
        title
        closingIssuesReferences(first:5){ nodes { number title labels(first:10){nodes{name}} } }
      }
    }
  }' -f owner=InditexTech -f repo=docouture -F num=<PR_NUMBER>
```

(`gh pr view --json closingIssuesReferences` doesn't expose this field; it has to go
through `gh api graphql`.)

## Keeping PR titles aligned to their issue

Whenever a PR's title drifts from its linked issue's title (common — PRs tend to get a
shorter, code-focused title while the issue keeps the fuller/scoped one), rename the PR to
match the issue **verbatim, scope tag included**, before writing the CHANGELOG entry:

```bash
# gh pr edit can fail on this workspace's pinned gh CLI version (2.20.2) with a
# "Projects (classic)" GraphQL error even for pure title edits — use the REST API instead:
gh api repos/InditexTech/docouture/pulls/<PR_NUMBER> -X PATCH -f title="<issue title>"
```

## Adding a CHANGELOG entry for a new PR — checklist

1. Is the PR (or its closing issue, per the resolution order above) labeled only
   `kind/internal`/`kind/epic`, with no real category label anywhere? → no entry needed,
   stop here. (`skip-release` by itself does **not** stop here — keep going.)
2. Otherwise it needs exactly one of the six real category labels (`kind/enhancement`,
   `kind/bug`, `kind/documentation`, `kind/deprecated`, `kind/removed`, `kind/security`),
   resolved per the order above. If none is present, add the correct label on GitHub
   first.
3. Make sure the PR's title matches its issue's title verbatim (rename via the `gh api`
   command above if not).
4. Add `- [#<PR_ID>](<PR_URL>) <PR title>` under the matching `###` section in
   `[Unreleased]`, newest-first within the section.

## CI enforcement

`.github/workflows/code-npm_node-pr-verify.yml` fails a PR touching `code/**` that doesn't
update `code/CHANGELOG.md`, unless the PR (or its closing issue) is `kind/internal`/
`kind/epic`-only. `skip-release` is deliberately **not** in that exemption list — it only
affects `release-flow/keep-a-changelog-action`'s version-bump step in the publish workflow,
so a `skip-release` PR still fails this check if it hasn't added its entry. The same job
also fails when `CHANGELOG.md` **is** touched but neither the PR nor its closing issue
carries exactly one of the six real category labels — closing the gap where an entry gets
added under the wrong (or no) section.
