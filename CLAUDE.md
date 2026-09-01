@AGENTS.md

# clyp

A single-page screenshot beautifier. The user drops in an image or a short
video, styles a frame around it, and exports a PNG or a silent MP4. There is no
backend and no accounts.

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

Both exports leave through `download` or `downloadBlob` in `lib/download.ts`,
and the extension is imposed by `filenameFor` in `components/clyp.tsx` rather
than trusted from the field, so a clip saved as `demo.png` cannot happen. What
the user typed wins, then the dropped file's own name, then `clyp`. The modal
shows that fallback as the field's placeholder rather than prefilling it, so
the field stays empty until someone means to rename something.

**Copy always produces a PNG and Download decides the format.** The clipboard
has no MP4 flavour, so copying a clip captures its current frame with the
styled chrome around it, which `toPng` already does for free. `exportsVideo` in
`components/clyp.tsx` is the one test for whether an export encodes, and the
modal derives its own `isVideo` the same way.

The size readout is measured, not guessed. `lib/export-size.ts` carries the
sample tables both fits came from. Re-measure rather than adjusting a
coefficient by eye.

## Video

`Media` in `types/screenshot.ts` is what the canvas frames: a `kind`, a `src`,
and for a video the source `Blob` and its duration. An image stays a data URL,
which is the low-risk `html-to-image` path and what the draft store already
held. A video is an object URL over a Blob, because a thirty second 1080p clip
is forty megabytes and base64 would add a third to that for nothing.

**The chrome is rasterized once and the decoded frames are drawn over it.** One
`toPng` of the frame, the same call the PNG export makes, bakes every styled
pixel including the video's own drop shadow. Each output frame is then two
draws: the chrome, then the decoded frame clipped to the rounded rect the video
occupies. **Do not replace this with a Canvas2D redraw of the gradient, the
padding, the radius, the shadow and the title bar.** That is a second renderer,
it has to be kept in step with the DOM one forever, and the day it drifts the
preview starts lying about the export.

- **`html-to-image` handles the `<video>` on its own.** `cloneVideoElement`
  draws the currently displayed frame into a canvas and substitutes an `<img>`
  carrying the element's computed style, so the radius and the shadow bake and
  a poster-frame PNG of a clip needs no special path. The substituted still is
  covered by the composite anyway.
- **Frames are decoded from the original file, through mediabunny's `Input` and
  `VideoSampleSink`.** Seeking a `<video>` per frame is slow and only roughly
  accurate, and capturing one while it plays pins the export to real time.
  `mp4-muxer` is deprecated in favour of this library, so do not reintroduce
  it.
- **`frames.add(...)` is awaited, which is what applies the encoder's own
  backpressure.** Without it a short clip queues every frame at once and the
  tab runs out of memory before the first one is written.
- **The measurement is two ratios against the raster, never against the export
  scale.** They absorb the canvas zoom, which is a transform on a wrapper above
  the frame and therefore in both rects, and they absorb `toPng`'s own
  rounding, so the clip lands on the pixel the chrome was baked at. A radius
  comes from computed style, which that transform does not touch, so it takes
  the layout ratio instead.
- **H.264 needs even dimensions and tops out at 4096 on its longest edge.**
  Dimensions round down, which loses at most a pixel an edge. The edge cap is
  why `MAX_VIDEO_EDGE` exists, and why a scale that would exceed it renders as
  a disabled tile reading "Too large" rather than being hidden: the ceiling is
  visible instead of the control silently having fewer options than it does for
  an image.
- **The input caps live in `lib/media.ts`: 100 MB and 60 seconds.** Both are
  checked at the drop, where the failure can be a toast. There is no graceful
  way to fail once the memory is gone.
- **Whether the file can be decoded at all is answered by a probe, not by its
  MIME type.** A `.mov` carrying something exotic passes the type check and
  then fails to load, and that belongs at the drop rather than at the export.
- **One thing a clip cannot do, gated in the toolbar and on the keyboard
  shortcut.** The encode needs WebCodecs, so Download is disabled where it is
  missing. The reason rides a tooltip through `Hint`, which wraps the button in
  a span, since a disabled button emits no pointer events of its own.
- **The output is capped at `MAX_FPS`, which is 30.** A 60 fps recording costs
  twice the encode time and close to twice the file for motion nobody reads in
  a UI demo. **Decimation is by slot, never by an interval since the last kept
  frame.** A running deadline accumulates float error against timestamps that
  are exact multiples of the source's period: measured, a 60 fps clip lost 96
  of 180 frames instead of 90 and came out unevenly spaced. Flooring
  `timestamp / gap` with a small tolerance cannot drift, and a source already
  at or under the ceiling maps every frame to its own slot and passes through
  untouched. Verified: 180 frames in, 90 out, and a 30 fps clip exports
  byte-identical to before the cap existed.
- **A dropped sample's time is carried onto the next kept frame**, so what
  survives still tiles the clip's real duration. Both a 60 fps and a 30 fps
  source export at exactly 3.000 s.
- **Cancel aborts a running encode.** `handleExport` holds an `AbortController`
  for the length of one video export and the modal's Cancel calls it while
  pending, since Escape and the backdrop stay blocked. The signal is checked
  once per frame in the sample loop and once after the raster, which is the
  earliest a cancel during `toPng` can be heard. An `AbortError` closes the
  dialog and says nothing, because a cancel is not a failure.
- **WebCodecs presence is read with `useSyncExternalStore`,** not from an
  effect: the lint rule forbids a synchronous `setState` in an effect body, and
  seeding state from `window` during render would not survive hydration. The
  server snapshot says the encoder is there, so the control starts usable and
  disables itself on hydration rather than starting disabled everywhere.
- **Progress has two phases and only one of them has a fraction.** Zero means
  the chrome is still rasterizing, which is one `toPng` call with nothing to
  read inside it. Anything above zero is the encode, reported off the end of
  each written frame so the first report is not also zero.
- **The preview is `autoPlay loop muted playsInline`.** Muted and inline, or a
  browser refuses to play it without a gesture. Looping, because the canvas is
  a preview of styling rather than a player: there are no controls, and
  stopping at the end would leave the frame looking broken.
- **One `mediaRadius` serves the `<img>` branch, the `<video>` branch and the
  export's clip**, so an image and a clip cannot end up cornered differently.
- Export is silent. There is no audio track.
- The toolbar's meta row names the clip's length beside its dimensions, so what
  is about to be encoded is readable without opening the modal.

## Trim

`components/trim-bar.tsx` is the in and out points and the preview's playhead.
One control does both jobs because they are the same geometry: a lane a reader
can scrub is a lane a reader can cut, and two timelines under one video would
have to agree about where a second is.

- **The kept clip is a block and what is cut is a rail.** Two fills a few steps
  apart across one flat lane read as one lane, however far apart the tones are,
  so the height is what says which part survives.
- **A handle sits fully inside the lane at both ends**, so the span a value maps
  onto is the lane less one handle. It is a `calc` rather than a measurement,
  which is what lets the handles and the selection render without knowing the
  lane's width. Only the playhead needs the width, and it reads it from a
  `ResizeObserver` into a ref.
- **The playhead and the loop are one frame loop, not `timeupdate`.** That event
  fires about four times a second, which is too coarse to draw a playhead with
  and too coarse to stop on an out point: 250ms of overshoot is a trimmed clip
  visibly playing past its own end before it jumps back.
- **The bar reads the preview's clock and asks its owner to move it.** A ref
  arriving as a prop belongs to whoever created it, and the React compiler's
  `react-hooks/immutability` rule says so: `element.currentTime = x` on a
  prop-supplied ref fails the lint. So `video` is read-only here and `onSeek`
  and `onPlayback` go back up to `clyp.tsx`.
- **The loop's mirror refs are written in an effect, never during render.**
  `react-hooks/refs` rejects the render-time write, and the frame loop is bound
  once, so without the mirror it closes over the trim the bar mounted with.
- **Dragging a handle pauses the preview and resumes on release** if it was
  playing. Reading the frame under the handle is the whole point of dragging
  one, and it is gone before you can read it otherwise.
- **A sample's timestamp is absolute, so the export offsets it.** A trim
  starting at six seconds would otherwise write an MP4 whose first frame is at
  six seconds, which is six seconds of nothing at the front. Verified: trimming
  to [6, 11] gives a 5.000 s file starting at 0.000, and its first frame matches
  the source at six seconds at 0.99 SSIM against 0.61 at zero.
- **`clipSeconds` in `clyp.tsx` is the one length everything reads**, so the
  toolbar, the duration readout, the size estimate and the encode cannot
  describe a length nobody asked for.
- **The trim is not persisted, the same call zoom makes.** It is an edit on the
  draft rather than part of it, and putting it in the stored record would
  rewrite the whole Blob on every drag of a handle.
- The shortest a trim may leave is `MIN_TRIM`, 0.2 s. Arrow keys step 0.1 s and
  Shift steps 1 s, on both handles, which are real sliders with their own
  labels and values.

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

## Draft persistence

The screenshot or clip survives a reload. It is stored in **IndexedDB**, not
localStorage: a data URL of a real capture reaches tens of megabytes against
localStorage's roughly five, so the images worth keeping are exactly the ones
that would throw `QuotaExceededError`. Measured: a 2400x3200 incompressible
screenshot is a 28.6 MB data URL.

**A video is stored as the Blob itself, never as its `src`.** A `blob:` URL is
scoped to the document that created it, so a stored one restores as a dead
link. `readMedia` returns `{ kind, payload, name }` and the restore mints a
fresh object URL by handing the Blob back through the same loader a drop uses,
which is also what re-measures it. The name is stored because it is what an
export's filename falls back to, and a File rebuilt without it would export as
`clyp`. A bare string in the store is a draft from before video support and
reads back as an image.

Style options are a few hundred bytes and stay in localStorage, merged over
`DEFAULT_STYLE` on read so an object written by an older build cannot leave a
field undefined.

Reading happens on the client only, inside a promise rather than the effect
body. Seeding state from storage during render would break hydration, because
neither store exists on the server. Nothing is written until the restore has
run, or the first render would overwrite the draft with defaults.

Every storage call swallows its own errors and reports absence. A private
window and disabled site data are both normal, and neither should break the
editor.

## Responsive behaviour

Below `lg` the two panels stack and the page scrolls. Above it the app fills
the viewport and each panel scrolls on its own.

The canvas toolbar wraps below `sm`: the meta and zoom cluster take the first
row, the export actions take the second. Without the wrap the action group is
483px wide and Copy and Download fall off a 390px screen entirely, clipped by
the panel rather than reachable by scrolling.

Keyboard shortcut hints are `hidden sm:flex`, since a phone has no command key.

## Scroll edges

`ScrollFade` fades the edge a scroll region continues past, using `mask-image`
on the scroller rather than an overlaid element, so it works over any
background and adds no node. Each edge fades only when there is content that
way: a permanent fade would dim the first heading before any scrolling, and a
fade at a boundary already reached says nothing.

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
