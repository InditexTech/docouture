# @inditextech/pdocs-asciidoc-extensions

Asciidoctor extensions shared by the pdocs documentation sites.

They exist for one reason: **authored content that AsciiDoc has no syntax for**.
A card grid, a set of steps, a landing hero, a tab switcher — none of these are
expressible in AsciiDoc, and none of them belong baked into a Handlebars layout,
because then they stop being content an author can write and become markup only
a UI developer can change. An extension is the seam between the two: the author
writes AsciiDoc, the extension emits the design system's markup.

Where a thing belongs, before you write anything here:

| the thing is                                   | it lives in                                      |
| ---------------------------------------------- | ------------------------------------------------ |
| site chrome, present on every page             | a Handlebars partial in `ui-bundle/src/partials` |
| derived from HTML Asciidoctor already produces | CSS alone, in `ui-bundle/src/css`                |
| authored content with no AsciiDoc equivalent   | **an extension here**                            |

If Asciidoctor already emits the element and you only need it to look right,
this package is the wrong tool — style it in `ui-bundle`. Admonitions, tables and
code blocks are all handled that way.

## The contract

Every extension in this package keeps all eight of these.

### 1. One file per extension, registered in `index.js`

`lib/<name>.js` exports a single `register<Name>(registry)` function.
`index.js` requires it and calls it from `registerAll`. Nothing else registers
anything — a site lists this package once and gets the whole set.

`lib/` also holds modules that register nothing: `async-compat.js`,
`first-positional.js`, `html.js`, `unique-id.js`, `warn.js`, `kroki-config.js`
and `kroki-instance.js`. They are helpers, required directly by the
extensions, and are deliberately absent from `index.js`.

### 2. `register` is exported as both a named export and `module.exports.register`

Only `index.js` deals with this, and it already does. The shape is not
cosmetic — it is what makes registration work in two different hosts, and each
one fails silently when it is wrong:

- **Antora** matches `register.toString()` against a regex requiring the first
  parameter to be **literally named `registry`**. Rename it, or ship a bundled
  build that renames it, and Antora decides the module is an _Antora_ extension
  listed under the wrong key, logs `Skipping possible Antora extension
registered as an Asciidoctor extension`, and moves on. Nothing renders. No
  error.
- **The ui-bundle preview harness** calls `register.call(Asciidoctor.Extensions)`
  with no argument — `this` is the namespace, not a registry — and does so once
  per rebuild in the same process, which is why `index.js` carries an
  idempotency guard. Without it, a table ends up wrapped in one more nested
  container per rebuild.

Read `index.js`'s own header comment before touching any of it, and
`.opencode/skills/asciidoc/reference/extensions.md` for the registration
mechanics in full.

### 3. Emit IOP DS BEM markup, exactly

Copy the DS component's real markup and class names. Never invent a class on a
DS block, never re-implement a component's styling from memory. If nothing in
the DS models what you need, say so before inventing — it usually means the
wrong component was identified. See `.opencode/skills/iop-ds-components`.

### 4. Ship no CSS

This package emits markup and nothing else. Styling lives in
`ui-bundle/src/css`. An extension that needs new CSS is a change to two
packages, in that order — never a `<style>` tag, never a stylesheet here.

### 5. Degrade without JavaScript

A page must be readable, navigable and correctly styled with JavaScript off.
Tabs render as sequential sections, each under its own heading; accordions
render as `<details>`; anything clickable is a real `<a href>`. Behaviour is
layered onto server-rendered markup by `ui-bundle/src/js` — it never creates
markup.

### 6. Set real ARIA, and never an inline `style`

Interactive markup carries the roles and relationships its pattern requires
(`role=tablist`/`tab`/`tabpanel`, `aria-controls`, `aria-selected`), keyboard
operability included. Use `lib/unique-id.js` for the ids those relationships
need; see its header for why a module-level counter is wrong here.

Inline `style` is not a styling escape hatch. The one existing exception —
`video-size.js` — sets _custom properties_ that the stylesheet consumes, because
a browser will not derive `aspect-ratio` from an iframe's HTML attributes and
there is no CSS-only fix. That is the bar: a documented impossibility, not a
convenience.

### 7. Escape raw attribute values — and only those

Asciidoctor substitutes some authored strings before an extension sees them and
others not at all. Escaping the wrong ones double-encodes (`&` renders as
`&amp;`); missing the right ones lets authored text inject markup. Measured on
both majors this repo runs, with `A & B <x>`:

| source                                | arrives as            | escape? |
| ------------------------------------- | --------------------- | ------- |
| inline macro, positional or named     | `A &amp; B &lt;x&gt;` | no      |
| document attribute (`:page-k:`)       | `A &amp; B &lt;x&gt;` | no      |
| **block macro attribute** (`x::t[…]`) | `A & B <x>`           | **yes** |
| **block style attribute** (`[x,k=…]`) | `A & B <x>`           | **yes** |

Identical on 2.2.9 and 4.0.8 — it is a block-vs-inline split, not a version
split. Separately, anything from `getText()` is **already converted HTML** (a
dlist term with an `xref:` arrives as a full `<a>`), so it must never be
escaped.

Use `lib/html.js`: `escapeHtml(value)` and `attr(name, value)`. Its header
carries the full table and the probe behind it.

### 8. Stay portable across both Asciidoctor majors

Site builds run **2.2** (via Antora); the ui-bundle preview harness runs **4.0**.
Touch only `registry`/`this` — never the `@asciidoctor/core` module object,
whose export shape differs between the two.

Two behavioural splits are already solved, and both must be reused rather than
rediscovered:

- **Attribute shape.** An inline macro's first positional attribute is
  `attrs.$positional[0]` under 2.2 and `attrs['1']` under 4.0 — use
  `lib/first-positional.js`.
- **Sync vs async.** `parseContent`, `convert` and `precomputeText` are
  synchronous under 2.2 and Promise-returning under 4.0. An extension cannot
  simply be `async`: that hands 2.2's synchronous Opal caller a Promise, which
  renders as the literal text `[object Promise]`. Use `chain`/`chainAll`/
  `precomputeSubtree` from `lib/async-compat.js`.

`@asciidoctor/core` is a devDependency for its TypeScript types only. It is
version 4.0, so those types describe the preview harness's runtime, not
Antora's — treat them as a typing aid, not as proof that an API exists in 2.2.

## Reporting authoring mistakes

Both site playbooks set `runtime.log.failure_level: warn`, so **a warning fails
the build**. That is the right severity for an authoring error: an unknown label
colour, a `[cards]` block with no cards, a tab set with no panels all render as
something plausible but wrong, and shipping that is worse than not building.

Use `lib/warn.js` so every extension reports in the same shape — what the author
wrote, what is wrong, and what was expected:

```js
warn(parent, 'label:mauve[]', 'unknown IDS Label variant "mauve"', VARIANTS)
// → label:mauve[] — unknown IDS Label variant "mauve"; expected one of white, grey, …
```

## Using this package in a site

Two steps, both required. Doing only one fails silently.

1. List it under `asciidoc.extensions` in the site's `antora-playbook.yml`
   (or, for the ui-bundle preview, in `preview-src/ui-model.yml`).
2. Add it as a dependency with the workspace protocol:
   `"@inditextech/pdocs-asciidoc-extensions": "workspace:*"`.

Note the neighbouring package: `@inditextech/pdocs-antora-extensions` hooks
Antora's own pipeline under the **`antora.extensions`** key. Listing either
package under the other's key makes Antora log a warning and skip it.

### Kroki: opt-in, disabled by default

`[mermaid]`, `[plantuml]`, `[graphviz]` and the rest of `kroki.js`'s
`SUPPORTED_TYPES` are the one extension in this package that is **not** active
just by listing the package — see that file's own header. A site turns it on
with two more `asciidoc.attributes`:

```yaml
asciidoc:
  attributes:
    kroki-enabled: true
    kroki-diagram-types: mermaid,plantuml # optional; omitted = every supported type
```

It also needs a Kroki service reachable at build time, at the fixed local URL
`kroki-config.js` hardcodes (not itself configurable — see that file's own
header for why). No manual setup: the sibling `@inditextech/pdocs-antora-
extensions` package's `kroki-prewarm.js` starts one itself, via `docker
compose`, the first time a build needs it and finds nothing already
listening — on every invocation path (`pdocs dev`/`pdocs build`, this
monorepo's own `just dev`/`just build-site`, a raw `antora` call, any
consumer's own CI) equally, with no automatic teardown (a stopped-and-
restarted Kroki on every build would only add latency back). Run `pdocs
eject kroki` to copy the bundled compose file into a site's own repo for
customization (a different image version, a companion container for
another diagram type); run `pdocs teardown kroki` (or, in this monorepo,
`just kroki-down`) to stop it manually once you're actually done with it.
Without `kroki-enabled: true`, or if Docker/the service never becomes
reachable, these blocks render exactly as plain AsciiDoc already would — a
disabled or unavailable Kroki is never itself a build failure.

A healthy run is otherwise silent: `kroki-docker.js` and `kroki-prewarm.js`
log their whole lifecycle (already-reachable / starting via which compose
file / `docker compose up -d` succeeded / became reachable after Ns /
render summary) at `info`, so nothing about a working setup looks different
from Nx quietly replaying a stale cached build. Antora's own default log
level is `warn`, so these are invisible unless you ask for them — as is
every other pdocs extension's own `getLogger('pdocs-...')` observability
(search-index's per-component summary, llms-txt's, footer's, ...), same
reasoning throughout. This monorepo's own `just dev`/`just build-site`
recipes, and `pdocs dev`/`pdocs build` (`antora-log.ts` in the `cli`
package), all pass `--log-level=info` to every Antora invocation they make
for exactly this reason, so no extra flag is needed there — a raw `antora`
invocation of your own still needs `--log-level=info` (or
`ANTORA_LOG_LEVEL=info`) passed explicitly. A real failure (Docker missing,
daemon unreachable, service never comes up, an individual diagram failing
to render) still logs at `warn` unconditionally either way.

## Targets

```
pnpm nx run @inditextech/pdocs-asciidoc-extensions:lint
pnpm nx run @inditextech/pdocs-asciidoc-extensions:typecheck
```

There is deliberately **no `build` and no `clean`**: the package is plain
CommonJS, consumed by `require()` straight from source. Nothing is compiled,
nothing is emitted, so there is nothing to remove. Adding no-op targets to
match the other packages would be noise.

`typecheck` runs TypeScript over the JavaScript (`allowJs` + `checkJs`) using
the JSDoc annotations. `noImplicitAny` and `noImplicitThis` are off, and only
those two — see `tsconfig.json` for the measurement behind that and for how they
get retired. New files are written fully annotated; `lib/html.js`,
`lib/unique-id.js` and `lib/warn.js` are the reference for what that looks like.

## Further reading

- `.opencode/skills/asciidoc/reference/extensions.md` — extension points, the
  DSL, and the registration rules in full
- `.opencode/skills/iop-ds-components` — choosing a DS component and emitting
  its markup
- `.opencode/skills/iop-ds-foundations` — tokens, theming, breakpoints
