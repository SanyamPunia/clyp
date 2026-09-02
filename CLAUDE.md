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
  pending, since Escape and the backdrop stay blocked. The signal is checked
  once per frame in the sample loop and once after the raster, which is the
  earliest a cancel during `toPng` can be heard. An `AbortError` closes the
  dialog and says nothing, because a cancel is not a failure.
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
  the chrome is still rasterizing, which is one `toPng` call with nothing to
  read inside it. Anything above zero is the encode, reported off the end of
  each written frame so the first report is not also zero.
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
  - **`OfflineAudioContext` does the mixing, not hand-written PCM maths.** Two
    files rarely share a sample rate, a 48kHz recording under a 44.1kHz track
    being the ordinary case, and resampling by hand is where that kind of code
    goes wrong. A context resamples on `decodeAudioData`, schedules by time
    rather than by sample index, and sums its inputs, which is the whole job.
  - **So the export has two audio paths.** A laid track means a mix, which is
    a whole decode of both sources into one buffer and goes out through
    `AudioBufferSource`. The clip's own sound alone is the common case and
    still streams sample by sample through `AudioSampleSource`, costing no
    memory beyond the frames in flight. The buffer path also needs none of the
    silence padding, since a buffer of the export's own length has the quiet
    inside it rather than as a gap.
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
- **A dropped sound file is routed on the file rather than on what the canvas
  holds**, so dropping a track never clears the clip it was meant to go with.
  Paste works the same way.
- **The file persists and the placement does not**, the same split the trim
  makes: the file is an asset the user supplied, where it sits is an edit on
  one, and storing the placement would rewrite both Blobs on every drag.
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
