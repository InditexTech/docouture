import type { HelperOptions } from '../../types/ui'

/** The slice of Antora's `ContentCatalog` this helper actually calls. */
interface ContentCatalogLike {
  resolveResource: (
    spec: string,
    context: Record<string, unknown>,
    defaultFamily?: string,
    permittedFamilies?: string[]
  ) => { pub: { url: string } } | undefined | false
}

/** The bits of `data.root.page` a resource spec resolves against. */
interface ResolverContextPage {
  component?: { name: string }
  version?: string
  module?: string
}

/**
 * `{{resolveResourceURL spec}}` — resolve an AsciiDoc resource ID (e.g.
 * `home-hero.png`, `main:_images/foo.png`, `2.0@other-component::image$bar.svg`)
 * against the current page's component/version/module, returning its
 * published, site-root-relative URL.
 *
 * A sibling to @antora/page-composer's own `resolvePageURL` helper
 * (resolve-page-url.js), which every `*-action-url` attribute already goes
 * through so an author writes a page ID rather than a hand-computed path —
 * this is the same idea for a resource that isn't a page. It calls
 * `ContentCatalog#resolveResource` (the generic sibling `resolvePage` itself
 * wraps) with family `image` instead of `resolvePage`'s implicit `page`.
 *
 * Falls through to `spec` itself, unresolved, when it doesn't resolve —
 * covers a literal external/absolute URL, exactly the fallthrough
 * `(or (resolvePageURL …) …)` call sites already rely on for action URLs, so
 * callers can use the same `(or (resolveResourceURL …) …)` shape. `relativize`
 * only rewrites a leading `/`, so a spec that fails to resolve and isn't
 * already a root-relative or absolute URL is passed through unchanged too —
 * an authoring mistake surfaces as a broken image rather than a thrown error.
 */
function resolveResourceURL(spec: string | undefined, ctx: HelperOptions): string | undefined {
  if (!spec) return spec
  const root = ctx.data.root as { contentCatalog?: ContentCatalogLike; page: ResolverContextPage }
  const { contentCatalog, page } = root
  if (!contentCatalog) return spec
  let context: Record<string, unknown> = {}
  if (page.component) context = { component: page.component.name, version: page.version, module: page.module }
  const file = contentCatalog.resolveResource(spec, context, 'image', ['image'])
  return file ? file.pub.url : spec
}

export = resolveResourceURL
