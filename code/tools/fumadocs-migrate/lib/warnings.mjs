// Central warning collector. Every handler that hits something it can't
// convert with full fidelity (an unknown JSX component, a broken /docs/ link,
// a TypeTable expression that won't eval, ...) reports here instead of
// throwing — one bad page shouldn't stop the other 452 from converting, and
// the end-of-run summary is exactly the manual-review punch list Phase 5
// needs.
const warnings = []

export function warn(file, message) {
  warnings.push({ file, message })
}

export function getWarnings() {
  return warnings
}

export function printSummary() {
  if (warnings.length === 0) {
    console.log('\nNo warnings.')
    return
  }
  console.log(`\n${warnings.length} warning(s):`)
  for (const { file, message } of warnings) {
    console.log(`  ${file}: ${message}`)
  }
}
