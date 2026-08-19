# Weave.js Fumadocs → AsciiDoc migration

One-off converter for the Weave.js documentation migration into
`code/packages/example`. Not an Nx project and not a pnpm workspace member —
deliberately outside the `packages/*` glob in `code/pnpm-workspace.yaml`, same
reasoning as `tools/ids` (a dev-only tool nobody but the migration itself
needs installed).

```
pnpm -C code/tools/fumadocs-migrate install --ignore-workspace
node migrate.mjs --pilot                    # the 6 agreed pilot pages
node migrate.mjs --all                      # the full ~450-page corpus (Phase 3)
node migrate.mjs sdk/index.mdx main/glossary.mdx ...   # specific pages
node build-nav.mjs                          # regenerate all 7 nav.adoc (Phase 4)
```

`migrate.mjs --all` wipes and regenerates every module's `examples/`/`images/`
first (100% converter-managed, unlike `pages/` — see migrate.mjs's own
comment); it's a full regeneration, not an incremental one. `build-nav.mjs`
always regenerates all 7 `nav.adoc` in full — there's no incremental mode.
Re-run either whenever this converter changes or upstream content does.

Paths passed on the command line are relative to
`/Users/jesusmpc/inditex/weavejs/docs/content/docs/` (`WEAVEJS_DOCS_ROOT` in
`migrate.mjs`). Output lands in
`code/packages/example/docs/modules/<root>/pages/...`, mirroring the source
path 1:1 — see the migration plan for why the module names match Fumadocs'
root segments exactly (URL parity).

## What it does

Parses each `.mdx` file with `remark` + `remark-mdx` (frontmatter, GFM tables
included) and walks the resulting MDAST, emitting AsciiDoc via
`lib/emit.mjs`. Handles, without any further follow-up:

- frontmatter → `= Title` / `:description:`
- `Callout` → `NOTE`/`WARNING` admonition blocks
- `TypeTable` → a real AsciiDoc table (the `type` attribute is a JS object
  literal; evaluated with `Function`, not parsed — see `evalJsxExpression`)
- `Kbd` → `kbd:[]`, `Tag`/`Tags` → `label:[]` (color aliased where Fumadocs
  used one the DS doesn't ship, e.g. `lime` → `green`)
- `Separator` → `'''`, `Accordion(s)` → `[%collapsible]`
- `<include>` → copies the referenced file into the module's `examples/`,
  emits `include::example$...[]` (brackets in the source path — Next.js
  dynamic-route folders like `[roomId]` — are stripped from the copy
  destination and the include target, never from the visible `.Title`)
- `// [!code ++]` / `// [!code --]` → AsciiDoc callouts, and Fumadocs' older
  `// (N)` convention → literal `<N>` (see `lib/code-annotations.mjs`) — the
  two do NOT share a numbering sequence; see that file's header comment for
  why a bare `[!code]` marker in an otherwise explicitly-numbered file is
  stripped silently rather than auto-numbered
- `/docs/<root>/<rest>` links → `xref:<root>:<rest>.adoc[]`, including
  Fumadocs/Next.js directory-index routes (`/docs/main/build` →
  `main:build/index.adoc`, not the file that doesn't exist) — `lib/links.mjs`
- images → copied into `main`'s `images/` (all 65 references in the corpus
  are under `main`; see the migration analysis for why that isn't a general
  assumption elsewhere)
- `Cards`/`Card` → the `[cards]` Asciidoctor extension (a plain AsciiDoc
  dlist under the hood — no bespoke syntax)
- `.fd-steps`/`.fd-step` → the `[steps]` Asciidoctor extension. Only an `h3`
  heading starts a new step (Fumadocs' own selector is literally
  `[&_h3]:fd-step`) — an `h4` inside a step's body stays body content, not
  its own step
- heading levels → normalized per page via a stack (`computeHeadingLevels`
  in `migrate.mjs`), not mapped 1:1 from mdast depth: Fumadocs' own heading
  levels are inconsistent in ways a flat per-page offset can't fix — some
  pages start at `###` instead of `##`, some later drop back to a shallower
  level for an unrelated sibling section, some skip a level entirely
  partway through (`## Methods` → `#### connect`, no `###` between). All
  three are real, confirmed by a full Antora build, not by inspection.

Degraded, pending the Mermaid follow-up issue:

- `Mermaid` → a literal `[mermaid]` block with the same diagram source a
  future kroki/mermaid extension would consume unchanged (handles both the
  common `chart={` template-literal expression `}` form and the 3 files that
  use a plain quoted `chart="..."` JSX string instead)

Handled since GH-45: code fences with `tab="..."` meta (only `main/
quickstart.mdx` uses this, 12 blocks across 4 groups) are grouped into a real,
independent `[tabs]` block (`asciidoc-extensions/lib/tabs.js`) instead of each
fence becoming its own separately titled listing. A lone tab-meta fence with no
adjacent sibling sharing the convention still gets the old `.Label`-title
treatment — see `renderTabGroup`'s own comment in `lib/emit.mjs`. `<Tabs>`/
`<Tab>` JSX (imported but never actually used in `quickstart.mdx`) is still
unhandled.

## `build-nav.mjs` (Phase 4)

Generates all 7 `nav.adoc` from each root's own `meta.json` tree, reproducing
three Fumadocs `pages[]` conventions — `"---Label---"` separator,
`"...name"` splice (same nesting level, no wrapper), and a plain slug
(leaf `.mdx` file or nested expandable folder, recursing into its own
`meta.json`) — plus the fallback Fumadocs itself uses for a directory with no
`meta.json` of its own (`main/manual-installation`,
`react/api-reference/{providers,hooks}`, `types/api-reference/`): auto-expand
every file/subdirectory alphabetically.

A folder reference wins over a same-named flat file when both exist — see
`lib/links.mjs`'s own comment on the one such collision in the corpus
(`sdk/api-reference/weave.mdx`, excluded from conversion in favour of the
`weave/` folder — migrate.mjs's own EXCLUDE comment has the full story). Both
`migrate.mjs` and `build-nav.mjs` need to agree on this precedence
independently; getting only one of them right still breaks the other (caught
twice, once for content links, once for nav — see below).

A `meta.json` slug that matches no real file or folder (`main/build/plugins`'s
`stage-keyboard` — the real file is `stage-keyboard-move.mdx`; three
`api-reference/meta.json`s listing `"index"` first when no `index.mdx` exists
in that directory at all; a dozen changelog/prerelease versions, including
`0.77.2`, that were never actually published) is a pre-existing content bug,
same policy as an unresolved content link: still emit a best-effort `xref`
rather than silently dropping the nav entry, so it surfaces via the same real
build rather than only ever appearing in this script's own console output.

Fumadocs' `"---Label---"` separator has no equivalent in this UI bundle by
default: `nav-tree.hbs` originally rendered no row at all for any nav entry
with no `url`, including a linkless _leaf_ (a label with no children) — only
a linkless _parent with children_ is meant to render invisibly (a pure
grouping wrapper). Fixed in `code/packages/ui-bundle` itself
(`nav-tree.hbs` + a small `side-menu.css` rule) rather than dropped from
`nav.adoc`, since it's a real, generally useful sidebar capability, not a
Weave.js-specific hack — worth knowing if this bundle is used for another
migration that also carries category-only nav labels.

## What it can't catch

Nothing here re-validates the _content_ of what it converts — only whether
its own transforms ran without throwing. A handful of pre-existing bugs in
the Fumadocs source were found this way — by inspection for the two below,
and by an actual full Antora build (not just this tool's own warnings) for
the rest — and none of them is something the converter should silently fix:

- broken `/docs/...` links whose target doesn't match any real page, in
  either the direct-file or directory-index shape: a missing `sdk` segment
  (`brush-tool.mdx`), a singular/plural slip (`sdk/.../export-node-tool`,
  `main/build/node/comment`), a wrong section (`main/build/plugins/move-tool`
  is actually under `actions/`, `.../node-selection` doesn't exist under
  either name), and one changelog cross-reference to a version that was
  never published (`0.77.2`) — the converter still emits an `xref` for all
  of these (rather than dropping the link) specifically so Antora's own
  `runtime.log.failure_level: warn` catches them structurally
- a malformed code fence in `main/manual-installation/index.mdx` (a stray
  two-backtick ` ` `` instead of a closing triple-backtick) that produces
  syntactically-valid-but-wrong AsciiDoc output — no warning fires because
  nothing throws; only caught by reading the rendered page

Every warning the converter _does_ detect (unhandled component, unresolved
link, failed `TypeTable`/`Mermaid` expression eval) prints in a summary at
the end of a run — 6 for the full corpus as of Phase 3, all in the list
above. Treat that list as the Phase 5 manual-review starting point, not as
exhaustive: a full build is still the real check (see below).

## Verifying against a real build

This tool's own warning summary only catches what it _notices_ going wrong
(an unhandled node type, a failed eval). It does NOT catch bad AsciiDoc
syntax, broken cross-references, or structurally invalid section nesting —
several real bugs during Phase 3 were only caught by actually building the
site (`pnpm nx run @inditextech/pdocs-example:build`) and reading Antora's
own errors, not by anything this converter reported:

- a heading-level mapping bug that produced "section title out of sequence"
  and, on the first attempted fix, "level 0 sections can only be used when
  doctype is book" (an off-by-one between "level" and `=` count)
- a callout-numbering bug where an auto-continued sequence collided with a
  separate, unrelated explanation list for the same code block ("no callout
  found for <N>", "callout list item index: expected N, got M")
- literal `[roomId]`-style brackets in an include target that Antora's
  `example$` resource-id resolution can't find ("target of include not
  found")
- (Phase 4) the folder-vs-flat-file precedence bug above, in `rewriteDocLink`
  rather than `build-nav.mjs` — one file, `sdk:api-reference/weave.adoc`,
  accounted for 77 broken-xref errors in one build, all from ordinary
  content links, not navigation
- (Phase 4) the "---Label---" separator rendering as nothing at all — not an
  Antora error, a silent visual gap only caught by actually opening the
  built site and expanding the sidebar

None of these are visible from the generated `.adoc` alone — they only
surface once Antora actually parses it, or once the built site is actually
opened. Before Phase 4, `nav.adoc` wasn't populated yet, so a full build
needed a temporary throwaway flat nav (every `pages/**/*.adoc` per module as
a bare `xref`) to exercise the whole corpus at all; now that `build-nav.mjs`
produces the real navigation, a plain `pnpm nx run
@inditextech/pdocs-example:build` exercises everything with no extra setup.
