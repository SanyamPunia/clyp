"use client";

import { toPng } from "html-to-image";
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
import {
  defaultCustomGradient,
  defaultGradientId,
  resolveGradientCss,
} from "@/lib/gradients";
import { ALL_CORNERS, cornerRadius } from "@/lib/style-options";
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
  loadSoundtrack,
} from "@/lib/media";
import {
  deleteMedia,
  deleteStyle,
  readMedia,
  readStyle,
  writeMedia,
  writeStyle,
} from "@/lib/storage";
import { EDIT_FPS, canExportVideo, exportVideo } from "@/lib/video-export";
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

const DEFAULT_STYLE: StyleOptions = {
  gradientId: defaultGradientId,
  gradientAngle: 180,
  padding: 64,
  outerRadius: 12,
  imageRadius: 8,
  imageCorners: ALL_CORNERS,
  shadow: "shadow-2xl",
  showWindowNavbar: true,
  windowNavbarDark: false,
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
  // The clip's in and out points, null for an image. Not persisted, the same
  // call zoom makes: it is an edit on the draft rather than part of it, and
  // writing it would rewrite the whole Blob on every drag of a handle.
  const [trim, setTrim] = useState<Trim | null>(null);
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
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);

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
  // What will actually be encoded, which is the trim rather than the file. The
  // duration readout, the size estimate and the encode all read this one
  // value, so none of them can describe a length nobody asked for.
  const clipSeconds = trim ? trim.end - trim.start : media?.duration;

  const removeLabel =
    media?.kind === "video" ? "Remove clip" : "Remove screenshot";

  const mediaRadius = cornerRadius(
    styleOptions.imageRadius,
    styleOptions.imageCorners,
    styleOptions.showWindowNavbar ? "bottom" : undefined,
  );
  const zoomed = zoom !== 1 && frameSize.width > 0;

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

  const addSoundtrack = useCallback(
    (file: File) => {
      loadSoundtrack(file, media?.duration ?? 0)
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
    [media?.duration],
  );

  const removeSoundtrack = useCallback(() => {
    setSoundtrack((previous) => {
      if (previous) URL.revokeObjectURL(previous.src);
      return null;
    });
  }, []);

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
  useEffect(() => {
    let cancelled = false;

    readMedia()
      .catch(() => null)
      .then((stored) => {
        if (cancelled) return;

        setStyleOptions(readStyle(DEFAULT_STYLE));

        if (stored?.kind === "image" && typeof stored.payload === "string") {
          const probe = new Image();
          probe.onload = () => {
            setMedia({ kind: "image", src: probe.src, name: stored.name });
            setDimensions({ w: probe.naturalWidth, h: probe.naturalHeight });
          };
          probe.src = stored.payload;
        } else if (stored?.kind === "video" && stored.payload instanceof Blob) {
          // Back through the same loader the drop path uses, so a restored
          // video is measured and rejected on exactly the same terms.
          const file = new File([stored.payload], stored.name ?? "clyp", {
            type: stored.payload.type,
          });
          // The soundtrack is restored from inside the media's own callback,
          // and it has to be: `loadMedia` clears the soundtrack, since one
          // placed against a clip that has been replaced means nothing. Run
          // side by side, whichever finished last won, and the soundtrack lost
          // about half the time.
          const audio = stored.audio;
          readMediaFile(file, (loaded) => {
            loadMedia(loaded);
            if (!audio) return;

            // Back through the same loader an upload uses, which re-measures
            // it and mints a fresh object URL. Its placement starts over,
            // since that was never stored.
            const track = new File([audio], stored.audioName ?? "audio", {
              type: audio.type,
            });
            loadSoundtrack(track, loaded.media.duration ?? 0)
              .then(setSoundtrack)
              .catch(() => undefined);
          });
        }

        setRestored(true);
      });

    return () => {
      cancelled = true;
    };
  }, [loadMedia]);

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
          const video = videoRef.current;
          if (!video || !media.blob) throw new Error("That clip is not loaded");

          const controller = new AbortController();
          abortRef.current = controller;

          const blob = await exportVideo({
            frame,
            video,
            source: media.blob,
            scale: options.quality,
            trim: trim ?? undefined,
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
          const dataUrl = await toPng(frame, {
            cacheBust: true,
            pixelRatio: options.quality,
          });

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
    [exportAction, exportsVideo, media, soundtrack, trim],
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

      const at = video.currentTime - soundtrack.offset + soundtrack.start;
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
  }, [soundtrack]);

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
    removeSoundtrack();
    setZoom(1);
    setZoomMode("fit");
    setClearOpen(false);
    deleteStyle();
    setStyleOptions(DEFAULT_STYLE);
  }, [removeSoundtrack]);

  return (
    <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1fr)_380px] xl:grid-cols-[minmax(0,1fr)_440px] 2xl:grid-cols-[minmax(0,1fr)_520px]">
      {/* Canvas panel */}
      <section className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border border-stroke bg-panel">
        <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2.5 border-b border-stroke px-4 py-3 sm:flex-nowrap sm:px-5 sm:py-3.5">
          <div className="flex items-center gap-1.5 max-sm:w-full">
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

          <div className="flex items-center gap-0.5 rounded-full bg-track p-0.5 max-sm:order-2 sm:ml-auto">
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

          <div className="flex items-center gap-2 max-sm:order-2 max-sm:ml-auto sm:w-auto">
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
              <kbd className="relative ml-1 hidden items-center gap-0.5 text-muted-foreground sm:flex">
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
              <kbd className="relative ml-1 hidden items-center gap-0.5 opacity-60 sm:flex">
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
                  className="w-max overflow-hidden"
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
                    <div
                      className="flex items-center justify-center"
                      style={{ padding: `${styleOptions.padding}px` }}
                    >
                      {media ? (
                        <div
                          className="animate-artwork-in relative inline-block"
                          style={{ animationDelay: `${TIMING.artwork}ms` }}
                        >
                          {styleOptions.showWindowNavbar && (
                            <WindowNavbar
                              dark={styleOptions.windowNavbarDark}
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
                            <video
                              ref={videoRef}
                              src={media.src}
                              muted={muted}
                              playsInline
                              onClick={togglePlayback}
                              className={cn(
                                styleOptions.shadow,
                                "block h-auto max-w-full cursor-pointer select-none",
                              )}
                              style={{ borderRadius: mediaRadius }}
                            />
                          ) : (
                            /* eslint-disable-next-line @next/next/no-img-element -- the
                        source is a client-side data URL, which next/image cannot
                        optimize and html-to-image cannot serialize. */
                            <img
                              src={media.src}
                              alt="Your screenshot"
                              className={cn(
                                styleOptions.shadow,
                                "block h-auto max-w-full select-none",
                              )}
                              style={{ borderRadius: mediaRadius }}
                              draggable={false}
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
              hasClipSound={media.hasAudio ?? false}
              soundtrack={soundtrack}
              onSoundtrackChange={setSoundtrack}
              onSoundtrackAdd={addSoundtrack}
              onSoundtrackRemove={removeSoundtrack}
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
