# Copy checklist

Copying `starter` into a new site called `mysite`. Substitute the name everywhere.

## 1. Copy

```console
$ cd code/packages
$ cp -R starter mysite
$ rm -rf mysite/build mysite/node_modules
```

## 2. Rename, file by file

**`mysite/package.json`**

```diff
- "name": "@inditextech/pdocs-starter",
+ "name": "@inditextech/pdocs-mysite",
- "description": "Minimal Antora site to copy when starting a new documentation project",
+ "description": "<what this site documents>",
```

Leave `version`, `private`, `engines`, `scripts` and `dependencies` alone. The version
tracks the workspace (`just bump` rewrites all of them together).

**`mysite/docs/antora.yml`**

```diff
- name: starter
+ name: mysite
- title: Starter
+ title: My Site
  version: ~
```

`name` is a URL segment and the prefix of every cross-component xref — expensive to change
later, so decide it now.

**`mysite/antora-playbook.yml`**

```diff
- # Build with:  pnpm nx run @inditextech/pdocs-starter:build
+ # Build with:  pnpm nx run @inditextech/pdocs-mysite:build

  site:
-   title: Documentation
+   title: My Site
-   start_page: starter::index.adoc
+   start_page: mysite::index.adoc

  content:
    sources:
      - url: ../../..
-       start_path: code/packages/starter/docs
+       start_path: code/packages/mysite/docs
```

`start_path` is resolved from the **repository root**, not from the playbook. That is why
it is fully qualified.

**`mysite/docs/modules/ROOT/pages/`**

Rewrite `index.adoc` for the new site. Delete `getting-started.adoc` or replace its
content — it names the starter build command:

```diff
- $ pnpm nx run @inditextech/pdocs-starter:build
+ $ pnpm nx run @inditextech/pdocs-mysite:build
```

If a page is deleted, drop its `xref:` line from `modules/ROOT/nav.adoc` too. A page
missing from nav still publishes; an `xref:` to a deleted page fails the build
(`failure_level: warn`).

## 3. Install and verify

```console
$ cd code
$ pnpm install                 # links the workspace:* ui-bundle dependency
$ just build-site mysite
$ just dev mysite 5001
```

`pnpm-workspace.yaml` globs `packages/*`, so there is no registration step, and Nx infers
`build`/`dev`/`clean` from the scripts — no `project.json` to write.

## 4. Check the result

- The site opens at `/` and lands on the index page — proves `site.start_page`, the
  component `name` and the file all agree.
- The page count is not zero. Zero pages plus `Start page specified for site not found`
  usually means `start_path` is wrong, or the repository has no commits (Antora reads
  content from git). `just doctor` reports the latter.
- Navigation renders both entries — proves `nav.adoc` is reachable from `antora.yml`.
- Styling is present — proves the UI bundle resolved. If not, the `workspace:*` dependency
  is missing and Nx never built it.
