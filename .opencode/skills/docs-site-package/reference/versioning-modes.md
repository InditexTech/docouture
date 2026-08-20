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
tagging), rebuild. `main` never needs touching for a release to appear.

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
`docs/antora.yml` copy at that point says `version: stable`, `prerelease: false`. A site
scaffolded by `pdocs new` gets a **pdocs-release.yml** workflow for exactly this
(`.github/workflows/pdocs-release.yml`; the tag variant, matching what `example` is
*configured* for — `example` itself is a testbed and is never actually released, so
nothing in the pdocs monorepo's own CI ever runs this): it patches `docs/antora.yml` via
the `pdocs version` CLI command on a one-off commit built on top of `main`'s current tip,
then force-moves the `stable` tag to that commit — `main` itself is never advanced or
touched by the release step; its own `docs/antora.yml` permanently says `version:
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
recommendation of one over the other. GH #81 verifies Mode 1; GH #80 has wired Mode 2's
config shape into `example` (never itself cut/released — a testbed only) and shipped the
`pdocs-release.yml` / `pdocs-publish.yml` workflow templates a real site scaffolded by
`pdocs new` would actually run.

## Follow-up work

Deliberately not built as part of GH #80 — tracked here so a later issue (or #82) picks up
from a documented starting point rather than rediscovering the gaps:

- **Mode selection is manual.** `pdocs new` doesn't ask which versioning mode a site wants,
  or generate the matching config + `pdocs-release.yml` variant. The intended UX: prompt
  interactively when a `--versioning` flag isn't given, generate the right
  `docs/antora.yml` + `antora-playbook.yml` shape and the matching `pdocs-release.yml`
  (Mode 1's variant does not exist yet — the current file is Mode 2 only).
- **`pdocs doctor` does not exist.** Should check that a site's `.github/workflows/`
  contains both `pdocs-release.yml` and `pdocs-publish.yml`, and that neither has drifted
  from what the currently-installed `@inditextech/pdocs-cli` would generate — the same
  regenerate-in-memory-and-diff idiom this monorepo's own `just ids-check` already uses,
  rather than a version-marker comment (which drifts from reality the moment a template
  changes without a version bump, or someone hand-edits the file).
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
