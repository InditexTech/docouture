/**
 * Minimal typings for the Handlebars call shapes Antora uses when invoking UI helpers.
 *
 * Kept outside `src/helpers/` on purpose: Antora registers every file in that
 * directory as a helper named after its basename, so a shared module placed
 * there would be registered as a bogus helper.
 */

/** Options object Handlebars appends as the final argument of every helper call. */
export declare interface HelperOptions {
  hash: Record<string, unknown>
  data: {
    root: {
      site: { path?: string; url?: string; title?: string }
      page: { url: string; title?: string }
      [key: string]: unknown
    }
    [key: string]: unknown
  }
  fn?: (context?: unknown) => string
  inverse?: (context?: unknown) => string
}
