/** Ambient globals available to the browser scripts shipped in the UI bundle. */

declare global {
  interface Window {
    /**
     * Path back to the UI root, injected by the page template as a fallback for
     * browsers that predate `dataset` on the `site-script` element.
     */
    uiRootPath?: string
  }
}

export {}
