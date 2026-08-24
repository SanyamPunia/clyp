@AGENTS.md

# clyp

A single-page screenshot beautifier. The user drops in an image, styles a frame
around it, and exports a PNG. There is no backend and no persistence.

## Stack declaration

| Parameter | Value |
| --- | --- |
| Package manager | pnpm (`packageManager` field pins the version) |
| Framework | Next.js 16, App Router, Turbopack |
| React | 19 |
| Styling | Tailwind CSS 4, single stylesheet at `app/globals.css` |
| Components | shadcn/ui (new-york), Radix primitives |
| Icons | lucide-react, `*Icon`-suffixed imports |
| Fonts | Inter via `next/font/google`, one face for the whole app |
| Theme | Dark only. No light mode, no theme switcher. |
| Analytics | PostHog and OneDollarStats |
| Radius token | `--radius: 0.625rem` |
| Neutral scale | 12-step numbered gray, `--gray-100` to `--gray-1200` |
| Brand accent | `--brand`, oklch(0.628 0.196 38.6) |
| Focus ring | `focus-visible:ring-ring/50 focus-visible:ring-[3px]` |

TypeScript is pinned to 6.x. TypeScript 7 compiles this project, but
typescript-eslint does not support the TS 7 API yet, so linting breaks. ESLint
is pinned to 9.x for the same reason: eslint-config-next 16 still depends on an
eslint-plugin-react that throws on ESLint 10.

## Directories

```
app/          routes, root layout, providers, the one stylesheet
components/   feature components (canvas, controls, drop zone, upload card)
components/ui shared primitives, shadcn-generated or hand-added
lib/          pure modules, no React
types/        shared types
```

`lib/` holds no React. `components/ui/` holds primitives with no product
knowledge. Everything else is a feature component.

## Layout

The app fills the viewport and never scrolls as a page. Two bordered,
rounded-lg panels sit side by side, and each owns its own scroll region: the
canvas on the left, the style controls on the right. Below `lg` they stack and
the page scrolls normally.

The panels carry the only borders. Sections inside the right panel are
separated by hairline dividers (`divide-y divide-stroke`), never by nested
cards, so there is one border weight on screen.

## Color

The app is **dark only**. There is no `dark:` variant and no `.dark` class:
`:root` carries the one palette and sets `color-scheme: dark`. A `dark:`
utility in a component is dead code.

Two layers. The **primitive layer** is a 12-step numbered gray scale, Radix
style: `gray-100` is the app background and `gray-1200` is high-contrast text,
with `gray-1100` for low-contrast text and `gray-300` for hover washes. The
**semantic layer** maps onto it (`--panel`, `--canvas`, `--stroke`, and the
shadcn set).

Components use semantic tokens only. Never reach for a `gray-N` utility in a
component: change the mapping in `globals.css` instead. The one exception is
`bg-gray-1200 text-gray-100` on the primary button, where the contrast pair is
the point.

Two deliberate exceptions, both inside the exported artwork rather than app
chrome: the window title bar traffic lights in `window-navbar.tsx`, and the
gradient hexes in `lib/gradients.ts`. Neither follows the app theme, because
the exported PNG has no theme.

## Gradients

`lib/gradients.ts` is the single source of truth. A preset stores its stops as
data. The picker swatch and the exported canvas both derive their CSS from that
data, so the two cannot drift.

- `kind: "linear"` carries `stops` and a default `angle`. The angle control
  re-renders it at any direction.
- `kind: "mesh"` carries layered radial gradients over a `base` color and
  ignores the angle.
- `gradientToCss(preset, angle?)` produces the `background-image` value. Every
  consumer goes through it.
- Each family holds exactly eight presets, so the picker lays out as even rows.
  Adding a ninth to one family breaks that grid.

Every generated layer must be fully opaque. `GradientBackground` keeps the
previous gradient painted underneath during a cross-fade, and an incoming layer
with transparency would let the stale one show through, including in the export.

## Typography

Inter is the only face. No serif, no monospace: numeric readouts use
`tabular-nums`. Nothing is uppercase, and nothing is letter-spaced out.
Hierarchy comes from size, weight, and the gray step.

| Role | Treatment |
| --- | --- |
| Section title | `text-sm font-medium tracking-tight` |
| Section eyebrow | `text-xs text-gray-1000`, e.g. "Step 01" |
| Control label, meta | `text-[13px] text-muted-foreground` via `FieldLabel` |
| Descriptive copy | `text-[15px] leading-[24px]` (`--text-copy`) |

`FieldLabel` in `components/ui/field-label.tsx` is the one control-label
component. It lives in a component rather than the stylesheet because an
`@layer components` class loses to a utility, so a stylesheet version would be
overridden by the primitive's own `text-sm`.

## Export

`html-to-image` serializes the live DOM, so anything in the frame subtree ends
up in the PNG. Two consequences:

- The screenshot `<img>` is a data URL. `next/image` cannot optimize it and
  html-to-image cannot serialize it, which is why the `no-img-element` rule is
  disabled at that one line.
- The export ref attaches only when a real image exists. The upload card
  renders inside the same frame so styling previews before upload, and it must
  never reach the export.

## Canvas zoom

Zoom scales a wrapper **above** the export ref, never the ref'd node.
`html-to-image` sizes its output from that node, so a transform on it would
export a shrunken PNG. Two nested wrappers make it work:

1. an outer box with an explicit `width`/`height` of the *scaled* footprint,
   because a transform does not change layout size, and
2. an inner `w-max` box carrying the transform. Without `w-max` the frame
   stretches to the outer box, shrinking its own layout width and feeding a
   wrong size back into both the measurement and the export.

The frame's natural size comes from a `ResizeObserver`, since padding and
radius changes resize it. A new screenshot auto-fits so a large one is not
dropped on the canvas at 1:1.

The canvas scroll container must never carry `items-center` or
`justify-center`. Centering a scroller strands half the overflow above the
scroll origin, which makes the top of a tall screenshot unreachable. Center on
an inner `min-h-full w-max min-w-full` wrapper instead.

## Corner radius

Radii are numbers in px, not Tailwind classes, so individual corners are
addressable. `cornerRadius(radius, corners, only?)` in `lib/style-options.ts`
builds the shorthand. When the title bar is on it takes the top corners
(`only: "top"`) and the screenshot takes the bottom ones, so the two always
meet flush.

## Adding a control

1. Add the field to `StyleOptions` in `types/screenshot.ts`.
2. Add its default to `DEFAULT_STYLE` in `components/clyp.tsx`.
3. Render it in `components/style-controls.tsx` through `SliderRow`,
   `SizeRow`, `ChoiceRow`, or `ToggleRow`. Do not hand-roll another row shape.
   Any "pick one of a few" control goes through `SegmentedGroup` /
   `SegmentedOption`, so the radius chips and the export scale tiles cannot
   drift apart.
4. Consume it in the canvas subtree in `components/clyp.tsx`.

## Control sizing and shape

Buttons are pills (`rounded-full`). Height comes from the `size` prop, never an
`h-*` override. Two tiers: the default for every button and input on an app
surface, and `lg` for a modal's primary action. The `sm` tier is for chips only.

Surfaces are separated by a border rather than a shadow, since a drop shadow
does nothing against a dark ground. Shadows are kept only where something
genuinely floats: the upload card and the lifted option in a segmented
control. Segmented controls
(the preset tabs, the radius and shadow chips) sit on a recessed `bg-elevated`
track with the active item lifted on `bg-panel` plus `shadow-sm`.

## Animation

Multi-step sequences carry a storyboard comment and a named `TIMING` object at
the top of the file. See `components/clyp.tsx` and
`components/gradient-background.tsx`. Motion is CSS keyframes, defined in
`app/globals.css` and disabled under `prefers-reduced-motion`. There is no
animation library.

## Build gate

`pnpm check` runs typecheck, lint, and build. A green run is the gate for any
push. `next dev` regenerates `AGENTS.md`, so commit it with your work rather
than reverting it.
