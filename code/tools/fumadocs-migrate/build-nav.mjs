#!/usr/bin/env node
//
// Phase 4: generates each module's nav.adoc from Fumadocs' own meta.json
// files, instead of the flat, unordered listing used to smoke-test Phase 3's
// full conversion. Reads the SAME WEAVEJS_DOCS_ROOT as migrate.mjs; writes
// code/packages/example/docs/modules/<root>/nav.adoc for all 7 modules.
// Re-run any time meta.json ordering changes upstream — nothing here is
// hand-edited output.
//
// Usage: node build-nav.mjs
//
// Reproduces three Fumadocs `pages[]` conventions, in the order they're
// checked:
//   - `"---Label---"`  a plain, unlinked separator/category heading
//   - `"...name"`      splice `name`'s own pages[] in at the SAME nesting
//                      level (no extra wrapper entry for `name` itself) —
//                      how main/meta.json's `"---Build---"` heading ends up
//                      with Nodes/Plugins/Actions/Stores as flat siblings of
//                      Overview, not nested under a "Build" parent
//   - a plain slug     resolves to either a sibling `<slug>.mdx` (a leaf
//                      link) or a `<slug>/` directory (a nested, expandable
//                      entry: linked to that directory's own index.mdx if
//                      it has one, with its meta.json's own pages[] —
//                      recursively — as children)
//
// A directory with no meta.json of its own (main/manual-installation,
// main/manual-installation/frontend, react/api-reference/{providers,hooks},
// types/api-reference/) is auto-expanded instead: every file/subdirectory it
// contains, alphabetically, using each page's own converted title — the
// same fallback Fumadocs itself uses for a meta-less directory.
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const WEAVEJS_DOCS_ROOT = '/Users/jesusmpc/inditex/weavejs/docs';
const CONTENT_DOCS = join(WEAVEJS_DOCS_ROOT, 'content', 'docs');
const EXAMPLE_MODULES = join(HERE, '..', '..', 'packages', 'example', 'docs', 'modules');

const ROOTS = ['main', 'sdk', 'react', 'types', 'store-websockets', 'store-azure-web-pubsub', 'store-standalone'];

// Known upstream meta.json bugs, found and confirmed via the Phase 5
// real-build + real-source audit. Keyed by "<module>:<dirRel>/<slug>"
// (dirRel relative to the module's own content root) so the same bare
// slug string can be treated differently in different directories.
//
// A typo with a knowable correct target: corrected here so nav generation
// keeps agreeing with links.mjs's own LINK_FIXES for the same bug on the
// content-link side.
const SLUG_FIXES = new Map([
  // sdk/api-reference/actions/meta.json drops the "s" from the real file,
  // export-nodes-tool.mdx — same typo as that directory's own index.mdx
  // Card href (see links.mjs's LINK_FIXES).
  ['sdk:api-reference/actions/export-node-tool', 'export-nodes-tool'],
]);

// Slugs listed in a meta.json's own pages[] with no corresponding file or
// folder ANYWHERE in the corpus — not a typo with a knowable correct
// target, genuinely absent. Dropped from the generated nav entirely
// instead of emitting a dead xref, matching how Fumadocs' own source
// loader behaves for an unresolvable pages[] entry (it drops it from the
// tree silently; it doesn't render a broken link).
const SKIP_SLUGS = new Set([
  // main/build/plugins/meta.json lists BOTH "stage-keyboard-move" (real,
  // already covered as its own entry) AND a stray duplicate
  // "stage-keyboard" with no file at all.
  'main:build/plugins/stage-keyboard',
  // react/store-websockets/store-azure-web-pubsub's api-reference/
  // meta.json each list "index" first, but none of the three directories
  // has an index.mdx — only providers/hooks or server/client. (These
  // slugs only ever reach resolveEntry via the "...api-reference" spread
  // in each module's own root meta.json, which — unlike emitFolder's own
  // recursion — doesn't filter "index" out before descending.)
  'react:api-reference/index',
  'store-websockets:api-reference/index',
  'store-azure-web-pubsub:api-reference/index',
  // main/changelog/prerelease/meta.json's own pages[] wrongly includes a
  // dozen 1.x releases that actually live under the sibling changelog/1.x/
  // (already listed correctly there, so dropping them here loses no real
  // navigation), plus one version, 0.77.2, that was never published
  // anywhere in the corpus at all (see links.mjs's own DEAD_LINKS for the
  // content-link side of that same gap).
  'main:changelog/prerelease/1.2.1',
  'main:changelog/prerelease/1.2.0',
  'main:changelog/prerelease/1.1.3',
  'main:changelog/prerelease/1.1.2',
  'main:changelog/prerelease/1.1.1',
  'main:changelog/prerelease/1.1.0',
  'main:changelog/prerelease/1.0.5',
  'main:changelog/prerelease/1.0.4',
  'main:changelog/prerelease/1.0.3',
  'main:changelog/prerelease/1.0.2',
  'main:changelog/prerelease/1.0.1',
  'main:changelog/prerelease/1.0.0',
  'main:changelog/prerelease/0.77.2',
]);

function humanize(slug) {
  return slug.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// The page's own `= Title` line, already normalized by migrate.mjs — read
// from the converted .adoc rather than re-parsing the source .mdx's
// frontmatter, since it's the same value and this avoids a second parser.
function titleFromAdoc(module, adocRelPath) {
  const absAdoc = join(EXAMPLE_MODULES, module, 'pages', adocRelPath);
  try {
    const firstLine = readFileSync(absAdoc, 'utf8').split('\n', 1)[0];
    return firstLine.replace(/^=\s*/, '') || adocRelPath;
  } catch {
    console.warn(`  [nav] ${module}: expected converted page missing: ${adocRelPath}`);
    return adocRelPath;
  }
}

function emitLeaf(module, dirRel, slug, depth, lines, forcedTitle) {
  const adocRel = join(dirRel, `${slug}.adoc`);
  const title = forcedTitle || titleFromAdoc(module, adocRel);
  lines.push(`${'*'.repeat(depth)} xref:${module}:${adocRel}[${title}]`);
}

function emitFolder(module, rootAbs, folderRel, depth, lines) {
  const folderAbs = join(rootAbs, folderRel);
  const hasIndex = existsSync(join(folderAbs, 'index.mdx'));
  const metaPath = join(folderAbs, 'meta.json');
  const meta = existsSync(metaPath) ? JSON.parse(readFileSync(metaPath, 'utf8')) : null;
  const title = meta?.title || humanize(folderRel.split('/').pop());
  const marker = '*'.repeat(depth);

  if (hasIndex) {
    const adocRel = join(folderRel, 'index.adoc');
    lines.push(`${marker} xref:${module}:${adocRel}[${title}]`);
  } else {
    lines.push(`${marker} ${title}`);
  }

  if (meta) {
    // Defensive only: an "index" child never actually co-occurs with a
    // folder reference in this corpus (it only ever appears inside a
    // pages[] that gets *spread* into a parent level instead), but skip it
    // here too rather than ever double-listing the folder's own link.
    processPagesList(module, rootAbs, folderRel, (meta.pages || []).filter((p) => p !== 'index'), depth + 1, lines);
  } else {
    processAutoDir(module, rootAbs, folderRel, depth + 1, lines);
  }
}

function processAutoDir(module, rootAbs, dirRel, depth, lines) {
  const dirAbs = join(rootAbs, dirRel);
  const entries = readdirSync(dirAbs, { withFileTypes: true })
    .filter((e) => e.name !== 'meta.json' && e.name !== 'index.mdx')
    .sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    if (entry.isDirectory()) {
      emitFolder(module, rootAbs, join(dirRel, entry.name), depth, lines);
    } else if (entry.name.endsWith('.mdx')) {
      emitLeaf(module, dirRel, entry.name.replace(/\.mdx$/, ''), depth, lines);
    }
  }
}

function resolveEntry(module, rootAbs, dirRel, slug, depth, lines) {
  const key = `${module}:${join(dirRel, slug)}`;
  if (SKIP_SLUGS.has(key)) return;
  slug = SLUG_FIXES.get(key) || slug;

  const dirAbs = join(rootAbs, dirRel);
  // Folder wins over a same-named flat file when both exist — matches real
  // Next.js/Fumadocs route precedence (an index route is more specific than
  // a flat file at the same slug). The one such collision in this corpus
  // (sdk/api-reference/weave.mdx vs weave/) is exactly why migrate.mjs
  // excludes the flat file from conversion; checking the folder first here
  // keeps nav generation consistent with that even though the flat file is
  // still sitting in the source tree.
  const folderAbs = join(dirAbs, slug);
  if (existsSync(folderAbs) && statSync(folderAbs).isDirectory()) {
    emitFolder(module, rootAbs, join(dirRel, slug), depth, lines);
    return;
  }
  if (existsSync(join(dirAbs, `${slug}.mdx`))) {
    emitLeaf(module, dirRel, slug, depth, lines);
    return;
  }
  // Every known instance of a meta.json referencing a slug with no
  // matching file or folder is now catalogued in SKIP_SLUGS/SLUG_FIXES
  // above (found via the Phase 5 real-build + real-source audit — see
  // their own comments for the specific bugs and why each was resolved
  // the way it was). Reaching here means something new and uncatalogued —
  // still emit a best-effort xref (so Antora's own `failure_level: warn`
  // catches it structurally) rather than silently dropping the nav entry,
  // but this warning is the signal to go add it above, not to ignore.
  console.warn(`  [nav] ${module}: "${slug}" not found under ${dirRel || '.'} — emitting a best-effort xref anyway`);
  emitLeaf(module, dirRel, slug, depth, lines, humanize(slug));
}

function processPagesList(module, rootAbs, dirRel, pages, depth, lines) {
  for (const entry of pages) {
    if (/^---.+---$/.test(entry)) {
      lines.push(`${'*'.repeat(depth)} ${entry.replace(/^---|---$/g, '')}`);
      continue;
    }
    if (entry.startsWith('...')) {
      const name = entry.slice(3);
      const spreadRel = join(dirRel, name);
      const spreadMetaPath = join(rootAbs, spreadRel, 'meta.json');
      if (existsSync(spreadMetaPath)) {
        const meta = JSON.parse(readFileSync(spreadMetaPath, 'utf8'));
        processPagesList(module, rootAbs, spreadRel, meta.pages || [], depth, lines);
      } else {
        processAutoDir(module, rootAbs, spreadRel, depth, lines);
      }
      continue;
    }
    resolveEntry(module, rootAbs, dirRel, entry, depth, lines);
  }
}

for (const root of ROOTS) {
  const rootAbs = join(CONTENT_DOCS, root);
  const meta = JSON.parse(readFileSync(join(rootAbs, 'meta.json'), 'utf8'));
  const lines = [];
  processPagesList(root, rootAbs, '', meta.pages || [], 1, lines);
  writeFileSync(join(EXAMPLE_MODULES, root, 'nav.adoc'), lines.join('\n') + '\n');
  console.log(`${root}: ${lines.length} nav line(s)`);
}
