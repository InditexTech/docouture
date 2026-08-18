// Converts Fumadocs' `// [!code ++]` / `// [!code --]` diff-highlight
// annotations (139 / 3 occurrences across the corpus) into AsciiDoc callouts,
// per the migration's Q3 decision: keep the base language's own syntax
// highlighting (unlike retagging the block `[source,diff]`), at the cost of
// an explicit callout + a generated "Added/Removed in this step." line.
//
// A handful of files (the ones behind an `<include>`, e.g.
// store-websockets/index.mdx) ALSO carry Fumadocs' *other*, older convention:
// hand-authored `// (1)`, `// (2)` comments paired with a "File explanation"
// bullet list below the block (see emit.mjs's own colist-list detection).
// Some lines even carry both at once — `// (1) [!code ++]` — because a line
// introduced in one revision is *also* the line the prose explanation number
// 1 refers to.
//
// The two conventions do NOT share a numbering sequence — an earlier version
// of this file tried that (auto-continuing bare `[!code]` markers from the
// block's own max explicit N) and it was wrong, confirmed by a real
// Antora build: `server.mod-1` has 12 meaningful `(N)` lines matched by a
// 12-item prose explanation list, PLUS ~27 unrelated bare `[!code ++]` lines
// that exist purely so Fumadocs tints them green — nothing in the source
// ever explains them individually. Auto-numbering those as `<13>`…`<39>` and
// giving them "Added in this step." colist entries fabricated 27 fake
// explanations AND left two competing colists fighting over one listing
// block (Asciidoctor allows exactly one callout list per listing) —
// Antora's own build caught this as "no callout found for <N>" /
// "callout list item index: expected N, got M" across every affected page.
//
//   - explicit mode (the file has at least one `(N)`): `(N)` -> `<N>`
//     verbatim (a same-line `[!code ++/-]` is dropped — the explicit number
//     already documents that line via the prose list, see `mergedCount`). A
//     *bare* `[!code]` elsewhere in the same file has no explanation of its
//     own — its marker is stripped silently, leaving plain code with no
//     callout, matching what Fumadocs itself does for these lines (a colour
//     tint with no numbered badge — this migration doesn't reproduce the
//     tint, but a fabricated explanation would be actively wrong, not just
//     incomplete).
//   - auto mode (no explicit numbers anywhere in the file): every
//     `[!code ++/-]` becomes an auto-numbered `<.>` callout with its own
//     generated colist line — the simple, common case (e.g.
//     rectangle-tool.mdx), unaffected by any of the above.
export function annotateCode(text) {
  const lines = text.split('\n');
  const parsed = lines.map(parseTrailingMarker);

  const explicitNums = parsed.filter((p) => p && p.num !== null).map((p) => p.num);
  const mode = explicitNums.length > 0 ? 'explicit' : 'auto';

  const colist = [];
  let mergedCount = 0;

  const outLines = lines.map((line, i) => {
    const p = parsed[i];
    if (!p) return line;

    if (p.num !== null) {
      if (p.kind) mergedCount += 1; // combined "(N) [!code ++]" — number wins, see header comment
      return line.slice(0, p.matchStart) + `// <${p.num}>`;
    }

    if (p.kind) {
      if (mode === 'explicit') {
        // No explanation of its own — strip the marker, keep the code plain.
        return line.slice(0, p.matchStart).replace(/\s+$/, '');
      }
      const label = p.kind === 'added' ? 'Added' : 'Removed';
      colist.push(`<.> ${label} in this step.`);
      return line.slice(0, p.matchStart) + '// <.>';
    }

    return line;
  });

  return { code: outLines.join('\n'), colist, mergedCount };
}

// Matches a trailing `// (N)`, `// [!code ++]`/`// [!code --]`, or both
// together, anchored to end-of-line. Returns null for an ordinary trailing
// comment (including a bare `//`) so normal code is never touched.
function parseTrailingMarker(line) {
  const m = line.match(/\/\/\s*(\(\d+\))?\s*(\[!code\s+(?:\+\+|--)\])?\s*$/);
  if (!m) return null;
  const [, explicitPart, codePart] = m;
  if (!explicitPart && !codePart) return null;
  return {
    num: explicitPart ? Number.parseInt(explicitPart.slice(1, -1), 10) : null,
    kind: codePart ? (codePart.includes('++') ? 'added' : 'removed') : null,
    matchStart: m.index,
  };
}
