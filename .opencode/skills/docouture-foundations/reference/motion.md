# Design tokens — motion

Hand-maintained in `code/packages/ui-bundle/src/css/dt-tokens.css`.

## Use the composites

Six ready-made `transition` shorthands. Reach for these first; they already pair a
duration with the right easing.

| token | value | use for |
| --- | --- | --- |
| `--dt-motion-micro-states` | `all 0.2s cubic-bezier(0,0,1,1)` | hover, focus, pressed, checked — anything that changes appearance in place |
| `--dt-motion-micro-leave` | `all 0.25s cubic-bezier(0,0,0.58,1)` | something small disappearing |
| `--dt-motion-micro-appear` | `all 0.35s cubic-bezier(0.42,0,1,1)` | something small appearing |
| `--dt-motion-macro-level-up` | `all 0.35s cubic-bezier(0,0,0.58,1)` | surface rising toward the user — dropdown, tooltip, popover |
| `--dt-motion-macro-level-down` | `all 0.4s cubic-bezier(0.42,0,1,1)` | surface receding — the same closing |
| `--dt-motion-macro-structure` | `all 0.5s cubic-bezier(0.42,0,0.58,1)` | layout rearranging — drawer, sidebar, accordion, page chrome |

```css
.nav-toggle { transition: var(--dt-motion-micro-states); }
.nav-drawer { transition: var(--dt-motion-macro-structure); }
```

## Raw values

| token | value |
| --- | --- |
| `--dt-motion-duration-s` | `0.2s` |
| `--dt-motion-duration-s-high` | `0.25s` |
| `--dt-motion-duration-m` | `0.35s` |
| `--dt-motion-duration-m-high` | `0.4s` |
| `--dt-motion-duration-l` | `0.5s` |
| `--dt-motion-duration-l-high` | `0.8s` |
| `--dt-motion-easing-standard-1` | `cubic-bezier(0,0,1,1)` — linear |
| `--dt-motion-easing-standard-2` | `cubic-bezier(0.42,0,1,1)` — ease-in |
| `--dt-motion-easing-standard-3` | `cubic-bezier(0,0,0.58,1)` — ease-out |
| `--dt-motion-easing-standard-4` | `cubic-bezier(0.42,0,0.58,1)` — ease-in-out |

Compose only when no composite fits:

```css
transition: opacity var(--dt-motion-duration-l) var(--dt-motion-easing-standard-3);
```

## Reduced motion is already handled

`dt-tokens.css` contains a `@media (prefers-reduced-motion)` block that collapses every
duration to `0.01ms` and every easing to `linear`. Anything driven by these tokens is
accessible for free.

Do **not** add your own `prefers-reduced-motion` block for token-driven transitions —
you would be overriding a working implementation. Only add one for motion these tokens
cannot express: CSS `@keyframes` animations, `scroll-behavior: smooth`, or JS-driven
movement. Those must be guarded by hand.

## Scope

`all` in the composites is deliberate but broad. On a large or frequently repainted
element it costs more than it should; narrow it while keeping the tokens:

```css
.card {
  transition-property: background-color, border-color;
  transition-duration: var(--dt-motion-duration-s);
  transition-timing-function: var(--dt-motion-easing-standard-1);
}
```
