# Design

## Context

Antora fails the build when a log entry meets `failure_level`. Today `warn` makes every warning fatal; the extensions use `logger.warn` for both mistakes and notices (~60 calls via `asciidoc-extensions/lib/warn.js`, ~45 direct in `antora-extensions`). See proposal.md.

## Goals / Non-Goals

**Goals:**
- Same gating for authoring mistakes, no gating for notices.
- One classification rule, applied consistently.

**Non-Goals:**
- Migrating existing sites or changing `docouture upgrade`.
- Changing Antora core levels.

## Decisions

- **Selective reclassification over blanket `warn`->`error`**: blanket keeps noise gating (or, if nothing moves, silently drops all gating). Rule: output wrong/dropped -> error; degraded but correct -> warn.
- **`warn.js`**: rename helper to `error()` (calls `logger.error`) and add `notice()` (calls `logger.warn`); re-point the "only the first is rendered" calls to `notice()`. Single choke point keeps the ~60 calls mechanical.
- **antora-extensions**: per-call classification, `logger.warn` -> `logger.error` for author-must-act ones; specs updated to assert the new level.
- **Playbooks**: all seven change, since the issue is about parity between template and the repo's own sites.

## Risks / Trade-offs

- [Core Antora levels] -> verified with a throwaway build: broken xref and missing include log at `error` (still fail); a missing attribute logs at `warn` (stops failing).
- [Third-party warnings stop gating] -> note in reference page and CHANGELOG.
- [Skill mirrors drift] -> follow `skills-authoring` sync for `skills/` and `.agents/skills/`.
- [Misclassification] -> spec tests assert level per case.
