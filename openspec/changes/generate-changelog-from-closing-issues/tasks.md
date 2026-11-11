# Tasks

## 1. Generator script

- [x] 1.1 Port `changelog-from-prs.mjs` and `changelog-from-prs.test.mjs` from `/Users/jesusmpc/Inditex/weavejs/.github/scripts/` to `.github/scripts/`, adapted to `kind/*` labels, a Documentation section and the "real category wins over `kind/internal`/`kind/epic`" rule; verify `node --test .github/scripts/changelog-from-prs.test.mjs` passes (36 tests)
- [x] 1.2 Export `normalizeInvisibleWhitespace` from `sanitize-changelog.mjs`; verify the NBSP title test passes and `sanitize-changelog.mjs --check code/CHANGELOG.md` stays clean on a generated copy
- [x] 1.3 Verify `--dry-run --from 1.2.0 --to 1.3.0` and `--from 1.3.1 --to 1.3.2` against the hand-written sections (differences are only PR-vs-issue links, serializer escaping and docs-only issues), `--pr 297` output, idempotent write on a copy of the changelog, and non-zero exit on a bad ref / missing token
- [x] 1.4 Verify generated entries match the bullet format `changelog-pages.js` parses (`^- [#N](url)`)

## 2. Workflows

- [x] 2.1 Add `.github/workflows/code-changelog-check.yml` (every PR to `main`/`main-*`, `issues: read`, runs the script tests, warn-only via `CHANGELOG_LINK_ENFORCE`, SHA-pinned actions, job summary); verify with `actionlint`
- [x] 2.2 Add the generate step (`--branch "$BASELINE_BRANCH" --changelog code/CHANGELOG.md --report`) before `keep-a-changelog bump` in the release job only; verify with `actionlint` that the snapshot job is untouched
- [x] 2.3 Remove "Require CHANGELOG.md update", "Require a changelog category label" and `skip-changelog` resolution from `code-npm_node-pr-verify.yml`; verify `actionlint` passes and the sanitize check step remains
- [x] 2.4 Replace the "CHANGELOG.md has changes" check in `code-release_preview.yml` with the two-pass generation, code-span titles, and fork job-summary preview; verify with `actionlint`

## 3. Contributor docs

- [x] 3.1 Add `.github/pull_request_template.md` with a `Closes #` prompt and `.github/workflows/docs/code-changelog-check.md`; verify both files exist and the docs pages for the release preview and publish workflows describe the new steps
- [x] 3.2 Update `CONTRIBUTING.md`, `.opencode/skills/changelog/SKILL.md`, `AGENTS.md`, the `code/CHANGELOG.md` intro and `docs/.../contributing.adoc`; verify `grep -ri skip-changelog` only finds text saying it has no effect

## 4. End-to-end verification and rollout (tracked in #302 and #303)

- [ ] 4.1 Verify the check, the release preview comment, the empty-`[Unreleased]` bump and a real release run (InditexTech/docouture#302)
- [ ] 4.2 Add the check to branch protection, retire the `skip-changelog` label, update the `skip-release` label description, and flip `CHANGELOG_LINK_ENFORCE` after one release (InditexTech/docouture#303)
