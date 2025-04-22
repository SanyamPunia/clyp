"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Copy, Download } from "lucide-react";
import type { ExportOptions } from "@/types/screenshot";

interface ExportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onExport: (options: ExportOptions) => void;
  action: "copy" | "download";
}

export function ExportModal({
  open,
  onOpenChange,
  onExport,
  action,
}: ExportModalProps) {
  const [options, setOptions] = useState<ExportOptions>({
    quality: 2,
    filename: "clyp-screenshot.png",
  });

  const handleExport = () => {
    onExport(options);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            {action === "copy" ? (
              <>
                <Copy className="size-4" /> Copy to Clipboard
              </>
            ) : (
              <>
                <Download className="size-4" /> Download Image
              </>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="quality" className="text-xs">
              Quality
            </Label>
            <RadioGroup
              id="quality"
              value={options.quality.toString()}
              onValueChange={(value) =>
                setOptions({ ...options, quality: Number(value) })
              }
              className="grid grid-cols-3 gap-2"
            >
              <Label
                htmlFor="quality-1"
                className={`flex items-center justify-center border rounded-sm p-2 cursor-pointer text-xs transition-all duration-300 ease-in-out ${
                  options.quality === 1 ? "bg-muted border-zinc-300" : ""
                }`}
              >
                <RadioGroupItem value="1" id="quality-1" className="sr-only" />
                Standard
              </Label>
              <Label
                htmlFor="quality-2"
                className={`flex items-center justify-center border rounded-sm p-2 cursor-pointer text-xs transition-all duration-300 ease-in-out ${
                  options.quality === 2 ? "bg-muted border-zinc-300" : ""
                }`}
              >
                <RadioGroupItem value="2" id="quality-2" className="sr-only" />
                High
              </Label>
              <Label
                htmlFor="quality-3"
                className={`flex items-center justify-center border rounded-sm p-2 cursor-pointer text-xs transition-all duration-300 ease-in-out ${
                  options.quality === 3 ? "bg-muted border-zinc-300" : ""
                }`}
              >
                <RadioGroupItem value="3" id="quality-3" className="sr-only" />
                Ultra
              </Label>
            </RadioGroup>
          </div>

          {action === "download" && (
            <div className="grid gap-2">
              <Label htmlFor="filename" className="text-xs">
                Filename
              </Label>
              <Input
                id="filename"
                value={options.filename}
                onChange={(e) =>
                  setOptions({ ...options, filename: e.target.value })
                }
                className="text-xs h-8"
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            className="text-xs rounded-sm shadow-none cursor-pointer"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button size="sm" className="text-xs rounded-sm shadow-none cursor-pointer" onClick={handleExport}>
            {action === "copy" ? "Copy" : "Download"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
