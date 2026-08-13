# IDS motion

Source of truth: `@inditex/sewingiopdsweb-styles/motion.css`.

## Use the composites

Six ready-made `transition` shorthands. Reach for these first; they already pair a
duration with the right easing.

| token | value | use for |
| --- | --- | --- |
| `--ids-motion-micro-states` | `all 0.2s cubic-bezier(0,0,1,1)` | hover, focus, pressed, checked — anything that changes appearance in place |
| `--ids-motion-micro-leave` | `all 0.25s cubic-bezier(0,0,0.58,1)` | something small disappearing |
| `--ids-motion-micro-appear` | `all 0.35s cubic-bezier(0.42,0,1,1)` | something small appearing |
| `--ids-motion-macro-level-up` | `all 0.35s cubic-bezier(0,0,0.58,1)` | surface rising toward the user — dropdown, tooltip, popover |
| `--ids-motion-macro-level-down` | `all 0.4s cubic-bezier(0.42,0,1,1)` | surface receding — the same closing |
| `--ids-motion-macro-structure` | `all 0.5s cubic-bezier(0.42,0,0.58,1)` | layout rearranging — drawer, sidebar, accordion, page chrome |

```css
.nav-toggle { transition: var(--ids-motion-micro-states); }
.nav-drawer { transition: var(--ids-motion-macro-structure); }
```

## Raw values

| token | value |
| --- | --- |
| `--ids-motion-duration-s` | `0.2s` |
| `--ids-motion-duration-s-high` | `0.25s` |
| `--ids-motion-duration-m` | `0.35s` |
| `--ids-motion-duration-m-high` | `0.4s` |
| `--ids-motion-duration-l` | `0.5s` |
| `--ids-motion-duration-l-high` | `0.8s` |
| `--ids-motion-easing-standard-1` | `cubic-bezier(0,0,1,1)` — linear |
| `--ids-motion-easing-standard-2` | `cubic-bezier(0.42,0,1,1)` — ease-in |
| `--ids-motion-easing-standard-3` | `cubic-bezier(0,0,0.58,1)` — ease-out |
| `--ids-motion-easing-standard-4` | `cubic-bezier(0.42,0,0.58,1)` — ease-in-out |

Compose only when no composite fits:

```css
transition: opacity var(--ids-motion-duration-l) var(--ids-motion-easing-standard-3);
```

## Reduced motion is already handled

`motion.css` contains a `@media (prefers-reduced-motion)` block that collapses every
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
  transition-duration: var(--ids-motion-duration-s);
  transition-timing-function: var(--ids-motion-easing-standard-1);
}
```
