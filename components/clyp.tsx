"use client";

import {
  ArrowBigUpIcon,
  CommandIcon,
  CopyIcon,
  DownloadIcon,
  MaximizeIcon,
  MinusIcon,
  PauseIcon,
  PlayIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { flushSync } from "react-dom";
import { toast } from "sonner";

import { DropZone, readMediaFile } from "@/components/drop-zone";
import { ExportModal } from "@/components/export-modal";
import { GradientBackground } from "@/components/gradient-background";
import { StyleControls } from "@/components/style-controls";
import { TrimBar } from "@/components/trim-bar";
import { UploadCard } from "@/components/upload-card";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { CurveEditor } from "@/components/curve-editor";
import { DeviceFrame, deviceScreenRadius } from "@/components/device-frame";
import { HandleBadge } from "@/components/handle-badge";
import { MarkControls } from "@/components/mark-controls";
import { MarksLayer } from "@/components/marks-layer";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FieldLabel } from "@/components/ui/field-label";
import { Input } from "@/components/ui/input";
import { Dimensions } from "@/components/ui/dimensions";
import { ScrollFade } from "@/components/ui/scroll-fade";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { WindowNavbar } from "@/components/window-navbar";
import { ZoomFocusMarker } from "@/components/zoom-focus";
import {
  type ZoomRegion,
  type ZoomSuggestion,
  DEFAULT_ZOOM_LEVEL,
  ZOOM_LEVELS,
  newZoomId,
  placeZoom,
  suggestZooms,
  zoomAt,
} from "@/lib/clip-zoom";
import {
  type MotionTrack,
  describeWait,
  estimateMotionSeconds,
  motionAt,
} from "@/lib/motion";
import { type MotionRead, readMotion } from "@/lib/read-motion";
import {
  type Cut,
  MIN_CUT,
  MIN_KEPT,
  afterCuts,
  keptSegments,
  leavesEnough,
  keptSeconds,
  newCutId,
  outputAt,
  placeCut,
  tidyCuts,
} from "@/lib/clip-cuts";
import {
  type PieceEdit,
  type Split,
  pieceAt,
  pieces as piecesOf,
  removePiece,
  splitAt,
  tidySplits,
} from "@/lib/clip-pieces";
import {
  TRANSITION_BLUR,
  hasDissolve,
  joinsOf,
  tidyTransition,
  transitionAt,
} from "@/lib/clip-transitions";
import { useEditHistory } from "@/components/use-edit-history";
import { useShaderSupport } from "@/components/use-shader-support";
import {
  type FadeRegion,
  DEFAULT_CURVE,
  fadeAt,
  newFadeId,
  placeFade,
} from "@/lib/clip-fade";
import {
  BACKDROP_PHASE,
  type BackdropSpec,
  EXPORT_IGNORE,
  EXPORT_MEDIA,
  type RasterSize,
  bakeBlurs,
  rasterize,
  slice,
  underBackdrop,
} from "@/lib/raster";
import { grainOpacity } from "@/lib/noise";
import { loopSeconds } from "@/lib/shader";
import {
  type Mark,
  type MarkColor,
  type MarkKind,
  blurRadius,
  normalized,
  tidyMarks,
} from "@/lib/marks";
import { drawRipple, ripplesAt } from "@/lib/ripples";
import { paletteFrom } from "@/lib/palette";
import {
  type Look,
  applyLook,
  lookFrom,
  newLookId,
  nextLookName,
} from "@/lib/looks";
import {
  NO_TEMPLATE,
  getTemplate,
  outputFor,
  slideCount,
  slideRects,
  templateName,
  templateRatio,
} from "@/lib/templates";
import { uniqueNames, zip } from "@/lib/zip";
import {
  DEFAULT_SOLID_COLOR,
  defaultCustomGradient,
  defaultGradientId,
  resolveGradientCss,
  resolveShader,
} from "@/lib/gradients";
import { ALL_CORNERS, aspectBox, aspectRatio, cornerRadius } from "@/lib/style-options";
import {
  clampZoom,
  formatZoom,
  MAX_ZOOM,
  MIN_ZOOM,
  zoomIn,
  zoomOut,
  zoomToFit,
} from "@/lib/zoom";
import {
  type LoadedMedia,
  formatDuration,
  kindOf,
  loadMedia as loadMediaFile,
  loadSoundtrack,
} from "@/lib/media";
import {
  type StoredEdits,
  deleteEdits,
  deleteMarks,
  deleteMedia,
  deleteMotion,
  readEdits,
  readLooks,
  readMarks,
  readMedia,
  readMotion as readStoredMotion,
  readStyle,
  writeEdits,
  writeLooks,
  writeMarks,
  writeMedia,
  writeMotion,
  writeStyle,
} from "@/lib/storage";
import {
  EDIT_FPS,
  SPEED_OPTIONS,
  canExportVideo,
  exportLoop,
  exportVideo,
} from "@/lib/video-export";
import { download, downloadBlob, filenameFor } from "@/lib/download";
import { cn } from "@/lib/utils";
import type {
  ExportOptions,
  Media,
  Soundtrack,
  StyleOptions,
  Trim,
} from "@/types/screenshot";

/**
 * The modal's field carries whatever the user typed, so the extension is
 * imposed here rather than trusted: a clip saved as `demo.png` is a file no
 * player opens.
 */
/**
 * WebCodecs presence, read without a hydration mismatch. It cannot change over
 * a session, so the store has nothing to subscribe to, and the server snapshot
 * says yes: every browser this app targets has an encoder, and a control that
 * starts usable and disables itself on hydration beats one that starts
 * disabled everywhere.
 */
const noSubscribers = () => () => {};
const encoderAssumed = () => true;

/**
 * A tooltip only when there is something to say. A control carrying a text
 * label does not want one otherwise, and a disabled button emits no pointer
 * events of its own, so the wrapper is what the tooltip hangs off.
 */
function Hint({
  reason,
  children,
}: {
  reason: string | null;
  children: React.ReactNode;
}) {
  if (!reason) return children;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex">{children}</span>
      </TooltipTrigger>
      <TooltipContent>{reason}</TooltipContent>
    </Tooltip>
  );
}

/**
 * A line of text beside the picture, inside the export.
 *
 * It sits in the frame subtree, so both exports bake it for free through the
 * same raster as everything else. It carries its own colours for the same
 * reason the title bar does: it sits over an arbitrary gradient, and the
 * exported PNG has no theme. Light text gets a faint shadow, since white on a
 * pale gradient needs the help and dark on a dark one is a choice the toggle
 * already offers a way out of.
 */
function Caption({
  text,
  size,
  dark,
  position,
}: {
  text: string;
  size: number;
  dark: boolean;
  position: "above" | "below";
}) {
  // The gap scales with the type, so a large title does not sit tight against
  // the picture while a small caption floats away from it.
  const gap = Math.round(size * 0.75);

  return (
    <p
      className="artwork-ease w-0 min-w-full text-center font-medium leading-tight text-balance wrap-break-word transition-[font-size,margin,color,text-shadow]"
      style={{
        fontSize: size,
        color: dark ? "rgba(0,0,0,0.85)" : "rgba(255,255,255,0.95)",
        textShadow: dark ? undefined : "0 1px 2px rgba(0,0,0,0.2)",
        marginTop: position === "below" ? gap : undefined,
        marginBottom: position === "above" ? gap : undefined,
      }}
    >
      {text}
    </p>
  );
}

/* ─────────────────────────────────────────────────────────
 * ANIMATION STORYBOARD - artwork entry
 *
 *    0ms   image decodes, canvas still shows the upload card
 *   40ms   artwork mounts, scale 0.96 -> 1 with a fade
 *  120ms   dimensions readout rises into the toolbar
 *  460ms   settled
 * ───────────────────────────────────────────────────────── */

/** Breathing room around the frame inside the canvas, matching `p-6`. */
const CANVAS_PADDING = 24;
/**
 * One pixel of tolerance in the fit.
 *
 * A fitted frame lands on exactly the space available, since the padded
 * wrapper is `min-h-full` and the outer box is the scaled footprint, so the
 * two agree to the pixel and nothing absorbs a fraction. The frame is measured
 * with `offsetWidth` and `offsetHeight`, which round, so a sub-pixel either way
 * is enough for a scrollbar in a view whose whole job is showing everything.
 * Sweeping 176 window sizes at both pixel ratios found no case that needs it,
 * which is the point: the guarantee should not rest on that staying true.
 */
const FIT_SLACK = 1;

const TIMING = {
  artwork: 40, // artwork scale-and-fade begins
  toolbarMeta: 120, // dimensions readout rises in
};

/** How long an edit sits before it is written. A drag settles well inside it. */
const EDITS_DEBOUNCE = 300;

/** "Instagram Story" as "instagram-story", for a filename inside a ZIP. */
const slug = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/** A data URL's bytes, for an entry in a ZIP. */
const bytesOf = async (url: string) =>
  new Uint8Array(await (await fetch(url)).arrayBuffer());

const clamp = (value: number, low: number, high: number) =>
  Math.min(Math.max(value, low), Math.max(low, high));

/** The phase the live background last drew, read off its canvas. */
function shownPhase(frame: HTMLElement, fallback: number): number {
  const value = frame.querySelector(`[${BACKDROP_PHASE}]`)?.getAttribute(BACKDROP_PHASE);
  const phase = value ? Number(value) : Number.NaN;
  return Number.isFinite(phase) ? phase : fallback;
}

const DEFAULT_STYLE: StyleOptions = {
  gradientId: defaultGradientId,
  gradientAngle: 180,
  aspect: "auto",
  template: NO_TEMPLATE,
  slides: 1,
  padding: 64,
  outerRadius: 12,
  imageRadius: 8,
  imageCorners: ALL_CORNERS,
  shadow: "shadow-2xl",
  // None. A bar is a frame around a window, and plenty of what gets dropped
  // here is not one: a clip of a chart, a phone recording, a crop of a page.
  // Adding one is one press, and it takes the media's top corners with it.
  windowChrome: "none",
  windowUrl: "",
  windowNavbarDark: false,
  device: "none",
  caption: "",
  captionPosition: "below",
  captionSize: 32,
  captionDark: false,
  badge: "",
  badgePosition: "bottom-right",
  badgeSize: 28,
  badgeDark: false,
  clickRipples: false,
  showNoiseOverlay: false,
  noiseIntensity: 55,
  background: "preset",
  customGradientFrom: defaultCustomGradient.from,
  customGradientTo: defaultCustomGradient.to,
  solidColor: DEFAULT_SOLID_COLOR,
  backgroundSpeed: 1,
  backgroundMoment: 0,
};

export function Clyp() {
  const [media, setMedia] = useState<Media | null>(null);
  const [dimensions, setDimensions] = useState<{ w: number; h: number } | null>(
    null,
  );
  // The clip's in and out points, null for an image. An edit on the draft
  // rather than part of it, so it is stored under the edits key rather than
  // beside the Blob, which must not be rewritten on every drag of a handle.
  const [trim, setTrim] = useState<Trim | null>(null);
  /**
   * Stretches removed from the middle of the clip, on the source's axis like
   * the trim and the zooms. Sorted and merged on the way in, so nothing
   * downstream has to cope with an overlap.
   */
  const [cuts, setCuts] = useState<Cut[]>([]);
  const [selectedCut, setSelectedCut] = useState<string | null>(null);
  /**
   * Split points, on the source's axis like the cuts. With them the kept clip
   * is in pieces, which can be picked, moved into the room around them and
   * deleted. A deleted piece becomes a cut, so a split is the only new state.
   */
  const [splits, setSplits] = useState<Split[]>([]);
  /** The selected piece, by its start in source seconds. */
  const [selectedPiece, setSelectedPiece] = useState<number | null>(null);
  /** The selected join between two touching pieces, by its split's time. */
  const [selectedJoin, setSelectedJoin] = useState<number | null>(null);
  const [removePieceOpen, setRemovePieceOpen] = useState(false);
  /**
   * Stretches where the picture arrives or leaves, on the source's axis like
   * the cuts and the zooms.
   */
  const [fades, setFades] = useState<FadeRegion[]>([]);
  const [selectedFade, setSelectedFade] = useState<string | null>(null);
  /**
   * The clip's playback rate, an edit like the trim and stored with it. The
   * preview plays at it and the export writes at it, so the two agree, and it
   * is the one place the clip's own sound gives way: past 1x there is no
   * stretch that keeps the pitch, so it is muted here and left out of the file.
   */
  const [speed, setSpeed] = useState(1);
  /**
   * Stretches of the clip that close in on a point of the picture. On the
   * source's axis like the trim, and stored with it. `selectedZoom` is the one
   * whose focus marker is on the picture and whose level the bar offers chips
   * for.
   */
  const [zooms, setZooms] = useState<ZoomRegion[]>([]);
  const [selectedZoom, setSelectedZoom] = useState<string | null>(null);
  const [removeZoomOpen, setRemoveZoomOpen] = useState(false);
  const [removeCutOpen, setRemoveCutOpen] = useState(false);
  const [resetStyleOpen, setResetStyleOpen] = useState(false);
  const [removeFadeOpen, setRemoveFadeOpen] = useState(false);
  const [curveOpen, setCurveOpen] = useState(false);
  /**
   * A copied lane instance, waiting to be pasted.
   *
   * The app's own rather than the system clipboard. Cmd+C here would otherwise
   * have to write JSON over whatever the reader had copied, and reading it
   * back needs a permission this feature does not deserve. It also means a
   * paste cannot arrive holding something from another site.
   */
  const [copied, setCopied] = useState<
    { kind: "zoom"; region: ZoomRegion } | { kind: "cut"; cut: Cut } | null
  >(null);
  /**
   * The clip's motion track, read once for the whole clip when a region is
   * first asked to follow, and the read's progress while it runs. Reading it
   * is the one heavy thing in the editor, so it is asked for through a dialog
   * and never started by a drag. Stored with the draft, so a reload has it.
   */
  const [motion, setMotion] = useState<MotionTrack | null>(null);
  const [motionProgress, setMotionProgress] = useState<number | null>(null);
  /**
   * What the motion dialog was opened for: a region asking to follow, or the
   * suggestions. Both need the clip read first, and the read is asked for the
   * same way whichever wants it.
   */
  const [motionAsk, setMotionAsk] = useState<
    | { kind: "follow"; region: ZoomRegion }
    | { kind: "suggest" }
    | { kind: "ripples" }
    | null
  >(null);
  /** Whether suggested regions are shown on the lane. */
  const [suggesting, setSuggesting] = useState(false);
  const [soundtrack, setSoundtrack] = useState<Soundtrack | null>(null);
  /**
   * What is drawn on the picture: blurs and blocks that redact, boxes,
   * arrows and text that point. In fractions of the picture, so they mean the
   * same thing at any zoom and any export size. An edit like the trim, so undo
   * walks them back, and stored under a key of their own, since an image has
   * no edits record and marks belong to images as much as to clips.
   */
  const [marks, setMarks] = useState<Mark[]>([]);
  const [selectedMark, setSelectedMark] = useState<string | null>(null);
  /** What a press on the picture draws, or null to only select. */
  const [markTool, setMarkTool] = useState<MarkKind | null>(null);
  const [markColor, setMarkColor] = useState<MarkColor>("red");
  const [removeMarkId, setRemoveMarkId] = useState<string | null>(null);
  /** Whether the safe zone and slide seams are drawn over the canvas. View state. */
  const [showGuides, setShowGuides] = useState(true);
  /**
   * A template the frame is laid out at for one step of a several-sizes
   * export, in place of the chosen one. Set and cleared synchronously around
   * each raster, so the canvas only ever shows it for the length of one.
   */
  const [sizeOverride, setSizeOverride] = useState<string | null>(null);
  const [looks, setLooks] = useState<Look[]>([]);
  const [saveLookOpen, setSaveLookOpen] = useState(false);
  const [lookName, setLookName] = useState("");
  const [deleteLook, setDeleteLook] = useState<Look | null>(null);
  /**
   * The preview's own volume, not the export's, and one per source.
   *
   * A clip can arrive with sound and then have music laid over it, and those
   * are two things to listen to rather than one: the track no longer replaces
   * the clip's audio in the export, it mixes with it, so the editor has to be
   * able to hear either on its own.
   *
   * Both start audible. Dropping a clip that came with sound and hearing
   * nothing is the wrong default, and a drop is a user gesture, so the browser
   * allows playback with sound straight after one. A restore on page load has
   * no gesture behind it and gets refused, which the effect below catches.
   */
  const [muted, setMuted] = useState(false);
  const [musicMuted, setMusicMuted] = useState(false);
  /**
   * The play or pause flash over the picture.
   *
   * Keyed, because a CSS animation only runs on the frame it is attached and
   * a second toggle has to replay it. The id changes on every press, React
   * remounts the element, and the keyframe starts again. `playing` is what
   * just happened rather than what is about to: a press that pauses shows the
   * pause glyph, which is the convention every player follows.
   */
  const [pulse, setPulse] = useState<{ id: number; playing: boolean } | null>(
    null,
  );
  const [styleOptions, setStyleOptions] = useState<StyleOptions>(DEFAULT_STYLE);
  // Remembered here rather than inside GradientBackground, so the cross-fade
  // needs no state or effect in the component that renders it.
  const [previousGradientCss, setPreviousGradientCss] = useState(() =>
    resolveGradientCss(DEFAULT_STYLE),
  );
  const [exportModalOpen, setExportModalOpen] = useState(false);
  /**
   * What a clip's Download writes: the encoded clip, or the frame under the
   * playhead as a still.
   *
   * Here rather than inside the modal because it decides what the export is:
   * the encode branch, the progress phase, the filename's extension and
   * whether there is anything to cancel all follow it.
   */
  const [videoFormat, setVideoFormat] = useState<"mp4" | "png">("mp4");
  const [exportAction, setExportAction] = useState<"copy" | "download">(
    "download",
  );
  const [clearOpen, setClearOpen] = useState(false);
  const [removeTrackOpen, setRemoveTrackOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  /** 0 to 1 while a video encodes, null for an image, which is one shot. */
  const [progress, setProgress] = useState<number | null>(null);
  // Nothing is written until the stored draft has been read back, otherwise
  // the first render would overwrite it with defaults.
  const [restored, setRestored] = useState(false);

  const canEncode = useSyncExternalStore(
    noSubscribers,
    canExportVideo,
    encoderAssumed,
  );

  // Held for the length of one video export, so Cancel can stop it. A PNG is
  // one shot and has nothing to interrupt.
  const abortRef = useRef<AbortController | null>(null);

  const screenshotRef = useRef<HTMLDivElement>(null);
  const artworkRef = useRef<HTMLDivElement>(null);
  /**
   * The history's reset, reached from `loadMedia` and `applyEdits`, which are
   * both declared above the hook that owns it. A ref rather than a reorder:
   * the hook reads the edit state, and the edit state is built from handlers
   * those two callbacks are neighbours of.
   */
  const resetHistoryRef = useRef<(() => void) | null>(null);
  /** Undo, for a toast raised by a handler declared above the history. */
  const undoRef = useRef<(() => void) | null>(null);
  /** The clip's box: what holds still, carries the radius, and is measured. */
  const clipBoxRef = useRef<HTMLDivElement>(null);
  const veilRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  // For the zoom's frame loop, which is bound once per clip and would
  // otherwise close over the regions it mounted with. Written in an effect.
  const zoomsRef = useRef(zooms);
  const fadesRef = useRef(fades);
  // The loop reads the joins' transitions off the live trim and cuts.
  const trimRef = useRef(trim);
  const cutsRef = useRef(cuts);
  const splitsRef = useRef(splits);
  /** A dip's colour over the picture, and a dissolve's held frame. */
  const dipRef = useRef<HTMLDivElement>(null);
  const heldRef = useRef<HTMLCanvasElement>(null);
  const motionRef = useRef(motion);
  const selectedZoomRef = useRef(selectedZoom);
  /** The read in flight, so a clip change can stop it. */
  const motionReadRef = useRef<MotionRead | null>(null);
  /** The marker while it follows, positioned by the loop rather than React. */
  const liveMarkerRef = useRef<HTMLDivElement>(null);
  /** True while the focus marker is being dragged. */
  const aimingRef = useRef(false);
  /** Whether the preview was playing when the marker was picked up. */
  const resumeAfterAimRef = useRef(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  /** The marks' layer, which the zoom loop transforms with the video. */
  const marksLayerRef = useRef<HTMLDivElement>(null);
  /** The preview's click ripples, drawn by the same loop. */
  const rippleCanvasRef = useRef<HTMLCanvasElement>(null);
  const ripplesOnRef = useRef(false);

  /**
   * What the artwork measures, which is the picture plus the title bar when it
   * is on. Measured rather than taken from `dimensions`, since that is the
   * media's own size and knows nothing about the bar above it.
   */
  const [artwork, setArtwork] = useState<{
    width: number;
    height: number;
  } | null>(null);

  const [zoom, setZoom] = useState(1);
  // "fit" keeps the whole frame in view as it resizes. Any manual zoom hands
  // control to the user and stops the refitting until they ask to fit again.
  const [zoomMode, setZoomMode] = useState<"fit" | "manual">("fit");
  // The frame's unscaled size, needed so the scroll area can size itself to
  // the *scaled* footprint. A transform does not change layout size.
  const [frameSize, setFrameSize] = useState({ width: 0, height: 0 });

  // Read inside the ResizeObserver, which must not re-subscribe every time
  // the mode flips.
  const zoomModeRef = useRef(zoomMode);
  useEffect(() => {
    zoomModeRef.current = zoomMode;
  }, [zoomMode]);

  const setManualZoom = useCallback((next: number) => {
    setZoomMode("manual");
    setZoom(clampZoom(next));
  }, []);

  const fitToView = useCallback(() => {
    const scroller = scrollerRef.current;
    const frame = screenshotRef.current;
    setZoomMode("fit");
    if (!scroller || !frame) return;
    setZoom(
      zoomToFit(
        { width: scroller.clientWidth, height: scroller.clientHeight },
        { width: frame.offsetWidth, height: frame.offsetHeight },
        CANVAS_PADDING * 2 + FIT_SLACK,
      ),
    );
  }, []);

  const gradientCss = resolveGradientCss(styleOptions);
  /**
   * The moving field behind the artwork, when this browser can draw one.
   * Where it cannot, the preset's CSS stand-in is the background everywhere,
   * preview and export alike, so neither promises motion the other lacks.
   */
  const canShade = useShaderSupport();
  const shaderField = canShade ? resolveShader(styleOptions) : null;
  const backdrop = useMemo<BackdropSpec | null>(
    () =>
      shaderField
        ? {
            field: shaderField,
            speed: styleOptions.backgroundSpeed,
            moment: styleOptions.backgroundMoment,
            radius: styleOptions.outerRadius,
            grain: grainOpacity(
              styleOptions.showNoiseOverlay,
              styleOptions.noiseIntensity,
            ),
          }
        : null,
    [
      shaderField,
      styleOptions.backgroundSpeed,
      styleOptions.backgroundMoment,
      styleOptions.outerRadius,
      styleOptions.showNoiseOverlay,
      styleOptions.noiseIntensity,
    ],
  );
  /**
   * How long one loop of the background runs, when an image can be exported
   * moving. Null for a still background, a held one, or a browser that cannot
   * encode, which leaves an image's Download a PNG as it always was.
   */
  const loop =
    media?.kind === "image" && backdrop && backdrop.speed > 0 && canEncode
      ? loopSeconds(backdrop.speed)
      : null;
  // One radius for both branches and for the export's rounded clip, so an
  // image and a video cannot end up cornered differently.
  // Copy always produces a PNG, so a clip copies its styled poster frame and
  // only Download encodes. That leaves one thing that can be unavailable: the
  // encode needs WebCodecs.
  const downloadBlocked =
    media?.kind === "video" && !canEncode
      ? "This browser cannot encode video"
      : null;
  // Copy has no MP4 flavour and takes the poster frame, and a Download set to
  // PNG asks for the same thing deliberately. Only this encodes.
  /**
   * The platform size the frame is laid out at. A several-sizes export steps
   * through others one raster at a time, and each is a single slide.
   */
  const template = getTemplate(sizeOverride ?? styleOptions.template);
  const slides = sizeOverride ? 1 : slideCount(template, styleOptions.slides);
  // A carousel's slides are stills, so a clip set to one exports its frame.
  const exportsVideo =
    (media?.kind === "video" || loop !== null) &&
    exportAction === "download" &&
    videoFormat === "mp4" &&
    slides === 1;
  // What will actually be encoded, which is the trim at the chosen speed rather
  // than the file. The duration readout, the size estimate and the encode all
  // read this one value, so none of them can describe a length nobody asked
  // for. The trim bar's own readout stays in the source's seconds, since that
  // is the axis its handles cut on.
  // The one length everything reads: the toolbar, the duration readout, the
  // size estimate and the encode. Every cut comes off it.
  const clipSeconds = trim
    ? keptSeconds(trim, cuts) / speed
    : media?.duration;

  /**
   * The frame's box when a shape is asked for.
   *
   * Null for `auto`, which is the frame sizing itself to the artwork and its
   * padding the way it always did, and null before the artwork has been
   * measured. Also null with nothing loaded: the upload card is a fixed card
   * rather than the artwork, so shaping the frame around it would preview a
   * frame nobody is going to export.
   */
  const ratio = template
    ? templateRatio(template, slides)
    : aspectRatio(styleOptions.aspect);
  const shaped =
    ratio !== null && artwork !== null && media !== null
      ? aspectBox(artwork, styleOptions.padding, ratio)
      : null;

  const removeLabel =
    media?.kind === "video" ? "Remove clip" : "Remove screenshot";

  const framed = styleOptions.windowChrome !== "none";
  // A device decides the screen's corners itself: a phone's are its own
  // radius all round, and a laptop's screen is square inside its bezel.
  const screenRadius = deviceScreenRadius(
    styleOptions.device,
    dimensions?.w ?? 1280,
  );
  const radius = screenRadius ?? styleOptions.imageRadius;
  const corners = screenRadius === null ? styleOptions.imageCorners : ALL_CORNERS;
  const mediaRadius = cornerRadius(
    radius,
    corners,
    framed ? "bottom" : undefined,
  );
  // The shadow moves to the device when there is one, since the device is
  // what sits on the background.
  const mediaShadow =
    styleOptions.device === "none" ? styleOptions.shadow : "shadow-none";
  const picture = useMemo(
    () =>
      dimensions
        ? { width: dimensions.w, height: dimensions.h }
        : { width: 1280, height: 720 },
    [dimensions],
  );
  const selectedMarkValue = marks.find((m) => m.id === selectedMark) ?? null;
  const caption = styleOptions.caption.trim();
  const badge = styleOptions.badge.trim();
  const zoomed = zoom !== 1 && frameSize.width > 0;
  const selectedRegion = zooms.find((r) => r.id === selectedZoom) ?? null;
  const selectedRamp = fades.find((f) => f.id === selectedFade) ?? null;

  useEffect(() => {
    zoomsRef.current = zooms;
    fadesRef.current = fades;
    motionRef.current = motion;
    selectedZoomRef.current = selectedZoom;
    ripplesOnRef.current = styleOptions.clickRipples;
    trimRef.current = trim;
    cutsRef.current = cuts;
    splitsRef.current = splits;
  }, [zooms, fades, motion, selectedZoom, styleOptions.clickRipples, trim, cuts, splits]);

  /**
   * Takes over from the loader in `lib/media.ts`, which has already read and
   * measured the file. Revoking the previous object URL matters: a video that
   * is replaced four times leaves four decoded files alive otherwise.
   */
  const loadMedia = useCallback((loaded: LoadedMedia) => {
    setMedia((previous) => {
      if (previous?.kind === "video") URL.revokeObjectURL(previous.src);
      return loaded.media;
    });
    setDimensions({ w: loaded.width, h: loaded.height });
    setTrim(
      loaded.media.duration ? { start: 0, end: loaded.media.duration } : null,
    );
    setSpeed(1);
    setCuts([]);
    setSelectedCut(null);
    setSplits([]);
    setSelectedPiece(null);
    setSelectedJoin(null);
    setFades([]);
    setSelectedFade(null);
    setZooms([]);
    setSelectedZoom(null);
    // Marks were placed on a picture that is no longer here.
    setMarks([]);
    setSelectedMark(null);
    // A read for the clip that has just been replaced is stopped, since its
    // answer would be about the wrong picture.
    motionReadRef.current?.cancel();
    motionReadRef.current = null;
    setMotion(null);
    setMotionProgress(null);
    setMotionAsk(null);
    setSuggesting(false);
    // Audible again for a new clip, whatever the last one was left at.
    setMuted(false);
    setMusicMuted(false);
    // A soundtrack was placed against a clip that is no longer here, so it
    // means nothing now. Dropping it beats leaving it somewhere arbitrary.
    setSoundtrack((previous) => {
      if (previous) URL.revokeObjectURL(previous.src);
      return null;
    });
    resetHistoryRef.current?.();
  }, []);

  /**
   * Puts stored edits back onto a clip that has just been loaded, clamped to
   * its duration and snapped to the frame grid, so a record that somehow
   * disagrees with the file can never cut past its end.
   */
  const applyEdits = useCallback((edits: StoredEdits, length: number) => {
    const grid = (seconds: number) =>
      Math.round(clamp(seconds, 0, length) * EDIT_FPS) / EDIT_FPS;
    const start = grid(edits.trim.start);
    const end = Math.max(grid(edits.trim.end), start);
    if (end > start) setTrim({ start, end });

    // Tidied against the restored trim, so a record that somehow disagrees
    // with the file cannot leave an overlap or a cut outside the clip.
    setCuts(
      tidyCuts(
        (edits.cuts ?? []).map((c) => ({
          id: c.id,
          start: grid(c.start),
          end: grid(c.end),
          ...(tidyTransition(c.transition) && {
            transition: tidyTransition(c.transition),
          }),
        })),
        { start, end },
      ),
    );
    setSelectedCut(null);
    // A record from before a split could carry a transition holds bare
    // numbers, read here as splits with none.
    setSplits(
      (edits.splits ?? []).map((split) =>
        typeof split === "number"
          ? { at: grid(split) }
          : {
              at: grid(split.at),
              ...(tidyTransition(split.transition) && {
                transition: tidyTransition(split.transition),
              }),
            },
      ),
    );
    setSelectedPiece(null);
    setSelectedJoin(null);
    setFades(
      (edits.fades ?? [])
        .map((f) => ({ ...f, start: grid(f.start), end: grid(f.end) }))
        .filter((f) => f.end > f.start)
        .sort((a, b) => a.start - b.start),
    );
    setSelectedFade(null);

    const rate = edits.speed as (typeof SPEED_OPTIONS)[number];
    setSpeed(SPEED_OPTIONS.includes(rate) ? rate : 1);
    setZooms(
      edits.zooms
        .map((z) => ({
          ...z,
          start: grid(z.start),
          end: grid(z.end),
          // Clamped to a level the picker offers. A stored scale outside the
          // set would leave every level chip unchecked, and a radiogroup with
          // nothing checked has no tab stop.
          scale: ZOOM_LEVELS.includes(z.scale as (typeof ZOOM_LEVELS)[number])
            ? z.scale
            : DEFAULT_ZOOM_LEVEL,
        }))
        .filter((z) => z.end > z.start)
        .sort((a, b) => a.start - b.start),
    );
    // Putting a stored draft back is not an edit to walk back from, and the
    // defaults it replaces are not a state anyone asked for.
    resetHistoryRef.current?.();
  }, []);

  const addSoundtrack = useCallback(
    (file: File) => {
      // It lands filling the clip, and the clip at 2x is half as long on the
      // track's own clock, so that is the length it is cut to.
      loadSoundtrack(file, (media?.duration ?? 0) / speed)
        .then((next) => {
          setSoundtrack((previous) => {
            if (previous) URL.revokeObjectURL(previous.src);
            return next;
          });
          // Adding a track is asking to hear it. Nothing plays yet, since a
          // track arriving also pauses the canvas, so the first sound still
          // comes from a deliberate press.
          setMusicMuted(false);
        })
        .catch((error: Error) => toast.error(error.message));
    },
    [media?.duration, speed],
  );

  const removeSoundtrack = useCallback(() => {
    setSoundtrack((previous) => {
      if (previous) URL.revokeObjectURL(previous.src);
      return null;
    });
  }, []);

  /**
   * A faster clip has less lane behind a soundtrack's anchor.
   *
   * The region starts on a source frame and runs at the track's own tempo, so
   * on the lane it spans `speed` times its length. At 2x a region that filled
   * the last three seconds now needs six, and a part hanging off the end is a
   * part that cannot be heard. Its tail is cut to fit rather than drawn past
   * the lane, which would say the control is broken.
   */
  const duration = media?.duration;
  const handleSpeedChange = useCallback(
    (next: number) => {
      setSpeed(next);
      setSoundtrack((previous) => {
        if (!previous || !duration) return previous;
        const room = (duration - previous.offset) / next;
        return previous.end - previous.start > room
          ? { ...previous, end: previous.start + room }
          : previous;
      });
    },
    [duration],
  );

  /**
   * A new zoom lands at the playhead: the default length, or what the gap
   * there holds, pulled back from a neighbour or the end. Snapped to the frame
   * grid like everything else on the lane, and selected, so the marker is on
   * the picture at once.
   */
  const addZoom = useCallback(() => {
    const video = videoRef.current;
    if (!video || !duration) return;

    const grid = (seconds: number) => Math.round(seconds * EDIT_FPS) / EDIT_FPS;
    const placed = placeZoom(zooms, grid(video.currentTime), duration);
    if (!placed) {
      toast.error("There is no room for a zoom at the playhead");
      return;
    }

    const region: ZoomRegion = {
      id: newZoomId(),
      start: grid(placed.start),
      end: grid(placed.end),
      scale: DEFAULT_ZOOM_LEVEL,
      focus: { x: 0.5, y: 0.5 },
    };
    setZooms((previous) =>
      [...previous, region].sort((a, b) => a.start - b.start),
    );
    setSelectedZoom(region.id);
    setSelectedCut(null);
  }, [duration, zooms]);

  const updateZoom = useCallback((next: ZoomRegion) => {
    setZooms((previous) =>
      previous
        .map((r) => (r.id === next.id ? next : r))
        .sort((a, b) => a.start - b.start),
    );
  }, []);

  /**
   * Selecting a region also shows it. One the playhead is outside of shows
   * nothing, and a marker for a zoom nobody can see is a dead control, so the
   * playhead moves into its hold.
   */
  const selectZoom = useCallback(
    (id: string | null) => {
      setSelectedZoom(id);
      // One selection across the lanes. Two at once make "the selected thing"
      // ambiguous, and the copy shortcut then has to guess which was meant.
      if (id) {
        setSelectedCut(null);
        setSelectedFade(null);
        setSelectedPiece(null);
        setSelectedJoin(null);
      }
      const video = videoRef.current;
      const region = zooms.find((r) => r.id === id);
      if (!video || !region) return;
      if (video.currentTime < region.start || video.currentTime >= region.end) {
        video.currentTime = (region.start + region.end) / 2;
      }
    },
    [zooms],
  );

  const removeZoom = useCallback(() => {
    setZooms((previous) => previous.filter((r) => r.id !== selectedZoom));
    setSelectedZoom(null);
    setRemoveZoomOpen(false);
  }, [selectedZoom]);

  /**
   * A new cut lands at the playhead, the same rule a zoom follows: the default
   * length from there, or what the gap holds, and shortened rather than
   * refused when the clip is nearly all cut already.
   *
   * The playhead is moved to the far side of it, since where it was is now a
   * frame the preview will not show.
   */
  const addCut = useCallback(() => {
    const video = videoRef.current;
    if (!video || !trim) return;

    const grid = (seconds: number) => Math.round(seconds * EDIT_FPS) / EDIT_FPS;
    const placed = placeCut(trim, cuts, grid(video.currentTime));
    if (!placed) {
      toast.error(
        keptSeconds(trim, cuts) - MIN_KEPT < MIN_CUT
          ? "There is not enough of the clip left to cut"
          : "There is no room for a cut at the playhead",
      );
      return;
    }

    const cut: Cut = {
      id: newCutId(),
      start: grid(placed.start),
      end: grid(placed.end),
    };
    const next = tidyCuts([...cuts, cut], trim);
    setCuts(next);
    setSelectedCut(cut.id);
    setSelectedZoom(null);
    video.currentTime = afterCuts(trim, next, video.currentTime);
  }, [cuts, trim]);

  const updateCut = useCallback(
    (next: Cut) => {
      if (!trim) return;
      setCuts((previous) => {
        const tidy = tidyCuts(
          previous.map((c) => (c.id === next.id ? next : c)),
          trim,
        );
        // One cut's two edges, pulled to the in and out points, span the whole
        // trim and leave nothing to export. The edge stops here instead.
        return leavesEnough(trim, tidy) ? tidy : previous;
      });
    },
    [trim],
  );

  const selectCut = useCallback((id: string | null) => {
    setSelectedCut(id);
    if (id) {
      setSelectedZoom(null);
      setSelectedFade(null);
      setSelectedPiece(null);
      setSelectedJoin(null);
    }
  }, []);

  /** One selection across the lanes, so a piece takes it from the rest. */
  const selectPiece = useCallback((start: number | null) => {
    setSelectedPiece(start);
    if (start !== null) {
      setSelectedZoom(null);
      setSelectedCut(null);
      setSelectedFade(null);
      setSelectedJoin(null);
    }
  }, []);

  /** A join between two touching pieces, where a split's transition is set. */
  const selectJoin = useCallback((at: number | null) => {
    setSelectedJoin(at);
    if (at !== null) {
      setSelectedZoom(null);
      setSelectedCut(null);
      setSelectedFade(null);
      setSelectedPiece(null);
    }
  }, []);

  const updateSplit = useCallback((next: Split) => {
    setSplits((previous) =>
      previous.map((s) => (Math.abs(s.at - next.at) < 1e-6 ? next : s)),
    );
  }, []);

  /**
   * Joins two touching pieces back into one. Nothing is lost but the join's
   * transition, and undo brings that back, so it does not ask.
   */
  const removeSplit = useCallback((at: number) => {
    setSplits((previous) => previous.filter((s) => Math.abs(s.at - at) >= 1e-6));
    setSelectedJoin(null);
  }, []);

  /**
   * Splits the kept clip at the playhead. Refused with a reason when the
   * playhead is in a cut or too close to an edge, since a piece under the
   * minimum could not be deleted as a cut.
   */
  const splitAtPlayhead = useCallback(() => {
    const video = videoRef.current;
    if (!video || !trim) return;
    const at = Math.round(video.currentTime * EDIT_FPS) / EDIT_FPS;
    const next = splitAt(trim, cuts, splits, at);
    if (!next) {
      toast.error("Too close to the edge of a piece to split there");
      return;
    }
    setSplits(next);
    const piece = pieceAt(piecesOf(trim, cuts, next), at);
    if (piece) selectPiece(piece.start);
  }, [cuts, selectPiece, splits, trim]);

  /** A piece moved, from the lane's drag or its arrow keys. */
  const handlePiecesChange = useCallback((edit: PieceEdit, selected: number) => {
    setTrim(edit.trim);
    setCuts(edit.cuts);
    setSplits(edit.splits);
    setSelectedPiece(selected);
  }, []);

  /**
   * Takes the selected piece out, which is a cut over it. The splits at its
   * edges now sit on a cut's edge, where they divide nothing, so they go too.
   */
  const deletePiece = useCallback(
    (quiet = false) => {
      if (!trim || selectedPiece === null) return;
      const piece = piecesOf(trim, cuts, splits).find(
        (p) => Math.abs(p.start - selectedPiece) < 1e-6,
      );
      if (!piece) return;
      const next = removePiece(trim, cuts, piece, newCutId());
      if (!next) {
        toast.error("At least a fifth of a second of the clip has to stay");
        return;
      }
      setCuts(next);
      setSplits(tidySplits(trim, next, splits));
      setSelectedPiece(null);
      setRemovePieceOpen(false);
      const video = videoRef.current;
      if (video) video.currentTime = afterCuts(trim, next, video.currentTime);
      if (!quiet) {
        toast("Piece deleted", { action: { label: "Undo", onClick: () => undoRef.current?.() } });
      }
    },
    [cuts, selectedPiece, splits, trim],
  );

  const removeCut = useCallback(() => {
    setCuts((previous) => previous.filter((c) => c.id !== selectedCut));
    setSelectedCut(null);
    setRemoveCutOpen(false);
  }, [selectedCut]);

  /**
   * A new fade lands at the playhead, the same rule a zoom and a cut follow.
   * It arrives as a fade in, since that is what a first one usually is, and
   * its direction is one chip away.
   */
  const addFade = useCallback(() => {
    const video = videoRef.current;
    if (!video || !duration) return;

    const grid = (seconds: number) => Math.round(seconds * EDIT_FPS) / EDIT_FPS;
    const placed = placeFade(fades, grid(video.currentTime), duration);
    if (!placed) {
      toast.error("There is no room for a fade at the playhead");
      return;
    }

    const region: FadeRegion = {
      id: newFadeId(),
      start: grid(placed.start),
      end: grid(placed.end),
      kind: "in",
      curve: DEFAULT_CURVE,
    };
    setFades((previous) =>
      [...previous, region].sort((a, b) => a.start - b.start),
    );
    setSelectedFade(region.id);
    setSelectedZoom(null);
    setSelectedCut(null);
  }, [duration, fades]);

  const updateFade = useCallback((next: FadeRegion) => {
    setFades((previous) =>
      previous
        .map((f) => (f.id === next.id ? next : f))
        .sort((a, b) => a.start - b.start),
    );
  }, []);

  const selectFade = useCallback((id: string | null) => {
    setSelectedFade(id);
    if (id) {
      setSelectedZoom(null);
      setSelectedCut(null);
      setSelectedPiece(null);
      setSelectedJoin(null);
    }
  }, []);

  const removeFade = useCallback(() => {
    setFades((previous) => previous.filter((f) => f.id !== selectedFade));
    setSelectedFade(null);
    setRemoveFadeOpen(false);
  }, [selectedFade]);

  /**
   * Moving a trim handle re-clips the cuts to it, so a cut dragged outside the
   * range stops removing anything rather than removing time the export no
   * longer covers.
   */
  const handleTrimChange = useCallback(
    (next: Trim) => {
      const tidy = tidyCuts(cuts, next);
      // A handle brought in over a cut can leave less picture than the cut
      // itself is allowed to, so it stops for the same reason.
      if (!leavesEnough(next, tidy)) return;
      setTrim(next);
      setCuts(tidy);
    },
    [cuts],
  );

  /**
   * Copies whichever lane instance is selected.
   *
   * A zoom is a length, a level, an aim and how it follows, and placing one
   * takes longer than any other edit here. Copying keeps all of it, so the
   * second one differs from the first only in where it sits.
   */
  const copySelection = useCallback(() => {
    const region = zooms.find((r) => r.id === selectedZoom);
    if (region) {
      setCopied({ kind: "zoom", region });
      toast.success("Zoom copied");
      return;
    }
    const cut = cuts.find((c) => c.id === selectedCut);
    if (cut) {
      setCopied({ kind: "cut", cut });
      toast.success("Cut copied");
    }
  }, [cuts, selectedCut, selectedZoom, zooms]);

  /**
   * Pastes it at the playhead, keeping its own length.
   *
   * The same placement a new one gets, so it lands from the playhead forward
   * and stops at a neighbour, and the copy is selected so the next edit is
   * about it.
   */
  const pasteCopied = useCallback(() => {
    const video = videoRef.current;
    if (!copied || !video || !duration) return;
    const grid = (seconds: number) => Math.round(seconds * EDIT_FPS) / EDIT_FPS;
    const at = grid(video.currentTime);

    if (copied.kind === "zoom") {
      const { region } = copied;
      const placed = placeZoom(zooms, at, duration, region.end - region.start);
      if (!placed) {
        toast.error("There is no room for a zoom at the playhead");
        return;
      }
      const next: ZoomRegion = {
        ...region,
        id: newZoomId(),
        start: grid(placed.start),
        end: grid(placed.end),
      };
      setZooms((previous) =>
        [...previous, next].sort((a, b) => a.start - b.start),
      );
      setSelectedZoom(next.id);
      setSelectedCut(null);
      return;
    }

    if (!trim) return;
    const { cut } = copied;
    const placed = placeCut(trim, cuts, at, cut.end - cut.start);
    if (!placed) {
      toast.error("There is no room for a cut at the playhead");
      return;
    }
    const next: Cut = {
      id: newCutId(),
      start: grid(placed.start),
      end: grid(placed.end),
    };
    const tidy = tidyCuts([...cuts, next], trim);
    setCuts(tidy);
    setSelectedCut(next.id);
    setSelectedZoom(null);
    video.currentTime = afterCuts(trim, tidy, video.currentTime);
  }, [copied, cuts, duration, trim, zooms]);

  /**
   * Everything undo walks back: the four edits plus a soundtrack's placement.
   *
   * The track's own file is not in here. Undo moves where a sound sits, never
   * whether there is one: bringing a removed file back would mean holding a
   * Blob per history entry, and removing one already confirms.
   */
  const editState = useMemo(
    () => ({
      trim,
      cuts,
      speed,
      zooms,
      fades,
      marks,
      splits,
      placement: soundtrack
        ? {
            offset: soundtrack.offset,
            start: soundtrack.start,
            end: soundtrack.end,
          }
        : null,
    }),
    [trim, cuts, speed, zooms, fades, marks, splits, soundtrack],
  );

  const restoreEdits = useCallback((next: typeof editState) => {
    setTrim(next.trim);
    setCuts(next.cuts);
    setSpeed(next.speed);
    setZooms(next.zooms);
    setFades(next.fades);
    setMarks(next.marks);
    setSplits(next.splits);
    setSelectedPiece(null);
    setSelectedJoin(null);
    // A selection is a view of the state rather than part of it, and the
    // region it named may be the one coming back or going away.
    setSelectedZoom(null);
    setSelectedCut(null);
    setSelectedFade(null);
    setSelectedMark(null);
    if (next.placement) {
      setSoundtrack((previous) =>
        previous ? { ...previous, ...next.placement } : previous,
      );
    }
  }, []);

  const history = useEditHistory({
    state: editState,
    restore: restoreEdits,
    // Any picture, since marks are edits on an image too.
    enabled: restored && media !== null,
  });
  const { undo, redo } = history;

  useEffect(() => {
    resetHistoryRef.current = history.reset;
    undoRef.current = history.undo;
  }, [history.reset, history.undo]);

  const addMark = useCallback((mark: Mark) => {
    setMarks((previous) => [...previous, mark]);
    setSelectedMark(mark.id);
  }, []);

  const updateMark = useCallback((next: Mark) => {
    setMarks((previous) => previous.map((m) => (m.id === next.id ? next : m)));
  }, []);

  const removeMark = useCallback(() => {
    setMarks((previous) => previous.filter((m) => m.id !== removeMarkId));
    setSelectedMark(null);
    setRemoveMarkId(null);
  }, [removeMarkId]);

  /** The Delete key's removal, which undo covers, so it does not confirm. */
  const deleteSelectedMark = useCallback(() => {
    if (!selectedMark) return;
    setMarks((previous) => previous.filter((m) => m.id !== selectedMark));
    setSelectedMark(null);
    toast("Mark removed", { action: { label: "Undo", onClick: () => undo() } });
  }, [selectedMark, undo]);

  /**
   * A drag on a mark pauses a clip and leaves it paused, like every other drag
   * on the picture: the frame under the mark is what decides where it goes.
   */
  const handleMarkGesture = useCallback((active: boolean) => {
    if (active) videoRef.current?.pause();
  }, []);

  /**
   * Reads the whole clip's motion, once. Progress lands on the toggle, the
   * result is kept for the session and stored with the draft, and nothing
   * afterwards, not a drag, not a second region, starts it again.
   */
  const startMotionRead = useCallback(
    (then?: (track: MotionTrack) => void) => {
    if (media?.kind !== "video" || !media.blob || !media.duration) return;
    if (motionReadRef.current) return;

    const read = readMotion(
      { source: media.blob, from: 0, to: media.duration },
      setMotionProgress,
    );
    motionReadRef.current = read;
    setMotionProgress(0);

    read.track
      .then((track) => {
        setMotion(track);
        if (dimensions) {
          writeMotion({
            of: {
              name: media.name,
              width: dimensions.w,
              height: dimensions.h,
              duration: media.duration ?? 0,
            },
            samples: track.samples,
            clicks: track.clicks,
          });
        }
        then?.(track);
      })
      .catch((error: Error) => {
        // A cancel is a clip change, which has already said what it needs to.
        if (error.name !== "AbortError") toast.error(error.message);
      })
      .finally(() => {
        if (motionReadRef.current === read) motionReadRef.current = null;
        setMotionProgress(null);
      });
    },
    [dimensions, media],
  );

  /**
   * The follow toggle. Switching off is free. Switching on is free too once
   * the clip's motion has been read, and otherwise asks first, since the read
   * decodes every frame and a heavy job should never start on a press that
   * did not say so.
   */
  const toggleFollow = useCallback(
    (region: ZoomRegion) => {
      if (region.follow) {
        updateZoom({ ...region, follow: false });
      } else if (motion || motionReadRef.current) {
        updateZoom({ ...region, follow: true });
      } else {
        setMotionAsk({ kind: "follow", region });
      }
    },
    [motion, updateZoom],
  );

  /**
   * Suggested regions, from the clip's clicks and dwells, over what is free.
   * Shown only while asked for, and a press on one adds it. Recomputed as
   * regions change, so accepting one takes it off the lane by itself.
   */
  const suggestions = useMemo<ZoomSuggestion[]>(
    () =>
      suggesting && motion && duration
        ? suggestZooms(motion, duration, zooms)
        : [],
    [suggesting, motion, duration, zooms],
  );

  const nothingToSuggest = useCallback(() => {
    toast("Nothing stood out to zoom on in this clip");
    setSuggesting(false);
  }, []);

  const toggleSuggest = useCallback(() => {
    if (suggesting) {
      setSuggesting(false);
    } else if (motion) {
      if (duration && suggestZooms(motion, duration, zooms).length === 0) {
        nothingToSuggest();
      } else {
        setSuggesting(true);
      }
    } else {
      setMotionAsk({ kind: "suggest" });
    }
  }, [duration, motion, nothingToSuggest, suggesting, zooms]);

  const confirmMotion = useCallback(() => {
    const ask = motionAsk;
    setMotionAsk(null);
    if (!ask) return;

    if (ask.kind === "follow") {
      updateZoom({ ...ask.region, follow: true });
      startMotionRead();
    } else if (ask.kind === "ripples") {
      startMotionRead();
    } else {
      setSuggesting(true);
      startMotionRead((track) => {
        if (duration && suggestZooms(track, duration, zoomsRef.current).length === 0) {
          nothingToSuggest();
        }
      });
    }
  }, [duration, motionAsk, nothingToSuggest, startMotionRead, updateZoom]);

  /** A suggestion becomes a following region, selected, snapped to the grid. */
  const acceptSuggestion = useCallback((suggestion: ZoomSuggestion) => {
    const grid = (seconds: number) => Math.round(seconds * EDIT_FPS) / EDIT_FPS;
    const region: ZoomRegion = {
      id: newZoomId(),
      start: grid(suggestion.start),
      end: grid(suggestion.end),
      scale: DEFAULT_ZOOM_LEVEL,
      focus: suggestion.focus,
      follow: true,
    };
    setZooms((previous) =>
      [...previous, region].sort((a, b) => a.start - b.start),
    );
    setSelectedZoom(region.id);
    setSelectedCut(null);
  }, []);

  const motionWait =
    dimensions && media?.duration
      ? describeWait(
          estimateMotionSeconds(dimensions.w, dimensions.h, media.duration),
        )
      : "a moment";

  // Only for a target shape, which is the only thing that reads it.
  useEffect(() => {
    const node = artworkRef.current;
    if (!node) return;

    const observer = new ResizeObserver(() =>
      setArtwork({ width: node.offsetWidth, height: node.offsetHeight }),
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [media]);

  // Track the frame's natural size, and refit while the mode is "fit". This is
  // what keeps a padding or radius change from overflowing the canvas: the
  // frame resizes, this fires, and the zoom follows it. Observing the scroller
  // too means a window or panel resize refits as well.
  useEffect(() => {
    const frame = screenshotRef.current;
    const scroller = scrollerRef.current;
    if (!frame || !scroller) {
      setFrameSize({ width: 0, height: 0 });
      return;
    }

    const measure = () => {
      const size = { width: frame.offsetWidth, height: frame.offsetHeight };
      setFrameSize(size);

      if (zoomModeRef.current === "fit") {
        setZoom(
          zoomToFit(
            { width: scroller.clientWidth, height: scroller.clientHeight },
            size,
            CANVAS_PADDING * 2 + FIT_SLACK,
          ),
        );
      }
    };

    const observer = new ResizeObserver(measure);
    observer.observe(frame);
    observer.observe(scroller);
    return () => observer.disconnect();
  }, [media]);

  // Cmd/Ctrl + wheel, which is also what a trackpad pinch sends.
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;

    const handleWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      setZoomMode("manual");
      setZoom((current) => clampZoom(current * (1 - e.deltaY / 300)));
    };

    scroller.addEventListener("wheel", handleWheel, { passive: false });
    return () => scroller.removeEventListener("wheel", handleWheel);
  }, [media]);

  // Restore the draft. Reading on the client only: localStorage does not
  // exist while rendering on the server, and seeding state from it would
  // produce a hydration mismatch.
  //
  // `restored` flips only once the media is in place and its edits applied.
  // It used to flip as soon as the record was read, while the file was still
  // being probed, and the persist effects then ran against the defaults: the
  // media effect deleted the Blob and rewrote it a moment later, forty
  // megabytes for nothing on every reload, and the edits effect deleted the
  // edits before the restore had read them.
  useEffect(() => {
    let cancelled = false;

    readMedia()
      .catch(() => null)
      .then((stored) => {
        if (cancelled) return;

        setStyleOptions(readStyle(DEFAULT_STYLE));
        setLooks(readLooks());
        const done = () => {
          if (!cancelled) setRestored(true);
        };
        // Put back only onto the picture they were drawn on, matched the way
        // the edits are, so marks never land on a different screenshot.
        const restoreMarks = (name: string | undefined, w: number, h: number) =>
          readMarks()
            .catch(() => null)
            .then((stored) => {
              if (
                !cancelled &&
                stored &&
                stored.of.width === w &&
                stored.of.height === h &&
                stored.of.name === name
              ) {
                setMarks(tidyMarks(stored.marks));
                resetHistoryRef.current?.();
              }
            });

        if (stored?.kind === "image" && typeof stored.payload === "string") {
          const probe = new Image();
          probe.onload = () => {
            setMedia({ kind: "image", src: probe.src, name: stored.name });
            setDimensions({ w: probe.naturalWidth, h: probe.naturalHeight });
            void restoreMarks(
              stored.name,
              probe.naturalWidth,
              probe.naturalHeight,
            ).then(done);
          };
          probe.onerror = done;
          probe.src = stored.payload;
        } else if (stored?.kind === "video" && stored.payload instanceof Blob) {
          // Back through the same loader the drop path uses, so a restored
          // video is measured and rejected on exactly the same terms.
          const file = new File([stored.payload], stored.name ?? "clyp", {
            type: stored.payload.type,
          });
          const audio = stored.audio;

          loadMediaFile(file)
            .then(async (loaded) => {
              // The edits and the soundtrack are restored from in here, after
              // the media they belong to: `loadMedia` resets every edit and
              // clears the soundtrack, since edits made on a clip that has
              // been replaced mean nothing, so run side by side the restore
              // lost about half the time.
              loadMedia(loaded);
              const length = loaded.media.duration ?? 0;

              // Applied only when the restored clip is the one the edits were
              // made on, so a stale record never cuts a different file.
              const edits = await readEdits().catch(() => null);
              const kept =
                edits &&
                edits.of.width === loaded.width &&
                edits.of.height === loaded.height &&
                Math.abs(edits.of.duration - length) < 0.01
                  ? edits
                  : null;
              if (kept) applyEdits(kept, length);
              await restoreMarks(loaded.media.name, loaded.width, loaded.height);
              done();

              // The motion track is derived from the file, but reading it is
              // the one heavy job here and it was asked for once, so it comes
              // back rather than being asked for again. Same match as the edits.
              readStoredMotion()
                .catch(() => null)
                .then((stored) => {
                  if (
                    stored &&
                    stored.of.width === loaded.width &&
                    stored.of.height === loaded.height &&
                    Math.abs(stored.of.duration - length) < 0.01
                  ) {
                    setMotion({
                      samples: stored.samples,
                      clicks: stored.clicks ?? new Float32Array(0),
                    });
                  }
                });

              if (!audio) return;
              // Back through the same loader an upload uses, which re-measures
              // it and mints a fresh object URL. Where it sat is put back from
              // the edits, clamped to the file.
              const track = new File([audio], stored.audioName ?? "audio", {
                type: audio.type,
              });
              loadSoundtrack(track, length)
                .then((next) => {
                  const place = kept?.soundtrack;
                  setSoundtrack(
                    place
                      ? {
                          ...next,
                          offset: clamp(place.offset, 0, next.duration),
                          start: clamp(place.start, 0, next.duration),
                          end: clamp(place.end, place.start, next.duration),
                        }
                      : next,
                  );
                })
                .catch(() => undefined);
            })
            .catch((error: Error) => {
              toast.error(error.message);
              done();
            });
        } else {
          done();
        }
      });

    return () => {
      cancelled = true;
    };
  }, [applyEdits, loadMedia]);

  // Persist. Both skip until the restore has run.
  useEffect(() => {
    if (!restored) return;

    if (!media) {
      deleteMedia();
      return;
    }
    // A video stores the file, not the object URL: a `blob:` URL is only valid
    // for the document that made it, so a stored one restores as a dead link.
    writeMedia({
      kind: media.kind,
      payload: media.kind === "video" ? (media.blob as Blob) : media.src,
      name: media.name,
      // The file, never the object URL, for the same reason the video is
      // stored that way. Only the blob's identity is in the dependency list,
      // so dragging the region does not rewrite either of them.
      audio: soundtrack?.blob,
      audioName: soundtrack?.name,
    });
  }, [media, restored, soundtrack?.blob, soundtrack?.name]);

  useEffect(() => {
    if (!restored) return;
    writeStyle(styleOptions);
  }, [styleOptions, restored]);

  /**
   * The edits, written a moment after they settle.
   *
   * A drag rewrites the trim or a region on every frame, and a write per frame
   * is sixty transactions a second for nothing, so the write waits for a pause.
   * The record names the clip it belongs to, so the restore can refuse edits
   * made on a different file. An image has none of these and clears the key.
   */
  useEffect(() => {
    if (!restored) return;

    if (!media || media.kind !== "video" || !trim || !dimensions) {
      deleteEdits();
      deleteMotion();
      return;
    }

    const record: StoredEdits = {
      of: {
        name: media.name,
        width: dimensions.w,
        height: dimensions.h,
        duration: media.duration ?? 0,
      },
      trim,
      cuts,
      splits,
      speed,
      zooms,
      fades,
      soundtrack: soundtrack
        ? {
            offset: soundtrack.offset,
            start: soundtrack.start,
            end: soundtrack.end,
          }
        : undefined,
    };
    const timer = window.setTimeout(() => writeEdits(record), EDITS_DEBOUNCE);
    return () => window.clearTimeout(timer);
  }, [
    restored,
    media,
    dimensions,
    trim,
    cuts,
    splits,
    speed,
    zooms,
    fades,
    soundtrack,
  ]);

  // The marks, on the same debounce as the edits. Written under the picture
  // they belong to, and cleared with it.
  useEffect(() => {
    if (!restored) return;

    if (!media || !dimensions || marks.length === 0) {
      deleteMarks();
      return;
    }
    const record = {
      of: { name: media.name, width: dimensions.w, height: dimensions.h },
      marks,
    };
    const timer = window.setTimeout(() => writeMarks(record), EDITS_DEBOUNCE);
    return () => window.clearTimeout(timer);
  }, [restored, media, dimensions, marks]);

  useEffect(() => {
    if (!restored) return;
    writeLooks(looks);
  }, [looks, restored]);

  // Paste anywhere on the page drops an image onto the canvas.
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (const item of items) {
        const kind = kindOf(item.type);
        if (!kind) continue;

        const file = item.getAsFile();
        if (!file) continue;

        if (kind === "audio") addSoundtrack(file);
        else readMediaFile(file, loadMedia);
        break;
      }
    };

    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, [addSoundtrack, loadMedia]);

  /**
   * Whether the style is anything other than the default.
   *
   * Compared as a whole rather than field by field, so a control added later
   * is covered without anyone remembering to add it here.
   */
  const canResetStyle =
    JSON.stringify(styleOptions) !== JSON.stringify(DEFAULT_STYLE);

  /**
   * Puts every control back. Confirmed first: undo covers the clip's edits and
   * deliberately not the style, so this is the one action in the panel with
   * nothing behind it.
   */
  const resetStyle = useCallback(() => {
    setPreviousGradientCss(resolveGradientCss(styleOptions));
    setStyleOptions(DEFAULT_STYLE);
    setResetStyleOpen(false);
  }, [styleOptions]);

  /**
   * Applying a look is one press and cheap to reverse, so it does not ask.
   * The style has no undo of its own, so the toast carries one.
   */
  const handleApplyLook = useCallback(
    (look: Look) => {
      const before = styleOptions;
      setPreviousGradientCss(resolveGradientCss(before));
      setStyleOptions(applyLook(before, look));
      toast(`Applied ${look.name}`, {
        action: {
          label: "Undo",
          onClick: () => {
            setPreviousGradientCss(resolveGradientCss(applyLook(before, look)));
            setStyleOptions(before);
          },
        },
      });
    },
    [styleOptions],
  );

  const saveLook = useCallback(() => {
    const name = lookName.trim() || nextLookName(looks);
    setLooks((previous) => [
      ...previous,
      { id: newLookId(), name, style: lookFrom(styleOptions) },
    ]);
    setSaveLookOpen(false);
    setLookName("");
    toast.success(`Saved ${name}`);
  }, [lookName, looks, styleOptions]);

  const confirmDeleteLook = useCallback(() => {
    setLooks((previous) => previous.filter((l) => l.id !== deleteLook?.id));
    setDeleteLook(null);
  }, [deleteLook]);

  /**
   * The custom gradient, from the picture's own colours. The picture is drawn
   * into a small canvas first: a few thousand pixels say as much about its
   * colours as a few million, and reading them back is the slow part.
   */
  const matchPicture = useCallback(() => {
    const source: CanvasImageSource | null | undefined =
      media?.kind === "video"
        ? videoRef.current
        : screenshotRef.current?.querySelector("img");
    if (!source) return;

    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    try {
      ctx.drawImage(source, 0, 0, 64, 64);
      const { from, to } = paletteFrom(ctx.getImageData(0, 0, 64, 64).data);
      setPreviousGradientCss(resolveGradientCss(styleOptions));
      setStyleOptions({
        ...styleOptions,
        background: "custom",
        customGradientFrom: from,
        customGradientTo: to,
      });
    } catch {
      toast.error("The picture's colours could not be read");
    }
  }, [media?.kind, styleOptions]);

  const openExportModal = useCallback((action: "copy" | "download") => {
    setExportAction(action);
    setExportModalOpen(true);
  }, []);

  // Cmd/Ctrl+S downloads, Cmd/Ctrl+Shift+C copies the picture, Cmd/Ctrl+Z walks
  // the edits back and Shift+Z walks them forward, and Cmd/Ctrl+C and +V copy
  // and paste the selected lane instance.
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (!media) return;
      // Escape puts the tool down, so a press on the picture selects again.
      if (e.key === "Escape" && markTool) {
        setMarkTool(null);
        return;
      }

      // A field being typed in keeps its own keys: its own undo stack, which
      // is the browser's and is about the text, and its own Backspace.
      const target = e.target as HTMLElement | null;
      const typing =
        target?.isContentEditable ||
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA";

      // Delete takes the selected mark off from anywhere on the page, not only
      // while the mark has focus: a mark is selected the moment it is drawn,
      // and reaching for Tab first to delete it is not what anyone does. It
      // does not ask, since Cmd+Z brings it back and the toast says so. A lane
      // that already answered the key, for its own zoom or cut, keeps it.
      if (
        (e.key === "Delete" || e.key === "Backspace") &&
        selectedMark &&
        !typing &&
        !e.defaultPrevented
      ) {
        e.preventDefault();
        deleteSelectedMark();
        return;
      }
      // The same for a piece of the clip, which undo also brings back.
      if (
        (e.key === "Delete" || e.key === "Backspace") &&
        selectedPiece !== null &&
        !typing &&
        !e.defaultPrevented
      ) {
        e.preventDefault();
        deletePiece();
        return;
      }
      // And for a join between touching pieces, which joins them back.
      if (
        (e.key === "Delete" || e.key === "Backspace") &&
        selectedJoin !== null &&
        !typing &&
        !e.defaultPrevented
      ) {
        e.preventDefault();
        removeSplit(selectedJoin);
        return;
      }
      // S splits at the playhead, the key most editors give it. A plain key,
      // so only outside a field and never with a modifier held.
      if (
        e.key.toLowerCase() === "s" &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey &&
        !typing &&
        media.kind === "video"
      ) {
        e.preventDefault();
        splitAtPlayhead();
        return;
      }

      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;

      // The same two gates the buttons carry. Cmd+S has to be swallowed either
      // way, or the browser offers to save the page.
      if (e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (!downloadBlocked) openExportModal("download");
      } else if (e.shiftKey && e.key.toLowerCase() === "c") {
        e.preventDefault();
        openExportModal("copy");
      } else if (!typing && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (!typing && !e.shiftKey && e.key.toLowerCase() === "c") {
        // Never over a real copy. Text the reader has selected is theirs, and
        // Cmd+Shift+C is the picture, so this is only ever the lane.
        if (window.getSelection()?.toString()) return;
        e.preventDefault();
        copySelection();
      } else if (!typing && e.key.toLowerCase() === "v") {
        e.preventDefault();
        pasteCopied();
      }
    };

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
    // The two callbacks rather than the history object, which is a fresh one
    // every render: this binds a window listener, and a drag renders per frame.
  }, [
    media,
    markTool,
    selectedMark,
    deleteSelectedMark,
    selectedPiece,
    deletePiece,
    selectedJoin,
    removeSplit,
    splitAtPlayhead,
    openExportModal,
    downloadBlocked,
    undo,
    redo,
    copySelection,
    pasteCopied,
  ]);

  /**
   * One still of the frame at a size, with the blurs baked in. Every PNG path
   * goes through this: one size, a carousel, several sizes and a copy.
   */
  const still = useCallback(
    async (size: RasterSize) => {
      const frame = screenshotRef.current;
      if (!frame) throw new Error("There is nothing to export");
      if (!backdrop) return bakeBlurs(await rasterize(frame, size), frame);

      // A moving background is the frame on screen: the phase the live layer
      // last drew, read off its canvas, painted under a raster without it.
      const raster = await rasterize(frame, size, { dropBackdrop: true });
      return bakeBlurs(
        await underBackdrop(raster, frame, backdrop, shownPhase(frame, backdrop.moment)),
        frame,
      );
    },
    [backdrop],
  );

  const handleExport = useCallback(
    async (options: ExportOptions) => {
      const frame = screenshotRef.current;
      if (!media || !frame) return;

      const sizes = options.sizes ?? [];
      // The name everything is saved under, less its extension, which each
      // branch imposes for itself.
      const base = filenameFor(options.filename, "png", media.name).slice(0, -4);

      setExporting(true);
      setProgress(exportsVideo ? 0 : null);
      try {
        if (sizes.length > 0) {
          // Each size is its own shape around the same artwork, so the frame is
          // laid out at each in turn, synchronously, and rasterized there. The
          // override also switches the frame's easing off, or the raster would
          // catch the box halfway between two shapes.
          const entries: { name: string; data: Uint8Array }[] = [];
          try {
            for (const id of sizes) {
              const t = getTemplate(id);
              if (!t) continue;
              flushSync(() => setSizeOverride(id));
              const url = await still({ width: t.width, height: t.height });
              entries.push({
                name: `${base}-${slug(templateName(t))}-${t.width}x${t.height}.png`,
                data: await bytesOf(url),
              });
            }
          } finally {
            flushSync(() => setSizeOverride(null));
          }
          const names = uniqueNames(entries.map((e) => e.name));
          const archive = zip(entries.map((e, i) => ({ ...e, name: names[i] })));
          downloadBlob(
            new Blob([archive.buffer as ArrayBuffer], { type: "application/zip" }),
            filenameFor(options.filename, "zip", media.name),
          );
          toast.success(`${entries.length} sizes downloaded`);
        } else if (exportsVideo && loop !== null && backdrop) {
          const controller = new AbortController();
          abortRef.current = controller;

          const blob = await exportLoop({
            frame,
            size: template ? outputFor(template) : options.quality,
            backdrop,
            seconds: loop,
            fps: options.fps,
            onProgress: setProgress,
            signal: controller.signal,
          });
          downloadBlob(blob, filenameFor(options.filename, "mp4", media.name));
          toast.success("Video downloaded");
        } else if (exportsVideo) {
          const box = clipBoxRef.current;
          if (!box || !media.blob || !trim) {
            throw new Error("That clip is not loaded");
          }

          const controller = new AbortController();
          abortRef.current = controller;

          const layer = marksLayerRef.current;
          const blurs = marks.filter((m) => m.kind === "blur");
          const blob = await exportVideo({
            frame,
            box,
            source: media.blob,
            size: template ? outputFor(template) : options.quality,
            trim,
            cuts,
            splits,
            speed,
            fades,
            zooms,
            motion,
            audio: options.audio,
            soundtrack: soundtrack ?? undefined,
            music: options.music,
            fps: options.fps,
            marks:
              layer && marks.length > 0
                ? {
                    layer,
                    picture,
                    drawn: marks.length > blurs.length,
                    blurs: blurs.map((m) => ({
                      ...normalized(m),
                      radius: blurRadius(picture.width) / picture.width,
                    })),
                  }
                : undefined,
            ripples: styleOptions.clickRipples ? motion?.clicks : null,
            backdrop,
            onProgress: setProgress,
            signal: controller.signal,
          });
          downloadBlob(blob, filenameFor(options.filename, "mp4", media.name));
          toast.success("Video downloaded");
        } else {
          const dataUrl = await still(
            template ? outputFor(template, slides) : options.quality,
          );

          if (exportAction === "copy") {
            const blob = await fetch(dataUrl).then((res) => res.blob());
            await navigator.clipboard.write([
              new ClipboardItem({ [blob.type]: blob }),
            ]);
            toast.success("Copied to clipboard");
          } else if (template && slides > 1) {
            // A carousel is one raster of the whole strip, cut at the seams,
            // so the artwork crosses from one slide to the next unbroken.
            const parts = await slice(dataUrl, slideRects(template, slides));
            const archive = zip(
              await Promise.all(
                parts.map(async (part, i) => ({
                  name: `${base}-${i + 1}.png`,
                  data: new Uint8Array(await part.arrayBuffer()),
                })),
              ),
            );
            downloadBlob(
              new Blob([archive.buffer as ArrayBuffer], { type: "application/zip" }),
              filenameFor(options.filename, "zip", media.name),
            );
            toast.success(`${slides} slides downloaded`);
          } else {
            download(dataUrl, filenameFor(options.filename, "png", media.name));
            toast.success("Image downloaded");
          }
        }

        setExportModalOpen(false);
      } catch (err) {
        // A cancel is not a failure. The user asked for the dialog to go away,
        // so it goes away and says nothing.
        if (err instanceof DOMException && err.name === "AbortError") {
          setExportModalOpen(false);
          return;
        }

        console.error("Failed to export:", err);
        toast.error(
          err instanceof Error && err.message
            ? err.message
            : "Export failed. Please try again.",
        );
      } finally {
        abortRef.current = null;
        setExporting(false);
        setProgress(null);
      }
    },
    [
      exportAction,
      exportsVideo,
      loop,
      backdrop,
      media,
      motion,
      soundtrack,
      speed,
      trim,
      cuts,
      zooms,
      fades,
      marks,
      picture,
      slides,
      splits,
      still,
      styleOptions.clickRipples,
      template,
    ],
  );

  const handleCancelExport = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  /**
   * Starts the preview, and gives up its sound rather than its picture.
   *
   * This is why the element carries no `autoPlay`: the attribute offers no way
   * to hear a refusal. A browser blocks playback with sound until the page has
   * been interacted with, and answers a blocked autoplay by simply not
   * playing, which shows as a frozen first frame. Dropping a file is itself
   * that interaction, so the common path plays with sound. A restore on page
   * load is the path with no gesture behind it, and that one is muted and
   * retried.
   */
  const source = media?.kind === "video" ? media.src : null;

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !source) return;

    video.play().catch(() => {
      setMuted(true);
      video.muted = true;
      void video.play().catch(() => {});
    });
  }, [source]);

  // The rate is an element property rather than an attribute, and it outlives
  // a `src` change, which is why a new clip resets the state to 1 as well.
  useEffect(() => {
    const video = videoRef.current;
    if (video) video.playbackRate = speed;
  }, [speed, source]);

  /**
   * The zoom, applied to the preview every frame.
   *
   * A transform on the `<video>` inside its box, which is what holds still and
   * carries the radius and the shadow, so the picture grows inside its own
   * corners. The regions are read from a ref because a drag rewrites them on
   * every frame and this is bound once per clip. While the focus marker is
   * being dragged the picture is shown plain, so the point is placed on the
   * picture rather than on a moving enlargement of it.
   */
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !source) return;

    let frame = 0;
    let drew = false;
    // The layer mounts with the video, so the one here is the one to reset.
    const marksLayer = marksLayerRef.current;
    const apply = () => {
      frame = requestAnimationFrame(apply);

      const zoomed = aimingRef.current
        ? null
        : zoomAt(zoomsRef.current, video.currentTime, speed, motionRef.current);

      // A join's transition, on the output's clock, from the same arithmetic
      // the encode uses. A zoom transition pushes in on top of any region.
      const range = trimRef.current;
      const joins = range
        ? joinsOf(range, cutsRef.current, speed, splitsRef.current)
        : [];
      const out = range
        ? outputAt(keptSegments(range, cutsRef.current), video.currentTime) / speed
        : 0;
      const move = transitionAt(joins, out);
      const state =
        move.scale !== 1
          ? {
              scale: (zoomed?.scale ?? 1) * move.scale,
              focus: zoomed?.focus ?? { x: 0.5, y: 0.5 },
            }
          : zoomed;

      const blur = move.blur
        ? `blur(${move.blur * TRANSITION_BLUR * video.offsetWidth}px)`
        : "";
      if (video.style.filter !== blur) video.style.filter = blur;

      const dip = dipRef.current;
      if (dip) {
        const alpha = `${move.veil?.alpha ?? 0}`;
        if (dip.style.opacity !== alpha) dip.style.opacity = alpha;
        if (move.veil) dip.style.backgroundColor = move.veil.color;
      }

      // A dissolve fades the last frame before the join out over the part
      // after it. The frame is kept by drawing the picture into a canvas on
      // every frame outside a dissolve, so on the first frame past the join
      // it still holds the frame before it. Only while playing: a paused
      // playhead has no frame before it to have held.
      const held = heldRef.current;
      if (held) {
        const showing = !video.paused && move.dissolve > 0;
        if (hasDissolve(joins) && !video.paused && move.dissolve === 0) {
          held.getContext("2d")?.drawImage(video, 0, 0, held.width, held.height);
        }
        const opacity = `${showing ? move.dissolve : 0}`;
        if (held.style.opacity !== opacity) held.style.opacity = opacity;
      }
      // The fade rides on the same loop. Written only on a change, like the
      // transform, so a still preview costs no style writes at all. A
      // whole-frame fade veils the composite instead of dimming the picture,
      // which is what the export does with it too.
      const fade = fadeAt(fadesRef.current, video.currentTime);
      const opacity = `${fade.media}`;
      if (video.style.opacity !== opacity) video.style.opacity = opacity;
      const veil = veilRef.current;
      const shade = `${fade.veil}`;
      if (veil && veil.style.opacity !== shade) veil.style.opacity = shade;

      const transform = state && state.scale > 1.0001 ? `scale(${state.scale})` : "";
      const origin = state ? `${state.focus.x * 100}% ${state.focus.y * 100}%` : "";
      if (video.style.transform !== transform) video.style.transform = transform;
      if (video.style.transformOrigin !== origin) {
        video.style.transformOrigin = origin;
      }

      // The marks ride the picture's own transform and fade, so a blur stays
      // on what it hides while the picture grows under it.
      const layer = marksLayerRef.current;
      if (layer) {
        if (layer.style.transform !== transform) layer.style.transform = transform;
        if (layer.style.transformOrigin !== origin) {
          layer.style.transformOrigin = origin;
        }
        if (layer.style.opacity !== opacity) layer.style.opacity = opacity;
      }

      // Cleared only when something was drawn, so a clip with no clicks on
      // screen costs no canvas work at all.
      const canvas = rippleCanvasRef.current;
      const clicks = ripplesOnRef.current ? motionRef.current?.clicks : null;
      const shown = clicks ? ripplesAt(clicks, video.currentTime) : [];
      const pen = canvas?.getContext("2d");
      if (canvas && pen && (shown.length > 0 || drew)) {
        pen.clearRect(0, 0, canvas.width, canvas.height);
        for (const ripple of shown) {
          drawRipple(
            pen,
            ripple.x * canvas.width,
            ripple.y * canvas.height,
            canvas.width,
            ripple.progress,
          );
        }
        drew = shown.length > 0;
      }

      // The marker of a following region shows where the action is, written
      // here like the playhead rather than rendered: it moves every frame.
      // Projected through the zoom, since the marker sits beside the video
      // rather than inside its transform: a point of the picture shows at the
      // focus plus its distance from the focus times the scale. The hand-aimed
      // marker needs none of this, because the focus is the one point a
      // transform leaves where it was.
      const marker = liveMarkerRef.current;
      const region = zoomsRef.current.find((r) => r.id === selectedZoomRef.current);
      if (marker && region?.follow) {
        const track = motionRef.current;
        const at = (track && motionAt(track, video.currentTime)) ?? region.focus;
        const shown = state
          ? {
              x: state.focus.x + (at.x - state.focus.x) * state.scale,
              y: state.focus.y + (at.y - state.focus.y) * state.scale,
            }
          : at;
        marker.style.left = `${shown.x * 100}%`;
        marker.style.top = `${shown.y * 100}%`;
      }
    };

    frame = requestAnimationFrame(apply);
    return () => {
      cancelAnimationFrame(frame);
      video.style.transform = "";
      video.style.transformOrigin = "";
      video.style.filter = "";
      if (marksLayer) {
        marksLayer.style.transform = "";
        marksLayer.style.transformOrigin = "";
      }
    };
  }, [source, speed]);

  /**
   * A track that has just arrived does not start playing.
   *
   * The canvas autoplays, so without this the whole of a dropped file starts
   * at whatever volume it was mastered at, from wherever the playhead happened
   * to be. Pausing hands the first press back to the reader, which is also the
   * position they want to hear it from. Keyed on the file rather than the
   * soundtrack, so moving or slipping it does not keep stopping playback.
   */
  const arrived = soundtrack?.blob;

  useEffect(() => {
    if (!arrived) return;
    videoRef.current?.pause();
  }, [arrived]);

  /**
   * Keeps the soundtrack in step with the picture.
   *
   * The element is driven rather than played on its own: the video is the
   * clock, and the sound is placed against it. Corrected only past a
   * threshold, since writing `currentTime` every frame is a seek every frame,
   * which stutters far worse than the drift it would be fixing.
   */
  useEffect(() => {
    const audio = audioRef.current;
    const video = videoRef.current;
    if (!audio || !video || !soundtrack) return;

    let frame = 0;
    const follow = () => {
      frame = requestAnimationFrame(follow);

      // The region is anchored to a source frame and the track keeps its own
      // tempo, so the distance past the anchor is read on the output's clock,
      // which at 2x runs half as fast as the element's.
      const at =
        (video.currentTime - soundtrack.offset) / speed + soundtrack.start;
      const inside = at >= soundtrack.start && at < soundtrack.end;

      if (!inside || video.paused) {
        if (!audio.paused) audio.pause();
        return;
      }

      if (Math.abs(audio.currentTime - at) > 0.12) audio.currentTime = at;
      // Autoplay can refuse until the page has been interacted with. Adding a
      // track is an interaction, so this normally resolves, and a refusal is
      // silence rather than a broken preview.
      if (audio.paused) void audio.play().catch(() => {});
    };

    frame = requestAnimationFrame(follow);
    return () => {
      cancelAnimationFrame(frame);
      audio.pause();
    };
  }, [soundtrack, speed]);

  // The trim bar reads the preview's clock and hands these back, since a ref
  // passed down as a prop belongs to whoever created it.
  const handleSeek = useCallback((time: number) => {
    const video = videoRef.current;
    if (video) video.currentTime = time;
  }, []);

  /**
   * Play or pause, from wherever it is asked for.
   *
   * One rule, held here because this owns both the element and the trim, and
   * because three things now ask for it: the transport button, the spacebar,
   * and a click on the picture. A clip parked at its own out point plays
   * nothing, so pressing play there starts it over, which is only reachable
   * with looping off.
   */
  const togglePlayback = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    // Read before anything is done to the element, and captured rather than
    // read inside the updater: React runs an updater when it processes the
    // update, which is after `pause()` below has already flipped this, so the
    // flash showed the glyph for the state it had just left.
    const wasPaused = video.paused;
    setPulse((last) => ({ id: (last?.id ?? 0) + 1, playing: wasPaused }));

    if (!video.paused) {
      video.pause();
      return;
    }

    // A frame and a half of tolerance, not one. Stopping parks the playhead a
    // frame short of the out point, and the element then snaps that to its own
    // nearest frame, which can land just under an exactly-one-frame test. It
    // then plays for a few milliseconds, hits the out point, and stops again.
    if (trim && video.currentTime >= trim.end - 1.5 / EDIT_FPS) {
      video.currentTime = trim.start;
    }
    void video.play().catch(() => {});
  }, [trim]);

  const handlePlayback = useCallback((playing: boolean) => {
    const video = videoRef.current;
    if (!video) return;

    // Caught, because this is asked for once a frame while a loop wraps and a
    // refusal there would be an unhandled rejection per frame.
    if (playing) void video.play().catch(() => {});
    else video.pause();
  }, []);

  const handleStyleChange = useCallback(
    (newOptions: Partial<StyleOptions>) => {
      const next = { ...styleOptions, ...newOptions };
      // Holding a moving background holds it where it is, so the picture does
      // not jump back to the last moment someone chose.
      const frame = screenshotRef.current;
      if (
        frame &&
        next.backgroundSpeed === 0 &&
        styleOptions.backgroundSpeed !== 0 &&
        newOptions.backgroundMoment === undefined
      ) {
        next.backgroundMoment = shownPhase(frame, next.backgroundMoment);
      }
      const before = resolveGradientCss(styleOptions);

      if (before !== resolveGradientCss(next)) setPreviousGradientCss(before);
      setStyleOptions(next);
    },
    [styleOptions],
  );

  const handleClear = useCallback(() => {
    setMedia((previous) => {
      if (previous?.kind === "video") URL.revokeObjectURL(previous.src);
      return null;
    });
    setDimensions(null);
    setTrim(null);
    setCuts([]);
    setSelectedCut(null);
    setSplits([]);
    setSelectedPiece(null);
    setSelectedJoin(null);
    setFades([]);
    setSelectedFade(null);
    setSpeed(1);
    setZooms([]);
    setSelectedZoom(null);
    setMarks([]);
    setSelectedMark(null);
    removeSoundtrack();
    setZoom(1);
    setZoomMode("fit");
    setClearOpen(false);
    // The style stays, as the dialog says. It is the frame, not the picture,
    // and the next drop wants the same frame.
  }, [removeSoundtrack]);

  return (
    <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1fr)_380px] xl:grid-cols-[minmax(0,1fr)_440px] 2xl:grid-cols-[minmax(0,1fr)_520px]">
      {/* Canvas panel. A container, so the toolbar and the trim bar lay out
          against the panel's own width rather than the viewport's: at 1024px
          the panels sit side by side and this one is 608px, narrower than a
          phone in landscape, while a viewport rule still thought it was wide
          and clipped Download off the edge. */}
      <section className="@container flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border border-stroke bg-panel">
        <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2.5 border-b border-stroke px-4 py-3 @2xl:flex-nowrap @2xl:px-5 @2xl:py-3.5">
          <div className="flex items-center gap-1.5 @max-2xl:w-full">
            <h2 className="text-sm font-medium tracking-tight text-foreground">
              Canvas
            </h2>
            {dimensions && (
              <>
                <span
                  aria-hidden="true"
                  className="inline-block size-1 shrink-0 rounded-full bg-stroke-strong"
                />
                <Dimensions
                  width={dimensions.w}
                  height={dimensions.h}
                  className="animate-rise-in text-[13px] text-muted-foreground"
                  style={{ animationDelay: `${TIMING.toolbarMeta}ms` }}
                />
                {clipSeconds !== undefined && (
                  <>
                    <span
                      aria-hidden="true"
                      className="inline-block size-1 shrink-0 rounded-full bg-stroke-strong"
                    />
                    <span
                      className="animate-rise-in text-[13px] tabular-nums text-muted-foreground"
                      style={{ animationDelay: `${TIMING.toolbarMeta}ms` }}
                    >
                      {formatDuration(clipSeconds)}
                    </span>
                  </>
                )}
              </>
            )}
          </div>

          <div className="flex items-center gap-0.5 rounded-full bg-track p-0.5 @max-2xl:order-2 @2xl:ml-auto">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Zoom out"
                  onClick={() => setManualZoom(zoomOut(zoom))}
                  disabled={!media || zoom <= MIN_ZOOM}
                >
                  <MinusIcon className="size-4" aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Zoom out</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => setManualZoom(1)}
                  disabled={!media}
                  className="h-7 w-12 cursor-pointer rounded-full text-center text-[13px] tabular-nums text-muted-foreground transition-colors duration-150 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {formatZoom(zoom)}
                </button>
              </TooltipTrigger>
              <TooltipContent>Reset to 100%</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Zoom in"
                  onClick={() => setManualZoom(zoomIn(zoom))}
                  disabled={!media || zoom >= MAX_ZOOM}
                >
                  <PlusIcon className="size-4" aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Zoom in</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Fit to view"
                  aria-pressed={zoomMode === "fit"}
                  onClick={fitToView}
                  disabled={!media}
                  className={cn(
                    zoomMode === "fit" &&
                      "bg-track-active text-foreground shadow-sm",
                  )}
                >
                  <MaximizeIcon className="size-4" aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Fit to view</TooltipContent>
            </Tooltip>
          </div>

          <div className="flex items-center gap-2 @max-2xl:order-2 @max-2xl:ml-auto">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={removeLabel}
                  onClick={() => setClearOpen(true)}
                  disabled={!media}
                >
                  <Trash2Icon className="size-4" aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{removeLabel}</TooltipContent>
            </Tooltip>

            <Button
              variant="outline"
              onClick={() => openExportModal("copy")}
              disabled={!media}
            >
              <CopyIcon className="size-3.5" aria-hidden="true" />
              <span className="sr-only sm:not-sr-only">Copy</span>
              <kbd className="relative ml-1 hidden items-center gap-0.5 text-muted-foreground @3xl:flex">
                <ArrowBigUpIcon className="size-3" aria-hidden="true" />
                <CommandIcon className="size-3" aria-hidden="true" />
                <span className="text-xs font-medium">C</span>
                <span className="sr-only">Shift Command C</span>
              </kbd>
            </Button>

            <Hint reason={downloadBlocked}>
            <Button
              onClick={() => openExportModal("download")}
              disabled={!media || downloadBlocked !== null}
            >
              <DownloadIcon className="size-3.5" aria-hidden="true" />
              <span className="sr-only sm:not-sr-only">Download</span>
              <kbd className="relative ml-1 hidden items-center gap-0.5 opacity-60 @3xl:flex">
                <CommandIcon className="size-3" aria-hidden="true" />
                <span className="text-xs font-medium">S</span>
                <span className="sr-only">Command S</span>
              </kbd>
            </Button>
            </Hint>
          </div>
        </div>

        <DropZone
          ref={scrollerRef}
          onFile={loadMedia}
          onAudio={addSoundtrack}
          className="canvas-grid min-h-[260px] flex-1 overflow-auto sm:min-h-[420px]"
        >
          {/* Centering happens on this inner wrapper, not on the scroll
              container. `items-center` on a scroller strands half the overflow
              above the scroll origin, which made the top of a tall screenshot
              unreachable. The wrapper grows to the content instead, so
              centering only kicks in when the frame is smaller than the view. */}
          <div className="flex min-h-full w-max min-w-full items-center justify-center p-6">
            {/* Zoom scales this wrapper, never the export ref inside it.
                html-to-image sizes its output from the ref'd node, so a
                transform on the node itself would export a shrunken PNG.
                The outer box carries the scaled footprint, because a
                transform does not change layout size. */}
            <div
              className="relative"
              style={
                zoomed
                  ? {
                      width: frameSize.width * zoom,
                      height: frameSize.height * zoom,
                    }
                  : undefined
              }
            >
              {/* A transparent background is shown by what is behind it, and
                  what is behind it is outside the export ref, so the checks
                  can never be serialized into a frame. It takes the frame's
                  own radius so the corners agree. */}
              {styleOptions.background === "none" && (
                <div
                  aria-hidden="true"
                  className="transparency-grid artwork-ease absolute inset-0 transition-[border-radius]"
                  style={{ borderRadius: `${styleOptions.outerRadius}px` }}
                />
              )}

              {/* `w-max` keeps this at the frame's natural size. Without it the
                  frame would stretch to the scaled footprint above, shrinking
                  its own layout width and feeding a wrong size back into both
                  the measurement and the export. */}
              <div
                className="relative w-max"
                style={
                  zoomed
                    ? {
                        transform: `scale(${zoom})`,
                        transformOrigin: "top left",
                      }
                    : undefined
                }
              >
                {/* The frame renders with or without an image, so every style
                    control previews before anything is uploaded. The ref is
                    always attached: without it the empty state never gets
                    measured and so never fits the canvas. Export is gated on
                    the image, not on the ref. */}
                <div
                  ref={screenshotRef}
                  data-instant={sizeOverride ? "" : undefined}
                  className="artwork-ease relative w-max overflow-hidden transition-[border-radius]"
                  style={{
                    borderRadius: `${styleOptions.outerRadius}px`,
                  }}
                >
                  {/* A whole-frame fade, as the veil the export draws. It is
                      inside the frame so a still of one matches, and carries
                      the ignore attribute so the video's chrome raster, which
                      is taken once, does not bake a single instant of it. */}
                  <div
                    ref={veilRef}
                    aria-hidden="true"
                    {...{ [EXPORT_IGNORE]: "" }}
                    className="pointer-events-none absolute inset-0 z-40 bg-black"
                    style={{ opacity: 0 }}
                  />
                  <GradientBackground
                    css={gradientCss}
                    previousCss={previousGradientCss}
                    shader={
                      canShade
                        ? {
                            field: shaderField,
                            speed: styleOptions.backgroundSpeed,
                            moment: styleOptions.backgroundMoment,
                          }
                        : undefined
                    }
                    showNoiseOverlay={styleOptions.showNoiseOverlay}
                    noiseIntensity={styleOptions.noiseIntensity}
                  >
                    {/* The box carries the shape, and the artwork centres in
                        it. Set here rather than as an `aspect-ratio`, because
                        CSS solves that against one axis and stops: with the
                        content wider than the target, `min-height` wins and the
                        ratio is simply lost, and nothing re-grows the width to
                        restore it. */}
                    {/* The box eases between two shapes. From or to Auto it
                        snaps, since Auto has no explicit size for a transition
                        to run from or to, and giving it one would clip a
                        caption or bar switching on while the frame caught up. */}
                    <div
                      className="artwork-ease relative flex items-center justify-center transition-[padding,width,height]"
                      style={{
                        padding: `${styleOptions.padding}px`,
                        ...(shaped && {
                          width: shaped.width,
                          height: shaped.height,
                        }),
                      }}
                    >
                      {media ? (
                        /* The measured artwork is the picture, its bar and its
                           caption together, since all three have to fit
                           inside a target shape. The caption is `w-0
                           min-w-full`, so it takes the picture's width and
                           wraps to it rather than widening the frame to its
                           own unbroken length. */
                        <div
                          ref={artworkRef}
                          className="animate-artwork-in relative flex w-max flex-col items-center"
                          style={{ animationDelay: `${TIMING.artwork}ms` }}
                        >
                          {caption && styleOptions.captionPosition === "above" && (
                            <Caption
                              text={caption}
                              size={styleOptions.captionSize}
                              dark={styleOptions.captionDark}
                              position="above"
                            />
                          )}
                          <Device
                            device={styleOptions.device}
                            width={picture.width}
                            shadow={styleOptions.shadow}
                          >
                          <div className="relative">
                            {styleOptions.windowChrome !== "none" && (
                              <WindowNavbar
                                variant={styleOptions.windowChrome}
                                width={dimensions?.w ?? 1280}
                                dark={styleOptions.windowNavbarDark}
                                url={styleOptions.windowUrl}
                                style={{
                                  borderRadius: cornerRadius(radius, corners, "top"),
                                }}
                              />
                            )}
                            {media.kind === "video" ? (
                              /*
                               * The video sits in a box of its own. The box
                               * carries the radius, the shadow and the clip,
                               * and is what the export measures, so a zoom's
                               * transform on the video grows the picture inside
                               * its own corners and moves nothing the
                               * composite is aimed at.
                               *
                               * Inline, and started from an effect rather than
                               * by `autoPlay`, which cannot report a browser
                               * refusing to play with sound. Its own mute is its
                               * own: a laid track mixes with this rather than
                               * replacing it, so both play unless one is
                               * silenced.
                               *
                               * No `loop` attribute: it loops at the file's end,
                               * which is not the clip's end once there is a trim,
                               * so the two would compete. The trim bar's own
                               * frame loop owns it instead, and its loop control
                               * switches it off.
                               */
                              <div
                                ref={clipBoxRef}
                                className={cn(
                                  mediaShadow,
                                  "artwork-ease relative overflow-hidden transition-[border-radius,box-shadow]",
                                )}
                                style={{ borderRadius: mediaRadius }}
                              >
                                <video
                                  ref={videoRef}
                                  {...{ [EXPORT_MEDIA]: "" }}
                                  src={media.src}
                                  // Silent past 1x, because the export is. See
                                  // `SPEED_OPTIONS`.
                                  muted={muted || speed !== 1}
                                  playsInline
                                  onClick={togglePlayback}
                                  className="block h-auto max-w-full cursor-pointer select-none"
                                />
                                <MarksLayer
                                  ref={marksLayerRef}
                                  marks={marks}
                                  selected={selectedMark}
                                  tool={markTool}
                                  color={markColor}
                                  picture={picture}
                                  canvasZoom={zoom}
                                  onAdd={addMark}
                                  onChange={updateMark}
                                  onSelect={setSelectedMark}
                                  onGesture={handleMarkGesture}
                                >
                                  {/* Drawn by the zoom loop, in the layer so
                                      it rides the same transform. Left out of
                                      every raster: the encode draws its own
                                      from the same function, and a still has
                                      no time for a ripple to be at. */}
                                  {styleOptions.clickRipples && (
                                    <canvas
                                      ref={rippleCanvasRef}
                                      {...{ [EXPORT_IGNORE]: "" }}
                                      aria-hidden="true"
                                      width={Math.min(picture.width, 1280)}
                                      height={Math.round(
                                        (picture.height * Math.min(picture.width, 1280)) /
                                          picture.width,
                                      )}
                                      className="pointer-events-none absolute inset-0 size-full"
                                    />
                                  )}
                                </MarksLayer>
                                {/* A join's dissolve and dip, over the picture
                                    and its marks, positioned by the loop. Left
                                    out of every raster: the encode draws its
                                    own, and the chrome is baked once. */}
                                <canvas
                                  ref={heldRef}
                                  {...{ [EXPORT_IGNORE]: "" }}
                                  aria-hidden="true"
                                  width={Math.min(picture.width, 960)}
                                  height={Math.round(
                                    (picture.height * Math.min(picture.width, 960)) /
                                      picture.width,
                                  )}
                                  className="pointer-events-none absolute inset-0 size-full"
                                  style={{ opacity: 0 }}
                                />
                                <div
                                  ref={dipRef}
                                  {...{ [EXPORT_IGNORE]: "" }}
                                  aria-hidden="true"
                                  className="pointer-events-none absolute inset-0"
                                  style={{ opacity: 0 }}
                                />
                                {selectedRegion && (
                                  <ZoomFocusMarker
                                    ref={liveMarkerRef}
                                    live={Boolean(selectedRegion.follow)}
                                    focus={selectedRegion.focus}
                                    canvasZoom={zoom}
                                    box={clipBoxRef}
                                    onChange={(focus) =>
                                      updateZoom({ ...selectedRegion, focus })
                                    }
                                    // Paused while aimed, like a handle drag: a
                                    // point is placed on a picture that holds
                                    // still, and resumed on release.
                                    onDragChange={(dragging) => {
                                      aimingRef.current = dragging;
                                      const video = videoRef.current;
                                      if (!video) return;
                                      if (dragging) {
                                        resumeAfterAimRef.current = !video.paused;
                                        video.pause();
                                      } else if (resumeAfterAimRef.current) {
                                        void video.play().catch(() => {});
                                      }
                                    }}
                                  />
                                )}
                              </div>
                            ) : (
                              <div className="relative">
                                {/* eslint-disable-next-line @next/next/no-img-element -- the
                                    source is a client-side data URL, which
                                    next/image cannot optimize and
                                    html-to-image cannot serialize. */}
                                <img
                                  src={media.src}
                                  alt="Your screenshot"
                                  className={cn(
                                    mediaShadow,
                                    "artwork-ease block h-auto max-w-full select-none transition-[border-radius,box-shadow]",
                                  )}
                                  style={{ borderRadius: mediaRadius }}
                                  draggable={false}
                                />
                                <MarksLayer
                                  marks={marks}
                                  selected={selectedMark}
                                  tool={markTool}
                                  color={markColor}
                                  picture={picture}
                                  canvasZoom={zoom}
                                  radius={mediaRadius}
                                  onAdd={addMark}
                                  onChange={updateMark}
                                  onSelect={setSelectedMark}
                                  onGesture={handleMarkGesture}
                                />
                              </div>
                            )}
                          </div>
                          </Device>
                          {caption && styleOptions.captionPosition === "below" && (
                            <Caption
                              text={caption}
                              size={styleOptions.captionSize}
                              dark={styleOptions.captionDark}
                              position="below"
                            />
                          )}
                        </div>
                      ) : (
                        <UploadCard onUpload={loadMedia} />
                      )}
                      {media && badge && (
                        <HandleBadge
                          text={badge}
                          size={styleOptions.badgeSize}
                          dark={styleOptions.badgeDark}
                          position={styleOptions.badgePosition}
                        />
                      )}
                    </div>
                  </GradientBackground>
                </div>

                {/* Outside the export ref, so a guide can never be serialized
                    into a frame, and inside the zoom transform, so it sits on
                    the frame at any zoom. Its lines are divided by the zoom to
                    stay one weight on screen. Its own colours, since it sits
                    over arbitrary artwork. */}
                {showGuides && media && template && (template.safe || slides > 1) && (
                  <Guides
                    width={template.width}
                    height={template.height}
                    slides={slides}
                    safe={template.safe}
                    line={1.5 / zoom}
                    radius={styleOptions.outerRadius}
                  />
                )}
              </div>

              {/* Outside the export ref on purpose, so it can never be
                  serialized into a frame, and outside the zoom transform so it
                  is the same size whatever the canvas is scaled to. This box is
                  the frame's own footprint, so centring here centres on the
                  picture.

                  Its own colours, because it sits over an arbitrary gradient
                  and an arbitrary video: there is no surface token that can be
                  read against both. */}
              {pulse && media?.kind === "video" && (
                <div
                  key={pulse.id}
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 grid place-items-center"
                >
                  {/* The animation is on the circle, never on the layer. On
                      the layer it scaled a frame-sized box to 1.3, and a
                      transform's overflow counts toward a scroll container's
                      scrollable area, so every press grew the canvas a
                      scrollbar in fit mode. */}
                  <span
                    onAnimationEnd={() => setPulse(null)}
                    className="grid size-16 place-items-center rounded-full bg-black/55 text-white opacity-0 backdrop-blur-sm motion-safe:animate-[play-pulse_620ms_ease-out_forwards]"
                  >
                    {/* Filled, not stroked. A transport glyph is a solid
                        triangle and two solid bars everywhere it appears, and
                        at this size an outline reads as a sketch of the
                        control rather than the control. */}
                    {pulse.playing ? (
                      <PlayIcon
                        className="size-7 translate-x-px"
                        fill="currentColor"
                        aria-hidden="true"
                      />
                    ) : (
                      <PauseIcon
                        className="size-7"
                        fill="currentColor"
                        aria-hidden="true"
                      />
                    )}
                  </span>
                </div>
              )}
            </div>
          </div>
        </DropZone>

        {/* Only a clip has a length to cut, and the bar sits on the panel's
            own hairline rather than inside the canvas: it is chrome about the
            media, the same category as the toolbar above it. */}
        {media?.kind === "video" && trim && media.duration ? (
          <div className="shrink-0 border-t border-stroke">
            <TrimBar
              video={videoRef}
              duration={media.duration}
              trim={trim}
              onChange={handleTrimChange}
              onSeek={handleSeek}
              onPlayback={handlePlayback}
              onToggle={togglePlayback}
              speed={speed}
              onSpeedChange={handleSpeedChange}
              zooms={zooms}
              selectedZoom={selectedZoom}
              cuts={cuts}
              selectedCut={selectedCut}
              onCutAdd={addCut}
              onCutChange={updateCut}
              onCutSelect={selectCut}
              onCutRemove={() => setRemoveCutOpen(true)}
              splits={splits}
              selectedPiece={selectedPiece}
              onPieceSelect={selectPiece}
              onPiecesChange={handlePiecesChange}
              onSplit={splitAtPlayhead}
              onPieceDelete={() => deletePiece()}
              onPieceRemove={() => setRemovePieceOpen(true)}
              selectedJoin={selectedJoin}
              onJoinSelect={selectJoin}
              onSplitChange={updateSplit}
              onSplitRemove={removeSplit}
              fades={fades}
              selectedFade={selectedFade}
              onFadeAdd={addFade}
              onFadeChange={updateFade}
              onFadeSelect={selectFade}
              onFadeRemove={() => setRemoveFadeOpen(true)}
              onFadeCurveEdit={() => setCurveOpen(true)}
              onUndo={history.undo}
              onRedo={history.redo}
              canUndo={history.canUndo}
              canRedo={history.canRedo}
              motionProgress={motionProgress}
              onZoomAdd={addZoom}
              onZoomFollow={toggleFollow}
              suggestions={suggestions}
              suggesting={suggesting}
              onSuggestToggle={toggleSuggest}
              onSuggestionAccept={acceptSuggestion}
              onZoomChange={updateZoom}
              onZoomSelect={selectZoom}
              onZoomRemove={() => setRemoveZoomOpen(true)}
              hasClipSound={media.hasAudio ?? false}
              soundtrack={soundtrack}
              onSoundtrackChange={setSoundtrack}
              onSoundtrackAdd={addSoundtrack}
              onSoundtrackRemove={() => setRemoveTrackOpen(true)}
              muted={muted}
              onMutedChange={setMuted}
              musicMuted={musicMuted}
              onMusicMutedChange={setMusicMuted}
              disabled={exporting}
            />
          </div>
        ) : null}
      </section>

      {/* Control panel */}
      <section className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border border-stroke bg-panel">
        {/* No header: each section names itself. */}
        <ScrollFade className="min-h-0 flex-1 overflow-y-auto">
          <StyleControls
            options={styleOptions}
            onChange={handleStyleChange}
            onReset={() => setResetStyleOpen(true)}
            canReset={canResetStyle}
            disabled={!media}
            kind={media?.kind}
            onMatchPicture={matchPicture}
            showGuides={showGuides}
            onShowGuidesChange={setShowGuides}
            motionReady={motion !== null}
            motionProgress={motionProgress}
            onReadMotion={() => setMotionAsk({ kind: "ripples" })}
            looks={looks}
            onSaveLook={() => setSaveLookOpen(true)}
            onApplyLook={handleApplyLook}
            onDeleteLook={setDeleteLook}
          >
            <MarkControls
              marks={marks}
              selected={selectedMarkValue}
              tool={markTool}
              color={markColor}
              onToolChange={setMarkTool}
              onColorChange={setMarkColor}
              onChange={updateMark}
              onRemove={() => selectedMark && setRemoveMarkId(selectedMark)}
            />
          </StyleControls>
        </ScrollFade>
      </section>

      {/* Outside the frame, so it is never serialized into the export. What
          the export hears comes from decoding the file, not from this. */}
      {soundtrack && (
        // biome-ignore lint: a soundtrack is sound, and captions for a file the
        // user supplied are not something this app can invent.
        <audio
          ref={audioRef}
          src={soundtrack.src}
          muted={musicMuted}
          className="hidden"
        />
      )}

      <ExportModal
        open={exportModalOpen}
        onOpenChange={setExportModalOpen}
        onExport={handleExport}
        action={exportAction}
        pending={exporting}
        frameSize={frameSize}
        hasGrain={styleOptions.showNoiseOverlay}
        kind={media?.kind ?? "image"}
        duration={clipSeconds}
        speed={speed}
        hasClipAudio={media?.hasAudio ?? false}
        soundtrackName={soundtrack?.name}
        transparent={styleOptions.background === "none"}
        loop={loop ?? undefined}
        movingBackground={Boolean(backdrop && backdrop.speed > 0)}
        format={videoFormat}
        onFormatChange={setVideoFormat}
        progress={progress}
        defaultName={filenameFor(undefined, "png", media?.name).slice(0, -4)}
        template={template}
        slides={slides}
        onCancel={exportsVideo ? handleCancelExport : undefined}
      />

      {/* Removing a track is a remove, and the X for it sits two pixels from
          the mute button. It used to fire on the press, revoking the object
          URL, so the file and where it had been placed were gone with nothing
          to bring them back. Clearing the clip has always confirmed, and this
          is the same kind of loss. */}
      <ConfirmDialog
        open={removeTrackOpen}
        onOpenChange={setRemoveTrackOpen}
        title={
          soundtrack ? `Remove ${soundtrack.name}?` : "Remove the soundtrack?"
        }
        description="The clip keeps its own sound. You will need to add the track again and place it."
        confirmLabel="Remove"
        onConfirm={() => {
          removeSoundtrack();
          setRemoveTrackOpen(false);
        }}
      />

      {/* Reading the motion decodes every frame of the clip, which is the one
          heavy job in the editor, so it never starts on a press that did not
          say so. The dialog names what happens, where, and for how long. */}
      <ConfirmDialog
        open={motionAsk !== null}
        onOpenChange={(open) => {
          if (!open) setMotionAsk(null);
        }}
        title="Read the clip's motion?"
        description={`${motionAsk?.kind === "suggest" ? "To suggest zooms" : motionAsk?.kind === "ripples" ? "To show each click" : "To follow the action"}, clyp looks at where the picture changes from one frame to the next, once for the whole clip. That happens on this device and nothing leaves it. It takes ${motionWait}, and you can keep editing while it runs.`}
        confirmLabel="Read the motion"
        confirmVariant="default"
        onConfirm={confirmMotion}
      />

      {/* A region is four numbers and a point that took a minute to place, the
          same kind of loss as a soundtrack's placement. */}
      <ConfirmDialog
        open={removeZoomOpen}
        onOpenChange={setRemoveZoomOpen}
        title="Remove this zoom?"
        description="The picture plays plain through that stretch again. Its length, level and aim are not kept."
        confirmLabel="Remove"
        onConfirm={removeZoom}
      />

      {/* A cut confirms the same way a zoom does. Both are a stretch someone
          placed by dragging two edges against the frames under them, and the X
          for one sits a few pixels from the controls beside it. */}
      <ConfirmDialog
        open={removeCutOpen}
        onOpenChange={setRemoveCutOpen}
        title="Remove this cut?"
        description="That stretch of the clip plays again, and the clip gets longer by its length."
        confirmLabel="Remove"
        onConfirm={removeCut}
      />

      {/* The one action in the style panel with nothing behind it: undo covers
          the clip's edits and, deliberately, not the style. */}
      <ConfirmDialog
        open={resetStyleOpen}
        onOpenChange={setResetStyleOpen}
        title="Reset the style?"
        description="Every control goes back to its default. Your clip, its trim and its edits are kept."
        confirmLabel="Reset"
        onConfirm={resetStyle}
      />

      {/* The curve, as the graph it is, with the presets beside it. At the
          page level like every other modal, and the row behind it keeps only
          the shape as a glyph. */}
      <Dialog open={curveOpen} onOpenChange={setCurveOpen}>
        {/* Wide enough for the four presets on one line, which is the width
            the export modal already uses. At 320px they wrapped onto two. */}
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Fade curve</DialogTitle>
            <DialogDescription className="sr-only">
              Drag either control point to shape how the fade runs, or pick a
              preset.
            </DialogDescription>
          </DialogHeader>
          {/* In a body, like every other dialog's content. Dropped straight
              into the content it had neither the side padding nor the bottom,
              so the presets sat against the dialog's own edge. */}
          <DialogBody className="pb-5">
            {selectedRamp && (
              <CurveEditor
                curve={selectedRamp.curve}
                onChange={(curve) => updateFade({ ...selectedRamp, curve })}
              />
            )}
          </DialogBody>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={removeFadeOpen}
        onOpenChange={setRemoveFadeOpen}
        title="Remove this fade?"
        description="The picture plays at full strength through that stretch again."
        confirmLabel="Remove"
        onConfirm={removeFade}
      />

      {/* The button asks, where the Delete key does not: a press on a button
          is the easier one to make by accident, and the key is deliberate. */}
      <ConfirmDialog
        open={removePieceOpen}
        onOpenChange={setRemovePieceOpen}
        title="Delete this piece?"
        description="That part of the clip leaves the export and the pieces either side join up. Undo brings it back."
        confirmLabel="Delete"
        onConfirm={() => deletePiece(true)}
      />

      {/* A mark can be what hides a password, so taking one away confirms
          like every other remove. Undo brings it back as well. */}
      <ConfirmDialog
        open={removeMarkId !== null}
        onOpenChange={(open) => {
          if (!open) setRemoveMarkId(null);
        }}
        title="Remove this mark?"
        description="It comes off the picture and out of every export. Undo brings it back."
        confirmLabel="Remove"
        onConfirm={removeMark}
      />

      <ConfirmDialog
        open={deleteLook !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteLook(null);
        }}
        title={deleteLook ? `Delete ${deleteLook.name}?` : "Delete this look?"}
        description="The look is gone from this browser. The current style is not changed."
        confirmLabel="Delete"
        onConfirm={confirmDeleteLook}
      />

      <Dialog
        open={saveLookOpen}
        onOpenChange={(open) => {
          setSaveLookOpen(open);
          if (!open) setLookName("");
        }}
      >
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Save this look</DialogTitle>
            <DialogDescription className="text-xs">
              The background, frame, window, handle and shadow. The caption
              and the address stay with each picture.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              saveLook();
            }}
            className="contents"
          >
            <DialogBody className="flex flex-col gap-2 pb-4">
              <FieldLabel htmlFor="look-name">Name</FieldLabel>
              <Input
                id="look-name"
                value={lookName}
                onChange={(event) => setLookName(event.target.value)}
                placeholder={nextLookName(looks)}
                spellCheck={false}
                autoFocus
                className="text-xs placeholder:text-xs"
              />
            </DialogBody>
            <DialogFooter>
              <Button
                type="button"
                variant="secondary"
                size="lg"
                onClick={() => setSaveLookOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" size="lg">
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={clearOpen}
        onOpenChange={setClearOpen}
        title={media?.kind === "video" ? "Remove this clip?" : "Remove this screenshot?"}
        description={`The canvas is cleared and you will need to add the ${media?.kind === "video" ? "clip" : "image"} again. Your style settings are kept.`}
        confirmLabel="Remove"
        onConfirm={handleClear}
      />
    </div>
  );
}

/** The device frame, or its children as they are when there is none. */
function Device({
  device,
  width,
  shadow,
  children,
}: {
  device: StyleOptions["device"];
  width: number;
  shadow: string;
  children: React.ReactNode;
}) {
  if (device === "none") return children;
  return (
    <DeviceFrame device={device} width={width} shadow={shadow}>
      {children}
    </DeviceFrame>
  );
}

/**
 * Where a platform's own interface will sit over the post, and where a
 * carousel is cut into slides.
 *
 * Everything outside the safe zone is dimmed, since that is the part a reader
 * should keep text out of. Positions are fractions of the template, so they
 * land on the frame whatever size the frame is laid out at.
 */
function Guides({
  width,
  height,
  slides,
  safe,
  line,
  radius,
}: {
  width: number;
  height: number;
  slides: number;
  safe?: { top: number; bottom: number; left: number; right: number };
  line: number;
  radius: number;
}) {
  const total = width * slides;
  const edge = `${line}px dashed rgba(255,255,255,0.9)`;

  return (
    <div
      aria-hidden="true"
      // Above the background's own layers, which run to z-30 and are not
      // contained by the frame, since the frame opens no stacking context.
      className="pointer-events-none absolute inset-0 z-50 overflow-hidden"
      style={{ borderRadius: radius }}
    >
      {safe &&
        Array.from({ length: slides }, (_, i) => (
          <div
            key={i}
            className="absolute"
            style={{
              left: `${((i * width + safe.left) / total) * 100}%`,
              width: `${((width - safe.left - safe.right) / total) * 100}%`,
              top: `${(safe.top / height) * 100}%`,
              height: `${((height - safe.top - safe.bottom) / height) * 100}%`,
              border: edge,
              boxShadow: "0 0 0 100vmax rgba(0,0,0,0.28)",
            }}
          />
        ))}
      {Array.from({ length: slides - 1 }, (_, i) => (
        <div
          key={`seam-${i}`}
          className="absolute inset-y-0"
          style={{
            left: `${((i + 1) / slides) * 100}%`,
            borderLeft: edge,
            filter: "drop-shadow(0 0 1px rgba(0,0,0,0.6))",
          }}
        />
      ))}
    </div>
  );
}
