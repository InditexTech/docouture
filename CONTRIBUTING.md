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
  scripts, Handlebars helpers), themed with the IOP Design System.
- `packages/example` — the real-world site content lives here.
- `packages/cli` — the `docouture` CLI, which scaffolds a standalone site
  (`docouture new`) outside this monorepo.
- `packages/antora-extensions` / `packages/asciidoc-extensions` — Antora and
  Asciidoctor extensions shared by docouture sites.

See `.opencode/skills/` for the deeper conventions behind each of these
(design tokens, Antora internals, page patterns, versioning modes).

### Before Submitting

- Run `just check` — lint, typecheck and formatting, the same checks CI runs.
- Update `code/CHANGELOG.md`'s `[Unreleased]` section with an entry describing
  your change. CI enforces this on every PR that touches `code/**` unless the
  PR is labelled `skip-release` (for changes with no user-facing effect —
  internal tooling, CI config, etc.).
- Link the corresponding issue in your pull request.

## License

docouture is licensed under [Apache-2.0](LICENSE), with one exception:
`code/packages/ui-bundle` is a fork of
[antora-ui-default](https://gitlab.com/antora/antora-ui-default) and remains
under MPL-2.0 — see its own `LICENSE` and `NOTICE`. Contributions to that
package are made under MPL-2.0; everywhere else, Apache-2.0.

## Helpful Resources

- [Project documentation](README.md) — project overview, commands and layout.
- [Issues](../../issues) — check open issues and look for opportunities to
  contribute.

Thank you for your time and contribution! Your work helps to grow and improve
this project. If you have any questions, feel free to reach out to us.
