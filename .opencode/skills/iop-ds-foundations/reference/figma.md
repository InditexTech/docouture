# Figma — spec, not implementation

The npm packages are what ships. Figma is where intent, rationale and the visual
anatomy of a component live. **Where the two disagree, the packages win** — the
Breakpoints canvas is already provably stale.

Read Figma to answer *"what is this component supposed to do / contain / look like"*.
Never read Figma to obtain a value you could read from `node_modules`.

## Files

| file | key |
| --- | --- |
| IOP DS \| Foundations | `aVzfmpuxRcJLsOLqZJaqAH` |
| IOP DS \| Core Components | `k7yFLKOvab4OBB1v6xhM6i` |

## Foundations canvases

| canvas | node id | in the packages? |
| --- | --- | --- |
| Cover | `42:5852` | — |
| Breakpoints | `147398:20659` | yes — `variables/breakpoints.css` (**Figma stale**) |
| Color | `147398:20657` | yes — `variables/index.css` |
| Typography | `147398:20658` | yes — `typography.css` (CJK/PL/UA families **not** shipped) |
| Sizing | `204815:2308` | partly — steps above `ids-size-900` **not** shipped |
| Motion | `204946:21711` | yes — `motion.css` |
| Icons | `217486:9` | not audited |
| Illustrations | `217486:9884` | not audited |
| Logos | `217486:9665` | not audited — see `sewingiopdsweb-react-components/logo/` |
| Flags | `217858:2235` | not audited |
| Silhouettes | `222323:1866` | not audited |
| Asistant | `220952:2041` | not audited |

Useful sub-nodes on Typography: global tables `204797:2177` (families),
`206812:3319` (weights), `206812:3370` (sizes), `206812:3550` (line-heights),
`206812:3685`, `206812:3800`; semantic `206812:4203`; font styles `206812:4587`
(six tables) and behaviours `212226:28045`.

Sizing: global `206812:2497`, semantic-resolution `205006:16713`, semantic-PDA `221299:207`.

## Core Components

One component per page, ~120 `IDS *` component sets. Names map to package directories
predictably: *IDS Code Block* → `code-block/`, *IDS Empty State* → `empty-state/`.
See the `iop-ds-components` skill for the catalogue.

## Reading a Figma page

The MCP tool returns a compressed node tree. Tables of tokens are `DOC Table` frames
whose rows are `DOC Table / * Cell` instances; you need `depth: 5` or `6` to reach the
text, and the responses are large.

```
figma_get_figma_data(fileKey: "aVzfmpuxRcJLsOLqZJaqAH", nodeId: "147398:20657", depth: 3)
  → lists the DOC Table frames on the Color canvas
figma_get_figma_data(fileKey: "aVzfmpuxRcJLsOLqZJaqAH", nodeId: "212157:11837", depth: 6)
  → the rows of one table
```

Start shallow to find the frame you want, then go deep on that frame only. Fetching a
whole canvas at depth 6 will flood the context for no benefit.

## Verifying the packages against the spec

When a DS version bumps, the check is a diff, not a re-transcription:

```console
$ npm view @inditex/sewingiopdsweb-styles version
$ grep -c '\-\-ids-' code/node_modules/@inditex/sewingiopdsweb-styles/variables/index.css
```

Re-read Figma only for tokens the packages do not ship, or when a value looks wrong
and you need to know which side is the mistake.
