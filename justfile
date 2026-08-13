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

# List the available commands
default: (_hdr "")
    #!/usr/bin/env bash
    # The trailing newline is part of the heading; command substitution would
    # strip it, so it is written with ANSI-C quoting instead.
    just --list --unsorted --list-heading $'Available commands:\n'

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
    want_node=$(awk '/^ivm-node /{print $2}' .tool-versions)
    have_node=$(node --version 2>/dev/null | tr -d 'v')
    if [ "$want_node" = "$have_node" ]; then
      ok "node $have_node"
    else
      fail "node ${have_node:-missing}, expected $want_node — run 'asdf install'"
    fi

    want_pnpm=$(awk '/^ivm-pnpm /{print $2}' .tool-versions)
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
preview: (_hdr "preview")
    {{ nx }} run @inditextech/pdocs-ui-bundle:preview

# Build and serve a site on :5000
[group('dev')]
serve site='starter': (_hdr "serve " + site)
    {{ nx }} run @inditextech/pdocs-{{ site }}:serve

# ---------------------------------------------------------------- build ------

# Build every package
[group('build')]
build *args: (_hdr "build")
    {{ nx }} run-many -t build {{ args }}

# Build a single site
[group('build')]
build-site site: (_hdr "build-site " + site)
    {{ nx }} run @inditextech/pdocs-{{ site }}:build

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
