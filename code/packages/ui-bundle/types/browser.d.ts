/** Ambient globals available to the browser scripts shipped in the UI bundle. */

declare global {
  /** A highlighted piece of text, its ranges relative to `text`, `end` exclusive. */
  interface SearchHighlightedText {
    text: string
    marks: { start: number; end: number }[]
  }

  /** One search result, already shaped for rendering — see vendor/search.bundle.ts. */
  interface SearchHit {
    title: SearchHighlightedText
    section?: string
    hierarchy: string[]
    url: string
    category: string
    snippet: SearchHighlightedText
  }

  interface Window {
    /**
     * Path back to the UI root, injected by the page template as a fallback for
     * browsers that predate `dataset` on the `site-script` element.
     */
    uiRootPath?: string

    /**
     * The search engine's entire cross-bundle surface (GH-67), assigned once
     * `js/vendor/search.js` (built from vendor/search.bundle.ts) has loaded —
     * absent until then, since `12-search.ts` injects that script lazily on
     * first intent rather than on every page.
     */
    __pdocsSearch?: {
      load: (url: string) => Promise<(term: string, signal: AbortSignal) => Promise<SearchHit[]>>
    }
  }
}

export {}
