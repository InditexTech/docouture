import { readFileSync, mkdirSync, copyFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { toString as mdastToString } from 'mdast-util-to-string'
import { annotateCode } from './code-annotations.mjs'
import { rewriteDocLink, imageSubpath, resolveIncludeTarget } from './links.mjs'

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

// A literal `|` in table-cell content is Asciidoctor's own column separator —
// harmless in prose, fatal in a TypeTable-derived type column full of union
// types (`Uint8Array | FetchInitialState | undefined`).
function escapeCell(text) {
  return text.replace(/\|/g, '\\|')
}

function evalJsxExpression(raw, ctx, what) {
  try {
    // eslint-disable-next-line no-new-func
    return new Function(`return (${raw})`)()
  } catch (error) {
    ctx.warn(`could not evaluate ${what} expression, left as literal source: ${error.message}`)
    return undefined
  }
}

function attrValue(node, name) {
  return node.attributes?.find((a) => a.name === name)?.value
}

function attrExpr(node, name, ctx, what) {
  const v = attrValue(node, name)
  if (v == null) return undefined
  if (typeof v === 'string') return v
  if (v.type === 'mdxJsxAttributeValueExpression') return evalJsxExpression(v.value, ctx, what)
  return undefined
}

// Whether `annotateCode`'s output actually contains a callout mark —
// explicit mode (`<N>`) leaves `colist` empty by design (see
// code-annotations.mjs), so `colist.length` alone can't answer this; used
// by renderBlocks to decide whether a following "(N): explanation" list has
// a real listing to attach to.
function hasCalloutMarks(code) {
  return /\/\/\s*<(?:\d+|\.)>\s*$/m.test(code)
}

// ---------------------------------------------------------------------------
// Inline rendering
// ---------------------------------------------------------------------------

export function renderInline(nodes, ctx) {
  return (nodes || []).map((n) => renderInlineNode(n, ctx)).join('')
}

function renderInlineNode(node, ctx) {
  switch (node.type) {
    case 'text':
      return node.value
    case 'strong':
      return `*${renderInline(node.children, ctx)}*`
    case 'emphasis':
      return `_${renderInline(node.children, ctx)}_`
    case 'delete':
      return `[line-through]#${renderInline(node.children, ctx)}#`
    case 'inlineCode':
      return `\`${node.value}\``
    case 'break':
      return ' +\n'
    case 'link':
      return renderLink(node, ctx)
    case 'image':
      return renderInlineImage(node, ctx)
    case 'mdxJsxTextElement':
      return renderJsxInline(node, ctx)
    default:
      ctx.warn(`unhandled inline node type "${node.type}", rendering children only`)
      return renderInline(node.children, ctx)
  }
}

function renderLink(node, ctx) {
  const text = renderInline(node.children, ctx) || node.url
  const url = node.url || ''
  if (url.startsWith('/docs/')) {
    const rewritten = rewriteDocLink(url, join(ctx.docsRoot, 'content', 'docs'))
    if (rewritten.dead) {
      // A known-dead target with no correct link this migration could
      // point at instead (see links.mjs's own DEAD_LINKS) — degrade to
      // plain text rather than a broken xref.
      ctx.warn(`dead /docs/ link target, degraded to plain text: ${url}`)
      return text
    }
    const { resourceId, hash, unresolved } = rewritten
    if (unresolved) ctx.warn(`unresolved /docs/ link target, emitted xref anyway: ${url}`)
    return `xref:${resourceId}${hash ? `#${hash}` : ''}[${text}]`
  }
  if (/^https?:\/\//.test(url) || url.startsWith('mailto:')) {
    return `${url}[${text}]`
  }
  // An in-page anchor (`[text](#some-heading)`) — Asciidoctor auto-generates
  // heading ids the same way Fumadocs' remark-slug-like plugin does
  // (lowercased, hyphenated), so the fragment usually resolves unchanged;
  // `xref:#id[]` is Asciidoctor's own same-document xref form.
  if (url.startsWith('#')) {
    return `xref:${url}[${text}]`
  }
  if (!url) {
    ctx.warn(`link has an empty href in the source, left unresolved: [${text}]()`)
    return `link:${url}[${text}]`
  }
  ctx.warn(`unrecognized link URL, passed through as link: macro: ${url}`)
  return `link:${url}[${text}]`
}

function renderInlineImage(node, ctx) {
  const target = copyImage(node.url, ctx)
  return `image:${target}[${node.alt || ''}]`
}

// Fumadocs' `<Tag color>` isn't constrained to any fixed palette; the
// `label:[]` macro is (see asciidoc-extensions/lib/label-macro.js's own
// VARIANTS list, vendored from the DS's actual Label component) — "lime"
// (architecture.mdx, the only Tag usage in the corpus) isn't one of them
// and warned "unknown IDS Label variant" on a real build. Mapped to the
// nearest real variant rather than passed through; everything else this
// corpus actually uses (red) is already valid and passes through unchanged.
const LABEL_COLOR_ALIASES = { lime: 'green' }

function renderJsxInline(node, ctx) {
  switch (node.name) {
    case 'Kbd': {
      const keys = attrExpr(node, 'keys', ctx, 'Kbd keys') || []
      return `kbd:[${keys.join('+')}]`
    }
    case 'Tag': {
      const rawColor = attrValue(node, 'color') || 'grey'
      const color = LABEL_COLOR_ALIASES[rawColor] || rawColor
      const text = renderInline(node.children, ctx)
      return `label:${color}[${text}]`
    }
    default:
      ctx.warn(`unhandled inline component <${node.name}>, rendering children only`)
      return renderInline(node.children, ctx)
  }
}

// ---------------------------------------------------------------------------
// Block rendering
// ---------------------------------------------------------------------------

// Renders a sibling sequence of blocks. `ctx.pendingCallouts` tracks
// whether the most recent code/include block registered callout marks that
// haven't been claimed by a colist yet — set unconditionally by
// renderCode/renderInclude (see hasCalloutMarks), cleared only when
// tryRenderCalloutList actually consumes it. Deliberately NOT reset by
// other block types (a paragraph like "Explanation:" sitting between the
// listing and its "(N):" list is normal, and must not break the pairing —
// Asciidoctor's own callout catalog pairs a colist with whatever
// registration group precedes it in DOCUMENT order, tolerating intervening
// prose the exact same way) and deliberately a single page-wide flag rather
// than reset per call: an include/explanation pair commonly lands inside a
// single `[steps]` step's own body (see renderSteps), i.e. still within one
// renderBlocks invocation, but there's no correctness reason to scope it
// any tighter than that either.
export function renderBlocks(nodes, ctx) {
  const out = []
  for (const node of nodes || []) {
    if (node.type === 'list') {
      const calloutList = tryRenderCalloutList(node, ctx, ctx.pendingCallouts === true)
      if (calloutList !== null) {
        out.push(calloutList)
        ctx.pendingCallouts = false
        continue
      }
    }
    const rendered = renderBlock(node, ctx)
    if (rendered !== null && rendered !== undefined && rendered !== '') out.push(rendered)
  }
  return out.join('\n\n')
}

function renderBlock(node, ctx, depth = 1) {
  switch (node.type) {
    case 'yaml':
    case 'mdxjsEsm':
      return null // frontmatter handled separately; import statements are Fumadocs-only plumbing
    case 'heading': {
      // Level comes from migrate.mjs's computeHeadingLevels (a map keyed by
      // node identity, not raw mdast depth — see its own comment for why a
      // depth-to-`=` mapping isn't reliable across this corpus). Its
      // "level 1" is AsciiDoc's own level 1 (`==`, two `=`) — level 0
      // (`=`, one) is the document title alone and is invalid for any body
      // section outside doctype=book, hence the `+ 1`.
      const level = ctx.headingLevels.get(node) || 1
      return `${'='.repeat(level + 1)} ${renderInline(node.children, ctx)}`
    }
    case 'paragraph':
      return renderParagraph(node, ctx)
    case 'list':
      return renderList(node, ctx, depth)
    case 'code':
      return renderCode(node, ctx)
    case 'thematicBreak':
      return "'''"
    case 'blockquote':
      return `[quote]\n____\n${renderBlocks(node.children, ctx)}\n____`
    case 'table':
      return renderTable(node, ctx)
    case 'mdxJsxFlowElement':
      return renderJsxFlow(node, ctx, depth)
    default:
      ctx.warn(`unhandled block node type "${node.type}"`)
      return null
  }
}

function renderParagraph(node, ctx) {
  // A paragraph whose sole content is an image is Markdown's way of writing
  // a standalone figure — render it as an Antora block image, not an inline
  // one, so it gets its own line/centring instead of sitting mid-sentence.
  if (node.children.length === 1 && node.children[0].type === 'image') {
    const img = node.children[0]
    const target = copyImage(img.url, ctx)
    return `image::${target}[${img.alt || ''}]`
  }
  return renderInline(node.children, ctx)
}

function renderList(node, ctx, depth) {
  const marker = (node.ordered ? '.' : '*').repeat(depth)
  return node.children.map((item) => renderListItem(item, ctx, depth, marker)).join('\n')
}

// Fumadocs' `<include>`-adjacent pages also carry an older, hand-authored
// callout convention: `// (1)`, `// (2)` comments in the included source,
// paired with a "File explanation" bullet list whose items open with
// **`(N)`**: ... (see code-annotations.mjs's own header comment). Detected
// here and re-emitted as a real AsciiDoc colist instead of a bullet list —
// but ONLY when `prevHadCallouts` is true, i.e. the immediately preceding
// sibling was a code/include block that actually contains `<N>`/`<.>`
// marks. Some pages (e.g. store-standalone/index.mdx) use this exact
// "(N): explanation" prose shape purely informally, with NO matching marks
// anywhere in the adjacent code — converting those to a colist anyway
// produced real, confirmed Antora build warnings ("no callout found for
// <N>"): Asciidoctor pairs a colist with whatever listing's callouts came
// before it in document order, and an unbacked colist either steals marks
// meant for a DIFFERENT listing further down the page or finds none at
// all. Left as an ordinary bullet list in that case — exactly what it was
// before this function ever saw it.
function tryRenderCalloutList(node, ctx, prevHadCallouts) {
  if (!prevHadCallouts) return null
  const numbers = node.children.map(calloutItemNumber)
  if (numbers.some((n) => n === null)) return null
  return node.children
    .map((item, i) => {
      const rest = item.children[0].children.slice(1)
      if (rest[0]?.type === 'text') {
        rest[0] = { ...rest[0], value: rest[0].value.replace(/^:\s*/, '') }
      }
      return `<${numbers[i]}> ${renderInline(rest, ctx)}`
    })
    .join('\n')
}

function calloutItemNumber(item) {
  const p = item.children?.[0]
  const first = p?.children?.[0]
  if (
    p?.type === 'paragraph' &&
    first?.type === 'strong' &&
    first.children.length === 1 &&
    first.children[0].type === 'inlineCode' &&
    /^\(\d+\)$/.test(first.children[0].value)
  ) {
    return Number.parseInt(first.children[0].value.slice(1, -1), 10)
  }
  return null
}

function renderListItem(item, ctx, depth, marker) {
  const [first, ...rest] = item.children
  const firstText = first?.type === 'paragraph' ? renderInline(first.children, ctx) : renderBlock(first, ctx, depth)
  let out = `${marker} ${firstText}`
  for (const block of rest) {
    if (block.type === 'list') {
      out += `\n${renderList(block, ctx, depth + 1)}`
    } else {
      out += `\n+\n${renderBlock(block, ctx, depth)}`
    }
  }
  return out
}

function renderCode(node, ctx) {
  const lang = node.lang || ''
  const tabMatch = (node.meta || '').match(/tab="([^"]+)"/)
  const title = tabMatch ? `.${tabMatch[1]}\n` : ''
  const { code, colist, mergedCount } = annotateCode(node.value)
  if (mergedCount > 0) {
    ctx.warn(`${mergedCount} code line(s) had both an explicit (N) and a [!code] marker — kept the explicit number`)
  }
  ctx.pendingCallouts = hasCalloutMarks(code)
  let out = `${title}[source,${lang}]\n----\n${code}\n----`
  if (colist.length) out += `\n${colist.join('\n')}`
  return out
}

function renderTable(node, ctx) {
  const rows = node.children.map((row) =>
    row.children.map((cell) => `| ${escapeCell(renderInline(cell.children, ctx))}`).join(' ')
  )
  const [header, ...body] = rows
  return `[cols="${node.children[0].children.length}*"]\n|===\n${header}\n\n${body.join('\n')}\n|===`
}

// ---------------------------------------------------------------------------
// JSX flow (block-level component) handlers
// ---------------------------------------------------------------------------

function renderJsxFlow(node, ctx, depth) {
  switch (node.name) {
    case 'Callout':
      return renderCallout(node, ctx)
    case 'TypeTable':
      return renderTypeTable(node, ctx)
    case 'Cards':
      return renderCards(node, ctx)
    case 'Card':
      // Only reached if a lone <Card> appears outside <Cards> (not seen in
      // the corpus, but harmless to support) — render as a one-line dlist.
      return renderCards({ children: [node] }, ctx)
    case 'Tags':
      // Transparent: Tags is a flex wrapper around inline <Tag> elements
      // (label:[] macros); its own paragraph child renders like any other.
      return renderBlocks(node.children, ctx)
    case 'Mermaid':
      return renderMermaid(node, ctx)
    case 'Accordions':
    case 'Accordion':
      return renderAccordion(node, ctx)
    case 'Separator':
      return "'''"
    case 'include':
      return renderInclude(node, ctx)
    case 'div': {
      const className = attrValue(node, 'className')
      // The outer `.fd-steps` wrapper (81 occurrences) — everything else
      // `<div>`-shaped in this corpus is either an inner `.fd-step` (244,
      // flattened by renderSteps' own collector below) or the one literal
      // `<div id="my-weave-id">` example in main/build/index.mdx, which has
      // no children worth losing structure over either way.
      if (typeof className === 'string' && /\bfd-steps\b/.test(className)) {
        return renderSteps(node, ctx)
      }
      return renderBlocks(node.children, ctx, depth)
    }
    default:
      ctx.warn(`unhandled component <${node.name}>, rendering children only`)
      return renderBlocks(node.children, ctx, depth)
  }
}

function calloutAdmonitionType(type) {
  if (type === 'warn' || type === 'warning') return 'WARNING'
  return 'NOTE' // info, note, and no-type all read as NOTE — Fumadocs never
  // distinguished IMPORTANT/CAUTION from NOTE/info in this corpus (see
  // migration analysis: only info/note/warn/warning values ever appear).
}

function renderCallout(node, ctx) {
  const title = attrValue(node, 'title')
  const admonition = calloutAdmonitionType(attrValue(node, 'type'))
  const body = renderBlocks(node.children, ctx)
  const titleLine = title ? `.${title}\n` : ''
  return `${titleLine}[${admonition}]\n====\n${body}\n====`
}

function renderTypeTable(node, ctx) {
  const raw = attrValue(node, 'type')
  if (!raw || raw.type !== 'mdxJsxAttributeValueExpression') {
    ctx.warn('TypeTable has no evaluable `type` attribute, skipped')
    return null
  }
  const spec = evalJsxExpression(raw.value, ctx, 'TypeTable type')
  if (!spec) return `[source,ts]\n----\n${raw.value}\n----`

  const entries = Object.entries(spec)
  const hasDefault = entries.some(([, v]) => v.default !== undefined)
  const cols = hasDefault
    ? ['Property', 'Type', 'Required', 'Default', 'Description']
    : ['Property', 'Type', 'Required', 'Description']

  const rows = entries.map(([key, v]) => {
    const cells = [
      `mono:[${key.replace(/\]/g, '\\]')}]`,
      `mono:[${String(v.type ?? '').replace(/\]/g, '\\]')}]`,
      v.required ? 'label:green[Required]' : '',
    ]
    if (hasDefault) cells.push(v.default !== undefined ? `mono:[${String(v.default).replace(/\]/g, '\\]')}]` : '')
    cells.push(v.description ?? '')
    return cells.map((c) => `| ${escapeCell(c)}`).join(' ')
  })

  const header = cols.map((c) => `| ${c}`).join(' ')
  return `[cols="${cols.length}*"]\n|===\n${header}\n\n${rows.join('\n')}\n|===`
}

// Fumadocs' `<Steps>`/`<Step>` (81 `.fd-steps` wrappers, 244 nested
// `.fd-step` divs) -> the `[steps]` Asciidoctor extension
// (code/packages/asciidoc-extensions/lib/steps.js), now that it exists —
// see the migration's Phase 2. steps.js groups an example block's own
// children by which ones carry a `.Title`; this collector flattens every
// nested `.fd-step` div away (regardless of how many headings happen to
// share one div, or how many divs one step's content spans — both occur in
// the real corpus) and turns each h3 heading into a title marker consumed
// by the block that follows it, so the grouping steps.js does on the
// AsciiDoc side lines up with exactly where Fumadocs' own step boundaries
// were.
//
// Only h3 (mdast depth 3): Fumadocs' own selector is literally
// `[&_h3]:fd-step` — a step boundary is always an h3 by construction,
// never any other depth. A step's body can itself contain an h4 (31
// occurrences in the corpus, e.g. "Install Next.js" under "Set up your
// project") — that's ordinary sub-content, not a new step, and renders as
// a normal heading via the existing `renderBlock` case, not a title marker.
function collectStepsContent(node, ctx, out = []) {
  for (const child of node.children) {
    if (child.type === 'mdxJsxFlowElement' && child.name === 'div') {
      collectStepsContent(child, ctx, out)
    } else if (child.type === 'heading' && child.depth === 3) {
      out.push({ title: renderInline(child.children, ctx) })
    } else {
      out.push({ block: child })
    }
  }
  return out
}

function renderSteps(node, ctx) {
  const flat = collectStepsContent(node, ctx)
  const steps = []
  for (const entry of flat) {
    if ('title' in entry) {
      steps.push({ title: entry.title, blocks: [] })
      continue
    }
    if (steps.length === 0) steps.push({ title: undefined, blocks: [] })
    steps[steps.length - 1].blocks.push(entry.block)
  }
  const body = steps
    .map((step) => {
      const rendered = renderBlocks(step.blocks, ctx)
      return step.title !== undefined ? `.${step.title}\n${rendered}` : rendered
    })
    .join('\n\n')
  return `[steps]\n====\n${body}\n====`
}

// Card grid -> the `[cards]` Asciidoctor extension
// (asciidoc-extensions/lib/card-grid.js), now that it exists. Its syntax IS
// a plain AsciiDoc dlist (that's the whole point — no bespoke nested syntax
// to maintain), so this is unchanged from the Phase 1 degrade except for
// the wrapping `[cards]` block; `href` still resolves through the same
// xref rewriting as a regular link.
function renderCards(node, ctx) {
  const lines = node.children
    .filter((c) => c.name === 'Card')
    .map((card) => {
      const href = attrValue(card, 'href') || ''
      const title = attrValue(card, 'title') || ''
      let term = title
      if (href.startsWith('/docs/')) {
        const rewritten = rewriteDocLink(href, join(ctx.docsRoot, 'content', 'docs'))
        if (rewritten.dead) {
          ctx.warn(`dead Card href, degraded to plain text: ${href}`)
          term = title
        } else {
          const { resourceId, unresolved } = rewritten
          if (unresolved) ctx.warn(`unresolved Card href, emitted xref anyway: ${href}`)
          term = `xref:${resourceId}[${title}]`
        }
      } else if (href) {
        term = `${href}[${title}]`
      }
      const desc = renderBlocks(card.children, ctx).replace(/\n+/g, ' ')
      return `${term}:: ${desc}`
    })
  return `[cards]\n====\n${lines.join('\n')}\n====`
}

// Degraded per Q2: forward-compatible with a future mermaid renderer — same
// literal diagram source either way, only the surrounding block style
// changes once that issue is picked up.
//
// `chart` is usually a JS template-literal expression (`chart={\`...\`}`)
// but 3 files use a plain quoted JSX string instead (`chart="..."`, with
// literal newlines inside the quotes — unusual JSX, but MDX parses it fine)
// — caught by the full Phase 3 run, since the pilot's one Mermaid usage
// happened to be the expression form. A plain string needs no evaluation.
function renderMermaid(node, ctx) {
  const raw = attrValue(node, 'chart')
  if (typeof raw === 'string') {
    return `[mermaid]\n....\n${raw.trim()}\n....`
  }
  if (!raw || raw.type !== 'mdxJsxAttributeValueExpression') {
    ctx.warn('Mermaid has no evaluable `chart` attribute, skipped')
    return null
  }
  const chart = evalJsxExpression(raw.value, ctx, 'Mermaid chart')
  if (chart === undefined) return null
  return `[mermaid]\n....\n${chart.trim()}\n....`
}

function renderAccordion(node, ctx) {
  if (node.name === 'Accordions') return renderBlocks(node.children, ctx)
  const title = attrValue(node, 'title')
  const body = renderBlocks(node.children, ctx)
  const titleLine = title ? `.${title}\n` : ''
  return `${titleLine}[%collapsible]\n====\n${body}\n====`
}

function renderInclude(node, ctx) {
  const lang = attrValue(node, 'lang') || ''
  const metaRaw = attrValue(node, 'meta') || ''
  const titleMatch = metaRaw.match(/title="([^"]+)"/)
  const rawPath = mdastToString(node).trim()

  const { absTarget, relPath } = resolveIncludeTarget(rawPath, ctx.file, ctx.docsRoot)
  if (!relPath) {
    ctx.warn(`<include> target outside known anchors, copied by basename only: ${rawPath}`)
  }
  // Next.js dynamic-route folders (`app/api/rooms/[roomId]/route.ts`, from
  // the manual-installation sample app) carry literal `[...]` — Antora's
  // `example$` resource-id resolution can't find a target whose path
  // contains them (confirmed by a real build: "target of include not
  // found"). Stripped only from the copy destination and the `include::`
  // target; the visible `.Title` above comes from the `meta` attribute's
  // own `title="..."` text, untouched, so the reader still sees the real
  // Next.js path.
  const finalRelPath = (relPath || absTarget.split('/').pop()).replace(/[[\]]/g, '')

  let colist = []
  try {
    const raw = readFileSync(absTarget, 'utf8')
    const annotated = annotateCode(raw)
    colist = annotated.colist
    ctx.pendingCallouts = hasCalloutMarks(annotated.code)
    const destPath = join(ctx.exampleDir, finalRelPath)
    mkdirSync(dirname(destPath), { recursive: true })
    writeFileSync(destPath, annotated.code)
  } catch (error) {
    ctx.warn(`could not read/copy <include> target ${absTarget}: ${error.message}`)
  }

  const titleLine = titleMatch ? `.${titleMatch[1]}\n` : ''
  let out = `${titleLine}[source,${lang}]\n----\ninclude::example$${finalRelPath}[]\n----`
  if (colist.length) out += `\n${colist.join('\n')}`
  return out
}

// ---------------------------------------------------------------------------
// Asset copying
// ---------------------------------------------------------------------------

// All 65 image references in the corpus are under `main` (verified against
// the source tree in the migration analysis) — hardcoding that module here
// is a fact about this corpus, not a general assumption.
function copyImage(url, ctx) {
  const subpath = imageSubpath(url)
  if (!subpath) {
    ctx.warn(`image URL not under /images/, left unresolved: ${url}`)
    return url
  }
  const src = join(ctx.docsRoot, 'public', 'images', subpath)
  const dest = join(ctx.imagesDir, subpath)
  if (!existsSync(src)) {
    ctx.warn(`image source missing, not copied: ${src}`)
  } else {
    mkdirSync(dirname(dest), { recursive: true })
    copyFileSync(src, dest)
  }
  return subpath
}
