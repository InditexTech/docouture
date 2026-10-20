# Design

## Context

Behaviour already exists (`new.ts`: `componentName: urlSegment ? name : 'ROOT'`, default `false`; `doctor` accepts `ROOT`). This change is wording and documentation only. See proposal.md.

## Goals / Non-Goals

**Goals:** one consistent explanation of site / component / module and of the URL consequence, in the prompt, help, docs and template comments.

**Non-Goals:** `doctor` warning for older named-component sites (possible follow-up issue), `upgrade` rewriting `antora.yml`, flattening the `main` module, removing the version segment, spec assertions on prompt text.

## Decisions

- Keep the prompt and its `false` default; add "(recommended: no)" and both example URLs, since the URLs show the consequence best. Alternative (skip the prompt) rejected: multi-component sites are a real use case.
- Draft wording: define site > component > module > page; No -> `https://<org>.github.io/<repo>/<version>/main/page/`; Yes -> `https://<org>.github.io/<repo>/<name>/<version>/main/page/`.
- Link existing glossary Component and Module entries from docs rather than redefining them.
- No tests assert prompt text (decided); existing `new.spec.ts` default/opt-in tests remain the behavioural guard.

## Risks / Trade-offs

- Longer prompt -> keep it compact, plain text.
- Wording drift across prompt/help/docs -> one task aligns all and re-reads them together.
