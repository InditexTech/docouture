# Docs versioning: Mode 1 (Full History) vs Mode 2 (Stable + Prerelease)

Part of the docs release epic (GH #78). Mode 2 is wired up and verified on `example`
(GH #80) — its `docs/antora.yml` and `antora-playbook.yml` show the real, live shape;
Mode 1 is still guidance only, not yet wired up anywhere (GH #81).

Antora aggregates a component's content from every git ref a content source matches
(`branches`, `tags`) and stacks the results into one version selector
(`page-versions.hbs`, wired to `page.versions`). Both modes below use exactly that
mechanism — they differ only in **which refs** `content.sources[]` matches and **what
`docs/antora.yml` declares on each one**, not in any extra tooling.

The two names that matter, and where they are set, throughout this page:

| name | set in | scope |
| --- | --- | --- |
| `version` | `docs/antora.yml` | per ref — a ref's own checkout declares its own version |
| `prerelease` | `docs/antora.yml` | per ref — `true`/`false`, or a string used as the version's qualifier label |
| `branches` / `tags` | `antora-playbook.yml` → `content.sources[]` | which refs the *build* pulls content from at all |

`docs/antora.yml` is read once **per matched ref** — a tag and `main` each get their own
checkout and therefore their own `antora.yml`, even though it is "the same file" in the
sense that both trace back to the same path in git history. That is the whole mechanism:
there is no separate versioning config, just this file differing ref to ref.

## Mode 1 — Full History (Versioned Tags)

`main` is `next`/prerelease development. Every release tag (`v1.2.0`, `v1.3.0`, …) is an
immutable, independently-served version, and all of them appear in the version dropdown —
appropriate for a library whose consumers pin an old version and need its docs to keep
existing unchanged.

**On a release tag** (e.g. checked out at `v1.2.0`), `docs/antora.yml`:

```yaml
name: weavejs
title: Weave.js
version: '1.2.0'
prerelease: false
```

**On `main`**, the same file:

```yaml
name: weavejs
title: Weave.js
version: 'next'
prerelease: true
```

`version: 'next'` (rather than e.g. `'1.3.0-wip'`) is the conventional label for
"unreleased" — it does not sort into the numeric version history and reads unambiguously
as not-yet-cut. `prerelease: true` is what tags it green/latest-adjacent rather than a
past version in the selector; it can also be a string (`prerelease: 'next'`) if the label
itself should differ from the sort key.

**Playbook**, `content.sources[]`:

```yaml
content:
  sources:
    - url: https://github.com/example/weavejs
      start_path: docs
      branches: [main]
      tags: ['v*']
```

`tags: ['v*']` matches every tag shaped `v1.2.0`, `v2.0.0`, etc. — each becomes its own
version because each tag's own `docs/antora.yml` carries a different `version:`. `branches:
[main]` contributes the single `next` version on top. Nothing here says how many past
versions show up; that is entirely a function of how many tags exist and match the glob —
delete or rename a tag and it drops out of the aggregate on the next build.

Cutting a release under this mode is: tag the commit, bump `docs/antora.yml`'s `version`
and flip `prerelease` to `false` on that tag (or have the release process do it as part of
tagging), rebuild. `main` never needs touching for a release to appear. A site scaffolded
by `pdocs new` gets a single **pdocs-release.yml** workflow (`.github/workflows/`) that
handles this — see "Cutting a release" below for how it tells Mode 1 and Mode 2 apart and
runs the right steps for each.

## Mode 2 — Stable + Prerelease (Dual-branch or rolling tag)

`main` is the prerelease/preview/work-in-progress docs; a second ref holds whatever was
last published. That second ref can be either a `stable` branch or — what `example`
actually uses (GH #80) — a rolling `stable` **tag**, force-moved on each release rather
than re-created. The selector offers exactly two entries — Stable and Prerelease — never a
long historical list. Appropriate for a product where only "what's out now" and "what's
coming" matter to a reader, and where a long tag history would be noise.

**On `stable`**, `docs/antora.yml`:

```yaml
name: weavejs
title: Weave.js
version: 'stable'
prerelease: false
```

**On `main`**, the same file:

```yaml
name: weavejs
title: Weave.js
version: 'prerelease'
prerelease: true
```

The literal strings `'stable'` and `'prerelease'` are the version identifiers themselves
here (not a semver number) — that is what keeps the selector at exactly two rows
regardless of how many commits or releases have happened, and it is also what a reader
sees and links against (`/weavejs/stable/…` vs `/weavejs/prerelease/…`).

**Playbook**, `content.sources[]`:

```yaml
content:
  sources:
    - url: https://github.com/example/weavejs
      start_path: docs
      branches: [main]
      tags: ['stable']
```

One branch and one pinned tag name (not a glob) — this mode has nothing else to
aggregate from tags, so `tags: ['stable']` matching exactly one literal name is the
signal that history is deliberately not being kept. (The branch-pair variant — `branches:
[main, stable]`, no `tags:` key at all — is equivalent in effect; which one a site uses is
just a question of whether "stable" is a moving branch tip or a moving tag, both driven
by the same release step.)

Cutting a release under this mode is: force-move whichever ref (`stable` branch tip, or
`stable` tag) is being used to whatever commit on `main` is being released, so its own
`docs/antora.yml` copy at that point says `version: stable`, `prerelease: false`. The same
single **pdocs-release.yml** workflow (`.github/workflows/`, templated by `pdocs new`) that
handles Mode 1 handles this too — the tag variant, matching what `example` is *configured*
for (`example` itself is a testbed and is never actually released, so nothing in the pdocs
monorepo's own CI ever runs this): it patches `docs/antora.yml` via the `pdocs version`
CLI command on a one-off commit built on top of `main`'s current tip, then force-moves the
`stable` tag to that commit — `main` itself is never advanced or touched by the release
step; its own `docs/antora.yml` permanently says `version:
prerelease`, `prerelease: true` from the moment a site opts into Mode 2. This is the
operational difference from Mode 1: there "release" means create a new immutable ref (a
tag) and a new version *entry*; here it means move an existing ref's tip (or a tag) and
keep the same two version entries.

Moving `stable` does trigger a rebuild: the sibling **pdocs-publish.yml** workflow
(`.github/workflows/pdocs-publish.yml`, also templated by `pdocs new`) triggers on
`push: tags: ['stable']` (and `branches: [main]`, and Mode 1's `tags: ['v*']`), builds the
site fresh — Antora re-aggregates every ref `content.sources[]` matches, not just the one
that changed — and hands off to the CLI to publish it. See "Follow-up work" below for what
that hand-off does not yet do.

## Cutting a release: pdocs-release.yml

One workflow handles both modes — it detects which one a site is on rather than being
told, and branches its steps accordingly.

**Detection.** After checkout, a `Detect mode` step reads `docs/antora.yml`'s `version:`
field on `main`: `next` → Mode 1, `prerelease` → Mode 2. That field is exactly the one each
mode's "Prerequisite" above says never changes on `main`, so it doubles as a permanent,
self-describing marker — nothing else in the repository has to declare which mode is in
effect.

**Triggers.** Two, both deliberate acts rather than a side effect of an ordinary push:

- `workflow_dispatch` — run by hand. Its `version` input defaults to `'stable'`. A
  Mode 1 run must override it with a real version (e.g. `1.2.0`) or the workflow fails
  before touching anything; a Mode 2 run leaves the default, since Mode 2 always targets
  `stable` regardless of what's typed there. Its second input, `force`, defaults to
  `false` — see "Republishing" below.
- `pull_request`, `types: [closed]`, `branches: ['main*']` — fires automatically when a
  pull request merges into a branch matching that glob, but only actually proceeds
  (checked in the job's own `if:`) when `github.event.pull_request.merged == true` **and**
  the PR carries the `docs/release` or `docs/force-release` label. Any other close of a
  matching-branch PR — not merged, or merged without either label — is a no-op run, not
  an error.

**Where Mode 1's version comes from on each trigger** is the one thing that differs by
trigger rather than by mode: `workflow_dispatch` has a form field for it;
`pull_request` doesn't, so Mode 1 reads a plain-text file instead —
**`docs/.release-version`** — committed by the PR being merged, containing just the target
version (e.g. `1.2.0`). Reviewed as part of that PR's diff like any other change; there is
no analogous file for Mode 2, since that mode's target is always the literal `stable`. A
`Resolve version` step picks whichever source applies before a shared `Validate version`
step checks it: empty on Mode 1 fails with a message naming which of the two ways to
supply one was missed; `'stable'` on Mode 1 fails too (it's Mode 2's name, not a version);
Mode 2 with a non-empty value just gets a warning that it's being ignored.

**Nothing clears `docs/.release-version` after a release — it's bumped forward instead.**
On a genuine forward release (not a forced republish — see below) a final `Bump release
descriptor` step advances the file to the next patch version and commits that directly to
`main`, the same idiom `just bump` uses for this workspace's own npm packages: a throwaway
`package.json` set to the just-released version, `npm version patch --no-git-tag-version`
to do the semver arithmetic, the result written back to `docs/.release-version`. So the
file always holds a sane next target rather than a stale, already-released value or
nothing at all. This step runs on `main` directly — unlike the release commit itself
(next paragraph), which never advances `main` — and only for Mode 1; Mode 2 has no
`.release-version` concept.

## Republishing (Mode 1 only)

A tag, once pushed, is immutable by default (see "Push release tag" below) — the same
version can't just be re-released by merging another PR with the same
`docs/.release-version` value. That's deliberate: it stops a stale leftover value from
silently re-tagging something already out. But sometimes a fix genuinely does need to land
on an already-released version (a docs typo caught after the tag went out, say), which
needs a way to say "yes, overwrite this one on purpose."

That's what the second label, **`docs/force-release`**, and the `workflow_dispatch`
`force` input are for — plain `docs/release` (or `force: false`) refuses to move an
existing tag; either of those two flips a `Resolve force` step's output to `true`, and
every following step (tag push, GitHub Release) takes the force path instead:

- **Tag**: `git push --force` moves it to the new commit instead of failing.
- **GitHub Release**: the existing Release object is deleted (`gh release delete`, a
  no-op if none exists yet) before a fresh one is created, so its notes reflect the new
  commit rather than erroring against a Release that already exists.
- **`docs/.release-version` bump**: deliberately **skipped** on a forced run. A forced
  republish targets a version that's typically already been superseded by whatever
  `docs/.release-version` currently holds as the next planned target — bumping forward
  from the old, republished version would clobber that already-planned value instead of
  protecting it.

**Without force**, hitting an existing tag fails the run outright (`Check for existing
release` step) with a message naming the label to add. When that run came from a merged
PR, the same step also leaves a comment on it — `gh pr comment` — pointing at
`docs/force-release`; a `workflow_dispatch` run has no PR to comment on, so it only gets
the failing log.

**The rest of the job is genuinely shared, not two paths bolted together**: `Cut release`
computes `value`/`tag` from the detected mode (`v<version>` + no-force push for Mode 1,
literal `stable` + force push for Mode 2) and runs the same `pdocs version` +
commit-then-reset dance either way; `Create GitHub Release` is the one step that only runs
for Mode 1 (`if: steps.detect.outputs.mode == 'mode1'`), since Mode 2 keeps no version
history worth a Release object.

## URL routing

Both modes get a component-scoped version segment for free — `/weavejs/1.2.0/…`,
`/weavejs/stable/…` — Antora always includes the version in the URL unless told otherwise.
The one playbook key that changes routing behaviour, `urls.latest_version_segment`, is
about giving one version an *additional*, stable alias URL:

```yaml
urls:
  latest_version_segment: latest
```

With this set, whichever version Antora computes as "latest" for a component is also
served at a fixed alias — `/weavejs/latest/…` — alongside its real version path, so an
external link that should always point at "whatever is current" does not need editing on
every release.

"Latest" is Antora's own computation (a semver-aware comparison across all a component's
matched versions), **not** `prerelease`/`version` on their own — `prerelease: true` keeps
a version out of the "latest" running (Antora's default is to compute latest among
non-prerelease versions), it does not directly set the alias target.

- **Mode 1**: `latest_version_segment: latest` gives the newest release tag a
  `/weavejs/latest/…` alias, distinct from `/weavejs/next/…` (the prerelease branch, always
  reachable by its own literal segment). Useful when most inbound links should track
  "whatever the newest stable release is" without editing them on every tag.
  `urls.latest_version_segment` only affects the *alias*; the version's own segment
  (`v1.2.0` or whatever `version:` says) keeps working too — both resolve.
- **Mode 2**: less commonly needed, since `stable` is already a fixed, stable segment —
  `/weavejs/stable/…` never moves to a new URL on release the way a Mode 1 tag would.
  Setting `latest_version_segment: stable` is only useful if something outside the site
  specifically expects a `/latest/` URL rather than `/stable/`.

## Version descriptor labels and display names

The version dropdown (`page-versions.hbs`) always renders the real, computed
`displayVersion` — nothing in the UI bundle invents a label. What ends up on screen is
controlled entirely from `docs/antora.yml`:

- `version` is both the sort/identity key and, by default, the displayed label.
- `display_version` (optional) overrides just the label, when the identity key needs to
  stay a plain sortable string but the reader-facing text should differ — e.g.
  `version: '1.2.0'`, `display_version: 'v1.2.0 (LTS)'`.
- The green "latest" highlight on the version tag (`header-toolbar__version--latest`) is
  `page.componentVersion.latest`, Antora's own computed flag — not something either mode's
  `antora.yml` sets directly.

## Choosing between the two

| | Mode 1 (Full History) | Mode 2 (Stable + Prerelease) |
| --- | --- | --- |
| Good fit | libraries/SDKs whose consumers pin an old version | products where only "now" and "next" matter |
| Version count in selector | grows with every release tag | fixed at two |
| Cutting a release | new tag + its own `antora.yml` | move `stable`'s ref; `antora.yml` unchanged |
| Old docs after a release | still served, unchanged, forever | overwritten — no history kept |
| Playbook `content.sources[]` | `branches: [main]` + `tags: ['v*']` | `branches: [main]` + `tags: ['stable']` (or `branches: [main, stable]`) |

Both are legitimate; the epic (GH #78) treats them as two supported flows, not a
recommendation of one over the other. GH #80 has wired Mode 2's config shape into
`example` (never itself cut/released — a testbed only) and shipped the single
`pdocs-release.yml` / `pdocs-publish.yml` workflow templates a real site scaffolded
by `pdocs new` would actually run. GH #81 extended that same `pdocs-release.yml` to also
handle Mode 1 (detected, not a separate file — see "Cutting a release" above), but has not
wired Mode 1's config shape into `example` or any other site — still guidance-only in that
sense.

## PR verification

Either mode's `content.sources[]` names refs — `main`, `stable`, `v*` — that a pull
request's own checkout does not have: a PR is built on a detached HEAD or a feature
branch, neither of which is `main` or a release ref. Building the real
`antora-playbook.yml` there either fails outright (the named refs aren't reachable from a
shallow, single-ref checkout) or, worse, silently succeeds while validating fewer versions
than the site actually has — neither is what "does this PR's docs change build" should
mean.

A site scaffolded by `pdocs new` gets a second playbook for exactly this,
`antora-playbook.pr-verify.yml` — one content source, `branches: HEAD`, nothing
version-specific, so it never has to change shape when a site adopts a mode or cuts a
release. `pdocs-pr-verify.yml` (`.github/workflows/`) builds with it on every
`pull_request`, instead of the real playbook — a plain, single-ref checkout is enough,
`fetch-depth: 0` is never needed here because no other ref is ever read. Publishing
(`pdocs-publish.yml`) is unaffected — it still builds the real `antora-playbook.yml`.

`example` is not scaffolded by `pdocs new`, so it carries the same idea under its own,
earlier name: `antora-playbook.local.yml` (`branches: HEAD`, same rationale). It's wired
into that package's `build` script (`package.json`), which is what `pnpm build` — and
therefore this monorepo's own root `pr-verify.yml` — runs; the real, versioned
`antora-playbook.yml` is built explicitly instead, by `docs.yml` and the `build:publish`
script, neither of which goes through the generic `build` target.

## Follow-up work

Deliberately not built as part of GH #80 — tracked here so a later issue (or #82) picks up
from a documented starting point rather than rediscovering the gaps:

- **Mode selection is manual.** `pdocs new` doesn't ask which versioning mode a site wants,
  or generate the matching `docs/antora.yml` + `antora-playbook.yml` shape. The intended
  UX: prompt interactively when a `--versioning` flag isn't given, generate the right
  shape for the chosen mode — `pdocs-release.yml` itself already handles either mode
  without needing to know which was picked, since it detects that from
  `docs/antora.yml` at release time.
- **`pdocs doctor` does not exist.** Should check that a site's `.github/workflows/`
  contains `pdocs-publish.yml`, `pdocs-pr-verify.yml` and `pdocs-release.yml`, and that
  none has drifted from what the currently-installed `@inditextech/pdocs-cli` would
  generate — the same regenerate-in-memory-and-diff idiom this monorepo's own
  `just ids-check` already uses, rather than a version-marker comment (which drifts from
  reality the moment a template changes without a version bump, or someone hand-edits the
  file).
- **`pdocs publish` does not exist.** `pdocs-publish.yml` already calls `npx pdocs publish`
  after building, but the command itself, and the pluggable "publish-target
  antora-extension" mechanism it's meant to dispatch to (GitHub Pages, S3, Azure Static Web
  Apps, Netlify, ...), are both undesigned. Until it exists, `pdocs-publish.yml` is
  build-only in effect.
- **No refresh path for an existing site.** `pdocs new` only scaffolds empty directories.
  Once `doctor` can detect workflow drift, something needs to be able to fix it in a repo
  that already exists — a `pdocs sync` / `pdocs workflows update` command, not yet designed.

## Upstream reference

- Antora versioning: https://docs.antora.org/antora/latest/component-version-descriptor/#version-fields
- Content source refs: https://docs.antora.org/antora/latest/playbook/content-source-branches-tags/
- `urls.latest_version_segment`: https://docs.antora.org/antora/latest/playbook/urls-latest-version-segment/
