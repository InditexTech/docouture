/*
 * Search engine bundle (GH-67, S3 of the search epic, #64).
 *
 * Separate from `js/site.js` the same way `highlight.bundle.ts` is: esbuild
 * emits one IIFE per `vendor/*.bundle.ts` entry, and this one is loaded by
 * `12-search.ts` on first intent rather than on every page — see that
 * file's own header for why. The two bundles share no module system, so the
 * only thing crossing the boundary is the single global assigned at the
 * bottom.
 *
 * Engine is `zbsearch` (an Orama fork, Apache-2.0) + `@zbsearch/highlight` —
 * the only two `@zbsearch/*` packages that install from the public registry
 * (see #64's own investigation; `@zbsearch/docs-index` and the searchbox
 * packages declare `workspace:*` siblings no package manager can resolve).
 *
 * `loadSearcher(url)` is the entire surface: fetch + validate the envelope,
 * build the in-memory index, and hand back one `Searcher` function bound to
 * it — the shape #67 itself specifies, `options` added by #69 (S5) for the
 * module filter chips' own use (see `SearchOptions` below):
 *
 *     (term: string, signal: AbortSignal, options?: SearchOptions) => Promise<SearchHit[]>
 *
 * A `SearchHit` already carries its own highlight positions (computed here,
 * where `@zbsearch/highlight` is in scope) against a trimmed snippet (also
 * computed here) — `12-search.ts` never re-imports the highlighter, it only
 * turns `{ text, marks }` into DOM nodes, never `innerHTML`, because the text
 * is third-party page content.
 *
 * Concurrent callers for the SAME url share one promise — a hover-preload
 * racing the dialog's own open-triggered load must not fetch or build the
 * index twice — and a failed attempt is forgotten so the next call retries
 * rather than replaying the same rejection forever.
 */
import { create, insertMultiple, search as zbSearch } from 'zbsearch'
import { Highlight } from '@zbsearch/highlight'

const ENVELOPE_VERSION = 1

// Mirrors antora-extensions/lib/search-index.js's own record shape exactly.
interface SearchRecord {
  title: string
  section?: string
  hierarchy: string[]
  content: string
  url: string
  category: string
}

interface SearchEnvelope {
  version: number
  language: string
  component: string
  componentVersion: string
  records: SearchRecord[]
}

export interface HighlightMark {
  start: number
  end: number
}

export interface HighlightedText {
  text: string
  marks: HighlightMark[]
}

export interface SearchHit {
  title: HighlightedText
  section?: HighlightedText
  hierarchy: HighlightedText[]
  url: string
  category: string
  snippet: HighlightedText
}

// `limit` (GH-69, S5): the module filter chips post-filter hits by
// `category` client-side — `category` is carried on the record but isn't
// part of what's tokenized, and this engine's search options expose no
// server-side `where` on the path we use, so a real filtered query isn't
// available without a schema change. 12-search.ts instead asks for MORE
// records up front while a chip is active (see DEFAULT_LIMIT below) and
// filters what comes back, so the visible count after filtering stays
// useful instead of being starved by a limit sized for the unfiltered case.
export interface SearchOptions {
  limit?: number
}

export type Searcher = (term: string, signal: AbortSignal, options?: SearchOptions) => Promise<SearchHit[]>

// The snippet window's own length — long enough to give a query's match some
// surrounding prose, short enough that a list of results doesn't scroll
// forever.
const SNIPPET_LENGTH = 160

// The engine's own default `limit` — must match 12-search.ts's own
// RESULT_LIMIT (what it actually displays), or the unfiltered path there
// would cap a display limit against a smaller pool than it could have had.
// 12-search.ts passes a higher one explicitly while a module filter chip is
// active (see `SearchOptions` above); every other caller gets this.
const DEFAULT_LIMIT = 24

var pending = new Map<string, Promise<Searcher>>()

const SCHEMA = {
  title: 'string',
  section: 'string',
  hierarchy: 'string[]',
  content: 'string',
  url: 'string',
  category: 'string',
} as const

type SearchDb = ReturnType<typeof create<typeof SCHEMA>>

function loadSearcher (url: string): Promise<Searcher> {
  var cached = pending.get(url)
  if (cached) return cached

  var promise = fetch(url)
    .then(function (res) {
      if (!res.ok) throw new Error('search index request failed with status ' + res.status)
      return res.json() as Promise<SearchEnvelope>
    })
    .then(function (envelope) {
      // A stale index served from an HTTP cache after a deploy must degrade
      // to "search unavailable" rather than to broken results built against
      // a schema this build no longer understands.
      if (!envelope || envelope.version !== ENVELOPE_VERSION) {
        throw new Error('unsupported search index envelope version')
      }
      var db: SearchDb = create({ schema: SCHEMA, language: envelope.language })
      return Promise.resolve(insertMultiple(db, envelope.records)).then(function () {
        return makeSearcher(db)
      })
    })

  // Forgotten on failure (not on success) so a transient network error can
  // be retried, while a successful build is reused for the rest of the
  // page's lifetime.
  promise.catch(function () {
    pending.delete(url)
  })

  pending.set(url, promise)
  return promise
}

function makeSearcher (db: SearchDb): Searcher {
  return function (term: string, signal: AbortSignal, options?: SearchOptions) {
    var limit = (options && options.limit) || DEFAULT_LIMIT
    return Promise.resolve(
      zbSearch(db, {
        term: term,
        properties: ['title', 'section', 'hierarchy', 'content'],
        boost: { title: 4, section: 3, hierarchy: 1.5, content: 1 },
        tolerance: 1,
        limit: limit,
      })
    ).then(function (results) {
      if (signal.aborted) return []
      return results.hits.map(function (hit) {
        var doc = hit.document as SearchRecord
        var snippet = snippetAround(doc.content, term)
        return {
          title: highlightText(doc.title, term),
          // GH-69 (S5): highlighted the same way title/snippet are — the
          // breadcrumb built from these (12-search.ts) shows matched terms
          // too, not just plain text.
          section: doc.section ? highlightText(doc.section, term) : undefined,
          hierarchy: doc.hierarchy.map(function (h) {
            return highlightText(h, term)
          }),
          url: doc.url,
          category: doc.category,
          snippet: highlightText(snippet, term),
        }
      })
    })
  }
}

/** Runs `@zbsearch/highlight` and reduces its result to plain text + ranges — never the HTML string it also offers, since that text is third-party content. */
function highlightText (text: string, term: string): HighlightedText {
  var highlighter = new Highlight().highlight(text, term)
  return { text: text, marks: highlighter.positions.map(function (p) {
    return { start: p.start, end: p.end + 1 } // library's `end` is inclusive; ours is exclusive, DOM-slice-friendly
  }) }
}

/**
 * A window of `content` around the first match, the same centring
 * `Highlight#trim` uses internally — reimplemented here (rather than calling
 * that method) so the returned text is plain, and highlighting is computed
 * fresh against just the trimmed window, keeping mark offsets valid for the
 * text actually rendered.
 */
function snippetAround (content: string, term: string): string {
  if (content.length <= SNIPPET_LENGTH) return content
  var probe = new Highlight().highlight(content, term).positions
  var first = probe.length ? probe[0].start : 0
  var start = Math.max(first - Math.floor(SNIPPET_LENGTH / 2), 0)
  var end = Math.min(start + SNIPPET_LENGTH, content.length)
  var prefix = start > 0 ? '…' : ''
  var suffix = end < content.length ? '…' : ''
  return prefix + content.slice(start, end) + suffix
}

;(window as unknown as { __pdocsSearch: { load: typeof loadSearcher } }).__pdocsSearch = {
  load: loadSearcher,
}
