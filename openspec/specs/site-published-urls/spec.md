# site-published-urls Specification

## Purpose
Defines how the site's published URLs (search index records and llms.txt links) derive from the playbook's site.url, so links keep the site path prefix and are absolute when the URL is known.

## Requirements

### Requirement: Site URL base derivation
The antora-extensions package SHALL derive a path prefix and a base URL from `playbook.site.url`. For a full URL the prefix SHALL be its pathname without a trailing slash; for a value starting with `/` that value; for `/`, empty or absent, the prefix SHALL be empty. The base URL SHALL be the full `site.url` without a trailing slash, and empty when `site.url` is absent or path-only.

#### Scenario: Full URL with path
- **WHEN** `site.url` is `https://inditextech.github.io/docouture`
- **THEN** the prefix is `/docouture` and the base URL is `https://inditextech.github.io/docouture`

#### Scenario: Root URL
- **WHEN** `site.url` is `https://docs.example.com/` or `/`
- **THEN** the prefix is empty

#### Scenario: No site URL
- **WHEN** `site.url` is not set
- **THEN** the prefix and base URL are empty

### Requirement: Search record URLs include the site path
Every `url` in the search index records SHALL be the page's `pub.url` (plus any `#fragment`) prefixed with the site path prefix. The envelope `version` SHALL remain 1.

#### Scenario: Site hosted under a path
- **WHEN** `site.url` is `https://inditextech.github.io/docouture` and a page's `pub.url` is `/prerelease/main/faq/`
- **THEN** its records have `url` `/docouture/prerelease/main/faq/` or `/docouture/prerelease/main/faq/#<id>`

#### Scenario: No site URL
- **WHEN** `site.url` is not set
- **THEN** record URLs equal the raw `pub.url`, as before

### Requirement: llms.txt links are absolute when site URL is known
`llms.txt` entry links and the `Source:` line of each `llms-full.txt` entry SHALL be the base URL plus `pub.url` when a base URL exists, and the raw `pub.url` otherwise.

#### Scenario: Absolute links
- **WHEN** `site.url` is `https://inditextech.github.io/docouture`
- **THEN** a page entry links to `https://inditextech.github.io/docouture/prerelease/main/faq/`

#### Scenario: No site URL
- **WHEN** `site.url` is not set
- **THEN** links remain root-relative, as before
