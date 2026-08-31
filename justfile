# docouture — developer workflow entrypoint.
#
# The Nx workspace root is `code/`, not the repository root: `.tool-versions` is
# resolved by walking up from the current directory, so `pnpm` only works from
# inside `code/`. Every recipe below runs there, which is why you don't have to.
#
# `just` is the human-facing surface; `package.json` scripts are the
# machine-facing one. Recipes delegate to `nx` or to a `package.json` script and
# never reimplement build logic, so the two cannot drift.

set working-directory := 'code'

nx := 'pnpm nx'
tooling := 'pnpm exec docouture-tooling'
name := 'docouture'
version := `awk -F'"' '/"version"/ { print $4; exit }' package.json`

# List the available commands. Private: it is what a bare `just` runs, so
# listing it in its own output would be circular.
[private]
default: (_hdr "")
    #!/usr/bin/env bash
    # The trailing newline is part of the heading; command substitution would
    # strip it, so it is written with ANSI-C quoting instead.
    just --list --unsorted --list-heading $'Available commands:\n\n'

# Announce which command is about to run. Deliberately stays inline bash
# rather than delegating to packages/tooling (GH-140) like the recipes below
# it: `just bootstrap` prints one of these *before* `pnpm install` has ever
# run, so this can't depend on a workspace package's build output existing —
# a genuine zero-dependency requirement none of the other migrated recipes
# have to satisfy, since they only ever run against an already-set-up repo.
[private]
_hdr cmd:
    #!/usr/bin/env bash
    if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
      dim=$'\033[2m'; bold=$'\033[1m'; off=$'\033[0m'
    else
      dim=''; bold=''; off=''
    fi

    # Box-drawing characters need a UTF-8 locale; fall back to ASCII.
    case "${LC_ALL:-${LC_CTYPE:-${LANG:-}}}" in
      *UTF-8* | *utf8* | *UTF8*) corner='╭─'; dash='─'; sep='·' ;;
      *) corner='+-'; dash='-'; sep='-' ;;
    esac

    # The rule is sized from the UNCOLOURED text: counting the coloured string
    # would count the ANSI escapes too and leave the rule short.
    plain='{{ name }} v{{ version }}'
    label='{{ cmd }}'
    [ -n "$label" ] && plain="$plain $sep $label"

    cols=$(tput cols 2>/dev/null || echo 80)
    [ "$cols" -gt 100 ] && cols=100

    banner="${dim}${corner}${off} ${dim}{{ name }} v{{ version }}${off}"
    [ -n "$label" ] && banner="${banner} ${dim}${sep}${off} ${bold}${label}${off}"

    # corner + space + text + space; anything left over becomes rule. A long
    # label on a narrow terminal leaves nothing, and then there is no rule
    # rather than a wrapped one.
    fill=$((cols - ${#corner} - 1 - ${#plain} - 1))
    if [ "$fill" -gt 0 ]; then
      rule=''
      for ((i = 0; i < fill; i++)); do rule+="$dash"; done
      banner="${banner} ${dim}${rule}${off}"
    fi

    printf '%s\n\n' "$banner"

# Ensures packages/tooling (GH-140) is built before any recipe below shells
# out to it — `pnpm exec docouture-tooling` fails outright otherwise, e.g.
# straight after a fresh clone. Routed through nx so repeat calls are a
# cache hit, not a rebuild.
[private]
_tooling:
    @{{ nx }} run @inditextech/docouture-tooling:build >/dev/null

# ---------------------------------------------------------------- setup ------

# Provision the toolchain and install dependencies
[group('setup')]
[no-exit-message]
bootstrap: (_hdr "bootstrap")
    asdf install
    pnpm install
    @just doctor

# Check that the workspace is in a state where builds will succeed. The
# checks themselves live in packages/tooling (GH-140) — see its own
# src/commands/doctor.ts — as tested code instead of inline bash; pass
# `--json` for a machine-readable report.
[group('setup')]
[no-exit-message]
doctor *args: (_hdr "doctor") _tooling
    {{ tooling }} doctor {{ args }}

# ------------------------------------------------------------------ dev ------

# Live-reloading UI bundle preview on :5252
[group('dev')]
preview-ui: (_hdr "preview-ui")
    pnpm --filter @inditextech/docouture-ui-bundle preview

# Stop the local Kroki service (GH-44) that kroki-prewarm.js starts automatically
# for a kroki-enabled build — the manual counterpart to that auto-start, which
# never stops it itself; see antora-extensions/lib/kroki-docker.js's own header.
# Targets whichever compose file is actually in effect for `example` — an ejected
# override at packages/example/kroki-compose.yml if one exists there, else the
# bundled default in packages/antora-extensions/resources — same resolution order
# kroki-docker.js itself uses. Scaffolded (non-monorepo) sites use `docouture teardown
# kroki` instead, which resolves the same way against their own docs/ directory.
[group('dev')]
kroki-down: (_hdr "kroki-down")
    #!/usr/bin/env bash
    set -euo pipefail
    compose_file="packages/example/kroki-compose.yml"
    if [ ! -f "$compose_file" ]; then
      compose_file="packages/antora-extensions/resources/kroki-compose.yml"
    fi
    docker compose -f "$compose_file" down

# Build a site and serve it on :5000, rebuilding as you edit it. Pass `true`
# as the last arg to force a real rebuild instead of an Nx cache replay —
# see `build-site`'s own comment for when that matters.
[group('dev')]
[no-exit-message]
dev site='example' port='5000' strict='false' no_cache='false': (_hdr "dev " + site)
    #!/usr/bin/env bash
    set -uo pipefail

    # The build runs through Nx, for the cache and to pull in the UI bundle it
    # depends on. Its progress output is noise in front of a server you are
    # about to watch: on a cache hit it is twenty lines describing 90ms. Hold it
    # and print it only if the build fails, when it is the whole story.
    #
    # By default this recipe overrides the playbook's own `warn`
    # (see antora-playbook.yml's runtime.log.failure_level comment) with
    # `--log-failure-level=none`, because `example`'s corpus still carries 22
    # known, pre-existing Fumadocs content bugs (broken links, meta.json
    # typos) unrelated to whatever page you're actually editing. Left at the
    # playbook default, `just dev example` could never start a server at
    # all. Pass `strict=true` to drop the override and build at the
    # playbook's real, CI-equivalent strictness instead — useful once those
    # 22 issues are fixed, or against a site that has none of them. Antora
    # still exits non-zero (and this recipe still surfaces the output and
    # stops) on a genuine crash — a malformed playbook, a missing UI bundle —
    # regardless of this setting, since that's a thrown exception, not a
    # logged-message-count check; only the warn/error-level tolerance is
    # what `strict` controls.
    #
    # `--log-level=info`: Antora's own default (`warn`, set by
    # @antora/playbook-builder's convict schema, not the `info` @antora/
    # logger falls back to on its own) would otherwise silently drop every
    # docouture-* extension's own observability logs — Kroki's auto-start/
    # render lifecycle (kroki-docker.js/kroki-prewarm.js), search-index's
    # per-component summary, llms-txt's, footer's, nav-modules', version-
    # report's, not-found-page's — before the grep below even sees them.
    # See asciidoc-extensions/README.md's own note on this for Kroki
    # specifically; the same reasoning applies to every `getLogger('docouture-
    # ...')` caller in antora-extensions/lib, which is why the filter below
    # keys off the shared `docouture-` logger-name prefix rather than naming
    # Kroki alone.
    #
    # `--log-format=pretty`: Antora's own default format is "pretty if
    # CI=true or stdout is a TTY, json otherwise" (its own schema doc) — and
    # piping through `tee`/`grep` below, same as this recipe already did
    # before this flag existed, makes stdout not a TTY, so without this
    # override every line downgrades to raw ndjson
    # (`{"level":"info","time":...}`) even though a human is reading it right
    # here. Forcing pretty explicitly is what `build-site` gets for free by
    # never piping its own output at all. The grep filter below is written
    # against pino-pretty's line shape, not ndjson's, to match.
    extra_args=(--log-level=info --log-format=pretty)
    if [ '{{ strict }}' != 'true' ]; then
      extra_args+=(--log-failure-level=none)
    fi

    # Stream the build live, filtered to the same docouture-*/warn/error signal
    # the old buffer-then-print version only showed you once the whole
    # build was over. That buffering was invisible-by-design for the common
    # case (a cache hit is twenty lines describing 90ms) but it also meant
    # Kroki's own auto-start (kroki-docker.js: up to ~1s reachability probe
    # + however long `docker compose up -d` itself takes, cold-pulling
    # images the first time + up to 60s polling — see that file's own
    # constants) produced zero terminal output for however long that took,
    # indistinguishable from a hung process. `tee` keeps the full raw log
    # for the on-failure dump below while a parallel `grep` shows the
    # filtered subset AS it's written, not after — a cache hit with nothing
    # docouture-* to report still prints nothing, same as before.
    #
    # PIPESTATUS, not `pipefail` + `if ! pipeline`: grep legitimately exits 1
    # whenever nothing in this build matched (the common, good case), and a
    # trailing `|| true` to tolerate that clobbers PIPESTATUS itself (bash
    # overwrites it with the trivial one-element pipeline `true` becomes) —
    # reading PIPESTATUS[0] (the nx/antora process, not grep) immediately
    # after the pipeline, with neither `pipefail` nor a tolerating `||`, is
    # what actually keeps nx's own exit code intact.
    logfile=$(mktemp)
    trap 'rm -f "$logfile"' EXIT

    {{ nx }} run @inditextech/docouture-{{ site }}:build --outputStyle=static {{ if no_cache == 'true' { '--skip-nx-cache' } else { '' } }} -- "${extra_args[@]}" 2>&1 \
      | tee "$logfile" \
      | grep --line-buffered -E '\(docouture-|\bWARN\b|\bERROR\b'
    build_status=${PIPESTATUS[0]}

    if [ "$build_status" -ne 0 ]; then
      # The live grep above only ever showed the filtered subset — a
      # genuine failure needs the whole story, same as before.
      cat "$logfile"
      exit 1
    fi

    # The server itself does not go through Nx: there is nothing left to
    # orchestrate, and running the script directly keeps a task runner from
    # drawing over its output. `exec` so Ctrl-C reaches the server.
    #
    # `-C` rather than `--filter`: the filtered form routes through pnpm's
    # recursive runner, which wraps any failure in an ERR_PNPM_RECURSIVE_RUN
    # report that buries the server's own error message.
    PORT='{{ port }}' exec pnpm -C 'packages/{{ site }}' run dev

# ---------------------------------------------------------------- build ------

# Build every package
[group('build')]
build *args: (_hdr "build")
    {{ nx }} run-many -t build {{ args }}

# Build a single site. Pass `true` as the second arg to force a real
# rebuild instead of an Nx cache replay.
[group('build')]
build-site site no_cache='false': (_hdr "build-site " + site)
    # `--log-level=info`: same reasoning as `dev`'s own recipe above — Antora's
    # actual default (`warn`) would otherwise silently drop every docouture-*
    # extension's own `info`-level observability logs (Kroki's lifecycle,
    # search-index's per-component summary, ...) before they're even
    # emitted. Unlike `dev`, this prints everything unfiltered already (no
    # grep — nx streams it live), so this one flag is the whole fix here.
    #
    # `no_cache`: Nx's cache replays a prior run verbatim — including its
    # captured log output — whenever none of that task's declared inputs
    # changed; useful when what changed is actually external, e.g.
    # re-exercising Kroki's docker-compose auto-start after `just
    # kroki-down`, not just re-reading a cache entry that already has
    # "Kroki rendered N diagram(s)" baked into it from a prior run.
    {{ nx }} run @inditextech/docouture-{{ site }}:build {{ if no_cache == 'true' { '--skip-nx-cache' } else { '' } }} -- --log-level=info

# ----------------------------------------------------------------- test ------

# Run tests across every package
[group('test')]
test *args: (_hdr "test")
    {{ nx }} run-many -t test {{ args }}

# Run tests for one or more packages (comma-separated short names, e.g. cli or cli,ui-bundle)
[group('test')]
[no-exit-message]
test-package packages *args: (_hdr "test-package " + packages) _tooling
    {{ tooling }} test-package {{ packages }} {{ args }}

# ---------------------------------------------------------------- icons ------
#
# Icons are vendored from the IOP Design System into a local sprite so they
# render in static, JavaScript-off HTML. Two stages, and only the first one
# touches the network:
#
#   icons-fetch   mirrors all 25 group sprites into packages/ui-bundle/.icons
#                 (gitignored) and records what it got in icons.lock.json
#   icons-build   cuts src/img/ids-icons.svg from that mirror, using only the
#                 icons listed in src/img/icons.yml
#
# Day to day you only need icons-build: add a line to the manifest, run it,
# commit the sprite. icons-fetch is for design system updates.
#
# `-C` rather than `--filter`: these scripts exit non-zero to report a bad icon
# name, and pnpm's recursive runner would bury their output in an
# ERR_PNPM_RECURSIVE_RUN report.

# Find an icon in the design system catalogue
[group('icons')]
[no-exit-message]
icons-search *terms: (_hdr "icons-search " + terms)
    pnpm -C packages/ui-bundle run icons:search {{ terms }}

# Regenerate the icon sprite from src/img/icons.yml
[group('icons')]
[no-exit-message]
icons-build *args: (_hdr "icons-build")
    pnpm -C packages/ui-bundle run icons:build {{ args }}

# Re-mirror the design system icon catalogue (network)
[group('icons')]
[no-exit-message]
icons-fetch *args: (_hdr "icons-fetch")
    pnpm -C packages/ui-bundle run icons:fetch {{ args }}

# ---------------------------------------------------------------- check ------

# Everything CI runs: lint, typecheck, formatting
[group('check')]
check: (_hdr "check") lint typecheck format-check

# Lint every package
[group('check')]
lint: (_hdr "lint")
    pnpm lint

# Apply the lint fixes that can be applied automatically
[group('check')]
lint-fix: (_hdr "lint-fix")
    {{ nx }} run-many -t lint:fix

# Type-check every package
[group('check')]
typecheck: (_hdr "typecheck")
    pnpm typecheck

# Format sources and this justfile
[group('check')]
fmt: (_hdr "fmt")
    pnpm format
    just --fmt

# Verify formatting without writing
[group('check')]
format-check: (_hdr "format-check")
    pnpm format:check
    just --fmt --check

# Run a target only for projects affected by the current changes
[group('check')]
affected target='build': (_hdr "affected " + target)
    {{ nx }} affected -t {{ target }}

# ----------------------------------------------------------------- maint -----

# Set the version of every package: major, minor, patch or an explicit X.Y.Z
[group('maint')]
[no-exit-message]
bump level='patch': (_hdr "bump " + level) _tooling
    {{ tooling }} bump '{{ level }}'

# Remove build outputs
[group('maint')]
clean: (_hdr "clean")
    pnpm clean

# Remove build outputs, dependencies and the Nx cache, then reinstall
[confirm('Remove node_modules and the Nx cache, then reinstall? [y/N]')]
[group('maint')]
reset: (_hdr "reset")
    pnpm clean
    rm -rf node_modules packages/*/node_modules .nx/cache .nx/workspace-data
    pnpm install

# Open the project graph
[group('maint')]
graph: (_hdr "graph")
    {{ nx }} graph

# List dependencies with newer versions available
[group('maint')]
outdated: (_hdr "outdated")
    pnpm outdated -r

# --------------------------------------------------------------- release -----
#
# `release-local` snapshot-publishes the five platform packages
# (ui-bundle, cli, antora-extensions, asciidoc-extensions, publish-gh-pages)
# to a local
# Verdaccio registry, for testing a consuming repo against them before
# cutting a real release through
# .github/workflows/code-npm_node-publish-release-and-snapshot.yml. Two
# recipes, run in separate terminals:
#
#   local-registry-start   starts Verdaccio on :4873, foreground, until
#                           you Ctrl-C it — run this first and leave it up
#   release-local           snapshot-versions, builds and publishes to
#                           whatever is listening on :4873, then reverts
#                           the version bump — run this as many times as
#                           you like while local-registry-start stays up
#
# Neither touches code/.npmrc (which pins the default registry to npmjs
# for everyone else): `release-local` publishes with an explicit
# `--registry` flag, and points you at a scoped `.npmrc` line to add to
# whatever repo you're testing against instead.

# Show the not-yet-released entries in CHANGELOG.md
[group('release')]
changelog: (_hdr "changelog") _tooling
    {{ tooling }} changelog

# Start an ephemeral local npm registry (Verdaccio) on :4873, for release-local
[group('release')]
[no-exit-message]
local-registry-start: (_hdr "local-registry-start") _tooling
    {{ tooling }} registry start

# Snapshot-publish every non-private packages/* package to local-registry-start
[group('release')]
[no-exit-message]
release-local: (_hdr "release-local") _tooling
    {{ tooling }} release-local
