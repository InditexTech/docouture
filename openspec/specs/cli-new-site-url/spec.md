# cli-new-site-url Specification

## Purpose

Defines how `docouture new` obtains the public site URL and writes it as `site.url` into the scaffolded Antora playbooks, so published sites get sitemap, canonical links and a 404 page.

## Requirements

### Requirement: Derived default site URL
The CLI SHALL derive a default site URL from the `origin` git remote when it is hosted on github.com (ssh or https form), as `https://<owner-lowercased>.github.io/<repo>` with no trailing slash and no `.git` suffix. For any other or missing remote there SHALL be no default.

#### Scenario: https GitHub remote
- **WHEN** origin is `https://github.com/InditexTech/docouture.git`
- **THEN** the default is `https://inditextech.github.io/docouture`

#### Scenario: ssh GitHub remote
- **WHEN** origin is `git@github.com:InditexTech/docouture.git`
- **THEN** the default is `https://inditextech.github.io/docouture`

#### Scenario: No usable remote
- **WHEN** there is no origin, or it is hosted on a non-github.com host
- **THEN** there is no default site URL

### Requirement: Interactive site URL prompt
In the interactive wizard the CLI SHALL ask for the public site URL, pre-filled with the derived default when one exists, even when a default exists. Because the prompt library substitutes the default for an empty submit, an answer of `-` SHALL mean "skip" (a blank answer accepts the default; when there is no default, blank also skips). The answer MUST be empty, `-`, or start with `http://` or `https://`; otherwise the prompt SHALL reject it. A trailing slash SHALL be stripped.

#### Scenario: Accept default
- **WHEN** the user accepts the pre-filled default
- **THEN** that URL is used

#### Scenario: Skip answer
- **WHEN** the user answers `-`
- **THEN** no site URL is written, even if a default existed

#### Scenario: Invalid answer
- **WHEN** the user enters `docs.example.com`
- **THEN** the prompt rejects it with a message expecting an http(s) URL

### Requirement: Site URL flag
The CLI SHALL accept `--site-url <url>`. When given, the prompt SHALL NOT be shown and the flag value (validated and slash-stripped as above) SHALL be used. An invalid value SHALL print an error and exit with code 1.

#### Scenario: Flag overrides derived default
- **WHEN** `docouture new my-docs --site-url https://docs.example.com/` runs
- **THEN** the playbooks contain `url: https://docs.example.com`

#### Scenario: Invalid flag
- **WHEN** `--site-url ftp://x` is passed
- **THEN** the command exits 1 with an error

### Requirement: Non-interactive default
With `--yes` or no TTY and no `--site-url`, the CLI SHALL use the derived default if present, otherwise write no URL.

#### Scenario: CI scaffold with GitHub origin
- **WHEN** `docouture new my-docs --yes` runs in a repo with a github.com origin
- **THEN** the playbooks contain the derived `url:`

### Requirement: Playbook output
For both standalone and versioned modes, the scaffolded `antora-playbook.yml` SHALL contain an active `site.url` line when a URL is known, and otherwise SHALL keep the existing commented `# url:` hint. The scaffolded YAML MUST remain valid either way. The `antora-playbook.local.yml` SHALL be unchanged.

#### Scenario: URL known
- **WHEN** a site URL resolves
- **THEN** `site:` contains `url: <value>` uncommented

#### Scenario: URL unknown
- **WHEN** no site URL resolves
- **THEN** `site:` contains the commented `# url: https://<org>.github.io/<repo>` hint and no active `url:`

### Requirement: Docouture's own site
This repository's `docs/antora-playbook.yml` SHALL set `site.url` to `https://inditextech.github.io/docouture`.

#### Scenario: Build emits sitemap
- **WHEN** the docs site is built with the real playbook
- **THEN** `sitemap.xml` and `404.html` are produced
