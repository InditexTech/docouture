'use strict'

const { watch } = require('gulp')

// NOTE upstream also relabelled the undertaker task tree by reaching into
// undertaker/lib/helpers/metadata. That is an internal path of a transitive
// dependency and only affects the cosmetics of `gulp --tasks`, so it is dropped.
module.exports = ({ name, desc, opts, call: fn, loop }) => {
  if (name) fn.displayName = name
  if (loop) {
    const delegate = fn
    name = delegate.displayName
    delegate.displayName = `${name}:loop`
    fn = () => watch(loop, { ignoreInitial: false }, delegate)
    fn.displayName = name
  }
  if (desc) fn.description = desc
  if (opts) fn.flags = opts
  return fn
}
