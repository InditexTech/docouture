## 1. Resolver

- [x] 1.1 In `code/packages/cli/src/lib/release-resolve.ts`, add `releases?: string[]` to `ResolveInput` and implement prefix filter, prefix strip, SemVer and non-prerelease filter and `highestSemver` selection for `github-release`
- [x] 1.2 Remove the unconditional `unsupported` early return for a `docs/release` PR; keep an explicit/release-tag precedence order (explicit, then release tag, then releases)
- [x] 1.3 Add the "no usable Release" error (names the prefix and the count considered) and the "needs a published Release" error for a PR with neither tag nor releases
- [x] 1.4 Extend `release-resolve.spec.ts` with one test per new scenario in `specs/docs-release-resolve/spec.md`

## 2. CLI command

- [x] 2.1 In `code/packages/cli/src/commands/release.ts`, parse `--releases` (comma or newline separated, like `--tags`), pass it to the resolver, and update the usage string
- [x] 2.2 Extend `release.spec.ts` for `--releases` end to end, including `--report` mode and `$GITHUB_OUTPUT`-style output

## 3. Release workflow

- [x] 3.1 In `code/packages/cli/templates/workflows/docouture-release.yml`, add a pull-request-only step that lists published, non-draft, non-prerelease Releases with `gh api --paginate` and outputs their tags; pass them as `--releases` in "Resolve version"
- [x] 3.2 Update the header comments of the template for the new `github-release` PR behavior
- [x] 3.3 Apply the same edit to `.github/workflows/docouture-release.yml`

## 4. Preview workflow

- [x] 4.1 In `code/packages/cli/templates/workflows/docouture-release-preview.yml`, make `github-release` fetch Releases, install the CLI and resolve with `--report`, like `tag-bump`
- [x] 4.2 Replace the "released with the code release, label does not release" comment with the republish-version comment, a no-Release-yet comment, and keep the `release-type/*` wording
- [x] 4.3 Fix the "add the label" suggestion path so it no longer leads into the failure under `github-release`
- [x] 4.4 Apply the same edits to `.github/workflows/docouture-release-preview.yml`
- [x] 4.5 Update workflow template tests, if any (grep `templates/workflows` in `src/**/*.spec.ts`)

## 5. Docs and skills

- [x] 5.1 Add the scenario-by-source matrix (code + docs PR, docs-only PR, `workflow_dispatch` for `descriptor`, `tag-bump`, `github-release`) to `docs/src/modules/main/pages/guides-releasing-a-documentation.adoc`
- [x] 5.2 Mirror it in `skills/docouture-docs-versioning`
- [x] 5.3 Document `--releases` in `docs/src/modules/main/pages/reference-cli.adoc`
- [x] 5.4 Add a release note under `docs/src/modules/main/pages/release-notes/` with its nav entry, per the 1.4.0 entry's pattern
- [x] 5.5 Update the `AGENTS.md` documentation-state ledger for every page touched

## 6. Verify

- [x] 6.1 Run the `cli` tests and lint through `pnpm nx` from `code/`
- [x] 6.2 Build the docs site and confirm no xref or nav errors
- [x] 6.3 Run `openspec validate github-release-docs-only-republish --strict`
