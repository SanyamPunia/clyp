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
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { toast } from "sonner";

import { DropZone, readMediaFile } from "@/components/drop-zone";
import { ExportModal } from "@/components/export-modal";
import { GradientBackground } from "@/components/gradient-background";
import { StyleControls } from "@/components/style-controls";
import { TrimBar } from "@/components/trim-bar";
import { UploadCard } from "@/components/upload-card";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
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
  DEFAULT_ZOOM_LEVEL,
  newZoomId,
  placeZoom,
  zoomAt,
} from "@/lib/clip-zoom";
import {
  type MotionTrack,
  describeWait,
  estimateMotionSeconds,
  motionAt,
} from "@/lib/motion";
import { type MotionRead, readMotion } from "@/lib/read-motion";
import { rasterize } from "@/lib/raster";
import {
  defaultCustomGradient,
  defaultGradientId,
  resolveGradientCss,
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
  deleteMedia,
  deleteMotion,
  readEdits,
  readMedia,
  readMotion as readStoredMotion,
  readStyle,
  writeEdits,
  writeMedia,
  writeMotion,
  writeStyle,
} from "@/lib/storage";
import {
  EDIT_FPS,
  SPEED_OPTIONS,
  canExportVideo,
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

const clamp = (value: number, low: number, high: number) =>
  Math.min(Math.max(value, low), Math.max(low, high));

const DEFAULT_STYLE: StyleOptions = {
  gradientId: defaultGradientId,
  gradientAngle: 180,
  aspect: "auto",
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
  caption: "",
  captionPosition: "below",
  captionSize: 32,
  captionDark: false,
  showNoiseOverlay: false,
  noiseIntensity: 55,
  useCustomGradient: false,
  customGradientFrom: defaultCustomGradient.from,
  customGradientTo: defaultCustomGradient.to,
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
  /**
   * The clip's motion track, read once for the whole clip when a region is
   * first asked to follow, and the read's progress while it runs. Reading it
   * is the one heavy thing in the editor, so it is asked for through a dialog
   * and never started by a drag. Stored with the draft, so a reload has it.
   */
  const [motion, setMotion] = useState<MotionTrack | null>(null);
  const [motionProgress, setMotionProgress] = useState<number | null>(null);
  /** The region waiting on the dialog's answer. */
  const [followAsk, setFollowAsk] = useState<ZoomRegion | null>(null);
  const [soundtrack, setSoundtrack] = useState<Soundtrack | null>(null);
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
  /** The clip's box: what holds still, carries the radius, and is measured. */
  const clipBoxRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  // For the zoom's frame loop, which is bound once per clip and would
  // otherwise close over the regions it mounted with. Written in an effect.
  const zoomsRef = useRef(zooms);
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
  // One radius for both branches and for the export's rounded clip, so an
  // image and a video cannot end up cornered differently.
  // Copy always produces a PNG, so a clip copies its styled poster frame and
  // only Download encodes. That leaves one thing that can be unavailable: the
  // encode needs WebCodecs.
  const downloadBlocked =
    media?.kind === "video" && !canEncode
      ? "This browser cannot encode video"
      : null;
  const exportsVideo = media?.kind === "video" && exportAction === "download";
  // What will actually be encoded, which is the trim at the chosen speed rather
  // than the file. The duration readout, the size estimate and the encode all
  // read this one value, so none of them can describe a length nobody asked
  // for. The trim bar's own readout stays in the source's seconds, since that
  // is the axis its handles cut on.
  const clipSeconds = trim ? (trim.end - trim.start) / speed : media?.duration;

  /**
   * The frame's box when a shape is asked for.
   *
   * Null for `auto`, which is the frame sizing itself to the artwork and its
   * padding the way it always did, and null before the artwork has been
   * measured. Also null with nothing loaded: the upload card is a fixed card
   * rather than the artwork, so shaping the frame around it would preview a
   * frame nobody is going to export.
   */
  const ratio = aspectRatio(styleOptions.aspect);
  const shaped =
    ratio !== null && artwork !== null && media !== null
      ? aspectBox(artwork, styleOptions.padding, ratio)
      : null;

  const removeLabel =
    media?.kind === "video" ? "Remove clip" : "Remove screenshot";

  const framed = styleOptions.windowChrome !== "none";
  const mediaRadius = cornerRadius(
    styleOptions.imageRadius,
    styleOptions.imageCorners,
    framed ? "bottom" : undefined,
  );
  const caption = styleOptions.caption.trim();
  const zoomed = zoom !== 1 && frameSize.width > 0;
  const selectedRegion = zooms.find((r) => r.id === selectedZoom) ?? null;

  useEffect(() => {
    zoomsRef.current = zooms;
    motionRef.current = motion;
    selectedZoomRef.current = selectedZoom;
  }, [zooms, motion, selectedZoom]);

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
    setZooms([]);
    setSelectedZoom(null);
    // A read for the clip that has just been replaced is stopped, since its
    // answer would be about the wrong picture.
    motionReadRef.current?.cancel();
    motionReadRef.current = null;
    setMotion(null);
    setMotionProgress(null);
    setFollowAsk(null);
    // Audible again for a new clip, whatever the last one was left at.
    setMuted(false);
    setMusicMuted(false);
    // A soundtrack was placed against a clip that is no longer here, so it
    // means nothing now. Dropping it beats leaving it somewhere arbitrary.
    setSoundtrack((previous) => {
      if (previous) URL.revokeObjectURL(previous.src);
      return null;
    });
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

    const rate = edits.speed as (typeof SPEED_OPTIONS)[number];
    setSpeed(SPEED_OPTIONS.includes(rate) ? rate : 1);
    setZooms(
      edits.zooms
        .map((z) => ({ ...z, start: grid(z.start), end: grid(z.end) }))
        .filter((z) => z.end > z.start)
        .sort((a, b) => a.start - b.start),
    );
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
   * Reads the whole clip's motion, once. Progress lands on the toggle, the
   * result is kept for the session and stored with the draft, and nothing
   * afterwards, not a drag, not a second region, starts it again.
   */
  const startMotionRead = useCallback(() => {
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
          });
        }
      })
      .catch((error: Error) => {
        // A cancel is a clip change, which has already said what it needs to.
        if (error.name !== "AbortError") toast.error(error.message);
      })
      .finally(() => {
        if (motionReadRef.current === read) motionReadRef.current = null;
        setMotionProgress(null);
      });
  }, [dimensions, media]);

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
        setFollowAsk(region);
      }
    },
    [motion, updateZoom],
  );

  const confirmFollow = useCallback(() => {
    if (followAsk) updateZoom({ ...followAsk, follow: true });
    setFollowAsk(null);
    startMotionRead();
  }, [followAsk, startMotionRead, updateZoom]);

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
        const done = () => {
          if (!cancelled) setRestored(true);
        };

        if (stored?.kind === "image" && typeof stored.payload === "string") {
          const probe = new Image();
          probe.onload = () => {
            setMedia({ kind: "image", src: probe.src, name: stored.name });
            setDimensions({ w: probe.naturalWidth, h: probe.naturalHeight });
            done();
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
                    setMotion({ samples: stored.samples });
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
      speed,
      zooms,
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
  }, [restored, media, dimensions, trim, speed, zooms, soundtrack]);

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

  const openExportModal = useCallback((action: "copy" | "download") => {
    setExportAction(action);
    setExportModalOpen(true);
  }, []);

  // Cmd/Ctrl+S downloads, Cmd/Ctrl+Shift+C copies.
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (!media) return;
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
      }
    };

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [media, openExportModal, downloadBlocked]);

  const handleExport = useCallback(
    async (options: ExportOptions) => {
      const frame = screenshotRef.current;
      if (!media || !frame) return;

      setExporting(true);
      setProgress(exportsVideo ? 0 : null);
      try {
        if (exportsVideo) {
          const box = clipBoxRef.current;
          if (!box || !media.blob || !trim) {
            throw new Error("That clip is not loaded");
          }

          const controller = new AbortController();
          abortRef.current = controller;

          const blob = await exportVideo({
            frame,
            box,
            source: media.blob,
            scale: options.quality,
            trim,
            speed,
            zooms,
            motion,
            audio: options.audio,
            soundtrack: soundtrack ?? undefined,
            music: options.music,
            fps: options.fps,
            onProgress: setProgress,
            signal: controller.signal,
          });
          downloadBlob(blob, filenameFor(options.filename, "mp4", media.name));
          toast.success("Video downloaded");
        } else {
          const dataUrl = await rasterize(frame, options.quality);

          if (exportAction === "copy") {
            const blob = await fetch(dataUrl).then((res) => res.blob());
            await navigator.clipboard.write([
              new ClipboardItem({ [blob.type]: blob }),
            ]);
            toast.success("Copied to clipboard");
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
    [exportAction, exportsVideo, media, motion, soundtrack, speed, trim, zooms],
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
    const apply = () => {
      frame = requestAnimationFrame(apply);

      const state = aimingRef.current
        ? null
        : zoomAt(zoomsRef.current, video.currentTime, speed, motionRef.current);
      const transform = state && state.scale > 1.0001 ? `scale(${state.scale})` : "";
      const origin = state ? `${state.focus.x * 100}% ${state.focus.y * 100}%` : "";
      if (video.style.transform !== transform) video.style.transform = transform;
      if (video.style.transformOrigin !== origin) {
        video.style.transformOrigin = origin;
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
    setSpeed(1);
    setZooms([]);
    setSelectedZoom(null);
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
              {/* `w-max` keeps this at the frame's natural size. Without it the
                  frame would stretch to the scaled footprint above, shrinking
                  its own layout width and feeding a wrong size back into both
                  the measurement and the export. */}
              <div
                className="w-max"
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
                  className="artwork-ease w-max overflow-hidden transition-[border-radius]"
                  style={{
                    borderRadius: `${styleOptions.outerRadius}px`,
                  }}
                >
                  <GradientBackground
                    css={gradientCss}
                    previousCss={previousGradientCss}
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
                      className="artwork-ease flex items-center justify-center transition-[padding,width,height]"
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
                          <div className="relative">
                            {styleOptions.windowChrome !== "none" && (
                              <WindowNavbar
                                variant={styleOptions.windowChrome}
                                width={dimensions?.w ?? 1280}
                                dark={styleOptions.windowNavbarDark}
                                url={styleOptions.windowUrl}
                                style={{
                                  borderRadius: cornerRadius(
                                    styleOptions.imageRadius,
                                    styleOptions.imageCorners,
                                    "top",
                                  ),
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
                                  styleOptions.shadow,
                                  "artwork-ease relative overflow-hidden transition-[border-radius,box-shadow]",
                                )}
                                style={{ borderRadius: mediaRadius }}
                              >
                                <video
                                  ref={videoRef}
                                  src={media.src}
                                  // Silent past 1x, because the export is. See
                                  // `SPEED_OPTIONS`.
                                  muted={muted || speed !== 1}
                                  playsInline
                                  onClick={togglePlayback}
                                  className="block h-auto max-w-full cursor-pointer select-none"
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
                              /* eslint-disable-next-line @next/next/no-img-element -- the
                          source is a client-side data URL, which next/image cannot
                          optimize and html-to-image cannot serialize. */
                              <img
                                src={media.src}
                                alt="Your screenshot"
                                className={cn(
                                  styleOptions.shadow,
                                  "artwork-ease block h-auto max-w-full select-none transition-[border-radius,box-shadow]",
                                )}
                                style={{ borderRadius: mediaRadius }}
                                draggable={false}
                              />
                            )}
                          </div>
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
                    </div>
                  </GradientBackground>
                </div>
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
              onChange={setTrim}
              onSeek={handleSeek}
              onPlayback={handlePlayback}
              onToggle={togglePlayback}
              speed={speed}
              onSpeedChange={handleSpeedChange}
              zooms={zooms}
              selectedZoom={selectedZoom}
              motionProgress={motionProgress}
              onZoomAdd={addZoom}
              onZoomFollow={toggleFollow}
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
            disabled={!media}
          />
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
        progress={progress}
        defaultFilename={filenameFor(
          undefined,
          exportsVideo ? "mp4" : "png",
          media?.name,
        )}
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
        open={followAsk !== null}
        onOpenChange={(open) => {
          if (!open) setFollowAsk(null);
        }}
        title="Read the clip's motion?"
        description={`To follow the action, clyp looks at where the picture changes from one frame to the next, once for the whole clip. That happens on this device and nothing leaves it. It takes ${motionWait}, and you can keep editing while it runs.`}
        confirmLabel="Read the motion"
        confirmVariant="default"
        onConfirm={confirmFollow}
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
