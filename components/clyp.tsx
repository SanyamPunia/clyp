"use client";

import { toPng } from "html-to-image";
import {
  ArrowBigUpIcon,
  CommandIcon,
  CopyIcon,
  DownloadIcon,
  MaximizeIcon,
  MinusIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { DropZone } from "@/components/drop-zone";
import { ExportModal } from "@/components/export-modal";
import { GradientBackground } from "@/components/gradient-background";
import { StyleControls } from "@/components/style-controls";
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
import { cn } from "@/lib/utils";
import type { ExportOptions, StyleOptions } from "@/types/screenshot";

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
  const [image, setImage] = useState<string | null>(null);
  const [dimensions, setDimensions] = useState<{ w: number; h: number } | null>(
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

  const screenshotRef = useRef<HTMLDivElement>(null);
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
        CANVAS_PADDING * 2,
      ),
    );
  }, []);

  const gradientCss = resolveGradientCss(styleOptions);
  const zoomed = zoom !== 1 && frameSize.width > 0;

  const loadImage = useCallback((dataUrl: string) => {
    setImage(dataUrl);

    const probe = new Image();
    probe.onload = () =>
      setDimensions({ w: probe.naturalWidth, h: probe.naturalHeight });
    probe.src = dataUrl;
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
            CANVAS_PADDING * 2,
          ),
        );
      }
    };

    const observer = new ResizeObserver(measure);
    observer.observe(frame);
    observer.observe(scroller);
    return () => observer.disconnect();
  }, [image]);

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
  }, [image]);

  // Paste anywhere on the page drops an image onto the canvas.
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (const item of items) {
        if (item.type.indexOf("image") === -1) continue;

        const blob = item.getAsFile();
        if (!blob) continue;

        const reader = new FileReader();
        reader.onload = (event) => loadImage(event.target?.result as string);
        reader.readAsDataURL(blob);
        break;
      }
    };

    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, [loadImage]);

  const openExportModal = useCallback((action: "copy" | "download") => {
    setExportAction(action);
    setExportModalOpen(true);
  }, []);

  // Cmd/Ctrl+S downloads, Cmd/Ctrl+Shift+C copies.
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (!image) return;
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;

      if (e.key.toLowerCase() === "s") {
        e.preventDefault();
        openExportModal("download");
      } else if (e.shiftKey && e.key.toLowerCase() === "c") {
        e.preventDefault();
        openExportModal("copy");
      }
    };

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [image, openExportModal]);

  const handleExport = useCallback(
    async (options: ExportOptions) => {
      if (!image || !screenshotRef.current) return;

      setExporting(true);
      try {
        const dataUrl = await toPng(screenshotRef.current, {
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
          const link = document.createElement("a");
          link.download = options.filename || "clyp-screenshot.png";
          link.href = dataUrl;
          link.click();
          toast.success("Image downloaded");
        }

        setExportModalOpen(false);
      } catch (err) {
        console.error("Failed to export image:", err);
        toast.error("Export failed. Please try again.");
      } finally {
        setExporting(false);
      }
    },
    [exportAction],
  );

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
    setImage(null);
    setDimensions(null);
    setZoom(1);
    setZoomMode("fit");
    setClearOpen(false);
  }, []);

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
                  disabled={!image || zoom <= MIN_ZOOM}
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
                  disabled={!image}
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
                  disabled={!image || zoom >= MAX_ZOOM}
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
                  disabled={!image}
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
                  aria-label="Remove screenshot"
                  onClick={() => setClearOpen(true)}
                  disabled={!image}
                >
                  <Trash2Icon className="size-4" aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Remove screenshot</TooltipContent>
            </Tooltip>

            <Button
              variant="outline"
              onClick={() => openExportModal("copy")}
              disabled={!image}
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

            <Button
              onClick={() => openExportModal("download")}
              disabled={!image}
            >
              <DownloadIcon className="size-3.5" aria-hidden="true" />
              <span className="sr-only sm:not-sr-only">Download</span>
              <kbd className="relative ml-1 hidden items-center gap-0.5 opacity-60 sm:flex">
                <CommandIcon className="size-3" aria-hidden="true" />
                <span className="text-xs font-medium">S</span>
                <span className="sr-only">Command S</span>
              </kbd>
            </Button>
          </div>
        </div>

        <DropZone
          ref={scrollerRef}
          onFile={loadImage}
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
                      {image ? (
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
                          {/* eslint-disable-next-line @next/next/no-img-element -- the
                        source is a client-side data URL, which next/image cannot
                        optimize and html-to-image cannot serialize. */}
                          <img
                            src={image}
                            alt="Your screenshot"
                            className={cn(
                              styleOptions.shadow,
                              "block h-auto max-w-full select-none",
                            )}
                            style={{
                              borderRadius: cornerRadius(
                                styleOptions.imageRadius,
                                styleOptions.imageCorners,
                                styleOptions.showWindowNavbar
                                  ? "bottom"
                                  : undefined,
                              ),
                            }}
                            draggable={false}
                          />
                        </div>
                      ) : (
                        <UploadCard onImageUpload={loadImage} />
                      )}
                    </div>
                  </GradientBackground>
                </div>
              </div>
            </div>
          </div>
        </DropZone>
      </section>

      {/* Control panel */}
      <section className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border border-stroke bg-panel">
        {/* No header: each section names itself. */}
        <ScrollFade className="min-h-0 flex-1 overflow-y-auto">
          <StyleControls
            options={styleOptions}
            onChange={handleStyleChange}
            disabled={!image}
          />
        </ScrollFade>
      </section>

      <ExportModal
        open={exportModalOpen}
        onOpenChange={setExportModalOpen}
        onExport={handleExport}
        action={exportAction}
        pending={exporting}
        frameSize={frameSize}
        hasGrain={styleOptions.showNoiseOverlay}
      />

      <ConfirmDialog
        open={clearOpen}
        onOpenChange={setClearOpen}
        title="Remove this screenshot?"
        description="The canvas is cleared and you will need to upload the image again. Your style settings are kept."
        confirmLabel="Remove"
        onConfirm={handleClear}
      />
    </div>
  );
}
