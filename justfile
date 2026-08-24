# pdocs — developer workflow entrypoint.
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
name := 'pdocs'
version := `awk -F'"' '/"version"/ { print $4; exit }' package.json`

# List the available commands. Private: it is what a bare `just` runs, so
# listing it in its own output would be circular.
[private]
default: (_hdr "")
    #!/usr/bin/env bash
    # The trailing newline is part of the heading; command substitution would
    # strip it, so it is written with ANSI-C quoting instead.
    just --list --unsorted --list-heading $'Available commands:\n\n'

# Announce which command is about to run
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

# ---------------------------------------------------------------- setup ------

# Provision the toolchain and install dependencies
[group('setup')]
[no-exit-message]
bootstrap: (_hdr "bootstrap")
    asdf install
    pnpm install
    @just doctor

# Check that the workspace is in a state where builds will succeed
[group('setup')]
[no-exit-message]
doctor: (_hdr "doctor")
    #!/usr/bin/env bash
    set -uo pipefail
    status=0

    if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
      red=$'\033[31m'; green=$'\033[32m'; off=$'\033[0m'
    else
      red=''; green=''; off=''
    fi

    fail() { printf '  %sFAIL%s  %s\n' "$red" "$off" "$1"; status=1; }
    ok()   { printf '  %s ok %s  %s\n' "$green" "$off" "$1"; }

    echo "toolchain"
    want_node=$(awk '/^nodejs /{print $2}' .tool-versions)
    have_node=$(node --version 2>/dev/null | tr -d 'v')
    if [ "$want_node" = "$have_node" ]; then
      ok "node $have_node"
    else
      fail "node ${have_node:-missing}, expected $want_node — run 'asdf install'"
    fi

    want_pnpm=$(awk '/^pnpm /{print $2}' .tool-versions)
    have_pnpm=$(pnpm --version 2>/dev/null)
    if [ "$want_pnpm" = "$have_pnpm" ]; then
      ok "pnpm $have_pnpm"
    else
      fail "pnpm ${have_pnpm:-missing}, expected $want_pnpm — run 'asdf install'"
    fi

    echo "dependencies"
    if [ -d node_modules ]; then
      ok "node_modules present"
    else
      fail "node_modules missing — run 'just bootstrap'"
    fi

    echo "registry"
    if grep -qx 'registry=https://registry.npmjs.org/' .npmrc; then
      ok "default registry pinned to npmjs"
    else
      fail "default registry not pinned in code/.npmrc"
      cat <<'EOF'

        Without the pin, installs inherit `registry=` from ~/.npmrc. A machine
        that defaults to an internal mirror resolves every package through it,
        and CI — which has no such default — resolves them from somewhere else.

    EOF
    fi

    echo "ids"
    # The IOP Design System never enters this workspace's install — see
    # tools/ids/README.md — so there is nothing to resolve here. This just
    # confirms the generated derivative it left behind is present; if it's
    # missing the build's CSS pipeline has no tokens to work with.
    if [ -f packages/ui-bundle/src/css/ids-tokens.css ] && [ -f packages/ui-bundle/src/css/ids-breakpoints.css ]; then
      ok "IOP DS token derivative present (packages/ui-bundle/src/css/ids-tokens.css)"
    else
      fail "IOP DS token derivative missing"
      cat <<'EOF'

        packages/ui-bundle/src/css/ids-tokens.css and ids-breakpoints.css are
        committed, generated files — this should not happen from a normal
        clone. If you deleted them, regenerate with:

          just ids-install && just ids-sync

    EOF
    fi

    echo "content"
    if git rev-parse HEAD >/dev/null 2>&1; then
      ok "repository has at least one commit"
    else
      fail "repository has no commits"
      cat <<'EOF'

        Antora reads content from git. It picks up uncommitted working-tree
        changes, but the repository must have at least one commit, or the
        content source resolves to nothing and every site builds with zero
        pages:

          Start page specified for site not found: starter::index.adoc

        Make an initial commit.
    EOF
    fi

    exit $status

# ------------------------------------------------------------------ dev ------

# Live-reloading UI bundle preview on :5252
[group('dev')]
preview-ui: (_hdr "preview-ui")
    pnpm --filter @inditextech/pdocs-ui-bundle preview

# Build a site and serve it on :5000, rebuilding as you edit it
[group('dev')]
[no-exit-message]
dev site='example' port='5000': (_hdr "dev " + site)
    #!/usr/bin/env bash
    set -uo pipefail

    # The build runs through Nx, for the cache and to pull in the UI bundle it
    # depends on. Its progress output is noise in front of a server you are
    # about to watch: on a cache hit it is twenty lines describing 90ms. Hold it
    # and print it only if the build fails, when it is the whole story.
    #
    # `--log-failure-level=none` overrides the playbook's own `warn` (see
    # antora-playbook.yml's runtime.log.failure_level comment) for this recipe
    # only. That setting is deliberately strict everywhere else — it is this
    # migration's regression test for broken xrefs — but `example`'s corpus
    # still carries 22 known, pre-existing Fumadocs content bugs (broken
    # links, meta.json typos) unrelated to whatever page you're actually
    # editing. Left at the playbook default, `just dev example` could never
    # start a server at all. Antora still exits non-zero (and this recipe
    # still surfaces the output and stops) on a genuine crash — a malformed
    # playbook, a missing UI bundle — since that's a thrown exception, not a
    # logged-message-count check; only the warn/error-level tolerance is
    # relaxed here.
    if ! out=$({{ nx }} run @inditextech/pdocs-{{ site }}:build --outputStyle=static -- --log-failure-level=none 2>&1); then
      printf '%s\n' "$out"
      exit 1
    fi
    # Still surface Antora's own content warnings — real signal, not Nx/gulp
    # noise — just without the surrounding wrapper chatter a cache hit would
    # otherwise print on every single save.
    printf '%s\n' "$out" | grep -E '"level":"(warn|error)"' || true


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

# Build a single site
[group('build')]
build-site site: (_hdr "build-site " + site)
    {{ nx }} run @inditextech/pdocs-{{ site }}:build

# ----------------------------------------------------------------- test ------

# Run tests across every package
[group('test')]
test *args: (_hdr "test")
    {{ nx }} run-many -t test {{ args }}

# Run tests for one or more packages (comma-separated short names, e.g. cli or cli,ui-bundle)
[group('test')]
[no-exit-message]
test-package packages *args: (_hdr "test-package " + packages)
    #!/usr/bin/env bash
    set -euo pipefail
    IFS=',' read -ra names <<< "{{ packages }}"
    projects=()
    for n in "${names[@]}"; do
      # strip leading/trailing whitespace
      n="$(echo "$n" | xargs)"
      [ -z "$n" ] && continue
      projects+=("@inditextech/pdocs-$n")
    done
    target_projects=$(IFS=,; echo "${projects[*]}")
    {{ nx }} run-many -t test -p "$target_projects" {{ args }}

# ------------------------------------------------------------------- ids -----
#
# The IOP Design System (IDS) is not a dependency of this workspace — see
# tools/ids/README.md for why. It lives in a sidecar pnpm project instead,
# installed only when you're regenerating the derivative CSS committed under
# packages/ui-bundle/src/css/ (ids-tokens.css, ids-breakpoints.css) or reading
# real DS source as reference while building a component. Three stages, and
# only the first touches the network:
#
#   ids-install   pnpm install in tools/ids (needs Artifactory creds in
#                 ~/.npmrc and VPN — same credential every developer already
#                 has from before this existed, just no longer needed for a
#                 plain `pnpm install` at the workspace root)
#   ids-sync      regenerate the committed derivative from tools/ids/node_modules
#   ids-check     regenerate in memory and fail if it would differ, writing
#                 nothing — a drift check, needs ids-install first
#
# Day to day you need none of these. Reach for ids-install when extending a
# component against real DS source, or ids-install + ids-sync after a DS
# version bump in tools/ids/package.json.

# Install the design system sidecar (network, needs Artifactory credentials)
[group('ids')]
[no-exit-message]
ids-install: (_hdr "ids-install")
    pnpm -C tools/ids install --ignore-workspace

# Regenerate the committed IDS token/breakpoint CSS from the sidecar
[group('ids')]
[no-exit-message]
ids-sync: (_hdr "ids-sync")
    node tools/ids/sync.mjs

# Check the committed IDS token/breakpoint CSS is not stale (writes nothing)
[group('ids')]
[no-exit-message]
ids-check: (_hdr "ids-check")
    node tools/ids/sync.mjs --check

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
bump level='patch': (_hdr "bump " + level)
    #!/usr/bin/env bash
    set -euo pipefail

    case '{{ level }}' in
      major | minor | patch | premajor | preminor | prepatch | prerelease) ;;
      [0-9]*.[0-9]*.[0-9]*) ;;
      *)
        echo "  not a bump level or version: '{{ level }}'"
        echo "  expected: major | minor | patch | premajor | preminor | prepatch | prerelease | X.Y.Z"
        exit 2
        ;;
    esac

    old=$(node -p "require('./package.json').version")

    # The workspace root carries the version everything else follows. npm does
    # the semver arithmetic and the validation; --loglevel error suppresses its
    # complaints about the pnpm-specific keys in .npmrc.
    pnpm version '{{ level }}' --no-git-tag-version --loglevel error >/dev/null

    new=$(node -p "require('./package.json').version")

    # Propagate the resulting literal rather than re-running the bump level in
    # each package: a package that had drifted is pulled back into line instead
    # of drifting further. `pnpm -r` excludes the workspace root, already done.
    pnpm -r exec -- npm version "$new" \
      --allow-same-version --no-git-tag-version --loglevel error >/dev/null

    # npm rewrites these files itself; without this a bump can leave `just
    # check` failing on formatting.
    pnpm exec prettier --write --log-level warn package.json 'packages/*/package.json'

    printf '  %s → %s\n\n' "$old" "$new"

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
changelog: (_hdr "changelog")
    #!/usr/bin/env bash
    set -euo pipefail
    awk '/^## \[Unreleased\]/{f=1; next} f && /^## \[/{exit} f' CHANGELOG.md

# Start an ephemeral local npm registry (Verdaccio) on :4873, for release-local
[group('release')]
[no-exit-message]
local-registry-start: (_hdr "local-registry-start")
    #!/usr/bin/env bash
    set -euo pipefail

    tmpdir=$(mktemp -d)
    storage="$tmpdir/storage"
    config="$tmpdir/config.yaml"
    mkdir -p "$storage"
    trap 'rm -rf "$tmpdir"' EXIT

    # Proxies everything except @inditextech/* to npmjs, so a consuming
    # repo's other dependencies still resolve normally through this
    # registry if pointed at it wholesale rather than scoped.
    cat > "$config" <<CONFIG
    storage: $storage
    uplinks:
      npmjs:
        url: https://registry.npmjs.org/
    packages:
      '@inditextech/*':
        access: \$all
        publish: \$all
        unpublish: \$all
      '**':
        access: \$all
        proxy: npmjs
    log:
      - { type: stdout, format: pretty, level: warn }
    CONFIG

    echo "  Verdaccio starting on http://localhost:4873"
    echo "  storage: $storage"
    echo "  Ctrl-C to stop and remove the storage directory."
    echo

    npx --yes verdaccio --config "$config" --listen 4873

# Snapshot-publish every non-private packages/* package to local-registry-start
[group('release')]
[no-exit-message]
release-local: (_hdr "release-local")
    #!/usr/bin/env bash
    set -euo pipefail

    registry='http://localhost:4873'
    # Derived from packages/*/package.json's `private` field — the same
    # source scripts/publishable-packages.mjs feeds to the CI release
    # workflow, so the two can't silently drift apart.
    mapfile -t packages < <(node scripts/publishable-packages.mjs)

    if ! curl -fsS "$registry/-/ping" >/dev/null 2>&1; then
      echo "  no registry responding at $registry"
      echo "  run 'just local-registry-start' in another terminal first"
      exit 1
    fi

    # Hard-abort on any uncommitted change to these files rather than stash
    # or work around it: the revert step at the end trusts `git checkout` to
    # put back exactly what was there before this ran, and an in-progress
    # edit to one of these files should never be silently clobbered.
    dirty=()
    for pkg in "${packages[@]}"; do
      path="packages/$pkg/package.json"
      if ! git diff --quiet -- "$path" || ! git diff --quiet --cached -- "$path"; then
        dirty+=("$path")
      fi
    done
    if [ "${#dirty[@]}" -gt 0 ]; then
      echo "  uncommitted changes in:"
      printf '    %s\n' "${dirty[@]}"
      echo "  commit or stash them first — release-local reverts these files to their committed state when it finishes."
      exit 1
    fi

    snapshot="0.0.0-local.$(git rev-parse --short HEAD).$(date +%s)"
    echo "  snapshot version: $snapshot"

    # Runs on success, failure and interrupt alike, so a Ctrl-C mid-publish
    # never leaves a package.json version bump behind.
    restore() {
      status=$?
      echo
      echo "  reverting package.json versions"
      for pkg in "${packages[@]}"; do
        git checkout -- "packages/$pkg/package.json"
      done
      exit $status
    }
    trap restore EXIT

    for pkg in "${packages[@]}"; do
      (cd "packages/$pkg" && npm version "$snapshot" --no-git-tag-version --allow-same-version --loglevel error >/dev/null)
    done

    # Only ui-bundle and cli have a build step; antora-extensions,
    # asciidoc-extensions and publish-gh-pages publish their committed JS
    # source directly.
    {{ nx }} run-many -t build -p @inditextech/pdocs-ui-bundle @inditextech/pdocs-cli

    for pkg in "${packages[@]}"; do
      echo "  publishing $pkg"
      # pnpm publish (not npm publish) is required here: it rewrites each
      # package's "workspace:*" cross-references to the resolved $snapshot
      # version at pack time. npm doesn't understand the workspace: protocol
      # at all and would ship the literal string, breaking installs in any
      # consuming repo that isn't itself a pnpm workspace.
      (cd "packages/$pkg" && pnpm publish --registry "$registry" --tag local --no-git-checks --loglevel warn)
    done

    echo
    echo "  Published to $registry as $snapshot:"
    for pkg in "${packages[@]}"; do
      name=$(node -p "require('./packages/$pkg/package.json').name")
      echo "    $name"
    done

    cat <<EOF

      To consume from another repo, add to its .npmrc:

        @inditextech:registry=$registry/

      Then install the snapshot, e.g.:

        npm install @inditextech/pdocs-cli@$snapshot

      package.json versions in this repo have already been reverted; the
      snapshot stays installable from Verdaccio until local-registry-start's
      storage directory is removed (Ctrl-C it).
    EOF
