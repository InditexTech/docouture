# The playbook, key by key

`antora-playbook.yml` is Antora's only configuration file: content sources, UI, output and
AsciiDoc attributes. Upstream reference: https://docs.antora.org/antora/latest/playbook/

Both site packages carry the same playbook with the title, start page and `start_path`
changed. What follows is what each key does, what this repository sets it to, and what the
sites deliberately do not set.

## site

```yaml
site:
  title: Example Documentation
  # url: https://docs.example.com
  start_page: example::index.adoc
```

| key | notes |
| --- | --- |
| `title` | header text and the `<title>` suffix |
| `url` | the deployed base URL. Required for `sitemap.xml`, canonical links and any absolute URL the UI emits. Left commented while developing: setting it to a wrong value is worse than leaving it out |
| `start_page` | a resource ID, so it carries the component name: `<component>::index.adoc`. Generates the redirect at the site root |
| `robots` | not set. `robots: allow` or a literal `robots.txt` body, for a public deployment |
| `keys` | not set. Analytics and search integration keys the UI reads from the site model |

## content

```yaml
content:
  sources:
    - url: ../../..
      start_path: code/packages/example/docs
      branches: HEAD
```

`url` names a **git repository**, local or remote. Everything else in the entry is resolved
inside that repository, so `start_path` is repo-root relative — the reason for the fully
qualified path from a playbook three directories down.

| key | notes |
| --- | --- |
| `url` | `.` or a relative path for a local repo; an https/ssh URL for a remote one. A worktree path resolves to its enclosing repository |
| `start_path` | directory containing `antora.yml`, from the repo root |
| `start_paths` | plural form: several components from one repository |
| `branches` | `HEAD` = the checked-out branch, worktree included. A branch name or glob (`v*`) instead, for versioned docs. Default is `[HEAD, v{0..9}*]` |
| `tags` | tag names or globs, for release-tagged versions |
| `edit_url` | overrides the "Edit this page" link. Inferred for known hosts; `false` disables it |

Multiple entries are how a site aggregates components from several repositories. Each one
contributes whatever components its `start_path` finds; Antora merges them into a single
site by component name and version.

## ui

```yaml
ui:
  bundle:
    url: ../ui-bundle/build/ui-bundle.zip
    snapshot: true
```

| key | notes |
| --- | --- |
| `bundle.url` | a filesystem path or an https URL to a `.zip`. **Literal — no globbing.** That is why `ui-bundle` emits an unversioned copy alongside `ui-bundle-<version>.zip` |
| `bundle.snapshot` | `true` disables caching of the bundle. Mandatory for a local build; must be `false` for a published, immutable one, or every build re-downloads it |
| `bundle.start_path` | a directory inside the zip, if the bundle is nested |
| `default_layout` | the layout for pages with no `page-layout` attribute. Defaults to `default` |
| `output_dir` | where UI assets land inside the site. Defaults to `_` |
| `supplemental_files` | files overlaid onto the bundle at build time — a per-site logo or an extra partial, without forking the bundle |

Retargeting for a real deployment: point at the published artifact and turn the snapshot
off, preferring the versioned name so the site records what it was built against.

```yaml
ui:
  bundle:
    url: https://example.com/pdocs-ui-bundle/releases/0.1.0/ui-bundle-0.1.0.zip
    snapshot: false
```

## output

```yaml
output:
  dir: build/site
```

Relative to the playbook. It is duplicated in `code/nx.json` as the cached output glob
`{projectRoot}/build`, so a change here needs a matching change there.

`output.destinations` is the plural form and takes providers other than `fs` — `archive`
writes the site as a zip. Not used here.

## runtime

```yaml
runtime:
  log:
    failure_level: warn
```

`failure_level: warn` makes Antora exit non-zero if it logged any warning: a broken xref,
an unresolved include, a page missing from the nav. The alternative is a site that
publishes with silent gaps.

Also available: `runtime.cache_dir` (default `~/.cache/antora` — where remote content and
non-snapshot UI bundles land), `runtime.fetch` (the `--fetch` flag in file form) and
`runtime.log.format`/`level`.

## asciidoc

```yaml
asciidoc:
  attributes:
    experimental: ''
    icons: font
    sectanchors: ''
    idprefix: ''
    idseparator: '-'
```

Attributes set here are the site-wide defaults; a page can override any of them unless the
value ends in `@` (soft-set, page wins) — see the `asciidoc` skill for the precedence rules
and what each of these attributes turns on.

`asciidoc.extensions` is the list of Asciidoctor extensions, given as package names or
paths. `antora.extensions` (a top-level key, not under `asciidoc`) is the separate list of
Antora pipeline extensions. Extension packages belong in `packages/asciidoc-ext-*` and
`packages/antora-ext-*` respectively, depended on with `workspace:*` and referenced by
package name — pnpm's workspace link makes them resolvable from the playbook.

## urls

Not set by either site. It controls URL shape, and is the key to reach for when a
migration has to preserve existing links.

| key | default | effect |
| --- | --- | --- |
| `html_extension_style` | `indexify` | `page/` (a directory with `index.html`). `default` → `page.html`, `drop` → `page` |
| `redirect_facility` | `static` | how `page-aliases` are implemented: `static` HTML redirects, or `netlify`/`nginx` config |
| `latest_version_segment` | unset | a fixed segment such as `latest` aliasing the current version |
