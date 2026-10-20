# starter-build-strictness Specification

## Purpose

Defines which log severities fail the build of a site scaffolded by `docouture new`, so authoring mistakes stop the build while informational notices do not.

## Requirements

### Requirement: Scaffolded playbooks fail on errors only
Every playbook scaffolded by `docouture new` SHALL set `runtime.log.failure_level` to `error`, in the default, local and versioned variants.

#### Scenario: New site
- **WHEN** `docouture new` scaffolds a site in any versioning mode
- **THEN** each generated playbook contains `failure_level: error`

#### Scenario: Existing site untouched
- **WHEN** `docouture upgrade` runs on an existing site
- **THEN** its playbooks' `failure_level` is not modified

### Requirement: Author-must-act problems are errors
Docouture extensions SHALL log at error severity any problem whose output is wrong or silently dropped content: unknown variant, type, width, alignment or breakpoint values, cards without title, tabs without label, empty card/tab/accordion/feature blocks, footer links resolving to no page, redirect rules matching no pages, and `nav_modules` entries matching no file.

#### Scenario: Unknown value
- **WHEN** a page uses `label:mauve[]` with an unknown variant
- **THEN** the extension logs an error and the build fails

#### Scenario: Dangling redirect rule
- **WHEN** a configured redirect rule matches no real pages
- **THEN** the extension logs an error and the build fails

### Requirement: Informational notices do not fail the build
Docouture extensions SHALL log at warn severity cases that degrade gracefully or are informational, such as extra images where only the first is rendered, unsupported diagram format fallback, no search records, an unreadable CHANGELOG left as-is, and docker fallback notices.

#### Scenario: Extra image
- **WHEN** a card has two images
- **THEN** a warning is logged and the build succeeds

### Requirement: Documentation states the new severity contract
Documentation, skills and comments describing build failure SHALL state that errors fail the build and warnings do not.

#### Scenario: Reference page
- **WHEN** a reader opens the playbook configuration reference
- **THEN** `log.failure_level` is documented as `error`, with the error-versus-warning rule
