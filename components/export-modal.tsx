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
import { FieldLabel } from "@/components/ui/field-label";
import { SegmentedGroup, SegmentedOption } from "@/components/ui/segmented";
import { Dimensions } from "@/components/ui/dimensions";
import {
  estimateBytes,
  formatBytes,
  outputSize,
} from "@/lib/export-size";
import type { ExportOptions } from "@/types/screenshot";

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
}

export function ExportModal({
  open,
  onOpenChange,
  onExport,
  action,
  pending = false,
  frameSize,
  hasGrain,
}: ExportModalProps) {
  const [options, setOptions] = useState<ExportOptions>({
    quality: 2,
    filename: "clyp-screenshot.png",
  });

  const isCopy = action === "copy";
  const output = outputSize(frameSize, options.quality);
  const bytes = estimateBytes(output.width, output.height, hasGrain);

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
            {isCopy ? "Copy to clipboard" : "Download image"}
          </DialogTitle>
          <DialogDescription>
            Higher scales render more pixels and take longer. The file size is
            an estimate.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="flex flex-col gap-4 pb-4">
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <FieldLabel>Scale</FieldLabel>
              {output.width > 0 && (
                <span className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
                  <Dimensions width={output.width} height={output.height} />
                  <span
                    aria-hidden="true"
                    className="inline-block size-1 shrink-0 rounded-full bg-stroke-strong"
                  />
                  <span className="tabular-nums">~{formatBytes(bytes)}</span>
                </span>
              )}
            </div>
            <SegmentedGroup
              value={options.quality.toString()}
              onValueChange={(value) =>
                setOptions({ ...options, quality: Number(value) })
              }
              className="grid-cols-3"
            >
              {QUALITY_OPTIONS.map((quality) => (
                <SegmentedOption
                  key={quality.value}
                  id={`quality-${quality.value}`}
                  value={quality.value.toString()}
                  selected={options.quality === quality.value}
                  className="flex-col gap-0.5 py-2"
                >
                  <span className="text-sm font-medium tabular-nums">
                    {quality.label}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {quality.hint}
                  </span>
                </SegmentedOption>
              ))}
            </SegmentedGroup>
          </div>

          {!isCopy && (
            <div className="flex flex-col gap-2">
              <FieldLabel htmlFor="filename">Filename</FieldLabel>
              <Input
                id="filename"
                value={options.filename}
                onChange={(e) =>
                  setOptions({ ...options, filename: e.target.value })
                }
                className="text-xs placeholder:text-xs"
                placeholder="clyp-screenshot.png"
                spellCheck={false}
              />
            </div>
          )}
        </DialogBody>

        <DialogFooter>
          <Button
            variant="secondary"
            size="lg"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button
            size="lg"
            onClick={() => onExport(options)}
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
