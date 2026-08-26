'use strict'

// `pdocs completion <bash|zsh>` — prints a completion script to stdout (so
// `pdocs completion bash > file` and `eval "$(pdocs completion bash)"` both
// work); everything else this command has to say (usage errors) goes to
// stderr, same discipline as every other command. The candidate list is
// kept here as a literal array rather than derived from bin.ts's dispatch
// table, since introducing a shared "registry" module for nine commands
// that essentially never change is more machinery than the problem needs —
// see COMMANDS' own comment for what keeps it honest.

// Kept in sync with bin.ts's RUNNERS keys by test (completion.spec.ts) —
// not by import, since bin.ts is the entrypoint and importing it back here
// would run its top-level `main()` invocation.
export const COMMANDS = [
  'new',
  'version',
  'dev',
  'build',
  'publish',
  'doctor',
  'upgrade',
  'eject',
  'teardown',
  'completion',
] as const

function bashScript(): string {
  const words = COMMANDS.join(' ')
  return `# pdocs bash completion
#
# Install for the current session:
#   eval "$(pdocs completion bash)"
#
# Install permanently, e.g. on macOS with Homebrew's bash-completion@2:
#   pdocs completion bash > "$(brew --prefix)/etc/bash_completion.d/pdocs"
_pdocs_completions() {
  local cur=\${COMP_WORDS[COMP_CWORD]}
  COMPREPLY=($(compgen -W "${words}" -- "$cur"))
}
complete -F _pdocs_completions pdocs
`
}

function zshScript(): string {
  const words = COMMANDS.map((c) => `'${c}'`).join(' ')
  return `#compdef pdocs
# pdocs zsh completion
#
# Install by placing this on your $fpath, e.g.:
#   pdocs completion zsh > "\${fpath[1]}/_pdocs"
_pdocs() {
  local -a commands
  commands=(${words})
  _describe 'pdocs command' commands
}
_pdocs
`
}

export function runCompletion(argv: string[]): number {
  const shell = argv[0]

  if (shell === 'bash') {
    process.stdout.write(bashScript())
    return 0
  }
  if (shell === 'zsh') {
    process.stdout.write(zshScript())
    return 0
  }

  console.error('usage: pdocs completion <bash|zsh>')
  return 1
}
