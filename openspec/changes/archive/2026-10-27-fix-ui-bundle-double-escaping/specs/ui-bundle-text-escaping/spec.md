# Spec Delta

## Purpose

Defines how the UI bundle's page chrome renders text that comes from Antora or from site configuration, so a reserved character such as `&`, `<` or `>` appears exactly as the author wrote it, neither doubled-escaped nor injected as markup.

## ADDED Requirements

### Requirement: Antora-escaped text renders escaped once
Text that Antora supplies already HTML-escaped (`page.description`, every `page.attributes.*` value, and navigation item content) SHALL be output without a second escaping pass. A `&` written by the author SHALL appear in the built HTML as `&amp;`, never `&amp;amp;`, and SHALL display as `&` in the browser.

#### Scenario: Hero excerpt with an ampersand
- **WHEN** a page sets `:description: Draw & edit text on the canvas`
- **THEN** the hero excerpt HTML contains `Draw &amp; edit text on the canvas` and does not contain `&amp;amp;`

#### Scenario: Hero tags and action labels with an ampersand
- **WHEN** a page sets `:page-tags: R&D, Beta` and `:page-action: Q&A` with a `:page-action-url:`
- **THEN** the tag and button label HTML each contain a single `&amp;` and no `&amp;amp;`

#### Scenario: Home hero tags and action labels
- **WHEN** a home page sets `:page-tags:`, `:page-action:` or `:page-action-secondary:` values containing `&`
- **THEN** the home hero output contains a single `&amp;` for each and no `&amp;amp;`

#### Scenario: Navigation toggle aria-label
- **WHEN** a navigation item's content contains `&` or inline markup
- **THEN** the toggle's `aria-label` contains the tag-stripped text escaped once, with quotes escaped, and no `&amp;amp;`

### Requirement: Excerpt carries no markup
The hero excerpt SHALL be plain text: any HTML tags present in `page.description` SHALL be stripped before output, consistent with the page's `<meta name="description">`.

#### Scenario: Description with inline markup
- **WHEN** `page.description` contains `<strong>bold</strong> text`
- **THEN** the excerpt contains `bold text` and no `<strong>` element

### Requirement: Raw configuration text renders escaped once
Text taken from the playbook or the component descriptor (`site.title`, `nav_modules` titles shown in the search dialog) is not pre-escaped, and SHALL be output through the escaping path so that `<` and `&` are escaped exactly once.

#### Scenario: Raw site title with an ampersand
- **WHEN** `site.title` is `R&D Docs`
- **THEN** the home hero title HTML contains `R&amp;D Docs`

#### Scenario: Raw module title with an angle bracket
- **WHEN** a `nav_modules` title is `A <B>`
- **THEN** the search-dialog chip label contains `A &lt;B&gt;` and no element is created
