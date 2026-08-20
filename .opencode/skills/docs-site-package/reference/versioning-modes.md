# Docs versioning: Versioned (Full History) vs Standalone (Stable + Prerelease)

Part of the docs release epic (GH #78). Both modes are wired up in `pdocs new`
(GH #80, GH #81, GH #111): **standalone** (the CLI's default) is the fixed, two-entry
(stable/prerelease) selector; **versioned** is the full-history, one-entry-per-release-tag
selector. `pdocs new`'s wizard/`--mode` flag ("standalone" / "versioned") names both the
CLI choice and the mode itself — there is no separate "Mode 1"/"Mode 2" numbering to map
onto anymore.

Antora aggregates a component's content from every git ref a content source matches
(`branches`, `tags`) and stacks the results into one version selector
(`page-versions.hbs`, wired to `page.versions`). Both modes below use exactly that
mechanism — they differ only in **which refs** `content.sources[]` matches, not in
`docs/antora.yml` on `main`, which is identical for both, nor in any extra tooling.

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

**On `main`, `docs/antora.yml` is identical for both modes** — this is the key fact that
makes mode detection (see "Cutting a release" below) live in `antora-playbook.yml`
instead:

```yaml
name: weavejs
title: Weave.js
version: prerelease
prerelease: true
```

The literal string `'prerelease'` is the version identifier itself here (not a semver
number or `'next'`) — it is what a reader sees and links against
(`/weavejs/prerelease/…`) on `main`, in both modes, until a release exists.

## Versioned — Full History (Versioned Tags)

`main` is the prerelease/preview version, same shape as standalone. Every release tag
(`v1.2.0`, `v1.3.0`, …) is an immutable, independently-served version, and all of them
appear in the version dropdown — appropriate for a library whose consumers pin an old
version and need its docs to keep existing unchanged.

**On a release tag** (e.g. checked out at `v1.2.0`), `docs/antora.yml`:

```yaml
name: weavejs
title: Weave.js
version: '1.2.0'
prerelease: false
```

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
[main]` contributes the single prerelease version on top. Nothing here says how many past
versions show up; that is entirely a function of how many tags exist and match the glob —
delete or rename a tag and it drops out of the aggregate on the next build.

Cutting a release under this mode is: tag the commit, bump `docs/antora.yml`'s `version`
and flip `prerelease` to `false` on that tag (or have the release process do it as part of
tagging), rebuild. `main` never needs touching for a release to appear. A site scaffolded
by `pdocs new` gets a single **pdocs-release.yml** workflow (`.github/workflows/`) that
handles this — see "Cutting a release" below for how it tells the two modes apart and
runs the right steps for each.

## Standalone — Stable + Prerelease (rolling tag)

`main` is the prerelease/preview/work-in-progress docs; a rolling `stable` **tag**, force-
moved on each release rather than re-created, holds whatever was last published. The
selector offers exactly two entries — Stable and Prerelease — never a long historical
list. Appropriate for a product where only "what's out now" and "what's coming" matter to
a reader, and where a long tag history would be noise.

**On `stable`**, `docs/antora.yml`:

```yaml
name: weavejs
title: Weave.js
version: stable
prerelease: false
```

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
signal that history is deliberately not being kept.

Cutting a release under this mode is: force-move the `stable` tag to whatever commit on
`main` is being released, so its own `docs/antora.yml` copy at that point says
`version: stable`, `prerelease: false`. The same single **pdocs-release.yml** workflow
(`.github/workflows/`, templated by `pdocs new`) that handles versioned mode handles this
too: it patches `docs/antora.yml` via the `pdocs version` CLI command on a one-off commit
built on top of `main`'s current tip, then force-moves the `stable` tag to that commit —
`main` itself is never advanced or touched by the release step; its own `docs/antora.yml`
permanently says `version: prerelease`, `prerelease: true`. This is the operational
difference from versioned mode: there "release" means create a new immutable ref (a tag)
and a new version *entry*; here it means move an existing tag and keep the same two
version entries.

Moving `stable` does trigger a rebuild: the sibling **pdocs-publish.yml** workflow
(`.github/workflows/pdocs-publish.yml`, also templated by `pdocs new`) triggers on
`push: tags: ['stable']` (and `branches: [main]`, and versioned mode's `tags: ['v*']`),
builds the site fresh — Antora re-aggregates every ref `content.sources[]` matches, not
just the one that changed — and hands off to the CLI to publish it. See "Follow-up work"
below for what that hand-off does not yet do.

## Cutting a release: pdocs-release.yml

One workflow handles both modes — it detects which one a site is on rather than being
told, and branches its steps accordingly.

**Detection.** After checkout, a `Detect mode` step reads `docs/antora-playbook.yml`'s own
`content.sources[]` **tags**, not `docs/antora.yml` — that descriptor is identical for both
modes on `main`, so it carries no mode signal at all. A `tags:` line containing `v*` means
versioned; containing `stable` means standalone. That line is exactly what each mode's
"Prerequisite" above says is set once, at adoption time, and never changes afterwards, so
it doubles as a permanent, self-describing marker — nothing else in the repository has to
declare which mode is in effect.

**Triggers.** Two, both deliberate acts rather than a side effect of an ordinary push:

- `workflow_dispatch` — run by hand. Its `version` input defaults to `'stable'`. A
  versioned-mode run must override it with a real version (e.g. `1.2.0`) or the workflow
  fails before touching anything; a standalone run leaves the default, since standalone
  always targets `stable` regardless of what's typed there.
- `pull_request`, `types: [closed]`, `branches: ['main*']` — fires automatically when a
  pull request merges into a branch matching that glob, but only actually proceeds
  (checked in the job's own `if:`) when `github.event.pull_request.merged == true` **and**
  the PR carries the `docs/release` label. Any other close of a matching-branch PR — not
  merged, or merged without the label — is a no-op run, not an error.

**Where versioned mode's version comes from on each trigger** is the one thing that
differs by trigger rather than by mode: `workflow_dispatch` has a form field for it;
`pull_request` doesn't, so versioned mode reads a plain-text file instead —
**`docs/.release-version`** — committed by the PR being merged, containing just the target
version (e.g. `1.2.0`). Reviewed as part of that PR's diff like any other change; there is
no analogous file for standalone mode, since that mode's target is always the literal
`stable`. A `Resolve version` step picks whichever source applies before a shared
`Validate version` step checks it: empty on versioned mode fails with a message naming
which of the two ways to supply one was missed; `'stable'` on versioned mode fails too
(it's standalone's name, not a version); standalone mode with a non-empty value just gets
a warning that it's being ignored.

**Every release tag is force-recreated if it already exists — both modes, unconditionally,
no separate flag or label needed.** Standalone's `stable` is a rolling pointer by design.
Versioned mode's tags are normally immutable, but a republish (fixing a released version,
e.g. a docs typo caught after the tag went out) is a deliberate, ordinary act here — a
`Check for existing release` step (versioned mode only) just records whether the target
tag already existed, and `Push release tag` always force-pushes regardless.

**Nothing clears `docs/.release-version` after a release — it's bumped forward instead,
except on a republish.** On a genuine forward release (the target tag was new) a final
`Bump release descriptor` step advances the file to the next patch version and commits
that directly to `main`, the same idiom `just bump` uses for this workspace's own npm
packages: a throwaway `package.json` set to the just-released version, `npm version patch
--no-git-tag-version` to do the semver arithmetic, the result written back to
`docs/.release-version`. So the file always holds a sane next target rather than a stale,
already-released value or nothing at all. This step runs on `main` directly — unlike the
release commit itself (previous paragraph), which never advances `main` — and only for
versioned mode; standalone mode has no `.release-version` concept. It is **skipped** when
the target tag already existed (a republish): that run's target version was typically
already superseded by whatever `docs/.release-version` currently holds as the next
planned target, so bumping forward from the republished version would clobber that
already-planned value instead of protecting it.

**The rest of the job is genuinely shared, not two paths bolted together**: `Cut release`
computes `value`/`tag` from the detected mode (`v<version>` for versioned,
literal `stable` for standalone) and runs the same `pdocs version` + commit-then-reset
dance either way; `Create GitHub Release` is the one step that only runs for versioned
mode (`if: steps.detect.outputs.mode == 'versioned'`), since standalone mode keeps no
version history worth a Release object.

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

- **Versioned**: `latest_version_segment: latest` gives the newest release tag a
  `/weavejs/latest/…` alias, distinct from `/weavejs/prerelease/…` (the prerelease branch,
  always reachable by its own literal segment). Useful when most inbound links should
  track "whatever the newest stable release is" without editing them on every tag.
  `urls.latest_version_segment` only affects the *alias*; the version's own segment
  (`v1.2.0` or whatever `version:` says) keeps working too — both resolve.
- **Standalone**: less commonly needed, since `stable` is already a fixed, stable segment —
  `/weavejs/stable/…` never moves to a new URL on release the way a versioned-mode tag
  would. Setting `latest_version_segment: stable` is only useful if something outside the
  site specifically expects a `/latest/` URL rather than `/stable/`.

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

| | Versioned (Full History) | Standalone (Stable + Prerelease) |
| --- | --- | --- |
| Good fit | libraries/SDKs whose consumers pin an old version | products where only "now" and "next" matter |
| Version count in selector | grows with every release tag | fixed at two |
| Cutting a release | new tag + its own `antora.yml` | move `stable` tag; `antora.yml` unchanged |
| Old docs after a release | still served, unchanged, forever | overwritten — no history kept |
| Playbook `content.sources[]` | `branches: [main]` + `tags: ['v*']` | `branches: [main]` + `tags: ['stable']` |
| `docs/antora.yml` on `main` | identical for both modes: `version: prerelease`, `prerelease: true` | same |

Both are legitimate; the epic (GH #78) treats them as two supported flows, not a
recommendation of one over the other. GH #80 wired standalone mode's config shape into
`example` (never itself cut/released — a testbed only) and shipped the single
`pdocs-release.yml` / `pdocs-publish.yml` workflow templates a real site scaffolded by
`pdocs new` would actually run. GH #81 extended that same `pdocs-release.yml` to also
handle versioned mode (detected, not a separate file — see "Cutting a release" above).
GH #111 finished wiring versioned mode's config shape into `pdocs new` itself
(`antora-playbook.versioned.yml`, `docs/release-version.versioned`, behind
`--mode versioned`) — both modes are now real, CLI-scaffolded choices, not just
release-workflow logic waiting for a template. A later pass on the same issue removed the
`docs/antora.yml` override versioned mode originally had (it used to say
`version: next` on `main`; that shape was dropped in favour of the identical
`version: prerelease` descriptor both modes now share), renamed the internal `.mode1`
template marker to `.versioned`, consolidated the PR-verification playbook and `pdocs
dev`'s target under one name (`antora-playbook.local.yml`, replacing
`antora-playbook.pr-verify.yml`), and removed the `docs/force-release` label/`force` input
in favour of always force-recreating a release tag that already exists.

## PR verification and local development

Either mode's `content.sources[]` names refs — `main`, `stable`, `v*` — that a pull
request's own checkout does not have: a PR is built on a detached HEAD or a feature
branch, neither of which is `main` or a release ref. The same is true of a local `pdocs
dev` session on a feature branch. Building the real `antora-playbook.yml` there either
fails outright (the named refs aren't reachable from a shallow, single-ref checkout) or,
worse, silently succeeds while validating fewer versions than the site actually has —
neither is what "does this content build" should mean.

A site scaffolded by `pdocs new` gets a second playbook for exactly this,
**`antora-playbook.local.yml`** — one content source, `branches: HEAD`, nothing
version-specific, so it never has to change shape when a site adopts a mode or cuts a
release. It serves two purposes under one name:

- `pdocs-pr-verify.yml` (`.github/workflows/`) builds with it on every `pull_request`,
  instead of the real playbook — a plain, single-ref checkout is enough, `fetch-depth: 0`
  is never needed here because no other ref is ever read.
- `pdocs dev` (`src/commands/dev.ts`, `src/lib/dev-server.ts`) targets it too, for the same
  reason: a local checkout on any branch just needs to preview HEAD, not aggregate `main` +
  release refs it may not have.

Publishing (`pdocs-publish.yml`) is unaffected — it still builds the real
`antora-playbook.yml`.

`example` is not scaffolded by `pdocs new`, so it carries the same idea under the same
name: `antora-playbook.local.yml` (`branches: HEAD`, same rationale) — this was the
precedent the rename above followed. It's wired into that package's `build` script
(`package.json`), which is what `pnpm build` — and therefore this monorepo's own root
`pr-verify.yml` — runs; the real, versioned `antora-playbook.yml` is built explicitly
instead, by `docs.yml` and the `build:publish` script, neither of which goes through the
generic `build` target.

## CLI orchestration: why there is no `pdocs release` command

GH #82 evaluated whether cutting a release should be a dedicated `@inditextech/pdocs-cli`
command (`pdocs release`, wrapping git tag/branch/push and `gh release` itself) instead of
the workflow-level orchestration described above. **Decision: keep it in the workflow.**
`pdocs-release.yml`'s own steps depend on CI-only concerns a portable local CLI command
would either have to assume or re-implement badly: a `GITHUB_TOKEN` with `contents: write` +
`pull-requests: write`, reading which label a merged PR carried, `gh release
create`/`delete`. None of that has a sane local equivalent — a person running `pdocs
release` on their laptop still couldn't create a GitHub Release without also handing the
CLI a token and reimplementing the label-driven trigger logic.

The CLI's release-adjacent surface stays deliberately narrow: `pdocs version` (already
shipped) is the one piece of actual logic the workflow reuses — patching
`docs/antora.yml`'s `version:`/`prerelease:` fields — because that part genuinely is
portable, needed both from CI and by a person testing a mode change locally, and is now
covered by unit tests (`src/lib/antora-yml.spec.ts`, `src/commands/version.spec.ts`) added
as part of #82. Everything else — detecting the mode, resolving the target version,
tagging, force-pushing, creating the Release, bumping `docs/.release-version` — stays exactly
where it already lived after #80/#81: in `pdocs-release.yml` itself.

## Follow-up work

Deliberately not built as part of GH #80 — tracked here so a later issue picks up
from a documented starting point rather than rediscovering the gaps:

- **~~Mode selection is manual.~~ Done (GH #93).** `pdocs new` prompts interactively
  (in a terminal, unless `--yes` is given) for name, title and versioning mode, and
  scripting still works non-interactively via `--mode standalone|versioned`. It
  scaffolds into `docs/` (and `.github/workflows/`) of an **existing** repository —
  it no longer creates a fresh nested one or runs `git init`/commits anything itself;
  it requires `docs/` (and each workflow filename) to not already exist.
- **~~Versioned mode's config shape isn't wired into `pdocs new`.~~ Done (GH #111).**
  `--mode versioned` scaffolds `antora-playbook.versioned.yml` and a seeded
  `docs/.release-version`, laid down over the standalone default the same way standalone
  itself already was — `pdocs-release.yml`'s versioned-mode logic finally has a template
  that produces sites shaped for it. `docs/antora.yml` itself is never overridden — it is
  identical for both modes.
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
