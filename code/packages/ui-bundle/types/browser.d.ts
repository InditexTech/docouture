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
    section?: SearchHighlightedText
    hierarchy: SearchHighlightedText[]
    url: string
    category: string
    snippet: SearchHighlightedText
  }

  /** GH-69 (S5): the module filter chips' own use of `Searcher` — see vendor/search.bundle.ts's `SearchOptions`. */
  interface SearchOptions {
    limit?: number
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
    __docoutureSearch?: {
      load: (
        url: string
      ) => Promise<(term: string, signal: AbortSignal, options?: SearchOptions) => Promise<SearchHit[]>>
    }

    /**
     * Recent-searches surface (GH-69), assigned by 13-search-recents.ts —
     * always present once that file has run (unlike `__docoutureSearch`, it has
     * no lazy-load split of its own, so 12-search.ts still guards every call
     * in case that script were ever removed from a page).
     */
    __docoutureSearchRecents?: {
      record: (term: string) => void
      render: (container: HTMLElement, onSelect: (term: string) => void, onRemove: () => void) => HTMLElement[]
    }
  }
}

export {}
