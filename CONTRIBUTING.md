# Contributing Guide

Thank you for your interest in contributing to docouture! We value and
appreciate any contributions you can make.

To maintain a collaborative and respectful environment, please consider the
following guidelines when contributing to this project.

## Prerequisites

- Before starting to contribute to the code, you must first sign the
  [Contributor License Agreement (CLA)](https://github.com/InditexTech/foss/blob/main/CLA.md).
  Detailed instructions on how to proceed can be found
  [here](https://github.com/InditexTech/foss/blob/main/CONTRIBUTING.md).
- Install `just`, `asdf` and the pinned Node/pnpm versions — see the
  [Requirements](README.md#requirements) section of the README.

## How to Contribute

1. Open an issue to discuss and gather feedback on the feature or fix you wish
   to address.
2. Fork the repository and clone it to your local machine.
3. Create a new branch to work on your contribution:
   `git checkout -b your-branch-name`.
4. Make the necessary changes in your local branch.
5. Ensure that your code follows the established project style and formatting
   guidelines (`just check` runs everything CI runs).
6. Perform testing to ensure your changes do not introduce errors.
7. Make clear and descriptive commits that explain your changes.
8. Push your branch to the remote repository: `git push origin your-branch-name`.
9. Open a pull request describing your changes and linking the corresponding
   issue.
10. Await comments and discussions on your pull request. Make any necessary
    modifications based on the received feedback.
11. Once your pull request is approved, your contribution will be merged into
    the main branch.

## Contribution Guidelines

- Before starting work on a new feature or fix, check existing
  [issues](../../issues) and [pull requests](../../pulls) to avoid
  duplications and unnecessary discussions.
- If you wish to work on an existing issue, comment on it to let other
  contributors know you're working on it.
- Discuss and gather feedback before making significant changes to the
  project's structure or architecture.
- Keep a clean, organized commit history — logical, descriptive commits.
- Document any new changes or features you add.

## Development

docouture is an Nx workspace using [pnpm](https://pnpm.io/) workspaces. The Nx
workspace root is `code/`, not the repository root — see
[`code/README.md`](code/README.md) for why. Everyday commands go through
[`just`](https://github.com/casey/just), which runs everything inside `code/`
for you, so they work from anywhere in the repository:

```console
$ just bootstrap        # asdf install + pnpm install + preflight checks
$ just dev example      # serve a site on :5000, live reload
$ just preview-ui       # UI-only dev server, live reload, :5252
$ just check            # lint, typecheck and formatting — what CI runs
$ just build            # build everything
```

The packages you'll most likely touch:

- `packages/ui-bundle` — the Antora UI bundle (layouts, styles, browser
  scripts, Handlebars helpers), with its own design tokens.
- `packages/example` — the real-world site content lives here.
- `packages/cli` — the `docouture` CLI, which scaffolds a standalone site
  (`docouture new`) outside this monorepo.
- `packages/antora-extensions` / `packages/asciidoc-extensions` — Antora and
  Asciidoctor extensions shared by docouture sites.

See `.opencode/skills/` for the deeper conventions behind each of these
(design tokens, Antora internals, page patterns, versioning modes).

`.github/assets/product-logo.png` and `product-logo-dark.png` (used by the
root README) are a manual copy of
`docs/supplemental-ui/product-logo.png`/`product-logo-dark.png` (used by the
docs site itself) — kept as a plain copy rather than a shared reference so the
root README doesn't depend on the docs site's build input. If the docouture
logo is ever redesigned, update both locations.

### Before Submitting

- Run `just check` — lint, typecheck and formatting, the same checks CI runs.
- Link the issue your PR resolves: add `Closes #ISSUE_ID` to the PR description (the PR
  template has the line), or link the issue from the Development sidebar. A plain
  `#ISSUE_ID` mention does not count. GitHub only reads closing keywords on PRs to the
  default branch, so for a `main-*` branch use the Development sidebar.
  - Do not edit `code/CHANGELOG.md`: the release job generates one entry per linked issue,
    `- [#ISSUE_ID](https://github.com/InditexTech/docouture/issues/ISSUE_ID) ISSUE_TITLE`,
    with the **verbatim title of the issue** at release time.
  - The section comes from the issue's `kind/*` label, first match wins: `kind/security` →
    Security, `kind/bug` → Fixed, `kind/enhancement` → Added, `kind/documentation` →
    Documentation, `kind/deprecated` → Deprecated, `kind/removed` → Removed, anything else →
    Changed (flagged as guessed).
  - Issues labelled only `kind/internal` or `kind/epic` get no entry, and an issue already
    listed in an earlier release is not listed again. Both are shown in the report.
  - To change the wording of an entry, edit the issue title; to change its section, change
    the issue labels.
  - Releases up to 1.3.2 keep their hand-written changelog sections as history.
  - The `Changelog / Closing issue` check reports the entries the PR will generate, and
    (once enforced) fails if the PR has no linked issue and no `skip-release` label.
    Dependabot PRs are exempt. A maintainer adds `skip-release` for a PR that publishes no
    release and does not need an issue; the issues it does close still get entries in the
    next release.

## License

docouture is licensed under [Apache-2.0](LICENSE), with two exceptions:
`code/packages/ui-bundle` is a fork of
[antora-ui-default](https://gitlab.com/antora/antora-ui-default) and mixes
MPL-2.0 (files that are a Modification of an upstream file) with
Apache-2.0 (files with no upstream counterpart) — see its own `LICENSE`
and `NOTICE`, and each file's own SPDX header. And
`code/packages/antora-extensions/lib/kroki-include-line-filters.js` is a
Modification of a file from
[Antora's own asciidoc-loader](https://gitlab.com/antora/antora/-/tree/v3.2.0/packages/asciidoc-loader)
and stays MPL-2.0 for the same reason — see that package's own `LICENSE`
and `NOTICE`. Contribute to a file under whichever license its own header
already declares; everywhere else, Apache-2.0.

## Helpful Resources

- [Project documentation](README.md) — project overview, commands and layout.
- [Issues](../../issues) — check open issues and look for opportunities to
  contribute.

Thank you for your time and contribution! Your work helps to grow and improve
this project. If you have any questions, feel free to reach out to us.
