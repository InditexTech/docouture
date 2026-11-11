## Context

`docouture-release.yml` mints one App token in the `release` job and uses it for `Push release tag` and `Bump release descriptor` (a push to the release branch). #250 narrowed it with `owner`, `repositories` and `permission-contents`. On rulesets requiring pull requests, the narrowed token loses the App's bypass (GH013); an un-narrowed token from the same App is accepted. Adding GPG signing did not help. Why narrowing loses bypass is not confirmed.

## Goals / Non-Goals

**Goals:** the descriptor bump works on protected release branches where the App is bypass-listed; the template and the header comment stay honest.

**Non-Goals:** narrowing in `sync-prerelease` and `publish` (neither writes to the release branch); finding the root cause; opt-in narrowing.

## Decisions

- **Drop the three inputs in `release` only.** Minimal, matches the verified fix. Alternative, opt-in via a repo variable: `create-github-app-token` inputs cannot be omitted conditionally, so it needs duplicate steps with `if:`; rejected as over-engineering for an unconfirmed cause.
- **Keep `sync-prerelease` and `publish` narrowed.** They push to `automated/sync-*` / `gh-pages` and open PRs, not to the release branch. `gh-pages` could hit the same problem on a protected branch; left for a follow-up if reported.
- **Edit the template and this repo's copy together**, as the copy is rendered from the template (differences are only placeholders and pnpm setup).
- **Rewrite the "Docouture hardening" bullet** and the comment above the step so they do not present narrowing as protection for the release job.

## Risks / Trade-offs

- The release token carries all of the App's installation permissions -> mitigated by the App being installed only where intended and by the job's read-only `GITHUB_TOKEN` permissions.
- Unconfirmed cause -> state it as empirical in the comment and the guide.
