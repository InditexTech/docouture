# Documentation authoring instructions

Instructions for AI coding agents (and humans) generating or editing the
documentation in this directory. Read this file completely before writing
any page.

## Mission

Produce a complete first draft of this project's documentation by analyzing
the codebase and filling in every page under `modules/ROOT/pages/`, following
the authoring guide embedded at the top of each page. The draft must be good
enough that a developer only needs to review and correct it — not rewrite it.

## Workflow

1. **Analyze the repository first.** Before writing anything, study:
   - `README.md`, `CONTRIBUTING.md`, `LICENSE`, and any existing docs.
   - The public surface: exported APIs, CLI commands, configuration options.
   - Examples, tests, and scripts — they reveal real usage and common tasks.
   - Build and release tooling — it reveals prerequisites and workflows.
2. **Fill in every page** under `modules/ROOT/pages/`, in navigation order
   (see `modules/ROOT/nav.adoc`). Each page starts with an
   `AUTHORING GUIDE` comment block that defines its purpose, audience,
   rules, and quality bar. Follow it exactly.
3. **Create the task and reference pages.** `guides/index.adoc` and
   `reference/index.adoc` tell you which pages to derive from the codebase
   (one guide per common task, one reference page per public surface area).
   Create them under `pages/guides/` and `pages/reference/` and register
   each one in `nav.adoc`.
4. **Verify before finishing.** Check each page against the
   `QUALITY BAR (Definition of Done)` checklist in its authoring guide.
   Every command must be copy-pasteable, every code sample must run as
   written, and every xref must resolve.
5. **Clean up.** Once a page's content is final, remove its guidance
   comments (the lines starting with `//`). Leave the guidance in place for
   any page you could not complete, so a human can finish it.

## Section requirement levels

Guidance comments tag sections with a requirement level. Honor them:

- **[MANDATORY]** — always produce this section. If the codebase does not
  give you the facts, add a `// TODO(human): ...` instead of omitting it.
- **[ADVISED]** — produce it whenever the project has meaningful content
  for it; skip it only for trivial projects.
- **[IF APPLIES]** — produce it only when the feature exists (e.g., known
  issues, CLI reference). Delete the section otherwise.
- **[OPTIONAL]** — nice to have; include only when clearly valuable.

## Growing beyond the minimal structure

The template is the minimal universal structure. As the project matures,
add these pages when their content exists, and register them in `nav.adoc`:

- **FAQ / known issues** — grow the section in `support.adoc` into its own
  page when it outgrows the page.
- **Glossary** — when the project has enough domain terms that readers need
  a lookup page; keep term names identical to the code.
- **Release notes / migration guides** — one page per release with breaking
  changes; link them from "Releases and versioning" in `support.adoc`.
- **Security** — if the project has a nontrivial security model, document
  authentication/authorization under Reference or as a dedicated page.
- Split any page that overwhelms the reader (e.g., Architecture sections)
  into nested pages, keeping the overview at the parent.

## Ground rules

- **Never invent facts.** Everything you write must be verifiable in the
  codebase. If you cannot determine something (a version requirement, a
  support channel, a design rationale), insert a visible
  `// TODO(human): ...` comment instead of guessing.
- **Do not document internals.** Only the public, supported surface belongs
  in the docs. Internal helpers and private modules do not.
- **Respect the information architecture.** Tasks go in Guides, facts go in
  Reference, explanations go in Architecture. Do not blend them: a
  reference page never teaches, a guide never lists every option.
- Keep the top-level navigation intact. Add pages under Guides and
  Reference; do not remove top-level sections unless they truly do not
  apply (e.g., no CLI reference for a project without a CLI).

## Style guide

- **Language:** American English.
- **Voice:** second person ("you"), active voice, present tense.
  Imperative mood for instructions ("Run the command", not "The command
  should be run").
- **Tone:** direct and helpful. No marketing language, no filler
  ("simply", "just", "easy", "powerful"), no exclamation marks.
- **Sentences:** one idea per sentence. Prefer short sentences and short
  paragraphs (3-4 lines max).
- **Terminology:** use the exact names from the code, consistently. Never
  alternate between synonyms for the same concept.
- **Format:** AsciiDoc. One sentence per line (helps diffs). Use
  `[,console]` blocks for shell sessions with a `$` prompt, language-tagged
  blocks for code, tables for option/parameter lists, and admonitions
  (`NOTE:`, `WARNING:`) sparingly.
- **Links:** use `xref:` for internal pages. Every link must resolve — the
  site build fails on broken xrefs.

## Working with this site

- Build: `npm install && npm run build`; output is written to `build/site`.
- Pages live in `modules/ROOT/pages/`; the navigation is
  `modules/ROOT/nav.adoc`. A page not listed in the nav is still published
  but cannot be reached by browsing.
- Set the component version with `pdocs version <version>` — it rewrites
  `antora.yml` in place.
