"use client";

import { useEffect, useState } from "react";
import {
  CopyIcon,
  DownloadIcon,
  FileArchiveIcon,
  FileImageIcon,
  FileVideoIcon,
  Loader2Icon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { FieldLabel } from "@/components/ui/field-label";
import { SegmentedGroup, SegmentedOption } from "@/components/ui/segmented";
import { Dimensions } from "@/components/ui/dimensions";
import { formatDuration } from "@/lib/media";
import {
  estimateBytes,
  estimateMovingBytes,
  estimateVideoBytes,
  formatBytes,
  outputSize,
} from "@/lib/export-size";
import { MAX_MIX_SECONDS } from "@/lib/audio-mix";
import {
  DEFAULT_FPS,
  FPS_OPTIONS,
  canEncodeSize,
  formatSpeed,
} from "@/lib/video-export";
import {
  type Template,
  enlargement,
  outputFor,
  platforms,
  templateName,
  templates,
} from "@/lib/templates";
import type { ExportOptions, MediaKind } from "@/types/screenshot";

/** What "Several sizes" starts with ticked: the four most people post to. */
const DEFAULT_SIZES = ["ig-portrait", "ig-story", "x-post", "li-landscape"];

/** Past this, the stretch to reach a template is visible as softness. */
const SOFT_ENLARGEMENT = 1.05;

const QUALITY_OPTIONS = [
  { value: 1, label: "1x", hint: "Standard" },
  { value: 2, label: "2x", hint: "Retina" },
  { value: 3, label: "3x", hint: "Print" },
];

interface ExportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onExport: (options: ExportOptions) => void;
  action: "copy" | "download";
  pending?: boolean;
  /** Unscaled frame size, so the modal can show what each scale produces. */
  frameSize: { width: number; height: number };
  hasGrain: boolean;
  kind: MediaKind;
  /** Video only, in seconds. What the file will run, so already at speed. */
  duration?: number;
  /** Video only. The playback rate. Past 1x the clip's own sound is left out. */
  speed?: number;
  /** Video only. Whether the clip arrived with sound of its own. */
  hasClipAudio?: boolean;
  /** Set when a soundtrack is laid over the clip, which mixes with its own. */
  soundtrackName?: string;
  /** Set when the background is transparent, which an MP4 cannot carry. */
  transparent?: boolean;
  /**
   * Image only. Set when the background moves and can be exported moving: one
   * loop of it, in seconds, which is how long the clip would run.
   */
  loop?: number;
  /** The background moves, which changes what an MP4 costs. */
  movingBackground?: boolean;
  /** What a Download writes: the clip or loop, or a still of it. */
  format?: "mp4" | "png";
  onFormatChange?: (format: "mp4" | "png") => void;
  /** 0 to 1 while a video encodes, null while a PNG renders. */
  progress?: number | null;
  /**
   * What the filename field falls back to, without an extension, since the
   * extension follows what the dialog is set to write.
   */
  defaultName: string;
  /** The platform size the frame is set to, or null for a scale. */
  template?: Template | null;
  /** How many carousel slides the frame spans. */
  slides?: number;
  /** Present only when the export can be interrupted, which is a video. */
  onCancel?: () => void;
}

export function ExportModal({
  open,
  onOpenChange,
  onExport,
  action,
  pending = false,
  frameSize,
  hasGrain,
  kind,
  duration,
  speed = 1,
  hasClipAudio = false,
  soundtrackName,
  transparent = false,
  loop,
  movingBackground = false,
  format = "mp4",
  onFormatChange,
  progress = null,
  defaultName,
  template = null,
  slides = 1,
  onCancel,
}: ExportModalProps) {
  const [options, setOptions] = useState<ExportOptions>({
    quality: 2,
    audio: true,
    music: true,
    fps: DEFAULT_FPS,
  });
  /**
   * Per scale, once the encoder has answered, kept beside the size it was
   * asked about. Without that pairing, reopening on a smaller clip shows the
   * last one's answers until the new probe lands, which is a tile reading
   * "Too large" about a frame that is not.
   */
  const [encodable, setEncodable] = useState<{
    at: string;
    answers: Record<number, boolean>;
  } | null>(null);

  /** One file at the current size, or several templates in one ZIP. */
  const [mode, setMode] = useState<"one" | "sizes">("one");
  const [picked, setPicked] = useState<string[]>(() =>
    template && !DEFAULT_SIZES.includes(template.id)
      ? [template.id, ...DEFAULT_SIZES]
      : DEFAULT_SIZES,
  );

  const isCopy = action === "copy";
  const carousel = slides > 1;
  /**
   * Whether a Download offers the clip or the frame. Copy never does, and a
   * carousel never does: its slides are stills, and a clip split into slides
   * would be one encode per slide.
   */
  /**
   * Whether this export can come out moving at all: a clip, or an image over a
   * background that moves. An image's Download then offers the loop beside
   * the still, the same choice a clip offers between itself and its frame.
   */
  const moves = kind === "video" || loop !== undefined;
  const choosesFormat = moves && !isCopy && !carousel;
  // Copy goes through the clipboard, which has no MP4 flavour, so a clip
  // copies its styled poster frame. A Download set to PNG asks for the same
  // thing deliberately. Only an encode is a video export.
  const isVideo = choosesFormat && format === "mp4";
  const seconds = duration ?? loop ?? 0;

  // Asked once per size, when the dialog opens. It resolves in milliseconds,
  // and until it does every tile is offered: a control that starts disabled and
  // enables itself reads as broken, where one that starts enabled and settles
  // reads as a control.
  // Read out as numbers, so the effect depends on the size rather than on the
  // identity of an object the parent rebuilds every render.
  const { width: frameWidth, height: frameHeight } = frameSize;
  // A template writes its own pixels, so it has one size to ask about rather
  // than one per scale. Key 0 stands for it in the answers.
  const exact = template ? outputFor(template, slides) : null;
  const exactWidth = exact?.width ?? 0;
  const exactHeight = exact?.height ?? 0;
  const probedAt = exact
    ? `${exactWidth}x${exactHeight}`
    : `${frameWidth}x${frameHeight}`;

  useEffect(() => {
    if (!open || !moves || !frameWidth) return;

    const asks: [number, { width: number; height: number }][] = exactWidth
      ? [[0, { width: exactWidth, height: exactHeight }]]
      : QUALITY_OPTIONS.map(({ value }) => [
          value,
          outputSize({ width: frameWidth, height: frameHeight }, value),
        ]);

    let cancelled = false;
    Promise.all(
      asks.map(
        async ([key, size]) =>
          [key, await canEncodeSize(size.width, size.height)] as const,
      ),
    ).then((pairs) => {
      if (!cancelled) {
        setEncodable({
          at: exactWidth
            ? `${exactWidth}x${exactHeight}`
            : `${frameWidth}x${frameHeight}`,
          answers: Object.fromEntries(pairs),
        });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [open, moves, frameWidth, frameHeight, exactWidth, exactHeight]);

  // A scale a video cannot be encoded at is offered as a disabled tile rather
  // than hidden, so the ceiling is visible instead of the control silently
  // having fewer options than it does for an image.
  const answered = encodable?.at === probedAt ? encodable.answers : {};
  const fits = (scale: number) => !isVideo || (answered[scale] ?? true);

  const usable = QUALITY_OPTIONS.map((o) => o.value).filter(fits);
  // Nothing fitting is possible, on a frame past what the encoder will take at
  // any scale. `Math.max` of nothing is `-Infinity`, so the fallback holds the
  // chosen value and the footer refuses instead.
  const stuck = exact ? !fits(0) : usable.length === 0;
  const quality = fits(options.quality)
    ? options.quality
    // Stuck falls to the smallest rather than holding the choice, so the size
    // beside the label is the closest one to achievable rather than an
    // arbitrary one nobody can pick.
    : stuck
      ? Math.min(...QUALITY_OPTIONS.map((o) => o.value))
      : Math.max(...usable);

  const refused = exact
    ? []
    : QUALITY_OPTIONS.map((o) => o.value).filter((v) => !fits(v));
  /** Several sizes is only ever stills, one per template, into one ZIP. */
  const offersSizes = !isCopy && !isVideo;
  const several = offersSizes && mode === "sizes";
  const zipped = several || (carousel && !isCopy);
  const stretch = template ? enlargement(frameSize, template, slides) : 1;
  // The clip's own sound is only carried at 1x. See `SPEED_OPTIONS`.
  const clipSound = hasClipAudio && speed === 1;
  // Summing two sources holds three buffers of the export's own length, so a
  // long one has to pick rather than run the tab out of memory mid-encode.
  const bothSounds = Boolean(
    isVideo && clipSound && soundtrackName && options.audio && options.music,
  );
  const tooLongToMix = bothSounds && seconds > MAX_MIX_SECONDS;
  const fps = options.fps ?? DEFAULT_FPS;
  const output = exact ?? outputSize(frameSize, quality);
  const bytes = several
    ? picked.reduce((sum, id) => {
        const t = templates.find((x) => x.id === id);
        return t ? sum + estimateBytes(t.width, t.height, hasGrain) : sum;
      }, 0)
    : isVideo
      ? (movingBackground ? estimateMovingBytes : estimateVideoBytes)(
          output.width,
          output.height,
          seconds,
          fps,
        )
      : estimateBytes(output.width, output.height, hasGrain);
  const extension = zipped ? "zip" : isVideo ? "mp4" : "png";
  const tooLong = Boolean(
    template?.maxSeconds && isVideo && seconds > template.maxSeconds,
  );

  const title = isCopy
    ? "Copy to clipboard"
    : several
      ? "Download several sizes"
      : carousel
        ? "Download carousel"
        : isVideo
          ? kind === "video"
            ? "Download clip"
            : "Download loop"
          : choosesFormat && kind === "video"
            ? "Download frame"
            : "Download image";

  return (
    <Dialog
      open={open}
      // Block dismissal while the export runs so the dialog cannot close out
      // from under an in-flight render.
      onOpenChange={(next) => {
        if (pending) return;
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isCopy ? (
              <CopyIcon className="size-4" aria-hidden="true" />
            ) : (
              <DownloadIcon className="size-4" aria-hidden="true" />
            )}
            {title}
          </DialogTitle>
          {/* Not rendered, but not removed: the dialog needs something to be
              described by, and the visible version was two lines saying that
              longer clips take longer to render, which is true of every
              encoder ever written. The summary below says what you get. */}
          <DialogDescription className="sr-only">
            {isVideo
              ? kind === "video"
                ? "Export the clip as an MP4 at the styled size."
                : "Export the image over its moving background as a looping MP4."
              : kind === "video"
                ? "Capture the clip's current frame as a PNG, styled."
                : "Export the image as a PNG at the styled size."}
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="flex flex-col gap-4 pb-4">
          {/* First, because it decides what the rest of this dialog means: a
              still has no frame rate, no length, no sound and nothing to
              cancel, and every one of those rows goes with it.

              A two-line tile, like the scale and the rate below it. The first
              build passed no height at all, so the options collapsed to bare
              line-height, 20px against their 54, and a `rounded-md` corner on
              a box that short reads as a floating pill rather than a segment.
              The second line names the file, which is the fact a reader wants
              and the one nothing else in the dialog states. */}
          {choosesFormat && (
            <div className="flex flex-col gap-2">
              <FieldLabel>Format</FieldLabel>
              <SegmentedGroup
                value={format}
                onValueChange={(value) =>
                  onFormatChange?.(value as "mp4" | "png")
                }
                className="grid-cols-2"
              >
                <SegmentedOption
                  id="format-mp4"
                  value="mp4"
                  selected={format === "mp4"}
                  disabled={pending}
                  className="flex-col gap-0.5 py-2"
                >
                  <span className="text-sm font-medium">
                    {kind === "video" ? "Clip" : "Loop"}
                  </span>
                  <span className="text-xs text-muted-foreground">MP4</span>
                </SegmentedOption>
                <SegmentedOption
                  id="format-png"
                  value="png"
                  selected={format === "png"}
                  disabled={pending}
                  className="flex-col gap-0.5 py-2"
                >
                  <span className="text-sm font-medium">
                    {kind === "video" ? "This frame" : "Still"}
                  </span>
                  <span className="text-xs text-muted-foreground">PNG</span>
                </SegmentedOption>
              </SegmentedGroup>
            </div>
          )}

          {/* Stills only. A template decides one size, and this is the way to
              get the same frame at several of them without choosing each in
              turn and exporting it. */}
          {offersSizes && (
            <div className="flex flex-col gap-2">
              <FieldLabel>Output</FieldLabel>
              <SegmentedGroup
                value={mode}
                onValueChange={(value) => setMode(value as "one" | "sizes")}
                className="grid-cols-2"
              >
                <SegmentedOption
                  id="output-one"
                  value="one"
                  selected={mode === "one"}
                  disabled={pending}
                  className="flex-col gap-0.5 py-2"
                >
                  <span className="text-sm font-medium">One size</span>
                  <span className="text-xs text-muted-foreground">
                    {carousel ? `${slides} slides` : "PNG"}
                  </span>
                </SegmentedOption>
                <SegmentedOption
                  id="output-sizes"
                  value="sizes"
                  selected={mode === "sizes"}
                  disabled={pending}
                  className="flex-col gap-0.5 py-2"
                >
                  <span className="text-sm font-medium">Several sizes</span>
                  <span className="text-xs text-muted-foreground">ZIP</span>
                </SegmentedOption>
              </SegmentedGroup>
            </div>
          )}

          {several ? (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-2">
                <FieldLabel>Sizes</FieldLabel>
                <span className="text-[13px] tabular-nums text-muted-foreground">
                  {picked.length} selected
                </span>
              </div>
              {platforms.map((platform) => (
                <div key={platform.id} className="flex flex-col gap-1.5">
                  <p className="text-xs text-muted-foreground">{platform.label}</p>
                  {templates
                    .filter((t) => t.platform === platform.id)
                    .map((t) => (
                      <label
                        key={t.id}
                        htmlFor={`size-${t.id}`}
                        className="flex cursor-pointer items-center gap-2 text-[13px]"
                      >
                        <Checkbox
                          id={`size-${t.id}`}
                          checked={picked.includes(t.id)}
                          disabled={pending}
                          onCheckedChange={(checked) =>
                            setPicked((current) =>
                              checked
                                ? [...current, t.id]
                                : current.filter((id) => id !== t.id),
                            )
                          }
                        />
                        <span className="flex-1">{t.label}</span>
                        <Dimensions
                          width={t.width}
                          height={t.height}
                          className="text-xs text-muted-foreground"
                        />
                      </label>
                    ))}
                </div>
              ))}
              <p className="text-xs text-muted-foreground">
                Each size takes its own shape around the same artwork.
              </p>
            </div>
          ) : exact && template ? (
            /* A template has one size, so there is nothing to pick. The row
               says what it is and where it was set. */
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <FieldLabel>Size</FieldLabel>
                <Dimensions
                  width={exact.width}
                  height={exact.height}
                  className="text-[13px] text-muted-foreground"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {carousel
                  ? `${templateName(template)}, split into ${slides} slides of ${template.width} by ${template.height}.`
                  : `${templateName(template)}, set in the Frame section.`}
              </p>
              {stretch > SOFT_ENLARGEMENT && (
                <p className="text-xs text-muted-foreground">
                  {`The frame is smaller than this size, so it is enlarged ${stretch.toFixed(1)}x and may look soft. A larger capture avoids it.`}
                </p>
              )}
              {stuck && (
                <p className="text-xs text-destructive">
                  This browser cannot encode a clip at this size.
                </p>
              )}
            </div>
          ) : (
            <>
          {/* Each value sits with the control that decides it. One line
              carrying dimensions, rate, length and size was four facts of equal
              weight behind three dots, which is a spec sheet rather than a
              readout: the rate is already the label on its own tile, and the
              other two describe different things. */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <FieldLabel>Scale</FieldLabel>
              {output.width > 0 && (
                <Dimensions
                  width={output.width}
                  height={output.height}
                  className="text-[13px] text-muted-foreground"
                />
              )}
            </div>
            <SegmentedGroup
              value={quality.toString()}
              onValueChange={(value) =>
                setOptions({ ...options, quality: Number(value) })
              }
              className="grid-cols-3"
            >
              {QUALITY_OPTIONS.map((option) => (
                <SegmentedOption
                  key={option.value}
                  id={`quality-${option.value}`}
                  value={option.value.toString()}
                  selected={quality === option.value}
                  disabled={pending || !fits(option.value)}
                  className="flex-col gap-0.5 py-2"
                >
                  <span className="text-sm font-medium tabular-nums">
                    {option.label}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {fits(option.value) ? option.hint : "Too large"}
                  </span>
                </SegmentedOption>
              ))}
            </SegmentedGroup>

            {/* Named whenever anything is refused, not only when everything is.
                "Too large" is a state, and on its own it leaves the reader
                unable to tell whether the limit is their file, their browser or
                this app, and with no idea that padding is the way back. */}
            {refused.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {stuck
                  ? "This frame is past what this browser can encode at any scale. Less padding, or a smaller recording, will do it."
                  : `${list(refused.map((v) => `${v}x`))} ${
                      refused.length > 1 ? "are" : "is"
                    } more than this browser can encode. Less padding brings ${
                      refused.length > 1 ? "them" : "it"
                    } back.`}
              </p>
            )}
          </div>
            </>
          )}

          {/* A ceiling rather than a rate: a source already at 30 exports at
              30 either way, so 60 means nothing is dropped. */}
          {isVideo && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <FieldLabel>Frame rate</FieldLabel>
                {seconds > 0 && (
                  <span className="text-[13px] tabular-nums text-muted-foreground">
                    {formatDuration(seconds)}
                  </span>
                )}
              </div>
              <SegmentedGroup
                value={String(fps)}
                onValueChange={(value) =>
                  setOptions({ ...options, fps: Number(value) })
                }
                className="grid-cols-2"
              >
                {FPS_OPTIONS.map((rate) => (
                  <SegmentedOption
                    key={rate}
                    id={`fps-${rate}`}
                    value={String(rate)}
                    selected={fps === rate}
                    disabled={pending}
                    className="flex-col gap-0.5 py-2"
                  >
                    <span className="text-sm font-medium tabular-nums">
                      {rate} fps
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {rate === 30
                        ? "Smaller"
                        : kind === "video"
                          ? "Every source frame"
                          : "Smoother"}
                    </span>
                  </SegmentedOption>
                ))}
              </SegmentedGroup>
            </div>
          )}

          {/* One row per source, offered only when that source exists, so a
              control is never a switch over silence. They mix, so both can be
              on: the label says which sound each is, since "Keep the audio"
              means nothing once there are two. A label and a switch is the
              shape every other toggle in the app takes. */}
          {isVideo && (hasClipAudio || soundtrackName) && (
            <div className="flex flex-col gap-3">
              {/* Past 1x there is no switch, since it would be a switch over
                  silence. The line says what happened to the sound instead. */}
              {hasClipAudio && !clipSound && (
                <p className="text-xs text-muted-foreground">
                  {`The clip's own sound is left out at ${formatSpeed(speed)}.`}
                </p>
              )}
              {clipSound && (
                <div className="flex items-center justify-between gap-4">
                  <FieldLabel htmlFor="keep-audio" className="cursor-pointer">
                    {"The clip's own sound"}
                  </FieldLabel>
                  <Switch
                    id="keep-audio"
                    checked={options.audio ?? true}
                    onCheckedChange={(audio) => setOptions({ ...options, audio })}
                    disabled={pending}
                  />
                </div>
              )}
              {tooLongToMix && (
                <p className="text-xs text-destructive">
                  {`Both sounds together are limited to ${Math.round(MAX_MIX_SECONDS / 60)} minutes. Turn one off.`}
                </p>
              )}
              {soundtrackName && (
                <div className="flex items-center justify-between gap-4">
                  <FieldLabel
                    htmlFor="keep-music"
                    className="min-w-0 cursor-pointer truncate"
                  >
                    {soundtrackName}
                  </FieldLabel>
                  <Switch
                    id="keep-music"
                    checked={options.music ?? true}
                    onCheckedChange={(music) => setOptions({ ...options, music })}
                    disabled={pending}
                  />
                </div>
              )}
            </div>
          )}

          {/* Only for a clip. A PNG keeps its transparency, which is what
              picking a transparent background already said it would do, and a
              sentence confirming it is a sentence nobody acts on. H.264 has no
              alpha, so this one is a surprise worth naming. */}
          {isVideo && transparent && (
            <p className="text-xs text-muted-foreground">
              MP4 carries no transparency, so the background exports as black.
            </p>
          )}

          {tooLong && template?.maxSeconds && (
            <p className="text-xs text-muted-foreground">
              {`${templateName(template)} takes clips up to ${formatDuration(template.maxSeconds)}. This one is ${formatDuration(seconds)}, so it will be cut or refused there.`}
            </p>
          )}

          {!isCopy && (
            <div className="flex flex-col gap-2">
              <FieldLabel htmlFor="filename">Filename</FieldLabel>
              <Input
                id="filename"
                value={options.filename ?? ""}
                onChange={(e) =>
                  setOptions({ ...options, filename: e.target.value })
                }
                className="text-xs placeholder:text-xs"
                placeholder={`${defaultName}.${extension}`}
                spellCheck={false}
                disabled={pending}
              />
            </div>
          )}

          {/* A video is decoded and encoded frame by frame, so it can run for
              a while. A PNG is one shot and has nothing to report.
              Zero means the frame is still being rasterized and any soundtrack
              mixed, neither of which has a fraction inside it to read. */}
          {pending && progress !== null && (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-[13px] text-muted-foreground">
                <span>{progress === 0 ? "Preparing" : "Encoding"}</span>
                {progress > 0 && (
                  <span className="tabular-nums">
                    {Math.round(progress * 100)}%
                  </span>
                )}
              </div>
              <div className="h-1 overflow-hidden rounded-full bg-track">
                <div
                  className="h-full rounded-full bg-foreground transition-[width] duration-200"
                  style={{ width: `${Math.max(progress * 100, 2)}%` }}
                />
              </div>
            </div>
          )}
        </DialogBody>

        <DialogFooter>
          {/* What the file will be, next to the action that writes it. Sticky
              with the footer, so it is the last thing read before committing
              rather than something scrolled past on the way down.

              The format leads it, with a mark of its own. Two bare numbers in
              a corner say nothing about what they measure, and the container
              is the one fact about the output that is now stated nowhere else:
              it used to be buried in a description that said the clip is
              re-encoded as an MP4. */}
          {output.width > 0 && (
            <p className="flex items-center gap-1.5 whitespace-nowrap text-[13px] text-muted-foreground sm:mr-auto">
              {zipped ? (
                <FileArchiveIcon className="size-3.5 shrink-0" aria-hidden="true" />
              ) : isVideo ? (
                <FileVideoIcon className="size-3.5 shrink-0" aria-hidden="true" />
              ) : (
                <FileImageIcon className="size-3.5 shrink-0" aria-hidden="true" />
              )}
              <span className="font-medium text-foreground">
                {zipped ? "ZIP" : isVideo ? "MP4" : "PNG"}
              </span>
              {zipped && (
                <>
                  <Dot />
                  <span className="tabular-nums">
                    {several ? picked.length : slides} files
                  </span>
                </>
              )}
              <Dot />
              <span className="tabular-nums">~{formatBytes(bytes)}</span>
            </p>
          )}

          {/* While an encode runs this stops it, which is the only way out:
              Escape and the backdrop are blocked so the dialog cannot close
              out from under a render that is still writing frames. */}
          <Button
            variant="secondary"
            size="lg"
            onClick={() => (pending ? onCancel?.() : onOpenChange(false))}
            disabled={pending && !onCancel}
          >
            Cancel
          </Button>
          <Button
            size="lg"
            onClick={() =>
              onExport({
                ...options,
                quality,
                fps,
                sizes: several ? picked : undefined,
              })
            }
            disabled={
              pending ||
              (stuck && !several) ||
              tooLongToMix ||
              (several && picked.length === 0)
            }
          >
            {pending && (
              <Loader2Icon className="size-4 animate-spin" aria-hidden="true" />
            )}
            {pending ? "Rendering" : isCopy ? "Copy" : "Download"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** "2x", "2x and 3x", "1x, 2x and 3x". */
function list(items: string[]): string {
  if (items.length < 2) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

function Dot() {
  return (
    <span
      aria-hidden="true"
      className="inline-block size-1 shrink-0 rounded-full bg-stroke-strong"
    />
  );
}
