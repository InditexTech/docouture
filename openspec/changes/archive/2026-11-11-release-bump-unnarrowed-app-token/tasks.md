## 1. Workflow template

- [x] 1.1 In `code/packages/cli/templates/workflows/docouture-release.yml`, remove `owner`, `repositories` and `permission-contents` from the `release` job's `Git app token` step
- [x] 1.2 Rewrite the "Docouture hardening" bullet (header) and the step comment to say the release job's token is not narrowed and why (#298)
- [x] 1.3 Confirm `sync-prerelease` is unchanged and `docouture-publish.yml` is untouched

## 2. This repository's copy

- [x] 2.1 Apply the same edits to `.github/workflows/docouture-release.yml`

## 3. Docs

- [x] 3.1 Add a short "protected branches" note on the narrowed-token vs bypass tradeoff to `docs/src/modules/main/pages/guides-releasing-a-documentation.adoc`; update its AGENTS.md ledger row if needed

## 4. Verify

- [x] 4.1 Diff template vs `.github/workflows` copy: only placeholder/pnpm differences remain
- [x] 4.2 Run the CLI's template tests via `pnpm nx test` for the cli package (from `code/`)
- [x] 4.3 PR closes #298 (`Closes #298`)
