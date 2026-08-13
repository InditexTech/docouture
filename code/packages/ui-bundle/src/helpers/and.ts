/**
 * `{{and a b}}` — logical AND.
 *
 * With two operands this returns the *value* that decided the result, not a
 * boolean, so it doubles as a value selector in templates (Handlebars appends
 * an options object, hence the arity checks). With more operands it reduces to
 * a boolean.
 */
const and = (...args: unknown[]): unknown => {
  if (args.length === 3) return args[0] && args[1]
  if (args.length < 3) throw new Error('{{and}} helper expects at least 2 arguments')
  args.pop()
  return args.every(Boolean)
}

export = and
