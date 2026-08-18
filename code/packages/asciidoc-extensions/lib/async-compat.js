'use strict'

// Bridges the two Asciidoctor.js majors this repo runs — see
// first-positional.js's own comment for the first instance of this split.
// 2.2 (Opal, real Antora site builds) is fully synchronous throughout its
// JS bridge. 4.0 (native JS, the ui-bundle preview harness) makes
// `parseContent`/`convert`/`precomputeText` all return Promises instead.
// Neither extension using this can be written `async` unconditionally: that
// would hand 2.2's synchronous Opal caller a Promise where it expects a
// real value, since Opal's own dispatch loop never awaits a plain JS
// function's return value — verified empirically (a bare `async` process
// function renders literally "[object Promise]" under Antora's 2.2, not an
// error, which is what surfaced this in the first place).
//
// `chain`/`chainAll` run `fn` immediately if the input is already a plain
// value (2.2), or after it resolves if it's a thenable (4.0). The
// extension's own `process()` callback then returns whatever `fn` returns —
// a plain value under 2.2, a Promise under 4.0 — matching what each
// version's own block-processing loop expects (4.0's parser `await`s the
// return value of `processMethod`; 2.2's Opal loop uses it directly).
function chain(value, fn) {
  if (value && typeof value.then === 'function') return value.then(fn)
  return fn(value)
}

function chainAll(values, fn) {
  if (values.some((v) => v && typeof v.then === 'function')) {
    return Promise.all(values).then(fn)
  }
  return fn(values)
}

// A ListItem's `.getText()` needs `.precomputeText()` called first when the
// item was parsed outside Document's own top-level parse — exactly what
// these two extensions do via `parseContent`. The substituted text (inline
// macros like `xref:` resolved) is normally pre-computed during
// `Document.parse()`'s own post-processing walk (see @asciidoctor/core
// 4.0's document.js) — a walk that only ever reaches blocks left attached
// to the real document tree. Both extensions here discard their
// `parseContent` wrapper (replacing it with a single `pass` block holding
// pre-rendered HTML — see steps.js/card-grid.js's own `finish()`), so
// nothing in it is EVER part of that tree, and nothing in it gets
// precomputed automatically — verified empirically: without this, any
// `*bold*`/`xref:`/etc. inside a nested list item renders as literal,
// unsubstituted source text under 4.0 (2.2 is unaffected — its `getText()`
// always returns already-substituted text, no separate precompute step
// exists). `precomputeSubtree` runs the same precompute pass by hand, once,
// over everything `parseContent` produced.
//
// A Block's own `.getTitle()` has exactly the same problem, for exactly the
// same reason, and needs `.precomputeTitle()` — measured: a `.Title` line
// carrying an `xref:` or a `link:` comes back as raw, unsubstituted source
// (`https://x.com[Label]`) from a block parsed through `parseContent`, and
// as converted HTML (`<a href="https://x.com">Label</a>`) once precomputed.
// That is load-bearing for card-grid.js, whose card titles ARE links, and it
// was a latent bug for steps.js's own `.Title` lines before this was added.
// 2.2 has no `precomputeTitle` at all and needs none — its `getTitle()` is
// always already substituted — hence the `typeof` guard, the same one
// `precomputeText` gets.
//
// Recurses through both list shapes the Asciidoctor object model uses:
// `getBlocks()` for any ordinary block INCLUDING ulist/olist (where each
// child is a ListItem directly), and a dlist's own `[terms[], description]`
// tuple shape specifically (its `blocks` array holds pairs, not ListItems,
// so a plain `getBlocks()` recursion alone would silently skip every term
// and description inside it).
function precomputeSubtree(node) {
  const jobs = []
  function visitItem(item) {
    if (!item) return
    if (typeof item.precomputeText === 'function') jobs.push(item.precomputeText())
    if (typeof item.precomputeTitle === 'function') jobs.push(item.precomputeTitle())
    if (typeof item.getBlocks === 'function') visitChildren(item.getBlocks())
  }
  function visitChildren(blocks) {
    blocks.forEach((block) => {
      if (Array.isArray(block)) {
        const [terms, description] = block
        terms.forEach(visitItem)
        visitItem(description)
        return
      }
      visitItem(block)
    })
  }
  visitItem(node)
  return chainAll(jobs, () => node)
}

module.exports = { chain, chainAll, precomputeSubtree }
