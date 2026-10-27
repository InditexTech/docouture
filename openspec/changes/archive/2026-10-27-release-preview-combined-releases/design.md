## Context

`docouture-release-preview.yml` has four jobs (`check-changes-in-paths`, `release-preview`, `release-preview-no-docs-changes`, `release-preview-no-release-label`) that gate on `docs/release` and whether the PR touches `docs/**`. `docouture-release.yml` (lines 149-158) runs the `pull_request` path only when the PR has `docs/release` and either `skip-release` or no label containing `release-type`; otherwise it waits for `release: published` (non-pre-release). The preview never reads `release-type/*`. The repository's own copy under `.github/workflows/` differs from the template only by `main*` instead of the `__DOCOUTURE_RELEASE_BRANCH__*` placeholder.

## Goals / Non-Goals

**Goals:** make every preview comment true for each label combination; reword them for end users; document the combined flow.

**Non-Goals:** changing `docouture-release.yml` behaviour; a `docouture doctor` check; a repo-level "code release publishes a Release" switch (follow-up); validating `docs/.release-version` for `release-type/*`-only PRs.

## Decisions

- **T is computed in the workflow, not guessed.** T = `contains(labels, 'release-type/')` and not `contains(labels, 'skip-release')`, mirroring the release workflow's `if:`. Alternative rejected: looking up the PR from the release commit (fails for release plugins whose tag points at a "Prepare release" commit with a different PR).
- **Job gates:**

  ```
  release-preview             R && (D || T)
  no-docs-changes (E)         R && !D && !T
  code-release (G, new)       T && !R && D && !draft
  no-release-label (H)        !R && !T && D && !draft
  ```
  F rides on `release-preview` so version checks and the tag warning are reused; the widened gate gives F for combined PRs with no docs changes (E suppressed).
- **Case 7 (option a):** A/B stay the first check and exit; a `HAS_RELEASE_TYPE` env var chooses the timing sentence. F is not posted next to an error, since the failure makes F's advice moot.
- **Comment style:** each comment is a heading, what happens and why, then what to do. Heading icons follow the existing convention.
- **Template and own copy:** edited identically; a diff of the two must show only the branch filter.
- **Release notes:** v1.3.2 notes cover this fix and #293 (one release); "Do this" is `docouture upgrade`, since scaffolded sites only get the wording after upgrade.

## Risks / Trade-offs

- [The preview cannot know whether the code release publishes a Release] → both F and G state the condition and the manual recovery.
- [Gate overlap posts two comments on one PR] → the gates above are mutually exclusive; verify by enumerating the label combinations in tests.
- [Release notes version depends on release order] → written as 1.3.2; renamed if #293 ships alone first.
- [Case 8 versioned PRs are not version-checked] → documented in the guide's failure modes.
