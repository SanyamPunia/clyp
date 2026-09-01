"use client";

import { useEffect, useState } from "react";
import {
  CopyIcon,
  DownloadIcon,
  FileImageIcon,
  FileVideoIcon,
  Loader2Icon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
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
  estimateVideoBytes,
  formatBytes,
  outputSize,
} from "@/lib/export-size";
import {
  DEFAULT_FPS,
  FPS_OPTIONS,
  canEncodeSize,
} from "@/lib/video-export";
import type { ExportOptions, MediaKind } from "@/types/screenshot";

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
  /** Video only, in seconds. */
  duration?: number;
  /** Video only. Whether there is a track worth offering to keep. */
  hasAudio?: boolean;
  /** Set when a soundtrack was laid over the clip, which replaces its own. */
  soundtrackName?: string;
  /** 0 to 1 while a video encodes, null while a PNG renders. */
  progress?: number | null;
  /** What the filename field falls back to, shown as its placeholder. */
  defaultFilename: string;
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
  hasAudio = false,
  soundtrackName,
  progress = null,
  defaultFilename,
  onCancel,
}: ExportModalProps) {
  const [options, setOptions] = useState<ExportOptions>({
    quality: 2,
    audio: true,
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

  const isCopy = action === "copy";
  // Copy goes through the clipboard, which has no MP4 flavour, so a clip
  // copies its styled poster frame. Only a download encodes.
  const isVideo = kind === "video" && !isCopy;
  const seconds = duration ?? 0;

  // Asked once per size, when the dialog opens. It resolves in milliseconds,
  // and until it does every tile is offered: a control that starts disabled and
  // enables itself reads as broken, where one that starts enabled and settles
  // reads as a control.
  // Read out as numbers, so the effect depends on the size rather than on the
  // identity of an object the parent rebuilds every render.
  const { width: frameWidth, height: frameHeight } = frameSize;

  useEffect(() => {
    if (!open || kind !== "video" || !frameWidth) return;

    let cancelled = false;
    Promise.all(
      QUALITY_OPTIONS.map(async ({ value }) => {
        const size = outputSize(
          { width: frameWidth, height: frameHeight },
          value,
        );
        return [value, await canEncodeSize(size.width, size.height)] as const;
      }),
    ).then((pairs) => {
      if (!cancelled) {
        setEncodable({
          at: `${frameWidth}x${frameHeight}`,
          answers: Object.fromEntries(pairs),
        });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [open, kind, frameWidth, frameHeight]);

  // A scale a video cannot be encoded at is offered as a disabled tile rather
  // than hidden, so the ceiling is visible instead of the control silently
  // having fewer options than it does for an image.
  const answered =
    encodable?.at === `${frameWidth}x${frameHeight}` ? encodable.answers : {};
  const fits = (scale: number) => !isVideo || (answered[scale] ?? true);

  const usable = QUALITY_OPTIONS.map((o) => o.value).filter(fits);
  // Nothing fitting is possible, on a frame past what the encoder will take at
  // any scale. `Math.max` of nothing is `-Infinity`, so the fallback holds the
  // chosen value and the footer refuses instead.
  const stuck = usable.length === 0;
  const quality = fits(options.quality)
    ? options.quality
    // Stuck falls to the smallest rather than holding the choice, so the size
    // beside the label is the closest one to achievable rather than an
    // arbitrary one nobody can pick.
    : stuck
      ? Math.min(...QUALITY_OPTIONS.map((o) => o.value))
      : Math.max(...usable);

  const refused = QUALITY_OPTIONS.map((o) => o.value).filter((v) => !fits(v));
  const fps = options.fps ?? DEFAULT_FPS;
  const output = outputSize(frameSize, quality);
  const bytes = isVideo
    ? estimateVideoBytes(output.width, output.height, seconds, fps)
    : estimateBytes(output.width, output.height, hasGrain);

  const title = isCopy
    ? "Copy to clipboard"
    : isVideo
      ? "Download clip"
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
              ? "Export the clip as an MP4 at the styled size."
              : kind === "video"
                ? "Capture the clip's current frame as a PNG, styled."
                : "Export the image as a PNG at the styled size."}
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="flex flex-col gap-4 pb-4">
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
                      {rate === 30 ? "Smaller" : "Every source frame"}
                    </span>
                  </SegmentedOption>
                ))}
              </SegmentedGroup>
            </div>
          )}

          {/* Offered only when there is something to keep, so the control is
              never a switch over silence. A label and a switch, which is the
              shape every other toggle in the app takes: the filled card this
              used to sit in gave sound more weight than scale. */}
          {isVideo && hasAudio && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-4">
                <FieldLabel htmlFor="keep-audio" className="cursor-pointer">
                  Keep the audio
                </FieldLabel>
                <Switch
                  id="keep-audio"
                  checked={options.audio ?? true}
                  onCheckedChange={(audio) => setOptions({ ...options, audio })}
                  disabled={pending}
                />
              </div>
              {soundtrackName && (
                <p className="truncate text-xs text-muted-foreground">
                  {`Plays ${soundtrackName} in place of the clip's own sound.`}
                </p>
              )}
            </div>
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
                placeholder={defaultFilename}
                spellCheck={false}
                disabled={pending}
              />
            </div>
          )}

          {/* A video is decoded and encoded frame by frame, so it can run for
              a while. A PNG is one shot and has nothing to report.
              Zero means the frame is still being rasterized, which is one
              `toPng` call with no fraction inside it to read. */}
          {pending && progress !== null && (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-[13px] text-muted-foreground">
                <span>{progress === 0 ? "Rendering the frame" : "Encoding"}</span>
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
              {isVideo ? (
                <FileVideoIcon className="size-3.5 shrink-0" aria-hidden="true" />
              ) : (
                <FileImageIcon className="size-3.5 shrink-0" aria-hidden="true" />
              )}
              <span className="font-medium text-foreground">
                {isVideo ? "MP4" : "PNG"}
              </span>
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
            onClick={() => onExport({ ...options, quality, fps })}
            disabled={pending || stuck}
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
