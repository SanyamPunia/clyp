"use client";

import { useState } from "react";
import { CopyIcon, DownloadIcon, Loader2Icon } from "lucide-react";

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
import { MAX_FPS, MAX_VIDEO_EDGE } from "@/lib/video-export";
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
  /** Video only. Whether the source has a track worth offering to keep. */
  hasAudio?: boolean;
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
  progress = null,
  defaultFilename,
  onCancel,
}: ExportModalProps) {
  const [options, setOptions] = useState<ExportOptions>({
    quality: 2,
    audio: true,
  });

  const isCopy = action === "copy";
  // Copy goes through the clipboard, which has no MP4 flavour, so a clip
  // copies its styled poster frame. Only a download encodes.
  const isVideo = kind === "video" && !isCopy;
  const seconds = duration ?? 0;

  // A scale a video cannot be encoded at is offered as a disabled tile rather
  // than hidden, so the ceiling is visible instead of the control silently
  // having fewer options than it does for an image.
  const fits = (scale: number) => {
    if (!isVideo) return true;
    const size = outputSize(frameSize, scale);
    return Math.max(size.width, size.height) <= MAX_VIDEO_EDGE;
  };

  const quality = fits(options.quality)
    ? options.quality
    : Math.max(...QUALITY_OPTIONS.map((o) => o.value).filter(fits));

  const output = outputSize(frameSize, quality);
  const bytes = isVideo
    ? estimateVideoBytes(output.width, output.height, seconds)
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
          <DialogDescription>
            {isVideo
              ? `The clip is re-encoded as an MP4 at the styled size, at up to ${MAX_FPS} fps. Longer clips and higher scales take longer to render.`
              : kind === "video"
                ? "The clip's current frame is captured as a PNG, with the frame styled around it."
                : "Higher scales render more pixels and take longer. The file size is an estimate."}
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="flex flex-col gap-4 pb-4">
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <FieldLabel>Scale</FieldLabel>
              {output.width > 0 && (
                <span className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
                  <Dimensions width={output.width} height={output.height} />
                  {isVideo && seconds > 0 && (
                    <>
                      <Dot />
                      <span className="tabular-nums">
                        {formatDuration(seconds)}
                      </span>
                    </>
                  )}
                  <Dot />
                  <span className="tabular-nums">~{formatBytes(bytes)}</span>
                </span>
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
          </div>

          {/* Offered only when there is something to keep, so the control is
              never a switch over silence. */}
          {isVideo && hasAudio && (
            <label
              htmlFor="keep-audio"
              className="flex cursor-pointer items-center justify-between gap-4 rounded-lg bg-track px-3 py-2.5"
            >
              <span className="flex flex-col gap-0.5">
                <span className="text-[13px] font-medium">Keep the audio</span>
                <span className="text-xs text-muted-foreground">
                  Re-encoded as AAC alongside the video.
                </span>
              </span>
              <Switch
                id="keep-audio"
                checked={options.audio ?? true}
                onCheckedChange={(audio) => setOptions({ ...options, audio })}
                disabled={pending}
              />
            </label>
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
            onClick={() => onExport({ ...options, quality })}
            disabled={pending}
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

function Dot() {
  return (
    <span
      aria-hidden="true"
      className="inline-block size-1 shrink-0 rounded-full bg-stroke-strong"
    />
  );
}
