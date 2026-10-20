# Design

## Context

GitHub substitutes `${{ }}` as text before bash parses the script, so attacker-controlled values (branch names, release tags, a PR-head `package.json` version) become code. Values passed through `env:` reach bash as data. `code-release_preview.yml` already uses this pattern (`PR_HEAD_REF`). See proposal.md for motivation.

## Goals / Non-Goals

**Goals:**
- No `${{ }}` expression inside any `run:` of the Sonar workflow.
- No word-splitting of scanner scope flags.

**Non-Goals:**
- Changing triggers, permissions, or Sonar properties.
- Auditing other workflows (already checked: clean).

## Decisions

- **Step-level `env:`** (not workflow-level): smallest blast radius and matches where `SONAR_TOKEN` is already set. Alternative: workflow-level `PR_HEAD_REF` like release preview; rejected as broader than needed.
- **Convert all expressions, including safe ones** (`event_name`, PR number): one lintable rule, no exception list.
- **Bash array for scope options** with `"${scope[@]}"`: prevents argument injection; alternative of string + `eval` rejected.
- **Harden `$GITHUB_OUTPUT` writer**: read values via `jq -r` into variables, write with `printf '%s=%s\n'` and reject values containing newlines. Adjacent, cheap, same class. Alternative: leave as-is to match the issue strictly.
- Repo name: use the `GITHUB_REPOSITORY` env already available in bash rather than an output where possible; keep the output if other steps need it.

## Risks / Trade-offs

- [Behavior drift in scanner args] -> Verify with a dry run printing the argument list for PR, branch, and release cases.
- [Quoting regression] -> Run `actionlint` and `shellcheck` on the run blocks.
