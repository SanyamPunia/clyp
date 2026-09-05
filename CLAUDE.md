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
components/   feature components (canvas, controls, drop zone, upload card,
              trim bar)
components/ui shared primitives, shadcn-generated or hand-added
e2e/          browser specs and their fixtures
lib/          pure modules, no React, and their specs beside them
types/        shared types
```

A hook lives beside the component that uses it, as `components/use-*.ts`.
`use-edit-history.ts` is the only one so far. `lib/` still holds no React.

`lib/` holds no React. `components/ui/` holds primitives with no product
knowledge. Everything else is a feature component.

**Specs sit beside the module they cover, as `lib/<name>.test.ts`.** Vitest
runs a Node environment over `lib/**/*.test.ts` only: nothing here renders a
component, because what has no other guard is the arithmetic. Every number in
these modules was measured by hand once, and the specs are written against
those recorded measurements rather than against fresh guesses, so a spec that
disagrees with this file is a real regression in one of the two.

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

The exceptions are all inside the exported artwork rather than app chrome:
the title bar and browser bar in `window-navbar.tsx`, the caption's text
colours in `clyp.tsx`, and the gradient hexes in `lib/gradients.ts`. None of
them follows the app theme, because the exported PNG has no theme.

## Background

`background` in `StyleOptions` is a `BackgroundKind`: `preset`, `custom`,
`solid` or `none`. `lib/gradients.ts` is the single source of truth for all
four, and `resolveGradientCss(style)` is the one place style state becomes a
background value. Both exports and the cross-fade read only its result.

**A solid is written as a one-colour gradient and transparency as the CSS
keyword `none`.** Every kind therefore arrives on `background-image`, so the
cross-fade, the grain layer, the raster and the video composite need no branch
for which kind is showing. A `background-color` path would have been a second
way to paint the same surface.

- **A transparent background is the one layer the cross-fade cannot keep the
  previous gradient under.** `GradientBackground` leaves the outgoing gradient
  painted underneath while the incoming one fades in, which is safe only
  because every generated layer is opaque. Under a transparent one the old
  gradient showed through for good rather than for 400ms, in the canvas and in
  the export alike: the panel said None and the canvas still showed Golden
  Hour. The outgoing layer is not painted at all when the incoming one is
  `none`, and there is nothing to fade into anyway.
- **The checkerboard for a transparent background sits behind the frame, not
  inside it.** It is a `.transparency-grid` layer on the canvas footprint box,
  which is outside the export ref, so the checks can never be serialized into a
  PNG. It takes the frame's own `outerRadius` so the corners agree.
- **Grain is disabled when there is no background.** An overlay blend leaves a
  transparent surface transparent at any strength, so the control would be dead.
- **The export modal names what an MP4 does with it, and only for a clip.** The
  worker's canvas is `alpha: false`, so a transparent frame composites onto
  opaque black with no change to the encode. A PNG keeping its transparency is
  what picking it already said, so that needs no sentence.
- A draft stored before this reads back on the preset tab, since `readStyle`
  merges over `DEFAULT_STYLE`.

Verified at the file level. A PNG exported on `none` reads alpha 0 through the
padding and 255 over the picture, so only the artwork is opaque. The same
export on `solid` reads 255 through the padding and 0 only outside the frame's
own radius.

### Gradients

A preset stores its stops as data. The picker swatch and the exported canvas
both derive their CSS from that data, so the two cannot drift.

- `kind: "linear"` carries `stops` and a default `angle`. The angle control
  re-renders it at any direction.
- `kind: "mesh"` carries layered radial gradients over a `base` color and
  ignores the angle.
- `gradientToCss(preset, angle?)` produces the `background-image` value. Every
  consumer goes through it.
- **A family holds a multiple of eight presets, so the picker lays out as even
  rows.** It is eight columns wide, and a ninth in one family leaves a ragged
  last row. Each family currently holds sixteen, which is two rows.
  `lib/gradients.test.ts` fails on any other count.
- **No two presets share a label.** A swatch shows no text, so the label is its
  tooltip and its screen-reader name. Where a colour name is wanted in two
  families, the mesh one carries the suffix: `Ember` and `Ember Mesh`.

Every generated layer must be fully opaque. `GradientBackground` keeps the
previous gradient painted underneath during a cross-fade, and an incoming layer
with transparency would let the stale one show through, including in the export.
The spec checks that every colour is a six-digit hex.

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
- A control that has to sit on the picture itself is the one thing allowed
  inside the frame that is not artwork. It carries `data-export-ignore`, and
  `rasterize` in `lib/raster.ts`, which both exports and the video's chrome go
  through, filters it out. The zoom's focus marker is the one case. Feedback
  that needs no picture coordinates, like the play flash, stays outside the
  frame instead.

Both exports leave through `download` or `downloadBlob` in `lib/download.ts`,
and the extension is imposed by `filenameFor` in the same file rather than
trusted from the field, so a clip saved as `demo.png` cannot happen. What the
user typed wins, then the dropped file's own name, then `clyp`. The modal shows
that fallback as the field's placeholder rather than prefilling it, so the
field stays empty until someone means to rename something.

**A machine-written source name is skipped.** The source name is the right
default for a file someone named deliberately and the wrong one for whatever
the OS called a capture: macOS hands over `Screen Recording 2026-09-01 at
6.28.06 PM`, which is 41 characters of bookkeeping on the artifact about to be
posted. `machineNamed` catches the screen recording and screenshot prefixes,
CleanShot, camera-roll numbering, bare dates and timestamps, and falls through
to `clyp`. `demo.mp4`, `onboarding-flow.mp4` and `my recording of the thing.mp4`
all survive, and a typed name always wins.

**Copy always produces a PNG and Download decides the format.** The clipboard
has no MP4 flavour, so copying a clip captures its current frame with the
styled chrome around it, which `toPng` already does for free. `exportsVideo` in
`components/clyp.tsx` is the one test for whether an export encodes, and the
modal derives its own `isVideo` the same way.

The size readout is measured, not guessed. `lib/export-size.ts` carries the
sample tables both fits came from. Re-measure rather than adjusting a
coefficient by eye.

## The export dialog

**It says what you get, not what it is doing, and each value sits with what
decides it.** Dimensions belong on the Scale row, since that is the control
that produces them. How long the file runs and how big it lands go in the
footer, beside the button that writes it, where they are sticky and are the
last thing read before committing. The frame rate is stated by the label on
its own selected tile and appears nowhere else.

**One line carrying all four was worse than the row it replaced.** It read
`3418 × 2194 · 30 fps · 16s · ~2.1 MB`: four facts of equal weight behind three
dots, with no reading order, which is a spec sheet rather than a readout. One
value a row is the ceiling here, so Scale carries the dimensions, Frame rate
carries the length, and the footer carries the file.

**The footer line leads with the format and a mark of its own.** Two bare
numbers in a corner say nothing about what they measure, and the container is
the one fact about the output stated nowhere else once the description went:
it used to be buried in a sentence saying the clip is re-encoded as an MP4. It
is `whitespace-nowrap`, because at 420px the buttons leave it about 130px and
`~912 KB` was breaking across two lines.

- **The visible description is gone and the `DialogDescription` is `sr-only`.**
  The dialog still needs something to be described by. What it does not need is
  two lines at the top saying that longer clips take longer to render, which is
  true of every encoder ever written and is not something a reader acts on.
- **A refused scale says why, whenever anything is refused.** "Too large" is a
  state: on its own it leaves the reader unable to tell whether the limit is
  their file, their browser or this app, and with no idea that padding is the
  way back. The line names which scales and the remedy, and agrees in number,
  so one refusal reads "3x is more than this browser can encode" and two read
  "2x and 3x are". Every scale failing gets its own sentence, since less padding
  alone may not be enough there.
- **Every setting takes the same shape: a label, then its control.** The audio
  toggle used to sit in a filled `bg-track` card with a title and a subtitle,
  which gave sound more visual weight than scale and made the switch the
  brightest thing in the body. It is now a `FieldLabel` and a `Switch` on one
  row, which is what every other toggle in the app is.
- **Copy is worded for what the reader gets, not for the codec.** "Re-encoded
  as AAC alongside the video" became a line that only appears when a soundtrack
  is placed, naming the file it will play instead of the clip's own sound.

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

- **The encode runs in a worker.** `lib/video-render.ts` is the loop, written
  against `OffscreenCanvas` and `ImageBitmap` and touching nothing on the
  document. `lib/video-render.worker.ts` is the glue, spawned by `exportVideo`
  through `new Worker(new URL(...), import.meta.url)`, which Turbopack bundles.
  A minute of 1080p is seconds of solid work, and on the main thread that was
  a frozen tab with a progress bar that could not move.
  - **What needs the document stays on the main thread.** `toPng` reads the
    DOM, the video's box is measured off it, and a laid soundtrack is mixed
    through `OfflineAudioContext`, which no worker has. The chrome crosses as
    a transferred `ImageBitmap` and the mix as one planar `Float32Array`,
    since an `AudioBuffer` can neither be posted nor built in a worker. The
    worker slices it into one-second `AudioSample`s and closes each one.
  - **Terminating the worker is the cancel.** It releases the encoder and every
    decoded frame in flight in one step, so the loop carries no signal. A
    cancel is heard on the main thread after the raster and after the mix.
  - One worker per export, terminated when the reply lands. The first export
    pays for the worker's compile: measured at about 5 s for a 4 s clip
    against 1.6 s for the next.
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
- **H.264 needs even dimensions.** They round down, which loses at most a pixel
  an edge, where the alternative is an encoder that refuses to configure.
- **Whether a size can be encoded is asked, never assumed.** `canEncodeSize`
  probes through mediabunny's `canEncodeVideo` with the same codec and quality
  the export uses, so the config asked about is the config that will run. The
  answer gates the scale tiles, and one that comes back no renders as a
  disabled tile reading "Too large" rather than being hidden: the ceiling
  should be visible rather than the control silently having fewer options than
  it does for an image.
  - **This replaced a wrong guess, and the guess shipped.** The first version
    capped the longest edge at 4096px, which is not the constraint: an H.264
    level is a budget of macroblocks. A 3932x3136 frame passes a 4096 edge check
    while being 48020 macroblocks, needing level 6.0, and a real export failed
    with "this specific encoder configuration (avc1.64003c ...) is not supported
    in this environment". Rewriting the check as a level table would only have
    been a better guess. The browser already knows.
  - **The frame rate is not part of the question.** mediabunny derives the level
    from the size alone, so the probe answers for both rates.
  - **A probe that cannot answer counts as yes.** Blocking an export on a failed
    capability check is worse than attempting one: the encode reports its own
    refusal, and that message now names the size and points at the scale rather
    than quoting a codec string back.
  - **Every scale failing is a real state and the dialog says so**, with the
    primary action refused and a line naming the two remedies this app actually
    has, less padding or a smaller source. The selection falls to the smallest
    scale there rather than holding, so the size beside the label is the closest
    one to achievable. Verified on a frame of 3928x2558, which is 39360
    macroblocks against a 36864 budget.
- **The input caps live in `lib/media.ts`: 100 MB and ten minutes.** Both are
  checked at the drop, where the failure can be a toast.
  **Size is the real bound and duration is not.** The file is held as a Blob
  and written to IndexedDB whole, so 100 MB is a memory limit. Duration was 60
  seconds only because the export used to decode the whole file, and it no
  longer does: `sink.samples(from, to)` seeks to the keyframe at or before the
  in point, so a four minute recording cut to ten seconds encodes ten seconds.
  Verified: a three minute clip drops in about 1.8 s and its axis reads
  `0:00` to `3:00`.
- **Whether the file can be decoded at all is answered by a probe, not by its
  MIME type.** A `.mov` carrying something exotic passes the type check and
  then fails to load, and that belongs at the drop rather than at the export.
- **One thing a clip cannot do, gated in the toolbar and on the keyboard
  shortcut.** The encode needs WebCodecs, so Download is disabled where it is
  missing. The reason rides a tooltip through `Hint`, which wraps the button in
  a span, since a disabled button emits no pointer events of its own.
- **The frame rate is a choice, 30 or 60, defaulting to 60.** It is a ceiling
  rather than a rate: the decimation only ever drops frames, so a 30 fps source
  exports at 30 whichever is picked and 60 means nothing is dropped. Verified on
  a 180-frame source: 90 frames out at 30, 180 at 60, both exactly 3.000 s.
  - **60 fps is far cheaper than it sounds, and the first version of this capped
    at 30 on a guess that measurement did not support.** A panning UI clip went
    236 KB to 283 KB at 1x and 540 KB to 638 KB at 2x, both about 1.2, while a
    dense test pattern went 139 KB to 230 KB, about 1.65. Encode time was
    steadier at roughly 1.22 across every sample. So the size estimate carries a
    1.4 factor, the middle of that spread, and 60 is the default because a fifth
    more time for every frame the source has is worth it.
  - **`EDIT_FPS` stays 30 and is a different thing.** It is the grid the trim
    handles land on, deliberately the coarser rate: a point on the 30 fps grid
    is also a point on the 60 fps grid, so a trim is exact at either. Following
    the export's choice would move every existing in and out point the moment
    that choice changed.
  - **Decimation is by slot, never by an interval since the last kept frame.** A running deadline accumulates float error against timestamps that
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
  pending, since Escape and the backdrop stay blocked. The signal terminates
  the worker, and is checked once after the raster and once after the mix,
  which are the earliest a cancel during either can be heard. An `AbortError`
  closes the dialog and says nothing, because a cancel is not a failure.
- **WebCodecs presence is read with `useSyncExternalStore`,** not from an
  effect: the lint rule forbids a synchronous `setState` in an effect body, and
  seeding state from `window` during render would not survive hydration. The
  server snapshot says the encoder is there, so the control starts usable and
  disables itself on hydration rather than starting disabled everywhere.
- **Space plays and pauses, from anywhere on the page.** Bound to the window
  rather than to the bar, since the point is not having to find the bar first,
  and the trim bar only exists while a clip does, which is all the gating it
  needs. A field being typed in keeps its spaces, and a focused `<button>`,
  `<a>`, `<select>` or `<textarea>` keeps its own native behaviour, or tabbing to
  Play and pressing space would toggle twice. The page's own scroll is taken
  with `preventDefault`.
- **Progress has two phases and only one of them has a fraction.** Zero means
  the export is still being prepared: the raster and any mix, neither with a
  fraction to read inside it. Anything above zero is the encode, reported off
  the end of each written frame so the first report is not also zero.
- **The preview is `autoPlay loop muted playsInline`.** Muted and inline, or a
  browser refuses to play it without a gesture. Looping, because the canvas is
  a preview of styling rather than a player: there are no controls, and
  stopping at the end would leave the frame looking broken.
- **One `mediaRadius` serves the `<img>` branch, the `<video>` branch and the
  export's clip**, so an image and a clip cannot end up cornered differently.
- **The source's audio is carried across when it has any**, re-encoded as AAC
  beside the video and offered as a switch in the export modal. The switch is
  shown only when there is something to keep, so it is never a control over
  silence.
  - **Whether there is audio is read from the container at the drop**, through
    a metadata-only mediabunny `Input`. A `<video>` element cannot answer it:
    `audioTracks` is not in Chrome, and the vendor-prefixed byte counters only
    report once something has played.
  - **The track is declared before `output.start()` and written after the video
    loop.** A track cannot be added to a running output, and the muxer
    interleaves at finalize, so a second progress phase for it is not worth
    reporting: audio for a clip this length is a fraction of the video's time.
  - **Its timestamps are offset the same way the video's are.** A trim starting
    at six seconds would otherwise write six seconds of silence before the
    sound starts. Verified on a clip that steps 440 Hz to 880 Hz at its
    midpoint: trimmed to the second half, the export reads 880 Hz from 0.2 s in.
  - **`canEncodeAudio` is checked rather than assumed.** A source whose audio
    has no encoder here is worse than no sound, since the export would fail
    outright.
  - AAC frames are 1024 samples, so the audio track runs up to about 90 ms past
    the video's own duration. Players stop at the longer track, which is the
    right answer and not worth trimming to the sample.
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
- **Dragging anything on these lanes pauses the preview and resumes on
  release** if it was playing: a trim handle, a zoom region or its edges, a
  soundtrack region or its edges, and the zoom's aim marker on the picture.
  Reading the frame under a handle is the whole point of dragging one, and it
  is gone before you can read it otherwise. A zoom edge also moves the
  playhead to itself, clamped into the trim so the loop does not fight it,
  since the frame under the edge is what decides where a zoom should start or
  stop. A soundtrack drag only pauses, since sound is placed against the
  picture rather than a frame.
- **A sample's timestamp is absolute, so the export offsets it.** A trim
  starting at six seconds would otherwise write an MP4 whose first frame is at
  six seconds, which is six seconds of nothing at the front. Verified: trimming
  to [6, 11] gives a 5.000 s file starting at 0.000, and its first frame matches
  the source at six seconds at 0.99 SSIM against 0.61 at zero.
- **`clipSeconds` in `clyp.tsx` is the one length everything reads**, so the
  toolbar, the duration readout, the size estimate and the encode cannot
  describe a length nobody asked for. It is `keptSeconds(trim, cuts) / speed`,
  so every cut comes off it. See Cuts.
- **The trim is stored under the edits key, never beside the Blob.** It is an
  edit on the draft rather than part of it, and putting it in the media record
  would rewrite the whole Blob on every drag of a handle. See Draft
  persistence.
- The shortest a trim may leave is `MIN_TRIM`, 0.2 s. Arrow keys step 0.1 s and
  Shift steps 1 s, on both handles, which are real sliders with their own
  labels and values.
- **The transport sits in the same recessed pill the canvas toolbar gives its
  zoom cluster**, so two groups of icon buttons on one surface read as the same
  kind of thing. **Its row is a grid with equal side columns, never
  `justify-between`**, which hands the middle whatever is left and walks the
  transport sideways every time the readout gains a digit or picks up its "of"
  clause. Measured: the pill's centre holds the row's centre exactly across
  every readout state and down to a 900px window. Stop returns to the in point rather than to zero, since the in
  point is where the clip now starts.
- **A step is one frame of the export, not one frame of the source.** A
  `<video>` element does not expose its own rate, and a step is being used to
  inspect what will be encoded, so `1 / MAX_FPS` is the honest interval.
- **Play state is read off the element's own `play` and `pause` events**, never
  tracked alongside it. A handle drag pauses the preview too, and a button that
  disagreed with the video would be worse than no button.
- **Looping is the trim bar's, never the element's.** The `<video>` carries no
  `loop` attribute: that loops at the file's end, which is not the clip's end
  once there is a trim, so the two would compete. The frame loop wraps at the
  out point, and its loop control switches that off, in which case playback
  stops on the last frame that will be in the export rather than one past it.
  Pressing play on a clip parked there starts it over, since otherwise it plays
  nothing.
- **A wrap is a seek and then a play, and the play is not optional.** With no
  `loop` attribute the element pauses itself at the file's own end, so seeking
  alone put the playhead back at the top and left it there: looping appeared to
  work for exactly one pass. Whether to resume is read before the seek, since
  seeking clears `ended`, and a deliberate pause at the out point is left
  alone. Measured across eight seconds of a three second clip: three wraps and
  no stalled samples, where before there was one wrap and thirty stalls out of
  thirty-nine. A trimmed window mid-file loops the same way, with the
  soundtrack following it: four wraps over `[5, 7]`, no sample outside the
  range, and the audio never stalling.
  - This is also why `handlePlayback` catches `play()`. It is asked for once a
    frame while a wrap settles, and a refusal there would be an unhandled
    rejection per frame.
- **Play and pause are stacked and cross-faded, not swapped.** That control is
  pressed twice in a row more than any other here, and a glyph that pops in
  reads as the button flickering. Both sit in the same box, so it is never
  briefly empty. It is two CSS transitions, since this project has no animation
  library.
- **The axis is a ruler, at the first interval that leaves its labels far
  enough apart to read.** One interval for every clip either crowds a long one
  or leaves a short one with two marks on it. Intervals run from 0.05 s to five
  minutes, and past a minute a label becomes a clock, since "180s" is a number
  a reader has to convert. Measured on an 882px lane: a 3 s clip is marked
  every 0.25 s, an 8 s clip every second, a 20 s clip every two seconds, a
  three minute clip every fifteen.
- **Minor ticks fill in between the labelled ones**, at the finest subdivision
  whose marks still read as separate ones. They carry no number, so they need
  only be far enough apart to see, and they are what turns a row of numbers
  into a ruler.
- **Everything lands on the export's frame grid.** Both handles snap to it,
  dragged or nudged, and the arrow keys step one frame where Shift steps a
  second. An out point between two output frames cannot be honoured, so
  offering one is a readout that lies by up to 33 ms. The snap is invisible: a
  frame is 1.5px on a 20 s clip across an 882px lane.
- **The playhead's own time is written beside the transport, to the
  millisecond.** Written rather than rendered, like the playhead itself:
  measured at 58 text mutations across one second of playback, which is one a
  frame and no React renders. `formatPrecise` takes the clip's length as well
  as the value, so a readout counting up through a long clip keeps one shape
  instead of growing a `0:` at the minute mark.
- The axis is `aria-hidden`, since both handles already report their value in
  seconds and a reader hears the numbers that matter.
- **A press on the lane seeks and holding it drags the playhead along.** It
  pauses for the drag and resumes on release if it was playing: playback and a
  scrub fight over the same clock, and what comes out is the video stuttering
  rather than being moved.
- **A scrub clamps a frame short of the out point.** Landing exactly on it
  reads to the loop as the clip ending, which snaps the playhead back to the
  start under the hand.
- **The lane is `cursor-grab` and the handles are `cursor-ew-resize`**, which is
  the second place in this app the shared cursor-pointer rule gives way. The
  two cursors say which gesture each part answers: drag the middle, resize the
  edges. A press on a handle stops propagating, so it never also scrubs.
- **The bar folds to its transport row.** A chevron beside the length readout
  hides the lane, the axis, the soundtrack and the speed pill, for more canvas
  once the cut is settled. The folded part stays mounted and is hidden by
  height alone, by transitioning `grid-template-rows` to `0fr`, because the
  frame loop reads the lane's playhead and would stop wrapping playback at the
  out point if the lane unmounted. `inert` keeps the handles and chips out of
  the tab order while they are out of sight. The state is the bar's own and is
  not persisted.

## Cuts

`lib/clip-cuts.ts` is the model. A cut is a stretch removed from the middle of
the clip, on the source's axis like the trim, the speed and the zooms, so
trimming never moves one and a speed change plays what survives faster rather
than shifting it. The cuts live in `clyp.tsx` beside the trim and are stored
with it under the edits key.

**The trim can only take time off the ends, and a screen recording's dead time
is rarely at the ends.** It is the page load, the fumble, the pause to read
what just appeared.

**Output time stops being source time shifted.** With a cut in the middle the
two are a piecewise map, and everything that has to agree about when a frame
lands goes through `toOutput`: the encode's video loop, both of its audio
paths, the preview's playhead, the duration readout and the size estimate.
Nothing recomputes it. `outputAt` is the same arithmetic against segments
already derived, for the encode loop, which calls it once a frame and must not
re-sort the cut list tens of thousands of times for one export.

- **Cuts are tidied on every change**: sorted, clipped to the trim, and merged
  where they overlap or touch. Two cuts that meet are one cut, since the join
  they produce is the same, and keeping them apart would leave a zero-length
  segment between them. So nothing downstream copes with an overlap, and
  `afterCuts` never needs more than one step.
- **A cut is shortened to leave `MIN_KEPT` rather than refused for it.** Unlike
  a zoom, which either fits or does not, a cut can always be made smaller, and
  on a two second clip a Cut button that does nothing is worse than one that
  removes what it can. It refuses only when a cut worth having would not fit:
  inside an existing cut, in a gap under `MIN_CUT`, or with less than `MIN_CUT`
  of removable picture left.
- **A drag clamps at the limit rather than being refused at it.** `placeCut`
  will not propose a cut that leaves less than `MIN_KEPT`, but one cut's two
  edges dragged to the in and out points reach the same place, so `longestCut`
  bounds each edge and `leavesEnough` backs it up in `updateCut` and
  `handleTrimChange` for every other route in. Refusing alone left the edge
  wherever the last accepted pointer sample put it, which on a coarse drag was
  most of a second short. Measured: the tail now slides to 5.800s of a six
  second clip and stops, leaving exactly the 0.200s minimum.
- **The kept block is drawn once per kept segment**, so a cut in the middle is
  a real gap with the rail already under the lane showing through it. That is
  what this lane's language already says: the kept clip is a block and what is
  cut is a rail. The first build painted a fill over the block and ringed it in
  brand, which read as two orange lines across a bar, and brand is the
  playhead's alone here.
- **A cut's edges are not `LaneEdge`s.** A trim handle is a full-height 12px
  pill, and a cut's edge in that shape reads as a second pair of trim handles,
  which is exactly what the first build looked like. `CutEdge` is a hairline
  mark, shorter than the lane, centred on the edge it moves, with a handle's
  width of grab area around it.
- **Playback steps over a cut, and only while playing.** A paused playhead at a
  cut's own start is showing the last frame that survives, which is the right
  frame, and a loop that moved it would fight a scrub. A scrub lands on a kept
  frame through `nearestKept`, taking the nearer edge so the playhead does not
  run ahead of the pointer. A frame step carries on the way it was going
  instead, since the nearer edge one frame into a cut is the frame just left
  and the button would appear dead.
- **A press on the bare lane deselects the selected cut.** Without it there is
  no way back to the Cut button, whose slot the selected cut's own controls
  take, so a second cut cannot be placed at all. Found by driving the real UI,
  not by reading the code.
- **Moving a trim handle re-clips the cuts to it**, so a cut dragged outside the
  range stops removing anything rather than removing time the export no longer
  covers.
- **The encode runs one pass per kept segment.** `sink.samples` seeks to the
  keyframe at or before its in point, so a cut is time the decoder never
  spends.
- **The streaming audio path carries a monotonic guard.** An audio sample is
  about 21ms and a segment boundary falls inside one almost always, so the
  sample straddling a join would be written twice, the second time at a
  timestamp the muxer has already passed. AAC needs its samples in order and
  not overlapping, so the later copy is dropped. What is lost is the tail of
  one sample at each join.
- **A mixed clip is read as one range per kept segment** and scheduled into the
  `OfflineAudioContext` at its own output time, which is what a context is for.
  All of them come off a single decoder: one `Input` per segment would hold
  that many decode states on the same forty megabyte Blob at once.
- **A laid soundtrack is scheduled once and plays through.** Its anchor moves
  with the frame it is anchored to, through `toOutput`, but the track itself
  does not jump with the picture. Music with a jump cut in it sounds broken,
  and a music bed over a cut is what every editor plays straight.
- A zoom region inside a cut plays nothing, the same as one outside the trim,
  and the rail on the lane above it says so.

Verified through the export, on a six second clip of one colour a second. One
cut of the blue second gives a 5.000s file of 150 frames reading red, green,
yellow, magenta, cyan, with the audio a continuous 440Hz across the join and no
silent window in it. Two cuts give 4.000s and 120 frames reading red, blue,
yellow, cyan. With a soundtrack that steps 440Hz to 880Hz at its own midpoint,
the step lands at the output second its anchor maps to. With no cuts, 6.000s
and 180 frames, unchanged.

## Undo

`components/use-edit-history.ts` is the history, and it covers the clip's
edits: the trim, the cuts, the speed, the zoom regions and a soundtrack's
placement. Cmd/Ctrl+Z and Cmd/Ctrl+Shift+Z, plus two buttons beside the
playhead clock.

**The history watches the state rather than being pushed to.** Every edit
already lives in `clyp.tsx` as ordinary state, and threading a `pushUndo()`
through every handler, every drag and every keyboard nudge is both invasive and
the kind of thing a later handler forgets. So the hook takes the whole edit
state as one value and notices when it changes.

- **A change is recorded only once it settles**, after `SETTLE_MS`. A drag
  rewrites the state every frame, and one entry per frame is a history nobody
  can walk back. The timer restarts on each change, so a drag of any length
  collapses into the one snapshot taken before it began. A pause mid-drag can
  split it in two, which costs one extra press and nothing else.
- **Style options are deliberately out.** They are sliders and chips dragged
  back as easily as forward, they persist separately, and folding them in would
  mean a press of undo sometimes moved the picture and sometimes changed a
  colour.
- **The soundtrack's file is out too, only its placement is in.** Undo moves
  where a sound sits, never whether there is one: holding a Blob per entry to
  bring a removed file back is not worth it, and removing one already confirms.
- **A new clip and a restored draft both reset it.** Neither is an edit to walk
  back from, and the defaults a restore replaces are not a state anyone asked
  for. `loadMedia` and `applyEdits` reach the reset through a ref, since both
  are declared above the hook that owns it.
- **Undo pushes the live state onto the redo stack, not the last committed
  one**, so an edit still inside its settle window is not lost by pressing undo
  during it.
- The buttons sit beside the clock rather than in the transport pill: that pill
  is playback and these are the edits. Measured after adding them, the pill's
  centre still holds the row's centre exactly from 1920px down to 380px, with
  no page overflow.

## Keyboard

Everything a pointer can do on the lanes, a keyboard can do. The bar is a
timeline, and a timeline that only answers a drag is a control half the
readers cannot use.

**One arithmetic, two consumers, the same split the export and the preview
make.** `shiftZoom`, `shiftCut` and `shiftSound` each take the instance, which
part of it is moving, and a distance in seconds, and return the moved instance
bounded and snapped. A drag passes the instance it started from and the whole
distance travelled. The keyboard passes the instance as it is and one step.
Neither has bounds of its own to get wrong.

- **Arrows move by one frame of the export, Shift by a second**, which is what
  the trim's own handles already did. `laneKeys` is the one handler behind all
  of them, so a zoom, a cut and a soundtrack cannot drift apart.
- **Delete or Backspace removes**, through the same confirm the X opens. Enter
  and Space select and deselect.
- **An instance's edges are sliders, not buttons.** They carry a value in
  seconds and an `aria-valuetext`, so a reader hears where an edge is rather
  than being told it is a button.
- **An edge is in the tab order only while its instance is selected.** Every
  edge of every instance would be a long walk past the controls beyond them,
  and an edge is about the instance being worked on. Measured on a clip with
  one zoom: five stops for the whole lane, the two trim handles included.
- **Alt with an arrow slips a soundtrack**, which is what Alt with a drag and
  the wheel already do. Home and End take it to either end of the clip.
- **The playhead follows the part being moved**, for the same reason a drag
  pauses and seeks: the frame under an edge is what decides where it belongs.

### Tab stops

**A set of related choices is one stop with the arrows inside it, never one
stop each.**

- **The background picker was sixty-four stops**, a wall between the panel's
  first control and its second that a reader not looking for a background had
  to walk. `RovingGrid` gives each family one stop, on the chosen swatch or
  the first, and the arrows move within it. Navigation is linear rather than
  by row and column: the grid is four columns at one width and eight at
  another, so a Down meaning "one row" would have to measure the layout to
  know what a row is and would be wrong whenever it guessed.
- **The chip pills are radiogroups.** `aria-pressed` on each chip said "four
  buttons, one of them down". A speed, a zoom level and a follow pace are one
  of four, and a radiogroup says so and brings the roving stop with it. Arrows
  move and choose in one press, which is the convention.
- A restored zoom's level is clamped to one the picker offers, since a
  radiogroup with nothing checked would have no tab stop at all.

Measured with a clip loaded: 46 tab stops for the whole page, against 109
before this.

### Shortcuts

| Keys | What |
| --- | --- |
| Space | Play and pause, from anywhere on the page |
| Cmd/Ctrl S | Download |
| Cmd/Ctrl Shift C | Copy the picture |
| Cmd/Ctrl C | Copy the selected zoom or cut |
| Cmd/Ctrl V | Paste it at the playhead |
| Cmd/Ctrl Z | Undo, Shift to redo |

**Cmd C never fires over a real copy.** Text the reader has selected is theirs,
and a field being typed in keeps its own undo stack, which is the browser's and
is about the text. Both are checked before the lane is.

**The clipboard is the app's own, not the system's.** Cmd C would otherwise
write JSON over whatever the reader had copied, and reading it back needs a
permission this does not deserve. It also means a paste cannot arrive holding
something from another site.

**One selection across the lanes.** A zoom and a cut could both be selected at
once, which made "the selected thing" ambiguous and had the copy shortcut
taking the wrong one.

## Speed

`speed` in `clyp.tsx` is the clip's playback rate, one of `SPEED_OPTIONS` in
`lib/video-export.ts` (1, 1.5, 2, 3), set from a chip pill in the trim bar's
bottom row. It is an edit like the trim and is stored with it. The preview plays
at it through `playbackRate`, and the export divides every timestamp by it, so
a 4 s clip at 2x is a 2.000 s file. Verified: 120 source frames at 30 fps
export as 120 frames at 60 fps over 2.000 s.

- **The clip's own sound is left out above 1x.** A browser offers no offline
  time stretch that keeps the pitch, and a buffer source at `playbackRate` 2
  doubles the pitch, which is worse than silence. So the export drops it, the
  preview mutes it so the two agree, the trim bar's clip mute is disabled with
  the reason in its tooltip, and the export modal shows a line in place of the
  switch. A hand-written WSOLA is the way to bring it back if it is wanted.
- **A soundtrack keeps its own tempo and its anchor.** `offset` stays on the
  source's axis, so trimming never moves the region and a speed change leaves
  its left edge on the same frame. `start` and `end` are on the track's own
  clock, which is also the output's, so on the lane the region spans
  `(end - start) * speed`. Every drag converts between the two: a lane distance
  is `by / speed` of track. The mix places the region at
  `(offset - trim.start) / speed`. Verified on a track that steps 440 Hz to
  880 Hz at 3 s: exported at 2x over 2 s, the last 0.35 s still reads 440 Hz,
  where a sped track would read 880.
- **A faster clip has less lane behind the anchor**, so the region's tail is
  cut to fit when the speed rises, in `handleSpeedChange`, and a track that
  arrives above 1x is cut on arrival, since `loadSoundtrack` is handed
  `duration / speed`. It is never drawn past the lane.
- **`clipSeconds` is the output's length**, so the toolbar, the modal and the
  size estimate all read the kept seconds over the speed. The trim bar's own readout
  stays in source seconds, since that is the axis its handles cut on. A frame
  step moves `FRAME * speed` of source, which is one output frame.

## Zoom

`lib/clip-zoom.ts` is the model and the arithmetic. A region is a stretch of
the clip on the source's axis, like the trim, a level from `ZOOM_LEVELS` (1.5,
2, 3), and a focus point as fractions of the picture, so it means the same
thing in the preview at any canvas zoom and in the export at any scale. The
regions live in `clyp.tsx` beside the trim and the speed and are stored with
them under the edits key.

Verified through the export, which is the only place it can be proved. A 2x
region aimed at a quarter in from the top left, on a 640x360 clip exported at
1x: the frame inside the region matches the source cropped to that quarter and
scaled at SSIM 0.82, where the plain source frame scores 0.43 and an untouched
frame scores 0.87 against its own source, which is the compression floor. A
frame outside the region differs from the source by zero around the marker's
position, so the marker never reached the file.

- **One arithmetic, two consumers.** `zoomAt` gives the scale and focus at an
  instant, with a cubic ramp of `ZOOM_RAMP` output seconds in and out, capped
  at half the region so a short one never overshoots its own end. The
  preview's frame loop sets `transform: scale(s)` on the `<video>` with
  `transform-origin` at the focus. The worker draws the rectangle `sourceRect`
  gives for the same state into the same box. Scaling about a point inside the
  picture always covers the box, so nothing is left uncovered and neither side
  clamps anything.
- **The video sits in a box of its own.** The box carries the radius, the
  shadow and `overflow-hidden`, and is what the export measures, so the
  picture grows inside its own corners and a transform on the video moves
  nothing the composite is aimed at.
- **The focus marker sits inside the box and is filtered out of the raster.**
  A fraction of the box is a fraction of the picture, so it needs no measuring,
  which is why it is inside the frame at all. It is counter-scaled by the
  canvas zoom so it stays one size on screen. While it is being dragged the
  preview shows the plain picture, so the point is placed on the picture rather
  than on a moving enlargement of it. Arrow keys nudge it by 2%, Shift by 10%.
- **The lane is the soundtrack's geometry.** Regions are blocks on a lane
  under the picture's, labelled with their level, dragged by the body and
  resized by the edges, snapped to the frame grid and bounded by their
  neighbours through `roomFor`, so two can never overlap. A press selects a
  region and seeks into it when the playhead is outside, since a marker for a
  zoom nobody can see is a dead control. A second press on the selected one
  without moving, or a press on the bare lane, deselects.
- **The bottom row's four actions are one recessed pill of glyphs.** Add a
  soundtrack, add a zoom, cut, and suggest zooms were four labelled buttons,
  and with a following zoom selected the row also carried a level pill and a
  pace pill and ran past the panel. Each is a single verb, so each is a
  tooltip rather than a label. Measured at 1440px: 334px with nothing selected
  against about 620px before, and the worst case is 862px on one line where it
  used to wrap.
- **The actions no longer swap out for the selected instance's controls.** The
  swap kept the row's width down, but it also meant a second zoom could not be
  added while the first was selected, and the same for a cut. The old note
  about the level chips and the speed pill reading as one control still holds:
  the two are at opposite ends of the row with the pace pill between them.
- **The selected region's level and remove take the add button's slot** in
  the bottom row, and give it back on deselect. The first build gave them a row
  of their own between the lanes and the axis, with a sentence of hint beside
  them, and the bar was five rows tall with its ruler pushed away from the
  lanes it measures. The slot keeps the row count fixed and keeps the level
  chips off the right side, where they would sit beside the speed pill as two
  runs of "2x" that read as one control. The hint is the marker's tooltip.
- **A region is not bounded by the trim.** Like a soundtrack, it lives on the
  file's axis, so trimming never moves or cuts it. One in the cut-away part
  plays nothing and is drawn over the rail there, which says so.
- **Adding one lands at the playhead**: the default two seconds from there, or
  what is left before a neighbour or the end. Only when less than the shortest
  region is left is it pulled back to fit, since a press means "from here"
  whenever that is possible. Inside an existing region there is no room, and
  the button says so with a toast rather than doing nothing.
- **Removing one confirms first**, the same as a soundtrack: a region is four
  numbers and a point that took a minute to place.
- **Speed plays a region faster rather than moving it**, since both are on the
  source's axis. The ramp is in output seconds, so it feels the same at 2x.

### Following the action

A region can follow instead of holding its aim. In one line: the app never
sees the cursor. `lib/motion.ts` shrinks each frame to a 160px grid, finds the
pixels that changed since the frame before, takes their centre, and smooths
it. Anything that changes on screen pulls it, which for a screen recording is
the cursor, the typing, and the menus.

- **The whole clip is read once, when asked, and never again.** The read
  decodes every frame, which makes it the one heavy job in the editor:
  measured at 320 frames a second for 720p, so a ten minute clip is about a
  minute and 1080p roughly twice that. The first press of the follow toggle
  opens a dialog that says what happens, that it stays on the device, and how
  long it will take, from `estimateMotionSeconds` scaled off that measurement.
  Progress shows on the toggle's label and spinner. The result is kept for the
  session and stored under the `motion` key, so a reload never asks again, and
  nothing afterwards starts it: not a drag, not a second region. The first
  build read a span per region, again on every drag of its edge, and did not
  cancel a read a drag had superseded, so nudging a long region three times
  had three decodes running at once. Only a clip change cancels now, through
  `MotionRead.cancel`, and it does so because the answer would be about the
  wrong picture.
- **The grid is 160px, not 64.** A 24px cursor on a 1440px capture is under 3px
  at 160 and under a pixel at 64, where it vanished into the floor below.
  Measured on a 24px square crossing a 640px frame: 0.08% to 0.17% of the grid
  changes per frame at 160, against 0.17% to 0.35% at 64, which straddled a
  0.2% floor and held most frames. The first build had 64 and followed nothing.
- **Two kinds of frame say nothing and are held.** Under 0.03% of the grid
  changed, about four pixels, is a still frame with nothing to point at. Over
  35% is a scroll or a transition, and the centroid of everything is the middle
  of the picture, which is where nothing is. Both keep the last position.
- **The window follows the action the way an operator follows a subject:
  roam, wait a beat, then ease after it.** The first build glued the window to
  the action and every wiggle of the mouse moved the picture. The second let
  the action roam a comfort zone and moved the window by exactly enough to keep
  it at the zone's edge, which stopped the wiggles but made every pan start and
  stop dead. `followPath` now runs two things over the smoothed track. The
  target moves only when the action has been outside the middle 60% of the
  window (the pace's `zone`) for 0.15 s (`dwell`), so a flick to a button and back moves
  nothing. The window's centre glides toward the target through a critically
  damped spring with a 0.3 s time constant (`glide`): it starts slowly, moves,
  and settles with no overshoot, a step landing in about 1.2 s. Underneath, the
  centre is dragged along outright whenever the action would get further than
  70% of the window's half-extent from it (`KEEP`), since a flick across the
  screen outruns any glide and the one thing worse than a sudden pan is the
  subject leaving the frame. The path is pure in the track, memoised on it by
  scale, and both the preview and the export read it through `windowAt`, so
  they agree. The smoothing on the action itself is 0.1 s now, since the glide
  does the calming and every tenth of a second there is a tenth the action
  leads the point being kept in frame.
  Verified through the export on a square crossing a 640px clip at a quarter of
  the frame a second, which never pauses and so is the worst case for a glide:
  it stays in frame the whole way.
- **The window aims at where the action is about to be.** The whole track is
  known before anything is drawn, so the operator here knows the choreography:
  the target reads the action `lookahead` seconds ahead and the window arrives
  with the action rather than after it. A critically damped spring trails a
  moving target by twice its time constant, so the lookahead is set near that
  and cancels the trail on a steady mover. The hard bound still reads the
  present action, since that is what has to stay in frame. Measured on the
  square that never pauses: the pan starts 0.2 s earlier and the square rides
  2% nearer the centre. The gain is small there because that clip is all bound
  and no glide, and it is largest where a real recording lives, on a cursor
  that moves and stops.
- **A click pins the action, and is kept.** A click leaves a mark a cursor's
  travel does not: a sudden, compact change, a button's pressed state, a focus
  ring. A
  frame where at least 0.3% of the grid changed, at least three times the
  median of the fifteen frames before, with a root mean square spread under a
  fifth of the grid, is a click, and the action is pinned to its centre for a
  second or until the centroid moves a fifth of the picture away, which is the
  cursor leaving. The spread is what keeps a scroll out, and the boost is what
  keeps a video playing in a tab out, since that raises the baseline. Verified
  on a square that pauses beside a two frame flash: the action snaps to the
  flash and holds until the square moves on.
- **Three paces, chosen per region.** `FollowPace` is Calm, Balanced or Quick,
  a table of zone, dwell, glide and lookahead in `PACES`, offered as a second
  chip pill in the level slot while the region follows and stored with the
  region. The right one depends on the recording, a slow walkthrough wanting
  Calm and a quick demo wanting the window to keep up, and the constants were
  set by feel on synthetic clips, so this is the knob a real recording gets.
- **`centredOn` turns the window's centre into a focus, clamped to the
  picture.** A focus is the point that holds still while the picture grows, so
  a focus at the centre would not centre it. The window's left edge is
  `focus.x * (1 - 1 / scale)`, so the focus that centres a point is the point
  pulled in by half a window and rescaled, and at the picture's edges the clamp
  holds the window against the edge.
- **During the ramp the focus can sit at a corner.** A window that is 97% of
  the picture cannot centre a point near its edge, so `centredOn` clamps and
  the picture grows from the nearest corner until the window is small enough
  to centre it. It is continuous in the scale, so nothing jumps.
- **The marker becomes a readout while a region follows.** It shows where the
  action is, projected through the zoom since it sits beside the video rather
  than inside its transform, written every frame by the same loop that sets the
  transform, takes no input and lets pointer events through. `region.focus` is
  the fallback for a stretch with no motion, and the aim again if follow is
  switched off.
- The toggle sits in the level slot, pressed while following. Switching off is
  free, switching on is free once the clip has been read, and the first time
  asks.

### Suggested zooms

`suggestZooms` in `lib/clip-zoom.ts` proposes regions from the motion track.
The clicks the pass found each get a candidate around them, 0.6 s before to
1.9 s after, weighted twice. Runs where the action stayed within 12% of the
picture for at least 1.5 s, a form being filled or a menu being read, each get
one too. Candidates that overlap or come within 0.4 s merge, up to eight
seconds, and anything over an existing region is dropped, since whoever placed
that region does not need it suggested. The best six show, in time order.

- **They are ghosts on the zoom lane**: dashed, dim, with a plus, and a press
  adds one as a following region, selected, snapped to the grid, aimed at the
  click or the dwell's centre as its fallback. Recomputed as regions change, so
  accepting one takes it off the lane by itself.
- **Suggest zooms in the bottom row shows and hides them.** The first press
  reads the clip's motion through the same dialog the follow toggle opens,
  with its first clause changed to say what for. A clip with nothing to suggest
  says so in a toast and leaves the toggle off, whether the read had already
  happened or has just finished.
- **The clicks are part of the stored track**, three floats each, beside the
  samples. A track stored before clicks were read comes back with none and
  follows as before but suggests from dwells only.
- Verified on the square that pauses beside a two frame flash: one suggestion
  covering the click and the pause, accepted into a following region. On the
  square that never stops, no suggestion and the toast.

## Soundtrack

A sound file laid over the clip, on its own lane under the picture's.
`lib/waveform.ts` reads it, `components/trim-bar.tsx` places it, and
`lib/video-export.ts` encodes it in place of the clip's own audio.

**Three numbers place it, and they are the model a timeline editor uses.**
`offset` is where the region's left edge sits on the clip's axis, `start` and
`end` are the slice of the file it plays. Dragging the body moves `offset`
alone. Dragging the left edge moves `offset` and `start` together, so the sound
stays anchored where it was while the edge comes in. Only the right edge changes
the region's length on its own.

- **The lane shares the video lane's axis and the same `at()` geometry**, so
  where the sound starts is read against where the clip does rather than
  described in a number. Both its edges snap to the same frame grid.
- **Scrolling inside the region slips the sound through it**, which is the
  other half of positioning: the region's place on the clip and its length are
  usually right before the part of the track behind them is. `start` and `end`
  move together, so the window holds still and a different stretch of the file
  plays through it. Alt-drag does the same for a hand that would rather drag,
  and a double-click puts the file back to its own beginning without moving the
  region.
  - **The wheel listener is non-passive and takes the gesture**, since the
    point is to slip rather than to scroll the page it sits on. It binds once,
    off refs, because the soundtrack is rewritten on every frame of a drag.
  - **Movement too small to be a frame is kept, not dropped.** A trackpad's
    deltas each round to nothing otherwise, and scrolling appears to do
    nothing at all. The delta is scaled to the lane, so a wheel of so many
    pixels slips what a drag of so many pixels would.
  - **One step is applied to both ends, never two snaps**, or the region
    changes length by a frame on the way through.
  - Verified through the export, which is the only place it can be proved: a
    two second region left where it was, slipped five seconds into a track that
    steps 440 Hz to 880 Hz at its midpoint, exports 880 Hz. And with an asset
    whose envelope varies, an Alt-drag changes the drawn shape while the
    region's box holds to the pixel, and a double-click returns it.
- **All three drags keep the region inside the clip.** A part hanging off
  either end cannot be heard, so drawing it outside the lane says the control
  is broken rather than that the sound runs on. The body is bounded by
  `duration - length`, the head by whichever of the file's start and the clip's
  it reaches first, and the tail by whichever of the file's end and the clip's
  comes first. Verified against the hard case, a 12 s track on a 3 s clip:
  dragged hard in every direction, the region never leaves the lane, and the
  head still trims the front with the sound behind it staying put.
- **The axis row is `h-5`, which is what it occupies**: a 4px tick, 2px of gap
  and an 11px label. At `h-4` the numbers painted outside their own box, so the
  margin below could not see them and the control under the axis sat against
  the labels however much it was given. Measured after: 13px of clear space.
- **It mixes with the clip's own sound rather than replacing it**, through
  `lib/audio-mix.ts`. Replacing was the first build and it is not what "music
  on top of it" means: a recording that already talks and a track laid over it
  are two things to hear, and each has to be silenceable on its own.
  - **`OfflineAudioContext` does the summing, not hand-written PCM maths.** Two
    files rarely share a sample rate, a 48kHz recording under a 44.1kHz track
    being the ordinary case, and resampling by hand is where that kind of code
    goes wrong. A context resamples whatever buffer it is handed, schedules by
    time rather than by sample index, and sums its inputs.
  - **What it is handed is only the part that will be heard.** The first
    version read each file with `decodeAudioData`, which decodes all of it: a
    30 minute track laid over a 20 second clip decoded 30 minutes, measured at
    346 MB, twice over, for four seconds of sound. `readRange` pulls the range
    through a mediabunny sink instead, so the file's own length stops mattering
    and only the export's counts. The buffers are left at their sources' own
    rates, since the mixing context resamples anyway and doing it twice is one
    loss of quality for nothing.
  - **Mixing is capped at `MAX_MIX_SECONDS`, three minutes.** Three buffers are
    live at the peak, the two ranges and the output, each costing the export's
    length at 384 KB a second, so three minutes is about 207 MB and the ten
    minute clip cap would be 690 MB. Past it the modal asks for one of the two
    to be switched off rather than letting the tab run out of memory
    mid-encode.
  - **So the export has two audio paths.** A laid track means a mix, which is
    a whole decode of both sources into one buffer on the main thread, handed
    to the worker as planar floats and written in one-second samples. The
    clip's own sound alone is the common case and still streams sample by
    sample inside the worker, costing no memory beyond the frames in flight.
    The mix path also needs none of the silence padding, since a buffer of the
    export's own length has the quiet inside it rather than as a gap.
  - **A track placed before the in point is skipped into, not shifted.** The
    schedule starts at zero and reads that much further into the file, so what
    plays at the first frame is the part of the track that lines up with it.
- **The gap before it is filled with real silence, not left empty.** An empty
  stretch is not a quiet one: the track's own `start_time` carries the offset,
  and a tool that ignores it plays the music from the top of the file. Measured
  with the region at 5.2s: `start_time=5.066667` and 3.97s of samples, and a
  straight decode put the music at zero. Filled, the track starts at 0.000 and
  a decode finds the music at 5.5s to 8.5s where the region is. The silence is
  written from the first real sample, since that is the first point the source's
  rate and channel count are known.
- **The waveform is decoded once per file and drawn to a canvas.** Everything
  after that draws from a 2048-bucket array, so dragging the region costs
  nothing. The state is keyed on the file rather than on the soundtrack, because
  dragging rewrites the placement on every frame and re-reading a whole track
  for each of those would be the most expensive thing in the app by orders of
  magnitude.
- **A bucket keeps its loudest sample, and the peaks are normalised to the
  file's own ceiling.** An average over a few thousand samples of music tends
  toward a flat band, which is a picture of nothing, and absolute amplitude
  draws a quietly mastered track as a flat line: the test asset peaks at 0.119,
  which on a 28px lane is three pixels of shape. The lane is for finding a beat
  to line the picture up against, not for judging level.
- **`AudioContext` is closed after every decode.** Each holds a hardware audio
  thread and a browser allows only a handful, so one left behind per upload
  eventually throws.
- **The waveform decodes at 8kHz, the lowest a browser allows.**
  `decodeAudioData` resamples to its context's rate and this reads a whole
  file: the 30 MB soundtrack cap is over half an hour at 128kbps, and at 48kHz
  that measured 346 MB and 4.5 seconds on the upload of one track. At 8kHz it
  is 58 MB and 1.4 seconds. Nothing downstream cares, because 2048 buckets over
  half an hour is one bucket a second and there is no detail at that scale for a
  higher rate to carry.
- **The preview's `<audio>` is driven, never played on its own.** The video is
  the clock and the sound is placed against it, corrected only past 120ms of
  drift: writing `currentTime` every frame is a seek every frame, which stutters
  far worse than the drift it would fix. A refused `play()` is silence rather
  than a broken preview, since autoplay can be blocked until the page has been
  interacted with.
- **It lives outside the export ref.** What the export hears comes from
  decoding the file, so an element inside the frame would only be something for
  `html-to-image` to trip over.
- **A track that has just arrived does not start playing.** The canvas
  autoplays, so without that the whole of a dropped file starts at whatever
  volume it was mastered at, from wherever the playhead happened to be. Pausing
  hands the first press back to the reader, which is also the position they
  want to hear it from. It is keyed on the file rather than on the soundtrack,
  so moving or slipping the region does not keep stopping playback, and a
  reload with a stored track comes up paused for the same reason.
- **One mute control per source, and one export switch per source.** A clip
  can arrive with sound and then have music laid over it, and since those now
  mix, a single mute could only silence both, which is not the question being
  asked. Each names what it silences, so two adjacent glyphs are never
  ambiguous, and the modal's switches are labelled "The clip's own sound" and
  the track's filename rather than one "Keep the audio" that means nothing once
  there are two.
  - The editor's mutes are listening only. The modal's switches are what gets
    encoded. Muting to concentrate while cutting must not quietly change the
    file.
- **The preview starts audible, and gives up its sound rather than its
  picture.** Dropping a clip that came with sound and hearing nothing is the
  wrong default, and a drop is a user gesture, so a browser allows playback
  with sound straight after one.
  - **This is why the element carries no `autoPlay`.** The attribute offers no
    way to hear a refusal: a blocked autoplay simply does not play, which shows
    as a frozen first frame. Playback is started from an effect instead, and a
    rejection mutes and retries. Verified under Chrome's strict
    `document-user-activation-required` policy, which is harsher than the
    default: a drop plays with sound, a reload comes back muted and playing
    rather than frozen, and the control unmutes it from there.
- **A press flashes the glyph over the picture, the way a player does.** A
  circle and a filled triangle or two bars, in for a moment and out, which is
  what says the press landed when the only other feedback is a small button in
  the bar below.
  - **It renders outside the export ref**, so it can never be serialized into a
    frame, **and outside the zoom transform**, so it is the same size whatever
    the canvas is scaled to. The box it sits in is the frame's own footprint,
    so centring there centres on the picture: measured, the frame's centre and
    the video's are the same x and 9px apart in y, which is half the title bar.
  - **It carries its own colours.** It sits over an arbitrary gradient and an
    arbitrary video, and no surface token can be read against both.
  - **The glyph is filled, not stroked.** A transport glyph is a solid triangle
    and two solid bars everywhere it appears, and at 28px an outline reads as a
    sketch of the control rather than the control.
  - **The animation is on the circle, never on the layer.** On the layer it
    scaled a frame-sized box to 1.3, and a transform's overflow counts toward a
    scroll container's scrollable area, so every press grew the canvas a
    scrollbar in fit mode, which is the one mode whose whole job is not to have
    one. Verified across the full 620ms at four window sizes: zero overflow in
    both axes.
  - **It is keyed on a counter, because a CSS animation only runs on the frame
    it is attached.** A second press has to replay it, so the id changes, React
    remounts the element, and the keyframe starts again. `onAnimationEnd`
    unmounts it.
  - **What it shows is read before the element is touched, and captured rather
    than read inside the `setState` updater.** React runs an updater when it
    processes the update, which is after `pause()` has already flipped
    `video.paused`, so the flash showed the glyph for the state it had just
    left. Verified by shape: pausing draws two rects, playing draws one path.
  - The element carries `opacity: 0` of its own, so under reduced motion, where
    the animation does not apply, nothing appears at all. That is the right
    answer for feedback that decorates a state the transport already reports.
- **Play and pause is one rule in `clyp.tsx`, asked for from three places:**
  the transport button, the spacebar, and a click on the picture itself, which
  is what every player does. It lives with whoever owns both the element and
  the trim, since a clip parked at its own out point plays nothing and pressing
  play there has to start it over.
  - **The tolerance on "parked at the end" is a frame and a half, not one.**
    Stopping parks the playhead a frame short of the out point and the element
    snaps that to its own nearest frame, which can land just under an
    exactly-one-frame test. The clip then plays for a few milliseconds, hits
    the out point and stops again, which looks like a dead button.
- **A soundtrack no longer mutes the video.** It did while a track replaced
  the clip's audio, because the preview had to agree with what the export would
  produce. They mix now, so both play unless one is silenced.
- **The mute control is the preview's, not the export's.** A track arriving at
  full volume with no warning is startling, and the export is unaffected either
  way.
- **Removing a track confirms first.** The X for it sits two pixels from the
  mute button and used to fire on the press, revoking the object URL, so the
  file and where it had been placed were gone with nothing to bring them back.
  Clearing the clip has always confirmed and this is the same kind of loss.
- **A dropped sound file is routed on the file rather than on what the canvas
  holds**, so dropping a track never clears the clip it was meant to go with.
  Paste works the same way.
- **The file and the placement are stored apart**, the same split the trim
  makes: the file is an asset the user supplied and lives beside the clip's
  Blob, where it sits is an edit and lives under the edits key, so a drag
  never rewrites either Blob.
- **The soundtrack is restored from inside the media's own callback.**
  `loadMedia` clears it, since a soundtrack placed against a clip that has been
  replaced means nothing, so run side by side the two raced and the soundtrack
  lost about half the time.
- The cap is 30 MB, on size alone. Nothing here decodes it whole except the
  waveform pass, which is bounded by that.

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

**A fitted frame lands on exactly the space available**, since that wrapper is
`min-h-full` with its own padding and the outer box is the scaled footprint, so
the two agree to the pixel and nothing absorbs a fraction. `offsetWidth` and
`offsetHeight` round, so `FIT_SLACK` gives the fit one pixel of tolerance. A
sweep of 176 window sizes at both pixel ratios found no case that needs it,
which is the reason it is there rather than a reason to drop it: the guarantee
that Fit shows the whole frame should not rest on that staying true.

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

**The clip's edits are stored under a key of their own, `edits`, in the same
IndexedDB store.** The trim, the cuts, the speed, the zoom regions and the
soundtrack's placement are a few hundred bytes. They were not stored at all at first,
because the only record held the Blob and rewriting forty megabytes on every
drag of a handle was out of the question. A second key costs nothing to
rewrite, so the edits follow every change on a 300 ms debounce, which a drag
settles well inside, and the Blob is never touched.

- **The record names the clip it belongs to**: the file's name, size and
  duration. A restore applies it only when the restored clip matches on size
  and duration, so edits made on one file never cut a different one, and a
  stale record after a new drop is simply overwritten.
- **It is applied from inside the media's restore callback**, after
  `loadMedia`, which resets every edit for a new clip and would otherwise wipe
  what was just restored. The soundtrack's placement is applied inside the
  soundtrack's own restore for the same reason, clamped to the track's length.
- **Everything is clamped to the restored duration and snapped to the frame
  grid on the way in.** A record that disagrees with its file can never cut
  past the end. A speed outside `SPEED_OPTIONS` falls back to 1, and the cuts
  are tidied against the restored trim, so a stored overlap cannot survive a
  reload. A record written before cuts existed reads back with none.
- **A restore resets the undo history.** Putting a draft back is not an edit to
  walk back from. See Undo.
- An image has no edits and clears the key. Removing the clip clears it. The
  fold and the selected zoom are view state and are not stored.
- **The clip's motion track has a key of its own, `motion`.** It is derived
  from the file rather than an edit on it, but reading it is the one heavy job
  in the editor and it was asked for once, so it comes back rather than being
  asked for again. Three floats a frame, under half a megabyte for the longest
  clip allowed, matched to the clip the same way the edits are.

Reading happens on the client only, inside a promise rather than the effect
body. Seeding state from storage during render would break hydration, because
neither store exists on the server. Nothing is written until the restore has
run, or the first render would overwrite the draft with defaults.

**`restored` flips only once the media is in place and its edits applied**,
from inside the loader's callback. It used to flip as soon as the record was
read, while the file was still being probed, and every persist effect then ran
one pass against the defaults: the media effect deleted the Blob and rewrote
it a moment later, forty megabytes for nothing on every reload, and the edits
effect deleted the edits before the restore had read them, so the first
version of the edits store restored nothing. A load that fails toasts and
flips it anyway, so the session still persists what comes next.

Every storage call swallows its own errors and reports absence. A private
window and disabled site data are both normal, and neither should break the
editor.

## Responsive behaviour

Below `lg` the two panels stack and the page scrolls. Above it the app fills
the viewport and each panel scrolls on its own.

**The canvas panel is a container, and the toolbar lays out against the
panel's width, not the viewport's.** At 1024px the panels sit side by side and
the canvas panel is 608px, narrower than a phone in landscape, while the old
viewport rule still thought it was wide: Download was clipped off the panel's
edge and the panel scrolled sideways, up to about 1170px. Below `@2xl` (42rem
of panel) the toolbar wraps, the meta takes the first row and the zoom cluster
and the export actions the second. Without the wrap the action group is 483px
wide and Copy and Download fall off entirely, clipped by the panel rather than
reachable by scrolling.

Keyboard shortcut hints show from `@3xl` (48rem of panel). Below that the
actions fit only without them, and a phone has no command key anyway.

The trim bar's transport row is three columns, and below `@sm` (24rem of
panel) it is two lines: the clocks on the first, the pill centred on the
second, since a 296px panel cannot hold a clock, five buttons and a duration
with its chevron side by side.

The trim bar's bottom row wraps in two stages: the row itself, so the speed
pill drops under the soundtrack and zoom controls below about 430px, and the
right cluster inside it, so at 320px the mutes drop under the speed pill
rather than pushing the row past the panel.

## Scroll edges

`ScrollFade` fades the edge a scroll region continues past, using `mask-image`
on the scroller rather than an overlaid element, so it works over any
background and adds no node. Each edge fades only when there is content that
way: a permanent fade would dim the first heading before any scrolling, and a
fade at a boundary already reached says nothing.

## Frame shape

`aspect` in `StyleOptions` is a target shape for the whole frame, and `auto`
is the frame sizing itself to the artwork plus its padding, which is what it
always did. The presets are the shapes a post is rendered at rather than a
general list: a square for a grid, 4:5 as the tallest a portrait post survives
uncropped on most feeds, 16:9 for a slide or a video embed, 9:16 for a story.

**Padding stops being the whole margin and becomes the least of it.** The frame
grows on whichever axis is short of the ratio and never shrinks, so the artwork
is never scaled or cropped to fit a shape and the gradient fills whatever the
growth opens up. `aspectBox` in `lib/style-options.ts` is the whole
calculation.

- **The box is set in JS, not with an `aspect-ratio`.** CSS solves that against
  one axis and stops: with the content wider than the target, `min-height` wins,
  the ratio is simply lost, and nothing re-grows the width to restore it.
- **The artwork is measured rather than taken from `dimensions`.** That is the
  media's own size and knows nothing about the title bar above it, which is part
  of what has to fit inside the shape. A second `ResizeObserver` reads the
  artwork wrapper, and it cannot feed back: the box only ever grows past the
  artwork, so the artwork's own `max-w-full` never bites.
- **Nothing else needed changing, which is the point of where it sits.** The
  frame's own observer measures whatever it renders as, so zoom and fit follow.
  The video composite measures the artwork's box off the DOM, so the clip still
  lands centred. The encoder probe already refuses a shape that makes the frame
  too large, and the size estimate is a function of output pixels.
- **A shape is not applied with nothing loaded.** The upload card is a fixed
  card rather than the artwork, so shaping the frame around it would preview a
  frame nobody is going to export.

Verified on a 1280x720 clip: 1408x1408 at 1:1, 1408x1760 at 4:5, 1561x878 at
16:9, 1408x2503 at 9:16, every one exact, with the canvas never overflowing.
On a 886x1918 clip the other branch runs and the width grows instead: 2076x2076
at 1:1 and 3691x2076 at 16:9. The exports match, a 1408x1408 MP4 and a
1028x1285 PNG.

## Window chrome

`windowChrome` in `StyleOptions` is `none`, `mac` or `browser`, and
`WindowNavbar` in `components/window-navbar.tsx` renders the two bars. Both
share the traffic lights and the light or dark tone. The browser bar adds an
address field filled from `windowUrl`, centred with equal side columns and
capped at `max-w-md`, because a field the full width of a 1280px window reads
as a search box. The lock icon appears only when there is an address. Either
bar takes the media's top corners.

The field's tones are fixed colours inside the artwork, the same exception the
lights already are. The Address row is disabled unless the browser bar is on.

**The bar is sized from the media's width, not in CSS pixels.** The frame is
laid out in the picture's own pixels, so a fixed 40px bar was a hairline with
unreadable text on a 2250px capture and only looked right on a 640px clip. Every
measure is a 1x macOS metric (a 28px bar, 12px lights) multiplied by the width
over 1280, never below 1x and capped at 4x, so a 2560px Retina capture carries
its bar at 2x, which is how the capture itself would have carried one, and a
640px clip gets the bar a 640px window would have had. The width is
`dimensions.w`, which is the rendered width because the frame never shrinks the
artwork.

## Caption

`caption` in `StyleOptions` is a line of text beside the artwork.
`captionPosition` puts it above or below, `captionSize` is its font size in
px, and `captionDark` flips the text from light to dark. It renders inside the
frame subtree, so both exports bake it through the same raster as everything
else and the video composite needs no change. Verified in an exported frame:
the text is Inter, at the size set, at the picture's width.

- **It is part of the measured artwork.** The `artworkRef` wrapper holds the
  bar, the picture and the caption, so a target shape fits all three. The play
  flash centres on the frame, so with a caption on one side it sits half the
  caption's height off the picture's centre.
- **It takes the picture's width.** The caption is `w-0 min-w-full`, which
  contributes nothing to the wrapper's intrinsic width and then resolves to the
  whole of it, so a long caption wraps at the picture's edge instead of
  widening the frame to its own unbroken length.
- **The size is in media pixels**, like the padding, because the frame is.
  `CAPTION_SIZE` runs 12 to 120 px. The gap to the picture is three quarters of
  the size, so a title does not sit tight while a small caption floats.
- **The rows under the text follow it**, disabled while there is no text, the
  way the grain amount follows the grain switch.
- Light text carries a faint shadow for pale gradients. Dark text carries none.

## Corner radius

Radii are numbers in px, not Tailwind classes, so individual corners are
addressable. `cornerRadius(radius, corners, only?)` in `lib/style-options.ts`
builds the shorthand. When a window bar is on it takes the top corners
(`only: "top"`) and the screenshot takes the bottom ones, so the two always
meet flush.

## Adding a control

1. Add the field to `StyleOptions` in `types/screenshot.ts`.
2. Add its default to `DEFAULT_STYLE` in `components/clyp.tsx`.
3. Render it in `components/style-controls.tsx` through `SliderRow`,
   `SizeRow`, `ChoiceRow`, `ToggleRow`, or `TextRow`. Do not hand-roll another
   row shape. `ChoiceRow` is generic over its value, so a field typed as a
   union stays one through the control.
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

**Every style change inside the frame eases over 200 ms ease-out, half the
gradient cross-fade.** A radius chip, a shadow chip, the padding slider, a
target shape, the bar's tone and corners, the caption's size and colour, and
the grain's amount all transition from a to b rather than snapping. The
background swap keeps its 400 ms because it is the one change big enough to
carry it; on a radius chip that length read as lag. `.artwork-ease` in
`globals.css` carries the timing as
`--tw-duration` and `--tw-ease`, which every `transition-[...]` utility reads,
so the number lives once and reduced motion zeroes it once. Each element names
only the properties it eases: `all` would also animate a new picture's size
out of the previous one's. Two things still snap by nature: a shape change from
or to Auto, since Auto has no explicit size for a transition to run from or to,
and a window bar appearing, since it mounts. Giving Auto an explicit measured
size would fix the first and break more: a caption or bar switching on would
then be clipped for 400 ms while the frame caught up with the artwork.

The grain layer stays mounted at opacity 0 when grain is off, so switching it
on eases too. An overlay blend at opacity 0 is a no-op in the export.

## Build gate

`pnpm check` runs typecheck, lint, test, and build. A green run is the gate for
any push. `pnpm test` alone runs the unit specs. `next dev` regenerates
`AGENTS.md`, so commit it with your work rather than reverting it.

`pnpm e2e` is separate and is not in the gate: it needs a browser and a server,
and the gate is meant to be fast enough to run on every change. Run it before a
push that touches the export, the lanes, or anything a reader reaches by
keyboard.

### The browser suite

`e2e/` drives the running app and reads back what it wrote. It exists because
every bug the unit specs did not catch was found this way, never by a failing
assertion: a transparent background that still showed the old gradient, a cut
that could take the whole clip, a Cut button with no way back to it, a copy
that took the wrong selection.

- **It runs against a production build, not `next dev`.** Three separate
  failures came from the dev server: it holds a single-instance lock per
  project, so a second run cannot start one and a crashed one leaves the lock
  behind; it recompiles when a file changes, which aborted a navigation
  mid-test when an unrelated edit landed; and it costs several hundred
  megabytes more. A build does not move under the suite.
- **An exported file is decoded in the browser, never by a command line tool.**
  An MP4 goes into a `<video>` on a blank page and a PNG through
  `createImageBitmap`, so the suite needs nothing installed beyond the browser
  it already drives. ffmpeg regenerates the fixtures and is never needed to
  read an export.
- **The fixtures are checked in, not generated.** `e2e/fixtures/README.md`
  carries the ffmpeg command behind each one, and the assertions quote their
  exact contents. `clip.mp4` is one flat colour a second over a continuous
  440Hz tone, which is what makes a cut provable: the colours that survive say
  what was removed, and a silent window says a join dropped samples.
- **One worker, in order.** The exports encode video, and the suite is small
  enough that determinism is worth the wall clock.
- **A spec asserts a file or a behaviour, never a screenshot.** There is no
  visual baseline to churn.

The specs rot when an accessible name changes, which is the point: five
throwaway scripts broke the moment `Cut` became an icon and the chips became
radios, and that is a change worth being told about.

Two things the suite has to wait for, and both are the app being right rather
than slow. `settleArtwork` waits out the artwork's 420ms fade before any
export, since a spec can reach the modal inside that window and bake a
half-faded picture, which reads as alpha 253 on a transparent background and
is invisible on any other. `settle` waits out the undo history's window, since
two edits inside one are deliberately one entry.

`expectLength` allows the tail an exported clip's audio adds. `video.duration`
is the container's, which is the longest track, and AAC frames are 1024
samples, so a carried soundtrack runs up to about 90ms past the last picture.
A clip past 1x has no sound of its own and lands exactly on its length.
