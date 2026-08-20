# Creating a site package

# Creating a site package

There is currently no in-workspace template to copy: `code/packages/starter` was removed
(it depended on `workspace:*` links to packages — `pdocs-ui-bundle`,
`pdocs-antora-extensions`, `pdocs-asciidoc-extensions` — none of which are published to
npm, so it could never be reused outside this monorepo either). The only surviving
`starter` is `code/packages/cli/templates/starter`, bundled into `@inditextech/pdocs-cli`
and used exclusively by `pdocs new` to scaffold a **standalone** site outside this
monorepo — it deliberately does not depend on those unpublished packages (plain Antora
default UI, no pdocs extensions) and is not meant to be copied into `code/packages/`.

## In this workspace

Until an in-workspace template exists again, base a new package on `example` — the only
site package left here — and strip its content down to what the new site needs:

```console
$ cd code/packages
$ cp -R example mysite
$ rm -rf mysite/build mysite/node_modules
```

Then rename in four places. They are the values that have to agree; see the table in
`SKILL.md`.

1. `mysite/package.json` → `"name": "@inditextech/pdocs-mysite"`.
2. `mysite/docs/antora.yml` → `name: mysite`, `title: My Site`.
3. `mysite/antora-playbook.yml` → `site.title`, `site.start_page: mysite::index.adoc`,
   and `content.sources[0].start_path: code/packages/mysite/docs`.
4. The playbook's header comment, which names the build command.

`example` is currently versioned under Mode 2 (`content.sources[].branches`/`tags`,
`docs/antora.yml`'s `version`/`prerelease`) — decide whether the new site wants that too,
or should collapse back to a single unversioned component (`version: ~`,
`branches: HEAD`, no `tags:`); see `reference/versioning-modes.md`.

Then install and build:

```console
$ cd code && pnpm install          # links the workspace:* ui-bundle dependency
$ just build-site mysite
$ just dev mysite 5001
```

`pnpm-workspace.yaml` globs `packages/*`, so the package is picked up with no registration
step. Nx infers `build`, `dev` and `clean` from the scripts; there is no `project.json` to
write.

## Conventions the name has to satisfy

- **Directory name = the `pdocs-` suffix of the package name.** `just dev` and
  `just build-site` interpolate a bare site name into `@inditextech/pdocs-<site>` and, for
  `dev`, into `packages/<site>` as well. A mismatch breaks the recipes, not the build.
- **`"private": true`.** These sites are never published; the artifact is the UI bundle.
- **Keep the version at whatever the workspace is on.** `just bump` rewrites every package
  to one version, so a new package should join at the current one.
- **Depend on the UI bundle with `workspace:*`.** That link is what gives Nx the
  `dependsOn: ["^build"]` edge that builds the bundle first. Without it the site builds
  against whatever stale zip happens to be on disk, or fails outright.
- **The component name is a URL segment.** It appears in every path under the site root and
  in every cross-component xref, so it is expensive to change later.

## Extracting a site into its own repository

The playbooks are written to make this a deletion rather than a rewrite. In a repository
where the playbook sits at the root and the `docs/` tree beside it:

```yaml
content:
  sources:
    - url: .
      start_path: docs
      branches: HEAD
```

Two other things change:

- **The UI bundle stops being a sibling.** Replace the relative `ui.bundle.url` with the
  published artifact URL and set `snapshot: false` — see `reference/playbook.md`. The
  `workspace:*` dependency becomes a normal versioned one, or disappears entirely if the
  bundle is fetched over https.
- **`scripts/dev.mjs` loses its UI watch.** It detects the absence of a sibling
  `ui-bundle` and logs `no sibling ui-bundle package, watching content only`. The script
  is dependency-free, so it can be copied across as-is.

The `antora.yml`, the `modules/` tree and every `.adoc` file move unchanged.

## First build fails with "start page not found"

On a fresh repository this is almost always the git precondition, not a typo: Antora reads
content from git and a repository with no commits resolves the content source to nothing.
Make an initial commit. `just doctor` reports it.
